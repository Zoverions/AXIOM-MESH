import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { checkGatewayClientContract } from '../src/check-gateway-client-contract.mjs';
import {
  ACTIVE_GATEWAY_CLIENT_CONTRACT,
  validateGatewayClientContract,
  validateGatewayClientRouteImplementation
} from '../src/lib/gateway-client-contract.mjs';
import {
  createGatewayClient,
  GatewayClientError
} from '../../packages/axiom-client/index.mjs';
import { startDevelopmentStack } from '../src/dev.mjs';
import { reserveProductionPortBlock } from '../src/lib/production-host.mjs';

test('current Gateway client contract is exact and covers every authenticated route', async () => {
  const result = await checkGatewayClientContract();
  assert.equal(result.valid, true);
  assert.equal(result.schema, 'axiom-gateway-client-contract.v1');
  assert.equal(result.kernel_version, '0.12.0-dev.3');
  assert.equal(result.routes, 30);
  assert.equal(result.implemented_routes, 30);
  assert.equal(result.stable_errors, 20);
  assert.equal(result.schema_definitions, 4);
  assert.equal(result.same_origin_only, true);
  assert.equal(result.direct_service_access, false);
  assert.match(result.contract_digest, /^[a-f0-9]{64}$/);
  assert.match(result.json_schema_digest, /^[a-f0-9]{64}$/);
});

test('Gateway client emits only contract-owned relative requests', async () => {
  const observed = [];
  const client = createGatewayClient({
    token: () => 'fixture-token-in-memory',
    request: async (path, options) => {
      observed.push({ path, options });
      return jsonResponse({
        schema: 'axiom-capabilities.v1',
        kernel_version: '0.12.0-dev.3',
        capabilities: [],
        digest: 'a'.repeat(64)
      });
    }
  });
  const result = await client.call('capabilities.list', {
    traceId: 'client-trace-001'
  });
  assert.equal(result.kernel_version, '0.12.0-dev.3');
  assert.equal(observed.length, 1);
  assert.equal(observed[0].path, '/v1/capabilities');
  assert.equal(observed[0].path.includes('://'), false);
  assert.equal(observed[0].options.method, 'GET');
  assert.equal(observed[0].options.credentials, 'same-origin');
  assert.equal(observed[0].options.redirect, 'error');
  assert.equal(observed[0].options.headers.authorization, 'Bearer fixture-token-in-memory');
  assert.equal(observed[0].options.headers['x-trace-id'], 'client-trace-001');

  assert.throws(
    () => createGatewayClient({
      token: 'fixture-token-in-memory',
      contract: { routes: [{ id: 'escape', path: '/v1/escape' }] }
    }),
    error => error.code === 'invalid_client_request'
  );
});

test('Gateway client invokes browser fetch without an object receiver', async () => {
  let receiver;
  const client = createGatewayClient({
    token: 'browser-fetch-binding-token',
    request: function request() {
      receiver = this;
      return Promise.resolve(jsonResponse({
        kernel_version: '0.12.0-dev.3',
        claim_source_digest: 'a'.repeat(64),
        runtime: {},
        capability_counts: {}
      }));
    }
  });
  await client.call('status.get');
  assert.equal(receiver, undefined);
});

test('Gateway client binds intent schema and idempotency to one effect route', async () => {
  let observed;
  const client = createGatewayClient({
    token: 'intent-fixture-token',
    request: async (path, options) => {
      observed = { path, options };
      return jsonResponse({
        intent_id: `intent_${'a'.repeat(64)}`,
        trace_id: 'trace-intent-client-001',
        status: 'completed',
        evidence: { event_ids: ['evt_1'] }
      });
    }
  });
  const result = await client.call('intents.submit', {
    body: {
      action: 'system.echo',
      input: { message: 'hello' },
      purpose: 'client-test',
      data_scopes: ['memory:item'],
      confirmations: [],
      approval_ids: []
    },
    idempotencyKey: 'client-intent-0000001'
  });
  assert.equal(result.status, 'completed');
  assert.equal(observed.path, '/v1/intents');
  assert.equal(observed.options.method, 'POST');
  assert.equal(observed.options.headers['idempotency-key'], 'client-intent-0000001');
  assert.deepEqual(JSON.parse(observed.options.body), {
    action: 'system.echo',
    input: { message: 'hello' },
    purpose: 'client-test',
    data_scopes: ['memory:item'],
    confirmations: [],
    approval_ids: []
  });

  await assert.rejects(
    () => client.call('intents.submit', {
      body: { action: 'system.echo', extra: true },
      idempotencyKey: 'client-intent-0000002'
    }),
    error => error.code === 'invalid_client_request'
  );
  await assert.rejects(
    () => client.call('intents.submit', {
      body: { action: 'system.echo' }
    }),
    error => error.code === 'invalid_client_request'
  );
});

test('Gateway client encodes exact path and query inventories', async () => {
  const observed = [];
  const client = createGatewayClient({
    token: 'route-fixture-token',
    request: async (path, options) => {
      observed.push({ path, options });
      if (path.startsWith('/v1/events')) return jsonResponse({ events: [] });
      if (path.startsWith('/v1/intents/')) {
        return jsonResponse({
          intent_id: 'intent_route_fixture',
          principal: 'person:route',
          status: 'completed'
        });
      }
      if (path.startsWith('/v1/capsules')) return jsonResponse({ capsules: [] });
      if (path.startsWith('/v1/proposals')) return jsonResponse({ proposals: [] });
      if (path.startsWith('/v1/nodes')) return jsonResponse({ nodes: [] });
      if (path.startsWith('/v1/node-discovery')) {
        return jsonResponse({ nodes: [], attestation: {} });
      }
      if (path.startsWith('/v1/context')) {
        return jsonResponse({
          schema: 'axiom-context-projection.v1',
          principal: 'person:route',
          purpose: 'project.execution',
          usable_claims: [],
          conflicts: [],
          view_digest: 'a'.repeat(64),
          authorization: {},
          projection_digest: 'b'.repeat(64),
          projection_receipt: {}
        });
      }
      return jsonResponse({});
    }
  });
  await client.call('events.list', {
    query: { actor: 'person:route', after: 4, limit: 20 }
  });
  await client.call('intents.get', { params: { id: 'intent_route_fixture' } });
  await client.call('capsules.list', { query: { limit: 2 } });
  await client.call('proposals.list', { query: { limit: 3 } });
  await client.call('nodes.list', { query: { limit: 4 } });
  await client.call('context.view', {
    query: { purpose: 'project.execution', max_claims: 5 }
  });
  assert.equal(
    observed[0].path,
    '/v1/events?actor=person%3Aroute&after=4&limit=20'
  );
  assert.equal(observed[1].path, '/v1/intents/intent_route_fixture');
  assert.equal(observed[2].path, '/v1/capsules?limit=2');
  assert.equal(observed[3].path, '/v1/proposals?limit=3');
  assert.equal(observed[4].path, '/v1/nodes?limit=4');
  assert.equal(observed[5].path, '/v1/context?purpose=project.execution&max_claims=5');
  await assert.rejects(
    () => client.call('events.list', { query: { unknown: 'value' } }),
    error => error.code === 'invalid_client_request'
  );
  await assert.rejects(
    () => client.call('context.view', {
      query: { purpose: 'project.execution', scopes: 'context:restricted' }
    }),
    error => error.code === 'invalid_client_request'
  );
});

test('Gateway client preserves explicit errors and rejects malformed responses', async () => {
  const known = createGatewayClient({
    token: 'known-error-token',
    request: async () => jsonResponse({
      error: {
        code: 'policy_denied',
        message: 'Denied by policy',
        details: { risk: 'high' }
      },
      trace_id: 'trace-known-001'
    }, 403)
  });
  await assert.rejects(
    () => known.call('status.get'),
    error => (
      error instanceof GatewayClientError
      && error.code === 'policy_denied'
      && error.status === 403
      && error.traceId === 'trace-known-001'
      && error.retryable === false
      && error.details.risk === 'high'
    )
  );

  const unknown = createGatewayClient({
    token: 'unknown-error-token',
    request: async () => jsonResponse({
      error: {
        code: 'future_domain_error',
        message: 'provider leaked internal detail',
        details: { secret_path: '/tmp/provider' }
      },
      trace_id: 'trace-unknown-001'
    }, 409)
  });
  await assert.rejects(
    () => unknown.call('status.get'),
    error => (
      error.code === 'future_domain_error'
      && error.status === 409
      && error.traceId === 'trace-unknown-001'
      && error.message === 'Gateway request failed'
      && error.details === undefined
      && error.retryable === false
    )
  );

  const malformed = createGatewayClient({
    token: 'malformed-token',
    request: async () => new Response('not-json', {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  });
  await assert.rejects(
    () => malformed.call('status.get'),
    error => error.code === 'invalid_gateway_response'
  );

  const missing = createGatewayClient({
    token: 'missing-field-token',
    request: async () => jsonResponse({ kernel_version: '0.12.0-dev.3' })
  });
  await assert.rejects(
    () => missing.call('status.get'),
    error => error.code === 'invalid_gateway_response'
  );

  const oversized = createGatewayClient({
    token: 'oversized-token',
    request: async () => new Response('x'.repeat(2_097_153), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  });
  await assert.rejects(
    () => oversized.call('status.get'),
    error => error.code === 'response_too_large'
  );

  const wrongMedia = createGatewayClient({
    token: 'wrong-media-token',
    request: async () => new Response('{}', {
      status: 200,
      headers: { 'content-type': 'text/plain' }
    })
  });
  await assert.rejects(
    () => wrongMedia.call('status.get'),
    error => error.code === 'invalid_gateway_response'
  );
});

test('Gateway client supports external cancellation and bounded timeout', async () => {
  const aborted = new AbortController();
  const cancellationClient = createGatewayClient({
    token: 'cancellation-token',
    request: (_path, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        reject(options.signal.reason ?? new DOMException('Aborted', 'AbortError'));
      }, { once: true });
    })
  });
  const cancellation = cancellationClient.call('status.get', {
    signal: aborted.signal
  });
  aborted.abort();
  await assert.rejects(
    () => cancellation,
    error => error.code === 'request_cancelled'
  );

  const timeoutClient = createGatewayClient({
    token: 'timeout-token',
    request: (_path, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        reject(options.signal.reason ?? new DOMException('Aborted', 'AbortError'));
      }, { once: true });
    })
  });
  await assert.rejects(
    () => timeoutClient.call('status.get', { timeoutMs: 5 }),
    error => error.code === 'request_timeout' && error.retryable === true
  );
  await assert.rejects(
    () => timeoutClient.call('status.get', { timeoutMs: 30_001 }),
    error => error.code === 'invalid_client_request'
  );
});

test('Gateway client contract rejects authority and implementation drift', async () => {
  const weakened = structuredClone(ACTIVE_GATEWAY_CLIENT_CONTRACT);
  weakened.boundary.direct_internal_service_access = true;
  assert.throws(() => validateGatewayClientContract(weakened), /boundary is weakened/);

  const widened = structuredClone(ACTIVE_GATEWAY_CLIENT_CONTRACT);
  widened.routes.push({
    ...widened.routes.at(-1),
    id: 'unsafe.extra',
    path: '/v1/unsafe-extra'
  });
  assert.throws(() => validateGatewayClientContract(widened), /route inventory is incomplete/);

  const source = await readFile(new URL('../src/gateway/server.mjs', import.meta.url), 'utf8');
  const missing = source.replace("router.add('GET', '/v1/status'", "router.add('GET', '/v1/status-disabled'");
  assert.throws(
    () => validateGatewayClientRouteImplementation({
      contract: ACTIVE_GATEWAY_CLIENT_CONTRACT,
      source: missing
    }),
    /contract and route implementation disagree/
  );
});

test('Gateway client contract is compatible with the real four-service path', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-client-contract-'));
  const lease = await reserveProductionPortBlock('gateway client contract');
  const basePort = lease.base_port;
  let stack;
  t.after(async () => {
    try {
      await stack?.stop();
    } finally {
      await lease.release();
      await rm(dataDir, { recursive: true, force: true });
    }
  });
  const token = 'gateway-client-contract-token-0000000000000000';
  stack = await startDevelopmentStack({
    dataDir,
    environment: 'test',
    autoBootstrap: true,
    gatewayPort: basePort,
    hypervisorPort: basePort + 1,
    sandboxPort: basePort + 2,
    gridPort: basePort + 3,
    hypervisorUrl: `http://127.0.0.1:${basePort + 1}`,
    sandboxUrl: `http://127.0.0.1:${basePort + 2}`,
    gridUrl: `http://127.0.0.1:${basePort + 3}`,
    rateLimitCapacity: 1_000,
    rateLimitRefillPerSecond: 1_000,
    apiTokens: {
      [token]: {
        id: 'owner.client-contract',
        roles: ['administrator'],
        scopes: ['*']
      }
    }
  });
  const gateway = `http://127.0.0.1:${basePort}`;
  const client = createGatewayClient({
    token,
    request: (path, options) => fetch(`${gateway}${path}`, options)
  });
  const status = await client.call('status.get');
  assert.equal(status.runtime.grid.schema_version >= 1, true);
  const first = await client.call('intents.submit', {
    body: { action: 'system.echo', input: { message: 'client-contract-real' } },
    idempotencyKey: 'client-contract-real-intent-0001'
  });
  assert.equal(first.status, 'completed');
  const replay = await client.call('intents.submit', {
    body: { action: 'system.echo', input: { message: 'client-contract-real' } },
    idempotencyKey: 'client-contract-real-intent-0001'
  });
  assert.equal(replay.idempotent_replay, true);
  assert.equal(replay.intent_id, first.intent_id);
});

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}
