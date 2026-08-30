import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sourceUrl = new URL('../src/lib/cognitive-capability-profile.mjs', import.meta.url);

function importSpecifiers(source) {
  return [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);
}

test('cognitive selection source stays pure and outside authority or I/O surfaces', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  const imports = importSpecifiers(source);

  assert.deepEqual(imports.sort(), [
    './canonical.mjs',
    './runtime-connector-fabric-contracts.mjs'
  ]);

  for (const forbidden of [
    'node:fs',
    'node:http',
    'node:https',
    'node:net',
    'node:tls',
    'node:dns',
    'node:child_process',
    'node:worker_threads',
    'fetch(',
    'readFile(',
    'writeFile(',
    'spawn(',
    'exec(',
    'Gateway',
    'Hypervisor',
    'Sandbox',
    'Grid',
    'credentialBroker',
    'wallet',
    'paymentToken',
    'secretStore'
  ]) {
    assert.equal(source.includes(forbidden), false, `forbidden cognitive selection surface: ${forbidden}`);
  }
});
