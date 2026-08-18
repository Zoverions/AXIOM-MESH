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

async function storeFixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-semantic-review-'));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const store = new GridStore({
    path: join(dataDir, 'grid.sqlite'),
    dataDir,
    identity,
    protector
  });
  t.after(async () => {
    store.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  return store;
}

function reviewedInstruction() {
  const base = normalizeSemanticMemoryProvenance({
    object_id: 'memory.remote.review-fixture',
    owner: 'owner.alice',
    content_digest: sha256('semantic content'),
    origin_class: 'remote-agent',
    origin_principal: 'agent.remote.1',
    origin_artifact_digest: sha256('remote receipt'),
    semantic_class: 'instruction-candidate'
  });
  return ownerReviewSemanticMemory(base, {
    actor_id: base.owner,
    review_request_digest: semanticMemoryReviewRequestDigest(base, 'approve-instruction'),
    decision: 'approve-instruction'
  });
}

function appendAccepted(store, record, {
  intentId = 'intent.semantic.review.1',
  traceId = 'trace.semantic.review.1',
  actor = record.owner,
  principal = record.owner,
  principalType = 'human',
  action,
  requestDigest,
  inputDigest
} = {}) {
  const reviewIntent = recordedSemanticMemoryReviewIntent(record);
  store.appendEvents({
    traceId,
    actor,
    events: [{
      kind: 'intent.accepted',
      subject: intentId,
      payload: {
        intent_id: intentId,
        principal,
        principal_type: principalType,
        action: action ?? reviewIntent.action,
        risk: 'low',
        input_digest: inputDigest ?? digestObject(reviewIntent.input),
        request_digest: requestDigest ?? intentRequestDigest(reviewIntent)
      }
    }]
  });
  return { intentId, traceId, reviewIntent };
}

function appendCompleted(store, record, {
  intentId = 'intent.semantic.review.1',
  traceId = 'trace.semantic.review.1',
  actor = record.owner,
  resultTraceId = traceId
} = {}) {
  const result = {
    intent_id: intentId,
    trace_id: resultTraceId,
    status: 'completed'
  };
  store.appendEvents({
    traceId,
    actor,
    events: [{
      kind: 'intent.completed',
      subject: intentId,
      payload: { intent_id: intentId, result }
    }]
  });
  return result;
}

function appendDenied(store, record, {
  intentId = 'intent.semantic.review.1',
  traceId = 'trace.semantic.review.1'
} = {}) {
  store.appendEvents({
    traceId,
    actor: record.owner,
    events: [{
      kind: 'intent.denied',
      subject: intentId,
      payload: {
        intent_id: intentId,
        error: { code: 'policy_denied', message: 'denied for fixture' }
      }
    }]
  });
}

function intentEvents(store, intentId) {
  return store.db.prepare(`
    SELECT * FROM events
    WHERE subject = ?
      AND kind IN ('intent.accepted', 'intent.completed', 'intent.denied', 'intent.failed')
    ORDER BY seq
  `).all(intentId).map(row => store.decodeEventRow(row));
}

test('completed owner review becomes verified Grid evidence and can unlock semantic instruction use', async t => {
  const store = await storeFixture(t);
  const record = reviewedInstruction();
  const { intentId, traceId } = appendAccepted(store, record);
  appendCompleted(store, record, { intentId, traceId });

  const evidence = verifySemanticMemoryReviewFromGrid(store, record);
  assert.equal(evidence.owner, record.owner);
  assert.equal(evidence.object_id, record.object_id);
  assert.equal(evidence.review_decision, 'approve-instruction');
  assert.equal(evidence.verified_review_request_digest, record.review_request_digest);
  assert.equal(evidence.intent_id, intentId);
  assert.equal(evidence.trace_id, traceId);
  assert.equal(evidence.downstream_effect_authorized, false);

  const decision = evaluateSemanticMemoryUse(record, 'privileged-instruction', {
    verified_review_request_digest: evidence.verified_review_request_digest
  });
  assert.equal(decision.allow, true);
});

test('accepted review without completion is not verified authority evidence', async t => {
  const store = await storeFixture(t);
  const record = reviewedInstruction();
  appendAccepted(store, record);

  assert.throws(
    () => verifySemanticMemoryReviewFromGrid(store, record),
    error => error?.code === 'semantic_memory_review_not_completed'
  );
});

test('a denied review request cannot masquerade as owner review evidence', async t => {
  const store = await storeFixture(t);
  const record = reviewedInstruction();
  const { intentId, traceId } = appendAccepted(store, record);
  appendDenied(store, record, { intentId, traceId });

  assert.throws(
    () => verifySemanticMemoryReviewFromGrid(store, record),
    error => error?.code === 'semantic_memory_review_not_completed'
  );
});

test('a later completed retry can verify the same exact review request after an earlier denial', async t => {
  const store = await storeFixture(t);
  const record = reviewedInstruction();
  appendAccepted(store, record, {
    intentId: 'intent.semantic.review.denied',
    traceId: 'trace.semantic.review.denied'
  });
  appendDenied(store, record, {
    intentId: 'intent.semantic.review.denied',
    traceId: 'trace.semantic.review.denied'
  });
  appendAccepted(store, record, {
    intentId: 'intent.semantic.review.completed',
    traceId: 'trace.semantic.review.completed'
  });
  appendCompleted(store, record, {
    intentId: 'intent.semantic.review.completed',
    traceId: 'trace.semantic.review.completed'
  });

  const evidence = verifySemanticMemoryReviewFromGrid(store, record);
  assert.equal(evidence.intent_id, 'intent.semantic.review.completed');
});

test('the Grid adapter rejects a matching digest with the wrong action binding', async t => {
  const store = await storeFixture(t);
  const record = reviewedInstruction();
  const { intentId, traceId } = appendAccepted(store, record, {
    action: 'memory.put'
  });
  appendCompleted(store, record, { intentId, traceId });

  assert.throws(
    () => verifySemanticMemoryReviewFromGrid(store, record),
    /invalid principal or action/
  );
});

test('event trace substitution is rejected even when materialized intent is completed', async t => {
  const store = await storeFixture(t);
  const record = reviewedInstruction();
  const { intentId, traceId } = appendAccepted(store, record);
  appendCompleted(store, record, {
    intentId,
    traceId: 'trace.semantic.review.other',
    resultTraceId: traceId
  });

  assert.throws(
    () => verifySemanticMemoryReviewFromGrid(store, record),
    /ordering or actor\/trace binding is invalid/
  );
});

test('low-level verifier rejects caller-supplied terminal ambiguity', async t => {
  const store = await storeFixture(t);
  const record = reviewedInstruction();
  const { intentId, traceId } = appendAccepted(store, record);
  appendCompleted(store, record, { intentId, traceId });

  const intent = store.getIntent(intentId);
  const events = intentEvents(store, intentId);
  events.push({
    ...events[1],
    kind: 'intent.failed',
    payload: {
      intent_id: intentId,
      error: { code: 'synthetic', message: 'ambiguous terminal' }
    }
  });
  assert.throws(
    () => verifySemanticMemoryGridEvidence(record, {
      intent,
      events,
      chain: store.verifyFullChain()
    }),
    /denied or failed terminal event/
  );
});

test('full-chain corruption prevents the Grid adapter from issuing verified review evidence', async t => {
  const store = await storeFixture(t);
  const record = reviewedInstruction();
  const { intentId, traceId } = appendAccepted(store, record);
  appendCompleted(store, record, { intentId, traceId });

  store.db.prepare(`
    UPDATE events SET event_hash = ? WHERE seq = 1
  `).run('0'.repeat(64));

  assert.throws(
    () => verifySemanticMemoryReviewFromGrid(store, record),
    error => error?.code === 'integrity_verification_failed'
  );
});

test('recorded review intent reconstructs the exact owner request from post-review provenance', () => {
  const record = reviewedInstruction();
  const intent = recordedSemanticMemoryReviewIntent(record);
  assert.deepEqual(intent.principal, { type: 'human', id: record.owner });
  assert.equal(intent.action, 'memory.semantic.review');
  assert.equal(intent.input.object_id, record.object_id);
  assert.equal(intent.input.content_digest, record.content_digest);
  assert.equal(intent.input.current_provenance_digest, record.reviewed_from_provenance_digest);
  assert.equal(intent.input.decision, record.review_decision);
  assert.equal(intentRequestDigest(intent), record.review_request_digest);
});
