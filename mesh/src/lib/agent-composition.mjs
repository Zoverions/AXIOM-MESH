import { digestObject, ValidationError } from './canonical.mjs';

export const AGENT_COMPOSITION_SCHEMA = 'axiom-agent-composition.v0';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const INTEGRATION_MODES = new Set(['wrapped', 'integrated', 'native']);
const MODEL_ROLES = new Set([
  'reasoning',
  'coding',
  'vision',
  'computer-use',
  'research',
  'planning',
  'critique',
  'summarization',
  'embedding',
  'other'
]);
const MEMORY_CLASSES = new Set(['semantic', 'episodic', 'procedural', 'working']);
const SKILL_SOURCE_KINDS = new Set(['native', 'imported', 'mcp', 'custom']);

export function validateAgentComposition(document) {
  validateAgentCompositionShape(document);
  return Object.freeze({
    valid: true,
    schema: document.schema,
    composition_id: document.composition_id,
    principal_id: document.principal_id,
    integration_mode: document.integration_mode,
    composition_digest: digestObject(document),
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  });
}

export function agentCompositionDigest(document) {
  validateAgentCompositionShape(document);
  return digestObject(document);
}

function validateAgentCompositionShape(document) {
  exactObject(document, 'Agent composition', [
    'schema',
    'version',
    'status',
    'composition_id',
    'principal_id',
    'integration_mode',
    'self_bundle',
    'runtimes',
    'models',
    'memories',
    'skill_sources',
    'cognitive_workers',
    'continuity_policy_ref',
    'credential_broker_policy_ref',
    'assurance_policy_ref',
    'portability',
    'created_at',
    'updated_at',
    'authority_effect',
    'network_effect',
    'runtime_activation'
  ]);

  if (
    document.schema !== AGENT_COMPOSITION_SCHEMA
    || document.version !== 0
    || document.status !== 'inert-contract-laboratory'
  ) throw new ValidationError('Agent composition schema/version/status is invalid');

  id(document.composition_id, 'composition_id');
  id(document.principal_id, 'principal_id');
  if (!INTEGRATION_MODES.has(document.integration_mode)) {
    throw new ValidationError('integration_mode is invalid');
  }

  validateSelfBundle(document.self_bundle);
  uniqueArray(document.runtimes, 'runtimes', 'runtime_id', validateRuntime);
  uniqueArray(document.models, 'models', 'model_id', validateModel);
  uniqueArray(document.memories, 'memories', 'memory_id', validateMemory);
  uniqueArray(document.skill_sources, 'skill_sources', 'source_id', validateSkillSource);
  validateCognitiveWorkers(document.cognitive_workers);
  nullableId(document.continuity_policy_ref, 'continuity_policy_ref');
  nullableId(document.credential_broker_policy_ref, 'credential_broker_policy_ref');
  nullableId(document.assurance_policy_ref, 'assurance_policy_ref');
  validatePortability(document.portability);

  const createdAt = date(document.created_at, 'created_at');
  const updatedAt = date(document.updated_at, 'updated_at');
  if (updatedAt < createdAt) {
    throw new ValidationError('updated_at cannot precede created_at');
  }

  if (
    document.authority_effect !== 'none'
    || document.network_effect !== 'none'
    || document.runtime_activation !== false
  ) throw new ValidationError('Agent composition activation boundary is invalid');

  return document;
}

function validateSelfBundle(value) {
  exactObject(value, 'Self bundle', ['ref', 'digest']);
  id(value.ref, 'self_bundle.ref');
  digest(value.digest, 'self_bundle.digest');
}

function validateRuntime(value) {
  exactObject(value, 'Runtime descriptor', ['runtime_id', 'adapter_id', 'profile_ref', 'required']);
  id(value.runtime_id, 'runtime_id');
  id(value.adapter_id, 'adapter_id');
  id(value.profile_ref, 'runtime profile_ref');
  if (typeof value.required !== 'boolean') throw new ValidationError('runtime required must be boolean');
}

function validateModel(value) {
  exactObject(value, 'Model descriptor', ['model_id', 'provider_id', 'profile_ref', 'roles']);
  id(value.model_id, 'model_id');
  id(value.provider_id, 'model provider_id');
  id(value.profile_ref, 'model profile_ref');
  stringSet(value.roles, 'model roles', MODEL_ROLES);
}

function validateMemory(value) {
  exactObject(value, 'Memory descriptor', ['memory_id', 'provider_id', 'profile_ref', 'classes']);
  id(value.memory_id, 'memory_id');
  id(value.provider_id, 'memory provider_id');
  id(value.profile_ref, 'memory profile_ref');
  stringSet(value.classes, 'memory classes', MEMORY_CLASSES);
}

function validateSkillSource(value) {
  exactObject(value, 'Skill source descriptor', ['source_id', 'kind', 'artifact_ref', 'profile_ref']);
  id(value.source_id, 'source_id');
  if (!SKILL_SOURCE_KINDS.has(value.kind)) throw new ValidationError('skill source kind is invalid');
  id(value.artifact_ref, 'skill source artifact_ref');
  id(value.profile_ref, 'skill source profile_ref');
}

function validateCognitiveWorkers(value) {
  exactObject(value, 'Cognitive worker policy', ['policy_ref', 'authority_effect', 'delegation_enabled']);
  nullableId(value.policy_ref, 'cognitive worker policy_ref');
  if (value.authority_effect !== 'none' || value.delegation_enabled !== false) {
    throw new ValidationError('Cognitive worker declarations cannot grant authority or enable delegation');
  }
}

function validatePortability(value) {
  exactObject(value, 'Portability policy', ['enabled', 'export_profile_ref']);
  if (typeof value.enabled !== 'boolean') throw new ValidationError('portability enabled must be boolean');
  nullableId(value.export_profile_ref, 'portability export_profile_ref');
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

function uniqueArray(value, label, key, validator) {
  if (!Array.isArray(value)) throw new ValidationError(`${label} must be an array`);
  if (value.length > 32) throw new ValidationError(`${label} must contain at most 32 items`);
  const seen = new Set();
  for (const item of value) {
    validator(item);
    const itemId = item[key];
    if (seen.has(itemId)) throw new ValidationError(`${label} contains duplicate ${key} ${itemId}`);
    seen.add(itemId);
  }
  return value;
}

function stringSet(value, label, allowed, maxItems = 16) {
  if (!Array.isArray(value) || value.length < 1 || value.length > maxItems) {
    throw new ValidationError(`${label} must contain 1-${maxItems} items`);
  }
  const seen = new Set();
  for (const item of value) {
    if (typeof item !== 'string' || !allowed.has(item)) throw new ValidationError(`${label} contains an invalid value`);
    if (seen.has(item)) throw new ValidationError(`${label} contains a duplicate value`);
    seen.add(item);
  }
  return value;
}
