import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compileLinuxResourceEnforcement,
  prepareLinuxResourceEnforcement
} from '../src/lib/linux-resource-enforcement.mjs';

const MEASUREMENT_DIGEST = 'a'.repeat(64);

function decision(overrides = {}) {
  return {
    allowed: true,
    reason: 'allowed',
    role: 'verification',
    guardian_state: 'NORMAL',
    policy_revision: 7,
    measurement: {
      format: 'host.measurement-verification.v1',
      bundle_digest: MEASUREMENT_DIGEST,
      oldest_observed_at: '2026-09-02T16:00:00.000Z',
      newest_observed_at: '2026-09-02T16:00:01.000Z',
      sources: ['cpu.local', 'memory.local']
    },
    ...overrides
  };
}

function request(overrides = {}) {
  return {
    role: 'verification',
    resources: {
      cpu_millis: 250,
      memory_bytes: 268_435_456,
      storage_bytes: 0,
      bandwidth_bytes_per_second: 0,
      transfer_bytes: 0,
      ...(overrides.resources ?? {})
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'resources'))
  };
}

test('compiler binds an allowed Guardian decision to exact systemd/cgroup limits', () => {
  const output = compileLinuxResourceEnforcement({
    decision: decision(),
    request: request(),
    lease_seconds: 60,
    pids_max: 32
  });
  assert.equal(output.format, 'linux.resource-enforcement.v1');
  assert.equal(output.backend, 'systemd-cgroup-v2');
  assert.equal(output.executable, '/usr/bin/systemd-run');
  assert.match(output.unit_name, /^mesh-contribution-[a-f0-9]{24}\.scope$/);
  assert.ok(output.argv_prefix.includes('--property=CPUQuota=25%'));
  assert.ok(output.argv_prefix.includes('--property=MemoryMax=268435456'));
  assert.ok(output.argv_prefix.includes('--property=TasksMax=32'));
  assert.ok(output.argv_prefix.includes('--property=RuntimeMaxSec=60'));
  assert.equal(output.argv_prefix.at(-1), '--');
  assert.equal(output.guardian.measurement_digest, MEASUREMENT_DIGEST);
  assert.equal(output.guardian.policy_revision, 7);
  assert.equal(output.guardian.guardian_state, 'NORMAL');
  assert.equal(output.requires_effect_boundary_recheck, true);
  assert.equal(output.mesh_authority_granted, false);
  assert.equal(output.command_caller_supplied, false);
});

test('compiler refuses denied, non-normal, mismatched, or unbound Guardian decisions', () => {
  assert.throws(
    () => compileLinuxResourceEnforcement({
      decision: decision({ allowed: false, reason: 'locally_paused' }),
      request: request(),
      lease_seconds: 60,
      pids_max: 32
    }),
    /allowed Guardian decision/
  );
  assert.throws(
    () => compileLinuxResourceEnforcement({
      decision: decision({ guardian_state: 'DEGRADED' }),
      request: request(),
      lease_seconds: 60,
      pids_max: 32
    }),
    /NORMAL/
  );
  assert.throws(
    () => compileLinuxResourceEnforcement({
      decision: decision({ role: 'relay' }),
      request: request(),
      lease_seconds: 60,
      pids_max: 32
    }),
    /role must match/
  );
  const unbound = decision();
  delete unbound.measurement.bundle_digest;
  assert.throws(
    () => compileLinuxResourceEnforcement({
      decision: unbound,
      request: request(),
      lease_seconds: 60,
      pids_max: 32
    }),
    /measurement digest/
  );
});

test('unenforced network, transfer, and storage resources fail closed', () => {
  for (const resources of [
    { bandwidth_bytes_per_second: 1 },
    { transfer_bytes: 1 },
    { storage_bytes: 1 }
  ]) {
    assert.throws(
      () => compileLinuxResourceEnforcement({
        decision: decision(),
        request: request({ resources }),
        lease_seconds: 60,
        pids_max: 32
      }),
      /not yet enforceable/
    );
  }
});

test('compiler rejects caller attempts to smuggle command or backend selection', () => {
  assert.throws(
    () => compileLinuxResourceEnforcement({
      decision: decision(),
      request: request(),
      lease_seconds: 60,
      pids_max: 32,
      executable: '/bin/sh'
    }),
    /unknown fields/
  );
  assert.throws(
    () => compileLinuxResourceEnforcement({
      decision: decision(),
      request: request(),
      lease_seconds: 60,
      pids_max: 32,
      argv: ['-c', 'id']
    }),
    /unknown fields/
  );
});

test('CPU conversion remains bounded and exact for fractional percentages', () => {
  const output = compileLinuxResourceEnforcement({
    decision: decision(),
    request: request({ resources: { cpu_millis: 25 } }),
    lease_seconds: 5,
    pids_max: 1
  });
  assert.ok(output.argv_prefix.includes('--property=CPUQuota=2.5%'));
});

test('prepare path asks Guardian for the exact request and compiles only a local allow', async () => {
  let observed;
  const guardian = {
    async evaluate(input) {
      observed = input;
      return decision();
    }
  };
  const requested = request();
  const remoteConstraints = { maximum: { cpu_millis: 300 } };
  const output = await prepareLinuxResourceEnforcement({
    guardian,
    request: requested,
    remoteConstraints,
    lease_seconds: 30,
    pids_max: 16
  });
  assert.deepEqual(observed, { request: requested, remoteConstraints });
  assert.equal(output.allowed, true);
  assert.equal(output.enforcement.executable, '/usr/bin/systemd-run');
});

test('prepare path preserves Guardian denial and produces no enforcement descriptor', async () => {
  const guardian = {
    async evaluate() {
      return { allowed: false, reason: 'battery_reserve', guardian_state: 'NORMAL' };
    }
  };
  const output = await prepareLinuxResourceEnforcement({
    guardian,
    request: request(),
    lease_seconds: 30,
    pids_max: 16
  });
  assert.deepEqual(output, {
    allowed: false,
    reason: 'battery_reserve',
    guardian_state: 'NORMAL'
  });
});
