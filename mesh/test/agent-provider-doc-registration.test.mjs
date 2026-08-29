import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const checkerUrl = new URL('../src/check-docs.mjs', import.meta.url);

const REQUIRED_PROVIDER_DOCS = Object.freeze([
  'docs/superpowers/specs/2026-08-29-extensible-agent-provider-substrate-design.md',
  'docs/superpowers/plans/2026-08-29-extensible-agent-provider-substrate.md'
]);

test('provider substrate design and plan are registered in the canonical documentation corpus', async () => {
  const checker = await readFile(checkerUrl, 'utf8');
  for (const path of REQUIRED_PROVIDER_DOCS) {
    assert.ok(checker.includes(`'${path}'`), `${path} must be registered in CANONICAL_DOCUMENTS`);
  }
});
