import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateObservedContribution,
  verifyHostMeasurementBundle
} from '../src/lib/host-metrics.mjs';
import { GUARDIAN_STATES } from '../src/lib/host-sovereignty.mjs';

const NOW = '2026-09-02T16:00:00.000Z';
const RECENT = '2026-09-02T15:59:59.000Z';

function record(value, source = 'fixture.local', observedAt = RECENT) {
  return { value, source, observed_at: observedAt };
}

function bundle(overrides = {}) {
  return {
    format: 'host.measurement-bundle.v1',
    measurements: {
      external_power: record(true, 'power.local'),
      unmetered_network: record(true, 'network.local'),
      user_idle: record(true, 'session.local'),
      foreground_user_active: record(false, 'session.local'),
      battery_percent: record(90, 'power.local'),
      free_storage_bytes: record(
        100 * 1024 * 1024 * 1024,
        'filesystem.local'
      ),
      thermal_state: record('normal', 'thermal.local'),
      transfer_bytes_today: record(0, 'network-accounting.local'),
      available_cpu_millis: record(1_000, 'scheduler.local'),
      available_memory_bytes: record(
        8 * 1024 * 1024 * 1024,
        'memory.local'
      ),
      available_bandwidth_bytes_per_second: record(
        10_000_000,
        'network.local'
      ),
      ...overrides
    }
  };
}

function policy() {
  return {
    format: 'contribution.policy.v1',
    enabled: true,
    allowed_roles: ['relay'],
    only_when: {
      external_power: true,
      unmetered_network: true,
      user_idle: true,
      minimum_battery_percent: 80,
      allowed_thermal_states: ['normal']
    },
    maximum: {
      cpu_millis: 100,
      memory_bytes: 512 * 1024 * 1024,
      storage_bytes: 1024 * 1024 * 1024,
      bandwidth_bytes_per_second: 625_000,
      transfer_bytes_per_day: 2 * 1024 * 1024 * 1024
    }
  };
}

function reserve() {
  return {
    format: 'resource.sovereignty-reserve.v1',
    battery_floor_percent: 50,
    free_storage_floor_bytes: 20 * 1024 * 1024 * 1024,
    foreground_user_priority: true,
    cpu_headroom_millis: 200,
    memory_headroom_bytes: 1024 * 1024 * 1024,
    bandwidth_headroom_bytes_per_second: 1_000_000,
    allowed_thermal_states: ['normal', 'warm']
  };
}

function request() {
  return {
    role: 'relay',
    resources: {
      cpu_millis: 25,
      memory_bytes: 128 * 1024 * 1024,
      storage_bytes: 0,
      bandwidth_bytes_per_second: 100_000,
      transfer_bytes: 10 * 1024 * 1024
    }
  };
}

test('fresh local measurements become a digest-bound runtime observation', () => {
  const verified = verifyHostMeasurementBundle(bundle(), {
    asOf: NOW,
    maxAgeMs: 2_000
  });
  assert.equal(verified.format, 'host.measurement-verification.v1');
  assert.equal(verified.runtime.battery_percent, 90);
  assert.equal(verified.oldest_observed_at, RECENT);
  assert.ok(/^[a-f0-9]{64}$/.test(verified.bundle_digest));
  assert.deepEqual(verified.sources, [
    'filesystem.local',
    'memory.local',
    'network-accounting.local',
    'network.local',
    'power.local',
    'scheduler.local',
    'session.local',
    'thermal.local'
  ]);
});

test('one stale measurement fails the entire host observation closed', () => {
  const input = bundle({
    battery_percent: record(
      90,
      'power.local',
      '2026-09-02T15:59:50.000Z'
    )
  });
  assert.throws(
    () => verifyHostMeasurementBundle(input, {
      asOf: NOW,
      maxAgeMs: 2_000
    }),
    /stale/
  );
});

test('future, missing, and malformed provenance is rejected', () => {
  assert.throws(
    () => verifyHostMeasurementBundle(bundle({
      battery_percent: record(
        90,
        'power.local',
        '2026-09-02T16:00:10.000Z'
      )
    }), {
      asOf: NOW,
      maxAgeMs: 2_000,
      maxFutureSkewMs: 1_000
    }),
    /future/
  );
  const missing = bundle();
  delete missing.measurements.thermal_state;
  assert.throws(
    () => verifyHostMeasurementBundle(missing, { asOf: NOW }),
    /exactly/
  );
  assert.throws(
    () => verifyHostMeasurementBundle(bundle({
      battery_percent: {
        value: 90,
        source: 'https://remote.example',
        observed_at: RECENT
      }
    }), { asOf: NOW }),
    /source/
  );
});

test('observed contribution evaluation binds decision to measurement evidence', () => {
  const result = evaluateObservedContribution({
    bundle: bundle(),
    policy: policy(),
    reserve: reserve(),
    request: request(),
    guardianState: GUARDIAN_STATES.NORMAL,
    asOf: NOW,
    maxAgeMs: 2_000
  });
  assert.equal(result.allowed, true);
  assert.equal(result.reason, 'allowed');
  assert.ok(/^[a-f0-9]{64}$/.test(result.measurement.bundle_digest));
  assert.equal(
    result.measurement.format,
    'host.measurement-verification.v1'
  );
});

test('stale measurements cannot be rescued by permissive local or remote policy', () => {
  assert.throws(
    () => evaluateObservedContribution({
      bundle: bundle({
        available_cpu_millis: record(
          1_000,
          'scheduler.local',
          '2026-09-02T15:00:00.000Z'
        )
      }),
      policy: policy(),
      reserve: reserve(),
      request: request(),
      guardianState: GUARDIAN_STATES.NORMAL,
      remoteConstraints: {
        enabled: true,
        allowed_roles: ['relay'],
        maximum: { cpu_millis: 999_999 }
      },
      asOf: NOW,
      maxAgeMs: 2_000
    }),
    /stale/
  );
});
