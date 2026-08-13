#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { canonicalJson, sha256, ValidationError } from './lib/canonical.mjs';
import { HOST_LAB_BUILD_SCHEMA } from './axiom-host-lab.mjs';
import { verifyAxiomHostArtifactInventory } from './axiom-host-artifact-inventory.mjs';

export const HOST_LAB_COMPARISON_SCHEMA = 'axiom-host-h0-reproducibility-comparison.v1';
const SHA256 = /^[a-f0-9]{64}$/;
const GIT_SHA = /^[a-f0-9]{40}$/;

export function verifyAxiomHostH0BuildEvidence(evidence) {
  if (
    !evidence
    || typeof evidence !== 'object'
    || Array.isArray(evidence)
    || evidence.schema !== HOST_LAB_BUILD_SCHEMA
    || evidence.status !== 'built-not-promoted'
    || !GIT_SHA.test(evidence.source?.revision ?? '')
    || !GIT_SHA.test(evidence.source?.tree ?? '')
    || !Number.isSafeInteger(evidence.source?.source_date_epoch)
    || evidence.source.source_date_epoch <= 0
    || !SHA256.test(evidence.configuration?.policy_sha256 ?? '')
    || !SHA256.test(evidence.configuration?.mkosi_config_sha256 ?? '')
    || !SHA256.test(evidence.configuration?.snapshot_lock_sha256 ?? '')
    || evidence.configuration?.snapshot_locked !== true
    || typeof evidence.configuration?.snapshot !== 'string'
    || evidence.configuration.snapshot === 'UNRESOLVED'
    || typeof evidence.configuration?.image_version !== 'string'
    || evidence.builder_observation?.summary_validated !== true
    || evidence.builder_observation?.image_built !== true
    || typeof evidence.builder_observation?.mkosi_version !== 'string'
    || evidence.builder_observation.mkosi_version.length < 1
    || !SHA256.test(evidence.builder_observation?.artifact_set_sha256 ?? '')
  ) {
    throw new ValidationError('AXIOM Host H0 build evidence is invalid');
  }

  verifyAxiomHostArtifactInventory(evidence.builder_observation.artifact_inventory);
  const recomputed = sha256(canonicalJson(evidence.builder_observation.artifact_inventory));
  if (recomputed !== evidence.builder_observation.artifact_set_sha256) {
    throw new ValidationError('AXIOM Host H0 artifact-set digest does not match its inventory');
  }

  const requiredTrue = [
    'linux_host_required',
    'explicit_non_production_acknowledgement',
    'clean_git_worktree_required',
    'exact_commit_bound',
    'source_date_epoch_from_commit',
    'package_snapshot_locked',
    'clean_output_directory_required',
    'artifact_bytes_hashed',
    'build_environment_sanitized',
    'builder_home_isolated',
    'implicit_mkosi_secret_files_rejected'
  ];
  for (const key of requiredTrue) {
    if (evidence.controls?.[key] !== true) {
      throw new ValidationError(`AXIOM Host H0 build evidence control must be true: ${key}`);
    }
  }

  const requiredFalse = [
    'production_credentials_forwarded',
    'capability_registry_changed',
    'production_policy_changed',
    'node_admission_changed',
    'scheduler_authority_changed',
    'remote_execution_promoted',
    'production_host_profile_promoted'
  ];
  for (const key of requiredFalse) {
    if (evidence.controls?.[key] !== false) {
      throw new ValidationError(`AXIOM Host H0 build evidence control must be false: ${key}`);
    }
  }

  return true;
}

export function compareAxiomHostH0BuildEvidence(first, second) {
  verifyAxiomHostH0BuildEvidence(first);
  verifyAxiomHostH0BuildEvidence(second);

  const comparableBindings = [
    ['source.revision', first.source.revision, second.source.revision],
    ['source.tree', first.source.tree, second.source.tree],
    ['source.source_date_epoch', first.source.source_date_epoch, second.source.source_date_epoch],
    ['configuration.policy_sha256', first.configuration.policy_sha256, second.configuration.policy_sha256],
    ['configuration.mkosi_config_sha256', first.configuration.mkosi_config_sha256, second.configuration.mkosi_config_sha256],
    ['configuration.snapshot_lock_sha256', first.configuration.snapshot_lock_sha256, second.configuration.snapshot_lock_sha256],
    ['configuration.snapshot', first.configuration.snapshot, second.configuration.snapshot],
    ['configuration.image_version', first.configuration.image_version, second.configuration.image_version],
    ['builder_observation.mkosi_version', first.builder_observation.mkosi_version, second.builder_observation.mkosi_version]
  ];
  const bindingDrift = comparableBindings
    .filter(([, left, right]) => left !== right)
    .map(([field, left, right]) => ({ field, first: left, second: right }));
  if (bindingDrift.length > 0) {
    throw new ValidationError(
      `AXIOM Host H0 builds are not comparable because build bindings drifted: ${bindingDrift.map(item => item.field).join(', ')}`
    );
  }

  const firstArtifacts = new Map(first.builder_observation.artifact_inventory.map(item => [item.name, item]));
  const secondArtifacts = new Map(second.builder_observation.artifact_inventory.map(item => [item.name, item]));
  const names = [...new Set([...firstArtifacts.keys(), ...secondArtifacts.keys()])].sort();
  const differences = [];
  for (const name of names) {
    const left = firstArtifacts.get(name) ?? null;
    const right = secondArtifacts.get(name) ?? null;
    if (!left || !right) {
      differences.push({ name, kind: 'presence', first: left, second: right });
      continue;
    }
    if (left.bytes !== right.bytes || left.sha256 !== right.sha256) {
      differences.push({ name, kind: 'bytes', first: left, second: right });
    }
  }

  const byteIdentical = differences.length === 0
    && first.builder_observation.artifact_set_sha256 === second.builder_observation.artifact_set_sha256;
  const comparison = {
    schema: HOST_LAB_COMPARISON_SCHEMA,
    status: byteIdentical ? 'byte-identical' : 'artifact-drift',
    byte_reproducible: byteIdentical,
    source: {
      revision: first.source.revision,
      tree: first.source.tree,
      source_date_epoch: first.source.source_date_epoch
    },
    configuration: {
      policy_sha256: first.configuration.policy_sha256,
      mkosi_config_sha256: first.configuration.mkosi_config_sha256,
      snapshot_lock_sha256: first.configuration.snapshot_lock_sha256,
      snapshot: first.configuration.snapshot,
      image_version: first.configuration.image_version,
      mkosi_version: first.builder_observation.mkosi_version
    },
    artifacts: {
      first_set_sha256: first.builder_observation.artifact_set_sha256,
      second_set_sha256: second.builder_observation.artifact_set_sha256,
      first_count: first.builder_observation.artifact_inventory.length,
      second_count: second.builder_observation.artifact_inventory.length,
      differences
    },
    authority: {
      production_promoted: false,
      capability_registry_changed: false,
      production_policy_changed: false,
      scheduler_authority_changed: false
    },
    interpretation: byteIdentical
      ? 'The two H0 builds produced the same inventoried artifact bytes under the same bound source, configuration, package snapshot, and mkosi version. This is reproducibility evidence, not production or runtime correctness evidence.'
      : 'The two otherwise comparable H0 builds produced different artifact bytes. The drift must be explained or removed before a byte-reproducibility claim.'
  };
  return {
    ...comparison,
    comparison_sha256: sha256(canonicalJson(comparison))
  };
}

async function main() {
  const [firstPath, secondPath] = process.argv.slice(2);
  if (!firstPath || !secondPath || process.argv.length !== 4) {
    throw new ValidationError('Usage: axiom-host-lab-compare.mjs <first-evidence.json> <second-evidence.json>');
  }
  const [first, second] = await Promise.all([
    readJson(firstPath),
    readJson(secondPath)
  ]);
  const comparison = compareAxiomHostH0BuildEvidence(first, second);
  process.stdout.write(`${JSON.stringify(comparison)}\n`);
  if (!comparison.byte_reproducible) process.exitCode = 2;
}

async function readJson(path) {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(path, 'utf8'));
  } catch {
    throw new ValidationError(`AXIOM Host H0 comparison input is not valid JSON: ${path}`);
  }
  return parsed;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
