import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeContributionPolicy } from '../src/lib/host-sovereignty.mjs';
import {
  NODE_ZERO_DEFAULT_CONTRIBUTION_POLICY,
  NODE_ZERO_GUARDIAN_SERVICE,
  persistNodeZeroGuardianSnapshot
} from '../src/host-guardian-service.mjs';

test('Node Zero shared contribution is disabled with no roles and zero ceilings', () => {
  const normalized = normalizeContributionPolicy(
    NODE_ZERO_DEFAULT_CONTRIBUTION_POLICY
  );
  assert.equal(normalized.enabled, false);
  assert.deepEqual(normalized.allowed_roles, []);
  assert.deepEqual(normalized.maximum, {
    cpu_millis: 0,
    memory_bytes: 0,
    storage_bytes: 0,
    bandwidth_bytes_per_second: 0,
    transfer_bytes_per_day: 0
  });
  assert.equal(Object.isFrozen(NODE_ZERO_DEFAULT_CONTRIBUTION_POLICY), true);
  assert.equal(Object.isFrozen(NODE_ZERO_DEFAULT_CONTRIBUTION_POLICY.allowed_roles), true);
  assert.equal(Object.isFrozen(NODE_ZERO_DEFAULT_CONTRIBUTION_POLICY.only_when), true);
  assert.equal(Object.isFrozen(NODE_ZERO_DEFAULT_CONTRIBUTION_POLICY.only_when.allowed_thermal_states), true);
  assert.equal(Object.isFrozen(NODE_ZERO_DEFAULT_CONTRIBUTION_POLICY.maximum), true);
});

test('Node Zero Guardian service is local-only and cannot broaden authority', () => {
  assert.deepEqual(NODE_ZERO_GUARDIAN_SERVICE, {
    service_id: 'axiom-host-guardian',
    policy_root: '/etc/axiom/host',
    status_root: '/run/axiom/status',
    state_root: '/var/lib/axiom/guardian',
    mesh_credentials: false,
    listeners: [],
    external_network_calls: false,
    policy_broadening: false,
    authority_effect: 'none'
  });
  assert.equal(Object.isFrozen(NODE_ZERO_GUARDIAN_SERVICE), true);
  assert.equal(Object.isFrozen(NODE_ZERO_GUARDIAN_SERVICE.listeners), true);
});

test('Node Zero Guardian persists only fixed local health and evidence artifacts', async () => {
  const writes = [];
  const result = await persistNodeZeroGuardianSnapshot({
    health: {
      guardian_state: 'DEGRADED',
      reason: 'measurement_unavailable'
    },
    evidence: {
      authority_effect: 'none',
      external_network_calls: false
    },
    writeAtomic: async (path, value) => {
      writes.push([path, value]);
    }
  });

  assert.deepEqual(writes.map(([path]) => path), [
    '/run/axiom/status/guardian-health.json',
    '/var/lib/axiom/guardian/guardian-evidence.json'
  ]);
  assert.equal(result.status_path, '/run/axiom/status/guardian-health.json');
  assert.equal(result.evidence_path, '/var/lib/axiom/guardian/guardian-evidence.json');
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.network_effect, 'none');
  assert.equal(result.mesh_credentials_used, false);
});

test('Node Zero Guardian rejects a non-file persistence boundary', async () => {
  await assert.rejects(
    persistNodeZeroGuardianSnapshot({
      health: {},
      evidence: {},
      writeAtomic: null
    }),
    /writeAtomic/
  );
});
