import { digestObject, ValidationError } from './canonical.mjs';
import { resolveCognitiveCapabilityProfile } from './cognitive-capability-profile.mjs';

export const COGNITIVE_ADVISOR_ESCALATION_POLICY_SCHEMA = 'axiom-cognitive-advisor-escalation-policy.v0';
export const COGNITIVE_ADVISOR_ESCALATION_REQUEST_SCHEMA = 'axiom-cognitive-advisor-escalation-request.v0';
export const COGNITIVE_ADVISOR_ESCALATION_PROPOSAL_SCHEMA = 'axiom-cognitive-advisor-escalation-proposal.v0';

const POLICY_STATUS = 'inert-escalation-policy';
const REQUEST_STATUS = 'inert-escalation-request';
const PROPOSAL_STATUS = 'inert-escalation-proposal';

const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const SHA256_RE = /^[a-f0-9]{64}$/;

const ESCALATION_REASONS = Object.freeze([
  'capability-gap',
  'quality-threshold',
  'owner-request'
]);

const DISCLOSURE_DATA_CLASSES = Object.freeze([
  'task-context',
  'selected-user-context',
  'public-context',
  'tool-output',
  'file-projection'
]);

const POLICY_FIELDS = Object.freeze([
  'schema',
  'version',
  'status',
  'policy_id',
  'allowed_reasons',
  'owner_confirmation_required',
  'projection_required',
  'created_at',
  'authority_effect',
  'network_effect',
  'credential_visibility',
  'runtime_activation',
  'escalation_effect'
]);

const REQUEST_FIELDS = Object.freeze([
  'schema',
  'version',
  'status',
  'request_id',
  'policy_id',
  'reason',
  'local_selection_proposal_digest',
  'advisor_candidate',
  'disclosure',
  'created_at',
  'authority_effect',
  'network_effect',
  'credential_visibility',
  'runtime_activation',
  'escalation_effect'
]);

const ADVISOR_FIELDS = Object.freeze(['profile', 'catalog_entry']);
const DISCLOSURE_FIELDS = Object.freeze([
  'purpose',
  'projection_digest',
  'data_classes',
  'raw_private_state_included',
  'credentials_included'
]);

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

function requireDigest(value, name) {
  if (typeof value !== 'string' || !SHA256_RE.test(value)) {
    throw new ValidationError(`${name} must be a lowercase sha256 digest`);
  }
  return value;
}

function requireTimestamp(value, name) {
  requireString(value, name, 64);
  if (!Number.isFinite(Date.parse(value))) throw new ValidationError(`${name} must be a valid timestamp`);
  return value;
}

function requireEnum(value, allowed, name) {
  if (!allowed.includes(value)) {
    throw new ValidationError(`${name} is invalid`);
  }
  return value;
}

function requireEnumArray(value, allowed, name, { min = 1, max = 16 } = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new ValidationError(`${name} must contain between ${min} and ${max} values`);
  }
  const seen = new Set();
  for (const item of value) {
    requireEnum(item, allowed, name);
    if (seen.has(item)) throw new ValidationError(`${name} must not contain duplicate values`);
    seen.add(item);
  }
  return value;
}

function requireBoundary(actual, field, expected) {
  if (actual !== expected) {
    throw new ValidationError(`Cognitive advisor escalation boundary ${field} must remain ${String(expected)}`);
  }
}

function validatePolicyDocument(policy) {
  requireFields(policy, POLICY_FIELDS, 'Cognitive advisor escalation policy');
  rejectUnknown(policy, POLICY_FIELDS, 'Cognitive advisor escalation policy');
  if (policy.schema !== COGNITIVE_ADVISOR_ESCALATION_POLICY_SCHEMA) {
    throw new ValidationError('Cognitive advisor escalation policy schema is invalid');
  }
  if (policy.version !== 0) throw new ValidationError('Cognitive advisor escalation policy version is invalid');
  if (policy.status !== POLICY_STATUS) throw new ValidationError('Cognitive advisor escalation policy status is invalid');

  requireIdentifier(policy.policy_id, 'Cognitive advisor escalation policy_id');
  requireEnumArray(policy.allowed_reasons, ESCALATION_REASONS, 'Cognitive advisor escalation allowed_reasons', { max: ESCALATION_REASONS.length });
  if (policy.owner_confirmation_required !== true) {
    throw new ValidationError('Cognitive advisor escalation owner confirmation is required in v0');
  }
  if (policy.projection_required !== true) {
    throw new ValidationError('Cognitive advisor escalation disclosure projection is required in v0');
  }
  requireTimestamp(policy.created_at, 'Cognitive advisor escalation policy created_at');

  requireBoundary(policy.authority_effect, 'authority_effect', 'none');
  requireBoundary(policy.network_effect, 'network_effect', 'none');
  requireBoundary(policy.credential_visibility, 'credential_visibility', 'none');
  requireBoundary(policy.runtime_activation, 'runtime_activation', false);
  requireBoundary(policy.escalation_effect, 'escalation_effect', 'proposal-only');
  return policy;
}

function validateDisclosure(disclosure) {
  requireFields(disclosure, DISCLOSURE_FIELDS, 'Cognitive advisor disclosure');
  rejectUnknown(disclosure, DISCLOSURE_FIELDS, 'Cognitive advisor disclosure');
  requireIdentifier(disclosure.purpose, 'Cognitive advisor disclosure purpose');
  requireDigest(disclosure.projection_digest, 'Cognitive advisor disclosure projection_digest');
  requireEnumArray(disclosure.data_classes, DISCLOSURE_DATA_CLASSES, 'Cognitive advisor disclosure data_classes', { max: DISCLOSURE_DATA_CLASSES.length });
  if (disclosure.raw_private_state_included !== false) {
    throw new ValidationError('Cognitive advisor disclosure must not include raw private state');
  }
  if (disclosure.credentials_included !== false) {
    throw new ValidationError('Cognitive advisor disclosure must not include credentials');
  }
  return disclosure;
}

function resolveRemoteAdvisor(advisorCandidate) {
  requireFields(advisorCandidate, ADVISOR_FIELDS, 'Cognitive advisor candidate');
  rejectUnknown(advisorCandidate, ADVISOR_FIELDS, 'Cognitive advisor candidate');
  const resolved = resolveCognitiveCapabilityProfile(
    advisorCandidate.profile,
    advisorCandidate.catalog_entry
  );

  if (
    resolved.integration_class !== 'model-provider' ||
    resolved.locality !== 'provider-remote' ||
    resolved.access_mode !== 'api' ||
    advisorCandidate.catalog_entry.requested_access.network_required !== true
  ) {
    throw new ValidationError('Cloud advisor candidate must be a remote model provider using an API-bound network-required catalog entry');
  }

  return resolved;
}

function validateRequestDocument(input) {
  requireFields(input, REQUEST_FIELDS, 'Cognitive advisor escalation request');
  rejectUnknown(input, REQUEST_FIELDS, 'Cognitive advisor escalation request');
  if (input.schema !== COGNITIVE_ADVISOR_ESCALATION_REQUEST_SCHEMA) {
    throw new ValidationError('Cognitive advisor escalation request schema is invalid');
  }
  if (input.version !== 0) throw new ValidationError('Cognitive advisor escalation request version is invalid');
  if (input.status !== REQUEST_STATUS) throw new ValidationError('Cognitive advisor escalation request status is invalid');

  requireIdentifier(input.request_id, 'Cognitive advisor escalation request_id');
  requireIdentifier(input.policy_id, 'Cognitive advisor escalation policy_id');
  requireEnum(input.reason, ESCALATION_REASONS, 'Cognitive advisor escalation reason');
  requireDigest(input.local_selection_proposal_digest, 'Cognitive advisor local selection proposal digest');
  const resolved = resolveRemoteAdvisor(input.advisor_candidate);
  validateDisclosure(input.disclosure);
  requireTimestamp(input.created_at, 'Cognitive advisor escalation request created_at');

  requireBoundary(input.authority_effect, 'authority_effect', 'none');
  requireBoundary(input.network_effect, 'network_effect', 'none');
  requireBoundary(input.credential_visibility, 'credential_visibility', 'none');
  requireBoundary(input.runtime_activation, 'runtime_activation', false);
  requireBoundary(input.escalation_effect, 'escalation_effect', 'proposal-only');

  return resolved;
}

export function validateCognitiveAdvisorEscalationPolicy(policy) {
  validatePolicyDocument(policy);
  return Object.freeze({
    valid: true,
    schema: policy.schema,
    policy_id: policy.policy_id,
    policy_digest: digestObject(policy),
    allowed_reasons: Object.freeze([...policy.allowed_reasons]),
    owner_confirmation_required: true,
    projection_required: true,
    authority_effect: 'none',
    network_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false,
    escalation_effect: 'proposal-only'
  });
}

export function validateCognitiveAdvisorEscalationRequest(input) {
  const resolved = validateRequestDocument(input);
  return Object.freeze({
    valid: true,
    schema: input.schema,
    request_id: input.request_id,
    request_digest: digestObject(input),
    policy_id: input.policy_id,
    reason: input.reason,
    advisor_profile_id: resolved.profile_id,
    advisor_profile_digest: resolved.profile_digest,
    catalog_entry_id: resolved.catalog_entry_id,
    catalog_entry_digest: resolved.catalog_entry_digest,
    disclosure_projection_digest: input.disclosure.projection_digest,
    disclosure_data_classes: Object.freeze([...input.disclosure.data_classes]),
    authority_effect: 'none',
    network_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false,
    escalation_effect: 'proposal-only'
  });
}

export function proposeCognitiveAdvisorEscalation(input, policy) {
  const validatedPolicy = validateCognitiveAdvisorEscalationPolicy(policy);
  const validatedRequest = validateCognitiveAdvisorEscalationRequest(input);

  if (validatedRequest.policy_id !== validatedPolicy.policy_id) {
    throw new ValidationError('Cognitive advisor escalation policy_id does not match the supplied policy');
  }
  if (!validatedPolicy.allowed_reasons.includes(validatedRequest.reason)) {
    throw new ValidationError('Cognitive advisor escalation reason is not allowed by policy');
  }

  return Object.freeze({
    valid: true,
    schema: COGNITIVE_ADVISOR_ESCALATION_PROPOSAL_SCHEMA,
    version: 0,
    status: PROPOSAL_STATUS,
    request_id: validatedRequest.request_id,
    request_digest: digestObject(input),
    policy_id: validatedPolicy.policy_id,
    policy_digest: digestObject(policy),
    reason: validatedRequest.reason,
    local_selection_proposal_digest: input.local_selection_proposal_digest,
    advisor_profile_id: validatedRequest.advisor_profile_id,
    advisor_profile_digest: validatedRequest.advisor_profile_digest,
    catalog_entry_id: validatedRequest.catalog_entry_id,
    catalog_entry_digest: validatedRequest.catalog_entry_digest,
    disclosure_purpose: input.disclosure.purpose,
    disclosure_projection_digest: validatedRequest.disclosure_projection_digest,
    disclosure_data_classes: Object.freeze([...validatedRequest.disclosure_data_classes]),
    requires_owner_confirmation: true,
    requires_gateway_authorization: true,
    requires_disclosure_authorization: true,
    recommendation_only: true,
    execution_effect: 'none',
    authority_effect: 'none',
    network_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false,
    escalation_effect: 'proposal-only'
  });
}
