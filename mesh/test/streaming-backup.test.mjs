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
import { rotateDataProtectionKey } from '../src/rotate-data-key.mjs';

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

  const flipped = Buffer.from(original);
  flipped[flipped.length - 40] ^= 1;
  await writeFile(snapshotPath, flipped);
  await assert.rejects(restore(), /failed authentication/);
  await writeFile(snapshotPath, original.subarray(0, original.length - 20));
  await assert.rejects(restore(), /truncated/);
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

test('retention plans cover v1 and streaming backups; data-key rotation refuses streaming ones', async t => {
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

  await assert.rejects(
    rotateDataProtectionKey({ dataDir: f.dataDir, secretDir: f.secretDir }),
    /streaming \(axiom-grid-backup\.v2\) backup, which data-key rotation cannot rewrap yet/
  );
});

test('an unknown backup format is refused', async t => {
  const f = await fixture(t);
  await assert.rejects(backup(f, 'backup_bad_format', 'axiom-grid-backup.v3'), /format is unsupported/);
});
