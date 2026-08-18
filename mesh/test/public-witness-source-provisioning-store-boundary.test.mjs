import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const SOURCE = new URL('../src/lib/public-witness-source-provisioning-store.mjs', import.meta.url);

test('source provisioning application remains local and introduces no network client or server imports', async () => {
  const text = await readFile(SOURCE, 'utf8');
  for (const forbidden of [
    "'node:http'",
    "'node:https'",
    "'node:net'",
    "'node:dgram'",
    "'node:dns'",
    "'node:child_process'"
  ]) {
    assert.equal(text.includes(forbidden), false, `unexpected effect import ${forbidden}`);
  }
  assert.equal(text.includes('remote_self_provisioning_allowed: false'), true);
  assert.equal(text.includes("authority_effect: 'w2c2-source-admission-only'"), true);
  assert.equal(text.includes("network_effect: 'none'"), true);
});

test('source provisioning application uses only the exact W2c2 source-admission mutation', async () => {
  const text = await readFile(SOURCE, 'utf8');
  const calls = [
    ...text.matchAll(/(?:receiverStore|this\.#receiverStore)\.([A-Za-z0-9_]+)\(/g)
  ].map(match => match[1]);
  const mutating = calls.filter(name => !['snapshot', 'getSourceAdmission'].includes(name));
  assert.deepEqual([...new Set(mutating)].sort(), ['admitSource']);
  assert.equal(text.includes('receiveTransfer('), false);
  assert.equal(text.includes('markObservationCommitted('), false);
});
