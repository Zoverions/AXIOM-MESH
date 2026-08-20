import { createPublicKey, randomUUID } from 'node:crypto';
import {
  mkdir,
  readdir,
  readFile,
  writeFile
} from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import {
  ValidationError,
  canonicalJson,
  sha256
} from './lib/canonical.mjs';
import {
  ensureMeshIdentity,
  verifyObjectSignature
} from './lib/identity.mjs';
import { DataProtector } from './lib/protector.mjs';
import {
  reserveProductionPortBlock,
  productionHostEnvironment,
  startProductionHost,
  stopProductionHost,
  stopProductionHostStrict
} from './lib/production-host.mjs';
import {
  createGridBackup,
  restoreGridBackup
} from './grid/backup.mjs';
import { GridStore } from './grid/store.mjs';
import { provisionProduction } from './provision-production.mjs';
import {
  rollbackDataProtectionKey,
  rotateDataProtectionKey,
  verifyDataKeyRotationManifest
} from './rotate-data-key.mjs';

const EVIDENCE_FORMAT = 'axiom-data-key-rotation-drill-evidence.v1';
const REVISION = /^[a-f0-9]{40}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const REQUEST_TIMEOUT_MS = 5_000;
const STARTUP_TIMEOUT_MS = 20_000;

export async function runDataKeyRotationDrill({
  workspaceDir,
  sourceRevision = process.env.GITHUB_SHA || null
} = {}) {
  const workspace = await prepareDisposableWorkspace(workspaceDir);
  const revision = normalizeRevision(sourceRevision);
  const generatedAt = new Date().toISOString();
  const overallStartedAt = performance.now();
  const provisioned = await provisionProduction({
    dataDir: join(workspace, 'data'),
    secretDir: join(workspace, 'secrets')
  });
  const operatorToken = (
    await readFile(provisioned.operator_token_file, 'utf8')
  ).trim();
  const originalKeyFile = await readFile(provisioned.data_key_file);
  const originalKey = decodeDataKey(originalKeyFile);
  const identity = await ensureMeshIdentity(
    provisioned.data_dir,
    'grid',
    { create: false }
  );
  const portLease = await reserveProductionPortBlock(
    'data-key rotation drill'
  );
  const basePort = portLease.base_port;
  const gateway = `http://127.0.0.1:${basePort}`;
  const environment = productionHostEnvironment(provisioned, basePort);
  let runtime;

  try {
    const initialStart = await startProductionHost({
      environment,
      gateway,
      startupTimeoutMs: STARTUP_TIMEOUT_MS,
      drill: 'data-key rotation drill'
    });
    runtime = initialStart;
    const baselineIntent = await performEcho(
      gateway,
      operatorToken,
      'before-data-key-rotation'
    );
    const initialStop = await stopProductionHostStrict(runtime.child, {
      boundary: 'data-key rotation boundary'
    });
    runtime = null;

    const protector = new DataProtector(originalKey);
    const store = new GridStore({
      path: join(provisioned.data_dir, 'grid.sqlite'),
      dataDir: provisioned.data_dir,
      identity,
      protector
    });
    const backupId = 'backup_data_key_rotation_drill';
    store.appendEvents({
      traceId: 'trace_data_key_rotation_backup',
      actor: 'production-operator',
      events: [{
        kind: 'backup.requested',
        subject: backupId,
        payload: {
          backup_id: backupId,
          principal: 'production-operator'
        }
      }]
    });
    const backupManifest = await createGridBackup({
      store,
      dataDir: provisioned.data_dir,
      identity,
      protector,
      backupId,
      traceId: 'trace_data_key_rotation_backup_complete'
    });
    store.close();

    const rotationStartedAt = performance.now();
    const rotation = await rotateDataProtectionKey({
      dataDir: provisioned.data_dir,
      secretDir: provisioned.secret_dir
    });
    const rotationDurationMs = elapsedMilliseconds(rotationStartedAt);
    const rotatedKeyFile = await readFile(provisioned.data_key_file);
    const rotatedKey = decodeDataKey(rotatedKeyFile);
    const manifestSerialized = await readFile(rotation.manifest_path);
    const manifest = JSON.parse(manifestSerialized.toString('utf8'));
    verifyDataKeyRotationManifest({ manifest });

    const originalKeyPath = join(workspace, 'retired-original-data.key');
    await writeFile(originalKeyPath, originalKeyFile, {
      mode: 0o600,
      flag: 'wx'
    });
    const originalKeyRejected = await rejectsStartup({
      environment: {
        ...environment,
        AXIOM_DATA_KEY_FILE: originalKeyPath
      },
      gateway,
      label: 'retired original data key'
    });

    const rotatedStart = await startProductionHost({
      environment,
      gateway,
      startupTimeoutMs: STARTUP_TIMEOUT_MS,
      drill: 'data-key rotation drill'
    });
    runtime = rotatedStart;
    const baselineAfterRotation = await readIntent(
      gateway,
      operatorToken,
      baselineIntent.intent_id
    );
    const rotatedIntent = await performEcho(
      gateway,
      operatorToken,
      'after-data-key-rotation'
    );
    const rotatedStop = await stopProductionHostStrict(runtime.child, {
      boundary: 'data-key restore boundary'
    });
    runtime = null;

    const restoreStartedAt = performance.now();
    const restoredBackup = await restoreGridBackup({
      manifestPath: join(
        provisioned.data_dir,
        'backups',
        backupId,
        'manifest.json'
      ),
      dataDir: provisioned.data_dir,
      identity,
      protector: new DataProtector(rotatedKey),
      expectedDatabaseDigest: backupManifest.database.sha256
    });
    const restoreDurationMs = elapsedMilliseconds(restoreStartedAt);
    const recoveryStart = await startProductionHost({
      environment,
      gateway,
      startupTimeoutMs: STARTUP_TIMEOUT_MS,
      drill: 'data-key rotation recovery drill'
    });
    runtime = recoveryStart;
    const baselineAfterRestore = await readIntent(
      gateway,
      operatorToken,
      baselineIntent.intent_id
    );
    const postRestoreIntent = await performEcho(
      gateway,
      operatorToken,
      'after-rotated-key-restore'
    );
    const recoveryStop = await stopProductionHostStrict(runtime.child, {
      boundary: 'data-key rollback boundary'
    });
    runtime = null;

    const rollbackStartedAt = performance.now();
    const rollback = await rollbackDataProtectionKey({
      manifestPath: rotation.manifest_path,
      dataDir: provisioned.data_dir,
      secretDir: provisioned.secret_dir
    });
    const rollbackDurationMs = elapsedMilliseconds(rollbackStartedAt);
    const restoredKeyFile = await readFile(provisioned.data_key_file);
    const rotatedKeyPath = join(workspace, 'retired-rotated-data.key');
    await writeFile(rotatedKeyPath, rotatedKeyFile, {
      mode: 0o600,
      flag: 'wx'
    });
    const rotatedKeyRejected = await rejectsStartup({
      environment: {
        ...environment,
        AXIOM_DATA_KEY_FILE: rotatedKeyPath
      },
      gateway,
      label: 'rolled-back data key'
    });

    const restoredStart = await startProductionHost({
      environment,
      gateway,
      startupTimeoutMs: STARTUP_TIMEOUT_MS,
      drill: 'data-key rollback drill'
    });
    runtime = restoredStart;
    const baselineAfterRollback = await readIntent(
      gateway,
      operatorToken,
      baselineIntent.intent_id
    );
    const postRestoreAfterRollback = await readIntent(
      gateway,
      operatorToken,
      postRestoreIntent.intent_id
    );
    const finalIntent = await performEcho(
      gateway,
      operatorToken,
      'after-data-key-rollback'
    );
    const finalStop = await stopProductionHost(runtime.child);
    runtime = null;

    const checks = {
      original_runtime_started: initialStart.startup_duration_ms <= STARTUP_TIMEOUT_MS,
      baseline_intent_succeeded: baselineIntent.completed,
      original_runtime_stopped: cleanStop(initialStop),
      data_key_changed: !rotatedKey.equals(originalKey),
      live_database_reencrypted: rotation.protected_values > 0,
      backup_artifact_reencrypted: rotation.protected_artifacts === 1,
      original_key_rejected_after_rotation: originalKeyRejected,
      rotated_runtime_started: rotatedStart.startup_duration_ms <= STARTUP_TIMEOUT_MS,
      baseline_survived_rotation: baselineAfterRotation.status === 200,
      rotated_intent_succeeded: rotatedIntent.completed,
      rotated_runtime_stopped: cleanStop(rotatedStop),
      backup_restored_with_rotated_key: restoredBackup.restored,
      recovery_runtime_started: recoveryStart.startup_duration_ms <= STARTUP_TIMEOUT_MS,
      baseline_survived_restore: baselineAfterRestore.status === 200,
      post_restore_intent_succeeded: postRestoreIntent.completed,
      recovery_runtime_stopped: cleanStop(recoveryStop),
      original_key_restored: restoredKeyFile.equals(originalKeyFile),
      rollback_preserved_post_rotation_state: (
        rollback.preserves_post_rotation_grid_state
        && postRestoreAfterRollback.status === 200
      ),
      recovery_database_reencrypted: rollback.recovery_databases === 1,
      rotated_key_rejected_after_rollback: rotatedKeyRejected,
      restored_runtime_started: restoredStart.startup_duration_ms <= STARTUP_TIMEOUT_MS,
      baseline_survived_rollback: baselineAfterRollback.status === 200,
      final_intent_succeeded: finalIntent.completed,
      final_runtime_stopped: cleanStop(finalStop)
    };
    const failed = Object.entries(checks)
      .filter(([, passed]) => passed !== true)
      .map(([name]) => name);
    if (failed.length > 0) {
      throw new ValidationError(
        `Data-key rotation drill checks failed: ${failed.join(', ')}`
      );
    }

    const packageJson = JSON.parse(
      await readFile(new URL('../package.json', import.meta.url), 'utf8')
    );
    const publicKeyPem = String(identity.publicKey.export({
      type: 'spki',
      format: 'pem'
    }));
    const unsigned = {
      schema: EVIDENCE_FORMAT,
      status: 'passed',
      generated_at: generatedAt,
      source: {
        kernel_version: packageJson.version,
        revision
      },
      execution: {
        disposable_workspace: true,
        host_mode: true,
        node: process.version,
        platform: process.platform,
        architecture: process.arch
      },
      signer: {
        key_id: identity.keyId,
        public_key_pem: publicKeyPem
      },
      rotation: {
        rotation_id: rotation.rotation_id,
        manifest_path: portableRelative(workspace, rotation.manifest_path),
        manifest_sha256: sha256(manifestSerialized),
        duration_ms: rotationDurationMs,
        protected_values: rotation.protected_values,
        protected_artifacts: rotation.protected_artifacts,
        recovery_databases: rotation.recovery_databases,
        data_key_changed: true,
        encrypted_rollback_available: rotation.rollback_available
      },
      recovery: {
        backup_id: backupId,
        source_database_sha256: backupManifest.database.sha256,
        active_database_sha256: restoredBackup.database_digest,
        duration_ms: restoreDurationMs,
        restored_with_rotated_key: true
      },
      rollback: {
        duration_ms: rollbackDurationMs,
        protected_values: rollback.protected_values,
        protected_artifacts: rollback.protected_artifacts,
        recovery_databases: rollback.recovery_databases,
        exact_original_key_restored: true,
        preserves_post_rotation_grid_state: true
      },
      rejection: {
        original_key_after_rotation: true,
        rotated_key_after_rollback: true
      },
      runtime: {
        initial_start_ms: initialStart.startup_duration_ms,
        rotated_start_ms: rotatedStart.startup_duration_ms,
        recovery_start_ms: recoveryStart.startup_duration_ms,
        restored_start_ms: restoredStart.startup_duration_ms,
        shutdowns: {
          initial_ms: initialStop.duration_ms,
          rotated_ms: rotatedStop.duration_ms,
          recovery_ms: recoveryStop.duration_ms,
          final_ms: finalStop.duration_ms
        }
      },
      total_duration_ms: elapsedMilliseconds(overallStartedAt),
      checks,
      limitations: [
        'disposable single-host proof, not a live deployment rotation',
        'offline rotation with a stopped four-process runtime',
        'external secret-manager versioning and escrow require pilot evidence',
        'multi-host coordinated encryption-key rotation remains out of scope'
      ]
    };
    const evidence = {
      ...unsigned,
      attestation: identity.signObject(unsigned)
    };
    verifyDataKeyRotationDrillEvidence(evidence);
    const serializedEvidence = canonicalJson(evidence);
    for (const secret of [
      operatorToken,
      originalKey.toString('base64url'),
      rotatedKey.toString('base64url')
    ]) {
      if (serializedEvidence.includes(secret)) {
        throw new ValidationError(
          'Data-key rotation drill evidence contains secret material'
        );
      }
    }
    return evidence;
  } finally {
    if (runtime) await stopProductionHost(runtime.child);
    await portLease.release();
  }
}

export function verifyDataKeyRotationDrillEvidence(evidence) {
  if (
    evidence?.schema !== EVIDENCE_FORMAT
    || evidence?.status !== 'passed'
    || !evidence.checks
    || Object.values(evidence.checks).some(value => value !== true)
  ) {
    throw new ValidationError(
      'Data-key rotation drill evidence format or checks are invalid'
    );
  }
  if (
    evidence.rotation?.data_key_changed !== true
    || evidence.rotation?.encrypted_rollback_available !== true
    || evidence.rotation?.protected_values < 1
    || evidence.rotation?.protected_artifacts < 1
    || !DIGEST.test(evidence.rotation?.manifest_sha256 ?? '')
    || evidence.recovery?.restored_with_rotated_key !== true
    || !DIGEST.test(evidence.recovery?.source_database_sha256 ?? '')
    || !DIGEST.test(evidence.recovery?.active_database_sha256 ?? '')
    || evidence.rollback?.exact_original_key_restored !== true
    || evidence.rollback?.preserves_post_rotation_grid_state !== true
    || evidence.rollback?.recovery_databases < 1
    || evidence.rejection?.original_key_after_rotation !== true
    || evidence.rejection?.rotated_key_after_rollback !== true
  ) {
    throw new ValidationError(
      'Data-key rotation drill scope or rollback proof is invalid'
    );
  }
  if (
    typeof evidence.signer?.public_key_pem !== 'string'
    || evidence.attestation?.key_id !== evidence.signer?.key_id
  ) {
    throw new ValidationError(
      'Data-key rotation drill signer metadata is invalid'
    );
  }
  let publicKey;
  try {
    publicKey = createPublicKey(evidence.signer.public_key_pem);
  } catch {
    throw new ValidationError(
      'Data-key rotation drill signer public key is invalid'
    );
  }
  if (publicKey.asymmetricKeyType !== 'ed25519') {
    throw new ValidationError(
      'Data-key rotation drill signer is not Ed25519'
    );
  }
  const unsigned = structuredClone(evidence);
  delete unsigned.attestation;
  if (!verifyObjectSignature(unsigned, evidence.attestation, publicKey)) {
    throw new ValidationError(
      'Data-key rotation drill attestation is invalid'
    );
  }
  return {
    valid: true,
    schema: evidence.schema,
    source_revision: evidence.source?.revision,
    rotation_id: evidence.rotation.rotation_id,
    rotation_ms: evidence.rotation.duration_ms,
    rollback_ms: evidence.rollback.duration_ms
  };
}

async function performEcho(gateway, token, label) {
  const expected = `${label}-${randomUUID()}`;
  try {
    const response = await fetch(`${gateway}/v1/intents`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json',
        'content-type': 'application/json',
        'idempotency-key': `data-key-${randomUUID()}`
      },
      body: JSON.stringify({
        action: 'system.echo',
        input: { message: expected }
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    const payload = await response.json();
    return {
      status: response.status,
      intent_id: payload?.intent_id,
      completed: (
        response.status === 200
        && payload?.status === 'completed'
        && payload?.message === expected
        && typeof payload?.intent_id === 'string'
      )
    };
  } catch {
    return { status: 0, completed: false };
  }
}

async function readIntent(gateway, token, intentId) {
  try {
    const response = await fetch(
      `${gateway}/v1/intents/${encodeURIComponent(intentId)}`,
      {
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/json'
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      }
    );
    await response.arrayBuffer();
    return { status: response.status };
  } catch {
    return { status: 0 };
  }
}

async function rejectsStartup({ environment, gateway, label }) {
  try {
    const started = await startProductionHost({
      environment,
      gateway,
      startupTimeoutMs: STARTUP_TIMEOUT_MS,
      drill: label
    });
    await stopProductionHost(started.child);
    return false;
  } catch {
    return true;
  }
}

async function prepareDisposableWorkspace(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ValidationError(
      'Data-key rotation drill requires an explicit disposable workspace'
    );
  }
  const workspace = resolve(value);
  await mkdir(workspace, { recursive: true, mode: 0o700 });
  if ((await readdir(workspace)).length !== 0) {
    throw new ValidationError(
      'Data-key rotation drill workspace must be empty'
    );
  }
  return workspace;
}

function decodeDataKey(value) {
  const key = Buffer.from(value.toString('utf8').trim(), 'base64url');
  if (key.length !== 32) {
    throw new ValidationError('Data-key drill key is invalid');
  }
  return key;
}

function normalizeRevision(value) {
  if (value === null || value === undefined || value === '') return null;
  if (!REVISION.test(value)) {
    throw new ValidationError(
      'Data-key rotation drill source revision must be a 40-character SHA'
    );
  }
  return value;
}

function cleanStop(result) {
  return result.code === 0 && result.signal === null;
}

function elapsedMilliseconds(startedAt) {
  return Number((performance.now() - startedAt).toFixed(3));
}

function portableRelative(from, to) {
  return relative(from, to).replaceAll('\\', '/');
}

export { EVIDENCE_FORMAT };

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (process.argv.length !== 3) {
    throw new ValidationError(
      'Usage: node src/data-key-rotation-drill.mjs '
      + '<empty-disposable-workspace>'
    );
  }
  const evidence = await runDataKeyRotationDrill({
    workspaceDir: process.argv[2]
  });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}
