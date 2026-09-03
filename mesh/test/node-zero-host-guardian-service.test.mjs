import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeContributionPolicy } from '../src/lib/host-sovereignty.mjs';
import {
  NODE_ZERO_DEFAULT_CONTRIBUTION_POLICY,
  NODE_ZERO_GUARDIAN_SERVICE
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
  assert.equal(Object.isFrozen(NODE_ZERO_DEFAULT_CONTRIBUTION_POLICY), true);
});
