#!/usr/bin/env node

import { createPublicKey } from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  mkdtemp,
  readFile,
  rm
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import {
  ValidationError,
  digestObject,
  sha256
} from './lib/canonical.mjs';
import {
  ensureMeshIdentity,
  verifyObjectSignature
} from './lib/identity.mjs';
import { loadDataProtector } from './lib/protector.mjs';
import { GridStore } from './grid/store.mjs';

const EVIDENCE_SCHEMA = 'axiom-chain-verification-benchmark.v1';
const REVISION = /^[a-f0-9]{40}$/;
const WORKER = new URL('./chain-verification-benchmark-worker.mjs', import.meta.url);

export async function runChainVerificationBenchmark({
  eventCount = 50_000,
  batchSize = 1_000,
  checkpointInterval = 10_000,
  workspaceDir,
  sourceRevision = process.env.GITHUB_SHA || null,
  generatedAt = new Date().toISOString()
} = {}) {
  validateConfiguration({ eventCount, batchSize, checkpointInterval });
  const temporary = !workspaceDir;
  const root = workspaceDir ?? await mkdtemp(join(tmpdir(), 'axiom-chain-benchmark-'));
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
      checkpointInterval
    });
    for (let offset = 0; offset < eventCount; offset += batchSize) {
      const size = Math.min(batchSize, eventCount - offset);
      const events = Array.from({ length: size }, (_, index) => benchmarkEvent(offset + index + 1));
      store.appendEvents({
        traceId: `trace_benchmark_${String(offset + 1).padStart(10, '0')}`,
        actor: 'benchmark:operator',
        events
      });
    }
    const checkpoints = store.listChainCheckpoints();
    const preparationDurationMs = Math.round(
      (performance.now() - preparationStartedAt) * 1000
    ) / 1000;
    const expectedHead = store.verifyFullChain().head;
    store.close();
    store = null;

    const checkpoint = await runWorker('checkpoint', dataDir);
    const full = await runWorker('full', dataDir);
    if (
      checkpoint.verification?.valid !== true
      || full.verification?.valid !== true
      || checkpoint.verification.head !== expectedHead
      || full.verification.head !== expectedHead
      || full.verification.events !== eventCount
      || full.verification.verified_events !== eventCount
      || checkpoint.verification.verified_events >= checkpointInterval
    ) {
      throw new ValidationError('Chain benchmark verification invariants did not hold');
    }

    const packageJson = JSON.parse(
      await readFile(new URL('../package.json', import.meta.url), 'utf8')
    );
    const publicKeyPem = String(identity.publicKey.export({ type: 'spki', format: 'pem' }));
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
        public_key_pem: publicKeyPem
      },
      fixture: {
        synthetic: true,
        event_kind: 'intent.accepted',
        events: eventCount,
        batch_size: batchSize,
        checkpoint_interval: checkpointInterval,
        checkpoints: checkpoints.length,
        latest_checkpoint_seq: checkpoints.at(-1)?.statement.seq ?? null,
        suffix_events: checkpoint.verification.verified_events,
        preparation_wall_time_ms: preparationDurationMs
      },
      measurements: {
        checkpoint,
        full
      },
      comparison: {
        wall_time_ratio_full_over_checkpoint: ratio(
          full.wall_time_ms,
          checkpoint.wall_time_ms
        ),
        process_max_rss_ratio_full_over_checkpoint: ratio(
          full.process_max_rss_kib,
          checkpoint.process_max_rss_kib
        ),
        event_signature_work_reduction: ratio(
          full.verification.verified_events,
          Math.max(1, checkpoint.verification.verified_events)
        ),
        checkpoint_suffix_bounded: checkpoint.verification.verified_events < checkpointInterval,
        heads_identical: checkpoint.verification.head === full.verification.head
      },
      limitations: [
        'single-host synthetic evidence, not production traffic',
        'process_max_rss_kib is the worker process lifetime maximum, not an incremental allocation measurement',
        'fixture construction and deterministic materialized-state replay are excluded from verification wall time',
        'wall-time results vary by runner hardware and load; verified event counts are the deterministic scaling evidence',
        'checkpoint mode trusts the signed checkpointed prefix; full mode revalidates genesis-to-head storage'
      ]
    };
    const evidence = {
      ...unsigned,
      attestation: identity.signObject(unsigned)
    };
    verifyChainVerificationBenchmarkEvidence(evidence);
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

export function verifyChainVerificationBenchmarkEvidence(evidence) {
  if (
    !evidence
    || evidence.schema !== EVIDENCE_SCHEMA
    || evidence.status !== 'passed'
    || !Number.isSafeInteger(evidence.fixture?.events)
    || evidence.fixture.events < 1
    || !Number.isSafeInteger(evidence.fixture.checkpoint_interval)
    || evidence.fixture.checkpoint_interval < 1
    || evidence.measurements?.checkpoint?.mode !== 'checkpoint'
    || evidence.measurements?.full?.mode !== 'full'
    || evidence.measurements.checkpoint.verification?.valid !== true
    || evidence.measurements.full.verification?.valid !== true
    || evidence.measurements.full.verification.events !== evidence.fixture.events
    || evidence.measurements.full.verification.verified_events !== evidence.fixture.events
    || evidence.measurements.checkpoint.verification.verified_events >= evidence.fixture.checkpoint_interval
    || evidence.measurements.checkpoint.verification.head !== evidence.measurements.full.verification.head
    || evidence.comparison?.checkpoint_suffix_bounded !== true
    || evidence.comparison?.heads_identical !== true
  ) {
    throw new ValidationError('Chain verification benchmark evidence is invalid');
  }
  normalizeTimestamp(evidence.generated_at);
  normalizeRevision(evidence.source?.revision);
  for (const measurement of Object.values(evidence.measurements)) {
    if (
      !Number.isFinite(measurement.wall_time_ms)
      || measurement.wall_time_ms < 0
      || !Number.isSafeInteger(measurement.rss_before_bytes)
      || !Number.isSafeInteger(measurement.rss_after_bytes)
      || !Number.isSafeInteger(measurement.process_max_rss_kib)
      || measurement.process_max_rss_kib < 1
    ) throw new ValidationError('Chain benchmark resource measurement is invalid');
  }
  if (
    typeof evidence.signer?.public_key_pem !== 'string'
    || evidence.attestation?.key_id !== evidence.signer?.key_id
  ) throw new ValidationError('Chain benchmark signer metadata is invalid');
  let publicKey;
  try {
    publicKey = createPublicKey(evidence.signer.public_key_pem);
  } catch {
    throw new ValidationError('Chain benchmark public key is invalid');
  }
  const unsigned = structuredClone(evidence);
  delete unsigned.attestation;
  if (!verifyObjectSignature(unsigned, evidence.attestation, publicKey)) {
    throw new ValidationError('Chain benchmark attestation is invalid');
  }
  return {
    valid: true,
    events: evidence.fixture.events,
    checkpoint_verified_events: evidence.measurements.checkpoint.verification.verified_events,
    full_verified_events: evidence.measurements.full.verification.verified_events,
    wall_time_ratio: evidence.comparison.wall_time_ratio_full_over_checkpoint,
    process_max_rss_ratio: evidence.comparison.process_max_rss_ratio_full_over_checkpoint,
    evidence_digest: digestObject(evidence)
  };
}

function benchmarkEvent(index) {
  return {
    kind: 'intent.accepted',
    subject: `intent_benchmark_${String(index).padStart(12, '0')}`,
    payload: {
      intent_id: `intent_benchmark_${String(index).padStart(12, '0')}`,
      principal: 'benchmark:operator',
      action: 'system.echo',
      risk: 'low',
      input_digest: sha256(`benchmark-input-${index}`),
      request_digest: sha256(`benchmark-request-${index}`)
    }
  };
}

function runWorker(mode, dataDir) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [WORKER.pathname, mode, dataDir], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      if (stdout.length < 1_048_576) stdout += chunk;
    });
    child.stderr.on('data', chunk => {
      if (stderr.length < 65_536) stderr += chunk;
    });
    child.once('error', reject);
    child.once('exit', code => {
      if (code !== 0) {
        reject(new ValidationError(
          `Chain benchmark ${mode} worker failed: ${stderr.trim() || `exit ${code}`}`
        ));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new ValidationError(`Chain benchmark ${mode} worker emitted invalid JSON`));
      }
    });
  });
}

function validateConfiguration({ eventCount, batchSize, checkpointInterval }) {
  if (
    !Number.isSafeInteger(eventCount)
    || eventCount < 100
    || eventCount > 1_000_000
    || !Number.isSafeInteger(batchSize)
    || batchSize < 1
    || batchSize > 10_000
    || !Number.isSafeInteger(checkpointInterval)
    || checkpointInterval < 10
    || checkpointInterval > 1_000_000
    || batchSize > eventCount
  ) throw new ValidationError('Chain benchmark configuration is invalid');
}

function ratio(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 1000;
}

function normalizeRevision(value) {
  if (value === null || value === undefined || value === '') return null;
  if (!REVISION.test(value)) {
    throw new ValidationError('Chain benchmark revision must be a 40-character SHA');
  }
  return value;
}

function normalizeTimestamp(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new ValidationError('Chain benchmark timestamp is invalid');
  }
  return new Date(value).toISOString();
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith('--') || value === undefined) {
      throw new ValidationError('Chain benchmark arguments must be --name value pairs');
    }
    options[flag.slice(2)] = value;
  }
  return options;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const evidence = await runChainVerificationBenchmark({
    eventCount: Number(args.events ?? 50_000),
    batchSize: Number(args['batch-size'] ?? 1_000),
    checkpointInterval: Number(args['checkpoint-interval'] ?? 10_000),
    workspaceDir: args.workspace
  });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

export { EVIDENCE_SCHEMA };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
