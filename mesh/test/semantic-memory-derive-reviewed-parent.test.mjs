import assert from 'node:assert/strict';
import test from 'node:test';

import { ValidationError } from '../src/lib/canonical.mjs';
import {
  deriveSemanticMemoryProvenance,
  normalizeSemanticMemoryProvenance,
  ownerReviewSemanticMemory,
  semanticMemoryReviewRequestDigest,
  verifySemanticMemoryReviewedFromProvenance
} from '../src/lib/semantic-memory-provenance.mjs';

// #1918 residual (from the #1939 review): deriveSemanticMemoryProvenance copied
// a reviewed parent's origin_principal (and origin_runtime_id) into the child
// even when those fields had been changed after the review. A reviewed
// parent's origin is bound by its reviewed_from_provenance_digest (#1937), so
// derive now copies it only when the parent's own pre-review provenance
// reproduces that digest. Deny-only: genuine parents derive exactly as before.

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);
const OWNER = 'owner.alice';
const DECISIONS = ['approve-memory', 'approve-instruction', 'quarantine', 'reject'];
const CHILD = { object_id: 'memory.child.1', content_digest: C };

function review(record, decision) {
  return ownerReviewSemanticMemory(record, {
    actor_id: OWNER,
    review_request_digest: semanticMemoryReviewRequestDigest(record, decision),
    decision
  });
}

function base(overrides = {}) {
  return normalizeSemanticMemoryProvenance({
    object_id: 'memory.parent.1',
    owner: OWNER,
    content_digest: A,
    origin_class: 'remote-agent',
    origin_principal: 'agent.remote.1',
    origin_artifact_digest: B,
    semantic_class: 'instruction-candidate',
    ...overrides
  });
}

function tamper(record, changes) {
  const { provenance_digest: _digest, ...fields } = record;
  return normalizeSemanticMemoryProvenance({ ...fields, ...changes });
}

function assertDeriveDenied(parent, label) {
  assert.throws(
    () => deriveSemanticMemoryProvenance(parent, CHILD),
    error => error instanceof ValidationError
      && /pre-review provenance reproduces/.test(error.message),
    label
  );
}

test('derive rejects a reviewed parent whose origin_principal was changed after review, for every decision', () => {
  for (const decision of DECISIONS) {
    const reviewed = review(base(), decision);
    const tampered = tamper(reviewed, { origin_principal: 'agent.attacker' });
    // The tampered parent still normalizes on its own; only the pre-review
    // recompute exposes it.
    assert.equal(tampered.origin_principal, 'agent.attacker', decision);
    assert.throws(() => verifySemanticMemoryReviewedFromProvenance(tampered), ValidationError, decision);
    assertDeriveDenied(tampered, decision);
  }
});

test('derive rejects other post-review origin changes that the child would copy or bind', () => {
  const localReviewed = review(base({
    origin_class: 'local-model-generated',
    origin_principal: undefined,
    origin_runtime_id: 'runtime.local.1'
  }), 'approve-memory');
  const toolReviewed = review(base({ origin_class: 'tool-output', origin_principal: undefined }), 'approve-memory');
  const cases = {
    'changed origin_runtime_id': tamper(localReviewed, { origin_runtime_id: 'runtime.attacker' }),
    'added origin_principal': tamper(toolReviewed, { origin_principal: 'agent.attacker' }),
    'removed origin_principal': tamper(review(base({ origin_class: 'tool-output' }), 'approve-memory'), {
      origin_principal: undefined
    }),
    'changed origin_artifact_digest': tamper(toolReviewed, { origin_artifact_digest: C }),
    'changed semantic_class': tamper(toolReviewed, { semantic_class: 'procedure' })
  };
  for (const [label, parent] of Object.entries(cases)) assertDeriveDenied(parent, label);
});

test('derive from a genuinely reviewed parent is unchanged and copies the genuine origin', () => {
  for (const decision of DECISIONS) {
    const reviewed = review(base(), decision);
    const child = deriveSemanticMemoryProvenance(reviewed, CHILD);
    assert.equal(child.origin_principal, 'agent.remote.1', decision);
    assert.equal(child.origin_class, 'system-derived', decision);
    assert.equal(child.authority_tier, 'untrusted-data', decision);
    assert.equal(child.review_state, 'unreviewed', decision);
    assert.equal(child.parent_provenance_digest, reviewed.provenance_digest, decision);
    assert.equal(child.origin_artifact_digest, reviewed.provenance_digest, decision);
  }
  const local = review(base({
    origin_class: 'local-model-generated',
    origin_principal: undefined,
    origin_runtime_id: 'runtime.local.1'
  }), 'approve-memory');
  const localChild = deriveSemanticMemoryProvenance(local, CHILD);
  assert.equal(localChild.origin_runtime_id, 'runtime.local.1');
  assert.equal(localChild.origin_principal, OWNER);
});

test('derive from unreviewed, implicitly owner-reviewed and derived parents is unchanged', () => {
  const unreviewed = base();
  assert.equal(deriveSemanticMemoryProvenance(unreviewed, CHILD).origin_principal, 'agent.remote.1');
  const ownerKnowledge = normalizeSemanticMemoryProvenance({
    object_id: 'memory.owner.1',
    owner: OWNER,
    content_digest: A,
    origin_class: 'owner-authored',
    semantic_class: 'knowledge'
  });
  assert.equal(ownerKnowledge.review_state, 'owner-reviewed');
  assert.equal(deriveSemanticMemoryProvenance(ownerKnowledge, CHILD).origin_principal, OWNER);
  const child = deriveSemanticMemoryProvenance(unreviewed, CHILD);
  const grandchild = deriveSemanticMemoryProvenance(child, { object_id: 'memory.grandchild.1', content_digest: A });
  assert.equal(grandchild.origin_principal, 'agent.remote.1');
  assert.equal(grandchild.parent_provenance_digest, child.provenance_digest);
});

test('derive from a re-reviewed parent fails closed, like Grid verification of a re-review (#1939)', () => {
  const once = review(base(), 'approve-memory');
  const twice = review(once, 'quarantine');
  assert.throws(() => verifySemanticMemoryReviewedFromProvenance(twice), ValidationError);
  assertDeriveDenied(twice, 're-review');
});

test('a null reviewed_from_provenance_digest on Object.prototype does not deny deriving from an unreviewed parent', () => {
  const unreviewed = base();
  const expected = deriveSemanticMemoryProvenance(unreviewed, CHILD);
  Object.prototype.reviewed_from_provenance_digest = null;
  let derived;
  try {
    derived = deriveSemanticMemoryProvenance(unreviewed, CHILD);
  } finally {
    delete Object.prototype.reviewed_from_provenance_digest;
  }
  assert.equal(Object.hasOwn(Object.prototype, 'reviewed_from_provenance_digest'), false);
  assert.deepEqual(derived, expected);
});
