import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { ensureMeshIdentity, loadTrustedKey } from '../src/lib/identity.mjs';

function spki(key) {
  return key.export({ type: 'spki', format: 'pem' });
}

function newPublicPem() {
  return generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' });
}

async function trustFixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-trusted-key-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  return { dataDir, identity, path: join(dataDir, 'trust', 'grid.pub.pem') };
}

test('a cached trusted key is replaced as soon as rotation renames a new file into place (S-05)', async t => {
  const { dataDir, identity, path } = await trustFixture(t);
  assert.equal(spki(await loadTrustedKey(dataDir, 'grid')), spki(identity.publicKey));
  assert.equal(spki(await loadTrustedKey(dataDir, 'grid')), spki(identity.publicKey));

  const rotated = newPublicPem();
  await writeFile(`${path}.tmp`, rotated);
  await rename(`${path}.tmp`, path);
  assert.equal(spki(await loadTrustedKey(dataDir, 'grid')), rotated);
});

test('a cached trusted key is replaced after an in-place rewrite', async t => {
  const { dataDir, path } = await trustFixture(t);
  await loadTrustedKey(dataDir, 'grid');
  const rotated = newPublicPem();
  await writeFile(path, rotated);
  assert.equal(spki(await loadTrustedKey(dataDir, 'grid')), rotated);
});

test('a removed trust file fails closed even when its key was cached', async t => {
  const { dataDir, path } = await trustFixture(t);
  await loadTrustedKey(dataDir, 'grid');
  await unlink(path);
  await assert.rejects(loadTrustedKey(dataDir, 'grid'), { code: 'ENOENT' });
});

test('an invalid service name is rejected before any file access', async () => {
  await assert.rejects(loadTrustedKey('/nonexistent', '../grid'), { code: 'invalid_service_identity' });
});
