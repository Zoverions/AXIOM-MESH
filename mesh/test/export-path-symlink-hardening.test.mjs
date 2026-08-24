import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { GridStore as CheckpointGridStore } from '../src/grid/_store-checkpoints.mjs';
import { sha256 } from '../src/lib/canonical.mjs';
import { MeshIdentity } from '../src/lib/identity.mjs';

function signedExportFixture({ dataDir, exportId, bytes, bundlePath }) {
  const pair = generateKeyPairSync('ed25519');
  const privatePem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' });
  const publicPem = pair.publicKey.export({ type: 'spki', format: 'pem' });
  const identity = new MeshIdentity('grid', privatePem, publicPem);
  const unsigned = {
    format: 'axiom-export.v1',
    export_id: exportId,
    files: [{
      name: 'bundle.jsonl',
      media_type: 'application/x-ndjson',
      bytes: bytes.length,
      sha256: sha256(bytes)
    }]
  };
  const manifest = {
    ...unsigned,
    attestation: identity.signObject(unsigned)
  };
  return {
    dataDir,
    verificationKeys: new Map([[identity.keyId, identity.publicKey]]),
    getExport(id, principal) {
      assert.equal(id, exportId);
      assert.equal(principal, 'owner.audit');
      return {
        status: 'completed',
        bundle_path: bundlePath,
        manifest_json: manifest
      };
    }
  };
}

test('export reads reject a symlinked export directory even when target bytes match the signed manifest', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-export-symlink-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));

  const exportId = 'export_123e4567-e89b-42d3-a456-426614174000';
  const exportsRoot = join(dataDir, 'exports');
  const exportDir = join(exportsRoot, exportId);
  const attackerDir = join(dataDir, 'attacker-export');
  const bytes = Buffer.from('{"signed":true}\n');

  await mkdir(exportsRoot, { recursive: true });
  await mkdir(attackerDir, { recursive: true });
  await writeFile(join(attackerDir, 'bundle.jsonl'), bytes);
  await symlink(
    attackerDir,
    exportDir,
    process.platform === 'win32' ? 'junction' : 'dir'
  );

  const fakeStore = signedExportFixture({
    dataDir,
    exportId,
    bytes,
    bundlePath: join(attackerDir, 'bundle.jsonl')
  });

  await assert.rejects(
    () => CheckpointGridStore.prototype.getExportBundle.call(
      fakeStore,
      exportId,
      'owner.audit'
    ),
    error => (
      error?.code === 'export_integrity_failed'
      && /path integrity failed/i.test(error.message)
    )
  );
});
