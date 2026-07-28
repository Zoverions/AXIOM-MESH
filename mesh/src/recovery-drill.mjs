import { createPublicKey, randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import {
  acquireGridRuntimeLock,
  createGridBackup,
  recordPendingRecovery,
  releaseGridRuntimeLock,
  restoreGridBackup,
  verifyGridBackup
} from './grid/backup.mjs';
import { GridStore } from './grid/store.mjs';
import { ValidationError, sha256 } from './lib/canonical.mjs';
import { ensureMeshIdentity, verifyObjectSignature } from './lib/identity.mjs';
import { DataProtector } from './lib/protector.mjs';
import { provisionProduction } from './provision-production.mjs';

const EVIDENCE_FORMAT = 'axiom-recovery-drill-evidence.v1';
const REVISION = /^[a-f0-9]{40}$/;

export async function runRecoveryDrill({
  workspaceDir,
  sourceRevision = process.env.GITHUB_SHA || null
} = {}) {
  const workspace = await prepareDisposableWorkspace(workspaceDir);
  const revision = normalizeRevision(sourceRevision);
  const startedAt = performance.now();
  const generatedAt = new Date().toISOString();
  const dataDir = join(workspace, 'data');
  const secretDir = join(workspace, 'secrets');
  const provisioned = await provisionProduction({ dataDir, secretDir });
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: false });
  const protector = new DataProtector(
    Buffer.from((await readFile(provisioned.data_key_file, 'utf8')).trim(), 'base64url')
  );
  const dbPath = join(dataDir, 'grid.sqlite');
  const backupId = `backup_drill_${randomUUID()}`;
  let store;

  try {
    store = new GridStore({ path: dbPath, dataDir, identity, protector });
    store.appendEvents({
      traceId: 'trace_recovery_drill_seed',
      actor: 'recovery-drill',
      events: [intentEvent('intent_before_recovery_drill', 'before-recovery-drill')]
    });
    store.appendEvents({
      traceId: 'trace_recovery_drill_request',
      actor: 'recovery-drill',
      events: [{
        kind: 'backup.requested',
        subject: backupId,
        payload: { backup_id: backupId, principal: 'recovery-drill' }
      }]
    });

    const backupStartedAt = performance.now();
    const manifest = await createGridBackup({
      store,
      dataDir,
      identity,
      protector,
      backupId,
      traceId: 'trace_recovery_drill_backup'
    });
    const backupDurationMs = elapsedMilliseconds(backupStartedAt);
    const manifestPath = join(dataDir, 'backups', backupId, 'manifest.json');
    const snapshotPath = join(dataDir, 'backups', backupId, 'snapshot.axb');
    const protectedSnapshot = await readFile(snapshotPath);
    const verifiedBackup = verifyGridBackup({
      manifest,
      protectedSnapshot,
      gridPublicKey: identity.publicKey,
      protector,
      expectedDatabaseDigest: manifest.database.sha256
    });

    const tamperedSnapshot = Buffer.from(protectedSnapshot);
    tamperedSnapshot[tamperedSnapshot.length - 2] ^= 1;
    const tamperedSnapshotRejected = await rejectedBy(
      () => verifyGridBackup({
        manifest,
        protectedSnapshot: tamperedSnapshot,
        gridPublicKey: identity.publicKey,
        protector
      }),
      error => /digest|byte count|authentication/.test(error.message)
    );

    store.appendEvents({
      traceId: 'trace_recovery_drill_after_backup',
      actor: 'recovery-drill',
      events: [intentEvent('intent_after_recovery_drill_backup', 'after-recovery-drill')]
    });
    const replacedStatus = store.getStatus();
    store.close();
    store = null;

    const runtimeLock = await acquireGridRuntimeLock(dataDir);
    let liveRestoreRejected;
    try {
      liveRestoreRejected = await rejectedBy(
        () => restoreGridBackup({
          manifestPath,
          dataDir,
          identity,
          protector,
          expectedDatabaseDigest: manifest.database.sha256
        }),
        error => error.code === 'grid_is_running'
      );
    } finally {
      await releaseGridRuntimeLock(runtimeLock);
    }

    const wrongDigest = manifest.database.sha256 === 'f'.repeat(64)
      ? 'e'.repeat(64)
      : 'f'.repeat(64);
    const exactDigestEnforced = await rejectedBy(
      () => restoreGridBackup({
        manifestPath,
        dataDir,
        identity,
        protector,
        expectedDatabaseDigest: wrongDigest
      }),
      error => /exact expected database digest/.test(error.message)
    );

    const recoveryStartedAt = performance.now();
    const restored = await restoreGridBackup({
      manifestPath,
      dataDir,
      identity,
      protector,
      expectedDatabaseDigest: manifest.database.sha256
    });
    const rollbackDatabase = await readFile(join(restored.rollback_path, 'grid.sqlite'));
    const rollbackCopyVerified = sha256(rollbackDatabase)
      === restored.replaced_database_digest;

    store = new GridStore({ path: dbPath, dataDir, identity, protector });
    const recovery = await recordPendingRecovery({ store, dataDir, identity });
    const chain = store.verifyChain();
    const preBackupRecordPreserved = store.getIntent(
      'intent_before_recovery_drill'
    ).intent_id === 'intent_before_recovery_drill';
    const postBackupRecordAbsent = await rejectedBy(
      () => store.getIntent('intent_after_recovery_drill_backup'),
      error => error.code === 'intent_not_found'
    );
    const recoveryEventRecorded = (
      recovery?.backup_id === backupId
      && store.getBackupRecord(backupId).status === 'restored'
    );
    const recoveryDurationMs = elapsedMilliseconds(recoveryStartedAt);
    store.close();
    store = null;

    const checks = {
      production_credentials_file_backed: Boolean(
        provisioned.data_key_file && provisioned.api_tokens_file
      ),
      backup_attestation_verified: verifiedBackup.valid === true,
      tampered_snapshot_rejected: tamperedSnapshotRejected,
      live_restore_rejected: liveRestoreRejected,
      exact_database_digest_enforced: exactDigestEnforced,
      rollback_copy_verified: rollbackCopyVerified,
      evidence_chain_verified: chain.valid === true,
      pre_backup_record_preserved: preBackupRecordPreserved,
      post_backup_record_absent: postBackupRecordAbsent,
      recovery_event_recorded: recoveryEventRecorded
    };
    const failedChecks = Object.entries(checks)
      .filter(([, passed]) => passed !== true)
      .map(([name]) => name);
    if (failedChecks.length > 0) {
      throw new ValidationError(`Recovery drill checks failed: ${failedChecks.join(', ')}`);
    }

    const publicKeyPem = String(identity.publicKey.export({
      type: 'spki',
      format: 'pem'
    }));
    const unsigned = {
      schema: EVIDENCE_FORMAT,
      status: 'passed',
      generated_at: generatedAt,
      source: {
        kernel_version: JSON.parse(
          await readFile(new URL('../package.json', import.meta.url), 'utf8')
        ).version,
        revision
      },
      execution: {
        disposable_workspace: true,
        node: process.version,
        platform: process.platform,
        architecture: process.arch
      },
      signer: {
        key_id: identity.keyId,
        public_key_pem: publicKeyPem
      },
      backup: {
        backup_id: backupId,
        database_digest: manifest.database.sha256,
        encrypted_snapshot_digest: manifest.snapshot.sha256,
        database_schema_version: manifest.database.schema_version,
        evidence_events: manifest.database.evidence_events,
        duration_ms: backupDurationMs
      },
      recovery: {
        recovery_id: recovery.recovery_id,
        restored_database_digest: restored.database_digest,
        replaced_database_digest: restored.replaced_database_digest,
        rollback_artifact: portableRelative(workspace, restored.rollback_path),
        recovery_point: {
          unit: 'business_events',
          lost: 1,
          backup_evidence_sequence: manifest.database.evidence_events,
          replaced_evidence_sequence: replacedStatus.last_seq,
          evidence_events_rewound: (
            replacedStatus.last_seq - manifest.database.evidence_events
          )
        },
        rto_ms: recoveryDurationMs
      },
      total_duration_ms: elapsedMilliseconds(startedAt),
      checks
    };
    const evidence = {
      ...unsigned,
      attestation: identity.signObject(unsigned)
    };
    verifyRecoveryDrillEvidence(evidence);
    return evidence;
  } finally {
    if (store) store.close();
  }
}

export function verifyRecoveryDrillEvidence(evidence) {
  if (
    !evidence
    || typeof evidence !== 'object'
    || Array.isArray(evidence)
    || evidence.schema !== EVIDENCE_FORMAT
    || evidence.status !== 'passed'
  ) {
    throw new ValidationError('Recovery drill evidence format or status is invalid');
  }
  if (
    !evidence.checks
    || Object.values(evidence.checks).some(value => value !== true)
  ) {
    throw new ValidationError('Recovery drill evidence contains a failed check');
  }
  if (
    typeof evidence.signer?.public_key_pem !== 'string'
    || evidence.attestation?.key_id !== evidence.signer?.key_id
  ) {
    throw new ValidationError('Recovery drill signer metadata is invalid');
  }
  const unsigned = structuredClone(evidence);
  delete unsigned.attestation;
  let publicKey;
  try {
    publicKey = createPublicKey(evidence.signer.public_key_pem);
  } catch {
    throw new ValidationError('Recovery drill public key is invalid');
  }
  if (!verifyObjectSignature(unsigned, evidence.attestation, publicKey)) {
    throw new ValidationError('Recovery drill attestation is invalid');
  }
  return {
    valid: true,
    schema: evidence.schema,
    backup_id: evidence.backup?.backup_id,
    recovery_id: evidence.recovery?.recovery_id,
    source_revision: evidence.source?.revision
  };
}

function intentEvent(intentId, requestSeed) {
  return {
    kind: 'intent.accepted',
    subject: intentId,
    payload: {
      intent_id: intentId,
      principal: 'recovery-drill',
      action: 'system.echo',
      risk: 'low',
      input_digest: sha256('{}'),
      request_digest: sha256(requestSeed)
    }
  };
}

async function prepareDisposableWorkspace(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ValidationError('Recovery drill requires an explicit disposable workspace');
  }
  const workspace = resolve(value);
  await mkdir(workspace, { recursive: true, mode: 0o700 });
  if ((await readdir(workspace)).length !== 0) {
    throw new ValidationError('Recovery drill workspace must be empty');
  }
  return workspace;
}

async function rejectedBy(operation, predicate) {
  try {
    await operation();
  } catch (error) {
    return predicate(error);
  }
  return false;
}

function normalizeRevision(value) {
  if (value === null || value === undefined || value === '') return null;
  if (!REVISION.test(value)) {
    throw new ValidationError('Recovery drill source revision must be a 40-character SHA');
  }
  return value;
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
      'Usage: node src/recovery-drill.mjs <empty-disposable-workspace>'
    );
  }
  const evidence = await runRecoveryDrill({ workspaceDir: process.argv[2] });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}
