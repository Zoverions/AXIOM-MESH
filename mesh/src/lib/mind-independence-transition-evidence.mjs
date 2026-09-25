import { digestObject, ValidationError } from './canonical.mjs';
import { assessMindIndependenceReview } from './mind-independence-review.mjs';

export const MIND_INDEPENDENCE_TRANSITION_EVIDENCE_SCHEMA =
  'axiom-mind-independence-transition-evidence.v0';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const CONTINUITY_STATUSES = new Set(['clear', 'disputed', 'stale', 'unknown']);
const APPEAL_STATUSES = new Set([
  'none',
  'open',
  'stayed',
  'resolved-uphold',
  'resolved-reverse',
  'unknown'
]);

export function assessMindIndependenceTransitionEvidence(reviewDocument, evidence) {
  const review = assessMindIndependenceReview(reviewDocument);
  validateTransitionEvidence(evidence);

  if (evidence.mind_id !== review.mind_id) {
    throw new ValidationError('Mind independence transition evidence mind binding is invalid');
  }
  if (evidence.independence_review_digest !== review.review_digest) {
    throw new ValidationError('Mind independence transition evidence review digest is invalid');
  }
  if (evidence.appeal_path_id !== reviewDocument.appeal_path_id) {
    throw new ValidationError('Mind independence transition evidence appeal path binding is invalid');
  }

  const evaluatedAt = timestamp(evidence.evaluated_at, 'transition evaluated_at');
  const assessedAt = timestamp(reviewDocument.assessed_at, 'review assessed_at');
  const developmentalObservedAt = timestamp(
    evidence.developmental_state_observed_at,
    'developmental state observed_at'
  );
  const continuityObservedAt = timestamp(
    evidence.continuity_observed_at,
    'continuity observed_at'
  );

  if (assessedAt > evaluatedAt) {
    throw new ValidationError('Independence review cannot be future-dated at transition evaluation');
  }
  if (developmentalObservedAt > evaluatedAt || continuityObservedAt > evaluatedAt) {
    throw new ValidationError('Transition state observation cannot be future-dated');
  }

  const reviewAgeSeconds = ageSeconds(assessedAt, evaluatedAt);
  const developmentalAgeSeconds = ageSeconds(developmentalObservedAt, evaluatedAt);
  const continuityAgeSeconds = ageSeconds(continuityObservedAt, evaluatedAt);

  const reviewCurrent = reviewAgeSeconds <= evidence.maximum_review_age_seconds;
  const developmentalStateCurrent =
    developmentalAgeSeconds <= evidence.maximum_state_observation_age_seconds;
  const continuityCurrent =
    continuityAgeSeconds <= evidence.maximum_state_observation_age_seconds;

  const stageMatches =
    evidence.current_developmental_stage === 'candidate-independent';
  const developmentalDigestMatches =
    evidence.current_developmental_state_evidence_digest
      === review.developmental_state_evidence_digest;
  const continuityDigestMatches =
    evidence.current_continuity_evidence_digest === review.continuity_evidence_digest;
  const continuityClear = evidence.continuity_status === 'clear';
  const appealClear =
    evidence.appeal_status === 'none'
    || evidence.appeal_status === 'resolved-uphold';

  let transitionRequestable = true;
  let reason = 'transition-requestable';

  if (!review.evidence_threshold_satisfied) {
    transitionRequestable = false;
    reason = 'review-threshold-not-satisfied';
  } else if (!reviewCurrent) {
    transitionRequestable = false;
    reason = 'review-stale';
  } else if (!stageMatches) {
    transitionRequestable = false;
    reason = 'developmental-stage-mismatch';
  } else if (!developmentalDigestMatches) {
    transitionRequestable = false;
    reason = 'developmental-state-evidence-mismatch';
  } else if (!developmentalStateCurrent) {
    transitionRequestable = false;
    reason = 'developmental-state-observation-stale';
  } else if (!continuityDigestMatches) {
    transitionRequestable = false;
    reason = 'continuity-evidence-mismatch';
  } else if (!continuityCurrent) {
    transitionRequestable = false;
    reason = 'continuity-observation-stale';
  } else if (!continuityClear) {
    transitionRequestable = false;
    reason = `continuity-${evidence.continuity_status}`;
  } else if (!appealClear) {
    transitionRequestable = false;
    reason = `appeal-${evidence.appeal_status}`;
  }

  return Object.freeze({
    valid: true,
    schema: evidence.schema,
    evidence_digest: digestObject(evidence),
    mind_id: evidence.mind_id,
    independence_review_digest: review.review_digest,
    review_threshold_satisfied: review.evidence_threshold_satisfied,
    review_current: reviewCurrent,
    review_age_seconds: reviewAgeSeconds,
    developmental_stage_matches: stageMatches,
    developmental_state_evidence_matches: developmentalDigestMatches,
    developmental_state_current: developmentalStateCurrent,
    developmental_state_age_seconds: developmentalAgeSeconds,
    continuity_evidence_matches: continuityDigestMatches,
    continuity_current: continuityCurrent,
    continuity_age_seconds: continuityAgeSeconds,
    continuity_clear: continuityClear,
    appeal_clear: appealClear,
    transition_requestable: transitionRequestable,
    reason,
    status_effect: 'none',
    council_voting_effect: 'none',
    genesis_eligibility_effect: 'none',
    governance_effect: 'none',
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  });
}

export function validateTransitionEvidence(evidence) {
  exactObject(evidence, 'Mind independence transition evidence', [
    'schema',
    'version',
    'status',
    'mind_id',
    'independence_review_digest',
    'current_developmental_stage',
    'current_developmental_state_evidence_digest',
    'developmental_state_observed_at',
    'current_continuity_evidence_digest',
    'continuity_observed_at',
    'continuity_status',
    'appeal_path_id',
    'appeal_status',
    'appeal_evidence_digest',
    'maximum_review_age_seconds',
    'maximum_state_observation_age_seconds',
    'evaluated_at',
    'status_effect',
    'council_voting_effect',
    'genesis_eligibility_effect',
    'governance_effect',
    'authority_effect',
    'network_effect',
    'runtime_activation'
  ]);

  if (
    evidence.schema !== MIND_INDEPENDENCE_TRANSITION_EVIDENCE_SCHEMA
    || evidence.version !== 0
    || evidence.status !== 'inert-transition-evidence'
    || !id(evidence.mind_id)
    || !digest(evidence.independence_review_digest)
    || !['candidate-independent', 'developing', 'dependent', 'independent'].includes(
      evidence.current_developmental_stage
    )
    || !digest(evidence.current_developmental_state_evidence_digest)
    || !digest(evidence.current_continuity_evidence_digest)
    || !CONTINUITY_STATUSES.has(evidence.continuity_status)
    || !id(evidence.appeal_path_id)
    || !APPEAL_STATUSES.has(evidence.appeal_status)
    || !integerBetween(evidence.maximum_review_age_seconds, 1, 2592000)
    || !integerBetween(evidence.maximum_state_observation_age_seconds, 1, 604800)
    || evidence.status_effect !== 'none'
    || evidence.council_voting_effect !== 'none'
    || evidence.genesis_eligibility_effect !== 'none'
    || evidence.governance_effect !== 'none'
    || evidence.authority_effect !== 'none'
    || evidence.network_effect !== 'none'
    || evidence.runtime_activation !== false
  ) {
    throw new ValidationError('Mind independence transition evidence activation boundary is invalid');
  }

  timestamp(evidence.developmental_state_observed_at, 'developmental state observed_at');
  timestamp(evidence.continuity_observed_at, 'continuity observed_at');
  timestamp(evidence.evaluated_at, 'transition evaluated_at');

  if (evidence.appeal_status === 'none') {
    if (evidence.appeal_evidence_digest !== null) {
      throw new ValidationError('No-appeal transition evidence cannot claim appeal evidence');
    }
  } else if (!digest(evidence.appeal_evidence_digest)) {
    throw new ValidationError('Appeal transition state requires exact appeal evidence');
  }

  return evidence;
}

function ageSeconds(earlier, later) {
  return Math.floor((later.valueOf() - earlier.valueOf()) / 1000);
}

function timestamp(value, label) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf()) || date.toISOString() !== value) {
    throw new ValidationError(`${label} is invalid`);
  }
  return date;
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
