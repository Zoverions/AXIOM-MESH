import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const SOURCE = new URL('../src/lib/public-witness-source-provisioning-store.mjs', import.meta.url);

test('restart reconciliation never grows into remote enrollment or discovery', async () => {
  const text = await readFile(SOURCE, 'utf8');
  assert.equal(text.includes('fetch('), false);
  assert.equal(text.includes('createServer('), false);
  assert.equal(text.includes('listen('), false);
  assert.equal(text.includes('connect('), false);
  assert.equal(text.includes('remote_self_provisioning_allowed: false'), true);
});
