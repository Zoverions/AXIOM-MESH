import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const SOURCE_URL = new URL('../src/lib/external-operation-offer.mjs', import.meta.url);

const ALLOWED_IMPORTS = Object.freeze([
  './canonical.mjs',
  './runtime-connector-fabric-contracts.mjs'
]);

const FORBIDDEN = Object.freeze([
  'node:fs',
  'node:http',
  'node:https',
  'node:net',
  'node:tls',
  'node:dns',
  'node:child_process',
  'node:worker_threads',
  'fetch(',
  'Gateway',
  'Hypervisor',
  'Sandbox',
  'Grid',
  'credential',
  'wallet',
  'payment_method',
  'secret',
  'provider:start'
]);

function importSpecifiers(source) {
  return [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);
}

test('external operation offer source stays pure and outside authority or I/O surfaces', async () => {
  const source = await readFile(SOURCE_URL, 'utf8');
  assert.deepEqual(importSpecifiers(source).sort(), [...ALLOWED_IMPORTS].sort());
  for (const forbidden of FORBIDDEN) {
    assert.equal(source.includes(forbidden), false, `forbidden surface: ${forbidden}`);
  }
});
