import { ValidationError } from './canonical.mjs';
import {
  boundedDecisionProviderProfileDigest
} from './bounded-decision-provider-profile.mjs';
import {
  validateBoundedDecisionObservation
} from './bounded-decision-observation.mjs';
import {
  resolveBoundedDecisionCalibrationReport
} from './bounded-decision-calibration-report.mjs';

const POLICY_FIELDS = Object.freeze([
  'required_schema_digests',
  'maximum_observation_age_ms',
  'minimum_calibration_state',
  'minimum_sample_count',
  'allowed_provider_profiles',
  'allowed_revision_evidence',
  'probability_predicates',
  'disagreement_rule',
  'fallback_route'
]);

const CALIBRATION_STATES = Object.freeze(['none', 'experimental', 'reviewed']);
const REVISION_EVIDENCE = Object.freeze([
  'exact-artifact',
  'provider-versioned',
  'mutable-alias',
  'unknown'
]);
const DISAGREEMENT_RULES = Object.freeze(['conflict', 'require-unanimity']);
const FALLBACK_ROUTES = Object.freeze([
  'reject',
  'gather-more-evidence',
  'deliberative-review',
  'human-review'
]);
const PREDICATE_KINDS = Object.freeze([
  'choice-min-probability',
  'score-min',
  'score-max',
  'binary-min-p-true',
  'binary-max-p-true'
]);
const DIGEST_RE = /^[a-f0-9]{64}$/;
const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;

function requirePlain(value, name) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
  ) {
    throw new ValidationError(`${name} must be a plain object`);
  }
  return value;
}

function requireFields(value, fields, name) {
  requirePlain(value, name);
  for (const field of fields) {
    if (!Object.hasOwn(value, field)) {
      throw new ValidationError(`${name} is missing required field ${field}`);
    }
  }
}

function rejectUnknown(value, fields, name) {
  const allowed = new Set(fields);
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) {
      throw new ValidationError(`${name} contains unknown field ${field}`);
    }
  }
}

function requireEnum(value, allowed, name) {
  if (!allowed.includes(value)) {
    throw new ValidationError(`${name} is invalid`);
  }
  return value;
}

function requireDigest(value, name) {
  if (typeof value !== 'string' || !DIGEST_RE.test(value)) {
    throw new ValidationError(`${name} must be a lowercase sha256 digest`);
  }
  return value;
}

function requireIdentifier(value, name) {
  if (typeof value !== 'string' || !IDENTIFIER_RE.test(value)) {
    throw new ValidationError(`${name} is invalid`);
  }
  return value;
}

function requireUniqueArray(value, name, validateItem, { min = 0, max = 256 } = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new ValidationError(`${name} must contain ${min}-${max} entries`);
  }
  const seen = new Set();
  for (const item of value) {
    validateItem(item, `${name}[]`);
    const key = typeof item === 'string' ? item : JSON.stringify(item);
    if (seen.has(key)) throw new ValidationError(`${name} contains duplicate values`);
    seen.add(key);
  }
  return value;
}

function requireBoundedInteger(value, name, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ValidationError(`${name} is invalid`);
  }
  return value;
}

function requireFinite(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ValidationError(`${name} must be finite`);
  }
  return value;
}

function requireProbability(value, name) {
  requireFinite(value, name);
  if (value < 0 || value > 1) throw new ValidationError(`${name} must be in [0,1]`);
  return value;
}

function validatePredicate(value, index) {
  const label = `probability_predicates[${index}]`;
  requirePlain(value, label);
  requireEnum(value.kind, PREDICATE_KINDS, `${label}.kind`);

  const fields = value.kind === 'choice-min-probability'
    ? ['kind', 'question_schema_digest', 'option_id', 'threshold']
    : ['kind', 'question_schema_digest', 'threshold'];
  requireFields(value, fields, label);
  rejectUnknown(value, fields, label);
  requireDigest(value.question_schema_digest, `${label}.question_schema_digest`);
  if (value.kind === 'choice-min-probability') {
    requireIdentifier(value.option_id, `${label}.option_id`);
    requireProbability(value.threshold, `${label}.threshold`);
  } else if (value.kind === 'binary-min-p-true' || value.kind === 'binary-max-p-true') {
    requireProbability(value.threshold, `${label}.threshold`);
  } else {
    requireFinite(value.threshold, `${label}.threshold`);
  }
}

export function validateBoundedDecisionInterpretationPolicy(policy) {
  requireFields(policy, POLICY_FIELDS, 'Bounded decision interpretation policy');
  rejectUnknown(policy, POLICY_FIELDS, 'Bounded decision interpretation policy');

  requireUniqueArray(
    policy.required_schema_digests,
    'required_schema_digests',
    requireDigest,
    { min: 1, max: 128 }
  );
  requireBoundedInteger(
    policy.maximum_observation_age_ms,
    'maximum_observation_age_ms',
    0,
    31_536_000_000
  );
  requireEnum(
    policy.minimum_calibration_state,
    CALIBRATION_STATES,
    'minimum_calibration_state'
  );
  requireBoundedInteger(policy.minimum_sample_count, 'minimum_sample_count', 0, 10_000_000);
  requireUniqueArray(
    policy.allowed_provider_profiles,
    'allowed_provider_profiles',
    requireIdentifier,
    { min: 1, max: 128 }
  );
  requireUniqueArray(
    policy.allowed_revision_evidence,
    'allowed_revision_evidence',
    (item, name) => requireEnum(item, REVISION_EVIDENCE, name),
    { min: 1, max: REVISION_EVIDENCE.length }
  );
  if (!Array.isArray(policy.probability_predicates) || policy.probability_predicates.length > 128) {
    throw new ValidationError('probability_predicates must contain 0-128 entries');
  }
  policy.probability_predicates.forEach(validatePredicate);
  requireEnum(policy.disagreement_rule, DISAGREEMENT_RULES, 'disagreement_rule');
  requireEnum(policy.fallback_route, FALLBACK_ROUTES, 'fallback_route');

  return deepFreeze({
    valid: true,
    minimum_calibration_state: policy.minimum_calibration_state,
    disagreement_rule: policy.disagreement_rule,
    fallback_route: policy.fallback_route,
    authority_effect: 'none',
    assurance_effect: 'none',
    execution_effect: 'none'
  });
}

function parseNow(now) {
  if (typeof now !== 'string') throw new ValidationError('now must be a canonical ISO timestamp');
  const parsed = new Date(now);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== now) {
    throw new ValidationError('now must be a canonical ISO timestamp');
  }
  return parsed.getTime();
}

function report(status, observations, calibrations, reasons, policy) {
  return deepFreeze({
    status,
    observation_ids: observations.map(item => item.observation_id),
    calibration_report_ids: calibrations.map(item => item.calibration_report_id),
    reason_codes: [...new Set(reasons)],
    fallback_route: policy.fallback_route,
    authority_effect: 'none',
    assurance_effect: 'none',
    execution_effect: 'none'
  });
}

function validateEvidenceArrays(
  observations,
  calibrationReports,
  providerProfiles,
  questionSchemas
) {
  return (
    Array.isArray(observations)
    && Array.isArray(calibrationReports)
    && Array.isArray(providerProfiles)
    && Array.isArray(questionSchemas)
  );
}

function requireUniqueMatch(values, predicate, name) {
  const matches = values.filter(predicate);
  if (matches.length !== 1) {
    throw new ValidationError(`${name} must resolve to exactly one trusted binding`);
  }
  return matches[0];
}

function validateObservationIntegrity(observation, providerProfiles, questionSchemas) {
  const providerProfile = requireUniqueMatch(
    providerProfiles,
    item => item?.profile_id === observation?.provider_profile_id,
    'observation provider profile'
  );
  const questionSchema = requireUniqueMatch(
    questionSchemas,
    item => item?.question_schema_id === observation?.question_schema_id,
    'observation question schema'
  );
  validateBoundedDecisionObservation(observation, providerProfile, questionSchema);
  return true;
}

function resolveCalibrationIntegrity(calibration, providerProfiles, questionSchemas) {
  const providerProfile = requireUniqueMatch(
    providerProfiles,
    item => {
      try {
        return boundedDecisionProviderProfileDigest(item) === calibration?.provider_profile_digest;
      } catch {
        return false;
      }
    },
    'calibration provider profile'
  );
  if (!Array.isArray(calibration?.question_schema_family_refs)) {
    throw new ValidationError('calibration question schema family is invalid');
  }
  const resolvedSchemas = calibration.question_schema_family_refs.map(ref => requireUniqueMatch(
    questionSchemas,
    item => item?.question_schema_id === ref?.question_schema_id,
    'calibration question schema'
  ));
  return resolveBoundedDecisionCalibrationReport(
    calibration,
    providerProfile,
    resolvedSchemas
  );
}

function reviewStateSatisfies(actual, minimum) {
  if (minimum === 'none') return true;
  if (minimum === 'experimental') return actual === 'experimental' || actual === 'reviewed';
  return actual === 'reviewed';
}

function findCalibrationForObservation(observation, calibrationReports) {
  if (observation.calibration_report_ref === null) return null;
  return calibrationReports.find(
    item => item.calibration_report_id === observation.calibration_report_ref
  ) ?? null;
}

function calibrationReason(observation, calibration, policy, nowMs) {
  if (!calibration) return 'calibration-missing';
  if (calibration.provider_profile_digest !== observation.provider_profile_digest) {
    return 'calibration-profile-mismatch';
  }
  if (
    calibration.offering_version_or_revision !== observation.offering_version_or_revision
    || calibration.offering_revision_evidence !== observation.offering_revision_evidence
  ) {
    return 'calibration-revision-mismatch';
  }
  if (calibration.domain !== observation.question_domain) {
    return 'calibration-domain-mismatch';
  }
  const schemaMatch = calibration.question_schema_family_refs.some(
    item => item.question_schema_digest === observation.question_schema_digest
  );
  if (!schemaMatch) return 'calibration-schema-mismatch';
  if (!reviewStateSatisfies(calibration.review_state, policy.minimum_calibration_state)) {
    return 'calibration-not-reviewed';
  }
  const createdAt = Date.parse(calibration.created_at);
  if (!Number.isFinite(createdAt) || createdAt > nowMs) {
    return 'calibration-created-in-future';
  }
  const validUntil = Date.parse(calibration.valid_until);
  if (!Number.isFinite(validUntil) || validUntil <= nowMs) return 'calibration-expired';
  if (calibration.sample_count < policy.minimum_sample_count) return 'calibration-sample-count';
  return null;
}

function probabilityForChoice(observation, optionId) {
  const item = observation.probability_evidence.find(entry => entry.option_id === optionId);
  return item?.probability ?? null;
}

function evaluatePredicate(predicate, observation) {
  if (predicate.kind === 'choice-min-probability') {
    if (observation.answer.kind !== 'choice') return null;
    const probability = probabilityForChoice(observation, predicate.option_id);
    return probability === null ? null : probability >= predicate.threshold;
  }
  if (predicate.kind === 'score-min') {
    return observation.answer.kind === 'score'
      ? observation.answer.score >= predicate.threshold
      : null;
  }
  if (predicate.kind === 'score-max') {
    return observation.answer.kind === 'score'
      ? observation.answer.score <= predicate.threshold
      : null;
  }
  if (predicate.kind === 'binary-min-p-true') {
    return observation.answer.kind === 'binary-probability'
      ? observation.answer.p_true >= predicate.threshold
      : null;
  }
  if (predicate.kind === 'binary-max-p-true') {
    return observation.answer.kind === 'binary-probability'
      ? observation.answer.p_true <= predicate.threshold
      : null;
  }
  return null;
}

export function interpretBoundedDecisionEvidence({
  observations,
  calibrationReports,
  providerProfiles,
  questionSchemas,
  policy,
  now
}) {
  validateBoundedDecisionInterpretationPolicy(policy);
  const nowMs = parseNow(now);

  if (!validateEvidenceArrays(
    observations,
    calibrationReports,
    providerProfiles,
    questionSchemas
  )) {
    return report('invalid-evidence', [], [], ['evidence-array-invalid'], policy);
  }

  for (const observation of observations) {
    try {
      validateObservationIntegrity(observation, providerProfiles, questionSchemas);
    } catch {
      return report('invalid-evidence', [], [], ['observation-invalid'], policy);
    }
  }

  const calibrationIds = new Set();
  for (const calibration of calibrationReports) {
    if (calibrationIds.has(calibration?.calibration_report_id)) {
      return report('invalid-evidence', [], [], ['calibration-id-duplicate'], policy);
    }
    calibrationIds.add(calibration?.calibration_report_id);
  }

  const resolvedCalibrations = [];
  for (const calibration of calibrationReports) {
    try {
      resolvedCalibrations.push(
        resolveCalibrationIntegrity(calibration, providerProfiles, questionSchemas)
      );
    } catch {
      return report('invalid-evidence', [], [], ['calibration-invalid'], policy);
    }
  }

  const relevant = observations.filter(
    item => policy.required_schema_digests.includes(item.question_schema_digest)
  );
  const requiredPresent = new Set(relevant.map(item => item.question_schema_digest));
  for (const digest of policy.required_schema_digests) {
    if (!requiredPresent.has(digest)) {
      return report('insufficient-evidence', relevant, [], ['required-schema-missing'], policy);
    }
  }

  const eligible = relevant.filter(
    item => policy.allowed_provider_profiles.includes(item.provider_profile_id)
  );
  const providerCovered = new Set(eligible.map(item => item.question_schema_digest));
  for (const digest of policy.required_schema_digests) {
    if (!providerCovered.has(digest)) {
      return report('insufficient-evidence', eligible, [], ['provider-profile-ineligible'], policy);
    }
  }

  const revisionEligible = eligible.filter(
    item => policy.allowed_revision_evidence.includes(item.offering_revision_evidence)
  );
  const revisionCovered = new Set(revisionEligible.map(item => item.question_schema_digest));
  for (const digest of policy.required_schema_digests) {
    if (!revisionCovered.has(digest)) {
      return report('insufficient-evidence', revisionEligible, [], ['revision-evidence-ineligible'], policy);
    }
  }

  const fresh = [];
  const staleSchemaDigests = new Set();
  for (const observation of revisionEligible) {
    const observedAt = Date.parse(observation.observed_at);
    const age = nowMs - observedAt;
    if (!Number.isFinite(observedAt) || age < 0) {
      return report('invalid-evidence', revisionEligible, [], ['observation-time-invalid'], policy);
    }
    if (age > policy.maximum_observation_age_ms) staleSchemaDigests.add(observation.question_schema_digest);
    else fresh.push(observation);
  }
  const freshCovered = new Set(fresh.map(item => item.question_schema_digest));
  for (const digest of policy.required_schema_digests) {
    if (!freshCovered.has(digest) && staleSchemaDigests.has(digest)) {
      return report('stale-evidence', revisionEligible, [], ['observation-stale'], policy);
    }
  }

  const usedCalibrations = [];
  if (policy.minimum_calibration_state !== 'none') {
    for (const observation of fresh) {
      const calibration = findCalibrationForObservation(observation, resolvedCalibrations);
      const reason = calibrationReason(observation, calibration, policy, nowMs);
      if (reason) {
        return report('insufficient-evidence', fresh, usedCalibrations, [reason], policy);
      }
      if (!usedCalibrations.some(
        item => item.calibration_report_id === calibration.calibration_report_id
      )) usedCalibrations.push(calibration);
    }
  }

  const predicateFailures = [];
  for (const predicate of policy.probability_predicates) {
    const candidates = fresh.filter(
      item => item.question_schema_digest === predicate.question_schema_digest
    );
    if (!candidates.length) {
      predicateFailures.push('predicate-schema-missing');
      continue;
    }
    const results = candidates.map(item => evaluatePredicate(predicate, item));
    if (results.some(result => result === null)) {
      return report('invalid-evidence', fresh, usedCalibrations, ['predicate-kind-mismatch'], policy);
    }
    const distinct = new Set(results);
    if (distinct.size > 1) {
      if (policy.disagreement_rule === 'require-unanimity') {
        return report(
          'insufficient-evidence',
          fresh,
          usedCalibrations,
          ['predicate-unanimity-required'],
          policy
        );
      }
      return report(
        'conflicting-evidence',
        fresh,
        usedCalibrations,
        ['predicate-disagreement'],
        policy
      );
    }
    if (results.some(result => result !== true)) {
      predicateFailures.push('predicate-unsatisfied');
    }
  }

  if (predicateFailures.length) {
    return report('insufficient-evidence', fresh, usedCalibrations, predicateFailures, policy);
  }

  return report('accepted-evidence', fresh, usedCalibrations, [], policy);
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
