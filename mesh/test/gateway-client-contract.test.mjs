import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { sha256 } from '../src/lib/canonical.mjs';
import { createGatewayClient } from '../../packages/axiom-client/index.mjs';
import {
  ACTIVE_GATEWAY_CLIENT_CONTRACT,
  validateGatewayClientContract,
  validateGatewayClientContractSchema,
  validateGatewayClientRouteImplementation
} from '../src/lib/gateway-client-contract.mjs';
import {
  CLIENT_CONTRACT_SCHEMA,
  CLIENT_KERNEL_VERSION
} from '../../packages/axiom-client/contract.mjs';

async function clientFiles() {
  const [contract, schema, source, packageJson, rootPackage, rootLock] = await Promise.all([
    readFile(new URL('../config/gateway-client-contract.json', import.meta.url), 'utf8'),
    readFile(new URL('../config/gateway-client-contract.schema.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/gateway/server.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../../packages/axiom-client/package.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../../package.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../../package-lock.json', import.meta.url), 'utf8').then(JSON.parse)
  ]);
  return {
    contract: JSON.parse(contract),
    schema: JSON.parse(schema),
    contractBytes: contract,
    schemaBytes: schema,
    source,
    packageJson,
    rootPackage,
    rootLock
  };
}

test('Gateway client contract is exact, implemented, and JSON-Schema bound', async () => {
  const files = await clientFiles();
  const result = validateGatewayClientContract(files.contract);
  const schema = validateGatewayClientContractSchema(files.schema);
  const implementation = validateGatewayClientRouteImplementation({
    contract: files.contract,
    source: files.source
  });

  assert.equal(result.valid, true);
  assert.equal(result.routes, 29);
  assert.equal(result.stable_errors, 20);
  assert.equal(schema.valid, true);
  assert.equal(implementation.implemented_routes, 29);
  assert.equal(implementation.contract_digest, result.contract_digest);
  assert.equal(ACTIVE_GATEWAY_CLIENT_CONTRACT.kernel_version, '0.12.0-dev.3');
  assert.equal(CLIENT_CONTRACT_SCHEMA, files.contract.schema);
  assert.equal(CLIENT_KERNEL_VERSION, files.contract.kernel_version);
  assert.equal(files.packageJson.version, files.contract.kernel_version);
  assert.equal(files.rootPackage.version, files.contract.kernel_version);
  assert.equal(files.rootLock.version, files.contract.kernel_version);
  assert.equal(files.rootLock.packages[''].version, files.contract.kernel_version);
  assert.equal(
    files.rootLock.packages['packages/axiom-client'].version,
    files.contract.kernel_version
  );
  assert.equal(
    files.rootLock.packages['node_modules/@axiom-mesh/client'].link,
    true
  );
});

test('Gateway client refuses absolute URLs, traversal, malformed params, and invalid body shapes', async () => {
  const calls = [];
  const client = createGatewayClient({
    token: 'test-client-token',
    request: async (path, options) => {
      calls.push({ path, options });
      return new Response(JSON.stringify({
        kernel_version: '0.12.0-dev.3',
        claim_source_digest: 'a'.repeat(64),
        runtime: {},
        capability_counts: {}
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
  });

  await assert.rejects(
    () => client.request('https://example.invalid/v1/status'),
    error => error.code === 'invalid_client_request'
  );
  await assert.rejects(
    () => client.request('/v1/../internal/v1/status'),
    error => error.code === 'invalid_client_request'
  );
  await assert.rejects(
    () => client.request('/v1/status#fragment'),
    error => error.code === 'invalid_client_request'
  );
  await assert.rejects(
    () => client.call('intents.get', {
      params: { id: 'intent/escape' }
    }),
    error => error.code === 'invalid_client_request'
  );
  await assert.rejects(
    () => client.call('intents.submit', {
      body: []
    }),
    error => error.code === 'invalid_client_request'
  );

  await client.call('status.get');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, '/v1/status');
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.credentials, 'same-origin');
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.headers.authorization, 'Bearer test-client-token');
});

test('Gateway client preserves structured errors and unknown stable codes', async () => {
  const client = createGatewayClient({
    token: 'test-client-token',
    request: async () => new Response(JSON.stringify({
      error: {
        code: 'future_policy_failure',
        message: 'A future server declined the request',
        details: { retry_after_seconds: 12 },
        trace_id: 'trace_future_1'
      }
    }), {
      status: 409,
      headers: { 'content-type': 'application/json' }
    })
  });
  await assert.rejects(
    () => client.call('status.get'),
    error => (
      error.code === 'future_policy_failure'
      && error.status === 409
      && error.traceId === 'trace_future_1'
      && error.details.retry_after_seconds === 12
    )
  );
});

test('Gateway client cancellation, timeout, body bound, and response bound fail clearly', async () => {
  const controller = new AbortController();
  controller.abort();
  const cancelled = createGatewayClient({
    token: 'test-client-token',
    request: async () => { throw new DOMException('Aborted', 'AbortError'); }
  });
  await assert.rejects(
    () => cancelled.call('status.get', { signal: controller.signal }),
    error => error.code === 'request_cancelled'
  );

  const timeout = createGatewayClient({
    token: 'test-client-token',
    defaultTimeoutMs: 1,
    request: async () => { throw new DOMException('Aborted', 'AbortError'); }
  });
  await assert.rejects(
    () => timeout.call('status.get'),
    error => error.code === 'request_timeout'
  );

  const bounded = createGatewayClient({
    token: 'test-client-token',
    request: async () => new Response('x'.repeat(2_097_153), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  });
  await assert.rejects(
    () => bounded.call('status.get'),
    error => error.code === 'response_too_large'
  );

  const localBound = createGatewayClient({ token: 'test-client-token' });
  await assert.rejects(
    () => localBound.call('intents.submit', {
      body: {
        action: 'system.echo',
        input: { text: 'x'.repeat(1_048_576) }
      }
    }),
    error => error.code === 'invalid_client_request'
  );
});

test('contract and JSON Schema hashes are stable machine-readable artifacts', async () => {
  const files = await clientFiles();
  assert.match(sha256(files.contractBytes), /^[a-f0-9]{64}$/);
  assert.match(sha256(files.schemaBytes), /^[a-f0-9]{64}$/);
  assert.equal(
    files.contract.boundary.direct_internal_service_access,
    false
  );
});

test('Gateway client contract drift fails closed before a client can use it', async () => {
  const files = await clientFiles();
  const weakened = structuredClone(files.contract);
  weakened.boundary.direct_internal_service_access = true;
  assert.throws(
    () => validateGatewayClientContract(weakened),
    /boundary is weakened/
  );
  const extraRoute = structuredClone(files.contract);
  extraRoute.routes.push({
    ...extraRoute.routes[0],
    id: 'unknown.direct',
    path: '/v1/unknown-direct'
  });
  assert.throws(
    () => validateGatewayClientContract(extraRoute),
    /route inventory|exact contract/
  );
});
