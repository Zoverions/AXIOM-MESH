import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import { MeshIdentity } from '../src/lib/identity.mjs';
import { intentRequestDigest } from '../src/lib/intent-binding.mjs';
import { LOCAL_CONTEXT_CANDIDATE_SCHEMA } from '../src/lib/context-claim-resolution.mjs';
import {
  createLocalContextSemanticTrust
} from '../src/lib/context-semantic-trust.mjs';
import {
  LOCAL_CONTEXT_SEMANTIC_REVIEW_ACTION,
  LOCAL_CONTEXT_SEMANTIC_REVIEW_DATA_SCOPE,
  LOCAL_CONTEXT_SEMANTIC_REVIEW_EVIDENCE_SCHEMA,
  LOCAL_CONTEXT_SEMANTIC_REVIEW_PURPOSE,
  createLocalContextSemanticReviewIntent,
  validateLocalContextSemanticReviewEvidence,
  verifyAcceptedLocalContextSemanticReview
} from '../src/lib/context-semantic-review-evidence.mjs';

const ZERO = '0'.repeat(64);

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

function gridIdentity() {
  const pair = generateKeyPairSync('ed25519');
  return new MeshIdentity(
    'grid',
    pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    pair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
  );
}

function acceptedReview(identity, intent, {
  intentId = 'intent.semantic.review.1',
  eventId = 'evt.semantic.review.1',
  actor = intent.principal.id,
  principal = intent.principal.id,
  action = intent.action,
  requestDigest = intentRequestDigest(intent),
  inputDigest = digestObject(intent.input),
  seq = 42,
  prevHash = ZERO
} = {}) {
  const payload = {
    intent_id: intentId,
    principal,
    action,
    risk: 'low',
    input_digest: inputDigest,
    request_digest: requestDigest
  };
  const envelope = {
    seq,
    event_id: eventId,
    trace_id: 'trace.semantic.review.1',
    actor,
    kind: 'intent.accepted',
    subject: intentId,
    occurred_at: '2026-08-24T12:05:00.000Z',
    payload_digest: digestObject(payload),
    prev_hash: prevHash
  };
  const event_hash = digestObject(envelope);
  return {
    event: {
      ...envelope,
      event_hash,
      signature: identity.signObject({ event_hash })
    },
    payload
  };
}

function acceptedEvidence({
  decision = 'accept-data',
  targetSemanticClass = 'preference'
} = {}) {
  const value = candidate();
  const semanticTrust = trust(value);
  const intent = createLocalContextSemanticReviewIntent(value, semanticTrust, {
    decision,
    targetSemanticClass
  });
  const grid = gridIdentity();
  const accepted = acceptedReview(grid, intent);
  const evidence = verifyAcceptedLocalContextSemanticReview({
    candidate: value,
    trust: semanticTrust,
    intent,
    acceptedEvent: accepted.event,
    acceptedPayload: accepted.payload,
    trustedGridPublicKey: grid.publicKey
  });
  return { value, semanticTrust, intent, grid, accepted, evidence };
}

test('A7 owner semantic review verifies exact Grid-signed acceptance but remains evidence-only', () => {
  const fixture = acceptedEvidence();
  const evidence = fixture.evidence;
  assert.equal(evidence.schema, LOCAL_CONTEXT_SEMANTIC_REVIEW_EVIDENCE_SCHEMA);
  assert.equal(evidence.owner_subject_ref, 'owner.alice');
  assert.equal(evidence.decision, 'accept-data');
  assert.equal(evidence.target_semantic_class, 'preference');
  assert.equal(evidence.resulting_review_state, 'owner-reviewed');
  assert.equal(evidence.grid_signature_verified, true);
  assert.equal(evidence.accepted_intent_verified, true);
  assert.equal(evidence.review_evidence_verified, true);
  assert.equal(evidence.grid_trust_root_source_verified, false);
  assert.equal(evidence.event_chain_currentness_verified, false);
  assert.equal(evidence.classification_effect, 'evidence-only');
  assert.equal(evidence.review_applied_to_store, false);
  assert.equal(evidence.instruction_semantics, false);
  assert.equal(evidence.owner_instruction_use_enabled, false);
  assert.equal(evidence.authority_effect, 'none');
  assert.equal(evidence.grants_vault_access, false);
  assert.equal(evidence.grants_execution_authority, false);
  assert.equal(evidence.may_authorize_tools, false);
  assert.equal(evidence.may_modify_policy, false);
  assert.equal(evidence.may_self_persist, false);
  assert.deepEqual(validateLocalContextSemanticReviewEvidence(evidence), evidence);
});

test('review intent is exactly scoped to owner semantic governance', () => {
  const value = candidate();
  const semanticTrust = trust(value);
  const intent = createLocalContextSemanticReviewIntent(value, semanticTrust, {
    decision: 'quarantine',
    targetSemanticClass: 'knowledge'
  });
  assert.deepEqual(intent.principal, { id: 'owner.alice', type: 'human' });
  assert.equal(intent.action, LOCAL_CONTEXT_SEMANTIC_REVIEW_ACTION);
  assert.equal(intent.purpose, LOCAL_CONTEXT_SEMANTIC_REVIEW_PURPOSE);
  assert.deepEqual(intent.data_scopes, [LOCAL_CONTEXT_SEMANTIC_REVIEW_DATA_SCOPE]);
  assert.equal(intent.input.prior_trust_digest, semanticTrust.trust_digest);
  assert.equal(intent.input.candidate_digest, semanticTrust.candidate_digest);
});

test('quarantine and rejection map deterministically without creating authority', () => {
  const quarantined = acceptedEvidence({ decision: 'quarantine', targetSemanticClass: 'knowledge' }).evidence;
  const rejected = acceptedEvidence({ decision: 'reject', targetSemanticClass: 'procedure' }).evidence;
  assert.equal(quarantined.resulting_review_state, 'quarantined');
  assert.equal(rejected.resulting_review_state, 'rejected');
  for (const evidence of [quarantined, rejected]) {
    assert.equal(evidence.review_applied_to_store, false);
    assert.equal(evidence.authority_effect, 'none');
    assert.equal(evidence.owner_instruction_use_enabled, false);
  }
});

test('instruction-candidate remains a label and never becomes instruction permission', () => {
  const evidence = acceptedEvidence({
    decision: 'accept-data',
    targetSemanticClass: 'instruction-candidate'
  }).evidence;
  assert.equal(evidence.target_semantic_class, 'instruction-candidate');
  assert.equal(evidence.resulting_review_state, 'owner-reviewed');
  assert.equal(evidence.instruction_semantics, false);
  assert.equal(evidence.owner_instruction_use_enabled, false);
  assert.equal(evidence.authority_effect, 'none');
});

test('candidate, prior trust and review-decision substitution fail closed', () => {
  const fixture = acceptedEvidence();

  const alteredIntent = structuredClone(fixture.intent);
  alteredIntent.input.target_semantic_class = 'procedure';
  assert.throws(() => verifyAcceptedLocalContextSemanticReview({
    candidate: fixture.value,
    trust: fixture.semanticTrust,
    intent: alteredIntent,
    acceptedEvent: fixture.accepted.event,
    acceptedPayload: fixture.accepted.payload,
    trustedGridPublicKey: fixture.grid.publicKey
  }), /does not match the exact owner review intent/);

  const differentTrust = createLocalContextSemanticTrust(fixture.value, {
    origin_class: 'retrieved-external',
    semantic_class: 'knowledge',
    source_evidence_digest: 'b'.repeat(64),
    review_state: 'unreviewed',
    retention_mode: 'owner-controlled'
  });
  assert.throws(() => verifyAcceptedLocalContextSemanticReview({
    candidate: fixture.value,
    trust: differentTrust,
    intent: fixture.intent,
    acceptedEvent: fixture.accepted.event,
    acceptedPayload: fixture.accepted.payload,
    trustedGridPublicKey: fixture.grid.publicKey
  }), /does not bind the exact candidate and prior trust state/);
});

test('owner, action, payload and Grid-key substitution fail closed', () => {
  const fixture = acceptedEvidence();

  const wrongOwner = acceptedReview(fixture.grid, fixture.intent, {
    actor: 'owner.mallory',
    principal: 'owner.mallory'
  });
  assert.throws(() => verifyAcceptedLocalContextSemanticReview({
    candidate: fixture.value,
    trust: fixture.semanticTrust,
    intent: fixture.intent,
    acceptedEvent: wrongOwner.event,
    acceptedPayload: wrongOwner.payload,
    trustedGridPublicKey: fixture.grid.publicKey
  }), /does not match the exact owner review intent/);

  const wrongAction = acceptedReview(fixture.grid, fixture.intent, {
    action: 'system.echo'
  });
  assert.throws(() => verifyAcceptedLocalContextSemanticReview({
    candidate: fixture.value,
    trust: fixture.semanticTrust,
    intent: fixture.intent,
    acceptedEvent: wrongAction.event,
    acceptedPayload: wrongAction.payload,
    trustedGridPublicKey: fixture.grid.publicKey
  }), /does not match the exact owner review intent/);

  const otherGrid = gridIdentity();
  assert.throws(() => verifyAcceptedLocalContextSemanticReview({
    candidate: fixture.value,
    trust: fixture.semanticTrust,
    intent: fixture.intent,
    acceptedEvent: fixture.accepted.event,
    acceptedPayload: fixture.accepted.payload,
    trustedGridPublicKey: otherGrid.publicKey
  }), /Grid signature is invalid/);
});

test('event and payload tamper fail before semantic review is accepted', () => {
  const fixture = acceptedEvidence();

  const payloadTamper = structuredClone(fixture.accepted.payload);
  payloadTamper.request_digest = 'f'.repeat(64);
  assert.throws(() => verifyAcceptedLocalContextSemanticReview({
    candidate: fixture.value,
    trust: fixture.semanticTrust,
    intent: fixture.intent,
    acceptedEvent: fixture.accepted.event,
    acceptedPayload: payloadTamper,
    trustedGridPublicKey: fixture.grid.publicKey
  }), /payload digest mismatch/);

  const eventTamper = structuredClone(fixture.accepted.event);
  eventTamper.seq += 1;
  assert.throws(() => verifyAcceptedLocalContextSemanticReview({
    candidate: fixture.value,
    trust: fixture.semanticTrust,
    intent: fixture.intent,
    acceptedEvent: eventTamper,
    acceptedPayload: fixture.accepted.payload,
    trustedGridPublicKey: fixture.grid.publicKey
  }), /event hash mismatch/);
});

test('review evidence fixed non-authority semantics cannot be elevated', () => {
  const fixture = acceptedEvidence();
  for (const [field, value] of [
    ['grid_trust_root_source_verified', true],
    ['event_chain_currentness_verified', true],
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
    const elevated = structuredClone(fixture.evidence);
    elevated[field] = value;
    assert.throws(
      () => validateLocalContextSemanticReviewEvidence(elevated),
      new RegExp(`${field} must remain`)
    );
  }
});

test('review evidence is content-addressed and closed to unknown authority fields', () => {
  const fixture = acceptedEvidence();
  const tampered = structuredClone(fixture.evidence);
  tampered.target_semantic_class = 'procedure';
  assert.throws(
    () => validateLocalContextSemanticReviewEvidence(tampered),
    /digest mismatch/
  );

  const unknown = structuredClone(fixture.evidence);
  unknown.auto_execute = true;
  assert.throws(
    () => validateLocalContextSemanticReviewEvidence(unknown),
    /fields are invalid/
  );
});
