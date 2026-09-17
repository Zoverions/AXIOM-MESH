import { ValidationError } from './canonical.mjs';
import { validateBoundedDecisionProviderProfile } from './bounded-decision-provider-profile.mjs';

export const BOUNDED_DECISION_ROUTE_PROPOSAL_SCHEMA =
  'axiom-bounded-decision-route-proposal.v0';

const USER_MODES = Object.freeze(['auto', 'prefer', 'require', 'local-only']);
const QUESTION_KINDS = Object.freeze(['choice', 'score', 'binary-probability']);
const CURRENTNESS = Object.freeze(['current', 'stale', 'unknown']);
const FALLBACK_ROUTES = Object.freeze(['system-two', 'human', 'abstain']);

const CANDIDATE_FIELDS = Object.freeze([
  'profile',
  'available',
  'policy_eligible',
  'disclosure_eligible',
  'calibration_eligible',
  'currentness'
]);
const REQUEST_FIELDS = Object.freeze([
  'question_kind',
  'choice_cardinality',
  'score_levels',
  'deterministic_solution_available',
  'fallback_route'
]);
const USER_POLICY_FIELDS = Object.freeze([
  'mode',
  'preferred_profile_id',
  'excluded_profile_ids'
]);
const INTENT_POLICY_FIELDS = Object.freeze(['preferred_profile_ids']);
const SYSTEM_POLICY_FIELDS = Object.freeze(['first_seat_profile_ids']);

export function proposeBoundedDecisionRoute({
  candidates,
  request,
  user_policy: userPolicy,
  intent_policy: intentPolicy,
  system_policy: systemPolicy
}) {
  const validatedRequest = validateRequest(request);
  const validatedUserPolicy = validateUserPolicy(userPolicy);
  const validatedIntentPolicy = validatePreferencePolicy(
    intentPolicy,
    INTENT_POLICY_FIELDS,
    'Intent routing policy',
    'preferred_profile_ids'
  );
  const validatedSystemPolicy = validatePreferencePolicy(
    systemPolicy,
    SYSTEM_POLICY_FIELDS,
    'System routing policy',
    'first_seat_profile_ids'
  );
  const validatedCandidates = validateCandidates(candidates);

  if (validatedRequest.deterministic_solution_available) {
    return proposal({
      status: 'not-needed',
      selectedProfileId: null,
      fallbackProfileIds: [],
      escalation: 'none',
      reasons: ['deterministic-solution-available']
    });
  }

  const eligibility = new Map();
  for (const candidate of validatedCandidates) {
    eligibility.set(
      candidate.profile.profile_id,
      candidateEligibility(candidate, validatedRequest, validatedUserPolicy)
    );
  }

  if (validatedUserPolicy.mode === 'require') {
    const requiredId = validatedUserPolicy.preferred_profile_id;
    const required = eligibility.get(requiredId);
    if (!required?.eligible) {
      return proposal({
        status: 'no-route',
        selectedProfileId: null,
        fallbackProfileIds: [],
        escalation: validatedRequest.fallback_route,
        reasons: ['required-provider-ineligible']
      });
    }
    return proposal({
      status: 'selected',
      selectedProfileId: requiredId,
      fallbackProfileIds: [],
      escalation: 'none',
      reasons: ['required-provider-selected']
    });
  }

  const eligibleIds = validatedCandidates
    .map((candidate) => candidate.profile.profile_id)
    .filter((profileId) => eligibility.get(profileId)?.eligible === true);

  if (eligibleIds.length === 0) {
    return proposal({
      status: 'no-route',
      selectedProfileId: null,
      fallbackProfileIds: [],
      escalation: validatedRequest.fallback_route,
      reasons: ['no-eligible-provider']
    });
  }

  const preferenceOrder = [];
  if (
    validatedUserPolicy.mode === 'prefer'
    && validatedUserPolicy.preferred_profile_id !== null
  ) {
    preferenceOrder.push(validatedUserPolicy.preferred_profile_id);
  }
  preferenceOrder.push(...validatedIntentPolicy.preferred_profile_ids);
  preferenceOrder.push(...validatedSystemPolicy.first_seat_profile_ids);
  preferenceOrder.push(...eligibleIds);

  const eligibleSet = new Set(eligibleIds);
  const rankedIds = unique(preferenceOrder).filter((profileId) => eligibleSet.has(profileId));

  return proposal({
    status: 'selected',
    selectedProfileId: rankedIds[0],
    fallbackProfileIds: rankedIds.slice(1),
    escalation: 'none',
    reasons: ['eligible-provider-selected']
  });
}

function validateCandidates(candidates) {
  if (!Array.isArray(candidates)) {
    throw new ValidationError('Bounded decision routing candidates must be an array');
  }
  if (candidates.length > 256) {
    throw new ValidationError('Bounded decision routing candidates cannot exceed 256 entries');
  }

  const seenProfileIds = new Set();
  return candidates.map((candidate, index) => {
    requireFields(candidate, CANDIDATE_FIELDS, `Bounded decision routing candidate[${index}]`);
    rejectUnknown(candidate, CANDIDATE_FIELDS, `Bounded decision routing candidate[${index}]`);
    const validatedProfile = validateBoundedDecisionProviderProfile(candidate.profile);
    const profileId = validatedProfile.profile_id;
    if (seenProfileIds.has(profileId)) {
      throw new ValidationError(`Bounded decision routing candidates contain duplicate profile ${profileId}`);
    }
    seenProfileIds.add(profileId);

    for (const field of [
      'available',
      'policy_eligible',
      'disclosure_eligible',
      'calibration_eligible'
    ]) {
      requireBoolean(candidate[field], `candidate.${field}`);
    }
    requireEnum(candidate.currentness, CURRENTNESS, 'candidate.currentness');

    return {
      profile: candidate.profile,
      available: candidate.available,
      policy_eligible: candidate.policy_eligible,
      disclosure_eligible: candidate.disclosure_eligible,
      calibration_eligible: candidate.calibration_eligible,
      currentness: candidate.currentness
    };
  });
}

function validateRequest(request) {
  requireFields(request, REQUEST_FIELDS, 'Bounded decision routing request');
  rejectUnknown(request, REQUEST_FIELDS, 'Bounded decision routing request');
  requireEnum(request.question_kind, QUESTION_KINDS, 'request.question_kind');
  requireBoolean(
    request.deterministic_solution_available,
    'request.deterministic_solution_available'
  );
  requireEnum(request.fallback_route, FALLBACK_ROUTES, 'request.fallback_route');

  if (request.question_kind === 'choice') {
    requireInteger(request.choice_cardinality, 'request.choice_cardinality', 2, 256);
    requireNull(request.score_levels, 'request.score_levels');
  } else if (request.question_kind === 'score') {
    requireNull(request.choice_cardinality, 'request.choice_cardinality');
    requireInteger(request.score_levels, 'request.score_levels', 2, 64);
  } else {
    requireNull(request.choice_cardinality, 'request.choice_cardinality');
    requireNull(request.score_levels, 'request.score_levels');
  }

  return request;
}

function validateUserPolicy(policy) {
  requireFields(policy, USER_POLICY_FIELDS, 'User routing policy');
  rejectUnknown(policy, USER_POLICY_FIELDS, 'User routing policy');
  requireEnum(policy.mode, USER_MODES, 'User routing policy mode');
  const preferred = nullableIdentifier(policy.preferred_profile_id, 'preferred_profile_id');
  const excluded = identifierArray(policy.excluded_profile_ids, 'excluded_profile_ids');

  if (['prefer', 'require'].includes(policy.mode) && preferred === null) {
    throw new ValidationError(`User routing policy mode ${policy.mode} requires preferred_profile_id`);
  }
  if (preferred !== null && excluded.includes(preferred)) {
    throw new ValidationError('User routing policy cannot prefer and exclude the same provider');
  }

  return {
    mode: policy.mode,
    preferred_profile_id: preferred,
    excluded_profile_ids: excluded
  };
}

function validatePreferencePolicy(policy, fields, name, listField) {
  requireFields(policy, fields, name);
  rejectUnknown(policy, fields, name);
  return { [listField]: identifierArray(policy[listField], `${name}.${listField}`) };
}

function candidateEligibility(candidate, request, userPolicy) {
  const reasons = [];
  const profile = candidate.profile;

  if (!candidate.available) reasons.push('provider-unavailable');
  if (!candidate.policy_eligible) reasons.push('policy-ineligible');
  if (!candidate.disclosure_eligible) reasons.push('disclosure-ineligible');
  if (!candidate.calibration_eligible) reasons.push('calibration-ineligible');
  if (candidate.currentness !== 'current') reasons.push('provider-not-current');
  if (userPolicy.excluded_profile_ids.includes(profile.profile_id)) {
    reasons.push('provider-excluded');
  }
  if (userPolicy.mode === 'local-only' && profile.provider_mode !== 'owner-local') {
    reasons.push('remote-provider-excluded');
  }
  if (!profile.supported_question_kinds.includes(request.question_kind)) {
    reasons.push('question-kind-unsupported');
  }
  if (
    request.question_kind === 'choice'
    && request.choice_cardinality > profile.max_choice_cardinality
  ) {
    reasons.push('choice-cardinality-unsupported');
  }
  if (
    request.question_kind === 'score'
    && request.score_levels > profile.max_score_levels
  ) {
    reasons.push('score-levels-unsupported');
  }

  return {
    eligible: reasons.length === 0,
    reasons
  };
}

function proposal({
  status,
  selectedProfileId,
  fallbackProfileIds,
  escalation,
  reasons
}) {
  return deepFreeze({
    schema: BOUNDED_DECISION_ROUTE_PROPOSAL_SCHEMA,
    version: 0,
    status,
    selected_profile_id: selectedProfileId,
    fallback_profile_ids: [...fallbackProfileIds],
    escalation,
    reasons: [...reasons],
    authority_effect: 'none',
    network_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false,
    selection_effect: 'proposal-only',
    assurance_effect: 'none'
  });
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

function requireBoolean(value, name) {
  if (typeof value !== 'boolean') {
    throw new ValidationError(`${name} must be a boolean`);
  }
  return value;
}

function requireEnum(value, allowed, name) {
  if (!allowed.includes(value)) {
    throw new ValidationError(`${name} must be one of ${allowed.join(', ')}`);
  }
  return value;
}

function requireInteger(value, name, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ValidationError(`${name} must be an integer in [${min}, ${max}]`);
  }
  return value;
}

function requireNull(value, name) {
  if (value !== null) {
    throw new ValidationError(`${name} must be null`);
  }
  return value;
}

function nullableIdentifier(value, name) {
  if (value === null) return null;
  return identifier(value, name);
}

function identifierArray(value, name) {
  if (!Array.isArray(value) || value.length > 256) {
    throw new ValidationError(`${name} must be an array with at most 256 items`);
  }
  const output = value.map((item, index) => identifier(item, `${name}[${index}]`));
  if (new Set(output).size !== output.length) {
    throw new ValidationError(`${name} cannot contain duplicate provider ids`);
  }
  return output;
}

function identifier(value, name) {
  if (
    typeof value !== 'string'
    || value.length < 1
    || value.length > 192
    || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/.test(value)
  ) {
    throw new ValidationError(`${name} is invalid`);
  }
  return value;
}

function unique(values) {
  return [...new Set(values)];
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
