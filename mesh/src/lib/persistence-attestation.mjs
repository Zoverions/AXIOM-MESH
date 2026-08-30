import { digestObject, ValidationError } from './canonical.mjs';
import {
  cognitiveTopologyDigest,
  validateCognitiveTopology
} from './cognitive-topology.mjs';

export const PERSISTENCE_ATTESTATION_SCHEMA = 'axiom-persistence-attestation.v0';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const PERSISTENCE_MODES = new Set(['none', 'local', 'provider-bound', 'mirrored']);
const EXPORTABILITY = new Set(['none', 'partial', 'full', 'unknown']);
const AVAILABILITY = new Set(['available', 'unavailable', 'unknown']);
const EVIDENCE_KINDS = new Set([
  'local-observation',
  'provider-statement',
  'signed-provider-statement',
  'export-test'
]);

export function validatePersistenceAttestation(document) {
  validateAttestationShape(document);
  return Object.freeze({
    valid: true,
    schema: document.schema,
    attestation_id: document.attestation_id,
    topology_id: document.topology_id,
    topology_digest: document.topology_digest,
    node_id: document.node_id,
    model_id: document.model_id,
    persistence_mode: document.declared_persistence.mode,
    provider_id: document.declared_persistence.provider_id,
    state_ref: document.declared_persistence.state_ref,
    declared_exportability: document.declared_persistence.exportability,
    availability: document.observation.availability,
    observed_exportability: document.observation.observed_exportability,
    evidence_kind: document.evidence.evidence_kind,
    attestation_digest: digestObject(document),
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  });
}

export function persistenceAttestationDigest(document) {
  validateAttestationShape(document);
  return digestObject(document);
}

export function resolvePersistenceAttestation(document, topology) {
  const attestation = validatePersistenceAttestation(document);
  validateCognitiveTopology(topology);

  if (document.topology_id !== topology.topology_id) {
    throw new ValidationError('Persistence attestation topology_id does not match the bound Cognitive Topology');
  }

  const expectedTopologyDigest = cognitiveTopologyDigest(topology);
  if (document.topology_digest !== expectedTopologyDigest) {
    throw new ValidationError('Persistence attestation topology digest does not match the bound Cognitive Topology');
  }

  const node = topology.nodes.find(candidate => candidate.node_id === document.node_id);
  if (!node) {
    throw new ValidationError(`Persistence attestation node_id ${document.node_id} is not declared in the bound Cognitive Topology`);
  }
  if (node.model_id !== document.model_id) {
    throw new ValidationError('Persistence attestation model_id does not match the bound Cognitive Topology node');
  }

  const declared = document.declared_persistence;
  const expected = node.persistence;
  for (const field of ['mode', 'provider_id', 'state_ref', 'exportability']) {
    if (declared[field] !== expected[field]) {
      throw new ValidationError(`Persistence attestation declared persistence ${field} does not match the bound Cognitive Topology node`);
    }
  }

  return Object.freeze({
    valid: true,
    schema: PERSISTENCE_ATTESTATION_SCHEMA,
    attestation_id: document.attestation_id,
    topology_id: document.topology_id,
    topology_digest: document.topology_digest,
    node_id: document.node_id,
    model_id: document.model_id,
    persistence_mode: declared.mode,
    provider_id: declared.provider_id,
    state_ref: declared.state_ref,
    declared_exportability: declared.exportability,
    availability: document.observation.availability,
    observed_exportability: document.observation.observed_exportability,
    evidence_kind: document.evidence.evidence_kind,
    attestation_digest: attestation.attestation_digest,
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  });
}

function validateAttestationShape(document) {
  exactObject(document, 'Persistence attestation', [
    'schema',
    'version',
    'status',
    'attestation_id',
    'topology_id',
    'topology_digest',
    'node_id',
    'model_id',
    'declared_persistence',
    'observation',
    'evidence',
    'observed_at',
    'recorded_at',
    'contains_secret_material',
    'authority_effect',
    'network_effect',
    'runtime_activation'
  ]);

  if (
    document.schema !== PERSISTENCE_ATTESTATION_SCHEMA
    || document.version !== 0
    || document.status !== 'inert-evidence'
  ) throw new ValidationError('Persistence attestation schema/version/status is invalid');

  id(document.attestation_id, 'attestation_id');
  id(document.topology_id, 'topology_id');
  digest(document.topology_digest, 'topology_digest');
  id(document.node_id, 'node_id');
  id(document.model_id, 'model_id');
  validateDeclaredPersistence(document.declared_persistence);
  validateObservation(document.observation);
  validateEvidence(document.evidence);

  const observedAt = date(document.observed_at, 'observed_at');
  const recordedAt = date(document.recorded_at, 'recorded_at');
  if (recordedAt < observedAt) {
    throw new ValidationError('recorded_at cannot precede observed_at');
  }

  if (
    document.contains_secret_material !== false
    || document.authority_effect !== 'none'
    || document.network_effect !== 'none'
    || document.runtime_activation !== false
  ) throw new ValidationError('Persistence attestation activation boundary is invalid');

  return document;
}

function validateDeclaredPersistence(value) {
  exactObject(value, 'Persistence attestation declared_persistence', [
    'mode',
    'provider_id',
    'state_ref',
    'exportability'
  ]);
  enumValue(value.mode, 'declared_persistence.mode', PERSISTENCE_MODES);
  nullableId(value.provider_id, 'declared_persistence.provider_id');
  nullableId(value.state_ref, 'declared_persistence.state_ref');
  enumValue(value.exportability, 'declared_persistence.exportability', EXPORTABILITY);

  if (value.mode === 'provider-bound' || value.mode === 'mirrored') {
    if (value.provider_id === null || value.state_ref === null) {
      throw new ValidationError('provider-bound and mirrored declared persistence require provider_id and state_ref');
    }
  } else if (value.provider_id !== null) {
    throw new ValidationError('none and local declared persistence cannot claim a provider_id');
  }

  if (value.mode === 'none' && value.state_ref !== null) {
    throw new ValidationError('none declared persistence cannot claim a state_ref');
  }
}

function validateObservation(value) {
  exactObject(value, 'Persistence attestation observation', [
    'availability',
    'observed_exportability',
    'snapshot_ref',
    'snapshot_digest'
  ]);
  enumValue(value.availability, 'observation.availability', AVAILABILITY);
  enumValue(value.observed_exportability, 'observation.observed_exportability', EXPORTABILITY);
  nullableId(value.snapshot_ref, 'observation.snapshot_ref');
  nullableDigest(value.snapshot_digest, 'observation.snapshot_digest');

  const hasRef = value.snapshot_ref !== null;
  const hasDigest = value.snapshot_digest !== null;
  if (value.availability === 'available') {
    if (hasRef !== hasDigest) {
      throw new ValidationError('available persistence observation snapshot_ref and snapshot_digest must be both null or both present');
    }
  } else if (hasRef || hasDigest) {
    throw new ValidationError('unavailable and unknown persistence observations cannot claim snapshot fields');
  }
}

function validateEvidence(value) {
  exactObject(value, 'Persistence attestation evidence', [
    'evidence_kind',
    'evidence_ref',
    'evidence_digest'
  ]);
  enumValue(value.evidence_kind, 'evidence.evidence_kind', EVIDENCE_KINDS);
  id(value.evidence_ref, 'evidence.evidence_ref');
  digest(value.evidence_digest, 'evidence.evidence_digest');
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
