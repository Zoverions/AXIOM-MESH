import { digestObject, ValidationError } from './canonical.mjs';
import {
  cognitiveTopologyDigest,
  validateCognitiveTopology
} from './cognitive-topology.mjs';

export const MODEL_ACQUISITION_MANIFEST_SCHEMA = 'axiom-model-acquisition-manifest.v0';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const SOURCE_KINDS = new Set([
  'upstream-release',
  'owner-build',
  'authorized-transfer',
  'recovery-copy'
]);
const CUSTODY_MODES = new Set(['owner-local', 'owner-remote', 'shared']);
const ACQUIRED_WEIGHT_STATES = new Set(['open-acquired', 'local-proprietary']);

export function validateModelAcquisitionManifest(document) {
  validateManifestShape(document);
  return Object.freeze({
    valid: true,
    schema: document.schema,
    acquisition_id: document.acquisition_id,
    topology_id: document.topology_id,
    topology_digest: document.topology_digest,
    node_id: document.node_id,
    model_id: document.model_id,
    artifact_digest: document.artifact.artifact_digest,
    custody_mode: document.custody.mode,
    acquisition_digest: digestObject(document),
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  });
}

export function modelAcquisitionManifestDigest(document) {
  validateManifestShape(document);
  return digestObject(document);
}

export function resolveModelAcquisitionManifest(document, topology) {
  const manifest = validateModelAcquisitionManifest(document);
  validateCognitiveTopology(topology);

  if (document.topology_id !== topology.topology_id) {
    throw new ValidationError('Model acquisition manifest topology_id does not match the bound Cognitive Topology');
  }

  const expectedTopologyDigest = cognitiveTopologyDigest(topology);
  if (document.topology_digest !== expectedTopologyDigest) {
    throw new ValidationError('Model acquisition manifest topology digest does not match the bound Cognitive Topology');
  }

  const node = topology.nodes.find(candidate => candidate.node_id === document.node_id);
  if (!node) {
    throw new ValidationError(`Model acquisition manifest node_id ${document.node_id} is not declared in the bound Cognitive Topology`);
  }
  if (node.model_id !== document.model_id) {
    throw new ValidationError('Model acquisition manifest model_id does not match the bound Cognitive Topology node');
  }

  if (!ACQUIRED_WEIGHT_STATES.has(node.weights.state)) {
    throw new ValidationError('Model acquisition manifest requires Cognitive Topology weight state open-acquired or local-proprietary');
  }
  if (document.artifact.artifact_digest !== node.weights.artifact_digest) {
    throw new ValidationError('Model acquisition manifest artifact digest does not match the bound Cognitive Topology node');
  }
  if (node.weights.licence_ref !== null && document.artifact.licence_ref !== node.weights.licence_ref) {
    throw new ValidationError('Model acquisition manifest licence_ref does not match the bound Cognitive Topology node');
  }

  if (node.custody === 'provider-controlled') {
    throw new ValidationError('Model acquisition manifest cannot attest provider-controlled custody');
  }
  if (document.custody.mode !== node.custody) {
    throw new ValidationError('Model acquisition manifest custody mode does not match the bound Cognitive Topology node');
  }

  return Object.freeze({
    valid: true,
    schema: MODEL_ACQUISITION_MANIFEST_SCHEMA,
    acquisition_id: document.acquisition_id,
    topology_id: document.topology_id,
    topology_digest: document.topology_digest,
    node_id: document.node_id,
    model_id: document.model_id,
    artifact_digest: document.artifact.artifact_digest,
    custody_mode: document.custody.mode,
    acquisition_digest: manifest.acquisition_digest,
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  });
}

function validateManifestShape(document) {
  exactObject(document, 'Model acquisition manifest', [
    'schema',
    'version',
    'status',
    'acquisition_id',
    'topology_id',
    'topology_digest',
    'node_id',
    'model_id',
    'artifact',
    'source',
    'custody',
    'acquired_at',
    'recorded_at',
    'contains_secret_material',
    'authority_effect',
    'network_effect',
    'runtime_activation'
  ]);

  if (
    document.schema !== MODEL_ACQUISITION_MANIFEST_SCHEMA
    || document.version !== 0
    || document.status !== 'inert-evidence'
  ) throw new ValidationError('Model acquisition manifest schema/version/status is invalid');

  id(document.acquisition_id, 'acquisition_id');
  id(document.topology_id, 'topology_id');
  digest(document.topology_digest, 'topology_digest');
  id(document.node_id, 'node_id');
  id(document.model_id, 'model_id');
  validateArtifact(document.artifact);
  validateSource(document.source);
  validateCustody(document.custody);

  const acquiredAt = date(document.acquired_at, 'acquired_at');
  const recordedAt = date(document.recorded_at, 'recorded_at');
  if (recordedAt < acquiredAt) {
    throw new ValidationError('recorded_at cannot precede acquired_at');
  }

  if (
    document.contains_secret_material !== false
    || document.authority_effect !== 'none'
    || document.network_effect !== 'none'
    || document.runtime_activation !== false
  ) throw new ValidationError('Model acquisition manifest activation boundary is invalid');

  return document;
}

function validateArtifact(value) {
  exactObject(value, 'Model acquisition artifact', [
    'artifact_ref',
    'artifact_digest',
    'licence_ref',
    'format_ref'
  ]);
  id(value.artifact_ref, 'artifact.artifact_ref');
  digest(value.artifact_digest, 'artifact.artifact_digest');
  id(value.licence_ref, 'artifact.licence_ref');
  id(value.format_ref, 'artifact.format_ref');
}

function validateSource(value) {
  exactObject(value, 'Model acquisition source', [
    'source_kind',
    'source_ref',
    'source_evidence_ref',
    'source_evidence_digest'
  ]);
  enumValue(value.source_kind, 'source.source_kind', SOURCE_KINDS);
  id(value.source_ref, 'source.source_ref');
  id(value.source_evidence_ref, 'source.source_evidence_ref');
  digest(value.source_evidence_digest, 'source.source_evidence_digest');
}

function validateCustody(value) {
  exactObject(value, 'Model acquisition custody', [
    'mode',
    'location_ref',
    'verification_ref',
    'verification_digest'
  ]);
  enumValue(value.mode, 'custody.mode', CUSTODY_MODES);
  id(value.location_ref, 'custody.location_ref');
  id(value.verification_ref, 'custody.verification_ref');
  digest(value.verification_digest, 'custody.verification_digest');
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

function digest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) {
    throw new ValidationError(`${label} is invalid`);
  }
  return value;
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
