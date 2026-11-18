import assert from 'node:assert/strict';
import test from 'node:test';

import { sha256 } from '../src/lib/canonical.mjs';
import { intentRequestDigest } from '../src/lib/intent-binding.mjs';
import {
  normalizeSemanticMemoryProvenance,
  ownerReviewSemanticMemory,
  semanticMemoryReviewRequestDigest
} from '../src/lib/semantic-memory-provenance.mjs';
import { recordedSemanticMemoryReviewIntent } from '../src/lib/semantic-memory-grid-evidence.mjs';

function reviewedFixture() {
  const base = normalizeSemanticMemoryProvenance({
    object_id: 'memory.review.binding',
    owner: 'owner.alice',
    content_digest: sha256('binding content'),
    origin_class: 'retrieved-external',
    origin_artifact_digest: sha256('binding source'),
    semantic_class: 'instruction-candidate'
  });
  return ownerReviewSemanticMemory(base, {
    actor_id: base.owner,
    review_request_digest: semanticMemoryReviewRequestDigest(base, 'approve-instruction'),
    decision: 'approve-instruction'
  });
}

test('semantic review request digest survives normal human-principal normalization', () => {
  const record = reviewedFixture();
  const reviewIntent = recordedSemanticMemoryReviewIntent(record);
  const normalizedPrincipalShape = {
    ...reviewIntent,
    principal: {
      id: record.owner,
      type: 'human',
      roles: [],
      scopes: []
    },
    intent_id: 'intent.transient.fixture',
    confirmations: [],
    approval_ids: []
  };

  assert.equal(intentRequestDigest(reviewIntent), record.review_request_digest);
  assert.equal(intentRequestDigest(normalizedPrincipalShape), record.review_request_digest);
});

test('human principal identity is an independent evidence binding, not encoded by intentRequestDigest', () => {
  const record = reviewedFixture();
  const reviewIntent = recordedSemanticMemoryReviewIntent(record);
  const substitutedPrincipal = {
    ...reviewIntent,
    principal: { type: 'human', id: 'owner.mallory' }
  };

  assert.equal(intentRequestDigest(substitutedPrincipal), record.review_request_digest);
  assert.notEqual(substitutedPrincipal.principal.id, record.owner);
});
