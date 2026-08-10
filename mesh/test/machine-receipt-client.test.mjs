import assert from 'node:assert/strict';
import test from 'node:test';
import { createGatewayClient } from '../../packages/axiom-client/index.mjs';

test('Gateway client resolves owner-scoped machine receipt verification route', async () => {
  const observed = [];
  const intentId = `intent_${'a'.repeat(64)}`;
  const client = createGatewayClient({
    token: 'machine-receipt-client-token',
    request: async (path, options) => {
      observed.push({ path, options });
      return new Response(JSON.stringify({
        schema: 'axiom-machine-intent-receipt.v1',
        statement: { schema: 'axiom-machine-intent-receipt-statement.v1' },
        attestation: { algorithm: 'Ed25519', key_id: 'grid:test', digest: 'b'.repeat(64), signature: 'fixture' },
        receipt_digest: 'c'.repeat(64)
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
  });
  const result = await client.call('machine_receipts.verify', { params: { id: intentId } });
  assert.equal(result.schema, 'axiom-machine-intent-receipt.v1');
  assert.equal(observed[0].path, `/v1/machine-receipts/intents/${intentId}/verify`);
  assert.equal(observed[0].options.method, 'GET');
  assert.equal(observed[0].options.credentials, 'same-origin');
  assert.equal(observed[0].options.redirect, 'error');
});
