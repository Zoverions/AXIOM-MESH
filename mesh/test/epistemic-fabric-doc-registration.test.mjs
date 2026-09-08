import assert from 'node:assert/strict';
import test from 'node:test';
import { CANONICAL_DOCUMENTS } from '../src/check-docs.mjs';

const required = new Set([
  'docs/MASTER-TODO-EPISTEMIC-FABRIC.md',
  'docs/ROADMAP-EXTENSION-EPISTEMIC-FABRIC.md',
  'docs/security/EPISTEMIC-FABRIC-THREAT-MODEL.md',
  'docs/superpowers/specs/2026-09-07-epistemic-fabric-stage5b-design.md',
  'docs/superpowers/plans/2026-09-07-epistemic-fabric-stage5b-e0-e1.md'
]);

test('Stage 5B epistemic fabric corpus is canonically registered', () => {
  const canonical = new Set(CANONICAL_DOCUMENTS);
  for (const path of required) {
    assert.equal(canonical.has(path), true, `${path} must be canonical`);
  }
});
