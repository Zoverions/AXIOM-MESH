import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { digestObject, sha256 } from '../src/lib/canonical.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { intentRequestDigest } from '../src/lib/intent-binding.mjs';
import {
  evaluateSemanticMemoryUse,
  normalizeSemanticMemoryProvenance,
  ownerReviewSemanticMemory,
  semanticMemoryReviewRequestDigest
} from '../src/lib/semantic-memory-provenance.mjs';
import {
  recordedSemanticMemoryReviewIntent,
  verifySemanticMemoryGridEvidence
} from '../src/lib/semantic-memory-grid-evidence.mjs';
import { verifySemanticMemoryReviewFromGrid } from '../src/grid/semantic-memory-review-evidence.mjs';
import { GridStore } from '../src/grid/store.mjs';

// #1918 F-1: normalized records omit the review keys when unreviewed, so the
// Grid evidence verifier and the Grid adapter must read them own-only. A
// polluted Object.prototype must never turn an unreviewed record into
// verified owner-review evidence.

const REVIEW_KEYS = ['authority_tier', 'review_state', 'review_actor', 'review_request_digest', 'reviewed_from_provenance_digest', 'review_decision'];

async function storeFixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-semantic-review-own-'));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const store = new GridStore({ path: join(dataDir, 'grid.sqlite'), dataDir, identity, protector });
  t.after(async () => {
    store.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  return store;
}

function rawUnreviewed() {
  return {
    object_id: 'memory.remote.own-fields',
    owner: 'owner.alice',
    content_digest: sha256('semantic content'),
    origin_class: 'remote-agent',
    origin_principal: 'agent.remote.1',
    origin_artifact_digest: sha256('remote receipt'),
    semantic_class: 'instruction-candidate'
  };
}

// The unreviewed record as a caller would supply it: no authority_tier /
// review_state / review keys of its own (the defaults are unreviewed).
function fixtures() {
  const unreviewed = rawUnreviewed();
  const reviewed = ownerReviewSemanticMemory(unreviewed, {
    actor_id: unreviewed.owner,
    review_request_digest: semanticMemoryReviewRequestDigest(normalizeSemanticMemoryProvenance(unreviewed), 'approve-instruction'),
    decision: 'approve-instruction'
  });
  return { unreviewed, reviewed };
}

// A genuine, completed owner review of the record exists in the Grid.
function recordCompletedReview(store, record) {
  const intentId = 'intent.semantic.review.own';
  const traceId = 'trace.semantic.review.own';
  const reviewIntent = recordedSemanticMemoryReviewIntent(record);
  store.appendEvents({
    traceId,
    actor: record.owner,
    events: [{
      kind: 'intent.accepted',
      subject: intentId,
      payload: {
        intent_id: intentId,
        principal: record.owner,
        principal_type: 'human',
        action: reviewIntent.action,
        risk: 'low',
        input_digest: digestObject(reviewIntent.input),
        request_digest: intentRequestDigest(reviewIntent)
      }
    }]
  });
  store.appendEvents({
    traceId,
    actor: record.owner,
    events: [{
      kind: 'intent.completed',
      subject: intentId,
      payload: { intent_id: intentId, result: { intent_id: intentId, trace_id: traceId, status: 'completed' } }
    }]
  });
  return intentId;
}

function withReviewPollution(reviewed, fn) {
  const added = [];
  try {
    for (const key of REVIEW_KEYS) {
      Object.defineProperty(Object.prototype, key, { value: reviewed[key], configurable: true, writable: true });
      added.push(key);
    }
    return fn();
  } finally {
    for (const key of added) delete Object.prototype[key];
  }
}

test('red/green: a polluted unreviewed record fails the Grid adapter end-to-end', async t => {
  const store = await storeFixture(t);
  const { unreviewed, reviewed } = fixtures();
  recordCompletedReview(store, reviewed);
  // The genuine reviewed record verifies (sanity).
  assert.equal(verifySemanticMemoryReviewFromGrid(store, reviewed).review_decision, 'approve-instruction');

  withReviewPollution(reviewed, () => {
    // On f5d11c76 (and with only the normalizer fixed) this returned evidence
    // with review_decision approve-instruction for the unreviewed record.
    assert.throws(
      () => verifySemanticMemoryReviewFromGrid(store, { ...unreviewed }),
      /no explicit review request/
    );
    // The normalizer alone already yields an unreviewed record here.
    assert.equal(normalizeSemanticMemoryProvenance(unreviewed).review_state, 'unreviewed');
    // The genuine reviewed record (own review keys) is unaffected.
    assert.equal(verifySemanticMemoryReviewFromGrid(store, reviewed).review_decision, 'approve-instruction');
  });
  for (const key of REVIEW_KEYS) assert.equal(Object.hasOwn(Object.prototype, key), false);
});

test('red/green: verifySemanticMemoryGridEvidence and recordedSemanticMemoryReviewIntent read review keys own-only', async t => {
  const store = await storeFixture(t);
  const { unreviewed, reviewed } = fixtures();
  const intentId = recordCompletedReview(store, reviewed);
  const intent = store.getIntent(intentId);
  const events = store.db.prepare(`SELECT * FROM events WHERE subject = ? ORDER BY seq`).all(intentId)
    .map(row => store.decodeEventRow(row));
  const chain = store.requireIntentEvidenceChain();
  const expected = verifySemanticMemoryGridEvidence(reviewed, { intent, events, chain });

  withReviewPollution(reviewed, () => {
    assert.throws(
      () => verifySemanticMemoryGridEvidence(unreviewed, { intent, events, chain }),
      /no explicit owner review evidence/
    );
    assert.throws(() => recordedSemanticMemoryReviewIntent(unreviewed), /no explicit owner review evidence/);
    assert.deepEqual(verifySemanticMemoryGridEvidence(reviewed, { intent, events, chain }), expected);
    assert.deepEqual(
      evaluateSemanticMemoryUse(unreviewed, 'privileged-instruction', {
        verified_review_request_digest: reviewed.review_request_digest
      }),
      { allow: false, code: 'semantic_memory_instruction_denied' }
    );
  });
});

test('null options keep the TypeError main throws (pinned)', () => {
  const { reviewed } = fixtures();
  for (const options of [null]) {
    assert.throws(() => verifySemanticMemoryGridEvidence(reviewed, options), TypeError);
    assert.throws(() => ownerReviewSemanticMemory(reviewed, options), TypeError);
    assert.throws(() => evaluateSemanticMemoryUse(reviewed, 'privileged-instruction', options), TypeError);
  }
});
