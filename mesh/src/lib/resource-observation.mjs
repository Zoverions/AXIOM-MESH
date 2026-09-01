import { digestObject, ValidationError } from './canonical.mjs';
import { validateResourceEnvelope } from './resource-envelope.mjs';

export const RESOURCE_OBSERVATION_SCHEMA = 'axiom-resource-observation.v0';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const KINDS = new Set(['cpu', 'memory', 'accelerator', 'storage', 'io', 'network', 'battery', 'thermal', 'energy', 'cost']);
const STATUSES = new Set(['measured', 'verified', 'failed', 'stale']);
const VALUE_FIELDS = {
  cpu: ['cpu_load_millis', 'cpu_available_millis'],
  memory: ['memory_used_bytes', 'memory_free_bytes'],
  accelerator: ['accelerator_memory_used_bytes', 'accelerator_memory_free_bytes'],
  storage: ['storage_total_bytes', 'storage_free_bytes'],
  io: ['io_read_bytes_per_second', 'io_write_bytes_per_second'],
  network: ['network_ingress_bytes_per_second', 'network_egress_bytes_per_second'],
  battery: ['battery_percent', 'on_ac_power'],
  thermal: ['thermal_state'],
  energy: ['energy_millijoules'],
  cost: ['monetary_cost_units_available']
};

export function validateResourceObservation(document) {
  validateShape(document);
  return Object.freeze({
    valid: true,
    schema: document.schema,
    observation_id: document.observation_id,
    observer_principal_id: document.observer_principal_id,
    host_ref: document.host_ref,
    kind: document.kind,
    observation_status: document.observation_status,
    observation_digest: digestObject(document),
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  });
}

export function resourceObservationDigest(document) {
  validateShape(document);
  return digestObject(document);
}

export function requireFreshResourceObservations(envelope, observations, at) {
  validateResourceEnvelope(envelope);
  const atMs = date(at, 'at');
  if (!Array.isArray(observations)) throw new ValidationError('observations must be an array');
  const byKind = new Map();

  for (const observation of observations) {
    validateShape(observation);
    if (observation.host_ref !== envelope.host_ref) continue;
    if (observation.observation_status !== 'measured' && observation.observation_status !== 'verified') continue;
    const observedMs = date(observation.observed_at, 'observed_at');
    const expiresMs = date(observation.expires_at, 'expires_at');
    if (observedMs > atMs || expiresMs < atMs) continue;
    if (atMs - observedMs > envelope.measurement_freshness_ms) continue;
    const current = byKind.get(observation.kind);
    if (!current || observedMs > current.observedMs) byKind.set(observation.kind, { observation, observedMs });
  }

  const selected = {};
  for (const kind of envelope.required_observation_kinds) {
    const match = byKind.get(kind);
    if (!match) throw new ValidationError(`required resource observation ${kind} is missing, stale, failed, or from the wrong host`);
    selected[kind] = match.observation;
  }
  return Object.freeze({ valid: true, host_ref: envelope.host_ref, at, selected: Object.freeze(selected) });
}

function validateShape(document) {
  exactObject(document, 'Resource observation', [
    'schema', 'version', 'status', 'observation_id', 'observer_principal_id', 'host_ref', 'kind',
    'observation_status', 'observed_at', 'expires_at', 'measurement_method', 'evidence_ref',
    'values', 'limitations', 'contains_secret_material', 'authority_effect', 'network_effect', 'runtime_activation'
  ]);
  if (document.schema !== RESOURCE_OBSERVATION_SCHEMA || document.version !== 0 || document.status !== 'inert-contract-laboratory') {
    throw new ValidationError('Resource observation schema/version/status is invalid');
  }
  id(document.observation_id, 'observation_id');
  id(document.observer_principal_id, 'observer_principal_id');
  id(document.host_ref, 'host_ref');
  if (!KINDS.has(document.kind)) throw new ValidationError('resource observation kind is invalid');
  if (!STATUSES.has(document.observation_status)) throw new ValidationError('observation_status is invalid');
  const observed = date(document.observed_at, 'observed_at');
  const expires = date(document.expires_at, 'expires_at');
  if (expires < observed) throw new ValidationError('expires_at cannot precede observed_at');
  id(document.measurement_method, 'measurement_method');
  id(document.evidence_ref, 'evidence_ref');
  validateValues(document.kind, document.observation_status, document.values);
  stringList(document.limitations, 'limitations', 32, 512);
  if (document.contains_secret_material !== false) throw new ValidationError('contains_secret_material must be false for v0');
  if (document.authority_effect !== 'none' || document.network_effect !== 'none' || document.runtime_activation !== false) {
    throw new ValidationError('Resource observation activation boundary is invalid');
  }
}

function validateValues(kind, status, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ValidationError('values must be an object');
  if (status === 'failed' || status === 'stale') {
    if (Object.keys(value).length !== 0) throw new ValidationError(`${status} observation values must be empty`);
    return;
  }
  exactObject(value, `${kind} values`, VALUE_FIELDS[kind]);
  if (kind === 'battery') {
    finiteNumber(value.battery_percent, 'battery_percent', 0, 100);
    if (typeof value.on_ac_power !== 'boolean') throw new ValidationError('on_ac_power must be boolean');
    return;
  }
  if (kind === 'thermal') {
    if (typeof value.thermal_state !== 'string' || !new Set(['nominal', 'warm', 'hot', 'critical', 'unknown']).has(value.thermal_state)) throw new ValidationError('thermal_state is invalid');
    return;
  }
  for (const key of VALUE_FIELDS[kind]) finiteInteger(value[key], key, 0, Number.MAX_SAFE_INTEGER);
}

function exactObject(value, label, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ValidationError(`${label} must be an object`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new ValidationError(`${label} must be a plain object`);
  const allowed = new Set(fields);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new ValidationError(`${label} contains unknown field ${key}`);
  for (const key of fields) if (!Object.hasOwn(value, key)) throw new ValidationError(`${label} is missing required field ${key}`);
}
function id(value, label) { if (typeof value !== 'string' || !IDENTIFIER.test(value)) throw new ValidationError(`${label} is invalid`); return value; }
function finiteInteger(value, label, min, max) { if (!Number.isSafeInteger(value) || value < min || value > max) throw new ValidationError(`${label} must be a finite integer between ${min} and ${max}`); }
function finiteNumber(value, label, min, max) { if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new ValidationError(`${label} must be finite between ${min} and ${max}`); }
function stringList(value, label, maxItems, maxLength) { if (!Array.isArray(value) || value.length > maxItems) throw new ValidationError(`${label} must be an array with at most ${maxItems} items`); for (const item of value) if (typeof item !== 'string' || item.length > maxLength) throw new ValidationError(`${label} contains invalid item`); }
function date(value, label) { if (typeof value !== 'string' || value.length > 64) throw new ValidationError(`${label} must be a canonical ISO timestamp`); const parsed = new Date(value); if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) throw new ValidationError(`${label} must be a canonical ISO timestamp`); return parsed.getTime(); }
