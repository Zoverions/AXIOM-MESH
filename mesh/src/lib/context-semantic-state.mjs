import {
  assertPlainObject,
  canonicalJson,
  digestObject,
  ValidationError
} from './canonical.mjs';
import { normalizeLocalContextCandidate } from './context-claim-resolution.mjs';
import {
  createLocalContextSemanticTrust,
  verifyLocalContextSemanticTrust
} from './context-semantic-trust.mjs';
import {
  createLocalContextSemanticReviewIntent,
  validateLocalContextSemanticReviewEvidence
} from './context-semantic-review-evidence.mjs';

export const LOCAL_CONTEXT_SEMANTIC_STATE_SCHEMA =
  'axiom-local-context-semantic-state.v1';
export const LOCAL_CONTEXT_SEMANTIC_STATE_MEMORY_KIND = 'context.semantic.state';
export const LOCAL_CONTEXT_SEMANTIC_STATE_MEMORY_SCHEMA =
  'axiom-local-context-semantic-state-memory.v1';

const STATE_KEYS = Object.freeze([
  'schema',
  'owner_subject_ref',
  'claim_id',
  'candidate',
  'trust',
  'previous_state_digest',
  'transition',
  'review_evidence',
  'persistence_path',
  'downstream_effect_authorized',
  'instruction_semantics',
  'owner_instruction_use_enabled',
  'may_authorize_tools',
  'may_modify_policy',
  'may_self_persist',
  'state_digest'
]);

const FIXED_NON_AUTHORITY = Object.freeze({
  persistence_path: 'existing-memory.put-only',
  downstream_effect_authorized: false,
  instruction_semantics: false,
  owner_instruction_use_enabled: false,
  may_authorize_tools: false,
  may_modify_policy: false,
  may_self_persist: false
});

function exactKeys(value, allowed, label) {
  assertPlainObject(value, label);
  const keys = Object.keys(value).sort();
  const expected = [...allowed].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new ValidationError(`${label} fields are invalid`);
  }
}

function expectedTreatment(originClass, semanticClass) {
  if (originClass === 'owner-authored' && semanticClass !== 'instruction-candidate') {
    return 'owner-memory-data';
  }
  return 'quoted-reference-data';
}

function sameImmutableTrustIdentity(previous, next) {
  const fields = [
    'schema',
    'claim_id',
    'owner_subject_ref',
    'candidate_digest',
    'origin_class',
    'source_evidence_digest',
    'parent_claim_id',
    'parent_candidate_digest',
    'parent_trust_digest',
    'retention_mode',
    'expires_at',
    'source_identity_verified',
    'artifact_authenticity_verified',
    'review_evidence_verified',
    'authority_effect',
    'instruction_semantics',
    'authority_inheritance',
    'instruction_inheritance',
    'may_authorize_tools',
    'may_modify_policy',
    'may_self_persist',
    'may_retransmit',
    'owner_instruction_use_enabled'
  ];
  for (const field of fields) {
    if (canonicalJson(previous[field]) !== canonicalJson(next[field])) return false;
  }
  return true;
}

export function applyLocalContextSemanticReview(candidate, priorTrust, reviewEvidence) {
  const normalizedCandidate = normalizeLocalContextCandidate(candidate);
  const prior = verifyLocalContextSemanticTrust(priorTrust, normalizedCandidate);
  const evidence = validateLocalContextSemanticReviewEvidence(reviewEvidence);
  if (
    evidence.owner_subject_ref !== normalizedCandidate.owner_subject_ref
    || evidence.claim_id !== normalizedCandidate.claim_id
    || evidence.candidate_digest !== prior.candidate_digest
    || evidence.prior_trust_digest !== prior.trust_digest
  ) {
    throw new ValidationError(
      'semantic state review evidence does not bind the exact candidate and prior trust'
    );
  }

  let reviewed;
  if (prior.origin_class === 'system-derived') {
    const body = {
      ...prior,
      semantic_class: evidence.target_semantic_class,
      review_state: evidence.resulting_review_state,
      review_evidence_digest: evidence.review_evidence_digest,
      context_treatment: expectedTreatment('system-derived', evidence.target_semantic_class)
    };
    delete body.trust_digest;
    body.trust_digest = digestObject(body);
    reviewed = verifyLocalContextSemanticTrust(body, normalizedCandidate);
  } else {
    reviewed = createLocalContextSemanticTrust(normalizedCandidate, {
      origin_class: prior.origin_class,
      semantic_class: evidence.target_semantic_class,
      source_evidence_digest: prior.source_evidence_digest,
      review_state: evidence.resulting_review_state,
      review_evidence_digest: evidence.review_evidence_digest,
      retention_mode: prior.retention_mode,
      expires_at: prior.expires_at
    });
  }

  if (!sameImmutableTrustIdentity(prior, reviewed)) {
    throw new ValidationError('semantic review cannot rewrite immutable trust identity');
  }
  return reviewed;
}

export function verifyLocalContextSemanticStateRecord(raw, { previousState = null } = {}) {
  exactKeys(raw, STATE_KEYS, 'local context semantic state');
  if (raw.schema !== LOCAL_CONTEXT_SEMANTIC_STATE_SCHEMA) {
    throw new ValidationError(
      `local context semantic state schema must be ${LOCAL_CONTEXT_SEMANTIC_STATE_SCHEMA}`
    );
  }
  const candidate = normalizeLocalContextCandidate(raw.candidate);
  const trust = verifyLocalContextSemanticTrust(raw.trust, candidate);
  if (
    raw.owner_subject_ref !== candidate.owner_subject_ref
    || raw.owner_subject_ref !== trust.owner_subject_ref
    || raw.claim_id !== candidate.claim_id
    || raw.claim_id !== trust.claim_id
  ) {
    throw new ValidationError('semantic state owner/claim binding is invalid');
  }

  for (const [field, expected] of Object.entries(FIXED_NON_AUTHORITY)) {
    if (raw[field] !== expected) {
      throw new ValidationError(`semantic state ${field} must remain ${String(expected)}`);
    }
  }

  let evidence = null;
  if (raw.transition === 'observed') {
    if (raw.previous_state_digest !== null || raw.review_evidence !== null) {
      throw new ValidationError('observed semantic state cannot name predecessor or review evidence');
    }
    if (trust.review_state !== 'unreviewed' || trust.review_evidence_digest !== null) {
      throw new ValidationError('observed semantic state must begin unreviewed');
    }
  } else if (raw.transition === 'review') {
    if (typeof raw.previous_state_digest !== 'string') {
      throw new ValidationError('review semantic state requires previous_state_digest');
    }
    evidence = validateLocalContextSemanticReviewEvidence(raw.review_evidence);
    if (
      evidence.owner_subject_ref !== candidate.owner_subject_ref
      || evidence.claim_id !== candidate.claim_id
      || evidence.candidate_digest !== trust.candidate_digest
      || evidence.target_semantic_class !== trust.semantic_class
      || evidence.resulting_review_state !== trust.review_state
      || evidence.review_evidence_digest !== trust.review_evidence_digest
    ) {
      throw new ValidationError('semantic state review evidence does not match reviewed trust');
    }
    if (previousState !== null) {
      const previous = verifyLocalContextSemanticStateRecord(previousState);
      if (
        previous.owner_subject_ref !== raw.owner_subject_ref
        || previous.claim_id !== raw.claim_id
        || previous.trust.candidate_digest !== trust.candidate_digest
        || raw.previous_state_digest !== previous.state_digest
        || evidence.prior_trust_digest !== previous.trust.trust_digest
      ) {
        throw new ValidationError('semantic state review predecessor binding is invalid');
      }
      const expectedTrust = applyLocalContextSemanticReview(
        candidate,
        previous.trust,
        evidence
      );
      if (expectedTrust.trust_digest !== trust.trust_digest) {
        throw new ValidationError('semantic state reviewed trust is not the deterministic review result');
      }
    }
  } else {
    throw new ValidationError('semantic state transition is unsupported');
  }

  const body = Object.freeze({
    schema: LOCAL_CONTEXT_SEMANTIC_STATE_SCHEMA,
    owner_subject_ref: candidate.owner_subject_ref,
    claim_id: candidate.claim_id,
    candidate,
    trust,
    previous_state_digest: raw.previous_state_digest,
    transition: raw.transition,
    review_evidence: evidence,
    ...FIXED_NON_AUTHORITY
  });
  const expectedDigest = digestObject(body);
  if (raw.state_digest !== expectedDigest) {
    throw new ValidationError('semantic state digest mismatch');
  }
  return Object.freeze({ ...body, state_digest: expectedDigest });
}

export function createLocalContextSemanticStateRecord(candidate, trust, {
  previousState = null,
  reviewEvidence = null
} = {}) {
  const normalizedCandidate = normalizeLocalContextCandidate(candidate);
  const verifiedTrust = verifyLocalContextSemanticTrust(trust, normalizedCandidate);
  const transition = previousState === null ? 'observed' : 'review';
  const body = {
    schema: LOCAL_CONTEXT_SEMANTIC_STATE_SCHEMA,
    owner_subject_ref: normalizedCandidate.owner_subject_ref,
    claim_id: normalizedCandidate.claim_id,
    candidate: normalizedCandidate,
    trust: verifiedTrust,
    previous_state_digest: previousState?.state_digest ?? null,
    transition,
    review_evidence: reviewEvidence,
    ...FIXED_NON_AUTHORITY
  };
  const state = { ...body, state_digest: digestObject(body) };
  return verifyLocalContextSemanticStateRecord(state, { previousState });
}

export function createReviewedLocalContextSemanticState(
  candidate,
  previousState,
  reviewEvidence
) {
  const previous = verifyLocalContextSemanticStateRecord(previousState);
  const evidence = validateLocalContextSemanticReviewEvidence(reviewEvidence);
  const intent = createLocalContextSemanticReviewIntent(candidate, previous.trust, {
    decision: evidence.decision,
    targetSemanticClass: evidence.target_semantic_class
  });
  const trust = applyLocalContextSemanticReview(candidate, previous.trust, evidence);
  const state = createLocalContextSemanticStateRecord(candidate, trust, {
    previousState: previous,
    reviewEvidence: evidence
  });
  return Object.freeze({ state, review_intent: intent });
}

export function projectLocalContextSemanticStateMemoryPut(rawState) {
  const state = verifyLocalContextSemanticStateRecord(rawState);
  return Object.freeze({
    kind: LOCAL_CONTEXT_SEMANTIC_STATE_MEMORY_KIND,
    content: state,
    metadata: Object.freeze({
      schema: LOCAL_CONTEXT_SEMANTIC_STATE_MEMORY_SCHEMA,
      claim_id: state.claim_id,
      state_digest: state.state_digest,
      previous_state_digest: state.previous_state_digest
    })
  });
}
