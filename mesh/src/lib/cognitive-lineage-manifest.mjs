import { digestObject, ValidationError } from './canonical.mjs';
import {
  cognitiveTopologyDigest,
  validateCognitiveTopology
} from './cognitive-topology.mjs';

export const COGNITIVE_LINEAGE_MANIFEST_SCHEMA = 'axiom-cognitive-lineage-manifest.v0';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
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
const PROCEDURE_REQUIRED = new Set([
  'successor',
  'fine-tuned-descendant',
  'distilled-descendant',
  'quantized-derivative',
  'adapter-derived',
  'provider-version-successor'
]);
const ASSURANCE_CLASSES = new Set(['declared', 'verified']);

export function validateCognitiveLineageManifest(document) {
  validateManifestShape(document);
  return Object.freeze({
    valid: true,
    schema: document.schema,
    version: document.version,
    status: document.status,
    lineage_id: document.lineage_id,
    topology_id: document.topology_id,
    topology_digest: document.topology_digest,
    relationship: document.relationship,
    assurance_class: document.evidence.assurance_class,
    manifest_digest: digestObject(document),
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false,
    proves_principal_lineage: false,
    proves_principal_continuity: false,
    proves_subjective_identity: false,
    grants_execution_authority: false
  });
}

export function cognitiveLineageManifestDigest(document) {
  validateManifestShape(document);
  return digestObject(document);
}

export function resolveCognitiveLineageManifest(document, topology) {
  const validated = validateCognitiveLineageManifest(document);
  validateCognitiveTopology(topology);

  if (document.topology_id !== topology.topology_id) {
    throw new ValidationError(
      'Cognitive lineage manifest topology_id does not match the bound Cognitive Topology'
    );
  }
  const expectedTopologyDigest = cognitiveTopologyDigest(topology);
  if (document.topology_digest !== expectedTopologyDigest) {
    throw new ValidationError(
      'Cognitive lineage manifest topology digest does not match the bound Cognitive Topology'
    );
  }

  const referenceNode = resolveDescriptorNode(document.reference, topology, 'reference', true);
  validateDescriptorAgainstNode(document.reference, referenceNode, 'reference');

  if (document.candidate.node_id !== null) {
    const candidateNode = resolveDescriptorNode(document.candidate, topology, 'candidate', true);
    validateDescriptorAgainstNode(document.candidate, candidateNode, 'candidate');
  }

  return deepFreeze({
    valid: true,
    schema: COGNITIVE_LINEAGE_MANIFEST_SCHEMA,
    lineage_id: document.lineage_id,
    topology_id: document.topology_id,
    topology_digest: document.topology_digest,
    reference: { ...document.reference },
    candidate: { ...document.candidate },
    relationship: document.relationship,
    procedure_kind: document.procedure.procedure_kind,
    procedure_ref: document.procedure.procedure_ref,
    procedure_digest: document.procedure.procedure_digest,
    adaptation_authorization_ref: document.procedure.adaptation_authorization_ref,
    assurance_class: document.evidence.assurance_class,
    evidence_ref: document.evidence.evidence_ref,
    evidence_digest: document.evidence.evidence_digest,
    verification_ref: document.evidence.verification_ref,
    verification_digest: document.evidence.verification_digest,
    created_at: document.created_at,
    recorded_at: document.recorded_at,
    manifest_digest: validated.manifest_digest,
    active_candidate: false,
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false,
    proves_principal_lineage: false,
    proves_principal_continuity: false,
    proves_subjective_identity: false,
    grants_execution_authority: false
  });
}

function validateManifestShape(document) {
  exactObject(document, 'Cognitive lineage manifest', [
    'schema',
    'version',
    'status',
    'lineage_id',
    'topology_id',
    'topology_digest',
    'reference',
    'candidate',
    'relationship',
    'procedure',
    'evidence',
    'created_at',
    'recorded_at',
    'contains_secret_material',
    'authority_effect',
    'network_effect',
    'runtime_activation'
  ]);

  if (
    document.schema !== COGNITIVE_LINEAGE_MANIFEST_SCHEMA
    || document.version !== 0
    || document.status !== 'inert-evidence'
  ) {
    throw new ValidationError('Cognitive lineage manifest schema/version/status is invalid');
  }

  id(document.lineage_id, 'lineage_id');
  id(document.topology_id, 'topology_id');
  digest(document.topology_digest, 'topology_digest');
  validateDescriptor(document.reference, 'reference', { requireNode: true });
  validateDescriptor(document.candidate, 'candidate', { requireNode: false });
  enumValue(document.relationship, 'relationship', RELATIONSHIPS);
  validateProcedure(document.procedure, document.relationship);
  validateEvidence(document.evidence);

  const createdAt = date(document.created_at, 'created_at');
  const recordedAt = date(document.recorded_at, 'recorded_at');
  if (recordedAt < createdAt) {
    throw new ValidationError('recorded_at cannot precede created_at');
  }

  if (
    document.contains_secret_material !== false
    || document.authority_effect !== 'none'
    || document.network_effect !== 'none'
    || document.runtime_activation !== false
  ) {
    throw new ValidationError('Cognitive lineage manifest activation boundary is invalid');
  }

  return document;
}

function validateDescriptor(value, label, { requireNode }) {
  exactObject(value, `Cognitive lineage ${label}`, [
    'node_id',
    'model_id',
    'artifact_ref',
    'artifact_digest',
    'provider_version_ref'
  ]);

  if (requireNode) id(value.node_id, `${label}.node_id`);
  else nullableId(value.node_id, `${label}.node_id`);
  id(value.model_id, `${label}.model_id`);
  nullableId(value.artifact_ref, `${label}.artifact_ref`);
  nullableDigest(value.artifact_digest, `${label}.artifact_digest`);
  nullableId(value.provider_version_ref, `${label}.provider_version_ref`);

  if ((value.artifact_ref === null) !== (value.artifact_digest === null)) {
    throw new ValidationError(
      `${label}.artifact_ref and ${label}.artifact_digest must both be null or both be present`
    );
  }
}

function validateProcedure(value, relationship) {
  exactObject(value, 'Cognitive lineage procedure', [
    'procedure_kind',
    'procedure_ref',
    'procedure_digest',
    'adaptation_authorization_ref'
  ]);
  id(value.procedure_kind, 'procedure.procedure_kind');
  nullableId(value.procedure_ref, 'procedure.procedure_ref');
  nullableDigest(value.procedure_digest, 'procedure.procedure_digest');
  nullableId(value.adaptation_authorization_ref, 'procedure.adaptation_authorization_ref');

  if ((value.procedure_ref === null) !== (value.procedure_digest === null)) {
    throw new ValidationError(
      'procedure.procedure_ref and procedure.procedure_digest must both be null or both be present'
    );
  }
  if (PROCEDURE_REQUIRED.has(relationship) && value.procedure_ref === null) {
    throw new ValidationError(`${relationship} requires procedure_ref and procedure_digest`);
  }
}

function validateEvidence(value) {
  exactObject(value, 'Cognitive lineage evidence', [
    'assurance_class',
    'evidence_ref',
    'evidence_digest',
    'verification_ref',
    'verification_digest'
  ]);
  enumValue(value.assurance_class, 'evidence.assurance_class', ASSURANCE_CLASSES);
  id(value.evidence_ref, 'evidence.evidence_ref');
  digest(value.evidence_digest, 'evidence.evidence_digest');
  nullableId(value.verification_ref, 'evidence.verification_ref');
  nullableDigest(value.verification_digest, 'evidence.verification_digest');

  if (value.assurance_class === 'declared') {
    if (value.verification_ref !== null || value.verification_digest !== null) {
      throw new ValidationError('declared lineage assurance cannot claim verification evidence');
    }
  } else if (value.verification_ref === null || value.verification_digest === null) {
    throw new ValidationError('verified lineage assurance requires verification_ref and verification_digest');
  }
}

function resolveDescriptorNode(descriptor, topology, label, required) {
  if (descriptor.node_id === null) {
    if (required) throw new ValidationError(`${label}.node_id must identify a topology node`);
    return null;
  }
  const node = topology.nodes.find(candidate => candidate.node_id === descriptor.node_id);
  if (!node) {
    throw new ValidationError(
      `Cognitive lineage ${label}.node_id ${descriptor.node_id} is not declared in the bound Cognitive Topology`
    );
  }
  if (node.model_id !== descriptor.model_id) {
    throw new ValidationError(
      `Cognitive lineage ${label}.model_id does not match the bound Cognitive Topology node`
    );
  }
  return node;
}

function validateDescriptorAgainstNode(descriptor, node, label) {
  if (!node) return;
  const topologyDigest = node.weights.artifact_digest;
  if (topologyDigest === null) {
    if (descriptor.artifact_digest !== null) {
      throw new ValidationError(
        `Cognitive lineage ${label} cannot claim an artifact digest when the bound topology node has none`
      );
    }
    return;
  }
  if (descriptor.artifact_digest === null) {
    throw new ValidationError(
      `Cognitive lineage ${label} must identify the artifact digest declared by the bound topology node`
    );
  }
  if (descriptor.artifact_digest !== topologyDigest) {
    throw new ValidationError(
      `Cognitive lineage ${label} artifact digest does not match the bound Cognitive Topology node`
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

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
