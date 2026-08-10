import assert from 'node:assert/strict';
import test from 'node:test';
import {
  authorizeServiceRequest,
  ACTIVE_SERVICE_NETWORK_POLICY
} from '../src/lib/service-network-policy.mjs';

test('Gateway may call only the exact Hypervisor machine-discovery route', () => {
  const allowed = authorizeServiceRequest({
    policy: ACTIVE_SERVICE_NETWORK_POLICY,
    source: 'gateway',
    destination: 'hypervisor',
    method: 'POST',
    url: 'https://hypervisor.internal/internal/v1/machine-discovery'
  });
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.path, '/internal/v1/machine-discovery');

  assert.throws(
    () => authorizeServiceRequest({
      policy: ACTIVE_SERVICE_NETWORK_POLICY,
      source: 'gateway',
      destination: 'hypervisor',
      method: 'GET',
      url: 'https://hypervisor.internal/internal/v1/machine-discovery'
    }),
    error => error.code === 'service_network_policy_denied' && error.status === 403
  );
});
