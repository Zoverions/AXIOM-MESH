import { digestObject, ValidationError } from './canonical.mjs';
import {
  cognitiveCapabilityProfileDigest,
  validateCognitiveCapabilityProfile
} from './cognitive-capability-profile.mjs';
import {
  cognitiveCapabilityObservationDigest,
  resolveCognitiveCapabilityObservation,
  validateCognitiveCapabilityObservation
} from './cognitive-capability-observation.mjs';

export const COGNITIVE_CAPABILITY_SURFACE_REPORT_SCHEMA =
  'axiom-cognitive-capability-surface-report.v0';

const REPORT_FIELDS = Object.freeze([
  'schema',
  'version',
  'status',
  'report_id',
  'profile_id',
  'profile_digest',
  'assessment_at',
  'recorded_at',
  'source_observations',
  'capability_surfaces',
  'contains_secret_material',
  'authority_effect',
  'network_effect',
  'training_effect',
  'spend_effect',
  'runtime_activation',
  'selection_effect'
]);

const SOURCE_FIELDS = Object.freeze([
  'observation_id',
  'observation_digest',
  'capability',
  'freshness',
  'observed_at',
  'valid_until',
  'recorded_at'
]);

const SURFACE_FIELDS = Object.freeze([
  'capability',
  'current_cells',
  'direct_conflict_cells',
  'mixed_conflict_cells',
  'variation_present'
]);

const FRESHNESS_VALUES = new Set([
  'current',
  'stale',
  'future',
  'not-yet-recorded'
]);

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;

function assertPlainObject(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${path} must be an object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new ValidationError(`${path} must be a plain object`);
  }
  return value;
}

function assertExactFields(value, expected, path) {
  const expectedSet = new Set(expected);
  for (const key of Object.keys(value)) {
    if (!expectedSet.has(key)) {
      throw new ValidationError(`${path} contains unknown field ${key}`);
    }
  }
  for (const key of expected) {
    if (!Object.hasOwn(value, key)) {
      throw new ValidationError(`${path} is missing required field ${key}`);
    }
  }
}

function assertIdentifier(value, path) {
  if (typeof value !== 'string' || !IDENTIFIER_PATTERN.test(value)) {
    throw new ValidationError(`${path} must be a valid identifier`);
  }
  return value;
}

function assertDigest(value, path) {
  if (typeof value !== 'string' || !DIGEST_PATTERN.test(value)) {
    throw new ValidationError(`${path} must be a lowercase sha256 digest`);
  }
  return value;
}

function assertCanonicalTimestamp(value, path) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 64) {
    throw new ValidationError(`${path} must be a canonical ISO timestamp`);
  }
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    throw new ValidationError(`${path} must be a canonical ISO timestamp`);
  }
  return milliseconds;
}

function assertArray(value, path, maxItems) {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new ValidationError(`${path} must be an array with at most ${maxItems} items`);
  }
  return value;
}

function assertNonNegativeSafeInteger(value, path) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ValidationError(`${path} must be a non-negative safe integer`);
  }
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function freshnessAt(observation, assessmentMs) {
  if (Date.parse(observation.observed_at) > assessmentMs) return 'future';
  if (Date.parse(observation.recorded_at) > assessmentMs) return 'not-yet-recorded';
  if (Date.parse(observation.valid_until) < assessmentMs) return 'stale';
  return 'current';
}

function validateSourceObservation(item, index) {
  const path = `surface report source_observations[${index}]`;
  assertPlainObject(item, path);
  assertExactFields(item, SOURCE_FIELDS, path);
  assertIdentifier(item.observation_id, `${path}.observation_id`);
  assertDigest(item.observation_digest, `${path}.observation_digest`);
  assertIdentifier(item.capability, `${path}.capability`);
  if (!FRESHNESS_VALUES.has(item.freshness)) {
    throw new ValidationError(`${path}.freshness is invalid`);
  }
  assertCanonicalTimestamp(item.observed_at, `${path}.observed_at`);
  assertCanonicalTimestamp(item.valid_until, `${path}.valid_until`);
  assertCanonicalTimestamp(item.recorded_at, `${path}.recorded_at`);
}

function validateCapabilitySurface(item, index) {
  const path = `surface report capability_surfaces[${index}]`;
  assertPlainObject(item, path);
  assertExactFields(item, SURFACE_FIELDS, path);
  assertIdentifier(item.capability, `${path}.capability`);
  assertArray(item.current_cells, `${path}.current_cells`, 256);
  assertNonNegativeSafeInteger(item.direct_conflict_cells, `${path}.direct_conflict_cells`);
  assertNonNegativeSafeInteger(item.mixed_conflict_cells, `${path}.mixed_conflict_cells`);
  if (typeof item.variation_present !== 'boolean') {
    throw new ValidationError(`${path}.variation_present must be boolean`);
  }
}

function assertAuthorityBoundary(document) {
  if (
    document.contains_secret_material !== false ||
    document.authority_effect !== 'none' ||
    document.network_effect !== 'none' ||
    document.training_effect !== 'none' ||
    document.spend_effect !== 'none' ||
    document.runtime_activation !== false ||
    document.selection_effect !== 'evidence-only'
  ) {
    throw new ValidationError('surface report authority boundary is invalid');
  }
}

export function validateCognitiveCapabilitySurfaceReport(document) {
  assertPlainObject(document, 'surface report');
  assertExactFields(document, REPORT_FIELDS, 'surface report');

  if (document.schema !== COGNITIVE_CAPABILITY_SURFACE_REPORT_SCHEMA) {
    throw new ValidationError('surface report schema is invalid');
  }
  if (document.version !== 0) {
    throw new ValidationError('surface report version is invalid');
  }
  if (document.status !== 'inert-evidence-report') {
    throw new ValidationError('surface report status is invalid');
  }

  assertIdentifier(document.report_id, 'surface report report_id');
  assertIdentifier(document.profile_id, 'surface report profile_id');
  assertDigest(document.profile_digest, 'surface report profile_digest');
  const assessmentMs = assertCanonicalTimestamp(document.assessment_at, 'surface report assessment_at');
  const recordedMs = assertCanonicalTimestamp(document.recorded_at, 'surface report recorded_at');
  if (recordedMs < assessmentMs) {
    throw new ValidationError('surface report recorded_at cannot precede assessment_at');
  }

  assertArray(document.source_observations, 'surface report source_observations', 256);
  document.source_observations.forEach(validateSourceObservation);
  assertArray(document.capability_surfaces, 'surface report capability_surfaces', 64);
  document.capability_surfaces.forEach(validateCapabilitySurface);
  assertAuthorityBoundary(document);

  return deepFreeze({
    valid: true,
    schema: document.schema,
    version: document.version,
    status: document.status,
    report_id: document.report_id,
    profile_id: document.profile_id,
    profile_digest: document.profile_digest,
    assessment_at: document.assessment_at,
    recorded_at: document.recorded_at,
    source_observations: document.source_observations.length,
    capability_surfaces: document.capability_surfaces.length,
    authority_effect: document.authority_effect,
    network_effect: document.network_effect,
    training_effect: document.training_effect,
    spend_effect: document.spend_effect,
    runtime_activation: document.runtime_activation,
    selection_effect: document.selection_effect
  });
}

export function cognitiveCapabilitySurfaceReportDigest(document) {
  validateCognitiveCapabilitySurfaceReport(document);
  return digestObject(document);
}

export function deriveCognitiveCapabilitySurfaceReport({
  report_id,
  profile,
  observations,
  assessment_at,
  recorded_at
}) {
  assertIdentifier(report_id, 'surface report report_id');
  validateCognitiveCapabilityProfile(profile);
  const profileDigest = cognitiveCapabilityProfileDigest(profile);
  const assessmentMs = assertCanonicalTimestamp(assessment_at, 'surface report assessment_at');
  const recordedMs = assertCanonicalTimestamp(recorded_at, 'surface report recorded_at');
  if (recordedMs < assessmentMs) {
    throw new ValidationError('surface report recorded_at cannot precede assessment_at');
  }
  assertArray(observations, 'surface report observations', 256);

  const seenIds = new Set();
  const seenDigests = new Set();
  const sourceObservations = observations.map((observation, index) => {
    validateCognitiveCapabilityObservation(observation);
    resolveCognitiveCapabilityObservation(observation, profile);
    const observationDigest = cognitiveCapabilityObservationDigest(observation);

    if (seenIds.has(observation.observation_id)) {
      throw new ValidationError(`duplicate observation_id ${observation.observation_id}`);
    }
    if (seenDigests.has(observationDigest)) {
      throw new ValidationError(`duplicate observation digest ${observationDigest}`);
    }
    seenIds.add(observation.observation_id);
    seenDigests.add(observationDigest);

    return {
      observation_id: observation.observation_id,
      observation_digest: observationDigest,
      capability: observation.capability,
      freshness: freshnessAt(observation, assessmentMs),
      observed_at: observation.observed_at,
      valid_until: observation.valid_until,
      recorded_at: observation.recorded_at,
      _index: index
    };
  });

  sourceObservations.sort((left, right) =>
    left.observation_id.localeCompare(right.observation_id) ||
    left.observation_digest.localeCompare(right.observation_digest) ||
    left._index - right._index
  );
  for (const item of sourceObservations) delete item._index;

  const report = {
    schema: COGNITIVE_CAPABILITY_SURFACE_REPORT_SCHEMA,
    version: 0,
    status: 'inert-evidence-report',
    report_id,
    profile_id: profile.profile_id,
    profile_digest: profileDigest,
    assessment_at,
    recorded_at,
    source_observations: sourceObservations,
    capability_surfaces: profile.capabilities.map(capability => ({
      capability,
      current_cells: [],
      direct_conflict_cells: 0,
      mixed_conflict_cells: 0,
      variation_present: false
    })),
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    training_effect: 'none',
    spend_effect: 'none',
    runtime_activation: false,
    selection_effect: 'evidence-only'
  };

  validateCognitiveCapabilitySurfaceReport(report);
  return deepFreeze(report);
}
