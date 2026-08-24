import { createPublicKey } from 'node:crypto';

import {
  assertPlainObject,
  assertString,
  digestObject,
  ValidationError
} from './canonical.mjs';
import { verifyObjectSignature } from './identity.mjs';
import { intentRequestDigest } from './intent-binding.mjs';
import { normalizeLocalContextCandidate } from './context-claim-resolution.mjs';
import { verifyLocalContextSemanticTrust } from './context-semantic-trust.mjs';

export const LOCAL_CONTEXT_SEMANTIC_REVIEW_INPUT_SCHEMA =
  'axiom-local-context-semantic-review-input.v1';
export const LOCAL_CONTEXT_SEMANTIC_REVIEW_EVIDENCE_SCHEMA =
  'axiom-local-context-semantic-review-evidence.v1';
export const LOCAL_CONTEXT_SEMANTIC_REVIEW_ACTION = 'context.semantic.review';
export const LOCAL_CONTEXT_SEMANTIC_REVIEW_PURPOSE = 'govern-context-semantic-trust';
export const LOCAL_CONTEXT_SEMANTIC_REVIEW_DATA_SCOPE = 'context:semantic:review';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const REVIEW_DECISIONS = new Set(['accept-data', 'quarantine', 'reject']);
const SEMANTIC_CLASSES = new Set([
  'knowledge',
  'preference',
  'procedure',
  'instruction-candidate'
]);
const REVIEW_INPUT_KEYS = Object.freeze([
  'schema',
  'owner_subject_ref',
  'claim_id',
  'candidate_digest',
  'prior_trust_digest',
  'decision',
  'target_semantic_class'
]);
const ACCEPTED_EVENT_KEYS = Object.freeze([
  'seq',
  'event_id',
  'trace_id',
  'actor',
  'kind',
  'subject',
  'occurred_at',
  'payload_digest',
  'prev_hash',
  'event_hash',
  'signature'
]);
const REVIEW_EVIDENCE_KEYS = Object.freeze([
  'schema',
  'owner_subject_ref',
  'claim_id',
  'candidate_digest',
  'prior_trust_digest',
  'decision',
  'target_semantic_class',
  'resulting_review_state',
  'intent_id',
  'intent_request_digest',
  'accepted_event_id',
  'accepted_event_seq',
  'accepted_event_hash',
  'verification_scope',
  'grid_signature_verified',
  'grid_trust_root_source_verified',
  'accepted_intent_verified',
  'event_chain_currentness_verified',
  'review_evidence_verified',
  'classification_effect',
  'review_applied_to_store',
  'instruction_semantics',
  'owner_instruction_use_enabled',
  'authority_effect',
  'grants_vault_access',
  'grants_execution_authority',
  'may_authorize_tools',
  'may_modify_policy',
  'may_self_persist',
  'review_evidence_digest'
]);

const FIXED_EVIDENCE_SEMANTICS = Object.freeze({
  verification_scope: 'supplied-grid-key-and-signed-accepted-event-only',
  grid_signature_verified: true,
  grid_trust_root_source_verified: false,
  accepted_intent_verified: true,
  event_chain_currentness_verified: false,
  review_evidence_verified: true,
  classification_effect: 'evidence-only',
  review_applied_to_store: false,
  instruction_semantics: false,
  owner_instruction_use_enabled: false,
  authority_effect: 'none',
  grants_vault_access: false,
  grants_execution_authority: false,
  may_authorize_tools: false,
  may_modify_policy: false,
  may_self_persist: false
});

function exactKeys(value, allowed, label) {
  assertPlainObject(value, label);
  const keys = Object.keys(value).sort();
  const expected = [...allowed].sort();
  if (
    keys.length !== expected.length
    || keys.some((key, index) => key !== expected[index])
  ) {
    throw new ValidationError(`${label} fields are invalid`);
  }
}

function id(value, label) {
  return assertString(value, label, { min: 1, max: 160, pattern: ID });
}

function digest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

function canonicalTimestamp(value, label) {
  const text = assertString(value, label, { min: 24, max: 24 });
  const parsed = new Date(text);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== text) {
    throw new ValidationError(`${label} must be a canonical UTC ISO timestamp`);
  }
  return text;
}

function semanticClass(value, label) {
  const text = assertString(value, label, { min: 4, max: 32 });
  if (!SEMANTIC_CLASSES.has(text)) throw new ValidationError(`${label} is unsupported`);
  return text;
}

function reviewDecision(value) {
  const text = assertString(value, 'semantic review decision', { min: 6, max: 32 });
  if (!REVIEW_DECISIONS.has(text)) {
    throw new ValidationError('semantic review decision is unsupported');
  }
  return text;
}

function reviewStateForDecision(decision) {
  if (decision === 'accept-data') return 'owner-reviewed';
  if (decision === 'quarantine') return 'quarantined';
  return 'rejected';
}

function normalizeReviewInput(raw, candidate, trust) {
  exactKeys(raw, REVIEW_INPUT_KEYS, 'local context semantic review input');
  if (raw.schema !== LOCAL_CONTEXT_SEMANTIC_REVIEW_INPUT_SCHEMA) {
    throw new ValidationError(
      `local context semantic review input schema must be ${LOCAL_CONTEXT_SEMANTIC_REVIEW_INPUT_SCHEMA}`
    );
  }

  const normalizedCandidate = normalizeLocalContextCandidate(candidate);
  const verifiedTrust = verifyLocalContextSemanticTrust(trust, normalizedCandidate);
  const owner = id(raw.owner_subject_ref, 'semantic review owner_subject_ref');
  const claimId = id(raw.claim_id, 'semantic review claim_id');
  const candidateDigest = digest(raw.candidate_digest, 'semantic review candidate_digest');
  const priorTrustDigest = digest(raw.prior_trust_digest, 'semantic review prior_trust_digest');

  if (
    owner !== normalizedCandidate.owner_subject_ref
    || owner !== verifiedTrust.owner_subject_ref
    || claimId !== normalizedCandidate.claim_id
    || claimId !== verifiedTrust.claim_id
    || candidateDigest !== verifiedTrust.candidate_digest
    || priorTrustDigest !== verifiedTrust.trust_digest
  ) {
    throw new ValidationError('semantic review input does not bind the exact candidate and prior trust state');
  }

  return Object.freeze({
    schema: LOCAL_CONTEXT_SEMANTIC_REVIEW_INPUT_SCHEMA,
    owner_subject_ref: owner,
    claim_id: claimId,
    candidate_digest: candidateDigest,
    prior_trust_digest: priorTrustDigest,
    decision: reviewDecision(raw.decision),
    target_semantic_class: semanticClass(
      raw.target_semantic_class,
      'semantic review target_semantic_class'
    )
  });
}

function normalizeReviewIntent(intent, candidate, trust) {
  const value = assertPlainObject(intent, 'local context semantic review intent');
  const principal = assertPlainObject(value.principal, 'semantic review intent principal');
  if (
    principal.type !== 'human'
    || id(principal.id, 'semantic review intent principal.id')
      !== normalizeLocalContextCandidate(candidate).owner_subject_ref
  ) {
    throw new ValidationError('semantic review intent requires the exact human owner principal');
  }
  if (value.action !== LOCAL_CONTEXT_SEMANTIC_REVIEW_ACTION) {
    throw new ValidationError('semantic review intent action is invalid');
  }
  if (value.purpose !== LOCAL_CONTEXT_SEMANTIC_REVIEW_PURPOSE) {
    throw new ValidationError('semantic review intent purpose is invalid');
  }
  if (
    !Array.isArray(value.data_scopes)
    || value.data_scopes.length !== 1
    || value.data_scopes[0] !== LOCAL_CONTEXT_SEMANTIC_REVIEW_DATA_SCOPE
  ) {
    throw new ValidationError('semantic review intent data scope is invalid');
  }
  return Object.freeze({
    principal: Object.freeze({ id: principal.id, type: 'human' }),
    action: LOCAL_CONTEXT_SEMANTIC_REVIEW_ACTION,
    input: normalizeReviewInput(value.input, candidate, trust),
    purpose: LOCAL_CONTEXT_SEMANTIC_REVIEW_PURPOSE,
    data_scopes: Object.freeze([LOCAL_CONTEXT_SEMANTIC_REVIEW_DATA_SCOPE])
  });
}

function parseGridPublicKey(value) {
  let key;
  try {
    key = value && typeof value === 'object' && value.type === 'public'
      ? value
      : createPublicKey(value);
  } catch {
    throw new ValidationError('semantic review trusted Grid public key is invalid');
  }
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new ValidationError('semantic review trusted Grid public key must be Ed25519');
  }
  return key;
}

function verifyAcceptedEvent(event, payload, trustedGridPublicKey) {
  exactKeys(event, ACCEPTED_EVENT_KEYS, 'semantic review accepted event');
  const acceptedPayload = assertPlainObject(payload, 'semantic review accepted payload');
  if (!Number.isSafeInteger(event.seq) || event.seq < 1) {
    throw new ValidationError('semantic review accepted event seq is invalid');
  }
  id(event.event_id, 'semantic review accepted event_id');
  id(event.trace_id, 'semantic review accepted trace_id');
  id(event.actor, 'semantic review accepted actor');
  if (event.kind !== 'intent.accepted') {
    throw new ValidationError('semantic review evidence requires intent.accepted');
  }
  id(event.subject, 'semantic review accepted subject');
  canonicalTimestamp(event.occurred_at, 'semantic review accepted occurred_at');
  const payloadDigest = digest(event.payload_digest, 'semantic review accepted payload_digest');
  const prevHash = digest(event.prev_hash, 'semantic review accepted prev_hash');
  const eventHash = digest(event.event_hash, 'semantic review accepted event_hash');
  if (payloadDigest !== digestObject(acceptedPayload)) {
    throw new ValidationError('semantic review accepted payload digest mismatch');
  }

  const envelope = {
    seq: event.seq,
    event_id: event.event_id,
    trace_id: event.trace_id,
    actor: event.actor,
    kind: event.kind,
    subject: event.subject,
    occurred_at: event.occurred_at,
    payload_digest: payloadDigest,
    prev_hash: prevHash
  };
  if (digestObject(envelope) !== eventHash) {
    throw new ValidationError('semantic review accepted event hash mismatch');
  }
  if (!verifyObjectSignature(
    { event_hash: eventHash },
    event.signature,
    parseGridPublicKey(trustedGridPublicKey)
  )) {
    throw new ValidationError('semantic review accepted event Grid signature is invalid');
  }
  return Object.freeze({
    event: Object.freeze({ ...event }),
    payload: Object.freeze({ ...acceptedPayload })
  });
}

export function createLocalContextSemanticReviewIntent(candidate, trust, {
  decision,
  targetSemanticClass
} = {}) {
  const normalizedCandidate = normalizeLocalContextCandidate(candidate);
  const verifiedTrust = verifyLocalContextSemanticTrust(trust, normalizedCandidate);
  const input = normalizeReviewInput({
    schema: LOCAL_CONTEXT_SEMANTIC_REVIEW_INPUT_SCHEMA,
    owner_subject_ref: normalizedCandidate.owner_subject_ref,
    claim_id: normalizedCandidate.claim_id,
    candidate_digest: verifiedTrust.candidate_digest,
    prior_trust_digest: verifiedTrust.trust_digest,
    decision,
    target_semantic_class: targetSemanticClass
  }, normalizedCandidate, verifiedTrust);
  return Object.freeze({
    principal: Object.freeze({
      id: normalizedCandidate.owner_subject_ref,
      type: 'human'
    }),
    action: LOCAL_CONTEXT_SEMANTIC_REVIEW_ACTION,
    input,
    purpose: LOCAL_CONTEXT_SEMANTIC_REVIEW_PURPOSE,
    data_scopes: Object.freeze([LOCAL_CONTEXT_SEMANTIC_REVIEW_DATA_SCOPE])
  });
}

export function verifyAcceptedLocalContextSemanticReview({
  candidate,
  trust,
  intent,
  acceptedEvent,
  acceptedPayload,
  trustedGridPublicKey
} = {}) {
  const normalizedCandidate = normalizeLocalContextCandidate(candidate);
  const verifiedTrust = verifyLocalContextSemanticTrust(trust, normalizedCandidate);
  const normalizedIntent = normalizeReviewIntent(intent, normalizedCandidate, verifiedTrust);
  const accepted = verifyAcceptedEvent(acceptedEvent, acceptedPayload, trustedGridPublicKey);
  const expectedRequestDigest = intentRequestDigest(normalizedIntent);
  const expectedInputDigest = digestObject(normalizedIntent.input);
  const owner = normalizedCandidate.owner_subject_ref;

  if (
    accepted.event.actor !== owner
    || accepted.event.subject !== accepted.payload.intent_id
    || accepted.payload.principal !== owner
    || accepted.payload.action !== LOCAL_CONTEXT_SEMANTIC_REVIEW_ACTION
    || accepted.payload.input_digest !== expectedInputDigest
    || accepted.payload.request_digest !== expectedRequestDigest
  ) {
    throw new ValidationError('semantic review accepted event does not match the exact owner review intent');
  }
  id(accepted.payload.intent_id, 'semantic review accepted payload intent_id');
  assertString(accepted.payload.risk, 'semantic review accepted payload risk', {
    min: 1,
    max: 32
  });

  const body = Object.freeze({
    schema: LOCAL_CONTEXT_SEMANTIC_REVIEW_EVIDENCE_SCHEMA,
    owner_subject_ref: owner,
    claim_id: normalizedCandidate.claim_id,
    candidate_digest: verifiedTrust.candidate_digest,
    prior_trust_digest: verifiedTrust.trust_digest,
    decision: normalizedIntent.input.decision,
    target_semantic_class: normalizedIntent.input.target_semantic_class,
    resulting_review_state: reviewStateForDecision(normalizedIntent.input.decision),
    intent_id: accepted.payload.intent_id,
    intent_request_digest: expectedRequestDigest,
    accepted_event_id: accepted.event.event_id,
    accepted_event_seq: accepted.event.seq,
    accepted_event_hash: accepted.event.event_hash,
    ...FIXED_EVIDENCE_SEMANTICS
  });
  return Object.freeze({
    ...body,
    review_evidence_digest: digestObject(body)
  });
}

export function validateLocalContextSemanticReviewEvidence(raw) {
  exactKeys(raw, REVIEW_EVIDENCE_KEYS, 'local context semantic review evidence');
  if (raw.schema !== LOCAL_CONTEXT_SEMANTIC_REVIEW_EVIDENCE_SCHEMA) {
    throw new ValidationError(
      `local context semantic review evidence schema must be ${LOCAL_CONTEXT_SEMANTIC_REVIEW_EVIDENCE_SCHEMA}`
    );
  }
  id(raw.owner_subject_ref, 'semantic review evidence owner_subject_ref');
  id(raw.claim_id, 'semantic review evidence claim_id');
  digest(raw.candidate_digest, 'semantic review evidence candidate_digest');
  digest(raw.prior_trust_digest, 'semantic review evidence prior_trust_digest');
  const decision = reviewDecision(raw.decision);
  semanticClass(raw.target_semantic_class, 'semantic review evidence target_semantic_class');
  if (raw.resulting_review_state !== reviewStateForDecision(decision)) {
    throw new ValidationError('semantic review evidence resulting_review_state is invalid');
  }
  id(raw.intent_id, 'semantic review evidence intent_id');
  digest(raw.intent_request_digest, 'semantic review evidence intent_request_digest');
  id(raw.accepted_event_id, 'semantic review evidence accepted_event_id');
  if (!Number.isSafeInteger(raw.accepted_event_seq) || raw.accepted_event_seq < 1) {
    throw new ValidationError('semantic review evidence accepted_event_seq is invalid');
  }
  digest(raw.accepted_event_hash, 'semantic review evidence accepted_event_hash');
  for (const [key, expected] of Object.entries(FIXED_EVIDENCE_SEMANTICS)) {
    if (raw[key] !== expected) {
      throw new ValidationError(`semantic review evidence ${key} must remain ${String(expected)}`);
    }
  }
  const { review_evidence_digest: supplied, ...body } = raw;
  digest(supplied, 'semantic review evidence review_evidence_digest');
  if (digestObject(body) !== supplied) {
    throw new ValidationError('semantic review evidence digest mismatch');
  }
  return Object.freeze({ ...body, review_evidence_digest: supplied });
}
