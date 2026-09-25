import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import { openFileChunked, sealFileChunked } from '../src/lib/chunked-artifact.mjs';
import { DataProtector } from '../src/lib/protector.mjs';

const run = promisify(execFile);
const CHUNK = 1024;
const CONTEXT = 'axiom:grid-backup:backup_test';

async function workspace(t) {
  const dir = await mkdtemp(join(tmpdir(), 'axiom-chunked-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

async function sealed(dir, protector, plaintext, name = 'a') {
  const source = join(dir, `${name}.plain`);
  await writeFile(source, plaintext);
  const target = join(dir, `${name}.axc`);
  const metadata = await sealFileChunked({ protector, sourcePath: source, targetPath: target, context: CONTEXT, chunkBytes: CHUNK });
  return { target, metadata };
}

// Offsets of each record in a sealed file: [start, end) per chunk.
function records(bytes) {
  const out = [];
  let offset = 8;
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const end = offset + 4 + 1 + 12 + length + 16;
    out.push([offset, end]);
    offset = end;
  }
  return out;
}

test('chunked artifacts round-trip at every chunk boundary', async t => {
  const dir = await workspace(t);
  const protector = new DataProtector(randomBytes(32));
  for (const size of [0, 1, CHUNK - 1, CHUNK, CHUNK + 1, 3 * CHUNK, 3 * CHUNK + 17]) {
    const plaintext = randomBytes(size);
    const { target, metadata } = await sealed(dir, protector, plaintext, `s${size}`);
    assert.equal(metadata.chunks, Math.max(1, Math.ceil(size / CHUNK)), `chunks for ${size}`);
    assert.equal(metadata.plaintext.bytes, size);
    assert.equal(metadata.bytes, (await stat(target)).size);
    const out = join(dir, `s${size}.out`);
    await openFileChunked({ protector, sourcePath: target, targetPath: out, context: CONTEXT, expected: metadata });
    assert.deepEqual(await readFile(out), plaintext, `bytes for ${size}`);
  }
});

test('corrupt, reordered, omitted, replayed and mixed-generation chunks fail closed', async t => {
  const dir = await workspace(t);
  const protector = new DataProtector(randomBytes(32));
  const plaintext = randomBytes(3 * CHUNK + 100);
  const { target, metadata } = await sealed(dir, protector, plaintext);
  const other = await sealed(dir, protector, plaintext, 'b');
  const bytes = await readFile(target);
  const otherBytes = await readFile(other.target);
  const spans = records(bytes);
  assert.equal(spans.length, 4);
  const piece = ([start, end], from = bytes) => from.subarray(start, end);
  const header = bytes.subarray(0, 8);

  const flipped = Buffer.from(bytes);
  flipped[spans[1][0] + 40] ^= 1;
  const finalFlag = Buffer.from(bytes);
  finalFlag[spans[1][0] + 4] = 1;
  const cases = [
    ['a flipped ciphertext byte', flipped, /chunk 1 failed authentication/],
    ['a middle chunk marked final', finalFlag, /chunk 1 failed authentication/],
    ['swapped chunks', Buffer.concat([header, piece(spans[1]), piece(spans[0]), piece(spans[2]), piece(spans[3])]), /chunk 0 failed authentication/],
    ['a replayed chunk', Buffer.concat([header, piece(spans[0]), piece(spans[0]), piece(spans[2]), piece(spans[3])]), /chunk 1 failed authentication/],
    ['an omitted final chunk', bytes.subarray(0, spans[2][1]), /truncated/],
    ['an omitted middle chunk', Buffer.concat([header, piece(spans[0]), piece(spans[2]), piece(spans[3])]), /chunk 1 failed authentication/],
    ['bytes after the final chunk', Buffer.concat([bytes, Buffer.from([0])]), /after its final chunk/],
    ['a chunk from another artifact', Buffer.concat([header, piece(spans[0]), piece(records(otherBytes)[1], otherBytes), piece(spans[2]), piece(spans[3])]), /chunk 1 failed authentication/],
    ['a truncated tag', bytes.subarray(0, bytes.length - 3), /truncated/]
  ];
  for (const [name, content, reason] of cases) {
    const path = join(dir, 'tampered.axc');
    await writeFile(path, content);
    const out = join(dir, 'tampered.out');
    await assert.rejects(
      openFileChunked({ protector, sourcePath: path, targetPath: out, context: CONTEXT, expected: metadata }),
      reason,
      name
    );
    await assert.rejects(stat(out), { code: 'ENOENT' }, `${name}: no partial plaintext is left`);
    await rm(path);
  }

  // The wrong context, the wrong key, or metadata that was not signed for it.
  await assert.rejects(
    openFileChunked({ protector, sourcePath: target, context: 'axiom:grid-backup:other', expected: metadata }),
    /chunk 0 failed authentication/
  );
  await assert.rejects(
    openFileChunked({ protector: new DataProtector(randomBytes(32)), sourcePath: target, context: CONTEXT, expected: metadata }),
    /chunk 0 failed authentication/
  );
  await assert.rejects(
    openFileChunked({ protector, sourcePath: target, context: CONTEXT, expected: { ...metadata, plaintext: { ...metadata.plaintext, sha256: 'f'.repeat(64) } } }),
    /does not match its signed metadata/
  );
  await assert.rejects(
    openFileChunked({ protector, sourcePath: target, context: CONTEXT, expected: { ...metadata, chunks: 3 } }),
    /metadata is invalid/
  );
});

test('sealing and opening hold a bounded amount of memory, whatever the artifact size', async t => {
  const dir = await workspace(t);
  const size = 48 * 1024 * 1024;
  const script = `
    import { randomBytes } from 'node:crypto';
    import { open } from 'node:fs/promises';
    import { sealFileChunked, openFileChunked } from ${JSON.stringify(new URL('../src/lib/chunked-artifact.mjs', import.meta.url).href)};
    import { DataProtector } from ${JSON.stringify(new URL('../src/lib/protector.mjs', import.meta.url).href)};
    const dir = ${JSON.stringify(dir)};
    const file = await open(dir + '/big.plain', 'w');
    const block = randomBytes(1024 * 1024);
    for (let i = 0; i < ${size / (1024 * 1024)}; i += 1) await file.write(block);
    await file.close();
    global.gc?.();
    const base = process.memoryUsage();
    let peak = 0;
    // Live memory: collect first, so freed chunks are not counted.
    const sample = () => {
      global.gc();
      const now = process.memoryUsage();
      peak = Math.max(peak, (now.arrayBuffers - base.arrayBuffers) + (now.heapUsed - base.heapUsed));
    };
    const timer = setInterval(sample, 5);
    const protector = new DataProtector(randomBytes(32));
    const metadata = await sealFileChunked({ protector, sourcePath: dir + '/big.plain', targetPath: dir + '/big.axc', context: 'ctx' });
    sample();
    await openFileChunked({ protector, sourcePath: dir + '/big.axc', targetPath: dir + '/big.out', context: 'ctx', expected: metadata });
    sample();
    clearInterval(timer);
    console.log(JSON.stringify({ peak, chunks: metadata.chunks }));
  `;
  const scriptPath = join(dir, 'probe.mjs');
  await writeFile(scriptPath, script);
  const { stdout } = await run(process.execPath, ['--expose-gc', scriptPath], { maxBuffer: 1024 * 1024 });
  const { peak, chunks } = JSON.parse(stdout.trim().split('\n').at(-1));
  assert.equal(chunks, 48);
  // A 48 MiB artifact through 1 MiB chunks: far below the artifact's size.
  assert.ok(peak < 16 * 1024 * 1024, `peak additional memory ${(peak / 1048576).toFixed(1)} MiB`);
});
