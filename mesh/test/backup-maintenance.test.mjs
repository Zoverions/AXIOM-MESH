import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  applyBackupRetentionPlan,
  planBackupRetention,
  recoverPendingBackupRetention,
  verifyBackupRetentionPlan,
  verifyBackupRetentionReceipt
} from '../src/backup-maintenance.mjs';
import {
  acquireGridRuntimeLock,
  createGridBackup,
  releaseGridRuntimeLock
} from '../src/grid/backup.mjs';
import { GridStore } from '../src/grid/store.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { DataProtector } from '../src/lib/protector.mjs';
import { provisionProduction } from '../src/provision-production.mjs';
import {
  rollbackDataProtectionKey,
  rotateDataProtectionKey
} from '../src/rotate-data-key.mjs';

const immediatePolicy = {
  format: 'axiom-backup-retention-policy.v1',
  minimum_verified_backups: 2,
  retain_latest: 2,
  retire_after_days: 0
};

test('signed retention plans fail closed and retire only verified excess backups', async t => {
  const fixture = await backupFixture(t, 4);
  const plan = await planBackupRetention({
    ...fixture,
    policy: immediatePolicy
  });
  assert.equal(plan.decision.retained_count, 2);
  assert.equal(plan.decision.retired_count, 2);
  assert.equal(verifyBackupRetentionPlan({
    plan,
    dataDir: fixture.dataDir,
    identity: fixture.identity
  }).valid, true);

  const tamperedPlan = structuredClone(plan);
  tamperedPlan.policy.retain_latest = 3;
  assert.throws(
    () => verifyBackupRetentionPlan({
      plan: tamperedPlan,
      dataDir: fixture.dataDir,
      identity: fixture.identity
    }),
    /decision|signature|id/
  );

  const lock = await acquireGridRuntimeLock(fixture.dataDir);
  try {
    await assert.rejects(
      () => applyBackupRetentionPlan({
        ...fixture,
        plan
      }),
      error => error.code === 'grid_is_running'
    );
  } finally {
    await releaseGridRuntimeLock(lock);
  }

  await addBackup(fixture, 'backup_retention_inventory_drift');
  await assert.rejects(
    () => applyBackupRetentionPlan({
      ...fixture,
      plan
    }),
    /inventory changed/
  );

  const currentPlan = await planBackupRetention({
    ...fixture,
    policy: immediatePolicy
  });
  const receipt = await applyBackupRetentionPlan({
    ...fixture,
    plan: currentPlan
  });
  assert.equal(receipt.retained.count, 2);
  assert.equal(receipt.retired.count, 3);
  assert.equal(receipt.checks.no_backup_deleted, true);
  assert.equal(verifyBackupRetentionReceipt({
    receipt,
    dataDir: fixture.dataDir,
    identity: fixture.identity
  }).valid, true);

  const active = (await readdir(join(fixture.dataDir, 'backups'), {
    withFileTypes: true
  }))
    .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
    .map(entry => entry.name)
    .sort();
  assert.deepEqual(
    active,
    [...currentPlan.decision.retained_backup_ids].sort()
  );
  const quarantined = (await readdir(join(
    fixture.dataDir,
    'backups',
    '.retired',
    currentPlan.plan_id
  ), { withFileTypes: true }))
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();
  assert.deepEqual(
    quarantined,
    [...currentPlan.decision.retired_backup_ids].sort()
  );

  const repeated = await applyBackupRetentionPlan({
    ...fixture,
    plan: currentPlan
  });
  assert.deepEqual(repeated, receipt);
});

test('retention planning rejects a corrupt encrypted backup before selection', async t => {
  const fixture = await backupFixture(t, 2);
  const target = join(
    fixture.dataDir,
    'backups',
    fixture.backupIds[0],
    'snapshot.axb'
  );
  const snapshot = await readFile(target);
  snapshot[snapshot.length - 2] ^= 1;
  await writeFile(target, snapshot);
  await assert.rejects(
    () => planBackupRetention({
      ...fixture,
      policy: immediatePolicy
    }),
    /digest|authentication|metadata/
  );
});

test('a killed retention move resumes from its signed journal', async t => {
  const fixture = await backupFixture(t, 4);
  const plan = await planBackupRetention({
    ...fixture,
    policy: immediatePolicy
  });
  const planPath = join(fixture.root, 'retention-plan.json');
  await writeFile(planPath, `${JSON.stringify(plan)}\n`, { mode: 0o600 });
  const script = new URL('../src/backup-maintenance.mjs', import.meta.url);
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(script),
      'apply',
      fixture.dataDir,
      fixture.dataKeyFile,
      planPath
    ],
    {
      env: {
        ...process.env,
        NODE_ENV: 'test',
        AXIOM_TEST_BACKUP_RETENTION_CRASH_AFTER_MOVE: '1'
      },
      stdio: 'ignore'
    }
  );
  const [code, signal] = await once(child, 'exit');
  assert.ok(signal || code !== 0);

  const receipt = await recoverPendingBackupRetention(fixture);
  assert.equal(receipt.plan_id, plan.plan_id);
  assert.equal(receipt.retained.count, 2);
  assert.equal(receipt.retired.count, 2);
  assert.equal(receipt.checks.retired_backups_verified_in_quarantine, true);
  assert.equal(
    await recoverPendingBackupRetention(fixture),
    null
  );
});

test('data-key rotation includes active and quarantined backup media', async t => {
  const fixture = await backupFixture(t, 4);
  const plan = await planBackupRetention({
    ...fixture,
    policy: immediatePolicy
  });
  await applyBackupRetentionPlan({
    ...fixture,
    plan
  });
  const rotation = await rotateDataProtectionKey({
    dataDir: fixture.dataDir,
    secretDir: fixture.secretDir,
    rotationId: 'retained_backup_media_rotation'
  });
  assert.equal(rotation.protected_artifacts, 4);
  const rollback = await rollbackDataProtectionKey({
    manifestPath: rotation.manifest_path,
    dataDir: fixture.dataDir,
    secretDir: fixture.secretDir
  });
  assert.equal(rollback.protected_artifacts, 4);
  assert.equal(rollback.preserves_post_rotation_grid_state, true);
});

test('retention may relocate rewrapped media before data-key rollback', async t => {
  const fixture = await backupFixture(t, 4);
  const rotation = await rotateDataProtectionKey({
    dataDir: fixture.dataDir,
    secretDir: fixture.secretDir,
    rotationId: 'backup_media_before_retention'
  });
  fixture.protector = new DataProtector(
    Buffer.from(
      (await readFile(fixture.dataKeyFile, 'utf8')).trim(),
      'base64url'
    )
  );
  const plan = await planBackupRetention({
    ...fixture,
    policy: immediatePolicy
  });
  await applyBackupRetentionPlan({
    ...fixture,
    plan
  });
  const rollback = await rollbackDataProtectionKey({
    manifestPath: rotation.manifest_path,
    dataDir: fixture.dataDir,
    secretDir: fixture.secretDir
  });
  assert.equal(rollback.protected_artifacts, 4);
  assert.equal(rollback.preserves_post_rotation_grid_state, true);
});

async function backupFixture(t, count) {
  const root = await mkdtemp(join(tmpdir(), 'axiom-backup-maintenance-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dataDir = join(root, 'data');
  const secretDir = join(root, 'secrets');
  const provisioned = await provisionProduction({ dataDir, secretDir });
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: false });
  const protector = new DataProtector(
    Buffer.from(
      (await readFile(provisioned.data_key_file, 'utf8')).trim(),
      'base64url'
    )
  );
  const fixture = {
    root,
    dataDir,
    secretDir,
    identity,
    protector,
    dataKeyFile: provisioned.data_key_file,
    backupIds: []
  };
  for (let index = 0; index < count; index += 1) {
    const backupId = `backup_retention_${String(index).padStart(3, '0')}`;
    await addBackup(fixture, backupId);
    fixture.backupIds.push(backupId);
  }
  return fixture;
}

async function addBackup(fixture, backupId) {
  const store = new GridStore({
    path: join(fixture.dataDir, 'grid.sqlite'),
    dataDir: fixture.dataDir,
    identity: fixture.identity,
    protector: fixture.protector
  });
  try {
    store.appendEvents({
      traceId: `trace_${backupId}`,
      actor: 'backup-maintenance-test',
      events: [{
        kind: 'backup.requested',
        subject: backupId,
        payload: {
          backup_id: backupId,
          principal: 'backup-maintenance-test'
        }
      }]
    });
    await createGridBackup({
      store,
      dataDir: fixture.dataDir,
      identity: fixture.identity,
      protector: fixture.protector,
      backupId,
      traceId: `trace_${backupId}_complete`
    });
  } finally {
    store.close();
  }
}
