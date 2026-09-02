import assert from 'node:assert/strict';
import test from 'node:test';
import {
  verifyLinuxEnforcementCapabilityObservation,
  collectLinuxEnforcementCapability
} from '../src/lib/linux-enforcement-capability.mjs';

const NOW = '2026-09-02T17:00:05.000Z';
const RECENT = '2026-09-02T17:00:04.000Z';

function observation(overrides = {}) {
  return {
    format: 'linux.enforcement-capability-observation.v1',
    source: 'host-local',
    observed_at: RECENT,
    systemd: {
      pid1_comm: 'systemd',
      runtime_directory_present: true,
      systemd_run_path: '/usr/bin/systemd-run',
      systemd_run_regular_file: true,
      systemd_run_executable: true
    },
    cgroup: {
      version: 2,
      controllers: ['cpu', 'memory', 'pids'],
      controllers_path: '/sys/fs/cgroup/cgroup.controllers'
    },
    kernel_release: '6.17.0-test',
    ...overrides
  };
}

test('fresh local observation establishes only prerequisite availability', () => {
  const result = verifyLinuxEnforcementCapabilityObservation(observation(), {
    asOf: NOW,
    maxAgeMs: 2_000,
    maxFutureSkewMs: 500
  });
  assert.equal(result.available, true);
  assert.equal(result.format, 'linux.enforcement-capability-verification.v1');
  assert.match(result.observation_digest, /^[a-f0-9]{64}$/);
  assert.deepEqual(result.controllers, ['cpu', 'memory', 'pids']);
  assert.equal(result.systemd_run_path, '/usr/bin/systemd-run');
  assert.equal(result.property_enforcement_proven, false);
  assert.equal(result.authority_effect, 'none');
});

test('stale and future observations fail closed', () => {
  assert.throws(() => verifyLinuxEnforcementCapabilityObservation(
    observation({ observed_at: '2026-09-02T16:59:00.000Z' }),
    { asOf: NOW, maxAgeMs: 2_000 }
  ), /stale/);
  assert.throws(() => verifyLinuxEnforcementCapabilityObservation(
    observation({ observed_at: '2026-09-02T17:00:10.000Z' }),
    { asOf: NOW, maxFutureSkewMs: 500 }
  ), /future-dated/);
});

test('non-local source or missing required controller fails closed', () => {
  assert.throws(() => verifyLinuxEnforcementCapabilityObservation(
    observation({ source: 'remote-scheduler' }), { asOf: NOW }
  ), /host-local/);
  const missing = observation();
  missing.cgroup.controllers = ['cpu', 'memory'];
  assert.throws(() => verifyLinuxEnforcementCapabilityObservation(missing, { asOf: NOW }), /pids/);
});

test('systemd or executable uncertainty fails closed', () => {
  for (const systemd of [
    { pid1_comm: 'init' },
    { runtime_directory_present: false },
    { systemd_run_regular_file: false },
    { systemd_run_executable: false },
    { systemd_run_path: '/usr/local/bin/systemd-run' }
  ]) {
    const candidate = observation();
    candidate.systemd = { ...candidate.systemd, ...systemd };
    assert.throws(() => verifyLinuxEnforcementCapabilityObservation(candidate, { asOf: NOW }));
  }
});

test('collector uses only bounded host-local file metadata and content', async () => {
  const reads = new Map([
    ['/proc/1/comm', 'systemd\n'],
    ['/sys/fs/cgroup/cgroup.controllers', 'memory cpu pids io\n'],
    ['/proc/sys/kernel/osrelease', '6.17.0-test\n']
  ]);
  const io = {
    async readFile(path) {
      if (!reads.has(path)) throw new Error(`unexpected read ${path}`);
      return reads.get(path);
    },
    async stat(path) {
      if (path === '/run/systemd/system') return { isDirectory: () => true, isFile: () => false, mode: 0o40755 };
      if (path === '/usr/bin/systemd-run') return { isDirectory: () => false, isFile: () => true, mode: 0o100755 };
      throw new Error(`unexpected stat ${path}`);
    }
  };
  const result = await collectLinuxEnforcementCapability({
    io,
    clock: () => RECENT,
    asOf: NOW,
    maxAgeMs: 2_000
  });
  assert.equal(result.available, true);
  assert.deepEqual(result.controllers, ['cpu', 'io', 'memory', 'pids']);
});

test('collector fails closed on missing systemd/cgroup primitives', async () => {
  const io = {
    async readFile(path) {
      if (path === '/proc/1/comm') return 'systemd\n';
      if (path === '/sys/fs/cgroup/cgroup.controllers') throw new Error('missing');
      if (path === '/proc/sys/kernel/osrelease') return 'kernel\n';
      throw new Error('unexpected');
    },
    async stat(path) {
      if (path === '/run/systemd/system') return { isDirectory: () => true, isFile: () => false, mode: 0o40755 };
      if (path === '/usr/bin/systemd-run') return { isDirectory: () => false, isFile: () => true, mode: 0o100755 };
      throw new Error('unexpected');
    }
  };
  await assert.rejects(() => collectLinuxEnforcementCapability({ io, clock: () => RECENT, asOf: NOW }), /unavailable/);
});
