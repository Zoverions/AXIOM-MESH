import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sourceUrl = new URL('../src/lib/bounded-decision-local-conformance-adapter.mjs', import.meta.url);

const forbiddenImports = [
  'node:fs',
  'node:net',
  'node:http',
  'node:https',
  'node:child_process',
  '@typesafe-ai/sdk',
  'credential',
  'token-broker',
  'wallet',
  'payment',
  'capability-issuance',
  'grid-store'
];

test('Slice B local conformance adapter remains network-free credential-free and evidence-only', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  for (const forbidden of forbiddenImports) {
    assert.equal(
      source.includes(`from '${forbidden}`) || source.includes(`from "${forbidden}`),
      false,
      `unexpected effectful import: ${forbidden}`
    );
  }
  assert.equal(source.includes('fetch('), false);
  assert.equal(source.includes('process.env'), false);
  assert.equal(source.includes('TYPESAFE_API_KEY'), false);
  assert.equal(source.includes('allow:'), false);
  assert.equal(source.includes('authorized:'), false);
  assert.equal(source.includes('achieved_assurance'), false);
  assert.equal(source.includes('required_assurance'), false);
});
