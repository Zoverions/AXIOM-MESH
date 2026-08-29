import { digestObject, ValidationError } from './canonical.mjs';

export const SELF_BUNDLE_INDEX_SCHEMA = 'axiom-self-bundle-index.v0';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;

export function validateSelfBundleIndex(document) {
  validateSelfBundleIndexShape(document);
  return Object.freeze({
    valid: true,
    schema: document.schema,
    bundle_id: document.bundle_id,
    principal_id: document.principal_id,
    bundle_digest: digestObject(document),
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  });
}

export function selfBundleIndexDigest(document) {
  validateSelfBundleIndexShape(document);
  return digestObject(document);
}

function validateSelfBundleIndexShape(document) {
  exactObject(document, 'Self bundle index', [
    'schema',
    'version',
    'status',
    'bundle_id',
    'principal_id',
    'created_at',
    'predecessor_bundle',
    'agent_composition',
    'personal_agent_pack',
    'semantic_state',
    'contains_secret_material',
    'authority_effect',
    'network_effect',
    'runtime_activation'
  ]);

  if (
    document.schema !== SELF_BUNDLE_INDEX_SCHEMA
    || document.version !== 0
    || document.status !== 'inert-contract-laboratory'
  ) throw new ValidationError('Self bundle index schema/version/status is invalid');

  id(document.bundle_id, 'bundle_id');
  id(document.principal_id, 'principal_id');
  date(document.created_at, 'created_at');
  validateNullableReference(document.predecessor_bundle, 'predecessor_bundle');
  validateReference(document.agent_composition, 'agent_composition');
  validateReference(document.personal_agent_pack, 'personal_agent_pack');
  validateSemanticState(document.semantic_state);

  if (document.contains_secret_material !== false) {
    throw new ValidationError('Self bundle secret boundary is invalid');
  }
  if (document.authority_effect !== 'none') {
    throw new ValidationError('Self bundle authority boundary is invalid');
  }
  if (document.network_effect !== 'none') {
    throw new ValidationError('Self bundle network boundary is invalid');
  }
  if (document.runtime_activation !== false) {
    throw new ValidationError('Self bundle runtime activation boundary is invalid');
  }

  return document;
}

function validateNullableReference(value, label) {
  if (value === null) return null;
  return validateReference(value, label);
}

function validateReference(value, label) {
  exactObject(value, label, ['ref', 'digest']);
  id(value.ref, `${label}.ref`);
  digest(value.digest, `${label}.digest`);
  return value;
}

function validateSemanticState(value) {
  if (!Array.isArray(value)) throw new ValidationError('semantic_state must be an array');
  if (value.length > 256) {
    throw new ValidationError('semantic_state must contain at most 256 items');
  }

  const seen = new Set();
  for (const entry of value) {
    exactObject(entry, 'Semantic state entry', [
      'claim_id',
      'ref',
      'digest',
      'required_for_continuity'
    ]);
    id(entry.claim_id, 'semantic_state claim_id');
    id(entry.ref, 'semantic_state ref');
    digest(entry.digest, 'semantic_state digest');
    if (typeof entry.required_for_continuity !== 'boolean') {
      throw new ValidationError('semantic_state required_for_continuity must be boolean');
    }
    if (seen.has(entry.claim_id)) {
      throw new ValidationError(`semantic_state contains duplicate claim_id ${entry.claim_id}`);
    }
    seen.add(entry.claim_id);
  }
  return value;
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

function digest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) {
    throw new ValidationError(`${label} digest is invalid`);
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
