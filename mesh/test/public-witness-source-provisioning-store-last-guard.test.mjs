import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const SOURCE = new URL('../src/lib/public-witness-source-provisioning-store.mjs', import.meta.url);

test('d2 does not import Grid Gateway Hypervisor or Sandbox runtime surfaces', async () => {
  const text = await readFile(SOURCE, 'utf8');
  for (const marker of ['/grid/', '/gateway/', '/hypervisor/', '/sandbox/']) {
    assert.equal(text.toLowerCase().includes(marker), false);
  }
});
