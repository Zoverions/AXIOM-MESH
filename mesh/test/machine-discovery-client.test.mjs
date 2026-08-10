import assert from 'node:assert/strict';
import test from 'node:test';
import { createGatewayClient } from '../../packages/axiom-client/index.mjs';

test('Gateway client exposes machine discovery only through its declared same-origin route', async () => {
  const observed = [];
  const client = createGatewayClient({
    token: 'machine-discovery-client-token',
    request: async (path, options) => {
      observed.push({ path, options });
      return new Response(JSON.stringify({
        schema: 'axiom-machine-discovery.v1',
        kernel_version: '0.12.0-dev.3',
        notice: 'discovery_is_not_authorization',
        principal: { id: 'agent.fixture' },
        policy: { version: 'fixture', digest: 'a'.repeat(64), layers: [] },
        purposes: ['test.conformance'],
        destinations: ['local'],
        limits: {},
        actions: [],
        digest: 'b'.repeat(64)
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
  });

  const result = await client.call('machine_discovery.get');
  assert.equal(result.notice, 'discovery_is_not_authorization');
  assert.equal(observed[0].path, '/v1/machine-discovery');
  assert.equal(observed[0].options.method, 'GET');
  assert.equal(observed[0].options.credentials, 'same-origin');
  assert.equal(observed[0].options.redirect, 'error');
});
