import { digestObject, ValidationError } from './canonical.mjs';

export const ENTITY_FOUNDATION_SCHEMA = 'axiom-entity-foundation.v0';
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;

export function validateEntityFoundation(document) {
  validateShape(document);
  return Object.freeze({
    valid: true,
    schema: document.schema,
    foundation_id: document.foundation_id,
    entity_id: document.entity_id,
    lineage_root_id: document.lineage_root_id,
    profile: document.profile,
    foundation_digest: digestObject(document),
    blank_at_axiom_composition_layer: true,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  });
}

export function entityFoundationDigest(document) {
  validateShape(document);
  return digestObject(document);
}

function validateShape(document) {
  exactObject(document, 'Entity foundation', [
    'schema','version','status','foundation_id','entity_id','lineage_root_id','profile','core_contract_refs',
    'recovery_policy_ref','privacy_policy_ref','personal_grounding_present','worldview_layers_present',
    'disposition_layers_present','provider_binding_present','created_at','authority_effect','network_effect','runtime_activation'
  ]);
  if (document.schema !== ENTITY_FOUNDATION_SCHEMA || document.version !== 0 || document.status !== 'inert-contract-laboratory') {
    throw new ValidationError('Entity foundation schema/version/status is invalid');
  }
  id(document.foundation_id, 'foundation_id');
  id(document.entity_id, 'entity_id');
  id(document.lineage_root_id, 'lineage_root_id');
  if (document.profile !== 'blank-egg') throw new ValidationError('Entity foundation profile must be blank-egg');
  uniqueIds(document.core_contract_refs, 'core_contract_refs', 1, 32);
  nullableId(document.recovery_policy_ref, 'recovery_policy_ref');
  nullableId(document.privacy_policy_ref, 'privacy_policy_ref');
  for (const key of ['personal_grounding_present','worldview_layers_present','disposition_layers_present','provider_binding_present']) {
    if (document[key] !== false) throw new ValidationError('Blank entity foundation cannot contain personal grounding, worldview/disposition layers, or provider binding');
  }
  canonicalDate(document.created_at, 'created_at');
  if (document.authority_effect !== 'none' || document.network_effect !== 'none' || document.runtime_activation !== false) {
    throw new ValidationError('Entity foundation activation boundary is invalid');
  }
  return document;
}

function exactObject(value, label, allowedFields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ValidationError(`${label} must be an object`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new ValidationError(`${label} must be a plain object`);
  const allowed = new Set(allowedFields);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new ValidationError(`${label} contains unknown field ${key}`);
  for (const key of allowedFields) if (!Object.hasOwn(value, key)) throw new ValidationError(`${label} is missing required field ${key}`);
}

function id(value, label) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) throw new ValidationError(`${label} is invalid`);
  return value;
}

function nullableId(value, label) {
  if (value === null) return null;
  return id(value, label);
}

function uniqueIds(value, label, min, max) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new ValidationError(`${label} must contain ${min}-${max} items`);
  }
  const seen = new Set();
  for (const item of value) {
    id(item, label);
    if (seen.has(item)) throw new ValidationError(`${label} contains duplicate ${item}`);
    seen.add(item);
  }
}

function canonicalDate(value, label) {
  if (typeof value !== 'string' || value.length > 64) throw new ValidationError(`${label} must be a canonical ISO timestamp`);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new ValidationError(`${label} must be a canonical ISO timestamp`);
  }
}
