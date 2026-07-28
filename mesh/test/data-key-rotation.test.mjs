import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createGridBackup, recordPendingRecovery, restoreGridBackup } from '../src/grid/backup.mjs';
import { GridStore } from '../src/grid/store.mjs';
import { sha256 } from '../src/lib/canonical.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { DataProtector } from '../src/lib/protector.mjs';
import { provisionProduction } from '../src/provision-production.mjs';
import {
  rollbackDataProtectionKey,
  rotateDataProtectionKey,
  verifyDataKeyRotationManifest
} from '../src/rotate-data-key.mjs';
import {
  rollbackProductionCredentials,
  rotateProductionCredentials
} from '../src/rotate-production.mjs';

test('data-key rotation re-encrypts durable state and supports authenticated rollback', async t => {
  const workspace = await mkdtemp(join(tmpdir(), 'axiom-data-key-rotation-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const provisioned = await provisionProduction({
    dataDir: join(workspace, 'data'),
    secretDir: join(workspace, 'secrets')
  });
  const originalKey = await readDataKey(provisioned.secret_dir);
  const originalProtector = new DataProtector(originalKey);
  const originalIdentity = await ensureMeshIdentity(
    provisioned.data_dir,
    'grid',
    { create: false }
  );
  const dbPath = join(provisioned.data_dir, 'grid.sqlite');
  let store = new GridStore({
    path: dbPath,
    dataDir: provisioned.data_dir,
    identity: originalIdentity,
    protector: originalProtector
  });
  store.appendEvents({
    traceId: 'trace_data_key_seed',
    actor: 'person:test',
    events: [{
      kind: 'intent.accepted',
      subject: 'intent_before_data_key_rotation',
      payload: {
        intent_id: 'intent_before_data_key_rotation',
        principal: 'person:test',
        action: 'system.echo',
        risk: 'low',
        input_digest: sha256('{}'),
        request_digest: sha256('data-key-rotation')
      }
    }]
  });
  const backupId = 'backup_before_data_key_rotation';
  store.appendEvents({
    traceId: 'trace_data_key_backup',
    actor: 'person:test',
    events: [{
      kind: 'backup.requested',
      subject: backupId,
      payload: {
        backup_id: backupId,
        principal: 'person:test'
      }
    }]
  });
  const backupManifest = await createGridBackup({
    store,
    dataDir: provisioned.data_dir,
    identity: originalIdentity,
    protector: originalProtector,
    backupId,
    traceId: 'trace_data_key_backup_complete'
  });
  store.close();

  const credentialRotation = await rotateProductionCredentials({
    dataDir: provisioned.data_dir,
    secretDir: provisioned.secret_dir
  });
  const rotatedIdentity = await ensureMeshIdentity(
    provisioned.data_dir,
    'grid',
    { create: false }
  );
  const rotation = await rotateDataProtectionKey({
    dataDir: provisioned.data_dir,
    secretDir: provisioned.secret_dir,
    rotationId: 'data_key_test_rotation'
  });
  const rotatedKey = await readDataKey(provisioned.secret_dir);
  assert.equal(rotatedKey.equals(originalKey), false);
  assert.ok(rotation.protected_values > 0);
  assert.equal(rotation.protected_artifacts, 2);

  const manifest = JSON.parse(await readFile(rotation.manifest_path, 'utf8'));
  assert.equal(verifyDataKeyRotationManifest({ manifest }).valid, true);
  const tamperedManifest = structuredClone(manifest);
  tamperedManifest.database.evidence_events += 1;
  assert.throws(
    () => verifyDataKeyRotationManifest({ manifest: tamperedManifest }),
    /attestation/
  );
  const rotatedProtector = new DataProtector(rotatedKey);
  assert.throws(
    () => new GridStore({
      path: dbPath,
      dataDir: provisioned.data_dir,
      identity: rotatedIdentity,
      protector: originalProtector
    }),
    /authentication failed|startup verification/
  );
  store = new GridStore({
    path: dbPath,
    dataDir: provisioned.data_dir,
    identity: rotatedIdentity,
    protector: rotatedProtector
  });
  assert.equal(
    store.getIntent('intent_before_data_key_rotation').action,
    'system.echo'
  );
  assert.equal(store.verifyChain().valid, true);
  store.close();

  const restored = await restoreGridBackup({
    manifestPath: join(
      provisioned.data_dir,
      'backups',
      backupId,
      'manifest.json'
    ),
    dataDir: provisioned.data_dir,
    identity: rotatedIdentity,
    protector: rotatedProtector,
    expectedDatabaseDigest: backupManifest.database.sha256
  });
  assert.equal(restored.restored, true);
  store = new GridStore({
    path: dbPath,
    dataDir: provisioned.data_dir,
    identity: rotatedIdentity,
    protector: rotatedProtector
  });
  assert.equal(
    (await recordPendingRecovery({
      store,
      dataDir: provisioned.data_dir,
      identity: rotatedIdentity
    })).backup_id,
    backupId
  );
  store.close();

  const credentialRollback = await rollbackProductionCredentials({
    manifestPath: credentialRotation.manifest_path,
    dataDir: provisioned.data_dir,
    secretDir: provisioned.secret_dir
  });
  assert.equal(credentialRollback.rolled_back, true);
  const restoredIdentity = await ensureMeshIdentity(
    provisioned.data_dir,
    'grid',
    { create: false }
  );
  assert.equal(restoredIdentity.keyId, originalIdentity.keyId);
  store = new GridStore({
    path: dbPath,
    dataDir: provisioned.data_dir,
    identity: restoredIdentity,
    protector: rotatedProtector
  });
  store.appendEvents({
    traceId: 'trace_after_data_key_rotation',
    actor: 'person:test',
    events: [{
      kind: 'intent.accepted',
      subject: 'intent_after_data_key_rotation',
      payload: {
        intent_id: 'intent_after_data_key_rotation',
        principal: 'person:test',
        action: 'system.echo',
        risk: 'low',
        input_digest: sha256('{"after":true}'),
        request_digest: sha256('data-key-post-state')
      }
    }]
  });
  const beforeRollback = store.getStatus();
  store.close();

  const rollback = await rollbackDataProtectionKey({
    manifestPath: rotation.manifest_path,
    dataDir: provisioned.data_dir,
    secretDir: provisioned.secret_dir
  });
  assert.equal(rollback.rolled_back, true);
  assert.equal(rollback.preserves_post_rotation_grid_state, true);
  assert.equal(rollback.recovery_databases, 1);
  assert.ok(rollback.protected_artifacts > rotation.protected_artifacts);
  assert.equal((await readDataKey(provisioned.secret_dir)).equals(originalKey), true);

  store = new GridStore({
    path: dbPath,
    dataDir: provisioned.data_dir,
    identity: restoredIdentity,
    protector: originalProtector
  });
  assert.equal(
    store.getIntent('intent_after_data_key_rotation').action,
    'system.echo'
  );
  assert.deepEqual(store.getStatus(), beforeRollback);
  assert.equal(store.verifyChain().valid, true);
  store.close();
  assert.throws(
    () => new GridStore({
      path: dbPath,
      dataDir: provisioned.data_dir,
      identity: restoredIdentity,
      protector: rotatedProtector
    }),
    /authentication failed|startup verification/
  );
  const recoveryCopyPath = join(restored.rollback_path, 'grid.sqlite');
  const recoveryCopy = new GridStore({
    path: recoveryCopyPath,
    dataDir: provisioned.data_dir,
    identity: restoredIdentity,
    protector: originalProtector
  });
  assert.equal(recoveryCopy.verifyChain().valid, true);
  recoveryCopy.close();
  assert.throws(
    () => new GridStore({
      path: recoveryCopyPath,
      dataDir: provisioned.data_dir,
      identity: restoredIdentity,
      protector: rotatedProtector
    }),
    /authentication failed|startup verification/
  );

  const serializedEvidence = JSON.stringify({
    manifest,
    rollback
  });
  assert.equal(serializedEvidence.includes(originalKey.toString('base64url')), false);
  assert.equal(serializedEvidence.includes(rotatedKey.toString('base64url')), false);
});

async function readDataKey(secretDir) {
  return Buffer.from(
    (await readFile(join(secretDir, 'data-protection.key'), 'utf8')).trim(),
    'base64url'
  );
}

test('data-key rollback recovers a killed multi-file cutover journal', async t => {
  const workspace = await mkdtemp(join(tmpdir(), 'axiom-data-key-crash-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const provisioned = await provisionProduction({
    dataDir: join(workspace, 'data'),
    secretDir: join(workspace, 'secrets')
  });
  const originalKey = await readDataKey(provisioned.secret_dir);
  const identity = await ensureMeshIdentity(
    provisioned.data_dir,
    'grid',
    { create: false }
  );
  const dbPath = join(provisioned.data_dir, 'grid.sqlite');
  const store = new GridStore({
    path: dbPath,
    dataDir: provisioned.data_dir,
    identity,
    protector: new DataProtector(originalKey)
  });
  store.appendEvents({
    traceId: 'trace_before_simulated_crash',
    actor: 'person:test',
    events: [{
      kind: 'intent.accepted',
      subject: 'intent_before_simulated_crash',
      payload: {
        intent_id: 'intent_before_simulated_crash',
        principal: 'person:test',
        action: 'system.echo',
        risk: 'low',
        input_digest: sha256('{}'),
        request_digest: sha256('simulated-crash')
      }
    }]
  });
  const before = store.getStatus();
  store.close();

  const child = spawn(
    process.execPath,
    [
      'src/rotate-data-key.mjs',
      'rotate',
      provisioned.data_dir,
      provisioned.secret_dir
    ],
    {
      cwd: new URL('..', import.meta.url),
      env: {
        ...process.env,
        NODE_ENV: 'test',
        AXIOM_TEST_DATA_KEY_CRASH_AFTER_TARGET: '1'
      },
      stdio: 'ignore'
    }
  );
  const [code, signal] = await once(child, 'exit');
  assert.ok(code !== 0 || signal !== null);
  const [rotationId] = await readdir(
    join(provisioned.data_dir, 'data-key-rotations')
  );
  const manifestPath = join(
    provisioned.data_dir,
    'data-key-rotations',
    rotationId,
    'manifest.json'
  );
  const rollback = await rollbackDataProtectionKey({
    manifestPath,
    dataDir: provisioned.data_dir,
    secretDir: provisioned.secret_dir
  });

  assert.equal(rollback.rolled_back, true);
  assert.equal(rollback.rotation_applied, false);
  assert.equal(rollback.interrupted_rotation_recovered, true);
  assert.equal(rollback.transaction_journal_recovered, true);
  assert.equal(rollback.stale_runtime_lock_recovered, true);
  assert.equal((await readDataKey(provisioned.secret_dir)).equals(originalKey), true);
  const restored = new GridStore({
    path: dbPath,
    dataDir: provisioned.data_dir,
    identity,
    protector: new DataProtector(originalKey)
  });
  assert.deepEqual(restored.getStatus(), before);
  assert.equal(restored.verifyChain().valid, true);
  restored.close();
});

test('credential rollback remains verifiable when the data key is rolled back first', async t => {
  const workspace = await mkdtemp(join(tmpdir(), 'axiom-key-ordering-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const provisioned = await provisionProduction({
    dataDir: join(workspace, 'data'),
    secretDir: join(workspace, 'secrets')
  });
  const originalIdentity = await ensureMeshIdentity(
    provisioned.data_dir,
    'grid',
    { create: false }
  );
  const originalKey = await readDataKey(provisioned.secret_dir);
  const store = new GridStore({
    path: join(provisioned.data_dir, 'grid.sqlite'),
    dataDir: provisioned.data_dir,
    identity: originalIdentity,
    protector: new DataProtector(originalKey)
  });
  store.appendEvents({
    traceId: 'trace_key_ordering',
    actor: 'person:test',
    events: [{
      kind: 'intent.accepted',
      subject: 'intent_key_ordering',
      payload: {
        intent_id: 'intent_key_ordering',
        principal: 'person:test',
        action: 'system.echo',
        risk: 'low',
        input_digest: sha256('{}'),
        request_digest: sha256('key-ordering')
      }
    }]
  });
  const backupId = 'backup_key_chain';
  store.appendEvents({
    traceId: 'trace_key_chain_backup',
    actor: 'person:test',
    events: [{
      kind: 'backup.requested',
      subject: backupId,
      payload: {
        backup_id: backupId,
        principal: 'person:test'
      }
    }]
  });
  const backupManifest = await createGridBackup({
    store,
    dataDir: provisioned.data_dir,
    identity: originalIdentity,
    protector: new DataProtector(originalKey),
    backupId,
    traceId: 'trace_key_chain_backup_complete'
  });
  store.close();

  const dataRotation = await rotateDataProtectionKey({
    dataDir: provisioned.data_dir,
    secretDir: provisioned.secret_dir
  });
  const credentialRotation = await rotateProductionCredentials({
    dataDir: provisioned.data_dir,
    secretDir: provisioned.secret_dir
  });
  assert.notEqual(
    (await ensureMeshIdentity(
      provisioned.data_dir,
      'grid',
      { create: false }
    )).keyId,
    originalIdentity.keyId
  );

  const dataRollback = await rollbackDataProtectionKey({
    manifestPath: dataRotation.manifest_path,
    dataDir: provisioned.data_dir,
    secretDir: provisioned.secret_dir
  });
  assert.equal(dataRollback.rolled_back, true);
  const credentialRollback = await rollbackProductionCredentials({
    manifestPath: credentialRotation.manifest_path,
    dataDir: provisioned.data_dir,
    secretDir: provisioned.secret_dir
  });

  assert.equal(credentialRollback.rolled_back, true);
  assert.equal(
    (await ensureMeshIdentity(
      provisioned.data_dir,
      'grid',
      { create: false }
    )).keyId,
    originalIdentity.keyId
  );
  assert.equal((await readDataKey(provisioned.secret_dir)).equals(originalKey), true);
  const restoredBackup = await restoreGridBackup({
    manifestPath: join(
      provisioned.data_dir,
      'backups',
      backupId,
      'manifest.json'
    ),
    dataDir: provisioned.data_dir,
    identity: originalIdentity,
    protector: new DataProtector(originalKey),
    expectedDatabaseDigest: backupManifest.database.sha256
  });
  assert.equal(restoredBackup.restored, true);
});

test('a killed data-key rollback journal is unwound and retried safely', async t => {
  const workspace = await mkdtemp(join(tmpdir(), 'axiom-key-rollback-crash-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const provisioned = await provisionProduction({
    dataDir: join(workspace, 'data'),
    secretDir: join(workspace, 'secrets')
  });
  const originalKey = await readDataKey(provisioned.secret_dir);
  const identity = await ensureMeshIdentity(
    provisioned.data_dir,
    'grid',
    { create: false }
  );
  const store = new GridStore({
    path: join(provisioned.data_dir, 'grid.sqlite'),
    dataDir: provisioned.data_dir,
    identity,
    protector: new DataProtector(originalKey)
  });
  store.appendEvents({
    traceId: 'trace_rollback_crash',
    actor: 'person:test',
    events: [{
      kind: 'intent.accepted',
      subject: 'intent_rollback_crash',
      payload: {
        intent_id: 'intent_rollback_crash',
        principal: 'person:test',
        action: 'system.echo',
        risk: 'low',
        input_digest: sha256('{}'),
        request_digest: sha256('rollback-crash')
      }
    }]
  });
  store.close();
  const rotation = await rotateDataProtectionKey({
    dataDir: provisioned.data_dir,
    secretDir: provisioned.secret_dir
  });

  const child = spawn(
    process.execPath,
    [
      'src/rotate-data-key.mjs',
      'rollback',
      rotation.manifest_path,
      provisioned.data_dir,
      provisioned.secret_dir
    ],
    {
      cwd: new URL('..', import.meta.url),
      env: {
        ...process.env,
        NODE_ENV: 'test',
        AXIOM_TEST_DATA_KEY_CRASH_AFTER_TARGET: '1'
      },
      stdio: 'ignore'
    }
  );
  const [code, signal] = await once(child, 'exit');
  assert.ok(code !== 0 || signal !== null);

  const rollback = await rollbackDataProtectionKey({
    manifestPath: rotation.manifest_path,
    dataDir: provisioned.data_dir,
    secretDir: provisioned.secret_dir
  });
  assert.equal(rollback.rolled_back, true);
  assert.equal(rollback.rotation_applied, true);
  assert.equal(rollback.interrupted_rotation_recovered, true);
  assert.equal(rollback.transaction_journal_recovered, true);
  assert.equal(rollback.stale_runtime_lock_recovered, true);
  assert.equal((await readDataKey(provisioned.secret_dir)).equals(originalKey), true);
  const restored = new GridStore({
    path: join(provisioned.data_dir, 'grid.sqlite'),
    dataDir: provisioned.data_dir,
    identity,
    protector: new DataProtector(originalKey)
  });
  assert.equal(restored.verifyChain().valid, true);
  restored.close();
});

test('a fully installed rollback is finalized after interruption', async t => {
  const workspace = await mkdtemp(join(tmpdir(), 'axiom-key-finalize-crash-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const provisioned = await provisionProduction({
    dataDir: join(workspace, 'data'),
    secretDir: join(workspace, 'secrets')
  });
  const originalKey = await readDataKey(provisioned.secret_dir);
  const identity = await ensureMeshIdentity(
    provisioned.data_dir,
    'grid',
    { create: false }
  );
  const store = new GridStore({
    path: join(provisioned.data_dir, 'grid.sqlite'),
    dataDir: provisioned.data_dir,
    identity,
    protector: new DataProtector(originalKey)
  });
  store.appendEvents({
    traceId: 'trace_finalize_crash',
    actor: 'person:test',
    events: [{
      kind: 'intent.accepted',
      subject: 'intent_finalize_crash',
      payload: {
        intent_id: 'intent_finalize_crash',
        principal: 'person:test',
        action: 'system.echo',
        risk: 'low',
        input_digest: sha256('{}'),
        request_digest: sha256('finalize-crash')
      }
    }]
  });
  store.close();
  const rotation = await rotateDataProtectionKey({
    dataDir: provisioned.data_dir,
    secretDir: provisioned.secret_dir
  });
  const child = spawn(
    process.execPath,
    [
      'src/rotate-data-key.mjs',
      'rollback',
      rotation.manifest_path,
      provisioned.data_dir,
      provisioned.secret_dir
    ],
    {
      cwd: new URL('..', import.meta.url),
      env: {
        ...process.env,
        NODE_ENV: 'test',
        AXIOM_TEST_DATA_KEY_CRASH_AFTER_ROLLBACK_TRANSACTION: '1'
      },
      stdio: 'ignore'
    }
  );
  const [code, signal] = await once(child, 'exit');
  assert.ok(code !== 0 || signal !== null);

  const rollback = await rollbackDataProtectionKey({
    manifestPath: rotation.manifest_path,
    dataDir: provisioned.data_dir,
    secretDir: provisioned.secret_dir
  });
  assert.equal(rollback.rolled_back, true);
  assert.equal(rollback.rotation_applied, true);
  assert.equal(rollback.interrupted_rotation_recovered, true);
  assert.equal(rollback.completed_rollback_finalized, true);
  assert.equal(rollback.stale_runtime_lock_recovered, true);
  assert.equal((await readDataKey(provisioned.secret_dir)).equals(originalKey), true);
  const result = JSON.parse(
    await readFile(
      join(
        provisioned.data_dir,
        'data-key-rotations',
        rotation.rotation_id,
        'rollback-result.json'
      ),
      'utf8'
    )
  );
  assert.equal(result.completed_rollback_finalized, true);
  assert.equal(
    result.credential_state_authentication_key.name,
    'credential-state-key.axk'
  );
});

test('retired credential authentication remains transitive across chained key rollbacks', async t => {
  const workspace = await mkdtemp(join(tmpdir(), 'axiom-key-chain-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const provisioned = await provisionProduction({
    dataDir: join(workspace, 'data'),
    secretDir: join(workspace, 'secrets')
  });
  const originalIdentity = await ensureMeshIdentity(
    provisioned.data_dir,
    'grid',
    { create: false }
  );
  const originalKey = await readDataKey(provisioned.secret_dir);
  const store = new GridStore({
    path: join(provisioned.data_dir, 'grid.sqlite'),
    dataDir: provisioned.data_dir,
    identity: originalIdentity,
    protector: new DataProtector(originalKey)
  });
  store.appendEvents({
    traceId: 'trace_key_chain',
    actor: 'person:test',
    events: [{
      kind: 'intent.accepted',
      subject: 'intent_key_chain',
      payload: {
        intent_id: 'intent_key_chain',
        principal: 'person:test',
        action: 'system.echo',
        risk: 'low',
        input_digest: sha256('{}'),
        request_digest: sha256('key-chain')
      }
    }]
  });
  const chainBackupId = 'backup_chained_data_keys';
  store.appendEvents({
    traceId: 'trace_chained_data_key_backup',
    actor: 'person:test',
    events: [{
      kind: 'backup.requested',
      subject: chainBackupId,
      payload: {
        backup_id: chainBackupId,
        principal: 'person:test'
      }
    }]
  });
  const chainBackupManifest = await createGridBackup({
    store,
    dataDir: provisioned.data_dir,
    identity: originalIdentity,
    protector: new DataProtector(originalKey),
    backupId: chainBackupId,
    traceId: 'trace_chained_data_key_backup_complete'
  });
  store.close();
  const first = await rotateDataProtectionKey({
    dataDir: provisioned.data_dir,
    secretDir: provisioned.secret_dir
  });
  const second = await rotateDataProtectionKey({
    dataDir: provisioned.data_dir,
    secretDir: provisioned.secret_dir
  });
  const credentials = await rotateProductionCredentials({
    dataDir: provisioned.data_dir,
    secretDir: provisioned.secret_dir
  });
  await rollbackDataProtectionKey({
    manifestPath: second.manifest_path,
    dataDir: provisioned.data_dir,
    secretDir: provisioned.secret_dir
  });
  await rollbackDataProtectionKey({
    manifestPath: first.manifest_path,
    dataDir: provisioned.data_dir,
    secretDir: provisioned.secret_dir
  });
  const credentialRollback = await rollbackProductionCredentials({
    manifestPath: credentials.manifest_path,
    dataDir: provisioned.data_dir,
    secretDir: provisioned.secret_dir
  });

  assert.equal(credentialRollback.rolled_back, true);
  assert.equal(
    (await ensureMeshIdentity(
      provisioned.data_dir,
      'grid',
      { create: false }
    )).keyId,
    originalIdentity.keyId
  );
  assert.equal((await readDataKey(provisioned.secret_dir)).equals(originalKey), true);
  const restoredBackup = await restoreGridBackup({
    manifestPath: join(
      provisioned.data_dir,
      'backups',
      chainBackupId,
      'manifest.json'
    ),
    dataDir: provisioned.data_dir,
    identity: originalIdentity,
    protector: new DataProtector(originalKey),
    expectedDatabaseDigest: chainBackupManifest.database.sha256
  });
  assert.equal(restoredBackup.restored, true);
});
