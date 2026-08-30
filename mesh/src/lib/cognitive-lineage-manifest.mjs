import { digestObject, ValidationError } from './canonical.mjs';
import {
  cognitiveTopologyDigest,
  validateCognitiveTopology
} from './cognitive-topology.mjs';

export const COGNITIVE_LINEAGE_MANIFEST_SCHEMA = 'axiom-cognitive-lineage-manifest.v0';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const RELATIONSHIPS = new Set([
  'successor',
  'replacement',
  'fine-tuned-descendant',
  'distilled-descendant',
  'quantized-derivative',
  'adapter-derived',
  'provider-version-successor',
  'functionally-unrelated'
]);
const OWNER_ADDRESSABLE_WEIGHT_STATES = new Set(['open-acquired', 'local-proprietary']);

export function validateCognitiveLineageManifest(document) {
  exactObject(document, 'Cognitive lineage manifest', [
    'schema',
    'version',
    'status',
    'lineage_id',
    'topology_id',
    'topology_digest',
    'source',
    'destination',
    'relationship',
    'evidence',
    'recorded_at',
    'contains_secret_material',
    'authority_effect',
    'network_effect',
    'runtime_activation'
  ]);

  if (
    document.schema !== COGNITIVE_LINEAGE_MANIFEST_SCHEMA ||
    document.version !== 0 ||
    document.status !== 'inert-evidence'
  ) {
    throw new ValidationError('Cognitive lineage manifest schema/version/status is invalid');
  }

  identifier(document.lineage_id, 'lineage_id');
  identifier(document.topology_id, 'topology_id');
  digest(document.topology_digest, 'topology_digest');
  endpoint(document.source, 'source');
  endpoint(document.destination, 'destination');

  if (!RELATIONSHIPS.has(document.relationship)) {
    throw new ValidationError('relationship is invalid');
  }

  exactObject(document.evidence, 'evidence', ['evidence_ref', 'evidence_digest']);
  identifier(document.evidence.evidence_ref, 'evidence.evidence_ref');
  digest(document.evidence.evidence_digest, 'evidence.evidence_digest');
  timestamp(document.recorded_at, 'recorded_at');

  if (
    document.contains_secret_material !== false ||
    document.authority_effect !== 'none' ||
    document.network_effect !== 'none' ||
    document.runtime_activation !== false
  ) {
    throw new ValidationError('Cognitive lineage manifest activation boundary must remain zero-effect');
  }

  return Object.freeze({
    valid: true,
    schema: COGNITIVE_LINEAGE_MANIFEST_SCHEMA,
    lineage_id: document.lineage_id,
    topology_id: document.topology_id,
    source_node_id: document.source.node_id,
    destination_node_id: document.destination.node_id,
    relationship: document.relationship,
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  });
}

export function cognitiveLineageManifestDigest(document) {
  validateCognitiveLineageManifest(document);
  return digestObject(document);
}

export function resolveCognitiveLineageManifest(document, topology) {
  validateCognitiveLineageManifest(document);
  validateCognitiveTopology(topology);

  if (document.topology_id !== topology.topology_id) {
    throw new ValidationError('Cognitive lineage manifest topology_id does not match Cognitive Topology');
  }
  const topologyDigest = cognitiveTopologyDigest(topology);
  if (document.topology_digest !== topologyDigest) {
    throw new ValidationError('Cognitive lineage manifest topology digest does not match Cognitive Topology');
  }
  if (document.source.node_id === document.destination.node_id) {
    throw new ValidationError('Cognitive lineage source and destination must be different topology nodes');
  }

  const sourceNode = resolveEndpoint(document.source, topology, 'source');
  const destinationNode = resolveEndpoint(document.destination, topology, 'destination');

  const source = Object.freeze({
    node_id: document.source.node_id,
    model_id: document.source.model_id,
    artifact_digest: document.source.artifact_digest,
    weight_state: sourceNode.weights.state,
    custody: sourceNode.custody
  });
  const destination = Object.freeze({
    node_id: document.destination.node_id,
    model_id: document.destination.model_id,
    artifact_digest: document.destination.artifact_digest,
    weight_state: destinationNode.weights.state,
    custody: destinationNode.custody
  });

  return Object.freeze({
    valid: true,
    schema: COGNITIVE_LINEAGE_MANIFEST_SCHEMA,
    lineage_id: document.lineage_id,
    topology_id: document.topology_id,
    topology_digest: document.topology_digest,
    source,
    destination,
    relationship: document.relationship,
    evidence_ref: document.evidence.evidence_ref,
    evidence_digest: document.evidence.evidence_digest,
    recorded_at: document.recorded_at,
    lineage_digest: cognitiveLineageManifestDigest(document),
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false,
    proves_principal_lineage: false,
    proves_principal_continuity: false,
    proves_subjective_identity: false
  });
}

function resolveEndpoint(value, topology, label) {
  const node = topology.nodes.find(candidate => candidate.node_id === value.node_id);
  if (!node) {
    throw new ValidationError(`Cognitive lineage ${label} node_id ${value.node_id} is not declared in Cognitive Topology`);
  }
  if (value.model_id !== node.model_id) {
    throw new ValidationError(`Cognitive lineage ${label} model_id does not match Cognitive Topology node model`);
  }

  if (OWNER_ADDRESSABLE_WEIGHT_STATES.has(node.weights.state)) {
    if (value.artifact_digest !== node.weights.artifact_digest) {
      throw new ValidationError(`Cognitive lineage ${label} artifact_digest does not match Cognitive Topology node artifact`);
    }
  } else if (value.artifact_digest !== null) {
    throw new ValidationError(`Cognitive lineage ${label} artifact_digest must be null for a non-owner-addressable topology node`);
  }

  return node;
}

function endpoint(value, label) {
  exactObject(value, label, ['node_id', 'model_id', 'artifact_digest']);
  identifier(value.node_id, `${label}.node_id`);
  identifier(value.model_id, `${label}.model_id`);
  nullableDigest(value.artifact_digest, `${label}.artifact_digest`);
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
