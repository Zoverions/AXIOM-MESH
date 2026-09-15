import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import {
  activateShelfDisplayManifest,
  validateShelfDisplayManifest
} from '../src/lib/shelf-display-manifest.mjs';
import { prepareShelfDisplayFileList } from '../src/shelf-display-prepare.mjs';

const FIXED_TIME = '2026-09-03T20:00:00.000Z';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function baseManifest(item, overrides = {}) {
  return {
    schema: 'axiom-shelf-display-manifest.v1',
    version: 1,
    playlist_id: 'zoverions-books',
    display_seconds: 12,
    transition: 'none',
    orientation: 'portrait-right',
    items: [item],
    ...overrides
  };
}

async function workspace() {
  const root = await mkdtemp(join(tmpdir(), 'axiom-shelf-display-'));
  const contentRoot = join(root, 'candidate');
  const cacheRoot = join(root, 'cache');
  await mkdir(join(contentRoot, 'covers'), { recursive: true });
  const bytes = Buffer.from('validated-cover-asset');
  const relativePath = 'covers/book-01.webp';
  const absolutePath = join(contentRoot, relativePath);
  await writeFile(absolutePath, bytes);
  const item = {
    path: relativePath,
    sha256: sha256(bytes),
    byte_length: bytes.length
  };
  return {
    root,
    contentRoot,
    cacheRoot,
    bytes,
    item,
    manifest: baseManifest(item),
    cleanup: () => rm(root, { recursive: true, force: true })
  };
}

test('validates an exact local image manifest and returns digest-bound absolute files', async () => {
  const ws = await workspace();
  try {
    const result = await validateShelfDisplayManifest(ws.manifest, {
      contentRoot: ws.contentRoot
    });
    assert.equal(result.manifest.schema, 'axiom-shelf-display-manifest.v1');
    assert.match(result.manifest_digest, /^[a-f0-9]{64}$/);
    assert.equal(result.files.length, 1);
    assert.equal(result.files[0].absolute_path, resolve(ws.contentRoot, ws.item.path));
    assert.equal(result.files[0].sha256, ws.item.sha256);
    assert.equal(result.files[0].byte_length, ws.item.byte_length);
  } finally {
    await ws.cleanup();
  }
});

test('rejects traversal, duplicates, unsupported extensions, empty playlists, corruption, and unknown fields', async t => {
  const ws = await workspace();
  try {
    const cases = [
      ['traversal', baseManifest({ ...ws.item, path: '../outside.webp' })],
      ['duplicate path', baseManifest(ws.item, { items: [ws.item, { ...ws.item }] })],
      ['unsupported extension', baseManifest({ ...ws.item, path: 'covers/book-01.gif' })],
      ['empty playlist', baseManifest(ws.item, { items: [] })],
      ['digest mismatch', baseManifest({ ...ws.item, sha256: '0'.repeat(64) })],
      ['length mismatch', baseManifest({ ...ws.item, byte_length: ws.item.byte_length + 1 })],
      ['unknown manifest field', { ...ws.manifest, remote_url: 'https://example.invalid/cover.webp' }],
      ['unknown item field', baseManifest({ ...ws.item, url: 'https://example.invalid/cover.webp' })]
    ];
    for (const [name, manifest] of cases) {
      await t.test(name, async () => {
        await assert.rejects(
          validateShelfDisplayManifest(manifest, { contentRoot: ws.contentRoot })
        );
      });
    }
  } finally {
    await ws.cleanup();
  }
});

test('rejects a content path whose symlink resolves outside the approved root', {
  skip: process.platform === 'win32'
}, async () => {
  const ws = await workspace();
  try {
    const outside = join(ws.root, 'outside.webp');
    const outsideBytes = Buffer.from('outside-content');
    await writeFile(outside, outsideBytes);
    const linkPath = join(ws.contentRoot, 'covers', 'escape.webp');
    await symlink(outside, linkPath);
    const manifest = baseManifest({
      path: 'covers/escape.webp',
      sha256: sha256(outsideBytes),
      byte_length: outsideBytes.length
    });
    await assert.rejects(
      validateShelfDisplayManifest(manifest, { contentRoot: ws.contentRoot }),
      /escape|outside|root|symlink/i
    );
  } finally {
    await ws.cleanup();
  }
});

test('failed candidate validation leaves active and last-known-good state untouched', async () => {
  const ws = await workspace();
  try {
    await mkdir(ws.cacheRoot, { recursive: true });
    const statePath = join(ws.cacheRoot, 'display-state.json');
    await writeFile(statePath, 'sentinel-state\n', 'utf8');
    const before = await readdir(ws.cacheRoot);
    const invalid = baseManifest({ ...ws.item, sha256: 'f'.repeat(64) });

    await assert.rejects(activateShelfDisplayManifest({
      manifest: invalid,
      contentRoot: ws.contentRoot,
      cacheRoot: ws.cacheRoot,
      now: () => FIXED_TIME
    }));

    assert.equal(await readFile(statePath, 'utf8'), 'sentinel-state\n');
    assert.deepEqual(await readdir(ws.cacheRoot), before);
  } finally {
    await ws.cleanup();
  }
});

test('activation copies validated content into an immutable local generation and retains previous active as LKG', async () => {
  const ws = await workspace();
  try {
    const first = await activateShelfDisplayManifest({
      manifest: ws.manifest,
      contentRoot: ws.contentRoot,
      cacheRoot: ws.cacheRoot,
      now: () => FIXED_TIME
    });
    const firstState = JSON.parse(await readFile(join(ws.cacheRoot, 'display-state.json'), 'utf8'));
    assert.equal(firstState.active.manifest_digest, first.manifest_digest);
    assert.equal(firstState.last_known_good.manifest_digest, first.manifest_digest);
    const firstCached = join(ws.cacheRoot, firstState.active.generation_dir, ws.item.path);
    assert.deepEqual(await readFile(firstCached), ws.bytes);

    const secondBytes = Buffer.from('second-validated-cover');
    const secondPath = join(ws.contentRoot, 'covers', 'book-02.png');
    await writeFile(secondPath, secondBytes);
    const secondItem = {
      path: 'covers/book-02.png',
      sha256: sha256(secondBytes),
      byte_length: secondBytes.length
    };
    const secondManifest = baseManifest(secondItem, { playlist_id: 'zoverions-books-v2' });
    const second = await activateShelfDisplayManifest({
      manifest: secondManifest,
      contentRoot: ws.contentRoot,
      cacheRoot: ws.cacheRoot,
      now: () => '2026-09-03T20:05:00.000Z'
    });
    const secondState = JSON.parse(await readFile(join(ws.cacheRoot, 'display-state.json'), 'utf8'));
    assert.equal(secondState.active.manifest_digest, second.manifest_digest);
    assert.equal(secondState.last_known_good.manifest_digest, first.manifest_digest);
    assert.notEqual(secondState.active.generation_dir, secondState.last_known_good.generation_dir);
  } finally {
    await ws.cleanup();
  }
});

test('prepare emits only validated absolute cached files and never depends on the source candidate', async () => {
  const ws = await workspace();
  try {
    const activated = await activateShelfDisplayManifest({
      manifest: ws.manifest,
      contentRoot: ws.contentRoot,
      cacheRoot: ws.cacheRoot,
      now: () => FIXED_TIME
    });
    await writeFile(join(ws.contentRoot, ws.item.path), 'source-mutated-after-activation');
    const outputPath = join(ws.root, 'display-files.txt');
    const prepared = await prepareShelfDisplayFileList({
      cacheRoot: ws.cacheRoot,
      outputPath
    });
    const text = await readFile(outputPath, 'utf8');
    const expected = join(ws.cacheRoot, activated.generation_dir, ws.item.path);
    assert.deepEqual(prepared.files, [expected]);
    assert.equal(text, `${expected}\n`);
    assert.equal(text.includes('http://'), false);
    assert.equal(text.includes('https://'), false);
    assert.deepEqual(await readFile(expected), ws.bytes);
  } finally {
    await ws.cleanup();
  }
});

test('prepare fails closed on a corrupted cached generation and does not replace the prior file list', async () => {
  const ws = await workspace();
  try {
    const activated = await activateShelfDisplayManifest({
      manifest: ws.manifest,
      contentRoot: ws.contentRoot,
      cacheRoot: ws.cacheRoot,
      now: () => FIXED_TIME
    });
    const outputPath = join(ws.root, 'display-files.txt');
    await writeFile(outputPath, '/known/good/cover.webp\n', 'utf8');
    await writeFile(join(ws.cacheRoot, activated.generation_dir, ws.item.path), 'corrupt');
    await assert.rejects(prepareShelfDisplayFileList({
      cacheRoot: ws.cacheRoot,
      outputPath
    }));
    assert.equal(await readFile(outputPath, 'utf8'), '/known/good/cover.webp\n');
  } finally {
    await ws.cleanup();
  }
});

test('display launcher is local-only and renders the prepared file list', async () => {
  const launcher = await readFile(
    new URL('../host/linux/bin/axiom-display-session', import.meta.url),
    'utf8'
  );
  assert.match(launcher, /xrandr/);
  assert.match(launcher, /feh/);
  assert.match(launcher, /\/run\/axiom\/status\/display-files\.txt/);
  assert.doesNotMatch(launcher, /\bcurl\b|\bwget\b|https?:\/\//i);
});
