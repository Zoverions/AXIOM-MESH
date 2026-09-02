import { digestObject, ValidationError } from './canonical.mjs';

export const RESOURCE_ENVELOPE_SCHEMA = 'axiom-resource-envelope.v0';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const PRIORITIES = new Set(['P0', 'P1', 'P2', 'P3', 'P4']);
const INHERITANCE_MODES = new Set(['root', 'inherited', 'separately-authorized-child']);
const ACCOUNTING_MODES = new Set(['not-applicable', 'counts-against-parent', 'separate-authorized-budget']);
const RESOURCE_KEYS = [
  'cpu_millis',
  'memory_bytes',
  'accelerator_memory_bytes',
  'durable_storage_bytes',
  'scratch_storage_bytes',
  'io_bytes',
  'network_bytes',
  'network_requests',
  'model_calls',
  'input_units',
  'output_units',
  'concurrency',
  'wall_time_ms',
  'monetary_cost_units',
  'energy_millijoules',
  'process_count',
  'thread_count',
  'file_descriptors'
];
const OBSERVATION_KINDS = new Set(['cpu', 'memory', 'accelerator', 'storage', 'io', 'network', 'battery', 'thermal', 'energy', 'cost']);

export function validateResourceEnvelope(document) {
  validateShape(document);
  return Object.freeze({
    valid: true,
    schema: document.schema,
    envelope_id: document.envelope_id,
    subject_ref: document.subject_ref,
    principal_id: document.principal_id,
    host_ref: document.host_ref,
    priority_class: document.priority_class,
    envelope_digest: digestObject(document),
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  });
}

export function resourceEnvelopeDigest(document) {
  validateShape(document);
  return digestObject(document);
}

function validateShape(document) {
  exactObject(document, 'Resource envelope', [
    'schema', 'version', 'status', 'envelope_id', 'subject_ref', 'principal_id', 'host_ref',
    'priority_class', 'parent_envelope_ref', 'inheritance', 'hard_ceilings', 'soft_targets',
    'measurement_freshness_ms', 'required_observation_kinds', 'degradation_policy_refs',
    'fallback_refs', 'checkpoint_required', 'cancellable', 'reservation_expires_at',
    'source_policy_ref', 'created_at', 'expires_at', 'contains_secret_material',
    'authority_effect', 'network_effect', 'runtime_activation'
  ]);

  if (document.schema !== RESOURCE_ENVELOPE_SCHEMA || document.version !== 0 || document.status !== 'inert-contract-laboratory') {
    throw new ValidationError('Resource envelope schema/version/status is invalid');
  }

  id(document.envelope_id, 'envelope_id');
  id(document.subject_ref, 'subject_ref');
  id(document.principal_id, 'principal_id');
  id(document.host_ref, 'host_ref');
  if (!PRIORITIES.has(document.priority_class)) throw new ValidationError('priority_class is invalid');
  nullableId(document.parent_envelope_ref, 'parent_envelope_ref');
  validateInheritance(document.inheritance, document.parent_envelope_ref);
  validateResources(document.hard_ceilings, 'hard_ceilings');
  validateResources(document.soft_targets, 'soft_targets');
  for (const key of RESOURCE_KEYS) {
    if (document.soft_targets[key] > document.hard_ceilings[key]) {
      throw new ValidationError(`soft target ${key} cannot exceed hard ceiling`);
    }
  }
  finiteInteger(document.measurement_freshness_ms, 'measurement_freshness_ms', 1, 86_400_000);
  stringSet(document.required_observation_kinds, 'required_observation_kinds', OBSERVATION_KINDS, 10, true);
  idList(document.degradation_policy_refs, 'degradation_policy_refs', 32);
  idList(document.fallback_refs, 'fallback_refs', 32);
  if (typeof document.checkpoint_required !== 'boolean') throw new ValidationError('checkpoint_required must be boolean');
  if (typeof document.cancellable !== 'boolean') throw new ValidationError('cancellable must be boolean');
  id(document.source_policy_ref, 'source_policy_ref');

  const created = date(document.created_at, 'created_at');
  const reservationExpires = date(document.reservation_expires_at, 'reservation_expires_at');
  const expires = date(document.expires_at, 'expires_at');
  if (reservationExpires < created) throw new ValidationError('reservation_expires_at cannot precede created_at');
  if (expires < reservationExpires) throw new ValidationError('expires_at cannot precede reservation_expires_at');

  if (document.contains_secret_material !== false) throw new ValidationError('contains_secret_material must be false for v0');
  if (document.authority_effect !== 'none' || document.network_effect !== 'none' || document.runtime_activation !== false) {
    throw new ValidationError('Resource envelope activation boundary is invalid');
  }
}

function validateInheritance(value, parentRef) {
  exactObject(value, 'Resource inheritance', ['mode', 'parent_budget_accounting', 'child_authorization_ref']);
  if (!INHERITANCE_MODES.has(value.mode)) throw new ValidationError('inheritance mode is invalid');
  if (!ACCOUNTING_MODES.has(value.parent_budget_accounting)) throw new ValidationError('parent_budget_accounting is invalid');
  nullableId(value.child_authorization_ref, 'child_authorization_ref');

  if (value.mode === 'root') {
    if (parentRef !== null) throw new ValidationError('root envelope parent_envelope_ref must be null');
    if (value.parent_budget_accounting !== 'not-applicable') throw new ValidationError('root envelope parent_budget_accounting must be not-applicable');
    if (value.child_authorization_ref !== null) throw new ValidationError('root envelope child_authorization_ref must be null');
    return;
  }

  if (parentRef === null) throw new ValidationError(`${value.mode} requires parent_envelope_ref`);
  if (value.mode === 'inherited') {
    if (value.parent_budget_accounting !== 'counts-against-parent') throw new ValidationError('inherited resource envelope must counts-against-parent');
    if (value.child_authorization_ref !== null) throw new ValidationError('inherited resource envelope child_authorization_ref must be null');
    return;
  }

  if (value.parent_budget_accounting !== 'separate-authorized-budget') throw new ValidationError('separately-authorized-child requires separate-authorized-budget');
  if (value.child_authorization_ref === null) throw new ValidationError('separately-authorized-child requires child_authorization_ref');
}

function validateResources(value, label) {
  exactObject(value, label, RESOURCE_KEYS);
  for (const key of RESOURCE_KEYS) {
    finiteInteger(value[key], `${label}.${key}`, 0, Number.MAX_SAFE_INTEGER);
  }
}

function exactObject(value, label, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ValidationError(`${label} must be an object`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new ValidationError(`${label} must be a plain object`);
  const allowed = new Set(fields);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new ValidationError(`${label} contains unknown field ${key}`);
  for (const key of fields) if (!Object.hasOwn(value, key)) throw new ValidationError(`${label} is missing required field ${key}`);
}

function id(value, label) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) throw new ValidationError(`${label} is invalid`);
  return value;
}
function nullableId(value, label) { if (value === null) return null; return id(value, label); }
function idList(value, label, maxItems) {
  if (!Array.isArray(value) || value.length > maxItems) throw new ValidationError(`${label} must be an array with at most ${maxItems} items`);
  const seen = new Set();
  for (const item of value) {
    id(item, label);
    if (seen.has(item)) throw new ValidationError(`${label} contains duplicate ${item}`);
    seen.add(item);
  }
}
function stringSet(value, label, allowed, maxItems, nonempty) {
  if (!Array.isArray(value) || value.length > maxItems || (nonempty && value.length < 1)) throw new ValidationError(`${label} has invalid cardinality`);
  const seen = new Set();
  for (const item of value) {
    if (typeof item !== 'string' || !allowed.has(item)) throw new ValidationError(`${label} contains invalid value`);
    if (seen.has(item)) throw new ValidationError(`${label} contains duplicate ${item}`);
    seen.add(item);
  }
}
function finiteInteger(value, label, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new ValidationError(`${label} must be a finite integer between ${min} and ${max}`);
}
function date(value, label) {
  if (typeof value !== 'string' || value.length > 64) throw new ValidationError(`${label} must be a canonical ISO timestamp`);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) throw new ValidationError(`${label} must be a canonical ISO timestamp`);
  return parsed.getTime();
}
