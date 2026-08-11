import assert from 'node:assert/strict';
import test from 'node:test';

import { createGatewayClient } from '../../packages/axiom-client/index.mjs';

function contextBinding() {
  return {
    schema: 'axiom-context-task-binding.v1',
    view_digest: '1'.repeat(64),
    projection_digest: '2'.repeat(64),
    authority_digest: '3'.repeat(64),
    receipt_digest: '4'.repeat(64),
    projection_receipt: {
      schema: 'axiom-context-projection-receipt.v1',
      statement: {
        schema: 'axiom-context-projection-receipt-statement.v1',
        principal: 'owner.client-context',
        purpose: 'project.execution',
        owner: 'owner.client-context',
        as_of: '2026-08-11T22:00:00.000Z',
        view_digest: '1'.repeat(64),
        projection_digest: '2'.repeat(64),
        authority_digest: '3'.repeat(64),
        projected_context_scopes: ['context:project'],
        grid: {
          last_seq: 7,
          last_hash: '5'.repeat(64),
          verification_mode: 'full'
        },
        authority_effect: 'none'
      },
      attestation: {
        algorithm: 'Ed25519',
        key_id: 'grid:test',
        digest: '6'.repeat(64),
        signature: 'signed_projection_receipt'
      },
      receipt_digest: '4'.repeat(64)
    }
  };
}

test('Gateway client serializes a bounded context task binding unchanged', async () => {
  let observed;
  const binding = contextBinding();
  const client = createGatewayClient({
    token: 'context-client-boundary-token',
    request: async (path, options) => {
      observed = { path, options };
      return jsonResponse({
        intent_id: `intent_${'a'.repeat(64)}`,
        trace_id: 'trace-context-client-001',
        status: 'completed',
        evidence: {}
      });
    }
  });

  const result = await client.call('intents.submit', {
    body: {
      action: 'system.echo',
      input: { message: 'context-bound' },
      purpose: 'project.execution',
      context_binding: binding
    },
    idempotencyKey: 'context-client-intent-0001'
  });

  assert.equal(result.status, 'completed');
  assert.equal(observed.path, '/v1/intents');
  assert.deepEqual(JSON.parse(observed.options.body).context_binding, binding);
});

test('Gateway client rejects an authority-bearing context receipt before network I/O', async () => {
  let called = false;
  const binding = contextBinding();
  binding.projection_receipt.statement.authority_effect = 'grant';
  const client = createGatewayClient({
    token: 'context-client-invalid-token',
    request: async () => {
      called = true;
      return jsonResponse({});
    }
  });

  await assert.rejects(
    () => client.call('intents.submit', {
      body: {
        action: 'system.echo',
        purpose: 'project.execution',
        context_binding: binding
      },
      idempotencyKey: 'context-client-intent-0002'
    }),
    error => error.code === 'invalid_client_request'
  );
  assert.equal(called, false);
});

test('Gateway client rejects context projections without the signed projection receipt', async () => {
  const client = createGatewayClient({
    token: 'context-client-response-token',
    request: async () => jsonResponse({
      schema: 'axiom-context-projection.v1',
      principal: 'owner.client-context',
      purpose: 'project.execution',
      usable_claims: [],
      conflicts: [],
      view_digest: '1'.repeat(64),
      authorization: {},
      projection_digest: '2'.repeat(64)
    })
  });

  await assert.rejects(
    () => client.call('context.view', {
      query: { purpose: 'project.execution' }
    }),
    error => error.code === 'invalid_gateway_response'
  );
});

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}
