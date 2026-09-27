import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, rename, rm, unlink, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  ensureMeshIdentity,
  loadTrustedKey,
  TRUSTED_KEY_RACY_MARGIN_MS,
  trustedKeyCacheable,
  trustedKeyCacheStats
} from '../src/lib/identity.mjs';

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

test('a trust file modified within the racy margin is never served from the cache', () => {
  const ms = value => BigInt(value) * 1_000_000n;
  const now = 1_700_000_000_000;
  const settled = { mtimeNs: ms(now - 5_000), ctimeNs: ms(now - 5_000) };
  assert.equal(trustedKeyCacheable(settled, now), true);
  // Written within the margin: a same-size rewrite in the same filesystem
  // tick would keep the identity, so the cache must not vouch for it.
  assert.equal(trustedKeyCacheable({ ...settled, mtimeNs: ms(now - 10) }, now), false);
  assert.equal(trustedKeyCacheable({ ...settled, ctimeNs: ms(now - 1_999) }, now), false);
  assert.equal(
    trustedKeyCacheable({ mtimeNs: ms(now - TRUSTED_KEY_RACY_MARGIN_MS), ctimeNs: ms(now - TRUSTED_KEY_RACY_MARGIN_MS) }, now),
    true
  );
  // A timestamp ahead of the clock is never settled.
  assert.equal(trustedKeyCacheable({ ...settled, mtimeNs: ms(now + 60_000) }, now), false);
});

test('a same-size in-place rewrite within one timestamp tick is still seen', async t => {
  const { dataDir, path } = await trustFixture(t);
  // Pin both versions to one mtime, as a coarse filesystem clock would.
  const tick = new Date();
  await utimes(path, tick, tick);
  await loadTrustedKey(dataDir, 'grid');
  const rotated = newPublicPem();
  await writeFile(path, rotated);
  await utimes(path, tick, tick);
  assert.equal(spki(await loadTrustedKey(dataDir, 'grid')), rotated);
});

test('a freshly written trust file is re-read until it settles, then cached', async t => {
  const { dataDir, identity } = await trustFixture(t);
  const reads = () => trustedKeyCacheStats().reads;
  const start = reads();
  // Just written: every request reads the file again.
  await loadTrustedKey(dataDir, 'grid');
  await loadTrustedKey(dataDir, 'grid');
  assert.equal(reads() - start, 2);
  // Past the margin: one more read fills the cache, then requests hit it.
  const later = Date.now() + TRUSTED_KEY_RACY_MARGIN_MS + 1_000;
  await loadTrustedKey(dataDir, 'grid', { nowMs: later });
  const key = await loadTrustedKey(dataDir, 'grid', { nowMs: later });
  assert.equal(reads() - start, 3);
  assert.equal(spki(key), spki(identity.publicKey));
});
