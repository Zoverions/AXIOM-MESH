import assert from 'node:assert/strict';
import test from 'node:test';

import { GatewayClient, GatewayClientError } from '../../packages/axiom-client/index.mjs';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

test('Gateway client exposes only contract-owned social publication_limit query', async () => {
  const requests = [];
  const client = new GatewayClient({
    token: 'social-client-token',
    request: async (target, options) => {
      requests.push({ target, options });
      return jsonResponse({
        schema: 'axiom-local-social-snapshot.v1',
        owner: 'principal-social-client',
        actors: [],
        personas: [],
        corpus: { publications: [], transitions: [], truncated: false },
        network_effect: 'none'
      });
    }
  });

  const snapshot = await client.call('social.get', {
    query: { publication_limit: 25 }
  });
  assert.equal(snapshot.owner, 'principal-social-client');
  assert.equal(snapshot.network_effect, 'none');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].target, '/v1/social?publication_limit=25');
  assert.equal(requests[0].options.method, 'GET');

  await assert.rejects(
    () => client.call('social.get', {
      query: { owner: 'principal-other' }
    }),
    error => (
      error instanceof GatewayClientError
      && error.code === 'invalid_client_request'
      && /not allowed: owner/.test(error.message)
    )
  );
  assert.equal(requests.length, 1);
});

test('Gateway client rejects social request bodies and idempotency keys', async () => {
  let invoked = false;
  const client = new GatewayClient({
    token: 'social-client-token',
    request: async () => {
      invoked = true;
      return jsonResponse({});
    }
  });

  await assert.rejects(
    () => client.call('social.get', { body: {} }),
    error => error instanceof GatewayClientError && error.code === 'invalid_client_request'
  );
  await assert.rejects(
    () => client.call('social.get', { idempotencyKey: 'social-client-key-0001' }),
    error => error instanceof GatewayClientError && error.code === 'invalid_client_request'
  );
  assert.equal(invoked, false);
});
