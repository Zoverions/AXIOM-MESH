import { digestObject, ValidationError } from './canonical.mjs';
import { validateRuntimeConnectorCatalogEntry } from './runtime-connector-fabric-contracts.mjs';

export const COGNITIVE_CAPABILITY_PROFILE_SCHEMA = 'axiom-cognitive-capability-profile.v0';
export const COGNITIVE_ELIGIBILITY_REQUEST_SCHEMA = 'axiom-cognitive-eligibility-request.v0';

const PROFILE_STATUS = 'inert-routing-metadata-laboratory';
const REQUEST_STATUS = 'inert-eligibility-request';
const REPORT_SCHEMA = 'axiom-cognitive-eligibility-report.v0';
const REPORT_STATUS = 'inert-eligibility-report';

const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const VERSION_RE = /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?$/;
const SHA256_RE = /^[a-f0-9]{64}$/;

const INTEGRATION_CLASSES = Object.freeze([
  'agent-runtime',
  'model-provider',
  'compute-backend'
]);
const CAPABILITIES = Object.freeze([
  'reasoning',
  'coding',
  'vision',
  'computer-use',
  'research',
  'planning',
  'critique',
  'summarization',
  'embedding',
  'tool-use',
  'agent-orchestration',
  'other'
]);
const MODALITIES = Object.freeze(['text', 'image', 'audio', 'video', 'embedding']);
const LOCALITIES = Object.freeze(['owner-local', 'owner-remote', 'provider-remote', 'hybrid']);
const ACCESS_MODES = Object.freeze(['local-runtime', 'api', 'remote-runtime', 'hybrid']);
const RETENTION_CLASSES = Object.freeze(['none', 'transient', 'persistent', 'unknown']);
const TRAINING_USE_CLASSES = Object.freeze(['excluded', 'possible', 'unknown']);
const EXPORTABILITY_CLASSES = Object.freeze(['none', 'partial', 'full', 'unknown']);
const COST_CLASSES = Object.freeze(['none', 'low', 'medium', 'high', 'unknown']);
const LATENCY_CLASSES = Object.freeze(['local-fast', 'interactive', 'slow', 'batch', 'unknown']);
const CONTEXT_CLASSES = Object.freeze(['small', 'medium', 'large', 'very-large', 'unknown']);
const WEIGHT_ACCESS_CLASSES = Object.freeze([
  'closed',
  'open-remote',
  'open-acquired',
  'local-proprietary',
  'not-applicable'
]);
const ASSURANCE_CLASSES = Object.freeze([
  'none',
  'self-asserted',
  'behavioral',
  'cryptographic',
  'hardware-rooted'
]);

const PROFILE_FIELDS = Object.freeze([
  'schema',
  'version',
  'status',
  'profile_id',
  'catalog_entry',
  'integration_class',
  'offering_ref',
  'capabilities',
  'modalities',
  'deployment',
  'data_policy',
  'economics',
  'openness',
  'assurance',
  'created_at',
  'updated_at',
  'authority_effect',
  'network_effect',
  'credential_visibility',
  'runtime_activation',
  'selection_effect'
]);

const REQUEST_FIELDS = Object.freeze([
  'schema',
  'version',
  'status',
  'request_id',
  'required_capabilities',
  'allowed_integration_classes',
  'allowed_localities',
  'allowed_retention',
  'allowed_training_use',
  'allowed_weight_access',
  'max_cost_class',
  'max_latency_class',
  'min_assurance_ceiling',
  'min_context_class',
  'created_at',
  'authority_effect',
  'network_effect',
  'credential_visibility',
  'runtime_activation',
  'selection_effect'
]);

const COST_RANK = Object.freeze({ none: 0, low: 1, medium: 2, high: 3 });
const LATENCY_RANK = Object.freeze({ 'local-fast': 0, interactive: 1, slow: 2, batch: 3 });
const ASSURANCE_RANK = Object.freeze({
  none: 0,
  'self-asserted': 1,
  behavioral: 2,
  cryptographic: 3,
  'hardware-rooted': 4
});
const CONTEXT_RANK = Object.freeze({ small: 0, medium: 1, large: 2, 'very-large': 3 });

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

function requireVersion(value, name) {
  requireString(value, name, 96);
  if (!VERSION_RE.test(value)) throw new ValidationError(`${name} has an invalid format`);
  return value;
}

function requireDigest(value, name) {
  if (typeof value !== 'string' || !SHA256_RE.test(value)) {
    throw new ValidationError(`${name} must be a lowercase sha256 digest`);
  }
  return value;
}

function requireEnum(value, allowed, name) {
  if (!allowed.includes(value)) {
    throw new ValidationError(`${name} must be one of ${allowed.join(', ')}`);
  }
  return value;
}

function requireEnumArray(value, allowed, name, { min = 1, max = 32 } = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new ValidationError(`${name} must contain ${min}-${max} items`);
  }
  const seen = new Set();
  for (const item of value) {
    requireEnum(item, allowed, name);
    if (seen.has(item)) throw new ValidationError(`${name} contains duplicate value ${item}`);
    seen.add(item);
  }
  return value;
}

function requireStringArray(value, name, { max = 32 } = {}) {
  if (!Array.isArray(value) || value.length > max) {
    throw new ValidationError(`${name} must be an array with at most ${max} items`);
  }
  const seen = new Set();
  for (const item of value) {
    requireString(item, name, 512);
    if (seen.has(item)) throw new ValidationError(`${name} contains duplicate value ${item}`);
    seen.add(item);
  }
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
    throw new ValidationError(`Cognitive contract boundary field ${field} is invalid`);
  }
}

function validateCatalogBinding(value) {
  requireFields(value, ['entry_id', 'entry_version', 'entry_digest'], 'Cognitive capability catalog_entry');
  rejectUnknown(value, ['entry_id', 'entry_version', 'entry_digest'], 'Cognitive capability catalog_entry');
  requireIdentifier(value.entry_id, 'Cognitive capability catalog_entry.entry_id');
  requireVersion(value.entry_version, 'Cognitive capability catalog_entry.entry_version');
  requireDigest(value.entry_digest, 'Cognitive capability catalog_entry.entry_digest');
}

function validateModalities(value) {
  requireFields(value, ['input', 'output'], 'Cognitive capability modalities');
  rejectUnknown(value, ['input', 'output'], 'Cognitive capability modalities');
  requireEnumArray(value.input, MODALITIES, 'Cognitive capability modalities.input', { min: 1, max: 5 });
  requireEnumArray(value.output, MODALITIES, 'Cognitive capability modalities.output', { min: 1, max: 5 });
}

function validateDeployment(value) {
  requireFields(value, ['locality', 'access_mode'], 'Cognitive capability deployment');
  rejectUnknown(value, ['locality', 'access_mode'], 'Cognitive capability deployment');
  requireEnum(value.locality, LOCALITIES, 'Cognitive capability deployment.locality');
  requireEnum(value.access_mode, ACCESS_MODES, 'Cognitive capability deployment.access_mode');

  if (value.locality === 'owner-local' && value.access_mode !== 'local-runtime') {
    throw new ValidationError('Cognitive capability owner-local deployment requires local-runtime access');
  }
  if (value.locality === 'owner-remote' && value.access_mode !== 'remote-runtime') {
    throw new ValidationError('Cognitive capability owner-remote deployment requires remote-runtime access');
  }
  if (value.locality === 'provider-remote' && !['api', 'remote-runtime'].includes(value.access_mode)) {
    throw new ValidationError('Cognitive capability provider-remote deployment requires api or remote-runtime access');
  }
  if (value.locality === 'hybrid' && value.access_mode !== 'hybrid') {
    throw new ValidationError('Cognitive capability hybrid deployment requires hybrid access');
  }
}

function validateDataPolicy(value) {
  requireFields(value, ['retention', 'training_use', 'exportability', 'policy_ref'], 'Cognitive capability data_policy');
  rejectUnknown(value, ['retention', 'training_use', 'exportability', 'policy_ref'], 'Cognitive capability data_policy');
  requireEnum(value.retention, RETENTION_CLASSES, 'Cognitive capability data_policy.retention');
  requireEnum(value.training_use, TRAINING_USE_CLASSES, 'Cognitive capability data_policy.training_use');
  requireEnum(value.exportability, EXPORTABILITY_CLASSES, 'Cognitive capability data_policy.exportability');
  if (value.policy_ref !== null) requireString(value.policy_ref, 'Cognitive capability data_policy.policy_ref', 512);
}

function validateEconomics(value) {
  requireFields(value, ['cost_class', 'latency_class', 'context_class'], 'Cognitive capability economics');
  rejectUnknown(value, ['cost_class', 'latency_class', 'context_class'], 'Cognitive capability economics');
  requireEnum(value.cost_class, COST_CLASSES, 'Cognitive capability economics.cost_class');
  requireEnum(value.latency_class, LATENCY_CLASSES, 'Cognitive capability economics.latency_class');
  requireEnum(value.context_class, CONTEXT_CLASSES, 'Cognitive capability economics.context_class');
}

function validateOpenness(value) {
  requireFields(value, ['weight_access', 'artifact_digest', 'license_ref'], 'Cognitive capability openness');
  rejectUnknown(value, ['weight_access', 'artifact_digest', 'license_ref'], 'Cognitive capability openness');
  requireEnum(value.weight_access, WEIGHT_ACCESS_CLASSES, 'Cognitive capability openness.weight_access');
  if (value.license_ref !== null) requireString(value.license_ref, 'Cognitive capability openness.license_ref', 256);

  if (['open-acquired', 'local-proprietary'].includes(value.weight_access)) {
    requireDigest(value.artifact_digest, 'Cognitive capability openness.artifact_digest');
  } else if (value.artifact_digest !== null) {
    throw new ValidationError('Cognitive capability openness.artifact_digest must be null for this weight_access state');
  }
}

function validateAssurance(value) {
  requireFields(value, ['ceiling', 'evidence_refs'], 'Cognitive capability assurance');
  rejectUnknown(value, ['ceiling', 'evidence_refs'], 'Cognitive capability assurance');
  requireEnum(value.ceiling, ASSURANCE_CLASSES, 'Cognitive capability assurance.ceiling');
  requireStringArray(value.evidence_refs, 'Cognitive capability assurance.evidence_refs', { max: 64 });
}

function validateProfileDocument(profile) {
  requireFields(profile, PROFILE_FIELDS, 'Cognitive capability profile');
  rejectUnknown(profile, PROFILE_FIELDS, 'Cognitive capability profile');
  if (profile.schema !== COGNITIVE_CAPABILITY_PROFILE_SCHEMA) {
    throw new ValidationError('Cognitive capability profile schema is invalid');
  }
  if (profile.version !== 0) throw new ValidationError('Cognitive capability profile version is invalid');
  if (profile.status !== PROFILE_STATUS) throw new ValidationError('Cognitive capability profile status is invalid');

  requireIdentifier(profile.profile_id, 'Cognitive capability profile_id');
  validateCatalogBinding(profile.catalog_entry);
  requireEnum(profile.integration_class, INTEGRATION_CLASSES, 'Cognitive capability integration_class');
  requireIdentifier(profile.offering_ref, 'Cognitive capability offering_ref');
  requireEnumArray(profile.capabilities, CAPABILITIES, 'Cognitive capability capabilities', { min: 1, max: 32 });
  validateModalities(profile.modalities);
  validateDeployment(profile.deployment);
  validateDataPolicy(profile.data_policy);
  validateEconomics(profile.economics);
  validateOpenness(profile.openness);
  validateAssurance(profile.assurance);

  const createdAt = requireTimestamp(profile.created_at, 'Cognitive capability created_at');
  const updatedAt = requireTimestamp(profile.updated_at, 'Cognitive capability updated_at');
  if (updatedAt < createdAt) throw new ValidationError('Cognitive capability updated_at precedes created_at');

  requireBoundary(profile.authority_effect, 'authority_effect', 'none');
  requireBoundary(profile.network_effect, 'network_effect', 'none');
  requireBoundary(profile.credential_visibility, 'credential_visibility', 'none');
  requireBoundary(profile.runtime_activation, 'runtime_activation', false);
  requireBoundary(profile.selection_effect, 'selection_effect', 'eligibility-only');
  return profile;
}

export function cognitiveCapabilityProfileDigest(profile) {
  validateProfileDocument(profile);
  return digestObject(profile);
}

export function validateCognitiveCapabilityProfile(profile) {
  validateProfileDocument(profile);
  return Object.freeze({
    valid: true,
    schema: profile.schema,
    profile_id: profile.profile_id,
    offering_ref: profile.offering_ref,
    integration_class: profile.integration_class,
    profile_digest: digestObject(profile),
    authority_effect: 'none',
    network_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false,
    selection_effect: 'eligibility-only'
  });
}

export function resolveCognitiveCapabilityProfile(profile, catalogEntry) {
  validateProfileDocument(profile);
  validateRuntimeConnectorCatalogEntry(catalogEntry);

  if (profile.catalog_entry.entry_id !== catalogEntry.entry_id) {
    throw new ValidationError('Cognitive capability catalog entry_id does not match the supplied catalog entry');
  }
  if (profile.catalog_entry.entry_version !== catalogEntry.entry_version) {
    throw new ValidationError('Cognitive capability catalog entry_version does not match the supplied catalog entry');
  }
  const catalogDigest = digestObject(catalogEntry);
  if (profile.catalog_entry.entry_digest !== catalogDigest) {
    throw new ValidationError('Cognitive capability catalog entry digest does not match the supplied catalog entry');
  }
  if (profile.integration_class !== catalogEntry.integration_class) {
    throw new ValidationError('Cognitive capability integration_class does not match the supplied catalog entry');
  }

  const networkRequired = catalogEntry.requested_access.network_required;
  const { locality, access_mode: accessMode } = profile.deployment;
  if (locality === 'owner-local' && networkRequired) {
    throw new ValidationError('Cognitive capability owner-local runtime cannot bind a network-required catalog entry');
  }
  if (['owner-remote', 'provider-remote', 'hybrid'].includes(locality) && !networkRequired) {
    throw new ValidationError('Cognitive capability remote or hybrid deployment requires a network-required catalog entry');
  }

  return Object.freeze({
    valid: true,
    profile_id: profile.profile_id,
    profile_digest: digestObject(profile),
    offering_ref: profile.offering_ref,
    catalog_entry_id: catalogEntry.entry_id,
    catalog_entry_version: catalogEntry.entry_version,
    catalog_entry_digest: catalogDigest,
    integration_class: profile.integration_class,
    locality,
    access_mode: accessMode,
    requires_gateway_authorization: true,
    authority_effect: 'none',
    network_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false,
    selection_effect: 'eligibility-only'
  });
}

function validateRequestDocument(request) {
  requireFields(request, REQUEST_FIELDS, 'Cognitive eligibility request');
  rejectUnknown(request, REQUEST_FIELDS, 'Cognitive eligibility request');
  if (request.schema !== COGNITIVE_ELIGIBILITY_REQUEST_SCHEMA) {
    throw new ValidationError('Cognitive eligibility request schema is invalid');
  }
  if (request.version !== 0) throw new ValidationError('Cognitive eligibility request version is invalid');
  if (request.status !== REQUEST_STATUS) throw new ValidationError('Cognitive eligibility request status is invalid');

  requireIdentifier(request.request_id, 'Cognitive eligibility request_id');
  requireEnumArray(request.required_capabilities, CAPABILITIES, 'Cognitive eligibility required_capabilities', { min: 1, max: 32 });
  requireEnumArray(request.allowed_integration_classes, INTEGRATION_CLASSES, 'Cognitive eligibility allowed_integration_classes', { min: 1, max: 3 });
  requireEnumArray(request.allowed_localities, LOCALITIES, 'Cognitive eligibility allowed_localities', { min: 1, max: 4 });
  requireEnumArray(request.allowed_retention, RETENTION_CLASSES, 'Cognitive eligibility allowed_retention', { min: 1, max: 4 });
  requireEnumArray(request.allowed_training_use, TRAINING_USE_CLASSES, 'Cognitive eligibility allowed_training_use', { min: 1, max: 3 });
  requireEnumArray(request.allowed_weight_access, WEIGHT_ACCESS_CLASSES, 'Cognitive eligibility allowed_weight_access', { min: 1, max: 5 });
  requireEnum(request.max_cost_class, COST_CLASSES, 'Cognitive eligibility max_cost_class');
  requireEnum(request.max_latency_class, LATENCY_CLASSES, 'Cognitive eligibility max_latency_class');
  requireEnum(request.min_assurance_ceiling, ASSURANCE_CLASSES, 'Cognitive eligibility min_assurance_ceiling');
  requireEnum(request.min_context_class, CONTEXT_CLASSES, 'Cognitive eligibility min_context_class');
  requireTimestamp(request.created_at, 'Cognitive eligibility created_at');

  requireBoundary(request.authority_effect, 'authority_effect', 'none');
  requireBoundary(request.network_effect, 'network_effect', 'none');
  requireBoundary(request.credential_visibility, 'credential_visibility', 'none');
  requireBoundary(request.runtime_activation, 'runtime_activation', false);
  requireBoundary(request.selection_effect, 'selection_effect', 'eligibility-only');
  return request;
}

export function validateCognitiveEligibilityRequest(request) {
  validateRequestDocument(request);
  return Object.freeze({
    valid: true,
    schema: request.schema,
    request_id: request.request_id,
    request_digest: digestObject(request),
    authority_effect: 'none',
    network_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false,
    selection_effect: 'eligibility-only'
  });
}

function exceedsMaximum(candidate, maximum, ranks) {
  if (maximum === 'unknown') return false;
  if (candidate === 'unknown') return true;
  return ranks[candidate] > ranks[maximum];
}

function belowMinimum(candidate, minimum, ranks) {
  if (minimum === 'unknown') return false;
  if (candidate === 'unknown') return true;
  return ranks[candidate] < ranks[minimum];
}

function reasonsFor(profile, request) {
  const reasons = [];
  if (request.required_capabilities.some((capability) => !profile.capabilities.includes(capability))) {
    reasons.push('missing-capability');
  }
  if (!request.allowed_integration_classes.includes(profile.integration_class)) {
    reasons.push('integration-class-not-allowed');
  }
  if (!request.allowed_localities.includes(profile.deployment.locality)) {
    reasons.push('locality-not-allowed');
  }
  if (!request.allowed_retention.includes(profile.data_policy.retention)) {
    reasons.push('retention-not-allowed');
  }
  if (!request.allowed_training_use.includes(profile.data_policy.training_use)) {
    reasons.push('training-use-not-allowed');
  }
  if (!request.allowed_weight_access.includes(profile.openness.weight_access)) {
    reasons.push('weight-access-not-allowed');
  }
  if (exceedsMaximum(profile.economics.cost_class, request.max_cost_class, COST_RANK)) {
    reasons.push('cost-too-high-or-unknown');
  }
  if (exceedsMaximum(profile.economics.latency_class, request.max_latency_class, LATENCY_RANK)) {
    reasons.push('latency-too-high-or-unknown');
  }
  if (belowMinimum(profile.assurance.ceiling, request.min_assurance_ceiling, ASSURANCE_RANK)) {
    reasons.push('assurance-too-low-or-unknown');
  }
  if (belowMinimum(profile.economics.context_class, request.min_context_class, CONTEXT_RANK)) {
    reasons.push('context-too-small-or-unknown');
  }
  return reasons.sort();
}

function freezeRecord(record) {
  return Object.freeze(record);
}

function compareProfileIds(left, right) {
  if (left.profile_id < right.profile_id) return -1;
  if (left.profile_id > right.profile_id) return 1;
  return 0;
}

export function evaluateCognitiveCandidates(candidates, request) {
  validateRequestDocument(request);
  if (!Array.isArray(candidates) || candidates.length < 1 || candidates.length > 256) {
    throw new ValidationError('Cognitive candidates must contain 1-256 candidate bindings');
  }

  const seen = new Set();
  const eligible = [];
  const rejected = [];

  for (const candidate of candidates) {
    requireFields(candidate, ['profile', 'catalog_entry'], 'Cognitive candidate binding');
    rejectUnknown(candidate, ['profile', 'catalog_entry'], 'Cognitive candidate binding');
    const resolved = resolveCognitiveCapabilityProfile(candidate.profile, candidate.catalog_entry);
    if (seen.has(candidate.profile.profile_id)) {
      throw new ValidationError(`Cognitive candidates contain duplicate profile_id ${candidate.profile.profile_id}`);
    }
    seen.add(candidate.profile.profile_id);

    const base = {
      profile_id: candidate.profile.profile_id,
      offering_ref: candidate.profile.offering_ref,
      profile_digest: resolved.profile_digest
    };
    const reasons = reasonsFor(candidate.profile, request);
    if (reasons.length) {
      rejected.push(freezeRecord({ ...base, reasons: Object.freeze(reasons) }));
    } else {
      eligible.push(freezeRecord(base));
    }
  }

  eligible.sort(compareProfileIds);
  rejected.sort(compareProfileIds);

  return Object.freeze({
    valid: true,
    schema: REPORT_SCHEMA,
    version: 0,
    status: REPORT_STATUS,
    request_id: request.request_id,
    request_digest: digestObject(request),
    evaluated_profiles: candidates.length,
    eligible: Object.freeze(eligible),
    rejected: Object.freeze(rejected),
    ranking_applied: false,
    winner_selected: false,
    requires_gateway_authorization: true,
    authority_effect: 'none',
    network_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false,
    selection_effect: 'eligibility-only'
  });
}
