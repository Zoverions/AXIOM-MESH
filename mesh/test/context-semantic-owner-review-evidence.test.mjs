import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { intentRequestDigest } from '../src/lib/intent-binding.mjs';
import { LOCAL_CONTEXT_CANDIDATE_SCHEMA } from '../src/lib/context-claim-resolution.mjs';
import { createLocalContextSemanticTrust } from '../src/lib/context-semantic-trust.mjs';
import {
  LOCAL_CONTEXT_SEMANTIC_REVIEW_ACTION,
  LOCAL_CONTEXT_SEMANTIC_REVIEW_DATA_SCOPE,
  LOCAL_CONTEXT_SEMANTIC_REVIEW_EVIDENCE_SCHEMA,
  LOCAL_CONTEXT_SEMANTIC_REVIEW_PURPOSE,
  createLocalContextSemanticReviewIntent,
  validateLocalContextSemanticReviewEvidence,
  verifyAcceptedLocalContextSemanticReview
} from '../src/lib/context-semantic-review-evidence.mjs';
import { verifyLocalContextSemanticReviewFromGrid } from '../src/grid/context-semantic-review-evidence.mjs';
import { GridStore } from '../src/grid/store.mjs';

function candidate() {
  return {
    schema: LOCAL_CONTEXT_CANDIDATE_SCHEMA,
    claim_id: 'claim.semantic.review.1',
    owner_subject_ref: 'owner.alice',
    semantic_type: 'preference.communication-style',
    value: { preference: 'concise' },
    disclosure_type: 'verbatim-approved',
    sensitivity: 'ordinary-private',
    confidence: 0.9,
    limitations: 'Fixture data for owner semantic-review evidence.',
    source_vault_id: 'vault.personal',
    source_resource_refs: ['resource.note.1'],
    observed_at: '2026-08-24T12:00:00.000Z',
    valid_from: '2026-08-24T12:00:00.000Z',
    valid_until: null,
    supersedes: [],
    contradicts: [],
    authority_effect: 'none'
  };
}

function trust(value = candidate()) {
  return createLocalContextSemanticTrust(value, {
    origin_class: 'retrieved-external',
    semantic_class: 'knowledge',
    source_evidence_digest: 'a'.repeat(64),
    review_state: 'unreviewed',
    retention_mode: 'owner-controlled'
  });
}

async function storeFixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-context-semantic-review-'));
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

function reviewFixture({ decision = 'accept-data', targetSemanticClass = 'preference' } = {}) {
  const value = candidate();
  const semanticTrust = trust(value);
  const intent = createLocalContextSemanticReviewIntent(value, semanticTrust, {
    decision,
    targetSemanticClass
  });
  return { value, semanticTrust, intent };
}

function appendAccepted(store, fixture, {
  intentId = 'intent.semantic.review.1',
  traceId = 'trace.semantic.review.1',
  actor = fixture.intent.principal.id,
  principal = fixture.intent.principal.id,
  action = fixture.intent.action,
  requestDigest = intentRequestDigest(fixture.intent),
  inputDigest = digestObject(fixture.intent.input)
} = {}) {
  const [event] = store.appendEvents({
    traceId,
    actor,
    events: [{
      kind: 'intent.accepted',
      subject: intentId,
      payload: {
        intent_id: intentId,
        principal,
        action,
        risk: 'low',
        input_digest: inputDigest,
        request_digest: requestDigest
      }
    }]
  });
  return { event, intentId, traceId };
}

function appendCompleted(store, fixture, {
  intentId = 'intent.semantic.review.1',
  traceId = 'trace.semantic.review.1',
  actor = fixture.intent.principal.id,
  resultTraceId = traceId
} = {}) {
  const result = {
    intent_id: intentId,
    trace_id: resultTraceId,
    status: 'completed'
  };
  const [event] = store.appendEvents({
    traceId,
    actor,
    events: [{
      kind: 'intent.completed',
      subject: intentId,
      payload: { intent_id: intentId, result }
    }]
  });
  return { event, result };
}

function appendDenied(store, fixture, {
  intentId = 'intent.semantic.review.1',
  traceId = 'trace.semantic.review.1'
} = {}) {
  store.appendEvents({
    traceId,
    actor: fixture.intent.principal.id,
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

test('completed owner review becomes full-Grid verified evidence but remains non-authorizing', async t => {
  const store = await storeFixture(t);
  const fixture = reviewFixture();
  const accepted = appendAccepted(store, fixture);
  const completed = appendCompleted(store, fixture, accepted);

  const evidence = verifyLocalContextSemanticReviewFromGrid(store, {
    candidate: fixture.value,
    trust: fixture.semanticTrust,
    intent: fixture.intent
  });
  assert.equal(evidence.schema, LOCAL_CONTEXT_SEMANTIC_REVIEW_EVIDENCE_SCHEMA);
  assert.equal(evidence.owner_subject_ref, 'owner.alice');
  assert.equal(evidence.decision, 'accept-data');
  assert.equal(evidence.resulting_review_state, 'owner-reviewed');
  assert.equal(evidence.accepted_event_id, accepted.event.event_id);
  assert.equal(evidence.completed_event_id, completed.event.event_id);
  assert.equal(evidence.accepted_intent_verified, true);
  assert.equal(evidence.completed_intent_verified, true);
  assert.equal(evidence.materialized_completed_intent_verified, true);
  assert.equal(evidence.terminal_history_unambiguous, true);
  assert.equal(evidence.full_grid_chain_verified, true);
  assert.equal(evidence.retained_external_head_verified, false);
  assert.equal(evidence.review_evidence_verified, true);
  assert.equal(evidence.classification_effect, 'evidence-only');
  assert.equal(evidence.review_applied_to_store, false);
  assert.equal(evidence.instruction_semantics, false);
  assert.equal(evidence.owner_instruction_use_enabled, false);
  assert.equal(evidence.authority_effect, 'none');
  assert.equal(evidence.grants_vault_access, false);
  assert.equal(evidence.grants_execution_authority, false);
  assert.deepEqual(validateLocalContextSemanticReviewEvidence(evidence), evidence);
});

test('accepted-only review can never become verified review evidence', async t => {
  const store = await storeFixture(t);
  const fixture = reviewFixture();
  appendAccepted(store, fixture);

  assert.throws(
    () => verifyAcceptedLocalContextSemanticReview(),
    /completed full-Grid evidence is required/
  );
  assert.throws(
    () => verifyLocalContextSemanticReviewFromGrid(store, {
      candidate: fixture.value,
      trust: fixture.semanticTrust,
      intent: fixture.intent
    }),
    error => error?.code === 'context_semantic_review_not_completed'
  );
});

test('denied review cannot masquerade as successful review evidence', async t => {
  const store = await storeFixture(t);
  const fixture = reviewFixture({ decision: 'quarantine', targetSemanticClass: 'knowledge' });
  const accepted = appendAccepted(store, fixture);
  appendDenied(store, fixture, accepted);

  assert.throws(
    () => verifyLocalContextSemanticReviewFromGrid(store, {
      candidate: fixture.value,
      trust: fixture.semanticTrust,
      intent: fixture.intent
    }),
    error => error?.code === 'context_semantic_review_not_completed'
  );
});

test('later successful retry of identical review may verify after an earlier denial', async t => {
  const store = await storeFixture(t);
  const fixture = reviewFixture();
  const first = appendAccepted(store, fixture, {
    intentId: 'intent.semantic.review.denied',
    traceId: 'trace.semantic.review.denied'
  });
  appendDenied(store, fixture, first);
  const second = appendAccepted(store, fixture, {
    intentId: 'intent.semantic.review.completed',
    traceId: 'trace.semantic.review.completed'
  });
  appendCompleted(store, fixture, second);

  const evidence = verifyLocalContextSemanticReviewFromGrid(store, {
    candidate: fixture.value,
    trust: fixture.semanticTrust,
    intent: fixture.intent
  });
  assert.equal(evidence.intent_id, second.intentId);
  assert.equal(evidence.completed_intent_verified, true);
});

test('wrong action or request binding cannot verify even when an intent completes', async t => {
  const store = await storeFixture(t);
  const fixture = reviewFixture();
  const wrong = appendAccepted(store, fixture, {
    action: 'system.echo'
  });
  appendCompleted(store, fixture, wrong);

  assert.throws(
    () => verifyLocalContextSemanticReviewFromGrid(store, {
      candidate: fixture.value,
      trust: fixture.semanticTrust,
      intent: fixture.intent
    }),
    /semantic review acceptance has invalid owner or action/
  );
});

test('full-chain corruption prevents review evidence issuance', async t => {
  const store = await storeFixture(t);
  const fixture = reviewFixture();
  const accepted = appendAccepted(store, fixture);
  appendCompleted(store, fixture, accepted);
  store.db.prepare('UPDATE events SET event_hash = ? WHERE event_id = ?').run(
    'f'.repeat(64),
    accepted.event.event_id
  );

  assert.throws(
    () => verifyLocalContextSemanticReviewFromGrid(store, {
      candidate: fixture.value,
      trust: fixture.semanticTrust,
      intent: fixture.intent
    }),
    error => error?.code === 'integrity_verification_failed'
  );
});

test('instruction-candidate remains only a label after completed review', async t => {
  const store = await storeFixture(t);
  const fixture = reviewFixture({
    decision: 'accept-data',
    targetSemanticClass: 'instruction-candidate'
  });
  const accepted = appendAccepted(store, fixture);
  appendCompleted(store, fixture, accepted);
  const evidence = verifyLocalContextSemanticReviewFromGrid(store, {
    candidate: fixture.value,
    trust: fixture.semanticTrust,
    intent: fixture.intent
  });
  assert.equal(evidence.target_semantic_class, 'instruction-candidate');
  assert.equal(evidence.instruction_semantics, false);
  assert.equal(evidence.owner_instruction_use_enabled, false);
  assert.equal(evidence.authority_effect, 'none');
});

test('review evidence fixed non-authority semantics cannot be elevated', async t => {
  const store = await storeFixture(t);
  const fixture = reviewFixture();
  const accepted = appendAccepted(store, fixture);
  appendCompleted(store, fixture, accepted);
  const evidence = verifyLocalContextSemanticReviewFromGrid(store, {
    candidate: fixture.value,
    trust: fixture.semanticTrust,
    intent: fixture.intent
  });

  for (const [field, value] of [
    ['retained_external_head_verified', true],
    ['review_applied_to_store', true],
    ['instruction_semantics', true],
    ['owner_instruction_use_enabled', true],
    ['authority_effect', 'grant'],
    ['grants_vault_access', true],
    ['grants_execution_authority', true],
    ['may_authorize_tools', true],
    ['may_modify_policy', true],
    ['may_self_persist', true]
  ]) {
    const elevated = structuredClone(evidence);
    elevated[field] = value;
    assert.throws(
      () => validateLocalContextSemanticReviewEvidence(elevated),
      new RegExp(`${field} must remain`)
    );
  }
});

test('review intent remains exactly scoped to human-owner semantic governance', () => {
  const fixture = reviewFixture({ decision: 'reject', targetSemanticClass: 'procedure' });
  assert.deepEqual(fixture.intent.principal, { id: 'owner.alice', type: 'human' });
  assert.equal(fixture.intent.action, LOCAL_CONTEXT_SEMANTIC_REVIEW_ACTION);
  assert.equal(fixture.intent.purpose, LOCAL_CONTEXT_SEMANTIC_REVIEW_PURPOSE);
  assert.deepEqual(fixture.intent.data_scopes, [LOCAL_CONTEXT_SEMANTIC_REVIEW_DATA_SCOPE]);
  assert.equal(fixture.intent.input.prior_trust_digest, fixture.semanticTrust.trust_digest);
  assert.equal(fixture.intent.input.candidate_digest, fixture.semanticTrust.candidate_digest);
});
