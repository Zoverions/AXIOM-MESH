import assert from 'node:assert/strict';
import test from 'node:test';
import { CANONICAL_DOCUMENTS } from '../src/check-docs.mjs';

const required = new Set([
  'docs/superpowers/specs/2026-09-03-sovereign-information-evidence-authority-design.md',
  'docs/superpowers/plans/2026-09-03-sovereign-information-evidence-authority-slice1.md'
]);

test('sovereign information spec and plan are canonical registered documents', () => {
  const canonical = new Set(CANONICAL_DOCUMENTS);
  for (const path of required) assert.equal(canonical.has(path), true, `${path} must be canonical`);
});
