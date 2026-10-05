import { digestObject, ValidationError } from './canonical.mjs';
import {
  agentCompositionDigest,
  validateAgentComposition
} from './agent-composition.mjs';

export const COGNITIVE_TOPOLOGY_SCHEMA = 'axiom-cognitive-topology.v0';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const ENGAGEMENTS = new Set(['ephemeral', 'session', 'persistent', 'primary']);
const TOPOLOGY_ROLES = new Set([
  'augmentation',
  'primary-embodiment',
  'identity-kernel',
  'router',
  'evaluator'
]);
const ACCESS_MODES = new Set(['api', 'local-runtime', 'remote-runtime', 'hybrid']);
const CUSTODY = new Set(['provider-controlled', 'owner-local', 'owner-remote', 'shared']);
const WEIGHT_STATES = new Set([
  'closed',
  'open-remote',
  'open-acquired',
  'local-proprietary',
  'not-applicable'
]);
const PERSISTENCE_MODES = new Set(['none', 'local', 'provider-bound', 'mirrored']);
const EXPORTABILITY = new Set(['none', 'partial', 'full', 'unknown']);
const IMPORTANCE = new Set(['optional', 'important', 'critical']);

export function validateCognitiveTopology(document) {
  validateCognitiveTopologyShape(document);
  return Object.freeze({
    valid: true,
    schema: document.schema,
    topology_id: document.topology_id,
    composition_id: document.composition_id,
    composition_digest: document.composition_digest,
    topology_digest: digestObject(document),
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  });
}

export function cognitiveTopologyDigest(document) {
  validateCognitiveTopologyShape(document);
  return digestObject(document);
}

export function resolveCognitiveTopology(document, composition) {
  const topology = validateCognitiveTopology(document);
  validateAgentComposition(composition);

  if (document.composition_id !== composition.composition_id) {
    throw new ValidationError('Cognitive topology composition_id does not match the bound Agent Composition');
  }

  const expectedDigest = agentCompositionDigest(composition);
  if (document.composition_digest !== expectedDigest) {
    throw new ValidationError('Cognitive topology composition digest does not match the bound Agent Composition');
  }

  const compositionModels = new Set(composition.models.map(model => model.model_id));
  const engagements = {
    ephemeral: 0,
    session: 0,
    persistent: 0,
    primary: 0
  };
  let providerBoundPersistence = 0;
  let ownerControlledCustody = 0;
  let identityKernels = 0;
  let primaryEmbodiments = 0;
  let criticalContinuityDependencies = 0;
  let criticalFidelityDependencies = 0;

  for (const node of document.nodes) {
    if (!compositionModels.has(node.model_id)) {
      throw new ValidationError(`Cognitive topology model_id ${node.model_id} is not declared in the bound Agent Composition`);
    }
    engagements[node.engagement] += 1;
    if (node.persistence.mode === 'provider-bound') providerBoundPersistence += 1;
    if (node.custody === 'owner-local' || node.custody === 'owner-remote') ownerControlledCustody += 1;
    if (node.topology_role === 'identity-kernel') identityKernels += 1;
    if (node.topology_role === 'primary-embodiment') primaryEmbodiments += 1;
    if (node.continuity_importance === 'critical') criticalContinuityDependencies += 1;
    if (node.fidelity_importance === 'critical') criticalFidelityDependencies += 1;
  }

  return Object.freeze({
    valid: true,
    schema: COGNITIVE_TOPOLOGY_SCHEMA,
    topology_id: document.topology_id,
    composition_id: document.composition_id,
    composition_digest: document.composition_digest,
    topology_digest: topology.topology_digest,
    models: document.nodes.length,
    engagements: Object.freeze(engagements),
    provider_bound_persistence: providerBoundPersistence,
    owner_controlled_custody: ownerControlledCustody,
    identity_kernels: identityKernels,
    primary_embodiments: primaryEmbodiments,
    critical_continuity_dependencies: criticalContinuityDependencies,
    critical_fidelity_dependencies: criticalFidelityDependencies,
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  });
}

function validateCognitiveTopologyShape(document) {
  exactObject(document, 'Cognitive topology', [
    'schema',
    'version',
    'status',
    'topology_id',
    'composition_id',
    'composition_digest',
    'nodes',
    'created_at',
    'updated_at',
    'contains_secret_material',
    'authority_effect',
    'network_effect',
    'runtime_activation'
  ]);

  if (
    document.schema !== COGNITIVE_TOPOLOGY_SCHEMA
    || document.version !== 0
    || document.status !== 'inert-contract-laboratory'
  ) throw new ValidationError('Cognitive topology schema/version/status is invalid');

  id(document.topology_id, 'topology_id');
  id(document.composition_id, 'composition_id');
  digest(document.composition_digest, 'composition_digest');
  validateNodes(document.nodes);

  const createdAt = date(document.created_at, 'created_at');
  const updatedAt = date(document.updated_at, 'updated_at');
  if (updatedAt < createdAt) {
    throw new ValidationError('updated_at cannot precede created_at');
  }

  if (
    document.contains_secret_material !== false
    || document.authority_effect !== 'none'
    || document.network_effect !== 'none'
    || document.runtime_activation !== false
  ) throw new ValidationError('Cognitive topology activation boundary is invalid');

  return document;
}

function validateNodes(value) {
  if (!Array.isArray(value)) throw new ValidationError('nodes must be an array');
  if (value.length > 64) throw new ValidationError('nodes must contain at most 64 items');

  const nodeIds = new Set();
  const modelIds = new Set();
  for (const node of value) {
    validateNode(node);
    if (nodeIds.has(node.node_id)) {
      throw new ValidationError(`nodes contains duplicate node_id ${node.node_id}`);
    }
    nodeIds.add(node.node_id);
    if (modelIds.has(node.model_id)) {
      throw new ValidationError(`nodes contains duplicate model_id ${node.model_id}`);
    }
    modelIds.add(node.model_id);
  }
}

function validateNode(value) {
  exactObject(value, 'Cognitive topology node', [
    'node_id',
    'model_id',
    'engagement',
    'topology_role',
    'access_mode',
    'custody',
    'weights',
    'persistence',
    'continuity_importance',
    'fidelity_importance',
    'adaptation_authorization_ref',
    'lineage_ref',
    'transition_policy_ref'
  ]);

  id(value.node_id, 'node_id');
  id(value.model_id, 'model_id');
  enumValue(value.engagement, 'engagement', ENGAGEMENTS);
  enumValue(value.topology_role, 'topology_role', TOPOLOGY_ROLES);
  enumValue(value.access_mode, 'access_mode', ACCESS_MODES);
  enumValue(value.custody, 'custody', CUSTODY);
  validateWeights(value.weights);
  validatePersistence(value.persistence);
  enumValue(value.continuity_importance, 'continuity_importance', IMPORTANCE);
  enumValue(value.fidelity_importance, 'fidelity_importance', IMPORTANCE);
  nullableId(value.adaptation_authorization_ref, 'adaptation_authorization_ref');
  nullableId(value.lineage_ref, 'lineage_ref');
  nullableId(value.transition_policy_ref, 'transition_policy_ref');

  if (value.topology_role === 'identity-kernel' && value.engagement === 'ephemeral') {
    throw new ValidationError('identity-kernel cannot use ephemeral engagement');
  }
}

function validateWeights(value) {
  exactObject(value, 'Cognitive topology weights', [
    'state',
    'artifact_digest',
    'licence_ref'
  ]);
  enumValue(value.state, 'weights.state', WEIGHT_STATES);
  nullableId(value.licence_ref, 'weights.licence_ref');

  if (value.state === 'open-acquired' || value.state === 'local-proprietary') {
    digest(value.artifact_digest, 'weights.artifact_digest');
  } else if (value.artifact_digest !== null) {
    throw new ValidationError(`weights.artifact_digest must be null for weight state ${value.state}`);
  }
}

function validatePersistence(value) {
  exactObject(value, 'Cognitive topology persistence', [
    'mode',
    'provider_id',
    'state_ref',
    'exportability'
  ]);
  enumValue(value.mode, 'persistence.mode', PERSISTENCE_MODES);
  enumValue(value.exportability, 'persistence.exportability', EXPORTABILITY);

  if (value.mode === 'provider-bound' || value.mode === 'mirrored') {
    id(value.provider_id, 'persistence.provider_id');
    id(value.state_ref, 'persistence.state_ref');
    return;
  }

  if (value.provider_id !== null) {
    throw new ValidationError(`persistence.provider_id must be null for persistence mode ${value.mode}`);
  }
  if (value.mode === 'none' && value.state_ref !== null) {
    throw new ValidationError('persistence.state_ref must be null for persistence mode none');
  }
  if (value.mode === 'local') {
    nullableId(value.state_ref, 'persistence.state_ref');
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

function digest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) {
    throw new ValidationError(`${label} is invalid`);
  }
  return value;
}

function nullableId(value, label) {
  if (value === null) return null;
  return id(value, label);
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
