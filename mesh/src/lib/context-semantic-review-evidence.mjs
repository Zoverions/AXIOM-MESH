import {
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject,
  ValidationError
} from './canonical.mjs';
import { intentRequestDigest } from './intent-binding.mjs';
import { normalizeLocalContextCandidate } from './context-claim-resolution.mjs';
import { verifyLocalContextSemanticTrust } from './context-semantic-trust.mjs';

export const LOCAL_CONTEXT_SEMANTIC_REVIEW_INPUT_SCHEMA =
  'axiom-local-context-semantic-review-input.v1';
export const LOCAL_CONTEXT_SEMANTIC_REVIEW_EVIDENCE_SCHEMA =
  'axiom-local-context-semantic-review-evidence.v2';
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
  'completed_event_id',
  'completed_event_seq',
  'completed_event_hash',
  'grid_chain_last_seq',
  'grid_chain_last_hash',
  'verification_scope',
  'accepted_intent_verified',
  'completed_intent_verified',
  'materialized_completed_intent_verified',
  'terminal_history_unambiguous',
  'full_grid_chain_verified',
  'retained_external_head_verified',
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
  verification_scope: 'local-grid-full-chain-completed-review',
  accepted_intent_verified: true,
  completed_intent_verified: true,
  materialized_completed_intent_verified: true,
  terminal_history_unambiguous: true,
  full_grid_chain_verified: true,
  retained_external_head_verified: false,
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

export function normalizeLocalContextSemanticReviewIntent(intent, candidate, trust) {
  const value = assertPlainObject(intent, 'local context semantic review intent');
  const principal = assertPlainObject(value.principal, 'semantic review intent principal');
  const normalizedCandidate = normalizeLocalContextCandidate(candidate);
  if (
    principal.type !== 'human'
    || id(principal.id, 'semantic review intent principal.id')
      !== normalizedCandidate.owner_subject_ref
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
    input: normalizeReviewInput(value.input, normalizedCandidate, trust),
    purpose: LOCAL_CONTEXT_SEMANTIC_REVIEW_PURPOSE,
    data_scopes: Object.freeze([LOCAL_CONTEXT_SEMANTIC_REVIEW_DATA_SCOPE])
  });
}

export function createLocalContextSemanticReviewIntent(candidate, trust, {
  decision,
  targetSemanticClass
} = {}) {
  const normalizedCandidate = normalizeLocalContextCandidate(candidate);
  const verifiedTrust = verifyLocalContextSemanticTrust(trust, normalizedCandidate);
  return normalizeLocalContextSemanticReviewIntent({
    principal: {
      id: normalizedCandidate.owner_subject_ref,
      type: 'human'
    },
    action: LOCAL_CONTEXT_SEMANTIC_REVIEW_ACTION,
    input: {
      schema: LOCAL_CONTEXT_SEMANTIC_REVIEW_INPUT_SCHEMA,
      owner_subject_ref: normalizedCandidate.owner_subject_ref,
      claim_id: normalizedCandidate.claim_id,
      candidate_digest: verifiedTrust.candidate_digest,
      prior_trust_digest: verifiedTrust.trust_digest,
      decision,
      target_semantic_class: targetSemanticClass
    },
    purpose: LOCAL_CONTEXT_SEMANTIC_REVIEW_PURPOSE,
    data_scopes: [LOCAL_CONTEXT_SEMANTIC_REVIEW_DATA_SCOPE]
  }, normalizedCandidate, verifiedTrust);
}

export function verifyAcceptedLocalContextSemanticReview() {
  throw new ValidationError(
    'Accepted semantic review is not sufficient; completed full-Grid evidence is required'
  );
}

export function verifyCompletedLocalContextSemanticReview({
  candidate,
  trust,
  intent,
  materializedIntent,
  events,
  chain
} = {}) {
  const normalizedCandidate = normalizeLocalContextCandidate(candidate);
  const verifiedTrust = verifyLocalContextSemanticTrust(trust, normalizedCandidate);
  const normalizedIntent = normalizeLocalContextSemanticReviewIntent(
    intent,
    normalizedCandidate,
    verifiedTrust
  );
  const expectedRequestDigest = intentRequestDigest(normalizedIntent);
  const expectedInputDigest = digestObject(normalizedIntent.input);
  const owner = normalizedCandidate.owner_subject_ref;

  const materialized = assertPlainObject(materializedIntent, 'semantic review materialized intent');
  const intentId = id(materialized.intent_id, 'semantic review materialized intent_id');
  const traceId = id(materialized.trace_id, 'semantic review materialized trace_id');
  if (
    materialized.principal !== owner
    || materialized.action !== LOCAL_CONTEXT_SEMANTIC_REVIEW_ACTION
    || materialized.status !== 'completed'
    || materialized.request_digest !== expectedRequestDigest
    || materialized.input_digest !== expectedInputDigest
  ) {
    throw new ValidationError('semantic review materialized intent does not match the exact completed review');
  }

  if (!Array.isArray(events)) {
    throw new ValidationError('semantic review terminal history must be an array');
  }
  const acceptedEvents = events.filter(event => event?.kind === 'intent.accepted');
  const completedEvents = events.filter(event => event?.kind === 'intent.completed');
  const adverseEvents = events.filter(event => (
    event?.kind === 'intent.denied' || event?.kind === 'intent.failed'
  ));
  if (acceptedEvents.length !== 1 || completedEvents.length !== 1) {
    throw new ValidationError('semantic review requires one accepted and one completed event');
  }
  if (adverseEvents.length) {
    throw new ValidationError('semantic review terminal history contains denied or failed evidence');
  }

  const accepted = acceptedEvents[0];
  const completed = completedEvents[0];
  if (
    !Number.isSafeInteger(accepted.seq)
    || !Number.isSafeInteger(completed.seq)
    || accepted.seq < 1
    || completed.seq <= accepted.seq
    || accepted.actor !== owner
    || completed.actor !== owner
    || accepted.trace_id !== traceId
    || completed.trace_id !== traceId
    || accepted.subject !== intentId
    || completed.subject !== intentId
  ) {
    throw new ValidationError('semantic review event ordering or owner/trace binding is invalid');
  }
  if (
    accepted.payload?.intent_id !== intentId
    || accepted.payload?.principal !== owner
    || accepted.payload?.action !== LOCAL_CONTEXT_SEMANTIC_REVIEW_ACTION
    || accepted.payload?.request_digest !== expectedRequestDigest
    || accepted.payload?.input_digest !== expectedInputDigest
  ) {
    throw new ValidationError('semantic review accepted event does not match the exact review request');
  }

  const result = assertPlainObject(completed.payload?.result, 'semantic review completed result');
  if (
    completed.payload?.intent_id !== intentId
    || result.intent_id !== intentId
    || result.trace_id !== traceId
    || result.status !== 'completed'
  ) {
    throw new ValidationError('semantic review completed event does not match the exact review request');
  }
  if (canonicalJson(materialized.result_json) !== canonicalJson(result)) {
    throw new ValidationError('semantic review materialized result does not match signed completion evidence');
  }

  const chainState = assertPlainObject(chain, 'semantic review verified Grid chain');
  if (chainState.valid !== true) {
    throw new ValidationError('semantic review requires a valid full Grid evidence chain');
  }
  if (!Number.isSafeInteger(chainState.last_seq) || chainState.last_seq < completed.seq) {
    throw new ValidationError('semantic review Grid chain last_seq does not cover completed review');
  }
  const chainLastHash = digest(chainState.last_hash, 'semantic review Grid chain last_hash');

  const body = Object.freeze({
    schema: LOCAL_CONTEXT_SEMANTIC_REVIEW_EVIDENCE_SCHEMA,
    owner_subject_ref: owner,
    claim_id: normalizedCandidate.claim_id,
    candidate_digest: verifiedTrust.candidate_digest,
    prior_trust_digest: verifiedTrust.trust_digest,
    decision: normalizedIntent.input.decision,
    target_semantic_class: normalizedIntent.input.target_semantic_class,
    resulting_review_state: reviewStateForDecision(normalizedIntent.input.decision),
    intent_id: intentId,
    intent_request_digest: expectedRequestDigest,
    accepted_event_id: id(accepted.event_id, 'semantic review accepted event_id'),
    accepted_event_seq: accepted.seq,
    accepted_event_hash: digest(accepted.event_hash, 'semantic review accepted event_hash'),
    completed_event_id: id(completed.event_id, 'semantic review completed event_id'),
    completed_event_seq: completed.seq,
    completed_event_hash: digest(completed.event_hash, 'semantic review completed event_hash'),
    grid_chain_last_seq: chainState.last_seq,
    grid_chain_last_hash: chainLastHash,
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
  id(raw.completed_event_id, 'semantic review evidence completed_event_id');
  for (const [field, value] of [
    ['accepted_event_seq', raw.accepted_event_seq],
    ['completed_event_seq', raw.completed_event_seq],
    ['grid_chain_last_seq', raw.grid_chain_last_seq]
  ]) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new ValidationError(`semantic review evidence ${field} is invalid`);
    }
  }
  if (
    raw.accepted_event_seq >= raw.completed_event_seq
    || raw.completed_event_seq > raw.grid_chain_last_seq
  ) {
    throw new ValidationError('semantic review evidence event ordering is invalid');
  }
  digest(raw.accepted_event_hash, 'semantic review evidence accepted_event_hash');
  digest(raw.completed_event_hash, 'semantic review evidence completed_event_hash');
  digest(raw.grid_chain_last_hash, 'semantic review evidence grid_chain_last_hash');
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
