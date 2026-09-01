#!/usr/bin/env node

// Startup-cost evidence for SCALABILITY-AUDIT-2026-07-30 S-01 and S-02.
//
// Builds one synthetic Grid of a chosen size, then measures two startups of that
// same database in isolated processes: a normal anchored restart, and a forced
// full genesis re-derivation. Current sealed mode is deliberately zero-or-full:
// a valid exact-head clean-close anchor replays zero events; any invalid or stale
// anchor falls back to genesis. The evidence records that behavior explicitly and
// does not claim incremental suffix replay.

import { createPublicKey } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ValidationError, digestObject, sha256 } from './lib/canonical.mjs';
import { ensureMeshIdentity, verifyObjectSignature } from './lib/identity.mjs';
import { loadDataProtector } from './lib/protector.mjs';
import { GridStore } from './grid/store.mjs';
import { logicalMaterializedStateDigest } from './grid-startup-logical-state.mjs';

const EVIDENCE_SCHEMA = 'axiom-grid-startup-benchmark.v2';
const REVISION = /^[a-f0-9]{40}$/;
const MAX_COMMIT_BATCH = 32;
const WORKER = fileURLToPath(
  new URL('./grid-startup-benchmark-worker.mjs', import.meta.url)
);

export { EVIDENCE_SCHEMA };

export async function runGridStartupBenchmark({
  eventCount = 50_000,
  batchSize = MAX_COMMIT_BATCH,
  checkpointInterval = 10_000,
  workspaceDir,
  sourceRevision = process.env.GITHUB_SHA || null,
  generatedAt = new Date().toISOString()
} = {}) {
  validateConfiguration({ eventCount, batchSize, checkpointInterval });
  const temporary = !workspaceDir;
  const root = workspaceDir ?? await mkdtemp(join(tmpdir(), 'axiom-startup-benchmark-'));
  const dataDir = join(root, 'data');
  let store;
  try {
    const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
    const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
    const preparationStartedAt = performance.now();
    store = new GridStore({
      path: join(dataDir, 'grid.sqlite'),
      dataDir,
      identity,
      protector,
      checkpointInterval,
      materializationAnchor: 'sealed'
    });
    for (let offset = 0; offset < eventCount; offset += batchSize) {
      const size = Math.min(batchSize, eventCount - offset);
      store.appendEvents({
        traceId: `trace_startup_${String(offset + 1).padStart(10, '0')}`,
        actor: 'benchmark:operator',
        events: Array.from({ length: size }, (_, index) => benchmarkEvent(offset + index + 1))
      });
    }
    const preparationDurationMs = Math.round(
      (performance.now() - preparationStartedAt) * 1000
    ) / 1000;
    const expectedStorageDigest = store.materializedStateDigest();
    const expectedLogicalDigest = logicalMaterializedStateDigest(store);
    store.close();
    store = null;

    // Order matters: the forced rebuild runs last so that it also proves the
    // rebuild path restores the same state the anchored path served.
    const anchored = await runWorker('anchored', dataDir, checkpointInterval);
    const rebuild = await runWorker('rebuild', dataDir, checkpointInterval);
    if (
      anchored.materialization?.mode !== 'anchored'
      || anchored.materialization.replayed_events !== 0
      || anchored.protected_columns?.mode !== 'sampled'
      || rebuild.materialization?.mode !== 'full_rebuild'
      || rebuild.materialization.replayed_events !== eventCount
      || rebuild.protected_columns?.mode !== 'migrated'
      || anchored.events !== eventCount
      || rebuild.events !== eventCount
      || anchored.materialized_state_storage_digest !== expectedStorageDigest
      || anchored.logical_materialized_state_digest !== expectedLogicalDigest
      || rebuild.logical_materialized_state_digest !== expectedLogicalDigest
    ) {
      throw new ValidationError('Grid startup benchmark invariants did not hold');
    }

    const packageJson = JSON.parse(
      await readFile(new URL('../package.json', import.meta.url), 'utf8')
    );
    const unsigned = {
      schema: EVIDENCE_SCHEMA,
      status: 'passed',
      generated_at: normalizeTimestamp(generatedAt),
      source: {
        kernel_version: packageJson.version,
        revision: normalizeRevision(sourceRevision)
      },
      runtime: {
        node: process.version,
        platform: process.platform,
        architecture: process.arch
      },
      signer: {
        key_id: identity.keyId,
        public_key_pem: String(identity.publicKey.export({ type: 'spki', format: 'pem' }))
      },
      fixture: {
        synthetic: true,
        event_kinds: ['intent.accepted', 'intent.completed'],
        events: eventCount,
        batch_size: batchSize,
        checkpoint_interval: checkpointInterval,
        preparation_wall_time_ms: preparationDurationMs,
        materialized_state_storage_digest: expectedStorageDigest,
        logical_materialized_state_digest: expectedLogicalDigest
      },
      measurements: { anchored, rebuild },
      comparison: {
        wall_time_ratio_rebuild_over_anchored: ratio(
          rebuild.wall_time_ms,
          anchored.wall_time_ms
        ),
        process_max_rss_ratio_rebuild_over_anchored: ratio(
          rebuild.process_max_rss_kib,
          anchored.process_max_rss_kib
        ),
        anchored_replay_bounded: anchored.materialization.replayed_events === 0,
        rebuild_replayed_full_history: rebuild.materialization.replayed_events === eventCount,
        logical_states_identical:
          anchored.logical_materialized_state_digest === rebuild.logical_materialized_state_digest,
        storage_digests_identical:
          anchored.materialized_state_storage_digest === rebuild.materialized_state_storage_digest
      },
      limitations: [
        'single-host synthetic evidence, not production traffic',
        'process_max_rss_kib is the worker process lifetime maximum, not an incremental allocation measurement',
        'fixture construction is excluded from both measured startups',
        'wall-time results vary by runner hardware and load; replayed-event counts are the deterministic scaling evidence',
        'sealed startup is zero-or-full and does not implement incremental suffix replay',
        'the anchor uses a physical storage digest for tamper detection; benchmark equivalence uses a decoded logical-state digest',
        'the anchored path does not assert that derived state is independently signed'
      ]
    };
    const evidence = { ...unsigned, attestation: identity.signObject(unsigned) };
    verifyGridStartupBenchmarkEvidence(evidence);
    return evidence;
  } finally {
    try {
      store?.close();
    } catch {
      // Cleanup is best effort after benchmark failure.
    }
    if (temporary) await rm(root, { recursive: true, force: true });
  }
}

export function verifyGridStartupBenchmarkEvidence(evidence) {
  if (
    !evidence
    || evidence.schema !== EVIDENCE_SCHEMA
    || evidence.status !== 'passed'
    || !Number.isSafeInteger(evidence.fixture?.events)
    || evidence.fixture.events < 1
    || evidence.measurements?.anchored?.mode !== 'anchored'
    || evidence.measurements?.rebuild?.mode !== 'rebuild'
    || evidence.measurements.anchored.materialization?.replayed_events !== 0
    || evidence.measurements.rebuild.materialization?.replayed_events !== evidence.fixture.events
    || evidence.measurements.anchored.logical_materialized_state_digest
      !== evidence.measurements.rebuild.logical_materialized_state_digest
    || evidence.comparison?.anchored_replay_bounded !== true
    || evidence.comparison?.logical_states_identical !== true
  ) {
    throw new ValidationError('Grid startup benchmark evidence is invalid');
  }
  normalizeTimestamp(evidence.generated_at);
  normalizeRevision(evidence.source?.revision);
  for (const measurement of Object.values(evidence.measurements)) {
    if (
      !Number.isFinite(measurement.wall_time_ms)
      || measurement.wall_time_ms < 0
      || !Number.isSafeInteger(measurement.process_max_rss_kib)
      || measurement.process_max_rss_kib < 1
    ) throw new ValidationError('Grid startup resource measurement is invalid');
  }
  if (
    typeof evidence.signer?.public_key_pem !== 'string'
    || evidence.attestation?.key_id !== evidence.signer?.key_id
  ) throw new ValidationError('Grid startup benchmark signer metadata is invalid');
  let publicKey;
  try {
    publicKey = createPublicKey(evidence.signer.public_key_pem);
  } catch {
    throw new ValidationError('Grid startup benchmark public key is invalid');
  }
  const unsigned = structuredClone(evidence);
  delete unsigned.attestation;
  if (!verifyObjectSignature(unsigned, evidence.attestation, publicKey)) {
    throw new ValidationError('Grid startup benchmark attestation is invalid');
  }
  return {
    valid: true,
    events: evidence.fixture.events,
    anchored_replayed_events: evidence.measurements.anchored.materialization.replayed_events,
    rebuild_replayed_events: evidence.measurements.rebuild.materialization.replayed_events,
    wall_time_ratio: evidence.comparison.wall_time_ratio_rebuild_over_anchored,
    process_max_rss_ratio: evidence.comparison.process_max_rss_ratio_rebuild_over_anchored,
    evidence_digest: digestObject(evidence)
  };
}

function validateConfiguration({ eventCount, batchSize, checkpointInterval }) {
  if (!Number.isSafeInteger(eventCount) || eventCount < 1 || eventCount > 10_000_000) {
    throw new ValidationError('Grid startup benchmark event count must be an integer between 1 and 10000000');
  }
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > MAX_COMMIT_BATCH) {
    throw new ValidationError(
      `Grid startup benchmark batch size must be an integer between 1 and ${MAX_COMMIT_BATCH}`
    );
  }
  if (
    !Number.isSafeInteger(checkpointInterval)
    || checkpointInterval < 1
    || checkpointInterval > 1_000_000
  ) {
    throw new ValidationError('Grid startup benchmark checkpoint interval must be an integer between 1 and 1000000');
  }
}

function benchmarkEvent(index) {
  const intentNumber = Math.ceil(index / 2);
  const intentId = `intent_startup_${String(intentNumber).padStart(12, '0')}`;
  if (index % 2 === 0) {
    return {
      kind: 'intent.completed',
      subject: intentId,
      payload: {
        intent_id: intentId,
        result: { echoed: `startup-result-${intentNumber}` }
      }
    };
  }
  return {
    kind: 'intent.accepted',
    subject: intentId,
    payload: {
      intent_id: intentId,
      principal: 'benchmark:operator',
      action: 'system.echo',
      risk: 'low',
      input_digest: sha256(`startup-input-${intentNumber}`),
      request_digest: sha256(`startup-request-${intentNumber}`)
    }
  };
}

function runWorker(mode, dataDir, checkpointInterval) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [WORKER, mode, dataDir, String(checkpointInterval)],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0) {
        reject(new ValidationError(`Grid startup benchmark worker failed: ${stderr.trim()}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new ValidationError('Grid startup benchmark worker produced invalid output'));
      }
    });
  });
}

function ratio(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 1000;
}

function normalizeTimestamp(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new ValidationError('Grid startup benchmark timestamp is invalid');
  }
  return new Date(value).toISOString();
}

function normalizeRevision(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || !REVISION.test(value)) {
    throw new ValidationError('Grid startup benchmark revision must be a 40 character commit id');
  }
  return value;
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith('--') || value === undefined) {
      throw new ValidationError('Grid startup benchmark arguments must be --name value pairs');
    }
    options[flag.slice(2)] = value;
  }
  return options;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const evidence = await runGridStartupBenchmark({
    eventCount: Number(args.events ?? 50_000),
    batchSize: Number(args['batch-size'] ?? MAX_COMMIT_BATCH),
    checkpointInterval: Number(args['checkpoint-interval'] ?? 10_000),
    workspaceDir: args.workspace
  });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
