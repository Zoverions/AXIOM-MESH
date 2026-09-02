import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GUARDIAN_STATES,
  evaluateContribution,
  normalizeContributionPolicy,
  normalizeHostProfile,
  normalizeSovereigntyReserve,
  transitionGuardianState
} from '../src/lib/host-sovereignty.mjs';

function policy(overrides = {}) {
  return {
    format: 'contribution.policy.v1',
    enabled: true,
    allowed_roles: ['encrypted_cache', 'relay', 'verification'],
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
      storage_bytes: 5 * 1024 * 1024 * 1024,
      bandwidth_bytes_per_second: 625_000,
      transfer_bytes_per_day: 2 * 1024 * 1024 * 1024
    },
    ...overrides
  };
}

function reserve(overrides = {}) {
  return {
    format: 'resource.sovereignty-reserve.v1',
    battery_floor_percent: 50,
    free_storage_floor_bytes: 20 * 1024 * 1024 * 1024,
    foreground_user_priority: true,
    cpu_headroom_millis: 200,
    memory_headroom_bytes: 1024 * 1024 * 1024,
    bandwidth_headroom_bytes_per_second: 1_000_000,
    allowed_thermal_states: ['normal', 'warm'],
    ...overrides
  };
}

function runtime(overrides = {}) {
  return {
    external_power: true,
    unmetered_network: true,
    user_idle: true,
    foreground_user_active: false,
    battery_percent: 90,
    free_storage_bytes: 100 * 1024 * 1024 * 1024,
    thermal_state: 'normal',
    transfer_bytes_today: 0,
    available_cpu_millis: 1_000,
    available_memory_bytes: 8 * 1024 * 1024 * 1024,
    available_bandwidth_bytes_per_second: 10_000_000,
    ...overrides
  };
}

function request(overrides = {}) {
  return {
    role: 'relay',
    resources: {
      cpu_millis: 25,
      memory_bytes: 128 * 1024 * 1024,
      storage_bytes: 0,
      bandwidth_bytes_per_second: 100_000,
      transfer_bytes: 10 * 1024 * 1024
    },
    ...overrides
  };
}

test('contribution is default deny without explicit local enablement', () => {
  const result = evaluateContribution({
    policy: policy({ enabled: false }),
    reserve: reserve(),
    runtime: runtime(),
    request: request(),
    guardianState: GUARDIAN_STATES.NORMAL
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'local_contribution_disabled');
});

test('normal host allows a locally granted role inside all resource reserves', () => {
  const result = evaluateContribution({
    policy: policy(),
    reserve: reserve(),
    runtime: runtime(),
    request: request(),
    guardianState: GUARDIAN_STATES.NORMAL
  });
  assert.equal(result.allowed, true);
  assert.equal(result.reason, 'allowed');
});

test('guardian degraded, quarantined, and recovery states stop outward contribution', () => {
  for (const state of [
    GUARDIAN_STATES.DEGRADED,
    GUARDIAN_STATES.QUARANTINED,
    GUARDIAN_STATES.RECOVERY
  ]) {
    const result = evaluateContribution({
      policy: policy(),
      reserve: reserve(),
      runtime: runtime(),
      request: request(),
      guardianState: state
    });
    assert.equal(result.allowed, false);
    assert.equal(result.reason, 'guardian_not_normal');
  }
});

test('local conditions and sovereignty reserve always win', () => {
  const cases = [
    [runtime({ external_power: false }), 'external_power_required'],
    [runtime({ unmetered_network: false }), 'unmetered_network_required'],
    [runtime({ user_idle: false }), 'user_idle_required'],
    [runtime({ foreground_user_active: true }), 'foreground_user_priority'],
    [runtime({ battery_percent: 79 }), 'battery_condition_unsatisfied'],
    [runtime({ battery_percent: 49 }), 'battery_reserve'],
    [
      runtime({ free_storage_bytes: 19 * 1024 * 1024 * 1024 }),
      'storage_reserve'
    ],
    [runtime({ available_cpu_millis: 224 }), 'cpu_reserve'],
    [
      runtime({ available_memory_bytes: (1024 + 127) * 1024 * 1024 }),
      'memory_reserve'
    ],
    [
      runtime({ available_bandwidth_bytes_per_second: 1_099_999 }),
      'bandwidth_reserve'
    ],
    [runtime({ thermal_state: 'hot' }), 'thermal_reserve']
  ];
  for (const [state, reason] of cases) {
    const result = evaluateContribution({
      policy: policy(),
      reserve: reserve(),
      runtime: state,
      request: request(),
      guardianState: GUARDIAN_STATES.NORMAL
    });
    assert.equal(result.allowed, false, reason);
    assert.equal(result.reason, reason);
  }
});

test('roles and every declared resource ceiling fail closed', () => {
  assert.equal(evaluateContribution({
    policy: policy(),
    reserve: reserve(),
    runtime: runtime(),
    request: request({ role: 'compute' }),
    guardianState: GUARDIAN_STATES.NORMAL
  }).reason, 'role_not_granted');
  const fields = [
    ['cpu_millis', 101],
    ['memory_bytes', 513 * 1024 * 1024],
    ['storage_bytes', 6 * 1024 * 1024 * 1024],
    ['bandwidth_bytes_per_second', 626_000]
  ];
  for (const [field, value] of fields) {
    const req = request({
      resources: { ...request().resources, [field]: value }
    });
    assert.equal(evaluateContribution({
      policy: policy(),
      reserve: reserve(),
      runtime: runtime(),
      request: req,
      guardianState: GUARDIAN_STATES.NORMAL
    }).reason, 'resource_limit_exceeded');
  }
  const transfer = request({
    resources: {
      ...request().resources,
      transfer_bytes: 3 * 1024 * 1024 * 1024
    }
  });
  assert.equal(evaluateContribution({
    policy: policy(),
    reserve: reserve(),
    runtime: runtime(),
    request: transfer,
    guardianState: GUARDIAN_STATES.NORMAL
  }).reason, 'daily_transfer_limit_exceeded');
});

test('remote constraints can only narrow local permission, never widen it', () => {
  const denied = evaluateContribution({
    policy: policy({ enabled: false }),
    reserve: reserve(),
    runtime: runtime(),
    request: request(),
    guardianState: GUARDIAN_STATES.NORMAL,
    remoteConstraints: {
      enabled: true,
      allowed_roles: ['relay'],
      maximum: { cpu_millis: 9999 }
    }
  });
  assert.equal(denied.allowed, false);
  assert.equal(denied.reason, 'local_contribution_disabled');

  const narrowedRole = evaluateContribution({
    policy: policy(),
    reserve: reserve(),
    runtime: runtime(),
    request: request(),
    guardianState: GUARDIAN_STATES.NORMAL,
    remoteConstraints: {
      enabled: true,
      allowed_roles: ['verification']
    }
  });
  assert.equal(narrowedRole.reason, 'remote_constraint_denied');

  const narrowedCpu = evaluateContribution({
    policy: policy(),
    reserve: reserve(),
    runtime: runtime(),
    request: request(),
    guardianState: GUARDIAN_STATES.NORMAL,
    remoteConstraints: { maximum: { cpu_millis: 10 } }
  });
  assert.equal(narrowedCpu.reason, 'remote_constraint_denied');
});

test('guardian transitions are local-only, bounded, and contain no remote wipe state', () => {
  assert.deepEqual(
    Object.values(GUARDIAN_STATES),
    ['NORMAL', 'DEGRADED', 'QUARANTINED', 'RECOVERY']
  );
  assert.equal(transitionGuardianState({
    current: 'NORMAL',
    next: 'DEGRADED',
    authority: 'local_guardian'
  }).state, 'DEGRADED');
  assert.throws(
    () => transitionGuardianState({
      current: 'NORMAL',
      next: 'RECOVERY',
      authority: 'remote_governance'
    }),
    /local authority/
  );
  assert.throws(
    () => transitionGuardianState({
      current: 'NORMAL',
      next: 'WIPE',
      authority: 'local_owner'
    }),
    /guardian state/
  );
  assert.throws(
    () => transitionGuardianState({
      current: 'NORMAL',
      next: 'RECOVERY',
      authority: 'local_owner'
    }),
    /transition/
  );
});

test('host, policy, and reserve contracts are name-neutral and malformed input fails closed', () => {
  const host = normalizeHostProfile({
    format: 'host.profile.v1',
    host_class: 'desktop',
    power_class: 'mains',
    capabilities: ['relay', 'verification']
  });
  assert.equal(host.format, 'host.profile.v1');
  assert.deepEqual(host.capabilities, ['relay', 'verification']);
  assert.equal(
    normalizeContributionPolicy(policy()).format,
    'contribution.policy.v1'
  );
  assert.equal(
    normalizeSovereigntyReserve(reserve()).format,
    'resource.sovereignty-reserve.v1'
  );
  assert.throws(() => normalizeContributionPolicy({}), /exactly/);
  assert.throws(
    () => normalizeContributionPolicy({ ...policy(), enable: true }),
    /exactly/
  );
  assert.throws(
    () => evaluateContribution({
      policy: {},
      reserve: reserve(),
      runtime: runtime(),
      request: request(),
      guardianState: 'NORMAL'
    }),
    /exactly/
  );
  assert.equal(evaluateContribution({
    policy: policy(),
    reserve: reserve(),
    runtime: runtime(),
    request: request(),
    guardianState: 'NORMAL',
    remoteConstraints: {
      maximum: { cpu_millis: 10, gpu_units: 2 }
    }
  }).reason, 'remote_constraint_invalid');
});
