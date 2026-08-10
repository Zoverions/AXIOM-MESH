import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACTIVE_SERVICE_NETWORK_POLICY,
  authorizeServiceRequest
} from '../src/lib/service-network-policy.mjs';

test('Gateway may call only the exact Grid machine-receipt verification route', () => {
  const intentId = `intent_${'a'.repeat(64)}`;
  const allowed = authorizeServiceRequest({
    policy: ACTIVE_SERVICE_NETWORK_POLICY,
    source: 'gateway',
    destination: 'grid',
    method: 'GET',
    url: `https://grid.internal/internal/v1/machine-receipts/intents/${intentId}/verify`
  });
  assert.equal(allowed.allowed, true);
  assert.equal(
    allowed.path,
    `/internal/v1/machine-receipts/intents/${intentId}/verify`
  );

  assert.throws(
    () => authorizeServiceRequest({
      policy: ACTIVE_SERVICE_NETWORK_POLICY,
      source: 'gateway',
      destination: 'grid',
      method: 'POST',
      url: `https://grid.internal/internal/v1/machine-receipts/intents/${intentId}/verify`
    }),
    error => error.code === 'service_network_policy_denied' && error.status === 403
  );
});
