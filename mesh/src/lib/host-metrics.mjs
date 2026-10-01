import {
  ValidationError,
  assertPlainObject,
  digestObject
} from './canonical.mjs';
import { evaluateContribution } from './host-sovereignty.mjs';

const MEASUREMENT_FIELDS = Object.freeze([
  'external_power',
  'unmetered_network',
  'user_idle',
  'foreground_user_active',
  'battery_percent',
  'free_storage_bytes',
  'thermal_state',
  'transfer_bytes_today',
  'available_cpu_millis',
  'available_memory_bytes',
  'available_bandwidth_bytes_per_second'
]);
const LOCAL_SOURCE = /^[a-z][a-z0-9._:-]{0,127}$/;

export function verifyHostMeasurementBundle(input, {
  asOf = new Date().toISOString(),
  maxAgeMs = 5_000,
  maxFutureSkewMs = 1_000
} = {}) {
  const value = assertPlainObject(input, 'host measurement bundle');
  assertExactKeys(value, ['format', 'measurements'], 'host measurement bundle');
  if (value.format !== 'host.measurement-bundle.v1') {
    throw new ValidationError(
      'host measurement bundle format must be host.measurement-bundle.v1'
    );
  }
  const observedAt = normalizeTimestamp(asOf, 'measurement as_of');
  const observedMs = Date.parse(observedAt);
  const freshness = boundedInteger(maxAgeMs, 'maxAgeMs', 0, 3_600_000);
  const futureSkew = boundedInteger(
    maxFutureSkewMs,
    'maxFutureSkewMs',
    0,
    60_000
  );
  const measurements = assertPlainObject(value.measurements, 'measurements');
  assertExactKeys(measurements, MEASUREMENT_FIELDS, 'measurements');

  const runtime = {};
  const normalizedMeasurements = {};
  const timestamps = [];
  const sources = new Set();
  for (const field of MEASUREMENT_FIELDS) {
    const record = assertPlainObject(
      measurements[field],
      `measurements.${field}`
    );
    assertExactKeys(
      record,
      ['value', 'source', 'observed_at'],
      `measurements.${field}`
    );
    const source = localSource(record.source, `measurements.${field}.source`);
    const instant = normalizeTimestamp(
      record.observed_at,
      `measurements.${field}.observed_at`
    );
    const instantMs = Date.parse(instant);
    if (instantMs > observedMs + futureSkew) {
      throw new ValidationError(`measurements.${field} is future-dated`);
    }
    if (observedMs - instantMs > freshness) {
      throw new ValidationError(`measurements.${field} is stale`);
    }
    runtime[field] = record.value;
    normalizedMeasurements[field] = {
      value: record.value,
      source,
      observed_at: instant
    };
    timestamps.push(instant);
    sources.add(source);
  }

  const normalizedRuntime = normalizeRuntimeObservation(runtime);
  const normalizedBundle = {
    format: 'host.measurement-bundle.v1',
    measurements: normalizedMeasurements
  };
  const orderedTimestamps = [...timestamps].sort();
  return Object.freeze({
    format: 'host.measurement-verification.v1',
    as_of: observedAt,
    max_age_ms: freshness,
    max_future_skew_ms: futureSkew,
    bundle_digest: digestObject(normalizedBundle),
    oldest_observed_at: orderedTimestamps[0],
    newest_observed_at: orderedTimestamps.at(-1),
    sources: Object.freeze([...sources].sort()),
    runtime: Object.freeze(normalizedRuntime)
  });
}

export function evaluateObservedContribution({
  bundle,
  policy,
  reserve,
  request,
  guardianState,
  remoteConstraints = undefined,
  asOf = new Date().toISOString(),
  maxAgeMs = 5_000,
  maxFutureSkewMs = 1_000
}) {
  const measurement = verifyHostMeasurementBundle(bundle, {
    asOf,
    maxAgeMs,
    maxFutureSkewMs
  });
  const decision = evaluateContribution({
    policy,
    reserve,
    runtime: measurement.runtime,
    request,
    guardianState,
    remoteConstraints
  });
  return Object.freeze({
    ...decision,
    measurement: Object.freeze({
      format: measurement.format,
      bundle_digest: measurement.bundle_digest,
      oldest_observed_at: measurement.oldest_observed_at,
      newest_observed_at: measurement.newest_observed_at,
      sources: measurement.sources
    })
  });
}

function localSource(value, name) {
  if (
    typeof value !== 'string'
    || value.length < 1
    || value.length > 128
    || !LOCAL_SOURCE.test(value)
  ) {
    throw new ValidationError(
      `${name} must be a bounded local source identifier`
    );
  }
  return value;
}

function assertExactKeys(value, expected, name) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length
    || actual.some((key, index) => key !== wanted[index])
  ) {
    throw new ValidationError(
      `${name} must contain exactly: ${wanted.join(', ')}`
    );
  }
}

function boundedInteger(value, name, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new ValidationError(
      `${name} must be an integer between ${minimum} and ${maximum}`
    );
  }
  return value;
}

function normalizeTimestamp(value, name) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new ValidationError(`${name} must be an ISO timestamp`);
  }
  return new Date(value).toISOString();
}

function normalizeRuntimeObservation(value) {
  return {
    external_power: booleanValue(
      value.external_power,
      'runtime.external_power'
    ),
    unmetered_network: booleanValue(
      value.unmetered_network,
      'runtime.unmetered_network'
    ),
    user_idle: booleanValue(value.user_idle, 'runtime.user_idle'),
    foreground_user_active: booleanValue(
      value.foreground_user_active,
      'runtime.foreground_user_active'
    ),
    battery_percent: boundedInteger(
      value.battery_percent,
      'runtime.battery_percent',
      0,
      100
    ),
    free_storage_bytes: boundedInteger(
      value.free_storage_bytes,
      'runtime.free_storage_bytes',
      0,
      Number.MAX_SAFE_INTEGER
    ),
    thermal_state: thermalState(value.thermal_state),
    transfer_bytes_today: boundedInteger(
      value.transfer_bytes_today,
      'runtime.transfer_bytes_today',
      0,
      Number.MAX_SAFE_INTEGER
    ),
    available_cpu_millis: boundedInteger(
      value.available_cpu_millis,
      'runtime.available_cpu_millis',
      0,
      1_000_000_000
    ),
    available_memory_bytes: boundedInteger(
      value.available_memory_bytes,
      'runtime.available_memory_bytes',
      0,
      Number.MAX_SAFE_INTEGER
    ),
    available_bandwidth_bytes_per_second: boundedInteger(
      value.available_bandwidth_bytes_per_second,
      'runtime.available_bandwidth_bytes_per_second',
      0,
      Number.MAX_SAFE_INTEGER
    )
  };
}

function thermalState(value) {
  if (!['normal', 'warm', 'hot', 'critical', 'unknown'].includes(value)) {
    throw new ValidationError('runtime.thermal_state has an invalid value');
  }
  return value;
}

function booleanValue(value, name) {
  if (typeof value !== 'boolean') {
    throw new ValidationError(`${name} must be a boolean`);
  }
  return value;
}
