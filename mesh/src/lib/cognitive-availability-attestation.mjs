import { digestObject, ValidationError } from './canonical.mjs';
import {
  cognitiveTopologyDigest,
  validateCognitiveTopology
} from './cognitive-topology.mjs';

export const COGNITIVE_AVAILABILITY_ATTESTATION_SCHEMA =
  'axiom-cognitive-availability-attestation.v0';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const AVAILABILITY = new Set(['available', 'unavailable', 'indeterminate']);
const METHODS = new Set([
  'local-artifact',
  'local-runtime',
  'provider-api',
  'remote-runtime',
  'provider-statement',
  'synthetic-probe'
]);
const ASSURANCE_CLASSES = new Set([
  'declared',
  'signed',
  'verified-local',
  'corroborated'
]);
const OBSERVER_KINDS = new Set([
  'local-agent',
  'local-service',
  'remote-service',
  'provider',
  'external-verifier'
]);
const EVIDENCE_KINDS = new Set([
  'local-observation',
  'runtime-probe-result',
  'provider-statement',
  'signed-provider-statement',
  'external-observation',
  'artifact-verification'
]);
const OWNER_ADDRESSABLE_WEIGHT_STATES = new Set(['open-acquired', 'local-proprietary']);
const OWNER_CUSTODY = new Set(['owner-local', 'owner-remote']);

export function validateCognitiveAvailabilityAttestation(document) {
  validateAttestationShape(document);
  return Object.freeze({
    valid: true,
    schema: document.schema,
    version: document.version,
    status: document.status,
    attestation_id: document.attestation_id,
    topology_id: document.topology_id,
    topology_digest: document.topology_digest,
    node_id: document.node_id,
    model_id: document.model_id,
    availability: document.observation.availability,
    assurance_class: document.observation.assurance_class,
    attestation_digest: digestObject(document),
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  });
}

export function cognitiveAvailabilityAttestationDigest(document) {
  validateAttestationShape(document);
  return digestObject(document);
}

export function resolveCognitiveAvailabilityAttestation(document, topology) {
  const attestation = validateCognitiveAvailabilityAttestation(document);
  validateCognitiveTopology(topology);

  if (document.topology_id !== topology.topology_id) {
    throw new ValidationError(
      'Cognitive availability attestation topology_id does not match the bound Cognitive Topology'
    );
  }

  const expectedTopologyDigest = cognitiveTopologyDigest(topology);
  if (document.topology_digest !== expectedTopologyDigest) {
    throw new ValidationError(
      'Cognitive availability attestation topology digest does not match the bound Cognitive Topology'
    );
  }

  const node = topology.nodes.find(candidate => candidate.node_id === document.node_id);
  if (!node) {
    throw new ValidationError(
      `Cognitive availability attestation node_id ${document.node_id} is not declared in the bound Cognitive Topology`
    );
  }
  if (node.model_id !== document.model_id) {
    throw new ValidationError(
      'Cognitive availability attestation model_id does not match the bound Cognitive Topology node'
    );
  }

  validateMethodCompatibility(document.observation.method, node);
  validateArtifactObservation(document.observation, node);

  return deepFreeze({
    valid: true,
    schema: COGNITIVE_AVAILABILITY_ATTESTATION_SCHEMA,
    attestation_id: document.attestation_id,
    topology_id: document.topology_id,
    topology_digest: document.topology_digest,
    node_id: document.node_id,
    model_id: document.model_id,
    availability: document.observation.availability,
    method: document.observation.method,
    assurance_class: document.observation.assurance_class,
    observed_artifact_digest: document.observation.observed_artifact_digest,
    observed_runtime_ref: document.observation.observed_runtime_ref,
    observer_kind: document.observer.observer_kind,
    observer_ref: document.observer.observer_ref,
    observer_principal_ref: document.observer.observer_principal_ref,
    evidence_kind: document.evidence.evidence_kind,
    evidence_ref: document.evidence.evidence_ref,
    evidence_digest: document.evidence.evidence_digest,
    observed_at: document.observed_at,
    valid_until: document.valid_until,
    recorded_at: document.recorded_at,
    attestation_digest: attestation.attestation_digest,
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  });
}

function validateAttestationShape(document) {
  exactObject(document, 'Cognitive availability attestation', [
    'schema',
    'version',
    'status',
    'attestation_id',
    'topology_id',
    'topology_digest',
    'node_id',
    'model_id',
    'observation',
    'observer',
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
    document.schema !== COGNITIVE_AVAILABILITY_ATTESTATION_SCHEMA
    || document.version !== 0
    || document.status !== 'inert-evidence'
  ) {
    throw new ValidationError(
      'Cognitive availability attestation schema/version/status is invalid'
    );
  }

  id(document.attestation_id, 'attestation_id');
  id(document.topology_id, 'topology_id');
  digest(document.topology_digest, 'topology_digest');
  id(document.node_id, 'node_id');
  id(document.model_id, 'model_id');
  validateObservation(document.observation);
  validateObserver(document.observer);
  validateEvidence(document.evidence, document.observation.assurance_class);

  const observedAt = date(document.observed_at, 'observed_at');
  const validUntil = date(document.valid_until, 'valid_until');
  const recordedAt = date(document.recorded_at, 'recorded_at');
  if (validUntil < observedAt) {
    throw new ValidationError('valid_until cannot precede observed_at');
  }
  if (recordedAt < observedAt) {
    throw new ValidationError('recorded_at cannot precede observed_at');
  }

  if (
    document.contains_secret_material !== false
    || document.authority_effect !== 'none'
    || document.network_effect !== 'none'
    || document.runtime_activation !== false
  ) {
    throw new ValidationError('Cognitive availability attestation activation boundary is invalid');
  }

  return document;
}

function validateObservation(value) {
  exactObject(value, 'Cognitive availability observation', [
    'availability',
    'method',
    'observed_artifact_digest',
    'observed_runtime_ref',
    'assurance_class'
  ]);
  enumValue(value.availability, 'observation.availability', AVAILABILITY);
  enumValue(value.method, 'observation.method', METHODS);
  nullableDigest(value.observed_artifact_digest, 'observation.observed_artifact_digest');
  nullableId(value.observed_runtime_ref, 'observation.observed_runtime_ref');
  enumValue(value.assurance_class, 'observation.assurance_class', ASSURANCE_CLASSES);

  if (value.availability !== 'available' && value.observed_artifact_digest !== null) {
    throw new ValidationError(
      'observation.observed_artifact_digest must be null when availability is not available'
    );
  }
}

function validateObserver(value) {
  exactObject(value, 'Cognitive availability observer', [
    'observer_kind',
    'observer_ref',
    'observer_principal_ref'
  ]);
  enumValue(value.observer_kind, 'observer.observer_kind', OBSERVER_KINDS);
  id(value.observer_ref, 'observer.observer_ref');
  nullableId(value.observer_principal_ref, 'observer.observer_principal_ref');
}

function validateEvidence(value, assuranceClass) {
  exactObject(value, 'Cognitive availability evidence', [
    'evidence_kind',
    'evidence_ref',
    'evidence_digest',
    'verification_ref',
    'verification_digest'
  ]);
  enumValue(value.evidence_kind, 'evidence.evidence_kind', EVIDENCE_KINDS);
  id(value.evidence_ref, 'evidence.evidence_ref');
  digest(value.evidence_digest, 'evidence.evidence_digest');
  nullableId(value.verification_ref, 'evidence.verification_ref');
  nullableDigest(value.verification_digest, 'evidence.verification_digest');

  if (assuranceClass === 'declared') {
    if (value.verification_ref !== null || value.verification_digest !== null) {
      throw new ValidationError(
        'declared assurance cannot claim verification evidence'
      );
    }
    return;
  }

  if (value.verification_ref === null || value.verification_digest === null) {
    throw new ValidationError(
      `${assuranceClass} assurance requires verification_ref and verification_digest`
    );
  }
}

function validateMethodCompatibility(method, node) {
  if (method === 'local-artifact') {
    if (
      !OWNER_ADDRESSABLE_WEIGHT_STATES.has(node.weights.state)
      || node.custody === 'provider-controlled'
    ) {
      throw new ValidationError(
        'local-artifact observation is incompatible with the bound Cognitive Topology node'
      );
    }
    return;
  }

  if (method === 'local-runtime') {
    if (!new Set(['local-runtime', 'hybrid']).has(node.access_mode)) {
      throw new ValidationError(
        'local-runtime observation is incompatible with the bound Cognitive Topology node'
      );
    }
    return;
  }

  if (method === 'provider-api') {
    if (!new Set(['api', 'hybrid']).has(node.access_mode)) {
      throw new ValidationError(
        'provider-api observation is incompatible with the bound Cognitive Topology node'
      );
    }
    return;
  }

  if (method === 'remote-runtime') {
    if (!new Set(['remote-runtime', 'hybrid']).has(node.access_mode)) {
      throw new ValidationError(
        'remote-runtime observation is incompatible with the bound Cognitive Topology node'
      );
    }
    return;
  }

  if (method === 'provider-statement') {
    if (node.custody !== 'provider-controlled' && node.custody !== 'shared') {
      throw new ValidationError(
        'provider-statement observation is incompatible with the bound Cognitive Topology node'
      );
    }
    return;
  }

  if (method === 'synthetic-probe') {
    if (!new Set(['api', 'local-runtime', 'remote-runtime', 'hybrid']).has(node.access_mode)) {
      throw new ValidationError(
        'synthetic-probe observation is incompatible with the bound Cognitive Topology node'
      );
    }
  }
}

function validateArtifactObservation(observation, node) {
  const ownerAddressableArtifact = OWNER_ADDRESSABLE_WEIGHT_STATES.has(node.weights.state);

  if (observation.method === 'local-artifact' && observation.availability === 'available') {
    if (!ownerAddressableArtifact || observation.observed_artifact_digest === null) {
      throw new ValidationError(
        'available local-artifact observation requires an owner-addressable artifact digest'
      );
    }
    if (observation.observed_artifact_digest !== node.weights.artifact_digest) {
      throw new ValidationError(
        'Cognitive availability observed artifact digest does not match the bound Cognitive Topology node'
      );
    }
    return;
  }

  if (observation.observed_artifact_digest !== null) {
    throw new ValidationError(
      'observed_artifact_digest is only permitted for an available local-artifact observation'
    );
  }
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
    if (!allowed.has(key)) {
      throw new ValidationError(`${label} contains unknown field ${key}`);
    }
  }
  for (const key of allowedFields) {
    if (!Object.hasOwn(value, key)) {
      throw new ValidationError(`${label} is missing required field ${key}`);
    }
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

function nullableDigest(value, label) {
  if (value === null) return null;
  return digest(value, label);
}

function enumValue(value, label, allowed) {
  if (typeof value !== 'string' || !allowed.has(value)) {
    throw new ValidationError(`${label} is invalid`);
  }
  return value;
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
