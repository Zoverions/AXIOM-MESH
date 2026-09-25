import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { planBackupRetention } from '../src/backup-maintenance.mjs';
import {
  STREAMING_BACKUP_FORMAT,
  createGridBackup,
  restoreGridBackup,
  verifyGridBackupArtifact
} from '../src/grid/backup.mjs';
import { GridStore } from '../src/grid/store.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { DataProtector } from '../src/lib/protector.mjs';
import { provisionProduction } from '../src/provision-production.mjs';
import { rollbackDataProtectionKey, rotateDataProtectionKey } from '../src/rotate-data-key.mjs';

// Streaming backups (scalability audit S-13): the snapshot is sealed,
// verified and restored chunk by chunk; the chunk format's own tests bound
// the memory and cover every tampering case.

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'axiom-streaming-backup-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dataDir = join(root, 'data');
  const secretDir = join(root, 'secrets');
  const provisioned = await provisionProduction({ dataDir, secretDir });
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: false });
  const protector = new DataProtector(Buffer.from((await readFile(provisioned.data_key_file, 'utf8')).trim(), 'base64url'));
  return { root, dataDir, secretDir, identity, protector, dataKeyFile: provisioned.data_key_file };
}

async function backup(f, backupId, format, extraEvents = 0) {
  const store = new GridStore({ path: join(f.dataDir, 'grid.sqlite'), dataDir: f.dataDir, identity: f.identity, protector: f.protector });
  try {
    for (let index = 0; index < extraEvents; index += 1) {
      store.appendEvents({
        traceId: `trace_${backupId}_${index}`,
        actor: 'streaming-backup-test',
        events: [{ kind: 'system.echoed', subject: `echo_${index}`, payload: { n: index, padding: 'x'.repeat(2_000) } }]
      });
    }
    store.appendEvents({
      traceId: `trace_${backupId}`,
      actor: 'streaming-backup-test',
      events: [{ kind: 'backup.requested', subject: backupId, payload: { backup_id: backupId, principal: 'streaming-backup-test' } }]
    });
    const manifest = await createGridBackup({
      store, dataDir: f.dataDir, identity: f.identity, protector: f.protector,
      backupId, traceId: `trace_${backupId}_complete`, format
    });
    return { manifest, events: store.getStatus().last_seq };
  } finally {
    store.close();
  }
}

const fileDigest = async path => createHash('sha256').update(await readFile(path)).digest('hex');

test('a streaming backup is chunked, signed, verified and restored byte-exactly', async t => {
  const f = await fixture(t);
  const { manifest } = await backup(f, 'backup_stream_001', STREAMING_BACKUP_FORMAT, 400);
  assert.equal(manifest.format, STREAMING_BACKUP_FORMAT);
  assert.equal(manifest.snapshot.name, 'snapshot.axc');
  assert.equal(manifest.snapshot.chunked.format, 'axiom-chunked-artifact.v1');
  assert.ok(manifest.snapshot.chunked.chunks >= 1);
  const directory = join(f.dataDir, 'backups', 'backup_stream_001');
  await assert.rejects(stat(join(directory, 'snapshot.axb')), { code: 'ENOENT' });

  const manifestPath = join(directory, 'manifest.json');
  const verified = await verifyGridBackupArtifact({ manifestPath, dataDir: f.dataDir, identity: f.identity, protector: f.protector });
  assert.equal(verified.valid, true);
  assert.equal(verified.database_digest, manifest.database.sha256);
  assert.equal(verified.evidence_chain.head, manifest.database.evidence_head);
  assert.equal('database_path' in verified, false, 'the candidate is removed unless kept');

  // Diverge the live database, then restore.
  await backup(f, 'backup_stream_002', STREAMING_BACKUP_FORMAT, 3);
  const restored = await restoreGridBackup({
    manifestPath, dataDir: f.dataDir, identity: f.identity, protector: f.protector,
    expectedDatabaseDigest: manifest.database.sha256
  });
  assert.equal(restored.restored, true);
  assert.equal(await fileDigest(join(f.dataDir, 'grid.sqlite')), manifest.database.sha256);
  const store = new GridStore({ path: join(f.dataDir, 'grid.sqlite'), dataDir: f.dataDir, identity: f.identity, protector: f.protector });
  try {
    const chain = store.verifyChain();
    assert.equal(chain.valid, true);
    assert.equal(chain.head, manifest.database.evidence_head);
  } finally {
    store.close();
  }
});

test('a tampered streaming backup fails before anything is restored', async t => {
  const f = await fixture(t);
  const { manifest } = await backup(f, 'backup_stream_bad', STREAMING_BACKUP_FORMAT, 50);
  const directory = join(f.dataDir, 'backups', 'backup_stream_bad');
  const manifestPath = join(directory, 'manifest.json');
  const snapshotPath = join(directory, 'snapshot.axc');
  const original = await readFile(snapshotPath);
  const originalManifest = await readFile(manifestPath, 'utf8');
  await backup(f, 'backup_stream_later', STREAMING_BACKUP_FORMAT, 2);
  const liveDigest = await fileDigest(join(f.dataDir, 'grid.sqlite'));
  const restore = expected => restoreGridBackup({
    manifestPath, dataDir: f.dataDir, identity: f.identity, protector: f.protector,
    expectedDatabaseDigest: expected ?? manifest.database.sha256
  });

  // The whole snapshot is checked against its signed digest before any
  // chunk is decrypted; chunk-level tampering is covered in the format's
  // own tests.
  const flipped = Buffer.from(original);
  flipped[flipped.length - 40] ^= 1;
  await writeFile(snapshotPath, flipped);
  await assert.rejects(restore(), /no longer matches its signed source metadata/);
  await writeFile(snapshotPath, original.subarray(0, original.length - 20));
  await assert.rejects(restore(), /no longer matches its signed source metadata/);
  await writeFile(snapshotPath, original);

  const forged = JSON.parse(originalManifest);
  forged.snapshot.chunked.chunk_bytes = 2048;
  await writeFile(manifestPath, JSON.stringify(forged));
  await assert.rejects(restore(), /attestation is invalid/);
  await writeFile(manifestPath, originalManifest);

  await assert.rejects(restore('0'.repeat(64)), /exact expected database digest/);
  assert.equal(await fileDigest(join(f.dataDir, 'grid.sqlite')), liveDigest, 'the live database is untouched');

  // Untampered, it still restores.
  assert.equal((await restore()).restored, true);
});

test('retention plans cover v1 and streaming backups side by side', async t => {
  const f = await fixture(t);
  await backup(f, 'backup_mixed_001', 'axiom-grid-backup.v1');
  await backup(f, 'backup_mixed_002', STREAMING_BACKUP_FORMAT);
  await backup(f, 'backup_mixed_003', 'axiom-grid-backup.v1');
  const plan = await planBackupRetention({
    dataDir: f.dataDir, identity: f.identity, protector: f.protector,
    policy: { format: 'axiom-backup-retention-policy.v1', minimum_verified_backups: 2, retain_latest: 3, retire_after_days: 0 }
  });
  assert.equal(plan.decision.retained_count, 3);
  const streaming = plan.inventory.backups.find(item => item.backup_id === 'backup_mixed_002');
  assert.equal(streaming.snapshot_relative_path, 'backups/backup_mixed_002/snapshot.axc');
});

test('data-key rotation and rollback rewrap streaming backups chunk by chunk', async t => {
  const f = await fixture(t);
  await backup(f, 'backup_rotate_v1', 'axiom-grid-backup.v1', 20);
  const { manifest } = await backup(f, 'backup_rotate_v2', STREAMING_BACKUP_FORMAT, 200);
  const directory = join(f.dataDir, 'backups', 'backup_rotate_v2');
  const manifestPath = join(directory, 'manifest.json');
  const snapshotPath = join(directory, 'snapshot.axc');
  const before = await fileDigest(snapshotPath);

  const rotation = await rotateDataProtectionKey({ dataDir: f.dataDir, secretDir: f.secretDir, rotationId: 'streaming_backup_rotation' });
  assert.equal(rotation.protected_artifacts, 2);
  const rotationManifest = JSON.parse(await readFile(rotation.manifest_path, 'utf8'));
  const rotated = rotationManifest.artifacts.find(item => item.logical_path === 'backups/backup_rotate_v2/snapshot.axc');
  assert.equal(rotated.encoding, 'chunked');
  assert.notEqual(await fileDigest(snapshotPath), before, 'the snapshot was resealed');

  // Under the new key the backup verifies through its signed rewrap record,
  // and restores to a database whose protected columns carry the new key.
  const newKey = new DataProtector(Buffer.from((await readFile(f.dataKeyFile, 'utf8')).trim(), 'base64url'));
  const verified = await verifyGridBackupArtifact({ manifestPath, dataDir: f.dataDir, identity: f.identity, protector: newKey });
  assert.equal(verified.rewrapped, true);
  assert.notEqual(verified.database_digest, manifest.database.sha256);
  assert.equal(verified.source_database_digest, manifest.database.sha256);
  await assert.rejects(
    verifyGridBackupArtifact({ manifestPath, dataDir: f.dataDir, identity: f.identity, protector: f.protector }),
    /failed authentication/,
    'the old key no longer opens it'
  );

  // A forged rewrap record is refused.
  const sidecarPath = `${snapshotPath}.key-rotation.json`;
  const sidecar = await readFile(sidecarPath, 'utf8');
  const forged = JSON.parse(sidecar);
  forged.chunked.target.chunk_bytes = 2048;
  await writeFile(sidecarPath, JSON.stringify(forged));
  await assert.rejects(
    verifyGridBackupArtifact({ manifestPath, dataDir: f.dataDir, identity: f.identity, protector: newKey }),
    /attestation is invalid/
  );
  // Even correctly signed, a record whose source chunk parameters do not
  // continue from the signed backup is refused.
  const discontinuous = JSON.parse(sidecar);
  discontinuous.chunked.source.chunks += 1;
  delete discontinuous.attestation;
  await writeFile(sidecarPath, JSON.stringify({ ...discontinuous, attestation: f.identity.signObject(discontinuous) }));
  await assert.rejects(
    verifyGridBackupArtifact({ manifestPath, dataDir: f.dataDir, identity: f.identity, protector: newKey }),
    /chunk rewrap chain is discontinuous/
  );
  await writeFile(sidecarPath, sidecar);

  const restored = await restoreGridBackup({
    manifestPath, dataDir: f.dataDir, identity: f.identity, protector: newKey,
    expectedDatabaseDigest: manifest.database.sha256
  });
  assert.equal(restored.database_digest, verified.database_digest);
  const store = new GridStore({ path: join(f.dataDir, 'grid.sqlite'), dataDir: f.dataDir, identity: f.identity, protector: newKey });
  try {
    assert.equal(store.verifyChain().valid, true);
    assert.equal(store.getStatus().last_hash, manifest.database.evidence_head);
  } finally {
    store.close();
  }

  // Rollback rewraps it again under the prior key, extending the history.
  const rollback = await rollbackDataProtectionKey({ manifestPath: rotation.manifest_path, dataDir: f.dataDir, secretDir: f.secretDir });
  assert.equal(rollback.protected_artifacts, 2);
  const priorKey = new DataProtector(Buffer.from((await readFile(f.dataKeyFile, 'utf8')).trim(), 'base64url'));
  const afterRollback = await verifyGridBackupArtifact({ manifestPath, dataDir: f.dataDir, identity: f.identity, protector: priorKey });
  assert.equal(afterRollback.valid, true);
  assert.equal(afterRollback.rewrapped, true);
});

test('an unknown backup format is refused', async t => {
  const f = await fixture(t);
  await assert.rejects(backup(f, 'backup_bad_format', 'axiom-grid-backup.v3'), /format is unsupported/);
});

test('streaming backups are the default; the envelope format stays selectable', async t => {
  const f = await fixture(t);
  const previous = process.env.AXIOM_GRID_BACKUP_FORMAT;
  t.after(() => {
    if (previous === undefined) delete process.env.AXIOM_GRID_BACKUP_FORMAT;
    else process.env.AXIOM_GRID_BACKUP_FORMAT = previous;
  });
  delete process.env.AXIOM_GRID_BACKUP_FORMAT;
  const { manifest: byDefault } = await backup(f, 'backup_default_format');
  assert.equal(byDefault.format, STREAMING_BACKUP_FORMAT);
  assert.equal(byDefault.snapshot.name, 'snapshot.axc');

  process.env.AXIOM_GRID_BACKUP_FORMAT = 'axiom-grid-backup.v1';
  const { manifest: envelope } = await backup(f, 'backup_envelope_format');
  assert.equal(envelope.format, 'axiom-grid-backup.v1');
  assert.equal(envelope.snapshot.name, 'snapshot.axb');
  for (const id of ['backup_default_format', 'backup_envelope_format']) {
    const verified = await verifyGridBackupArtifact({
      manifestPath: join(f.dataDir, 'backups', id, 'manifest.json'),
      dataDir: f.dataDir, identity: f.identity, protector: f.protector
    });
    assert.equal(verified.valid, true, id);
  }

  process.env.AXIOM_GRID_BACKUP_FORMAT = 'axiom-grid-backup.v9';
  await assert.rejects(backup(f, 'backup_unknown_env_format'), /format is unsupported/);
});
