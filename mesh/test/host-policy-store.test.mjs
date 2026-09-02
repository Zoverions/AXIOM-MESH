import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  readHostPolicySet,
  writeHostPolicySet
} from '../src/lib/host-policy-store.mjs';

const NOW = '2026-09-02T16:00:00.000Z';

function policySet(overrides = {}) {
  return {
    format: 'host.policy-set.v1',
    revision: 1,
    updated_at: NOW,
    updated_by: 'local_owner',
    host_profile: {
      format: 'host.profile.v1',
      host_class: 'desktop',
      power_class: 'mains',
      capabilities: ['relay', 'verification']
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
    },
    ...overrides
  };
}

test('policy set round-trips through an atomic owner-local file', async t => {
  const root = await mkdtemp(join(tmpdir(), 'axiom-host-policy-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'policy.json');
  const written = await writeHostPolicySet(path, policySet());
  assert.equal(written.policy_set.format, 'host.policy-set.v1');
  assert.ok(/^[a-f0-9]{64}$/.test(written.digest));
  const loaded = await readHostPolicySet(path);
  assert.deepEqual(loaded, written);
  const raw = await readFile(path, 'utf8');
  assert.equal(raw.endsWith('\n'), true);
  if (process.platform !== 'win32') {
    assert.equal((await stat(path)).mode & 0o077, 0);
  }
});

test('corrupt, oversized, and malformed policy files fail closed', async t => {
  const root = await mkdtemp(join(tmpdir(), 'axiom-host-policy-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'policy.json');
  await writeFile(path, '{broken', 'utf8');
  await assert.rejects(() => readHostPolicySet(path), /valid JSON/);
  await writeFile(path, 'x'.repeat(70_000), 'utf8');
  await assert.rejects(() => readHostPolicySet(path), /too large/);
  await writeFile(path, JSON.stringify({ ...policySet(), surprise: true }));
  await assert.rejects(() => readHostPolicySet(path), /exactly/);
});

test('only local authorities may persist a policy revision', async t => {
  const root = await mkdtemp(join(tmpdir(), 'axiom-host-policy-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'policy.json');
  await assert.rejects(
    () => writeHostPolicySet(path, policySet({
      updated_by: 'remote_governance'
    })),
    /local authority/
  );
  await assert.rejects(
    () => writeHostPolicySet(path, policySet({
      updated_by: 'network_scheduler'
    })),
    /local authority/
  );
});

test('write refuses a revision rollback over an existing valid policy', async t => {
  const root = await mkdtemp(join(tmpdir(), 'axiom-host-policy-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'policy.json');
  await writeHostPolicySet(path, policySet({ revision: 4 }));
  await assert.rejects(
    () => writeHostPolicySet(path, policySet({ revision: 3 })),
    /revision must increase/
  );
  await assert.rejects(
    () => writeHostPolicySet(path, policySet({ revision: 4 })),
    /revision must increase/
  );
  const current = await readHostPolicySet(path);
  assert.equal(current.policy_set.revision, 4);
});

test('invalid replacement does not destroy the current valid policy', async t => {
  const root = await mkdtemp(join(tmpdir(), 'axiom-host-policy-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'policy.json');
  await writeHostPolicySet(path, policySet({ revision: 1 }));
  await assert.rejects(
    () => writeHostPolicySet(path, policySet({
      revision: 2,
      contribution_policy: { enabled: true }
    })),
    /exactly/
  );
  const loaded = await readHostPolicySet(path);
  assert.equal(loaded.policy_set.revision, 1);
});
