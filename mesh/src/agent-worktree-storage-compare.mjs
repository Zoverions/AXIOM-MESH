#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  canonicalJson,
  sha256,
  ValidationError
} from './lib/canonical.mjs';
import {
  STORAGE_BENCHMARK_SCHEMA,
  verifyAgentWorktreeStorageBenchmarkEvidence
} from './agent-worktree-storage-benchmark.mjs';

export const STORAGE_COMPARISON_SCHEMA = 'axiom-agent-worktree-storage-comparison.v1';
const MAX_PROFILES = 16;

export function compareAgentWorktreeStorageEvidence(
  documents,
  { baselineProfileId } = {}
) {
  if (!Array.isArray(documents) || documents.length < 2 || documents.length > MAX_PROFILES) {
    throw new ValidationError(
      `Storage comparison requires 2-${MAX_PROFILES} benchmark evidence documents`
    );
  }

  const evidence = documents.map((document, index) => {
    try {
      verifyAgentWorktreeStorageBenchmarkEvidence(document);
    } catch (error) {
      throw new ValidationError(
        `Storage comparison evidence[${index}] is invalid: ${error.message}`
      );
    }
    return document;
  });

  const profileIds = evidence.map(item => item.profile.profile_id);
  if (new Set(profileIds).size !== profileIds.length) {
    throw new ValidationError('Storage comparison profile ids must be unique');
  }

  const baselineId = baselineProfileId ?? profileIds[0];
  const baseline = evidence.find(item => item.profile.profile_id === baselineId);
  if (!baseline) {
    throw new ValidationError('Storage comparison baseline profile is not present');
  }

  const fixtureDigest = comparableFixtureDigest(baseline);
  for (const item of evidence) {
    if (comparableFixtureDigest(item) !== fixtureDigest) {
      throw new ValidationError(
        `Storage comparison profile ${item.profile.profile_id} is not fixture-compatible with the baseline`
      );
    }
  }

  const observerModes = new Set(
    evidence.map(item => Boolean(item.measurements.backing_observer))
  );
  if (observerModes.size !== 1) {
    throw new ValidationError(
      'Storage comparison cannot mix backing-device physical measurements with filesystem-allocation proxies'
    );
  }
  const usesBackingObserver = observerModes.has(true);
  const storageMeasurement = usesBackingObserver
    ? 'backing-device-physical-used-delta-bytes'
    : 'filesystem-used-delta-bytes-proxy';
  const baselineBytes = storageBytes(baseline, usesBackingObserver);

  const rows = evidence.map(item => {
    const bytes = storageBytes(item, usesBackingObserver);
    const ratio = baselineBytes > 0 ? bytes / baselineBytes : null;
    const savings = baselineBytes > 0
      ? ((baselineBytes - bytes) / baselineBytes) * 100
      : null;
    return {
      profile_id: item.profile.profile_id,
      filesystem_type: item.profile.filesystem_type,
      storage_measurement: storageMeasurement,
      storage_bytes: bytes,
      storage_vs_baseline_ratio: ratio === null ? null : rounded(ratio, 6),
      storage_savings_vs_baseline_pct: savings === null ? null : rounded(savings, 3),
      creation: {
        wall_ms: item.measurements.creation.wall_ms,
        median_ms: item.measurements.creation.median_ms,
        p95_ms: item.measurements.creation.p95_ms
      },
      post_materialization: item.measurements.post_materialization
        ? {
            wall_ms: item.measurements.post_materialization.wall_ms,
            median_ms: item.measurements.post_materialization.median_ms,
            p95_ms: item.measurements.post_materialization.p95_ms
          }
        : null,
      mutation_wall_ms: item.measurements.mutation_wall_ms
    };
  });

  const output = {
    schema: STORAGE_COMPARISON_SCHEMA,
    status: 'passed',
    source_benchmark_schema: STORAGE_BENCHMARK_SCHEMA,
    baseline_profile_id: baselineId,
    fixture_digest: fixtureDigest,
    fixture: comparableFixture(baseline),
    measurement: {
      storage_class: storageMeasurement,
      backing_observer_required_for_physical_claim: true,
      comparable_profiles: rows.length
    },
    rows,
    controls: {
      exact_fixture_match_required: true,
      mixed_storage_measurement_classes_rejected: true,
      baseline_present_required: true,
      unique_profile_ids_required: true,
      storage_profile_promoted: false,
      production_runtime_changed: false,
      scheduler_authority_changed: false
    },
    limitations: [
      'This comparison is laboratory evidence and does not promote any storage profile.',
      usesBackingObserver
        ? 'Physical-byte comparisons depend on the operator-supplied backing observer used by every input run.'
        : 'Filesystem used-byte deltas are allocation proxies and must not be described as backing-device physical usage.',
      'Matching fixture identity removes known benchmark-shape drift but does not eliminate host noise, thermal state, cache effects, kernel differences, device differences, or run-order effects.',
      'Promotion requires repeated controlled runs, security isolation tests, pressure/recovery tests, and independent review.'
    ]
  };

  verifyAgentWorktreeStorageComparison(output);
  return output;
}

export function verifyAgentWorktreeStorageComparison(comparison) {
  if (
    !comparison
    || typeof comparison !== 'object'
    || Array.isArray(comparison)
    || comparison.schema !== STORAGE_COMPARISON_SCHEMA
    || comparison.status !== 'passed'
    || comparison.source_benchmark_schema !== STORAGE_BENCHMARK_SCHEMA
    || typeof comparison.baseline_profile_id !== 'string'
    || !/^[a-f0-9]{64}$/.test(comparison.fixture_digest ?? '')
    || !Array.isArray(comparison.rows)
    || comparison.rows.length < 2
    || comparison.rows.length > MAX_PROFILES
    || !comparison.rows.some(row => row.profile_id === comparison.baseline_profile_id)
    || comparison.controls?.exact_fixture_match_required !== true
    || comparison.controls?.mixed_storage_measurement_classes_rejected !== true
    || comparison.controls?.baseline_present_required !== true
    || comparison.controls?.unique_profile_ids_required !== true
    || comparison.controls?.storage_profile_promoted !== false
    || comparison.controls?.production_runtime_changed !== false
    || comparison.controls?.scheduler_authority_changed !== false
  ) {
    throw new ValidationError('Agent worktree storage comparison is invalid');
  }

  const measurementClass = comparison.measurement?.storage_class;
  if (![
    'backing-device-physical-used-delta-bytes',
    'filesystem-used-delta-bytes-proxy'
  ].includes(measurementClass)) {
    throw new ValidationError('Agent worktree storage comparison measurement class is invalid');
  }
  if (comparison.rows.some(row => (
    row.storage_measurement !== measurementClass
    || !Number.isSafeInteger(row.storage_bytes)
    || row.storage_bytes < 0
  ))) {
    throw new ValidationError('Agent worktree storage comparison row is invalid');
  }
  if (new Set(comparison.rows.map(row => row.profile_id)).size !== comparison.rows.length) {
    throw new ValidationError('Agent worktree storage comparison contains duplicate profiles');
  }
  if (sha256(canonicalJson(comparison.fixture)) !== comparison.fixture_digest) {
    throw new ValidationError('Agent worktree storage comparison fixture digest is invalid');
  }

  return {
    valid: true,
    schema: comparison.schema,
    profiles: comparison.rows.length,
    baseline_profile_id: comparison.baseline_profile_id,
    storage_class: measurementClass
  };
}

function comparableFixtureDigest(evidence) {
  return sha256(canonicalJson(comparableFixture(evidence)));
}

function comparableFixture(evidence) {
  return {
    source: {
      revision: evidence.source.revision,
      tree: evidence.source.tree,
      tracked_files: evidence.source.tracked_files
    },
    workload: {
      workers: evidence.workload.workers,
      parallelism: evidence.workload.parallelism,
      mutation_bytes_per_worker: evidence.workload.mutation_bytes_per_worker,
      post_materialization_command: evidence.workload.post_materialization_command
    },
    materialization: evidence.profile.materialization
  };
}

function storageBytes(evidence, usesBackingObserver) {
  const value = usesBackingObserver
    ? evidence.measurements.backing_observer?.physical_used_delta_bytes
    : evidence.measurements.filesystem?.used_delta_bytes;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ValidationError(
      `Storage comparison profile ${evidence.profile.profile_id} has an invalid storage measurement`
    );
  }
  return value;
}

function rounded(value, digits) {
  return Number(value.toFixed(digits));
}

function parseArgs(argv) {
  const output = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith('--') || value === undefined) {
      throw new ValidationError(
        'Storage comparison arguments must be --name value pairs'
      );
    }
    output[flag.slice(2)] = value;
  }
  return output;
}

function parseEvidencePaths(value) {
  let parsed;
  try {
    parsed = JSON.parse(value ?? '');
  } catch {
    throw new ValidationError('evidence-json must be a JSON string array');
  }
  if (
    !Array.isArray(parsed)
    || parsed.length < 2
    || parsed.length > MAX_PROFILES
    || parsed.some(item => typeof item !== 'string' || !item.trim())
  ) {
    throw new ValidationError(
      `evidence-json must contain 2-${MAX_PROFILES} evidence paths`
    );
  }
  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const paths = parseEvidencePaths(args['evidence-json']);
  const documents = await Promise.all(paths.map(async path => {
    let parsed;
    try {
      parsed = JSON.parse(await readFile(path, 'utf8'));
    } catch (error) {
      throw new ValidationError(
        `Unable to read storage evidence ${basename(path)}: ${error.message}`
      );
    }
    return parsed;
  }));
  const comparison = compareAgentWorktreeStorageEvidence(documents, {
    baselineProfileId: args['baseline-profile-id']
  });
  process.stdout.write(`${JSON.stringify(comparison, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
