import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { activateShelfDisplayManifest } from '../src/lib/shelf-display-manifest.mjs';
import { prepareShelfDisplayFileList } from '../src/shelf-display-prepare.mjs';

function item(path, bytes) {
  return {
    path,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    byte_length: bytes.length
  };
}

function manifest(playlistId, entry) {
  return {
    schema: 'axiom-shelf-display-manifest.v1',
    version: 1,
    playlist_id: playlistId,
    display_seconds: 12,
    transition: 'none',
    orientation: 'portrait-right',
    items: [entry]
  };
}

test('prepare falls back to the previous validated generation when active cache bytes are corrupt', async () => {
  const root = await mkdtemp(join(tmpdir(), 'axiom-shelf-lkg-'));
  try {
    const contentRoot = join(root, 'candidate');
    const cacheRoot = join(root, 'cache');
    const outputPath = join(root, 'display-files.txt');
    await mkdir(join(contentRoot, 'covers'), { recursive: true });

    const firstBytes = Buffer.from('first-known-good-cover');
    const firstItem = item('covers/first.webp', firstBytes);
    await writeFile(join(contentRoot, firstItem.path), firstBytes);
    const first = await activateShelfDisplayManifest({
      manifest: manifest('first-playlist', firstItem),
      contentRoot,
      cacheRoot,
      now: () => '2026-09-03T20:00:00.000Z'
    });

    const secondBytes = Buffer.from('second-active-cover');
    const secondItem = item('covers/second.png', secondBytes);
    await writeFile(join(contentRoot, secondItem.path), secondBytes);
    const second = await activateShelfDisplayManifest({
      manifest: manifest('second-playlist', secondItem),
      contentRoot,
      cacheRoot,
      now: () => '2026-09-03T20:05:00.000Z'
    });

    await writeFile(join(cacheRoot, second.generation_dir, secondItem.path), 'corrupt-active');
    const prepared = await prepareShelfDisplayFileList({ cacheRoot, outputPath });
    const expected = join(cacheRoot, first.generation_dir, firstItem.path);

    assert.equal(prepared.source, 'last-known-good');
    assert.equal(prepared.manifest_digest, first.manifest_digest);
    assert.deepEqual(prepared.files, [expected]);
    assert.equal(await readFile(outputPath, 'utf8'), `${expected}\n`);
    assert.deepEqual(await readFile(expected), firstBytes);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
