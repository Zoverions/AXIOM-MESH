import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { scanAxiomHostH0Secrets } from '../src/axiom-host-secret-scan.mjs';

test('H0 secret scan hashes inputs and reports a secret-free result without values', async () => {
  const root = await mkdtemp(join(tmpdir(), 'axiom-host-secret-scan-'));
  try {
    const image = join(root, 'image.raw');
    const log = join(root, 'build.log');
    await Promise.all([
      writeFile(image, Buffer.alloc(2 * 1024 * 1024, 0x41)),
      writeFile(log, 'laboratory build completed\n')
    ]);
    const result = await scanAxiomHostH0Secrets([
      { label: 'image.raw', path: image },
      { label: 'mkosi-build.log', path: log }
    ]);
    assert.equal(result.status, 'passed');
    assert.equal(result.passed, true);
    assert.deepEqual(result.matched_pattern_ids, []);
    assert.equal(result.files.length, 2);
    assert.match(result.files[0].sha256, /^[a-f0-9]{64}$/);
    assert.match(result.scan_sha256, /^[a-f0-9]{64}$/);
    assert.equal(JSON.stringify(result).includes('laboratory build completed'), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('H0 secret scan catches a marker split across stream chunks and omits its value', async () => {
  const root = await mkdtemp(join(tmpdir(), 'axiom-host-secret-scan-'));
  try {
    const image = join(root, 'image.raw');
    const marker = '-----BEGIN OPENSSH PRIVATE KEY-----';
    const bytes = Buffer.concat([
      Buffer.alloc(1024 * 1024 - 8, 0x41),
      Buffer.from(marker),
      Buffer.alloc(64, 0x42)
    ]);
    await writeFile(image, bytes);
    const result = await scanAxiomHostH0Secrets([{ label: 'image.raw', path: image }]);
    assert.equal(result.status, 'failed');
    assert.equal(result.passed, false);
    assert.deepEqual(result.matched_pattern_ids, ['pem-private-key']);
    assert.equal(JSON.stringify(result).includes(marker), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
