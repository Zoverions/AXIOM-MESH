import { createPublicKey, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import {
  applyBackupRetentionPlan,
  planBackupRetention,
  verifyBackupRetentionPlan,
  verifyBackupRetentionReceipt
} from './backup-maintenance.mjs';
import {
  acquireGridRuntimeLock,
  createGridBackup,
  recordPendingRecovery,
  releaseGridRuntimeLock,
  restoreGridBackup
} from './grid/backup.mjs';
import { GridStore } from './grid/store.mjs';
import { ValidationError, sha256 } from './lib/canonical.mjs';
import { ensureMeshIdentity, verifyObjectSignature } from './lib/identity.mjs';
import { DataProtector } from './lib/protector.mjs';
import { provisionProduction } from './provision-production.mjs';

const EVIDENCE_FORMAT = 'axiom-backup-lifecycle-evidence.v1';
const REVISION = /^[a-f0-9]{40}$/;

export async function runBackupLifecycleDrill({
  workspaceDir,
  sourceRevision = process.env.GITHUB_SHA || null,
  workflowEvent = process.env.GITHUB_EVENT_NAME || null
} = {}) {
  const workspace = await prepareDisposableWorkspace(workspaceDir);
  const revision = normalizeRevision(sourceRevision);
  const generatedAt = new Date().toISOString();
  const startedAt = performance.now();
  const dataDir = join(workspace, 'data');
  const secretDir = join(workspace, 'secrets');
  const provisioned = await provisionProduction({ dataDir, secretDir });
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: false });
  const protector = new DataProtector(
    Buffer.from(
      (await readFile(provisioned.data_key_file, 'utf8')).trim(),
      'base64url'
    )
  );
  const dbPath = join(dataDir, 'grid.sqlite');
  const backupIds = [];
  let store;

  try {
    store = new GridStore({ path: dbPath, dataDir, identity, protector });
    store.appendEvents({
      traceId: 'trace_backup_lifecycle_seed',
      actor: 'backup-lifecycle-drill',
      events: [intentEvent(
        'intent_before_backup_lifecycle',
        'before-backup-lifecycle'
      )]
    });
    for (let index = 0; index < 4; index += 1) {
      const backupId = `backup_lifecycle_${index}_${randomUUID()}`;
      backupIds.push(backupId);
      store.appendEvents({
        traceId: `trace_${backupId}_request`,
        actor: 'backup-lifecycle-drill',
        events: [{
          kind: 'backup.requested',
          subject: backupId,
          payload: {
            backup_id: backupId,
            principal: 'backup-lifecycle-drill'
          }
        }]
      });
      await createGridBackup({
        store,
        dataDir,
        identity,
        protector,
        backupId,
        traceId: `trace_${backupId}_complete`
      });
    }
    store.close();
    store = null;

    const policy = {
      format: 'axiom-backup-retention-policy.v1',
      minimum_verified_backups: 2,
      retain_latest: 2,
      retire_after_days: 0
    };
    const plannedAt = performance.now();
    const plan = await planBackupRetention({
      dataDir,
      identity,
      protector,
      policy
    });
    const planningDurationMs = elapsedMilliseconds(plannedAt);
    const verifiedPlan = verifyBackupRetentionPlan({
      plan,
      dataDir,
      identity
    });
    const tamperedPlan = structuredClone(plan);
    tamperedPlan.decision.retired_backup_ids = [];
    const tamperedPlanRejected = await rejectedBy(
      () => verifyBackupRetentionPlan({
        plan: tamperedPlan,
        dataDir,
        identity
      }),
      error => /decision|signature|id/.test(error.message)
    );

    const runtimeLock = await acquireGridRuntimeLock(dataDir);
    let liveApplyRejected;
    try {
      liveApplyRejected = await rejectedBy(
        () => applyBackupRetentionPlan({
          dataDir,
          identity,
          protector,
          plan
        }),
        error => error.code === 'grid_is_running'
      );
    } finally {
      await releaseGridRuntimeLock(runtimeLock);
    }

    const appliedAt = performance.now();
    const receipt = await applyBackupRetentionPlan({
      dataDir,
      identity,
      protector,
      plan
    });
    const applyDurationMs = elapsedMilliseconds(appliedAt);
    const verifiedReceipt = verifyBackupRetentionReceipt({
      receipt,
      dataDir,
      identity
    });
    const repeatedReceipt = await applyBackupRetentionPlan({
      dataDir,
      identity,
      protector,
      plan
    });
    const idempotentApply = (
      repeatedReceipt.receipt_id === receipt.receipt_id
      && repeatedReceipt.plan_digest === receipt.plan_digest
    );

    const retainedBackupId = plan.decision.retained_backup_ids[0];
    const manifestPath = join(
      dataDir,
      'backups',
      retainedBackupId,
      'manifest.json'
    );
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    store = new GridStore({ path: dbPath, dataDir, identity, protector });
    store.appendEvents({
      traceId: 'trace_backup_lifecycle_after_retention',
      actor: 'backup-lifecycle-drill',
      events: [intentEvent(
        'intent_after_backup_retention',
        'after-backup-retention'
      )]
    });
    const replacedStatus = store.getStatus();
    store.close();
    store = null;

    const restoreStartedAt = performance.now();
    const restored = await restoreGridBackup({
      manifestPath,
      dataDir,
      identity,
      protector,
      expectedDatabaseDigest: manifest.database.sha256
    });
    store = new GridStore({ path: dbPath, dataDir, identity, protector });
    const recovery = await recordPendingRecovery({ store, dataDir, identity });
    const chain = store.verifyChain();
    const baselinePreserved = (
      store.getIntent('intent_before_backup_lifecycle').intent_id
      === 'intent_before_backup_lifecycle'
    );
    const postRetentionRecordAbsent = await rejectedBy(
      () => store.getIntent('intent_after_backup_retention'),
      error => error.code === 'intent_not_found'
    );
    const recoveryRecorded = (
      recovery?.backup_id === retainedBackupId
      && store.getBackupRecord(retainedBackupId).status === 'restored'
    );
    const restoreDurationMs = elapsedMilliseconds(restoreStartedAt);
    store.close();
    store = null;

    const activeDirectories = await visibleDirectories(join(dataDir, 'backups'));
    const quarantineDirectories = await visibleDirectories(join(
      dataDir,
      'backups',
      '.retired',
      plan.plan_id
    ));
    const checks = {
      production_credentials_file_backed: Boolean(
        provisioned.data_key_file && provisioned.api_tokens_file
      ),
      all_source_backups_verified: verifiedPlan.inventory.length === 4,
      signed_policy_derived_plan_verified: verifiedPlan.valid === true,
      tampered_plan_rejected: tamperedPlanRejected,
      live_grid_apply_rejected: liveApplyRejected,
      minimum_verified_backups_retained: receipt.retained.count === 2,
      excess_backups_recoverably_quarantined: receipt.retired.count === 2,
      active_inventory_matches_plan: sameMembers(
        activeDirectories,
        plan.decision.retained_backup_ids
      ),
      quarantine_inventory_matches_plan: sameMembers(
        quarantineDirectories,
        plan.decision.retired_backup_ids
      ),
      no_backup_deleted: receipt.checks.no_backup_deleted === true,
      signed_receipt_verified: verifiedReceipt.valid === true,
      apply_is_idempotent: idempotentApply,
      retained_backup_exact_digest_restored: (
        restored.database_digest === manifest.database.sha256
      ),
      restored_evidence_chain_verified: chain.valid === true,
      baseline_record_preserved: baselinePreserved,
      post_retention_record_rewound: postRetentionRecordAbsent,
      recovery_event_recorded: recoveryRecorded
    };
    const failed = Object.entries(checks)
      .filter(([, passed]) => passed !== true)
      .map(([name]) => name);
    if (failed.length > 0) {
      throw new ValidationError(
        `Backup lifecycle drill checks failed: ${failed.join(', ')}`
      );
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
        revision,
        workflow_event: normalizeWorkflowEvent(workflowEvent)
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
      lifecycle: {
        plan_id: plan.plan_id,
        plan_digest: verifiedPlan.plan_digest,
        receipt_id: receipt.receipt_id,
        source_backups: plan.inventory.count,
        retained_backups: receipt.retained.count,
        retired_backups: receipt.retired.count,
        retirement_mode: 'recoverable-quarantine',
        planning_duration_ms: planningDurationMs,
        apply_duration_ms: applyDurationMs
      },
      restore: {
        backup_id: retainedBackupId,
        expected_database_digest: manifest.database.sha256,
        restored_database_digest: restored.database_digest,
        replaced_database_digest: restored.replaced_database_digest,
        source_evidence_events: manifest.database.evidence_events,
        replaced_evidence_events: replacedStatus.last_seq,
        recovery_id: recovery.recovery_id,
        rto_ms: restoreDurationMs,
        rollback_artifact: portableRelative(workspace, restored.rollback_path)
      },
      total_duration_ms: elapsedMilliseconds(startedAt),
      checks
    };
    const evidence = {
      ...unsigned,
      attestation: identity.signObject(unsigned)
    };
    verifyBackupLifecycleEvidence(evidence);
    return evidence;
  } finally {
    if (store) store.close();
  }
}

export function verifyBackupLifecycleEvidence(evidence) {
  if (
    !evidence
    || typeof evidence !== 'object'
    || Array.isArray(evidence)
    || evidence.schema !== EVIDENCE_FORMAT
    || evidence.status !== 'passed'
    || !evidence.checks
    || Object.values(evidence.checks).some(value => value !== true)
  ) {
    throw new ValidationError('Backup lifecycle evidence is invalid or failed');
  }
  if (
    typeof evidence.signer?.public_key_pem !== 'string'
    || evidence.attestation?.key_id !== evidence.signer?.key_id
    || !/^backup_retention_[a-f0-9]{48}$/.test(
      evidence.lifecycle?.plan_id ?? ''
    )
    || !/^[a-f0-9]{64}$/.test(evidence.lifecycle?.plan_digest ?? '')
    || evidence.lifecycle?.source_backups !== 4
    || evidence.lifecycle?.retained_backups !== 2
    || evidence.lifecycle?.retired_backups !== 2
    || evidence.lifecycle?.retirement_mode !== 'recoverable-quarantine'
    || evidence.restore?.expected_database_digest
      !== evidence.restore?.restored_database_digest
  ) {
    throw new ValidationError('Backup lifecycle evidence metadata is invalid');
  }
  const unsigned = structuredClone(evidence);
  delete unsigned.attestation;
  let publicKey;
  try {
    publicKey = createPublicKey(evidence.signer.public_key_pem);
  } catch {
    throw new ValidationError('Backup lifecycle evidence public key is invalid');
  }
  if (!verifyObjectSignature(unsigned, evidence.attestation, publicKey)) {
    throw new ValidationError('Backup lifecycle evidence attestation is invalid');
  }
  return {
    valid: true,
    schema: evidence.schema,
    plan_id: evidence.lifecycle.plan_id,
    receipt_id: evidence.lifecycle.receipt_id,
    restored_backup_id: evidence.restore.backup_id,
    source_revision: evidence.source?.revision
  };
}

function intentEvent(intentId, requestSeed) {
  return {
    kind: 'intent.accepted',
    subject: intentId,
    payload: {
      intent_id: intentId,
      principal: 'backup-lifecycle-drill',
      action: 'system.echo',
      risk: 'low',
      input_digest: sha256('{}'),
      request_digest: sha256(requestSeed)
    }
  };
}

async function prepareDisposableWorkspace(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ValidationError(
      'Backup lifecycle drill requires an explicit disposable workspace'
    );
  }
  const workspace = resolve(value);
  await mkdir(workspace, { recursive: true, mode: 0o700 });
  if ((await readdir(workspace)).length !== 0) {
    throw new ValidationError('Backup lifecycle drill workspace must be empty');
  }
  return workspace;
}

async function visibleDirectories(path) {
  return (await readdir(path, { withFileTypes: true }))
    .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
    .map(entry => entry.name)
    .sort();
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
    throw new ValidationError(
      'Backup lifecycle source revision must be a 40-character SHA'
    );
  }
  return value;
}

function normalizeWorkflowEvent(value) {
  if (value === null || value === undefined || value === '') return null;
  if (
    typeof value !== 'string'
    || !/^[A-Za-z0-9_-]{1,64}$/.test(value)
  ) {
    throw new ValidationError('Backup lifecycle workflow event is invalid');
  }
  return value;
}

function sameMembers(left, right) {
  return (
    left.length === right.length
    && left.every((value, index) => value === [...right].sort()[index])
  );
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
      'Usage: node src/backup-lifecycle-drill.mjs <empty-disposable-workspace>'
    );
  }
  const evidence = await runBackupLifecycleDrill({
    workspaceDir: process.argv[2]
  });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}
