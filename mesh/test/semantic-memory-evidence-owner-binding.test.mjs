import assert from 'node:assert/strict';
import test from 'node:test';

import { sha256 } from '../src/lib/canonical.mjs';
import { intentRequestDigest } from '../src/lib/intent-binding.mjs';
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
import { recordedSemanticMemoryReviewIntent } from '../src/lib/semantic-memory-grid-evidence.mjs';
import {
  semanticMemoryGridEvidenceBinding,
  verifySemanticMemoryReviewFromGrid
} from '../src/grid/semantic-memory-review-evidence.mjs';
import {
  appendCompletedSemanticMemoryReview,
  semanticMemoryGridStore
} from '../test-support/semantic-memory-grid-review.mjs';

// #1918 (Verifier LOW from #1943): the owner is NOT part of the review request
// digest for a human principal. intentRequestBinding keeps action, input,
// purpose and data_scopes and drops principal.id, and the review input carries
// object_id, content_digest, the claimed pre-review provenance digest and the
// decision, but not the owner. The owner is therefore bound only by
//   1. the evidence #binding owner clause in evaluateSemanticMemoryUse, and
//   2. the #1937 pre-review provenance recompute (the owner is part of the
//      recomputed pre-review provenance digest).
// This test changes ONLY owner and review_actor on an otherwise genuine
// reviewed record, presents the genuine evidence of the original, and pins
// that the digest is unchanged and that the evidence owner clause (checked
// before the #1937 recompute) is what denies, on both evaluate paths.

const MISMATCH = 'semantic_memory_review_evidence_mismatch';

test('owner + review_actor swap on a genuine reviewed record: same request digest, evidence owner clause denies on both paths', async t => {
  const store = await semanticMemoryGridStore(t);
  const base = normalizeSemanticMemoryProvenance({
    object_id: 'memory.remote.owner-binding',
    owner: 'owner.alice',
    content_digest: sha256('owner-binding content'),
    origin_class: 'remote-agent',
    origin_principal: 'agent.remote.owner-binding',
    origin_artifact_digest: sha256('owner-binding source'),
    semantic_class: 'instruction-candidate'
  });
  const reviewed = ownerReviewSemanticMemory(base, {
    actor_id: 'owner.alice',
    review_request_digest: semanticMemoryReviewRequestDigest(base, 'approve-instruction'),
    decision: 'approve-instruction'
  });
  appendCompletedSemanticMemoryReview(store, reviewed);
  const evidence = verifySemanticMemoryReviewFromGrid(store, reviewed);
  assert.equal(semanticMemoryGridEvidenceBinding(evidence).owner, 'owner.alice');

  // Control: the genuine record with its genuine evidence is granted on both paths.
  const lifecycle = createSemanticMemoryLifecycle(reviewed);
  assert.equal(
    evaluateSemanticMemoryUse(reviewed, 'privileged-instruction', { verified_review_evidence: evidence }).code,
    'semantic_memory_instruction_allowed'
  );
  assert.equal(
    evaluateSemanticMemoryLifecycleUse(reviewed, lifecycle, 'privileged-instruction', { verified_review_evidence: evidence }).code,
    'semantic_memory_instruction_allowed'
  );

  // Only owner and review_actor change (review_actor must equal owner to stay
  // structurally eligible); every other field, including review_request_digest
  // and reviewed_from_provenance_digest, is the genuine record's.
  const { provenance_digest: _dropped, ...rest } = reviewed;
  const swapped = normalizeSemanticMemoryProvenance({ ...rest, owner: 'owner.mallory', review_actor: 'owner.mallory' });
  for (const key of Object.keys(reviewed)) {
    if (key === 'owner' || key === 'review_actor' || key === 'provenance_digest') continue;
    assert.deepEqual(swapped[key], reviewed[key], key);
  }

  // The request digest does not cover the owner: unchanged, both as carried
  // and as recomputed from the recorded review intent.
  assert.equal(swapped.review_request_digest, reviewed.review_request_digest);
  assert.equal(
    intentRequestDigest(recordedSemanticMemoryReviewIntent(swapped)),
    intentRequestDigest(recordedSemanticMemoryReviewIntent(reviewed))
  );

  // The evidence owner clause denies before the #1937 recompute is reached.
  const swappedLifecycle = createSemanticMemoryLifecycle(swapped);
  assert.deepEqual(
    evaluateSemanticMemoryUse(swapped, 'privileged-instruction', { verified_review_evidence: evidence }),
    { allow: false, code: MISMATCH }
  );
  const lifecycleDecision = evaluateSemanticMemoryLifecycleUse(swapped, swappedLifecycle, 'privileged-instruction', {
    verified_review_evidence: evidence
  });
  assert.equal(lifecycleDecision.allow, false);
  assert.equal(lifecycleDecision.code, MISMATCH);

  // And the Grid finds no review for the swapped record.
  assert.throws(() => verifySemanticMemoryReviewFromGrid(store, swapped));
});
