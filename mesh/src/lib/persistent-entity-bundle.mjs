import { digestObject, ValidationError } from './canonical.mjs';

export const PERSISTENT_ENTITY_BUNDLE_SCHEMA = 'axiom-persistent-entity-bundle.v0';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const SCOPES = new Set([
  'identity',
  'character',
  'personal_model_projection',
  'runtime_policy',
  'private_memory_ref',
  'private_artifact_ref',
  'skill_ref',
  'relationship_projection'
]);
const SINGLETON_KINDS = new Set([
  'identity',
  'character',
  'personal_model_projection',
  'runtime_policy'
]);
const FORBIDDEN_FIELD_NAMES = new Set([
  'password',
  'secret',
  'token',
  'api_key',
  'apiKey',
  'refresh_token',
  'refreshToken',
  'cookie',
  'cookies',
  'credential',
  'credentials',
  'recovery',
  'recovery_key',
  'session',
  'session_id',
  'server_id',
  'source_db_id',
  'capability',
  'capabilities',
  'standing_approval',
  'standing_approvals',
  'delegation',
  'delegations',
  'embedding',
  'embeddings',
  'filesystem_path',
  'absolute_path'
]);

export function validatePersistentEntityBundle(document) {
  validatePersistentEntityBundleShape(document);
  return Object.freeze({
    valid: true,
    schema: document.schema,
    bundle_id: document.bundle_id,
    entity_ref: document.entity_ref,
    bundle_digest: digestObject(document),
    record_count: document.records.length,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false,
    credential_material: false
  });
}

export function persistentEntityBundleDigest(document) {
  validatePersistentEntityBundleShape(document);
  return digestObject(document);
}

function validatePersistentEntityBundleShape(document) {
  rejectForbiddenFieldNames(document);
  exactObject(document, 'Persistent entity bundle', [
    'schema',
    'version',
    'status',
    'bundle_id',
    'entity_ref',
    'source_composition_digest',
    'scopes',
    'records',
    'created_at',
    'authority_effect',
    'network_effect',
    'runtime_activation',
    'credential_material'
  ]);

  if (
    document.schema !== PERSISTENT_ENTITY_BUNDLE_SCHEMA
    || document.version !== 0
    || document.status !== 'inert-portability-contract'
  ) throw new ValidationError('Persistent entity bundle schema/version/status is invalid');

  id(document.bundle_id, 'bundle_id');
  id(document.entity_ref, 'entity_ref');
  nullableDigest(document.source_composition_digest, 'source_composition_digest');
  const scopes = validateScopes(document.scopes);
  validateRecords(document.records, scopes);
  date(document.created_at, 'created_at');

  if (
    document.authority_effect !== 'none'
    || document.network_effect !== 'none'
    || document.runtime_activation !== false
    || document.credential_material !== false
  ) throw new ValidationError('Persistent entity bundle safety boundary is invalid');

  return document;
}

function validateScopes(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 8) {
    throw new ValidationError('scopes must contain 1-8 items');
  }
  const seen = new Set();
  for (const scope of value) {
    if (typeof scope !== 'string' || !SCOPES.has(scope)) {
      throw new ValidationError('scopes contains an invalid scope');
    }
    if (seen.has(scope)) throw new ValidationError(`scopes contains duplicate scope ${scope}`);
    seen.add(scope);
  }
  return seen;
}

function validateRecords(value, declaredScopes) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 128) {
    throw new ValidationError('records must contain 1-128 items');
  }
  const carriedScopes = new Set();
  const singletonCounts = new Map();
  const refs = new Map([
    ['private_memory_ref', new Set()],
    ['private_artifact_ref', new Set()],
    ['skill_ref', new Set()],
    ['relationship_projection', new Set()]
  ]);

  for (const record of value) {
    exactRecordKind(record);
    carriedScopes.add(record.kind);
    if (!declaredScopes.has(record.kind)) {
      throw new ValidationError(`record kind ${record.kind} is not declared in scopes`);
    }

    if (SINGLETON_KINDS.has(record.kind)) {
      const count = (singletonCounts.get(record.kind) ?? 0) + 1;
      singletonCounts.set(record.kind, count);
      if (count > 1) throw new ValidationError(`records contains duplicate singleton ${record.kind}`);
    }

    switch (record.kind) {
      case 'identity':
        validateIdentity(record);
        break;
      case 'character':
        validateCharacter(record);
        break;
      case 'personal_model_projection':
        validatePersonalModelProjection(record);
        break;
      case 'runtime_policy':
        validateRuntimePolicy(record);
        break;
      case 'private_memory_ref':
        validatePrivateMemoryRef(record);
        uniqueRef(refs.get(record.kind), record.memory_ref, 'memory_ref');
        break;
      case 'private_artifact_ref':
        validatePrivateArtifactRef(record);
        uniqueRef(refs.get(record.kind), record.artifact_ref, 'artifact_ref');
        break;
      case 'skill_ref':
        validateSkillRef(record);
        uniqueRef(refs.get(record.kind), record.skill_ref, 'skill_ref');
        break;
      case 'relationship_projection':
        validateRelationshipProjection(record);
        uniqueRef(refs.get(record.kind), record.relationship_ref, 'relationship_ref');
        break;
      default:
        throw new ValidationError(`record kind ${record.kind} is invalid`);
    }
  }

  for (const scope of declaredScopes) {
    if (!carriedScopes.has(scope)) {
      throw new ValidationError(`scope ${scope} has no matching record`);
    }
  }
}

function exactRecordKind(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new ValidationError('record must be an object');
  }
  if (!Object.hasOwn(record, 'kind') || typeof record.kind !== 'string' || !SCOPES.has(record.kind)) {
    throw new ValidationError('record kind is invalid');
  }
}

function validateIdentity(value) {
  exactObject(value, 'identity record', ['kind', 'display_name', 'handle_intent']);
  string(value.display_name, 'identity display_name', { max: 256 });
  nullableString(value.handle_intent, 'identity handle_intent', { max: 256 });
}

function validateCharacter(value) {
  exactObject(value, 'character record', ['kind', 'text']);
  string(value.text, 'character text', { max: 16 * 1024 });
}

function validatePersonalModelProjection(value) {
  exactObject(value, 'personal_model_projection record', [
    'kind',
    'projection_ref',
    'projection_digest',
    'purpose'
  ]);
  id(value.projection_ref, 'projection_ref');
  digest(value.projection_digest, 'projection_digest');
  string(value.purpose, 'personal model projection purpose', { max: 2048 });
}

function validateRuntimePolicy(value) {
  exactObject(value, 'runtime_policy record', [
    'kind',
    'primary_profile_ref',
    'fallback_profile_ref',
    'local_preferred'
  ]);
  nullableId(value.primary_profile_ref, 'primary_profile_ref');
  nullableId(value.fallback_profile_ref, 'fallback_profile_ref');
  if (typeof value.local_preferred !== 'boolean') {
    throw new ValidationError('runtime policy local_preferred must be boolean');
  }
}

function validatePrivateMemoryRef(value) {
  exactObject(value, 'private_memory_ref record', ['kind', 'memory_ref', 'content_digest']);
  id(value.memory_ref, 'memory_ref');
  digest(value.content_digest, 'memory content_digest');
}

function validatePrivateArtifactRef(value) {
  exactObject(value, 'private_artifact_ref record', ['kind', 'artifact_ref', 'content_digest']);
  id(value.artifact_ref, 'artifact_ref');
  digest(value.content_digest, 'artifact content_digest');
}

function validateSkillRef(value) {
  exactObject(value, 'skill_ref record', ['kind', 'skill_ref', 'artifact_digest', 'disabled_by_default']);
  id(value.skill_ref, 'skill_ref');
  digest(value.artifact_digest, 'skill artifact_digest');
  if (value.disabled_by_default !== true) {
    throw new ValidationError('portable skill must be disabled by default');
  }
}

function validateRelationshipProjection(value) {
  exactObject(value, 'relationship_projection record', [
    'kind',
    'relationship_ref',
    'projection_digest',
    'third_party_private_data'
  ]);
  id(value.relationship_ref, 'relationship_ref');
  digest(value.projection_digest, 'relationship projection_digest');
  if (value.third_party_private_data !== false) {
    throw new ValidationError('relationship projection cannot contain third-party private data in v0');
  }
}

function rejectForbiddenFieldNames(value, path = '$') {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      rejectForbiddenFieldNames(value[index], `${path}[${index}]`);
    }
    return;
  }
  if (!value || typeof value !== 'object') return;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return;
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_FIELD_NAMES.has(key)) {
      throw new ValidationError(`forbidden field ${path}.${key}`);
    }
    rejectForbiddenFieldNames(value[key], `${path}.${key}`);
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

function uniqueRef(seen, value, label) {
  if (seen.has(value)) throw new ValidationError(`records contains duplicate ${label} ${value}`);
  seen.add(value);
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

function string(value, label, { min = 1, max = 4096 } = {}) {
  if (typeof value !== 'string' || value.length < min || value.length > max) {
    throw new ValidationError(`${label} must contain ${min}-${max} characters`);
  }
  return value;
}

function nullableString(value, label, options = {}) {
  if (value === null) return null;
  return string(value, label, options);
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
