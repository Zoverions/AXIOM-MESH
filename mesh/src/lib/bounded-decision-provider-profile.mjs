import { digestObject, ValidationError } from './canonical.mjs';
import { validateRuntimeConnectorCatalogEntry } from './runtime-connector-fabric-contracts.mjs';

export const BOUNDED_DECISION_PROVIDER_PROFILE_SCHEMA =
  'axiom-bounded-decision-provider-profile.v0';

const PROFILE_STATUS = 'inert-bounded-decision-metadata';
const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const VERSION_RE = /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?$/;
const SHA256_RE = /^[a-f0-9]{64}$/;

const REVISION_EVIDENCE = Object.freeze([
  'exact-artifact',
  'provider-versioned',
  'mutable-alias',
  'unknown'
]);
const PROVIDER_MODES = Object.freeze([
  'owner-local',
  'owner-remote',
  'provider-remote',
  'hybrid'
]);
const QUESTION_KINDS = Object.freeze(['choice', 'score', 'binary-probability']);
const TYPE_GUARANTEES = Object.freeze([
  'provider-native-closed-set',
  'adapter-constrained',
  'best-effort'
]);
const PROBABILITY_SUPPORT = Object.freeze([
  'full-distribution',
  'binary-probability-only',
  'confidence-only',
  'none'
]);
const LATENCY_CLASSES = Object.freeze([
  'local-fast',
  'interactive',
  'slow',
  'batch',
  'unknown'
]);
const CALIBRATION_CLAIMS = Object.freeze([
  'none',
  'provider-claimed',
  'local-experimental',
  'local-reviewed'
]);

const PROFILE_FIELDS = Object.freeze([
  'schema',
  'version',
  'status',
  'profile_id',
  'catalog_entry_id',
  'catalog_entry_version',
  'catalog_entry_digest',
  'offering_ref',
  'offering_version_or_revision',
  'offering_revision_evidence',
  'provider_mode',
  'supported_question_kinds',
  'max_questions_per_request',
  'max_choice_cardinality',
  'max_score_levels',
  'type_guarantee',
  'probability_support',
  'latency_class',
  'calibration_claim',
  'retention_posture_ref',
  'training_use_posture_ref',
  'created_at',
  'review_at',
  'authority_effect',
  'network_effect',
  'credential_visibility',
  'runtime_activation',
  'selection_effect',
  'assurance_effect'
]);

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

function requireString(value, name, max = 512) {
  if (typeof value !== 'string' || value.length < 1 || value.length > max) {
    throw new ValidationError(`${name} must be a non-empty string with at most ${max} characters`);
  }
  return value;
}

function requireIdentifier(value, name) {
  requireString(value, name, 192);
  if (!IDENTIFIER_RE.test(value)) throw new ValidationError(`${name} is invalid`);
  return value;
}

function requireVersion(value, name) {
  requireString(value, name, 96);
  if (!VERSION_RE.test(value)) throw new ValidationError(`${name} is invalid`);
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

function requireEnumArray(value, allowed, name, { min = 1, max = allowed.length } = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new ValidationError(`${name} must contain ${min}-${max} values`);
  }
  const seen = new Set();
  for (const item of value) {
    requireEnum(item, allowed, name);
    if (seen.has(item)) throw new ValidationError(`${name} contains duplicate value ${item}`);
    seen.add(item);
  }
  return value;
}

function requireInteger(value, name, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ValidationError(`${name} must be an integer in [${min}, ${max}]`);
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

function nullableBoundedString(value, name, max = 512) {
  if (value === null) return null;
  return requireString(value, name, max);
}

function requireBoundary(value, name, expected) {
  if (value !== expected) {
    throw new ValidationError(`Bounded decision provider boundary field ${name} is invalid`);
  }
}

function validateProfileShape(profile) {
  requireFields(profile, PROFILE_FIELDS, 'Bounded decision provider profile');
  rejectUnknown(profile, PROFILE_FIELDS, 'Bounded decision provider profile');

  if (profile.schema !== BOUNDED_DECISION_PROVIDER_PROFILE_SCHEMA) {
    throw new ValidationError('Bounded decision provider profile schema is invalid');
  }
  if (profile.version !== 0) {
    throw new ValidationError('Bounded decision provider profile version is invalid');
  }
  if (profile.status !== PROFILE_STATUS) {
    throw new ValidationError('Bounded decision provider profile status is invalid');
  }

  requireIdentifier(profile.profile_id, 'profile_id');
  requireIdentifier(profile.catalog_entry_id, 'catalog_entry_id');
  requireVersion(profile.catalog_entry_version, 'catalog_entry_version');
  requireDigest(profile.catalog_entry_digest, 'catalog_entry_digest');
  requireIdentifier(profile.offering_ref, 'offering_ref');
  requireString(profile.offering_version_or_revision, 'offering_version_or_revision', 256);
  requireEnum(profile.offering_revision_evidence, REVISION_EVIDENCE, 'offering_revision_evidence');
  requireEnum(profile.provider_mode, PROVIDER_MODES, 'provider_mode');
  requireEnumArray(
    profile.supported_question_kinds,
    QUESTION_KINDS,
    'supported_question_kinds',
    { min: 1, max: 3 }
  );
  requireInteger(profile.max_questions_per_request, 'max_questions_per_request', 1, 1024);
  requireInteger(profile.max_choice_cardinality, 'max_choice_cardinality', 2, 256);
  requireInteger(profile.max_score_levels, 'max_score_levels', 2, 64);
  requireEnum(profile.type_guarantee, TYPE_GUARANTEES, 'type_guarantee');
  requireEnum(profile.probability_support, PROBABILITY_SUPPORT, 'probability_support');
  requireEnum(profile.latency_class, LATENCY_CLASSES, 'latency_class');
  requireEnum(profile.calibration_claim, CALIBRATION_CLAIMS, 'calibration_claim');
  nullableBoundedString(profile.retention_posture_ref, 'retention_posture_ref');
  nullableBoundedString(profile.training_use_posture_ref, 'training_use_posture_ref');

  const createdAt = requireTimestamp(profile.created_at, 'created_at');
  const reviewAt = requireTimestamp(profile.review_at, 'review_at');
  if (reviewAt < createdAt) {
    throw new ValidationError('review_at cannot precede created_at');
  }

  requireBoundary(profile.authority_effect, 'authority_effect', 'none');
  requireBoundary(profile.network_effect, 'network_effect', 'none');
  requireBoundary(profile.credential_visibility, 'credential_visibility', 'none');
  requireBoundary(profile.runtime_activation, 'runtime_activation', false);
  requireBoundary(profile.selection_effect, 'selection_effect', 'eligibility-only');
  requireBoundary(profile.assurance_effect, 'assurance_effect', 'none');

  return profile;
}

export function validateBoundedDecisionProviderProfile(profile) {
  validateProfileShape(profile);
  return deepFreeze({
    valid: true,
    schema: profile.schema,
    profile_id: profile.profile_id,
    offering_ref: profile.offering_ref,
    offering_version_or_revision: profile.offering_version_or_revision,
    offering_revision_evidence: profile.offering_revision_evidence,
    provider_mode: profile.provider_mode,
    supported_question_kinds: [...profile.supported_question_kinds],
    profile_digest: digestObject(profile),
    authority_effect: 'none',
    network_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false,
    selection_effect: 'eligibility-only',
    assurance_effect: 'none'
  });
}

export function boundedDecisionProviderProfileDigest(profile) {
  validateProfileShape(profile);
  return digestObject(profile);
}

export function resolveBoundedDecisionProviderProfile(profile, catalogEntry) {
  const validated = validateBoundedDecisionProviderProfile(profile);
  validateRuntimeConnectorCatalogEntry(catalogEntry);

  if (profile.catalog_entry_id !== catalogEntry.entry_id) {
    throw new ValidationError('Bounded decision provider catalog entry_id does not match supplied catalog entry');
  }
  if (profile.catalog_entry_version !== catalogEntry.entry_version) {
    throw new ValidationError('Bounded decision provider catalog version does not match supplied catalog entry');
  }
  const catalogDigest = digestObject(catalogEntry);
  if (profile.catalog_entry_digest !== catalogDigest) {
    throw new ValidationError('Bounded decision provider catalog digest does not match supplied catalog entry');
  }
  if (!['model-provider', 'compute-backend', 'agent-runtime'].includes(catalogEntry.integration_class)) {
    throw new ValidationError('Bounded decision provider requires a cognitive runtime/provider catalog class');
  }

  const networkRequired = catalogEntry.requested_access.network_required === true;
  if (profile.provider_mode === 'owner-local' && networkRequired) {
    throw new ValidationError('Bounded decision owner-local provider cannot bind a network-required catalog entry');
  }
  if (
    ['owner-remote', 'provider-remote', 'hybrid'].includes(profile.provider_mode)
    && !networkRequired
  ) {
    throw new ValidationError('Bounded decision remote or hybrid provider requires a network-required catalog entry');
  }

  return deepFreeze({
    valid: true,
    schema: BOUNDED_DECISION_PROVIDER_PROFILE_SCHEMA,
    profile_id: profile.profile_id,
    profile_digest: validated.profile_digest,
    catalog_entry_id: catalogEntry.entry_id,
    catalog_entry_version: catalogEntry.entry_version,
    catalog_entry_digest: catalogDigest,
    integration_class: catalogEntry.integration_class,
    offering_ref: profile.offering_ref,
    offering_version_or_revision: profile.offering_version_or_revision,
    offering_revision_evidence: profile.offering_revision_evidence,
    provider_mode: profile.provider_mode,
    network_required: networkRequired,
    requires_gateway_authorization: true,
    authority_effect: 'none',
    network_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false,
    selection_effect: 'eligibility-only',
    assurance_effect: 'none'
  });
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
