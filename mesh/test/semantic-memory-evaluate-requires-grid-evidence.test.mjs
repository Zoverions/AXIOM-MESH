import assert from 'node:assert/strict';
import test from 'node:test';

import { sha256 } from '../src/lib/canonical.mjs';
import {
  evaluateSemanticMemoryUse,
  normalizeSemanticMemoryProvenance,
  ownerReviewSemanticMemory,
  semanticMemoryReviewRequestDigest
} from '../src/lib/semantic-memory-provenance.mjs';
import {
  createSemanticMemoryLifecycle,
  evaluateSemanticMemoryLifecycleUse
} from '../src/lib/semantic-memory-lifecycle.mjs';
import * as Adapter from '../src/grid/semantic-memory-review-evidence.mjs';
import { AcceptedSocialGridStore } from '../src/grid/accepted-social-store.mjs';
import {
  appendCompletedSemanticMemoryReview,
  semanticMemoryGridStore
} from '../test-support/semantic-memory-grid-review.mjs';

// HIGH (deny-only): evaluateSemanticMemoryUse and
// evaluateSemanticMemoryLifecycleUse granted semantic_memory_instruction_allowed
// on a bare `verified_review_request_digest` string. That string equals the
// record's own review_request_digest, which anyone can compute, so a forged
// self-asserted record plus its own digest was granted with no Grid at all.
//
// Now privileged-instruction use requires `verified_review_evidence`: the
// branded object verifySemanticMemoryReviewFromGrid returned for THIS record
// (owner, object_id, content_digest, review_request_digest, review_decision
// are bound in the evidence's private brand at mint time). A digest string
// under either option name, or any non-genuine object, throws a
// ValidationError (details.code 'semantic_memory_review_evidence_required').
//
// Every must-fail test below is red on 8b212985 (main before this change).

const { verifySemanticMemoryReviewFromGrid } = Adapter;
const OWNER = 'owner.alice';
const INSTRUCTION_ALLOWED = 'semantic_memory_instruction_allowed';
const EVIDENCE_REQUIRED = { name: 'ValidationError', details: { code: 'semantic_memory_review_evidence_required' } };
const MISMATCH = { allow: false, code: 'semantic_memory_review_evidence_mismatch' };
const UNVERIFIED = { allow: false, code: 'semantic_memory_review_evidence_unverified' };

function base(objectId, overrides = {}) {
  return normalizeSemanticMemoryProvenance({
    object_id: objectId,
    owner: OWNER,
    content_digest: sha256(`content ${objectId}`),
    origin_class: 'remote-agent',
    origin_principal: 'agent.remote.1',
    origin_artifact_digest: sha256(`source ${objectId}`),
    semantic_class: 'instruction-candidate',
    ...overrides
  });
}

// ownerReviewSemanticMemory is not authenticated: this is a self-asserted claim
// until a Grid review of it exists.
function review(record, decision = 'approve-instruction') {
  return ownerReviewSemanticMemory(record, {
    actor_id: record.owner,
    review_request_digest: semanticMemoryReviewRequestDigest(record, decision),
    decision
  });
}

// Both evaluate paths, privileged-instruction, with the same options.
function bothPaths(record, options) {
  const lifecycle = createSemanticMemoryLifecycle(record);
  return [
    ['evaluateSemanticMemoryUse', () => evaluateSemanticMemoryUse(record, 'privileged-instruction', options)],
    ['evaluateSemanticMemoryLifecycleUse', () => evaluateSemanticMemoryLifecycleUse(record, lifecycle, 'privileged-instruction', options)]
  ];
}

function assertThrowsEvidenceRequired(record, options, label) {
  for (const [path, run] of bothPaths(record, options)) {
    assert.throws(run, EVIDENCE_REQUIRED, `${label} (${path})`);
  }
}

function assertReturns(record, options, expected, label) {
  for (const [path, run] of bothPaths(record, options)) {
    const { lifecycle_digest: _ignored, ...decision } = run();
    assert.deepEqual(decision, expected, `${label} (${path})`);
  }
}

function assertGrants(record, evidence, label) {
  for (const [path, run] of bothPaths(record, { verified_review_evidence: evidence })) {
    assert.equal(run().code, INSTRUCTION_ALLOWED, `${label} (${path})`);
  }
}

async function genuineReview(t, record, StoreClass) {
  const store = await semanticMemoryGridStore(t, StoreClass);
  appendCompletedSemanticMemoryReview(store, record);
  return { store, evidence: verifySemanticMemoryReviewFromGrid(store, record) };
}

test('must-fail (1): a forged self-asserted record plus its own review_request_digest string is denied (throws)', async t => {
  const forged = review(base('memory.forged.self-asserted'));
  // No Grid review exists for it anywhere.
  const store = await semanticMemoryGridStore(t);
  assert.throws(() => verifySemanticMemoryReviewFromGrid(store, forged), { code: 'semantic_memory_review_evidence_not_found' });
  // On 8b212985 both paths returned semantic_memory_instruction_allowed.
  assertThrowsEvidenceRequired(forged, { verified_review_request_digest: forged.review_request_digest }, 'removed option');
  assertThrowsEvidenceRequired(forged, { verified_review_evidence: forged.review_request_digest }, 'string as evidence');
  // A record that is not even instruction-eligible is refused the same way.
  const memoryOnly = review(base('memory.forged.approve-memory'), 'approve-memory');
  assertThrowsEvidenceRequired(memoryOnly, { verified_review_request_digest: memoryOnly.review_request_digest }, 'approve-memory record');
});

test('must-fail (2): a genuinely Grid-reviewed record\'s digest string without the evidence object is denied (throws)', async t => {
  const record = review(base('memory.genuine.string-only'));
  const { evidence } = await genuineReview(t, record);
  for (const digest of [record.review_request_digest, evidence.verified_review_request_digest, Adapter.semanticMemoryGridEvidenceDigest(evidence)]) {
    assertThrowsEvidenceRequired(record, { verified_review_request_digest: digest }, 'removed option');
    assertThrowsEvidenceRequired(record, { verified_review_evidence: digest }, 'string as evidence');
    // Supplying the removed option next to genuine evidence is still refused.
    assertThrowsEvidenceRequired(record, { verified_review_evidence: evidence, verified_review_request_digest: digest }, 'both options');
  }
  assertGrants(record, evidence, 'the evidence object itself');
});

test('must-fail (3): genuine evidence for record A does not verify record B (cross-record replay)', async t => {
  const recordA = review(base('memory.replay.a'));
  const recordB = review(base('memory.replay.b'));
  const store = await semanticMemoryGridStore(t);
  appendCompletedSemanticMemoryReview(store, recordA);
  appendCompletedSemanticMemoryReview(store, recordB);
  const evidenceA = verifySemanticMemoryReviewFromGrid(store, recordA);
  const evidenceB = verifySemanticMemoryReviewFromGrid(store, recordB);
  assertGrants(recordA, evidenceA, 'A with A');
  assertGrants(recordB, evidenceB, 'B with B');
  assertReturns(recordB, { verified_review_evidence: evidenceA }, MISMATCH, 'B with A');
  assertReturns(recordA, { verified_review_evidence: evidenceB }, MISMATCH, 'A with B');
  // A forged record (no Grid review) with someone else's genuine evidence.
  const forged = review(base('memory.replay.forged'));
  assertReturns(forged, { verified_review_evidence: evidenceA }, MISMATCH, 'forged with A');
  // Same object_id and owner, different content: still another record.
  const sameIdOtherContent = review(base('memory.replay.a', { content_digest: sha256('other content') }));
  assertReturns(sameIdOtherContent, { verified_review_evidence: evidenceA }, MISMATCH, 'same id, other content');
  // Same object and content, different owner.
  const otherOwner = review(base('memory.replay.a', { owner: 'owner.mallory' }));
  assertReturns(otherOwner, { verified_review_evidence: evidenceA }, MISMATCH, 'same id, other owner');
  // Same object, owner, content and decision but a different (self-consistent)
  // origin: a different review request, so a different record.
  const otherOrigin = review(base('memory.replay.a', { origin_principal: 'agent.remote.2' }));
  assert.notEqual(otherOrigin.review_request_digest, recordA.review_request_digest);
  assertReturns(otherOrigin, { verified_review_evidence: evidenceA }, MISMATCH, 'same id, other origin');
  // The binding is frozen: it cannot be re-targeted at another record.
  const binding = Adapter.semanticMemoryGridEvidenceBinding(evidenceA);
  assert.ok(Object.isFrozen(binding));
  for (const [key, value] of Object.entries({ object_id: recordB.object_id, content_digest: recordB.content_digest, review_request_digest: recordB.review_request_digest })) {
    assert.equal(Reflect.set(binding, key, value), false, key);
  }
  assertReturns(recordB, { verified_review_evidence: evidenceA }, MISMATCH, 'B with A after a re-target attempt');
  assertGrants(recordA, evidenceA, 'A with A after a re-target attempt');
});

test('must-fail (4): evidence for an approve-memory review does not verify an approve-instruction record', async t => {
  const unreviewed = base('memory.decision');
  const approvedMemory = review(unreviewed, 'approve-memory');
  const approvedInstruction = review(unreviewed, 'approve-instruction');
  const store = await semanticMemoryGridStore(t);
  appendCompletedSemanticMemoryReview(store, approvedMemory);
  appendCompletedSemanticMemoryReview(store, approvedInstruction);
  const memoryEvidence = verifySemanticMemoryReviewFromGrid(store, approvedMemory);
  const instructionEvidence = verifySemanticMemoryReviewFromGrid(store, approvedInstruction);
  assert.equal(Adapter.semanticMemoryGridEvidenceBinding(memoryEvidence).review_decision, 'approve-memory');
  assert.equal(Adapter.semanticMemoryGridEvidenceBinding(instructionEvidence).review_decision, 'approve-instruction');
  // Same object, owner and content; only the decision (and so the request digest) differs.
  assertReturns(approvedInstruction, { verified_review_evidence: memoryEvidence }, MISMATCH, 'approve-memory evidence');
  assertGrants(approvedInstruction, instructionEvidence, 'approve-instruction evidence');
  // An approve-memory record is never instruction-eligible, even with its own evidence.
  assertReturns(approvedMemory, { verified_review_evidence: memoryEvidence },
    { allow: false, code: 'semantic_memory_instruction_denied' }, 'approve-memory record');
});

test('must-fail (5): hand-built, copied, Proxy-wrapped or Object.create\'d evidence is not evidence (throws)', async t => {
  const record = review(base('memory.lookalike'));
  const { evidence } = await genuineReview(t, record);
  const deepCopy = Object.freeze({
    ...JSON.parse(JSON.stringify(evidence)),
    accepted: Object.freeze({ ...evidence.accepted }),
    completed: Object.freeze({ ...evidence.completed }),
    chain: Object.freeze({ ...evidence.chain })
  });
  assert.deepEqual(deepCopy, evidence);
  const lookalikes = [
    ['hand-built (identical fields, frozen)', deepCopy],
    ['spread', { ...evidence }],
    ['Object.assign', Object.assign({}, evidence)],
    ['structuredClone', structuredClone(evidence)],
    ['Proxy(evidence)', new Proxy(evidence, {})],
    ['Proxy with a get trap', new Proxy(evidence, { get: (target, key) => Reflect.get(target, key) })],
    ['Object.create(evidence)', Object.create(evidence)],
    ['Object.create(evidence) with own fields', Object.create(evidence, Object.getOwnPropertyDescriptors(evidence))],
    ['empty object', {}],
    ['null', null],
    ['array', [evidence]],
    ['function', () => evidence],
    ['number', 1],
    ['true', true]
  ];
  for (const [label, value] of lookalikes) {
    assert.equal(Adapter.isSemanticMemoryGridEvidence(value), false, label);
    assertThrowsEvidenceRequired(record, { verified_review_evidence: value }, label);
  }
  assertGrants(record, evidence, 'genuine');
});

test('must-fail (6): evidence reachable only through Object.prototype (or any inherited option) grants nothing', async t => {
  const record = review(base('memory.inherited'));
  const { evidence } = await genuineReview(t, record);
  const saved = Object.getOwnPropertyDescriptor(Object.prototype, 'verified_review_evidence');
  Object.defineProperty(Object.prototype, 'verified_review_evidence', { value: evidence, configurable: true, writable: true });
  let results;
  try {
    results = [undefined, {}].flatMap(options => bothPaths(record, options).map(([, run]) => {
      const { lifecycle_digest: _ignored, ...decision } = run();
      return decision;
    }));
    // Own evidence still grants under the pollution.
    assertGrants(record, evidence, 'own evidence under pollution');
  } finally {
    if (saved) Object.defineProperty(Object.prototype, 'verified_review_evidence', saved);
    else delete Object.prototype.verified_review_evidence;
  }
  assert.equal(Object.hasOwn(Object.prototype, 'verified_review_evidence'), false);
  for (const decision of results) assert.deepEqual(decision, UNVERIFIED);
  // An inherited option on a non-Object.prototype chain reads as absent too.
  for (const options of [Object.create({ verified_review_evidence: evidence }), Object.create(Object.create({ verified_review_evidence: evidence }))]) {
    assertReturns(record, options, UNVERIFIED, 'inherited option');
  }
});

test('green: every genuine GridStore flow still grants exactly as before', async t => {
  for (const [label, StoreClass] of [['GridStore', undefined], ['AcceptedSocialGridStore', AcceptedSocialGridStore]]) {
    const record = review(base(`memory.green.${label}`));
    const { evidence } = await genuineReview(t, record, StoreClass);
    assert.equal(Adapter.isSemanticMemoryGridEvidence(evidence), true);
    assert.deepEqual(Adapter.semanticMemoryGridEvidenceBinding(evidence), {
      owner: record.owner,
      object_id: record.object_id,
      content_digest: record.content_digest,
      review_request_digest: record.review_request_digest,
      review_decision: 'approve-instruction'
    });
    const options = { verified_review_evidence: evidence };
    assert.deepEqual(evaluateSemanticMemoryUse(record, 'privileged-instruction', options), {
      allow: true,
      code: INSTRUCTION_ALLOWED,
      provenance_digest: record.provenance_digest,
      review_request_digest: record.review_request_digest
    }, label);
    const unbounded = createSemanticMemoryLifecycle(record);
    const bounded = createSemanticMemoryLifecycle(record, { retention_mode: 'bounded', expires_at: '2999-01-01T00:00:00.000Z' });
    for (const lifecycle of [unbounded, bounded]) {
      assert.deepEqual(evaluateSemanticMemoryLifecycleUse(record, lifecycle, 'privileged-instruction', options), {
        allow: true,
        code: INSTRUCTION_ALLOWED,
        provenance_digest: record.provenance_digest,
        review_request_digest: record.review_request_digest,
        lifecycle_digest: lifecycle.lifecycle_digest
      }, label);
    }
    // Expired bounded lifecycle still expires first; other usages ignore the evidence.
    const expired = createSemanticMemoryLifecycle(record, { retention_mode: 'bounded', expires_at: '2000-01-01T00:00:00.000Z' });
    assert.equal(evaluateSemanticMemoryLifecycleUse(record, expired, 'privileged-instruction', options).code, 'semantic_memory_expired');
    assert.deepEqual(evaluateSemanticMemoryUse(record, 'ordinary-retrieval', options), evaluateSemanticMemoryUse(record, 'ordinary-retrieval'));
    assert.deepEqual(evaluateSemanticMemoryUse(record, 'authority-mutation', options), { allow: false, code: 'semantic_memory_cannot_mutate_authority' });
  }
});
