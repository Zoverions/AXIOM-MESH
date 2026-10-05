import { ValidationError } from './canonical.mjs';
import { validateResourceObservation } from './resource-observation.mjs';

const STATES = ['normal', 'constrained', 'critical', 'emergency'];
const STATE_RANK = new Map(STATES.map((state, index) => [state, index]));
const ALLOWED_PRIORITIES = Object.freeze({
  normal: Object.freeze(['P0', 'P1', 'P2', 'P3', 'P4']),
  constrained: Object.freeze(['P0', 'P1', 'P2', 'P3']),
  critical: Object.freeze(['P0', 'P1', 'P2']),
  emergency: Object.freeze(['P0'])
});
const METRICS = Object.freeze([
  { kind: 'memory', field: 'memory_free_bytes' },
  { kind: 'storage', field: 'storage_free_bytes' },
  { kind: 'cpu', field: 'cpu_available_millis' }
]);

export function evaluateResourcePressure(profile, observations, at, previousState = 'normal') {
  validateProfile(profile);
  if (!STATE_RANK.has(previousState)) throw new ValidationError('previousState is invalid');
  const atMs = canonicalDate(at, 'at');
  const selected = selectFreshCoreObservations(profile, observations, atMs);

  const values = Object.freeze({
    memory_free_bytes: selected.memory.values.memory_free_bytes,
    storage_free_bytes: selected.storage.values.storage_free_bytes,
    cpu_available_millis: selected.cpu.values.cpu_available_millis
  });

  const reasons = [];
  const reserveBreaches = [];
  for (const metric of METRICS) {
    if (values[metric.field] < profile.sovereignty_reserve[metric.field]) {
      reserveBreaches.push(`${metric.field} below sovereignty reserve`);
    }
  }

  let rawState = 'normal';
  if (reserveBreaches.length) {
    rawState = 'emergency';
    reasons.push(...reserveBreaches);
  } else {
    for (const metric of METRICS) {
      const value = values[metric.field];
      const thresholds = profile.thresholds[metric.field];
      if (value < thresholds.critical_below) {
        rawState = moreSevere(rawState, 'critical');
        reasons.push(`${metric.field} below critical threshold`);
      } else if (value < thresholds.constrained_below) {
        rawState = moreSevere(rawState, 'constrained');
        reasons.push(`${metric.field} below constrained threshold`);
      }
    }
  }

  const state = applyRecoveryHysteresis(rawState, previousState, profile, values);
  if (state !== rawState) reasons.push(`hysteresis retained ${state} from previous ${previousState}`);

  return Object.freeze({
    state,
    raw_state: rawState,
    previous_state: previousState,
    host_ref: profile.host_ref,
    observed_at: at,
    values,
    reasons: Object.freeze(reasons),
    allowed_priority_classes: ALLOWED_PRIORITIES[state],
    authority_effect: 'none',
    privacy_relaxation: false,
    egress_relaxation: false,
    runtime_activation: false
  });
}

function selectFreshCoreObservations(profile, observations, atMs) {
  if (!Array.isArray(observations)) throw new ValidationError('observations must be an array');
  const selected = new Map();

  for (const observation of observations) {
    validateResourceObservation(observation);
    if (!METRICS.some(metric => metric.kind === observation.kind)) continue;
    if (observation.host_ref !== profile.host_ref) continue;
    if (!new Set(['measured', 'verified']).has(observation.observation_status)) continue;
    const observedMs = canonicalDate(observation.observed_at, 'observed_at');
    const expiresMs = canonicalDate(observation.expires_at, 'expires_at');
    if (observedMs > atMs || expiresMs < atMs || atMs - observedMs > profile.observation_max_age_ms) continue;
    const current = selected.get(observation.kind);
    if (!current || observedMs > current.observedMs) selected.set(observation.kind, { observation, observedMs });
  }

  const output = {};
  for (const metric of METRICS) {
    const match = selected.get(metric.kind);
    if (!match) throw new ValidationError(`required ${metric.kind} resource observation is missing, stale, failed, or from the wrong host`);
    output[metric.kind] = match.observation;
  }
  return output;
}

function applyRecoveryHysteresis(rawState, previousState, profile, values) {
  if (STATE_RANK.get(rawState) >= STATE_RANK.get(previousState)) return rawState;

  if (previousState === 'emergency') {
    return allRecovered(profile, values, 'recover_critical_at') ? rawState : 'emergency';
  }
  if (previousState === 'critical') {
    return allRecovered(profile, values, 'recover_critical_at') ? rawState : 'critical';
  }
  if (previousState === 'constrained' && rawState === 'normal') {
    return allRecovered(profile, values, 'recover_constrained_at') ? 'normal' : 'constrained';
  }
  return rawState;
}

function allRecovered(profile, values, recoveryKey) {
  return METRICS.every(metric => values[metric.field] >= profile.thresholds[metric.field][recoveryKey]);
}

function moreSevere(first, second) {
  return STATE_RANK.get(first) >= STATE_RANK.get(second) ? first : second;
}

function validateProfile(profile) {
  exactObject(profile, 'Resource pressure profile', ['host_ref', 'observation_max_age_ms', 'sovereignty_reserve', 'thresholds']);
  identifier(profile.host_ref, 'host_ref');
  finitePositiveInteger(profile.observation_max_age_ms, 'observation_max_age_ms');
  exactObject(profile.sovereignty_reserve, 'sovereignty_reserve', METRICS.map(metric => metric.field));
  exactObject(profile.thresholds, 'thresholds', METRICS.map(metric => metric.field));

  for (const metric of METRICS) {
    const field = metric.field;
    finiteNonnegativeInteger(profile.sovereignty_reserve[field], `sovereignty_reserve.${field}`);
    const value = profile.thresholds[field];
    exactObject(value, `thresholds.${field}`, ['constrained_below', 'critical_below', 'recover_constrained_at', 'recover_critical_at']);
    for (const key of Object.keys(value)) finiteNonnegativeInteger(value[key], `thresholds.${field}.${key}`);
    if (value.critical_below > value.constrained_below) throw new ValidationError(`thresholds.${field}.critical_below cannot exceed constrained_below`);
    if (value.recover_critical_at < value.critical_below) throw new ValidationError(`thresholds.${field}.recover_critical_at must be at or above critical_below`);
    if (value.recover_constrained_at < value.constrained_below) throw new ValidationError(`thresholds.${field}.recover_constrained_at must be at or above constrained_below`);
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
function identifier(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(value)) throw new ValidationError(`${label} is invalid`);
}
function finitePositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) throw new ValidationError(`${label} must be a positive finite integer`);
}
function finiteNonnegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new ValidationError(`${label} must be a non-negative finite integer`);
}
function canonicalDate(value, label) {
  if (typeof value !== 'string' || value.length > 64) throw new ValidationError(`${label} must be a canonical ISO timestamp`);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) throw new ValidationError(`${label} must be a canonical ISO timestamp`);
  return parsed.getTime();
}
