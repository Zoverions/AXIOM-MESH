import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const bindingSourceUrl = new URL('../src/lib/agent-provider-binding.mjs', import.meta.url);
const beaconSourceUrl = new URL('../src/lib/beacon-observation-candidate.mjs', import.meta.url);

async function source(url) {
  return readFile(url, 'utf8');
}

function assertNoEffectfulRuntimeImports(text, label) {
  assert.doesNotMatch(
    text,
    /node:(?:http|https|net|tls|dgram|child_process|fs)/,
    `${label} must not import network, subprocess, or filesystem runtime modules`
  );
  assert.doesNotMatch(text, /\bcreateServer\s*\(/, `${label} must not create a server`);
  assert.doesNotMatch(text, /\.listen\s*\(/, `${label} must not listen on a socket`);
  assert.doesNotMatch(text, /\bfetch\s*\(/, `${label} must not make fetch calls`);
  assert.doesNotMatch(
    text,
    /\b(?:spawn|exec|execFile|fork)\s*\(/,
    `${label} must not launch subprocesses`
  );
  assert.doesNotMatch(text, /\bGridStore\b/, `${label} must not access Grid state`);
  assert.doesNotMatch(
    text,
    /from ['"][^'"]*(?:credential|wallet|token|secret)[^'"]*['"]/i,
    `${label} must not import credential, wallet, token, or secret modules`
  );
}

test('provider binding resolver remains pure and effect-free', async () => {
  assertNoEffectfulRuntimeImports(
    await source(bindingSourceUrl),
    'agent provider binding resolver'
  );
});

test('Beacon observation verifier remains offline and effect-free', async () => {
  assertNoEffectfulRuntimeImports(
    await source(beaconSourceUrl),
    'Beacon observation verifier'
  );
});
