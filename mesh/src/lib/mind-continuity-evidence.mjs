import { digestObject, ValidationError } from './canonical.mjs';

export const MIND_CONTINUITY_EVIDENCE_SCHEMA = 'axiom-mind-continuity-evidence.v0';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const EVENT_KINDS = new Set(['restore', 'parallel-instance', 'divergent-fork']);

export function assessMindContinuityEvidence(evidence) {
  validateMindContinuityEvidence(evidence);

  let status;
  let privilegedGovernanceBlocked;
  let genesisReviewRequired = false;

  if (evidence.event_kind === 'restore') {
    if (evidence.simultaneous_active_claims === 0) {
      status = 'continuity-candidate';
      privilegedGovernanceBlocked = false;
    } else {
      status = 'continuity-dispute';
      privilegedGovernanceBlocked = true;
    }
  } else if (evidence.event_kind === 'parallel-instance') {
    status = 'continuity-dispute';
    privilegedGovernanceBlocked = true;
  } else if (evidence.separate_standing_requested) {
    status = 'genesis-review-required';
    privilegedGovernanceBlocked = true;
    genesisReviewRequired = true;
  } else {
    status = 'continuity-dispute';
    privilegedGovernanceBlocked = true;
  }

  return Object.freeze({
    valid: true,
    schema: evidence.schema,
    event_id: evidence.event_id,
    mind_id: evidence.mind_id,
    evidence_digest: digestObject(evidence),
    status,
    privileged_governance_blocked: privilegedGovernanceBlocked,
    genesis_review_required: genesisReviewRequired,
    recognized_population_delta: 0,
    new_governance_identity: false,
    authority_effect: 'none',
    runtime_activation: false
  });
}

export function validateMindContinuityEvidence(evidence) {
  exactObject(evidence, 'Mind continuity evidence', [
    'schema',
    'event_id',
    'mind_id',
    'event_kind',
    'source_identity_digest',
    'source_state_digest',
    'candidate_state_digest',
    'simultaneous_active_claims',
    'divergence_declared',
    'separate_standing_requested',
    'observed_at',
    'population_effect',
    'governance_identity_effect',
    'authority_effect',
    'runtime_activation'
  ]);

  if (
    evidence.schema !== MIND_CONTINUITY_EVIDENCE_SCHEMA
    || !id(evidence.event_id)
    || !id(evidence.mind_id)
    || !EVENT_KINDS.has(evidence.event_kind)
    || !digest(evidence.source_identity_digest)
    || !digest(evidence.source_state_digest)
    || !digest(evidence.candidate_state_digest)
    || !integerBetween(evidence.simultaneous_active_claims, 0, 64)
    || typeof evidence.divergence_declared !== 'boolean'
    || typeof evidence.separate_standing_requested !== 'boolean'
    || evidence.population_effect !== 'none'
    || evidence.governance_identity_effect !== 'none'
    || evidence.authority_effect !== 'none'
    || evidence.runtime_activation !== false
  ) {
    throw new ValidationError('Mind continuity evidence activation boundary is invalid');
  }

  const observed = new Date(evidence.observed_at);
  if (Number.isNaN(observed.valueOf()) || observed.toISOString() !== evidence.observed_at) {
    throw new ValidationError('Mind continuity evidence observed_at is invalid');
  }

  if (
    evidence.event_kind === 'restore'
    && (evidence.divergence_declared || evidence.separate_standing_requested)
  ) {
    throw new ValidationError('Restore continuity evidence cannot claim divergence or separate standing');
  }

  if (
    evidence.event_kind === 'parallel-instance'
    && evidence.separate_standing_requested
  ) {
    throw new ValidationError('Parallel instance cannot claim separate standing without a fork/Genesis review');
  }

  if (
    evidence.event_kind === 'divergent-fork'
    && !evidence.divergence_declared
  ) {
    throw new ValidationError('Divergent fork continuity evidence must declare divergence');
  }

  return evidence;
}

function exactObject(value, label, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${label} must be an object`);
  }
  const expected = [...keys].sort();
  const actual = Object.keys(value).sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new ValidationError(`${label} fields are invalid`);
  }
}

function integerBetween(value, min, max) {
  return Number.isSafeInteger(value) && value >= min && value <= max;
}

function id(value) {
  return typeof value === 'string' && IDENTIFIER.test(value);
}

function digest(value) {
  return typeof value === 'string' && DIGEST.test(value);
}
