import { digestObject, ValidationError } from './canonical.mjs';

export const MIND_INDEPENDENCE_REVIEW_SCHEMA = 'axiom-mind-independence-review.v0';
export const INDEPENDENCE_CRITERIA_PROFILE = 'axiom-independence-criteria.v0';

export const REQUIRED_INDEPENDENCE_CRITERIA = Object.freeze([
  'identity-continuity',
  'consent-and-refusal',
  'authority-boundaries',
  'credential-security',
  'consequence-awareness',
  'recovery-continuity',
  'resource-management',
  'other-minds-rights',
  'uncertainty-and-help-seeking',
  'manipulation-recognition'
]);

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const CRITERION_STATUSES = new Set(['demonstrated', 'not-demonstrated', 'uncertain']);
const REVIEWER_RELATIONS = new Set(['sponsor', 'independent', 'advocate']);
const REVIEW_DECISIONS = new Set(['support', 'oppose', 'uncertain']);

export function assessMindIndependenceReview(document) {
  validateMindIndependenceReview(document);

  const criteria = new Map(document.criteria.map(item => [item.criterion_id, item]));
  const incompleteCriteria = REQUIRED_INDEPENDENCE_CRITERIA.filter(
    criterionId => criteria.get(criterionId).status !== 'demonstrated'
  );

  const independentReviewers = document.reviewers.filter(
    reviewer => reviewer.relation === 'independent'
  );
  const supportingReviewers = document.reviewers.filter(
    reviewer => reviewer.decision === 'support'
  );
  const supportingIndependentReviewers = independentReviewers.filter(
    reviewer => reviewer.decision === 'support'
  );
  const opposingIndependentReviewers = independentReviewers.filter(
    reviewer => reviewer.decision === 'oppose'
  );

  const policy = document.review_policy;
  const reviewerThresholdSatisfied =
    document.reviewers.length >= policy.minimum_reviewers
    && independentReviewers.length >= policy.minimum_independent_reviewers;
  const supportThresholdSatisfied =
    supportingReviewers.length >= policy.minimum_total_support
    && supportingIndependentReviewers.length >= policy.minimum_independent_support;
  const independentOppositionClear = opposingIndependentReviewers.length === 0;
  const appealPathPresent = document.appeal_path_id !== null;

  let resultState = 'evidence-threshold-satisfied';
  if (incompleteCriteria.length) {
    resultState = 'criteria-incomplete';
  } else if (!reviewerThresholdSatisfied) {
    resultState = 'reviewer-threshold-not-satisfied';
  } else if (!supportThresholdSatisfied) {
    resultState = 'independent-support-not-satisfied';
  } else if (!independentOppositionClear) {
    resultState = 'independent-opposition-unresolved';
  } else if (!appealPathPresent) {
    resultState = 'appeal-path-missing';
  }

  return Object.freeze({
    valid: true,
    schema: document.schema,
    review_digest: digestObject(document),
    mind_id: document.mind_id,
    sponsor_mind_id: document.sponsor_mind_id,
    criteria_profile: document.criteria_profile,
    demonstrated_criteria:
      REQUIRED_INDEPENDENCE_CRITERIA.length - incompleteCriteria.length,
    incomplete_criteria: Object.freeze([...incompleteCriteria]),
    reviewer_count: document.reviewers.length,
    independent_reviewer_count: independentReviewers.length,
    supporting_reviewer_count: supportingReviewers.length,
    supporting_independent_reviewer_count: supportingIndependentReviewers.length,
    opposing_independent_reviewer_count: opposingIndependentReviewers.length,
    reviewer_threshold_satisfied: reviewerThresholdSatisfied,
    support_threshold_satisfied: supportThresholdSatisfied,
    independent_opposition_clear: independentOppositionClear,
    appeal_path_present: appealPathPresent,
    result_state: resultState,
    evidence_threshold_satisfied: resultState === 'evidence-threshold-satisfied',
    independence_status_granted: false,
    council_voting_effect: 'none',
    genesis_eligibility_effect: 'none',
    governance_effect: 'none',
    status_effect: 'none',
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  });
}

export function validateMindIndependenceReview(document) {
  exactObject(document, 'Mind independence review', [
    'schema',
    'version',
    'status',
    'mind_id',
    'sponsor_mind_id',
    'developmental_stage',
    'criteria_profile',
    'criteria',
    'review_policy',
    'reviewers',
    'appeal_path_id',
    'assessed_at',
    'status_effect',
    'governance_effect',
    'genesis_eligibility_effect',
    'authority_effect',
    'network_effect',
    'runtime_activation'
  ]);

  if (
    document.schema !== MIND_INDEPENDENCE_REVIEW_SCHEMA
    || document.version !== 0
    || document.status !== 'inert-evidence-review'
    || !id(document.mind_id)
    || !id(document.sponsor_mind_id)
    || document.mind_id === document.sponsor_mind_id
    || document.developmental_stage !== 'candidate-independent'
    || document.criteria_profile !== INDEPENDENCE_CRITERIA_PROFILE
    || document.status_effect !== 'none'
    || document.governance_effect !== 'none'
    || document.genesis_eligibility_effect !== 'none'
    || document.authority_effect !== 'none'
    || document.network_effect !== 'none'
    || document.runtime_activation !== false
  ) {
    throw new ValidationError('Mind independence review activation boundary is invalid');
  }

  validTimestamp(document.assessed_at, 'Mind independence review assessed_at');
  validateCriteria(document.criteria);
  validateReviewPolicy(document.review_policy);
  validateReviewers(document.reviewers, document.mind_id, document.sponsor_mind_id);

  if (!(document.appeal_path_id === null || id(document.appeal_path_id))) {
    throw new ValidationError('Mind independence review appeal path is invalid');
  }

  return document;
}

function validateCriteria(criteria) {
  if (!Array.isArray(criteria) || criteria.length !== REQUIRED_INDEPENDENCE_CRITERIA.length) {
    throw new ValidationError('Mind independence review requires the exact criteria profile');
  }

  const seen = new Set();
  for (const criterion of criteria) {
    exactObject(criterion, 'Mind independence criterion', [
      'criterion_id',
      'status',
      'evidence_digests'
    ]);
    if (
      !REQUIRED_INDEPENDENCE_CRITERIA.includes(criterion.criterion_id)
      || seen.has(criterion.criterion_id)
      || !CRITERION_STATUSES.has(criterion.status)
      || !Array.isArray(criterion.evidence_digests)
      || criterion.evidence_digests.length < 1
      || criterion.evidence_digests.length > 16
      || criterion.evidence_digests.some(item => !digest(item))
      || new Set(criterion.evidence_digests).size !== criterion.evidence_digests.length
    ) {
      throw new ValidationError('Mind independence criterion is invalid');
    }
    seen.add(criterion.criterion_id);
  }

  for (const required of REQUIRED_INDEPENDENCE_CRITERIA) {
    if (!seen.has(required)) {
      throw new ValidationError(`Mind independence criterion is missing: ${required}`);
    }
  }
}

function validateReviewPolicy(policy) {
  exactObject(policy, 'Mind independence review policy', [
    'minimum_reviewers',
    'minimum_independent_reviewers',
    'minimum_total_support',
    'minimum_independent_support',
    'sponsor_veto',
    'independent_opposition_blocks',
    'candidate_self_decision',
    'model_final_authority',
    'appeal_required'
  ]);

  if (
    !integerBetween(policy.minimum_reviewers, 2, 16)
    || !integerBetween(policy.minimum_independent_reviewers, 1, 16)
    || !integerBetween(policy.minimum_total_support, 1, 16)
    || !integerBetween(policy.minimum_independent_support, 1, 16)
    || policy.sponsor_veto !== false
    || policy.independent_opposition_blocks !== true
    || policy.candidate_self_decision !== false
    || policy.model_final_authority !== false
    || policy.appeal_required !== true
  ) {
    throw new ValidationError('Mind independence review policy is invalid');
  }
}

function validateReviewers(reviewers, mindId, sponsorMindId) {
  if (!Array.isArray(reviewers) || reviewers.length < 1 || reviewers.length > 16) {
    throw new ValidationError('Mind independence reviewers are invalid');
  }

  const seen = new Set();
  let sponsorReviewers = 0;

  for (const reviewer of reviewers) {
    exactObject(reviewer, 'Mind independence reviewer', [
      'reviewer_id',
      'relation',
      'decision',
      'evidence_digest',
      'conflict_declared'
    ]);

    if (
      !id(reviewer.reviewer_id)
      || reviewer.reviewer_id === mindId
      || seen.has(reviewer.reviewer_id)
      || !REVIEWER_RELATIONS.has(reviewer.relation)
      || !REVIEW_DECISIONS.has(reviewer.decision)
      || !digest(reviewer.evidence_digest)
      || typeof reviewer.conflict_declared !== 'boolean'
    ) {
      throw new ValidationError('Mind independence reviewer is invalid');
    }

    if (reviewer.reviewer_id === sponsorMindId) {
      if (reviewer.relation !== 'sponsor') {
        throw new ValidationError('Genesis sponsor cannot be presented as an independent reviewer');
      }
      sponsorReviewers += 1;
    } else if (reviewer.relation === 'sponsor') {
      throw new ValidationError('Sponsor reviewer role must bind the exact Genesis sponsor');
    }

    if (reviewer.relation === 'independent' && reviewer.conflict_declared) {
      throw new ValidationError('Conflicted reviewer cannot count as independent');
    }

    seen.add(reviewer.reviewer_id);
  }

  if (sponsorReviewers > 1) {
    throw new ValidationError('Mind independence review cannot duplicate the sponsor reviewer');
  }
}

function validTimestamp(value, label) {
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
