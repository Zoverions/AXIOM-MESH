import { digestObject, ValidationError } from './canonical.mjs';
import { evaluateCognitiveCandidates } from './cognitive-capability-profile.mjs';

export const COGNITIVE_SELECTION_POLICY_SCHEMA = 'axiom-cognitive-selection-policy.v0';

const POLICY_STATUS = 'inert-selection-policy';
const PROPOSAL_SCHEMA = 'axiom-cognitive-selection-proposal.v0';
const PROPOSAL_STATUS = 'inert-selection-proposal';
const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;

const POLICY_FIELDS = Object.freeze([
  'schema',
  'version',
  'status',
  'policy_id',
  'criteria',
  'created_at',
  'authority_effect',
  'network_effect',
  'credential_visibility',
  'runtime_activation',
  'selection_effect'
]);

const CRITERION_FIELDS = Object.freeze(['field', 'preference']);

const CRITERION_VOCABULARIES = Object.freeze({
  integration_class: Object.freeze(['agent-runtime', 'model-provider', 'compute-backend']),
  'deployment.locality': Object.freeze(['owner-local', 'owner-remote', 'provider-remote', 'hybrid']),
  'deployment.access_mode': Object.freeze(['local-runtime', 'api', 'remote-runtime', 'hybrid']),
  'data_policy.retention': Object.freeze(['none', 'transient', 'persistent', 'unknown']),
  'data_policy.training_use': Object.freeze(['excluded', 'possible', 'unknown']),
  'data_policy.exportability': Object.freeze(['none', 'partial', 'full', 'unknown']),
  'economics.cost_class': Object.freeze(['none', 'low', 'medium', 'high', 'unknown']),
  'economics.latency_class': Object.freeze(['local-fast', 'interactive', 'slow', 'batch', 'unknown']),
  'economics.context_class': Object.freeze(['small', 'medium', 'large', 'very-large', 'unknown']),
  'openness.weight_access': Object.freeze([
    'closed',
    'open-remote',
    'open-acquired',
    'local-proprietary',
    'not-applicable'
  ]),
  'assurance.ceiling': Object.freeze([
    'none',
    'self-asserted',
    'behavioral',
    'cryptographic',
    'hardware-rooted'
  ])
});

function requirePlain(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${name} must be an object`);
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

function rejectUnknown(value, allowed, name) {
  requirePlain(value, name);
  const allowedSet = new Set(allowed);
  for (const field of Object.keys(value)) {
    if (!allowedSet.has(field)) {
      throw new ValidationError(`${name} contains unknown field ${field}`);
    }
  }
}

function requireString(value, name, max = 512) {
  if (typeof value !== 'string' || value.length < 1 || value.length > max) {
    throw new ValidationError(`${name} must be a non-empty string with at most ${max} characters`);
  }
  return value;
}

function requireIdentifier(value, name) {
  requireString(value, name, 192);
  if (!IDENTIFIER_RE.test(value)) throw new ValidationError(`${name} has an invalid format`);
  return value;
}

function requireTimestamp(value, name) {
  requireString(value, name, 64);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new ValidationError(`${name} must be a canonical ISO timestamp`);
  }
  return parsed.getTime();
}

function requireBoundary(value, field, expected) {
  if (value !== expected) {
    throw new ValidationError(`Cognitive selection boundary field ${field} is invalid`);
  }
}

function validatePreference(preference, field) {
  const vocabulary = CRITERION_VOCABULARIES[field];
  if (!Array.isArray(preference) || preference.length !== vocabulary.length) {
    throw new ValidationError(`Cognitive selection criterion ${field} preference must be a complete ordering`);
  }

  const seen = new Set();
  for (const value of preference) {
    if (!vocabulary.includes(value)) {
      throw new ValidationError(`Cognitive selection criterion ${field} contains invalid preference ${value}`);
    }
    if (seen.has(value)) {
      throw new ValidationError(`Cognitive selection criterion ${field} contains duplicate preference ${value}`);
    }
    seen.add(value);
  }

  if (seen.size !== vocabulary.length) {
    throw new ValidationError(`Cognitive selection criterion ${field} preference must cover its complete vocabulary`);
  }
}

function validatePolicyDocument(policy) {
  requireFields(policy, POLICY_FIELDS, 'Cognitive selection policy');
  rejectUnknown(policy, POLICY_FIELDS, 'Cognitive selection policy');

  if (policy.schema !== COGNITIVE_SELECTION_POLICY_SCHEMA) {
    throw new ValidationError('Cognitive selection policy schema is invalid');
  }
  if (policy.version !== 0) throw new ValidationError('Cognitive selection policy version is invalid');
  if (policy.status !== POLICY_STATUS) throw new ValidationError('Cognitive selection policy status is invalid');
  requireIdentifier(policy.policy_id, 'Cognitive selection policy_id');

  if (!Array.isArray(policy.criteria) || policy.criteria.length < 1 || policy.criteria.length > 11) {
    throw new ValidationError('Cognitive selection criteria must contain 1-11 criteria');
  }

  const seenFields = new Set();
  for (const criterion of policy.criteria) {
    requireFields(criterion, CRITERION_FIELDS, 'Cognitive selection criterion');
    rejectUnknown(criterion, CRITERION_FIELDS, 'Cognitive selection criterion');
    requireString(criterion.field, 'Cognitive selection criterion field', 96);
    if (!Object.hasOwn(CRITERION_VOCABULARIES, criterion.field)) {
      throw new ValidationError(`Cognitive selection criterion field ${criterion.field} is unsupported`);
    }
    if (seenFields.has(criterion.field)) {
      throw new ValidationError(`Cognitive selection policy contains duplicate criterion ${criterion.field}`);
    }
    seenFields.add(criterion.field);
    validatePreference(criterion.preference, criterion.field);
  }

  requireTimestamp(policy.created_at, 'Cognitive selection created_at');
  requireBoundary(policy.authority_effect, 'authority_effect', 'none');
  requireBoundary(policy.network_effect, 'network_effect', 'none');
  requireBoundary(policy.credential_visibility, 'credential_visibility', 'none');
  requireBoundary(policy.runtime_activation, 'runtime_activation', false);
  requireBoundary(policy.selection_effect, 'selection_effect', 'proposal-only');
  return policy;
}

export function validateCognitiveSelectionPolicy(policy) {
  validatePolicyDocument(policy);
  return Object.freeze({
    valid: true,
    schema: policy.schema,
    policy_id: policy.policy_id,
    policy_digest: digestObject(policy),
    criteria: policy.criteria.length,
    authority_effect: 'none',
    network_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false,
    selection_effect: 'proposal-only'
  });
}

function criterionValue(profile, field) {
  switch (field) {
    case 'integration_class':
      return profile.integration_class;
    case 'deployment.locality':
      return profile.deployment.locality;
    case 'deployment.access_mode':
      return profile.deployment.access_mode;
    case 'data_policy.retention':
      return profile.data_policy.retention;
    case 'data_policy.training_use':
      return profile.data_policy.training_use;
    case 'data_policy.exportability':
      return profile.data_policy.exportability;
    case 'economics.cost_class':
      return profile.economics.cost_class;
    case 'economics.latency_class':
      return profile.economics.latency_class;
    case 'economics.context_class':
      return profile.economics.context_class;
    case 'openness.weight_access':
      return profile.openness.weight_access;
    case 'assurance.ceiling':
      return profile.assurance.ceiling;
    default:
      throw new ValidationError(`Cognitive selection criterion field ${field} is unsupported`);
  }
}

function compareProfileIds(left, right) {
  if (left.profile_id < right.profile_id) return -1;
  if (left.profile_id > right.profile_id) return 1;
  return 0;
}

function compareByPolicy(left, right, criteria) {
  for (const criterion of criteria) {
    const leftValue = criterionValue(left.profile, criterion.field);
    const rightValue = criterionValue(right.profile, criterion.field);
    const leftPreference = criterion.preference.indexOf(leftValue);
    const rightPreference = criterion.preference.indexOf(rightValue);
    if (leftPreference < rightPreference) return -1;
    if (leftPreference > rightPreference) return 1;
  }
  return compareProfileIds(left.evidence, right.evidence);
}

function freezeCriterionEvidence(profile, criteria) {
  return Object.freeze(criteria.map((criterion) => Object.freeze({
    field: criterion.field,
    value: criterionValue(profile, criterion.field)
  })));
}

export function proposeCognitiveSelection(candidates, eligibilityRequest, policy) {
  validatePolicyDocument(policy);
  const eligibility = evaluateCognitiveCandidates(candidates, eligibilityRequest);
  const profilesById = new Map();
  for (const candidate of candidates) {
    profilesById.set(candidate.profile.profile_id, candidate.profile);
  }

  const rankable = eligibility.eligible.map((evidence) => ({
    evidence,
    profile: profilesById.get(evidence.profile_id)
  }));
  rankable.sort((left, right) => compareByPolicy(left, right, policy.criteria));

  const rankedCandidates = Object.freeze(rankable.map((item, index) => Object.freeze({
    rank: index + 1,
    profile_id: item.evidence.profile_id,
    offering_ref: item.evidence.offering_ref,
    profile_digest: item.evidence.profile_digest,
    criterion_values: freezeCriterionEvidence(item.profile, policy.criteria)
  })));
  const recommendation = rankedCandidates[0] ?? null;

  return Object.freeze({
    valid: true,
    schema: PROPOSAL_SCHEMA,
    version: 0,
    status: PROPOSAL_STATUS,
    request_id: eligibility.request_id,
    request_digest: eligibility.request_digest,
    policy_id: policy.policy_id,
    policy_digest: digestObject(policy),
    eligibility_report_digest: digestObject(eligibility),
    evaluated_profiles: eligibility.evaluated_profiles,
    eligible_profiles: eligibility.eligible.length,
    rejected_profiles: eligibility.rejected,
    ranked_candidates: rankedCandidates,
    recommendation_made: recommendation !== null,
    recommended_profile_id: recommendation?.profile_id ?? null,
    recommended_profile_digest: recommendation?.profile_digest ?? null,
    ranking_applied: true,
    winner_selected: false,
    requires_gateway_authorization: true,
    execution_effect: 'none',
    authority_effect: 'none',
    network_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false,
    selection_effect: 'proposal-only'
  });
}
