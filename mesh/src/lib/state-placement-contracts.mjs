import { canonicalJson, digestObject, ValidationError } from './canonical.mjs';

export const STATE_PLACEMENT_REQUEST_SCHEMA = 'axiom-state-placement-request.v1';
export const STATE_DESTINATION_PROFILE_SCHEMA = 'axiom-state-destination-profile.v0';
export const STATE_PLACEMENT_POLICY_SCHEMA = 'axiom-state-placement-policy.v0';
export const STATE_PLACEMENT_PLAN_SCHEMA = 'axiom-state-placement-plan.v1';

export const PLACEMENT_OPERATION_CLASSES = Object.freeze([
  'replicate', 'cache', 'archive', 'export-staging', 'restore-staging'
]);
export const DESTINATION_CLASSES = Object.freeze([
  'owner-local', 'owner-peer', 'managed-object', 'institutional-escrow', 'cold-archive'
]);
export const RESIDENCY_EVIDENCE_LEVELS = Object.freeze([
  'unknown', 'declared', 'provider-configured', 'authenticated-assertion', 'independently-verified'
]);
export const CONFIDENTIALITY_LEVELS = Object.freeze([
  'public', 'protected', 'sensitive', 'restricted'
]);
export const CONSISTENCY_CLASSES = Object.freeze([
  'immutable-object', 'eventual-derived', 'bounded-lag-replica'
]);
export const RECOVERY_IMPORTANCE = Object.freeze([
  'ordinary', 'important', 'critical'
]);
export const CONSEQUENCE_CLASSES = Object.freeze(['C0', 'C1', 'C2', 'C3']);
export const PLACEMENT_REASON_CODES = Object.freeze([
  'policy-owner-scope-mismatch',
  'operation-disallowed-by-policy',
  'destination-class-disallowed-by-policy',
  'destination-id-forbidden-by-policy',
  'managed-destination-disallowed-by-policy',
  'destination-class-not-permitted-by-request',
  'destination-class-forbidden-by-request',
  'operation-unsupported',
  'purpose-unsupported',
  'data-class-unsupported',
  'confidentiality-insufficient',
  'disclosure-mode-unsupported',
  'residency-region-mismatch',
  'residency-evidence-insufficient',
  'retention-window-unsupported',
  'freshness-unsupported',
  'consistency-unsupported',
  'encryption-profile-unsupported',
  'recovery-importance-unsupported',
  'cost-ceiling-exceeded',
  'availability-target-unsatisfied'
]);

const MAX_CONTRACT_BYTES = 65_536;
const MAX_SAFE = Number.MAX_SAFE_INTEGER;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const REGION = /^[A-Z0-9][A-Z0-9-]{0,31}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const DISCLOSURE_MODES = new Set(['public', 'protected', 'ciphertext-only', 'commitment-only', 'aggregate-only']);
const EFFECT_FIELDS = ['authority_effect', 'network_effect', 'provider_effect', 'canonical_state_effect'];
const REQUEST_FIELDS = [
  'schema', 'version', 'status', 'request_id', 'owner_scope', 'source_state_family',
  'operation_class', 'purpose', 'data_class', 'confidentiality_requirement',
  'disclosure_ceiling', 'residency', 'permitted_destination_classes',
  'forbidden_destination_classes', 'retention', 'availability_target',
  'maximum_lag_ms', 'consistency_class', 'encryption_profile', 'recovery_importance',
  'cost_ceiling_units', 'consequence_class', 'policy_profile_digest', 'created_at',
  'expires_at', 'contains_secret_material', 'authority_effect', 'network_effect',
  'provider_effect', 'canonical_state_effect', 'request_digest'
];
const DESTINATION_FIELDS = [
  'schema', 'version', 'status', 'destination_id', 'destination_class', 'failure_domain',
  'regions', 'residency_evidence_level', 'owner_controlled', 'managed_provider',
  'allowed_operations', 'allowed_purposes', 'allowed_data_classes',
  'maximum_confidentiality', 'disclosure_modes', 'retention_days', 'maximum_lag_ms',
  'consistency_classes', 'encryption_profiles', 'recovery_importance_supported',
  'cost_units', 'observed_at', 'expires_at', 'contains_secret_material',
  'authority_effect', 'network_effect', 'provider_effect', 'canonical_state_effect',
  'profile_digest'
];
const POLICY_FIELDS = [
  'schema', 'version', 'status', 'policy_id', 'owner_scope', 'allowed_operations',
  'allowed_destination_classes', 'forbidden_destination_ids',
  'minimum_residency_evidence_level', 'managed_destinations_allowed',
  'maximum_eligible_destinations', 'maximum_plan_lifetime_ms', 'created_at', 'expires_at',
  'authority_effect', 'network_effect', 'provider_effect', 'canonical_state_effect', 'policy_digest'
];
const PLAN_FIELDS = [
  'schema', 'version', 'status', 'plan_id', 'request_id', 'request_digest',
  'policy_id', 'policy_digest', 'evaluated_at', 'expires_at', 'satisfied',
  'eligible_destinations', 'ineligible_destinations', 'availability_result',
  'authority_effect', 'network_effect', 'provider_effect', 'canonical_state_effect', 'plan_digest'
];

export function contractDigest(value, digestField) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError('contract must be a plain object');
  }
  const copy = { ...value };
  delete copy[digestField];
  return `sha256:${digestObject(copy)}`;
}

export function verifyStatePlacementRequest(value, { now } = {}) {
  const document = boundedCanonical(value, 'State placement request');
  exactObject(document, 'State placement request', REQUEST_FIELDS);
  if (document.schema !== STATE_PLACEMENT_REQUEST_SCHEMA || document.version !== 1 || document.status !== 'inert-contract-laboratory') {
    throw new ValidationError('State placement request schema/version/status is invalid');
  }
  id(document.request_id, 'request_id');
  id(document.owner_scope, 'owner_scope');
  id(document.source_state_family, 'source_state_family');
  enumValue(document.operation_class, 'operation_class', PLACEMENT_OPERATION_CLASSES);
  id(document.purpose, 'purpose');
  id(document.data_class, 'data_class');
  enumValue(document.confidentiality_requirement, 'confidentiality_requirement', CONFIDENTIALITY_LEVELS);
  disclosureMode(document.disclosure_ceiling, 'disclosure_ceiling');
  validateResidency(document.residency);
  uniqueEnumList(document.permitted_destination_classes, 'permitted_destination_classes', DESTINATION_CLASSES, 16, true);
  uniqueEnumList(document.forbidden_destination_classes, 'forbidden_destination_classes', DESTINATION_CLASSES, 16, false);
  rejectOverlap(document.permitted_destination_classes, document.forbidden_destination_classes, 'permitted_destination_classes and forbidden_destination_classes');
  validateRetention(document.retention, 'retention', ['minimum_days', 'maximum_days']);
  validateAvailabilityTarget(document.availability_target);
  integer(document.maximum_lag_ms, 'maximum_lag_ms', 0, 86_400_000);
  enumValue(document.consistency_class, 'consistency_class', CONSISTENCY_CLASSES);
  id(document.encryption_profile, 'encryption_profile');
  enumValue(document.recovery_importance, 'recovery_importance', RECOVERY_IMPORTANCE);
  integer(document.cost_ceiling_units, 'cost_ceiling_units', 0, MAX_SAFE);
  enumValue(document.consequence_class, 'consequence_class', CONSEQUENCE_CLASSES);
  digest(document.policy_profile_digest, 'policy_profile_digest');
  const created = date(document.created_at, 'created_at');
  const expires = date(document.expires_at, 'expires_at');
  const current = nowTime(now);
  if (expires <= created || expires - created > 900_000) throw new ValidationError('request lifetime window must be greater than zero and at most 900000 ms');
  if (created > current || current >= expires) throw new ValidationError('request is outside its valid time window');
  if (document.contains_secret_material !== false) throw new ValidationError('contains_secret_material must be false');
  validateNoEffects(document, 'State placement request');
  verifyDigest(document, 'request_digest');
  return Object.freeze(document);
}

export function verifyStateDestinationProfile(value, { now } = {}) {
  const document = boundedCanonical(value, 'State destination profile');
  exactObject(document, 'State destination profile', DESTINATION_FIELDS);
  if (document.schema !== STATE_DESTINATION_PROFILE_SCHEMA || document.version !== 0 || document.status !== 'inert-contract-laboratory') {
    throw new ValidationError('State destination profile schema/version/status is invalid');
  }
  id(document.destination_id, 'destination_id');
  enumValue(document.destination_class, 'destination_class', DESTINATION_CLASSES);
  id(document.failure_domain, 'failure_domain');
  uniqueRegionList(document.regions, 'regions', 16, true);
  enumValue(document.residency_evidence_level, 'residency_evidence_level', RESIDENCY_EVIDENCE_LEVELS);
  boolean(document.owner_controlled, 'owner_controlled');
  boolean(document.managed_provider, 'managed_provider');
  if (document.managed_provider !== !document.owner_controlled) {
    throw new ValidationError('managed_provider must be the inverse of owner_controlled in v0');
  }
  uniqueEnumList(document.allowed_operations, 'allowed_operations', PLACEMENT_OPERATION_CLASSES, 32, true);
  uniqueIdList(document.allowed_purposes, 'allowed_purposes', 32, true);
  uniqueIdList(document.allowed_data_classes, 'allowed_data_classes', 32, true);
  enumValue(document.maximum_confidentiality, 'maximum_confidentiality', CONFIDENTIALITY_LEVELS);
  uniqueDisclosureList(document.disclosure_modes, 'disclosure_modes', 32, true);
  validateRetention(document.retention_days, 'retention_days', ['minimum', 'maximum']);
  integer(document.maximum_lag_ms, 'maximum_lag_ms', 0, 86_400_000);
  uniqueEnumList(document.consistency_classes, 'consistency_classes', CONSISTENCY_CLASSES, 3, true);
  uniqueIdList(document.encryption_profiles, 'encryption_profiles', 32, true);
  uniqueEnumList(document.recovery_importance_supported, 'recovery_importance_supported', RECOVERY_IMPORTANCE, 3, true);
  integer(document.cost_units, 'cost_units', 0, MAX_SAFE);
  const observed = date(document.observed_at, 'observed_at');
  const expires = date(document.expires_at, 'expires_at');
  const current = nowTime(now);
  if (expires <= observed) throw new ValidationError('destination expires_at must be after observed_at');
  if (observed > current || current >= expires) throw new ValidationError('destination profile is outside its valid time window');
  if (document.contains_secret_material !== false) throw new ValidationError('contains_secret_material must be false');
  validateNoEffects(document, 'State destination profile');
  verifyDigest(document, 'profile_digest');
  return Object.freeze(document);
}

export function verifyStatePlacementPolicy(value, { now } = {}) {
  const document = boundedCanonical(value, 'State placement policy');
  exactObject(document, 'State placement policy', POLICY_FIELDS);
  if (document.schema !== STATE_PLACEMENT_POLICY_SCHEMA || document.version !== 0 || document.status !== 'inert-contract-laboratory') {
    throw new ValidationError('State placement policy schema/version/status is invalid');
  }
  id(document.policy_id, 'policy_id');
  id(document.owner_scope, 'owner_scope');
  uniqueEnumList(document.allowed_operations, 'allowed_operations', PLACEMENT_OPERATION_CLASSES, 5, true);
  uniqueEnumList(document.allowed_destination_classes, 'allowed_destination_classes', DESTINATION_CLASSES, 5, true);
  uniqueIdList(document.forbidden_destination_ids, 'forbidden_destination_ids', 64, false);
  enumValue(document.minimum_residency_evidence_level, 'minimum_residency_evidence_level', RESIDENCY_EVIDENCE_LEVELS);
  boolean(document.managed_destinations_allowed, 'managed_destinations_allowed');
  integer(document.maximum_eligible_destinations, 'maximum_eligible_destinations', 1, 64);
  integer(document.maximum_plan_lifetime_ms, 'maximum_plan_lifetime_ms', 1, 900_000);
  const created = date(document.created_at, 'created_at');
  const expires = date(document.expires_at, 'expires_at');
  const current = nowTime(now);
  if (expires <= created) throw new ValidationError('policy expires_at must be after created_at');
  if (created > current || current >= expires) throw new ValidationError('policy is outside its valid time window');
  validateNoEffects(document, 'State placement policy');
  verifyDigest(document, 'policy_digest');
  return Object.freeze(document);
}

export function verifyStatePlacementPlan(value) {
  const document = boundedCanonical(value, 'State placement plan');
  exactObject(document, 'State placement plan', PLAN_FIELDS);
  if (document.schema !== STATE_PLACEMENT_PLAN_SCHEMA || document.version !== 1 || document.status !== 'inert-contract-laboratory') {
    throw new ValidationError('State placement plan schema/version/status is invalid');
  }
  id(document.plan_id, 'plan_id');
  id(document.request_id, 'request_id');
  digest(document.request_digest, 'request_digest');
  id(document.policy_id, 'policy_id');
  digest(document.policy_digest, 'policy_digest');
  const evaluated = date(document.evaluated_at, 'evaluated_at');
  const expires = date(document.expires_at, 'expires_at');
  if (expires <= evaluated || expires - evaluated > 900_000) throw new ValidationError('plan lifetime window must be greater than zero and at most 900000 ms');
  boolean(document.satisfied, 'satisfied');
  validateEligibleDestinations(document.eligible_destinations);
  validateIneligibleDestinations(document.ineligible_destinations);
  const eligibleIds = new Set(document.eligible_destinations.map((item) => item.destination_id));
  for (const item of document.ineligible_destinations) {
    if (eligibleIds.has(item.destination_id)) throw new ValidationError(`destination ${item.destination_id} cannot appear in both eligible and ineligible destinations`);
  }
  validateAvailabilityResult(document.availability_result, document.eligible_destinations, document.satisfied);
  validateNoEffects(document, 'State placement plan');
  verifyDigest(document, 'plan_digest');
  return Object.freeze(document);
}

function boundedCanonical(value, label) {
  let encoded;
  try {
    encoded = canonicalJson(value);
  } catch (error) {
    throw new ValidationError(`${label} is not canonical JSON-compatible: ${error.message}`);
  }
  if (Buffer.byteLength(encoded, 'utf8') > MAX_CONTRACT_BYTES) {
    throw new ValidationError(`${label} exceeds 65536 bytes`);
  }
  return JSON.parse(encoded);
}

function exactObject(value, label, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ValidationError(`${label} must be an object`);
  const allowed = new Set(fields);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new ValidationError(`${label} contains unknown field ${key}`);
  for (const key of fields) if (!Object.hasOwn(value, key)) throw new ValidationError(`${label} is missing required field ${key}`);
}

function id(value, label) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) throw new ValidationError(`${label} is invalid`);
}
function digest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) throw new ValidationError(`${label} digest is invalid`);
}
function date(value, label) {
  if (typeof value !== 'string' || value.length > 64) throw new ValidationError(`${label} must be a canonical ISO timestamp`);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) throw new ValidationError(`${label} must be a canonical ISO timestamp`);
  return parsed.getTime();
}
function nowTime(value) {
  if (value === undefined) throw new ValidationError('now is required for currentness verification');
  return date(value, 'now');
}
function boolean(value, label) {
  if (typeof value !== 'boolean') throw new ValidationError(`${label} must be boolean`);
}
function integer(value, label, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new ValidationError(`${label} must be an integer between ${min} and ${max}`);
}
function enumValue(value, label, allowed) {
  if (typeof value !== 'string' || !allowed.includes(value)) throw new ValidationError(`${label} is invalid`);
}
function disclosureMode(value, label) {
  if (typeof value !== 'string' || !DISCLOSURE_MODES.has(value)) throw new ValidationError(`${label} is invalid`);
}
function uniqueList(value, label, maxItems, nonempty, validateItem) {
  if (!Array.isArray(value) || value.length > maxItems || (nonempty && value.length === 0)) {
    throw new ValidationError(`${label} has invalid cardinality`);
  }
  const seen = new Set();
  for (const item of value) {
    validateItem(item);
    const key = String(item);
    if (seen.has(key)) throw new ValidationError(`${label} contains duplicate ${key}`);
    seen.add(key);
  }
}
function uniqueEnumList(value, label, allowed, maxItems, nonempty) {
  uniqueList(value, label, maxItems, nonempty, (item) => enumValue(item, label, allowed));
}
function uniqueIdList(value, label, maxItems, nonempty) {
  uniqueList(value, label, maxItems, nonempty, (item) => id(item, label));
}
function uniqueRegionList(value, label, maxItems, nonempty) {
  uniqueList(value, label, maxItems, nonempty, (item) => {
    if (typeof item !== 'string' || !REGION.test(item)) throw new ValidationError(`${label} contains invalid region`);
  });
}
function uniqueDisclosureList(value, label, maxItems, nonempty) {
  uniqueList(value, label, maxItems, nonempty, (item) => disclosureMode(item, label));
}
function rejectOverlap(left, right, label) {
  const rightSet = new Set(right);
  for (const item of left) if (rightSet.has(item)) throw new ValidationError(`${label} overlap on ${item}`);
}
function validateResidency(value) {
  exactObject(value, 'residency', ['allowed_regions', 'minimum_evidence_level']);
  uniqueRegionList(value.allowed_regions, 'residency.allowed_regions', 16, true);
  enumValue(value.minimum_evidence_level, 'residency.minimum_evidence_level', RESIDENCY_EVIDENCE_LEVELS);
}
function validateRetention(value, label, fields) {
  exactObject(value, label, fields);
  const [minimumField, maximumField] = fields;
  integer(value[minimumField], `${label}.${minimumField}`, 0, 36_500);
  integer(value[maximumField], `${label}.${maximumField}`, 0, 36_500);
  if (value[minimumField] > value[maximumField]) throw new ValidationError(`${label} minimum cannot exceed maximum`);
}
function validateAvailabilityTarget(value) {
  exactObject(value, 'availability_target', ['minimum_replicas', 'minimum_failure_domains']);
  integer(value.minimum_replicas, 'availability_target.minimum_replicas', 1, 16);
  integer(value.minimum_failure_domains, 'availability_target.minimum_failure_domains', 1, 16);
  if (value.minimum_failure_domains > value.minimum_replicas) throw new ValidationError('minimum_failure_domains cannot exceed minimum_replicas');
}
function validateNoEffects(document, label) {
  for (const field of EFFECT_FIELDS) {
    if (document[field] !== 'none') throw new ValidationError(`${label} effect boundary is invalid: ${field} must be none`);
  }
}
function verifyDigest(document, field) {
  digest(document[field], field);
  const expected = contractDigest(document, field);
  if (document[field] !== expected) throw new ValidationError(`${field} digest mismatch`);
}
function validateEligibleDestinations(value) {
  if (!Array.isArray(value) || value.length > 64) throw new ValidationError('eligible_destinations must contain at most 64 items');
  let previous = null;
  const seen = new Set();
  for (const item of value) {
    exactObject(item, 'eligible destination', [
      'destination_id', 'destination_class', 'profile_digest', 'failure_domain',
      'required_encryption_profile', 'receipt_required'
    ]);
    id(item.destination_id, 'eligible destination.destination_id');
    enumValue(item.destination_class, 'eligible destination.destination_class', DESTINATION_CLASSES);
    digest(item.profile_digest, 'eligible destination.profile_digest');
    id(item.failure_domain, 'eligible destination.failure_domain');
    id(item.required_encryption_profile, 'eligible destination.required_encryption_profile');
    if (item.receipt_required !== true) throw new ValidationError('eligible destination receipt_required must be true');
    if (previous !== null && item.destination_id <= previous) throw new ValidationError('eligible_destinations must be sorted by unique destination_id');
    if (seen.has(item.destination_id)) throw new ValidationError(`eligible_destinations contains duplicate ${item.destination_id}`);
    seen.add(item.destination_id);
    previous = item.destination_id;
  }
}
function validateIneligibleDestinations(value) {
  if (!Array.isArray(value) || value.length > 64) throw new ValidationError('ineligible_destinations must contain at most 64 items');
  let previous = null;
  const seen = new Set();
  for (const item of value) {
    exactObject(item, 'ineligible destination', ['destination_id', 'destination_class', 'profile_digest', 'reason_codes']);
    id(item.destination_id, 'ineligible destination.destination_id');
    enumValue(item.destination_class, 'ineligible destination.destination_class', DESTINATION_CLASSES);
    digest(item.profile_digest, 'ineligible destination.profile_digest');
    if (!Array.isArray(item.reason_codes) || item.reason_codes.length === 0 || item.reason_codes.length > PLACEMENT_REASON_CODES.length) {
      throw new ValidationError('reason_codes has invalid cardinality');
    }
    let previousReason = null;
    const reasons = new Set();
    for (const reason of item.reason_codes) {
      enumValue(reason, 'reason_codes', PLACEMENT_REASON_CODES);
      if (reasons.has(reason)) throw new ValidationError(`reason_codes contains duplicate ${reason}`);
      if (previousReason !== null && reason <= previousReason) throw new ValidationError('reason_codes must be sorted and unique');
      reasons.add(reason);
      previousReason = reason;
    }
    if (previous !== null && item.destination_id <= previous) throw new ValidationError('ineligible_destinations must be sorted by unique destination_id');
    if (seen.has(item.destination_id)) throw new ValidationError(`ineligible_destinations contains duplicate ${item.destination_id}`);
    seen.add(item.destination_id);
    previous = item.destination_id;
  }
}
function validateAvailabilityResult(value, eligibleDestinations, satisfied) {
  exactObject(value, 'availability_result', [
    'required_replicas', 'eligible_replicas', 'required_failure_domains', 'eligible_failure_domains'
  ]);
  integer(value.required_replicas, 'availability_result.required_replicas', 1, 16);
  integer(value.eligible_replicas, 'availability_result.eligible_replicas', 0, 64);
  integer(value.required_failure_domains, 'availability_result.required_failure_domains', 1, 16);
  integer(value.eligible_failure_domains, 'availability_result.eligible_failure_domains', 0, 64);
  if (value.required_failure_domains > value.required_replicas) throw new ValidationError('required_failure_domains cannot exceed required_replicas');
  if (value.eligible_replicas !== eligibleDestinations.length) throw new ValidationError('eligible_replicas must match eligible_destinations length');
  const domains = new Set(eligibleDestinations.map((item) => item.failure_domain));
  if (value.eligible_failure_domains !== domains.size) throw new ValidationError('eligible_failure_domains must match eligible destination failure domains');
  const expectedSatisfied = value.eligible_replicas >= value.required_replicas && value.eligible_failure_domains >= value.required_failure_domains;
  if (satisfied !== expectedSatisfied) throw new ValidationError('satisfied does not match availability_result');
}
