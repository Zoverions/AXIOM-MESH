import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const SOURCE = new URL('../src/lib/public-witness-source-provisioning-store.mjs', import.meta.url);

test('d2 names no receiver mutation other than exact source admission', async () => {
  const text = await readFile(SOURCE, 'utf8');
  assert.equal((text.match(/\.admitSource\(/g) ?? []).length >= 1, true);
  assert.equal(text.includes('.receiveTransfer('), false);
  assert.equal(text.includes('.markObservationCommitted('), false);
});
