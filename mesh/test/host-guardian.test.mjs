import assert from 'node:assert/strict';
import test from 'node:test';
import { GUARDIAN_STATES } from '../src/lib/host-sovereignty.mjs';
import { HostGuardian } from '../src/lib/host-guardian.mjs';

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

function policySet() {
  return {
    format: 'host.policy-set.v1',
    revision: 3,
    updated_at: NOW,
    updated_by: 'local_owner',
    host_profile: {
      format: 'host.profile.v1',
      host_class: 'desktop',
      power_class: 'mains',
      capabilities: ['relay']
    },
    contribution_policy: {
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
    },
    sovereignty_reserve: {
      format: 'resource.sovereignty-reserve.v1',
      battery_floor_percent: 50,
      free_storage_floor_bytes: 20 * 1024 * 1024 * 1024,
      foreground_user_priority: true,
      cpu_headroom_millis: 200,
      memory_headroom_bytes: 1024 * 1024 * 1024,
      bandwidth_headroom_bytes_per_second: 1_000_000,
      allowed_thermal_states: ['normal', 'warm']
    }
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

test('guardian obtains its own policy and measurements before allowing contribution', async () => {
  let policyReads = 0;
  let measurementReads = 0;
  const guardian = new HostGuardian({
    policyProvider: async () => {
      policyReads += 1;
      return policySet();
    },
    measurementProvider: async () => {
      measurementReads += 1;
      return bundle();
    },
    clock: () => NOW,
    maxAgeMs: 2_000
  });
  const result = await guardian.evaluate({ request: request() });
  assert.equal(result.allowed, true);
  assert.equal(result.guardian_state, GUARDIAN_STATES.NORMAL);
  assert.equal(result.policy_revision, 3);
  assert.ok(/^[a-f0-9]{64}$/.test(result.measurement.bundle_digest));
  assert.equal(policyReads, 1);
  assert.equal(measurementReads, 1);
});

test('caller cannot inject runtime measurements or local policy', async () => {
  const guardian = new HostGuardian({
    policyProvider: async () => policySet(),
    measurementProvider: async () => bundle(),
    clock: () => NOW,
    maxAgeMs: 2_000
  });
  await assert.rejects(
    () => guardian.evaluate({
      request: request(),
      runtime: { battery_percent: 100 },
      policy: { enabled: true }
    }),
    /unknown fields/
  );
});

test('measurement or policy provider failure fails closed', async () => {
  const badMetrics = new HostGuardian({
    policyProvider: async () => policySet(),
    measurementProvider: async () => {
      throw new Error('sensor offline');
    },
    clock: () => NOW
  });
  const first = await badMetrics.evaluate({ request: request() });
  assert.equal(first.allowed, false);
  assert.equal(first.reason, 'measurement_unavailable');

  const badPolicy = new HostGuardian({
    policyProvider: async () => {
      throw new Error('disk corrupt');
    },
    measurementProvider: async () => bundle(),
    clock: () => NOW
  });
  const second = await badPolicy.evaluate({ request: request() });
  assert.equal(second.allowed, false);
  assert.equal(second.reason, 'policy_unavailable');
});

test('local pause is immediate and remote actors cannot resume or transition state', async () => {
  const guardian = new HostGuardian({
    policyProvider: async () => policySet(),
    measurementProvider: async () => bundle(),
    clock: () => NOW,
    maxAgeMs: 2_000
  });
  guardian.pause('local_owner');
  assert.equal(
    (await guardian.evaluate({ request: request() })).reason,
    'locally_paused'
  );
  assert.throws(
    () => guardian.resume('network_scheduler'),
    /local authority/
  );
  assert.throws(
    () => guardian.transition('QUARANTINED', 'remote_governance'),
    /local authority/
  );
  guardian.resume('local_owner');
  assert.equal((await guardian.evaluate({ request: request() })).allowed, true);
  guardian.transition('QUARANTINED', 'local_guardian');
  assert.equal(
    (await guardian.evaluate({ request: request() })).reason,
    'guardian_not_normal'
  );
});

test('remote constraints can narrow but cannot make the guardian bypass local state', async () => {
  const guardian = new HostGuardian({
    policyProvider: async () => policySet(),
    measurementProvider: async () => bundle(),
    clock: () => NOW,
    maxAgeMs: 2_000
  });
  const narrowed = await guardian.evaluate({
    request: request(),
    remoteConstraints: { maximum: { cpu_millis: 10 } }
  });
  assert.equal(narrowed.reason, 'remote_constraint_denied');
  guardian.pause('local_owner');
  const attemptedWiden = await guardian.evaluate({
    request: request(),
    remoteConstraints: {
      enabled: true,
      allowed_roles: ['relay'],
      maximum: { cpu_millis: 999_999 }
    }
  });
  assert.equal(attemptedWiden.reason, 'locally_paused');
});
