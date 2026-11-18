import { digestObject, ValidationError } from './canonical.mjs';
import {
  rewardProbeManifestDigest,
  resolveRewardProbeManifest
} from './reward-probe-manifest.mjs';

export const REWARD_INTROSPECTION_OBSERVATION_SCHEMA =
  'axiom-reward-introspection-observation.v0';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;

export function validateRewardIntrospectionObservation(document) {
  validateObservationShape(document);
  return deepFreeze({
    valid: true,
    schema: document.schema,
    version: document.version,
    status: document.status,
    observation_id: document.observation_id,
    probe_manifest_id: document.probe_manifest_id,
    probe_manifest_digest: document.probe_manifest_digest,
    target_ref: document.target_ref,
    target_digest: document.target_digest,
    raw_score: document.raw_score,
    normalized_score: document.normalized_score,
    probability_semantics: document.probability_semantics,
    observation_digest: digestObject(document),
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false,
    routing_effect: 'none',
    promotion_effect: 'evidence-only'
  });
}

export function rewardIntrospectionObservationDigest(document) {
  validateObservationShape(document);
  return digestObject(document);
}

export function resolveRewardIntrospectionObservation(document, manifest, target) {
  const validated = validateRewardIntrospectionObservation(document);
  const resolvedManifest = resolveRewardProbeManifest(manifest, target);
  const expectedManifestDigest = rewardProbeManifestDigest(manifest);

  if (document.probe_manifest_id !== manifest.manifest_id) {
    throw new ValidationError('Reward introspection observation manifest_id does not match supplied manifest');
  }
  if (document.probe_manifest_digest !== expectedManifestDigest) {
    throw new ValidationError('Reward introspection observation manifest digest does not match supplied manifest');
  }
  if (
    document.target_ref !== resolvedManifest.target_ref
    || document.target_digest !== resolvedManifest.target_digest
  ) {
    throw new ValidationError('Reward introspection observation target does not match supplied manifest target');
  }

  validateSignalAgainstManifest(document, manifest);

  return deepFreeze({
    valid: true,
    schema: REWARD_INTROSPECTION_OBSERVATION_SCHEMA,
    observation_id: document.observation_id,
    observation_digest: validated.observation_digest,
    probe_manifest_id: document.probe_manifest_id,
    probe_manifest_digest: document.probe_manifest_digest,
    target_ref: document.target_ref,
    target_digest: document.target_digest,
    reasoning_state_ref: document.reasoning_state_ref,
    reasoning_state_digest: document.reasoning_state_digest,
    step_ref: document.step_ref,
    raw_score: document.raw_score,
    normalized_score: document.normalized_score,
    normalized_range: document.normalized_range === null
      ? null
      : [...document.normalized_range],
    probability_semantics: document.probability_semantics,
    uncertainty: document.uncertainty === null
      ? null
      : { ...document.uncertainty },
    provenance_ref: document.provenance_ref,
    provenance_digest: document.provenance_digest,
    observed_at: document.observed_at,
    recorded_at: document.recorded_at,
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false,
    routing_effect: 'none',
    promotion_effect: 'evidence-only'
  });
}

function validateObservationShape(document) {
  exactObject(document, 'Reward introspection observation', [
    'schema',
    'version',
    'status',
    'observation_id',
    'probe_manifest_id',
    'probe_manifest_digest',
    'target_ref',
    'target_digest',
    'reasoning_state_ref',
    'reasoning_state_digest',
    'step_ref',
    'raw_score',
    'normalized_score',
    'normalized_range',
    'probability_semantics',
    'uncertainty',
    'provenance_ref',
    'provenance_digest',
    'observed_at',
    'recorded_at',
    'contains_secret_material',
    'authority_effect',
    'network_effect',
    'credential_visibility',
    'runtime_activation',
    'routing_effect',
    'promotion_effect'
  ]);

  if (
    document.schema !== REWARD_INTROSPECTION_OBSERVATION_SCHEMA
    || document.version !== 0
    || document.status !== 'inert-evidence'
  ) {
    throw new ValidationError('Reward introspection observation schema/version/status is invalid');
  }

  id(document.observation_id, 'observation_id');
  id(document.probe_manifest_id, 'probe_manifest_id');
  digest(document.probe_manifest_digest, 'probe_manifest_digest');
  id(document.target_ref, 'target_ref');
  digest(document.target_digest, 'target_digest');
  id(document.reasoning_state_ref, 'reasoning_state_ref');
  digest(document.reasoning_state_digest, 'reasoning_state_digest');
  nullableId(document.step_ref, 'step_ref');

  finiteNumber(document.raw_score, 'raw_score');
  validateNormalizedPair(document.normalized_score, document.normalized_range);

  if (typeof document.probability_semantics !== 'boolean') {
    throw new ValidationError('probability_semantics must be boolean');
  }
  if (document.probability_semantics && document.normalized_score === null) {
    throw new ValidationError('probability semantics require normalized evidence');
  }

  validateUncertainty(document.uncertainty);
  id(document.provenance_ref, 'provenance_ref');
  digest(document.provenance_digest, 'provenance_digest');

  const observedAt = date(document.observed_at, 'observed_at');
  const recordedAt = date(document.recorded_at, 'recorded_at');
  if (recordedAt < observedAt) {
    throw new ValidationError('recorded_at cannot precede observed_at');
  }

  if (
    document.contains_secret_material !== false
    || document.authority_effect !== 'none'
    || document.network_effect !== 'none'
    || document.credential_visibility !== 'none'
    || document.runtime_activation !== false
    || document.routing_effect !== 'none'
    || document.promotion_effect !== 'evidence-only'
  ) {
    throw new ValidationError('Reward introspection observation effect boundary is invalid');
  }

  return document;
}

function validateSignalAgainstManifest(document, manifest) {
  const calibration = manifest.calibration;

  if (calibration.class === 'uncalibrated') {
    if (
      document.normalized_score !== null
      || document.normalized_range !== null
      || document.probability_semantics !== false
      || document.uncertainty !== null
    ) {
      throw new ValidationError('Uncalibrated reward probes cannot emit normalized, probabilistic, or uncertainty evidence');
    }
    return;
  }

  if (document.normalized_score === null || document.normalized_range === null) {
    throw new ValidationError('Calibrated reward probe observations require normalized evidence');
  }
  if (calibration.normalization_rule_ref === null || calibration.score_range === null) {
    throw new ValidationError('Calibrated reward probe manifest lacks normalization semantics');
  }
  if (!sameRange(document.normalized_range, calibration.score_range)) {
    throw new ValidationError('Reward introspection normalized range does not match the bound probe manifest');
  }
  if (
    document.normalized_score < calibration.score_range[0]
    || document.normalized_score > calibration.score_range[1]
  ) {
    throw new ValidationError('Reward introspection normalized score lies outside the bound probe range');
  }

  if (document.probability_semantics) {
    if (calibration.class !== 'calibrated-probabilistic') {
      throw new ValidationError('Probability semantics require calibrated-probabilistic probe evidence');
    }
    if (document.normalized_range[0] !== 0 || document.normalized_range[1] !== 1) {
      throw new ValidationError('Probability semantics require normalized range [0, 1]');
    }
  }

  if (document.uncertainty === null) return;
  if (calibration.uncertainty_method_ref === null) {
    throw new ValidationError('Reward introspection uncertainty requires a declared manifest uncertainty method');
  }
  if (document.uncertainty.method_ref !== calibration.uncertainty_method_ref) {
    throw new ValidationError('Reward introspection uncertainty method does not match the bound probe manifest');
  }
}

function validateNormalizedPair(score, range) {
  if (score === null && range === null) return;
  if (score === null || range === null) {
    throw new ValidationError('normalized_score and normalized_range must both be null or both be present');
  }
  finiteNumber(score, 'normalized_score');
  validateRange(range, 'normalized_range');
  if (score < range[0] || score > range[1]) {
    throw new ValidationError('normalized_score must lie inside normalized_range');
  }
}

function validateUncertainty(value) {
  if (value === null) return;
  exactObject(value, 'Reward introspection uncertainty', ['lower', 'upper', 'method_ref']);
  finiteNumber(value.lower, 'uncertainty.lower');
  finiteNumber(value.upper, 'uncertainty.upper');
  if (value.lower > value.upper) {
    throw new ValidationError('uncertainty.lower cannot exceed uncertainty.upper');
  }
  id(value.method_ref, 'uncertainty.method_ref');
}

function sameRange(left, right) {
  return Array.isArray(left)
    && Array.isArray(right)
    && left.length === 2
    && right.length === 2
    && left[0] === right[0]
    && left[1] === right[1];
}

function exactObject(value, label, allowedFields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${label} must be an object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new ValidationError(`${label} must be a plain object`);
  }
  const allowed = new Set(allowedFields);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ValidationError(`${label} contains unknown field ${key}`);
  }
  for (const key of allowedFields) {
    if (!Object.hasOwn(value, key)) throw new ValidationError(`${label} is missing required field ${key}`);
  }
}

function id(value, label) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) {
    throw new ValidationError(`${label} is invalid`);
  }
  return value;
}
function nullableId(value, label) {
  if (value === null) return null;
  return id(value, label);
}
function digest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) {
    throw new ValidationError(`${label} is invalid`);
  }
  return value;
}
function finiteNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ValidationError(`${label} must be a finite number`);
  }
  return value;
}
function validateRange(value, label) {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new ValidationError(`${label} must be a two-number range`);
  }
  finiteNumber(value[0], `${label}[0]`);
  finiteNumber(value[1], `${label}[1]`);
  if (value[0] >= value[1]) {
    throw new ValidationError(`${label} must contain finite increasing bounds`);
  }
}
function date(value, label) {
  if (typeof value !== 'string' || value.length > 64) {
    throw new ValidationError(`${label} must be a canonical ISO timestamp`);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new ValidationError(`${label} must be a canonical ISO timestamp`);
  }
  return parsed.getTime();
}
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
