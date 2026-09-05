import { digestObject, ValidationError } from './canonical.mjs';
import {
  cognitiveTopologyDigest,
  validateCognitiveTopology
} from './cognitive-topology.mjs';
import {
  cognitiveCapabilityProfileDigest,
  validateCognitiveCapabilityProfile
} from './cognitive-capability-profile.mjs';

export const REWARD_PROBE_MANIFEST_SCHEMA = 'axiom-reward-probe-manifest.v0';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const PROBE_TYPES = new Set(['state-value', 'reward-prediction-error']);
const MEASUREMENT_METHODS = new Set([
  'linear-probe',
  'sparse-feature-probe',
  'activation-subset',
  'model-native-signal',
  'other-reviewed'
]);
const TARGET_KINDS = new Set(['topology-node', 'model-artifact', 'runtime-offering']);
const ARTIFACT_AVAILABILITY = new Set([
  'exact',
  'unavailable-provider-controlled',
  'not-applicable'
]);
const CALIBRATION_CLASSES = new Set([
  'uncalibrated',
  'calibrated-bounded',
  'calibrated-probabilistic'
]);
const TRANSFER_SCOPES = new Set([
  'exact-target-only',
  'declared-family',
  'reviewed-cross-target'
]);

export function validateRewardProbeManifest(document) {
  validateManifestShape(document);
  return deepFreeze({
    valid: true,
    schema: document.schema,
    version: document.version,
    status: document.status,
    manifest_id: document.manifest_id,
    probe_type: document.probe_type,
    measurement_method: document.measurement_method,
    target_kind: document.target.kind,
    target_ref: document.target.target_ref,
    target_digest: document.target.target_digest,
    calibration_class: document.calibration.class,
    transfer_scope: document.transfer_scope,
    manifest_digest: digestObject(document),
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false,
    routing_effect: 'none',
    promotion_effect: 'evidence-only'
  });
}

export function rewardProbeManifestDigest(document) {
  validateManifestShape(document);
  return digestObject(document);
}

export function resolveRewardProbeManifest(document, target) {
  const validated = validateRewardProbeManifest(document);
  exactObject(target, 'Reward probe resolution target', resolutionTargetFields(target));
  enumValue(target.kind, 'resolution target kind', TARGET_KINDS);
  if (document.target.kind !== target.kind) {
    throw new ValidationError('Reward probe target kind does not match supplied resolution target');
  }

  if (target.kind === 'topology-node') {
    validateTopologyTarget(document.target, target);
  } else if (target.kind === 'runtime-offering') {
    validateRuntimeTarget(document.target, target);
  } else {
    validateArtifactTarget(document.target, target);
  }

  return deepFreeze({
    valid: true,
    schema: REWARD_PROBE_MANIFEST_SCHEMA,
    manifest_id: document.manifest_id,
    manifest_digest: validated.manifest_digest,
    probe_type: document.probe_type,
    measurement_method: document.measurement_method,
    calibration_class: document.calibration.class,
    transfer_scope: document.transfer_scope,
    target_kind: document.target.kind,
    target_ref: document.target.target_ref,
    target_digest: document.target.target_digest,
    node_id: document.target.node_id,
    model_id: document.target.model_id,
    artifact_digest: document.target.artifact_digest,
    profile_id: document.target.profile_id,
    offering_ref: document.target.offering_ref,
    catalog_entry_id: document.target.catalog_entry_id,
    catalog_entry_digest: document.target.catalog_entry_digest,
    artifact_digest_availability: document.target.artifact_digest_availability,
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false,
    routing_effect: 'none',
    promotion_effect: 'evidence-only'
  });
}

function validateManifestShape(document) {
  exactObject(document, 'Reward probe manifest', [
    'schema',
    'version',
    'status',
    'manifest_id',
    'probe_type',
    'measurement_method',
    'target',
    'probe_artifact_ref',
    'probe_artifact_digest',
    'method_ref',
    'evidence_ref',
    'evidence_digest',
    'feature_descriptor',
    'training_data_class',
    'dataset_refs',
    'calibration',
    'transfer_scope',
    'transfer_evidence_refs',
    'limitations',
    'source_refs',
    'created_at',
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
    document.schema !== REWARD_PROBE_MANIFEST_SCHEMA
    || document.version !== 0
    || document.status !== 'inert-evidence'
  ) {
    throw new ValidationError('Reward probe manifest schema/version/status is invalid');
  }

  id(document.manifest_id, 'manifest_id');
  enumValue(document.probe_type, 'probe_type', PROBE_TYPES);
  enumValue(document.measurement_method, 'measurement_method', MEASUREMENT_METHODS);
  validateTarget(document.target);
  validateProbeArtifact(document);
  nullableId(document.method_ref, 'method_ref');
  nullableId(document.evidence_ref, 'evidence_ref');
  nullableDigest(document.evidence_digest, 'evidence_digest');
  boundedString(document.feature_descriptor, 'feature_descriptor', 1, 1024);
  id(document.training_data_class, 'training_data_class');
  idArray(document.dataset_refs, 'dataset_refs', 0, 32);
  validateCalibration(document.calibration);
  enumValue(document.transfer_scope, 'transfer_scope', TRANSFER_SCOPES);
  idArray(document.transfer_evidence_refs, 'transfer_evidence_refs', 0, 32);
  if (document.transfer_scope !== 'exact-target-only' && document.transfer_evidence_refs.length === 0) {
    throw new ValidationError('Broader reward probe transfer scope requires transfer evidence');
  }
  stringArray(document.limitations, 'limitations', 0, 32, 1024);
  idArray(document.source_refs, 'source_refs', 0, 32);

  if (document.measurement_method === 'other-reviewed') {
    if (document.method_ref === null || document.evidence_ref === null || document.evidence_digest === null) {
      throw new ValidationError('other-reviewed reward probes require method and evidence provenance');
    }
  }

  const createdAt = date(document.created_at, 'created_at');
  const recordedAt = date(document.recorded_at, 'recorded_at');
  if (recordedAt < createdAt) {
    throw new ValidationError('recorded_at cannot precede created_at');
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
    throw new ValidationError('Reward probe manifest effect boundary is invalid');
  }
  return document;
}

function validateTarget(value) {
  exactObject(value, 'Reward probe target', [
    'kind',
    'target_ref',
    'target_digest',
    'node_id',
    'model_id',
    'artifact_digest',
    'profile_id',
    'offering_ref',
    'catalog_entry_id',
    'catalog_entry_digest',
    'artifact_digest_availability'
  ]);
  enumValue(value.kind, 'target.kind', TARGET_KINDS);
  id(value.target_ref, 'target.target_ref');
  digest(value.target_digest, 'target.target_digest');
  nullableId(value.node_id, 'target.node_id');
  nullableId(value.model_id, 'target.model_id');
  nullableDigest(value.artifact_digest, 'target.artifact_digest');
  nullableId(value.profile_id, 'target.profile_id');
  nullableId(value.offering_ref, 'target.offering_ref');
  nullableId(value.catalog_entry_id, 'target.catalog_entry_id');
  nullableDigest(value.catalog_entry_digest, 'target.catalog_entry_digest');
  enumValue(value.artifact_digest_availability, 'target.artifact_digest_availability', ARTIFACT_AVAILABILITY);

  if (value.kind === 'topology-node') {
    requirePresent(value.node_id, 'target.node_id');
    requirePresent(value.model_id, 'target.model_id');
    requireNull(value.profile_id, 'target.profile_id');
    requireNull(value.offering_ref, 'target.offering_ref');
    requireNull(value.catalog_entry_id, 'target.catalog_entry_id');
    requireNull(value.catalog_entry_digest, 'target.catalog_entry_digest');
    if (value.artifact_digest_availability === 'unavailable-provider-controlled') {
      throw new ValidationError('Topology-node reward probe targets cannot use provider-controlled artifact availability');
    }
  } else if (value.kind === 'model-artifact') {
    requireNull(value.node_id, 'target.node_id');
    requirePresent(value.model_id, 'target.model_id');
    requirePresent(value.artifact_digest, 'target.artifact_digest');
    requireNull(value.profile_id, 'target.profile_id');
    requireNull(value.offering_ref, 'target.offering_ref');
    requireNull(value.catalog_entry_id, 'target.catalog_entry_id');
    requireNull(value.catalog_entry_digest, 'target.catalog_entry_digest');
    if (value.target_digest !== value.artifact_digest || value.artifact_digest_availability !== 'exact') {
      throw new ValidationError('Model-artifact reward probe target must bind one exact artifact digest');
    }
  } else {
    requireNull(value.node_id, 'target.node_id');
    requireNull(value.model_id, 'target.model_id');
    requirePresent(value.profile_id, 'target.profile_id');
    requirePresent(value.offering_ref, 'target.offering_ref');
    requirePresent(value.catalog_entry_id, 'target.catalog_entry_id');
    requirePresent(value.catalog_entry_digest, 'target.catalog_entry_digest');
  }

  if (value.artifact_digest_availability === 'exact' && value.artifact_digest === null) {
    throw new ValidationError('Exact artifact availability requires target.artifact_digest');
  }
  if (value.artifact_digest_availability !== 'exact' && value.artifact_digest !== null) {
    throw new ValidationError('Non-exact artifact availability cannot carry target.artifact_digest');
  }
}

function validateProbeArtifact(document) {
  nullableId(document.probe_artifact_ref, 'probe_artifact_ref');
  nullableDigest(document.probe_artifact_digest, 'probe_artifact_digest');
  if ((document.probe_artifact_ref === null) !== (document.probe_artifact_digest === null)) {
    throw new ValidationError('probe_artifact_ref and probe_artifact_digest must both be null or both be present');
  }
  if (document.measurement_method !== 'model-native-signal' && document.probe_artifact_digest === null) {
    throw new ValidationError('Artifact-backed reward probe methods require an exact probe artifact digest');
  }
}

function validateCalibration(value) {
  exactObject(value, 'Reward probe calibration', [
    'class',
    'method_ref',
    'evidence_digest',
    'population_ref',
    'score_range',
    'normalization_rule_ref',
    'uncertainty_method_ref'
  ]);
  enumValue(value.class, 'calibration.class', CALIBRATION_CLASSES);
  nullableId(value.method_ref, 'calibration.method_ref');
  nullableDigest(value.evidence_digest, 'calibration.evidence_digest');
  nullableId(value.population_ref, 'calibration.population_ref');
  nullableId(value.normalization_rule_ref, 'calibration.normalization_rule_ref');
  nullableId(value.uncertainty_method_ref, 'calibration.uncertainty_method_ref');

  if (value.class === 'uncalibrated') {
    for (const field of [
      'method_ref', 'evidence_digest', 'population_ref', 'score_range',
      'normalization_rule_ref', 'uncertainty_method_ref'
    ]) {
      if (value[field] !== null) {
        throw new ValidationError(`Uncalibrated reward probe requires calibration.${field} to be null`);
      }
    }
    return;
  }

  requirePresent(value.method_ref, 'calibration.method_ref');
  requirePresent(value.evidence_digest, 'calibration.evidence_digest');
  requirePresent(value.population_ref, 'calibration.population_ref');
  validateRange(value.score_range, 'calibration.score_range');
  requirePresent(value.normalization_rule_ref, 'calibration.normalization_rule_ref');

  if (value.class === 'calibrated-probabilistic' && (value.score_range[0] !== 0 || value.score_range[1] !== 1)) {
    throw new ValidationError('Probabilistic reward probe calibration requires score_range [0, 1]');
  }
}

function validateTopologyTarget(documentTarget, supplied) {
  exactObject(supplied, 'Topology-node resolution target', ['kind', 'topology', 'node_id']);
  validateCognitiveTopology(supplied.topology);
  id(supplied.node_id, 'resolution target node_id');
  const topologyDigest = cognitiveTopologyDigest(supplied.topology);
  if (documentTarget.target_ref !== supplied.topology.topology_id || documentTarget.target_digest !== topologyDigest) {
    throw new ValidationError('Reward probe topology target does not bind the exact Cognitive Topology');
  }
  if (documentTarget.node_id !== supplied.node_id) {
    throw new ValidationError('Reward probe topology node_id does not match supplied node');
  }
  const node = supplied.topology.nodes.find(item => item.node_id === supplied.node_id);
  if (!node) throw new ValidationError(`Reward probe node_id ${supplied.node_id} is absent from Cognitive Topology`);
  if (documentTarget.model_id !== node.model_id) {
    throw new ValidationError('Reward probe model_id does not match the bound Cognitive Topology node');
  }
  if (documentTarget.artifact_digest !== node.weights.artifact_digest) {
    throw new ValidationError('Reward probe artifact digest does not match the bound Cognitive Topology node');
  }
  const expectedAvailability = node.weights.artifact_digest === null ? 'not-applicable' : 'exact';
  if (documentTarget.artifact_digest_availability !== expectedAvailability) {
    throw new ValidationError('Reward probe artifact availability does not match the bound Cognitive Topology node');
  }
}

function validateRuntimeTarget(documentTarget, supplied) {
  exactObject(supplied, 'Runtime-offering resolution target', ['kind', 'profile']);
  validateCognitiveCapabilityProfile(supplied.profile);
  const profileDigest = cognitiveCapabilityProfileDigest(supplied.profile);
  if (
    documentTarget.target_ref !== supplied.profile.profile_id
    || documentTarget.target_digest !== profileDigest
    || documentTarget.profile_id !== supplied.profile.profile_id
    || documentTarget.offering_ref !== supplied.profile.offering_ref
    || documentTarget.catalog_entry_id !== supplied.profile.catalog_entry.entry_id
    || documentTarget.catalog_entry_digest !== supplied.profile.catalog_entry.entry_digest
  ) {
    throw new ValidationError('Reward probe runtime target does not bind the exact Cognitive Capability Profile');
  }
  if (documentTarget.artifact_digest !== supplied.profile.openness.artifact_digest) {
    throw new ValidationError('Reward probe runtime artifact digest does not match the bound profile');
  }
  let expectedAvailability = 'not-applicable';
  if (supplied.profile.openness.artifact_digest !== null) expectedAvailability = 'exact';
  else if (supplied.profile.openness.weight_access === 'closed') expectedAvailability = 'unavailable-provider-controlled';
  if (documentTarget.artifact_digest_availability !== expectedAvailability) {
    throw new ValidationError('Reward probe runtime artifact availability does not match the bound profile');
  }
}

function validateArtifactTarget(documentTarget, supplied) {
  exactObject(supplied, 'Model-artifact resolution target', ['kind', 'model_id', 'artifact_digest']);
  id(supplied.model_id, 'resolution target model_id');
  digest(supplied.artifact_digest, 'resolution target artifact_digest');
  if (
    documentTarget.model_id !== supplied.model_id
    || documentTarget.artifact_digest !== supplied.artifact_digest
    || documentTarget.target_digest !== supplied.artifact_digest
    || documentTarget.artifact_digest_availability !== 'exact'
  ) {
    throw new ValidationError('Reward probe model-artifact target does not bind the exact supplied artifact');
  }
}

function resolutionTargetFields(target) {
  if (!target || typeof target !== 'object' || Array.isArray(target)) return ['kind'];
  if (target.kind === 'topology-node') return ['kind', 'topology', 'node_id'];
  if (target.kind === 'runtime-offering') return ['kind', 'profile'];
  if (target.kind === 'model-artifact') return ['kind', 'model_id', 'artifact_digest'];
  return ['kind'];
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
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) throw new ValidationError(`${label} is invalid`);
  return value;
}
function nullableId(value, label) { if (value === null) return null; return id(value, label); }
function digest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) throw new ValidationError(`${label} is invalid`);
  return value;
}
function nullableDigest(value, label) { if (value === null) return null; return digest(value, label); }
function enumValue(value, label, allowed) {
  if (typeof value !== 'string' || !allowed.has(value)) throw new ValidationError(`${label} is invalid`);
  return value;
}
function boundedString(value, label, min, max) {
  if (typeof value !== 'string' || value.length < min || value.length > max) {
    throw new ValidationError(`${label} must be a bounded string`);
  }
  return value;
}
function idArray(values, label, min, max) {
  if (!Array.isArray(values) || values.length < min || values.length > max) {
    throw new ValidationError(`${label} must contain between ${min} and ${max} identifiers`);
  }
  const seen = new Set();
  for (const [index, value] of values.entries()) {
    id(value, `${label}[${index}]`);
    if (seen.has(value)) throw new ValidationError(`${label} contains duplicate identifier ${value}`);
    seen.add(value);
  }
}
function stringArray(values, label, min, max, itemMax) {
  if (!Array.isArray(values) || values.length < min || values.length > max) {
    throw new ValidationError(`${label} must contain between ${min} and ${max} strings`);
  }
  for (const [index, value] of values.entries()) boundedString(value, `${label}[${index}]`, 1, itemMax);
}
function validateRange(value, label) {
  if (!Array.isArray(value) || value.length !== 2) throw new ValidationError(`${label} must be a two-number range`);
  if (!Number.isFinite(value[0]) || !Number.isFinite(value[1]) || value[0] >= value[1]) {
    throw new ValidationError(`${label} must contain finite increasing bounds`);
  }
}
function date(value, label) {
  if (typeof value !== 'string' || value.length > 64) throw new ValidationError(`${label} must be a canonical ISO timestamp`);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new ValidationError(`${label} must be a canonical ISO timestamp`);
  }
  return parsed.getTime();
}
function requirePresent(value, label) { if (value === null) throw new ValidationError(`${label} is required`); }
function requireNull(value, label) { if (value !== null) throw new ValidationError(`${label} must be null`); }
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}