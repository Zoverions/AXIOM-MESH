import { digestObject, ValidationError } from './canonical.mjs';
import {
  cognitiveTopologyDigest,
  validateCognitiveTopology
} from './cognitive-topology.mjs';

export const COGNITIVE_AVAILABILITY_ATTESTATION_SCHEMA = 'axiom-cognitive-availability-attestation.v0';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const AVAILABILITY = new Set(['available', 'unavailable', 'indeterminate']);
const OBSERVATION_MODES = new Set([
  'local-artifact',
  'local-runtime',
  'provider-api',
  'remote-runtime',
  'provider-statement',
  'synthetic-probe'
]);
const EVIDENCE_CLASSES = new Set([
  'direct-local',
  'direct-remote',
  'provider-asserted',
  'synthetic-observed',
  'indirect'
]);
const OWNER_ADDRESSABLE_WEIGHT_STATES = new Set(['open-acquired', 'local-proprietary']);

export function validateCognitiveAvailabilityAttestation(document) {
  exactObject(document, 'Cognitive availability attestation', [
    'schema',
    'version',
    'status',
    'attestation_id',
    'topology_id',
    'topology_digest',
    'node_id',
    'model_id',
    'declared_target',
    'observation',
    'observer_ref',
    'evidence',
    'observed_at',
    'valid_until',
    'recorded_at',
    'contains_secret_material',
    'authority_effect',
    'network_effect',
    'runtime_activation'
  ]);

  if (
    document.schema !== COGNITIVE_AVAILABILITY_ATTESTATION_SCHEMA ||
    document.version !== 0 ||
    document.status !== 'inert-evidence'
  ) {
    throw new ValidationError('Cognitive availability attestation schema/version/status is invalid');
  }

  identifier(document.attestation_id, 'attestation_id');
  identifier(document.topology_id, 'topology_id');
  digest(document.topology_digest, 'topology_digest');
  identifier(document.node_id, 'node_id');
  identifier(document.model_id, 'model_id');

  exactObject(document.declared_target, 'declared_target', [
    'access_mode',
    'custody',
    'weight_state',
    'artifact_digest'
  ]);
  identifier(document.declared_target.access_mode, 'declared_target.access_mode');
  identifier(document.declared_target.custody, 'declared_target.custody');
  identifier(document.declared_target.weight_state, 'declared_target.weight_state');
  nullableDigest(document.declared_target.artifact_digest, 'declared_target.artifact_digest');

  exactObject(document.observation, 'observation', [
    'availability',
    'observation_mode',
    'evidence_class',
    'observed_artifact_digest'
  ]);
  if (!AVAILABILITY.has(document.observation.availability)) {
    throw new ValidationError('observation.availability is invalid');
  }
  if (!OBSERVATION_MODES.has(document.observation.observation_mode)) {
    throw new ValidationError('observation.observation_mode is invalid');
  }
  if (!EVIDENCE_CLASSES.has(document.observation.evidence_class)) {
    throw new ValidationError('observation.evidence_class is invalid');
  }

  const ownerAddressable = OWNER_ADDRESSABLE_WEIGHT_STATES.has(document.declared_target.weight_state);
  if (ownerAddressable && document.observation.availability === 'available') {
    if (
      typeof document.observation.observed_artifact_digest !== 'string' ||
      !DIGEST.test(document.observation.observed_artifact_digest)
    ) {
      throw new ValidationError('observation.observed_artifact_digest is required for an available owner-addressable artifact');
    }
  } else if (document.observation.observed_artifact_digest !== null) {
    throw new ValidationError('observation.observed_artifact_digest must be null for this availability/weight state');
  }

  identifier(document.observer_ref, 'observer_ref');
  exactObject(document.evidence, 'evidence', ['evidence_ref', 'evidence_digest']);
  identifier(document.evidence.evidence_ref, 'evidence.evidence_ref');
  digest(document.evidence.evidence_digest, 'evidence.evidence_digest');

  const observedAt = timestamp(document.observed_at, 'observed_at');
  const validUntil = timestamp(document.valid_until, 'valid_until');
  const recordedAt = timestamp(document.recorded_at, 'recorded_at');
  if (validUntil < observedAt) {
    throw new ValidationError('valid_until cannot precede observed_at');
  }
  if (recordedAt < observedAt) {
    throw new ValidationError('recorded_at cannot precede observed_at');
  }

  if (
    document.contains_secret_material !== false ||
    document.authority_effect !== 'none' ||
    document.network_effect !== 'none' ||
    document.runtime_activation !== false
  ) {
    throw new ValidationError('Cognitive availability attestation activation boundary must remain zero-effect');
  }

  return Object.freeze({
    valid: true,
    schema: COGNITIVE_AVAILABILITY_ATTESTATION_SCHEMA,
    attestation_id: document.attestation_id,
    topology_id: document.topology_id,
    node_id: document.node_id,
    model_id: document.model_id,
    availability: document.observation.availability,
    observed_at: document.observed_at,
    valid_until: document.valid_until,
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  });
}

export function cognitiveAvailabilityAttestationDigest(document) {
  validateCognitiveAvailabilityAttestation(document);
  return digestObject(document);
}

export function resolveCognitiveAvailabilityAttestation(document, topology) {
  validateCognitiveAvailabilityAttestation(document);
  validateCognitiveTopology(topology);

  if (document.topology_id !== topology.topology_id) {
    throw new ValidationError('Cognitive availability attestation topology_id does not match Cognitive Topology');
  }
  const topologyDigest = cognitiveTopologyDigest(topology);
  if (document.topology_digest !== topologyDigest) {
    throw new ValidationError('Cognitive availability attestation topology digest does not match Cognitive Topology');
  }

  const node = topology.nodes.find(candidate => candidate.node_id === document.node_id);
  if (!node) {
    throw new ValidationError(`Cognitive availability attestation node_id ${document.node_id} is not declared in Cognitive Topology`);
  }
  if (document.model_id !== node.model_id) {
    throw new ValidationError('Cognitive availability attestation model_id does not match Cognitive Topology node model');
  }

  const expectedTarget = {
    access_mode: node.access_mode,
    custody: node.custody,
    weight_state: node.weights.state,
    artifact_digest: node.weights.artifact_digest
  };
  for (const field of Object.keys(expectedTarget)) {
    if (document.declared_target[field] !== expectedTarget[field]) {
      throw new ValidationError(`Cognitive availability attestation declared_target.${field} does not match Cognitive Topology`);
    }
  }

  const ownerAddressable = OWNER_ADDRESSABLE_WEIGHT_STATES.has(node.weights.state);
  const artifactMatch = ownerAddressable && document.observation.availability === 'available'
    ? document.observation.observed_artifact_digest === node.weights.artifact_digest
    : null;

  return Object.freeze({
    valid: true,
    schema: COGNITIVE_AVAILABILITY_ATTESTATION_SCHEMA,
    attestation_id: document.attestation_id,
    topology_id: document.topology_id,
    topology_digest: document.topology_digest,
    node_id: document.node_id,
    model_id: document.model_id,
    availability: document.observation.availability,
    observation_mode: document.observation.observation_mode,
    evidence_class: document.observation.evidence_class,
    observed_artifact_digest: document.observation.observed_artifact_digest,
    artifact_match: artifactMatch,
    observer_ref: document.observer_ref,
    evidence_ref: document.evidence.evidence_ref,
    evidence_digest: document.evidence.evidence_digest,
    observed_at: document.observed_at,
    valid_until: document.valid_until,
    recorded_at: document.recorded_at,
    attestation_digest: cognitiveAvailabilityAttestationDigest(document),
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  });
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

function identifier(value, label) {
  if (typeof value !== 'string' || !ID.test(value)) {
    throw new ValidationError(`${label} is invalid`);
  }
  return value;
}

function digest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) {
    throw new ValidationError(`${label} must be a lowercase 64-hex digest`);
  }
  return value;
}

function nullableDigest(value, label) {
  if (value === null) return null;
  return digest(value, label);
}

function timestamp(value, label) {
  if (typeof value !== 'string') {
    throw new ValidationError(`${label} must be a canonical ISO timestamp`);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new ValidationError(`${label} must be a canonical ISO timestamp`);
  }
  return parsed.getTime();
}
