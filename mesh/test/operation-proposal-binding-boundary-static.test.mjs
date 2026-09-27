import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const SOURCE_URL = new URL('../src/lib/operation-proposal-binding.mjs', import.meta.url);

const ALLOWED_IMPORTS = Object.freeze([
  'node:util',
  './canonical.mjs',
  './semantic-operation-proposal.mjs',
  './operation-candidate-selection.mjs',
  './external-operation-offer.mjs'
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
  'node:vm',
  'fetch(',
  'process.env',
  'require(',
  'import(',
  'specialist-harness-bridge',
  'semantic-action-consumption-lab',
  'capabilities.json',
  'Gateway',
  'Hypervisor',
  'Sandbox',
  'Grid',
  'credential',
  'wallet',
  'payment_method',
  'secret',
  'structuredClone',
  'JSON.parse',
  'JSON.stringify'
]);

function importSpecifiers(source) {
  return [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);
}

test('operation proposal binding source stays pure and outside authority or I/O surfaces', async () => {
  const source = await readFile(SOURCE_URL, 'utf8');
  assert.deepEqual(importSpecifiers(source).sort(), [...ALLOWED_IMPORTS].sort());
  for (const forbidden of FORBIDDEN) {
    assert.equal(source.includes(forbidden), false, `forbidden surface: ${forbidden}`);
  }
});

test('operation proposal binding inspects originals with Reflect.ownKeys and strict canonicalize', async () => {
  const source = await readFile(SOURCE_URL, 'utf8');
  assert.match(source, /Reflect\.ownKeys\(/);
  assert.match(source, /types\.isProxy\(/);
  assert.match(source, /canonicalize\(value\)/);
  assert.equal(/Object\.keys\(value\)/.test(source), false, 'closed-key checks must not use Object.keys');
});

test('operation proposal binding reuses the existing candidate-set digest rather than a second canonical implementation', async () => {
  const source = await readFile(SOURCE_URL, 'utf8');
  assert.match(source, /computeCandidateSetDigest\(/);
  assert.equal(/createHash|node:crypto/.test(source), false);
  assert.equal(/function\s+canonicalize/.test(source), false);
});
