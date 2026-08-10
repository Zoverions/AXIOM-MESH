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
  assert.equal(result.routes, 29);
  assert.equal(result.implemented_routes, 29);
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
    token: 'fixture-token-in-memory',
    request: async (path, options) => {
      observed = { path, options };
      return jsonResponse({
        intent_id: `intent_${'a'.repeat(64)}`,
        trace_id: 'trace-client-intent',
        status: 'completed',
        evidence: {},
        message: 'hello'
      }, { status: 201 });
    }
  });
  const result = await client.call('intents.submit', {
    body: {
      action: 'system.echo',
      input: { message: 'hello' },
      purpose: 'client-contract-test'
    },
    idempotencyKey: 'client-intent-key-0001'
  });
  assert.equal(result.status, 'completed');
  assert.equal(observed.path, '/v1/intents');
  assert.equal(observed.options.method, 'POST');
  assert.equal(
    observed.options.headers['idempotency-key'],
    'client-intent-key-0001'
  );
  assert.deepEqual(JSON.parse(observed.options.body), {
    action: 'system.echo',
    input: { message: 'hello' },
    purpose: 'client-contract-test'
  });

  await assert.rejects(
    () => client.call('intents.submit', {
      body: { action: 'system.echo', input: {} }
    }),
    error => error.code === 'invalid_client_request'
  );
  await assert.rejects(
    () => client.call('intents.submit', {
      body: { action: 'system.echo', hidden_authority: true },
      idempotencyKey: 'client-intent-key-0002'
    }),
    error => error.code === 'invalid_client_request'
  );
  await assert.rejects(
    () => client.call('intents.submit', {
      body: { action: 'System.Echo', input: {} },
      idempotencyKey: 'client-intent-key-0003'
    }),
    error => error.code === 'invalid_client_request'
  );
  const cyclic = { action: 'system.echo', input: {} };
  cyclic.input.cyclic = cyclic;
  await assert.rejects(
    () => client.call('intents.submit', {
      body: cyclic,
      idempotencyKey: 'client-intent-key-0004'
    }),
    error => error.code === 'invalid_client_request'
  );
  await assert.rejects(
    () => client.call('intents.submit', {
      body: {
        action: 'system.echo',
        input: { message: 'x'.repeat(1_048_576) }
      },
      idempotencyKey: 'client-intent-key-0005'
    }),
    error => error.code === 'invalid_client_request'
  );
});

test('Gateway client encodes exact path and query inventories', async () => {
  const paths = [];
  const client = createGatewayClient({
    token: 'fixture-token-in-memory',
    request: async path => {
      paths.push(path);
      return jsonResponse({
        nodes: [],
        attestation: { statement: {}, signature: 'fixture' }
      });
    }
  });
  await client.call('nodes.discover', {
    query: {
      capability: ['compute.batch', 'storage.offer'],
      role: 'compute',
      minimum_security_level: 2
    }
  });
  assert.equal(
    paths[0],
    '/v1/node-discovery?capability=compute.batch&capability=storage.offer&role=compute&minimum_security_level=2'
  );
  await assert.rejects(
    () => client.call('nodes.discover', {
      query: { internal_url: 'https://grid:8443' }
    }),
    error => error.code === 'invalid_client_request'
  );
  await assert.rejects(
    () => client.call('intents.get', { params: { id: 'id', extra: 'escape' } }),
    error => error.code === 'invalid_client_request'
  );
  await assert.rejects(
    () => client.call('nodes.discover', { query: { limit: Number.NaN } }),
    error => error.code === 'invalid_client_request'
  );
  await assert.rejects(
    () => client.call('nodes.discover', {
      query: { capability: Array.from({ length: 65 }, () => 'compute.batch') }
    }),
    error => error.code === 'invalid_client_request'
  );
});

test('Gateway client preserves explicit errors and rejects malformed responses', async () => {
  const unknown = createGatewayClient({
    token: 'fixture-token-in-memory',
    request: async () => jsonResponse({
      error: {
        code: 'future_domain_denial',
        message: 'A future domain rule denied the request',
        details: { safe: true }
      },
      trace_id: 'trace-future-error'
    }, { status: 409 })
  });
  await assert.rejects(
    () => unknown.call('status.get'),
    error => (
      error instanceof GatewayClientError
      && error.code === 'future_domain_denial'
      && error.status === 409
      && error.traceId === 'trace-future-error'
      && error.message === 'Gateway request failed'
      && error.details === undefined
      && error.retryable === false
    )
  );

  const retryable = createGatewayClient({
    token: 'fixture-token-in-memory',
    request: async () => jsonResponse({
      error: { code: 'rate_limited', message: 'Try later' },
      trace_id: 'trace-rate-limit'
    }, { status: 429 })
  });
  await assert.rejects(
    () => retryable.call('status.get'),
    error => error.code === 'rate_limited' && error.retryable === true
  );

  const malformed = createGatewayClient({
    token: 'fixture-token-in-memory',
    request: async () => jsonResponse({ kernel_version: '0.12.0-dev.3' })
  });
  await assert.rejects(
    () => malformed.call('status.get'),
    error => error.code === 'invalid_gateway_response'
  );

  const oversized = createGatewayClient({
    token: 'fixture-token-in-memory',
    request: async () => new Response('{}', {
      headers: {
        'content-type': 'application/json',
        'content-length': String(2_097_153)
      }
    })
  });
  await assert.rejects(
    () => oversized.call('status.get'),
    error => error.code === 'response_too_large'
  );

  const streamedOversized = createGatewayClient({
    token: 'fixture-token-in-memory',
    request: async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(1_048_577));
        controller.enqueue(new Uint8Array(1_048_577));
        controller.close();
      }
    }), { headers: { 'content-type': 'application/json' } })
  });
  await assert.rejects(
    () => streamedOversized.call('status.get'),
    error => error.code === 'response_too_large'
  );

  const spoofedMedia = createGatewayClient({
    token: 'fixture-token-in-memory',
    request: async () => new Response('{}', {
      headers: { 'content-type': 'application/json-evil' }
    })
  });
  await assert.rejects(
    () => spoofedMedia.call('status.get'),
    error => error.code === 'invalid_gateway_response'
  );
});

test('Gateway client supports external cancellation and bounded timeout', async () => {
  const waitingRequest = (_path, { signal }) => new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason ?? new Error('aborted'));
      return;
    }
    signal.addEventListener('abort', () => reject(new Error('aborted')), {
      once: true
    });
  });
  const client = createGatewayClient({
    token: 'fixture-token-in-memory',
    request: waitingRequest
  });
  const controller = new AbortController();
  const cancelled = client.call('status.get', { signal: controller.signal });
  controller.abort();
  await assert.rejects(
    () => cancelled,
    error => error.code === 'request_cancelled' && error.retryable === false
  );
  await assert.rejects(
    () => client.call('status.get', { timeoutMs: 5 }),
    error => error.code === 'request_timeout' && error.retryable === true
  );
  await assert.rejects(
    () => client.call('status.get', { timeoutMs: 30_001 }),
    error => error.code === 'invalid_client_request'
  );

  const stalledBody = createGatewayClient({
    token: 'fixture-token-in-memory',
    request: async () => new Response(new ReadableStream({}), {
      headers: { 'content-type': 'application/json' }
    })
  });
  await assert.rejects(
    () => stalledBody.call('status.get', { timeoutMs: 5 }),
    error => error.code === 'request_timeout'
  );

  const failedToken = createGatewayClient({
    token: async () => { throw new Error('token unavailable'); }
  });
  await assert.rejects(
    () => failedToken.call('status.get'),
    error => error.code === 'invalid_client_request'
  );
});

test('Gateway client contract rejects authority and implementation drift', async () => {
  const directAccess = structuredClone(ACTIVE_GATEWAY_CLIENT_CONTRACT);
  directAccess.boundary.direct_internal_service_access = true;
  assert.throws(
    () => validateGatewayClientContract(directAccess),
    /boundary is weakened/
  );

  const missingError = structuredClone(ACTIVE_GATEWAY_CLIENT_CONTRACT);
  missingError.error_contract.stable_codes.pop();
  assert.throws(
    () => validateGatewayClientContract(missingError),
    /error vocabulary drifted/
  );

  const widenedRoute = structuredClone(ACTIVE_GATEWAY_CLIENT_CONTRACT);
  widenedRoute.routes[0].path = '/internal/v1/capabilities';
  assert.throws(
    () => validateGatewayClientContract(widenedRoute),
    /route is invalid/
  );

  const widenedAccess = structuredClone(ACTIVE_GATEWAY_CLIENT_CONTRACT);
  widenedAccess.routes[0].access = 'unauthenticated';
  assert.throws(
    () => validateGatewayClientContract(widenedAccess),
    /exact contract drifted/
  );

  const source = await readFile(
    new URL('../src/gateway/server.mjs', import.meta.url),
    'utf8'
  );
  assert.throws(
    () => validateGatewayClientRouteImplementation({
      contract: ACTIVE_GATEWAY_CLIENT_CONTRACT,
      source: source.replace(
        "router.add('GET', '/v1/status'",
        "router.add('GET', '/v1/status-v2'"
      )
    }),
    /contract and route implementation disagree/
  );
});

test('Gateway client contract is compatible with the real four-service path', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-client-contract-'));
  const lease = await reserveProductionPortBlock('gateway client contract test');
  const basePort = lease.base_port;
  const token = `client-${'c'.repeat(40)}`;
  let stack;
  t.after(async () => {
    try {
      await stack?.stop();
    } finally {
      await lease.release();
      await rm(dataDir, { recursive: true, force: true });
    }
  });
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
        id: 'client-contract-operator',
        type: 'human',
        roles: ['administrator'],
        scopes: ['*']
      }
    }
  });
  const gateway = `http://127.0.0.1:${basePort}`;
  const observedTargets = [];
  const client = createGatewayClient({
    token,
    request: (path, options) => {
      observedTargets.push(path);
      assert.match(path, /^\/v1\//);
      assert.equal(path.includes('://'), false);
      return fetch(`${gateway}${path}`, options);
    }
  });

  const status = await client.call('status.get');
  assert.equal(status.kernel_version, '0.12.0-dev.3');
  assert.equal(status.runtime.grid.mode, 'single-node-transparency-log');
  const idempotencyKey = 'client-contract-e2e-0001';
  const intent = await client.call('intents.submit', {
    body: {
      action: 'system.echo',
      input: { message: 'contract path' }
    },
    idempotencyKey
  });
  assert.equal(intent.status, 'completed');
  assert.equal(intent.message, 'contract path');
  const replay = await client.call('intents.submit', {
    body: {
      action: 'system.echo',
      input: { message: 'contract path' }
    },
    idempotencyKey
  });
  assert.equal(replay.idempotent_replay, true);
  assert.equal(replay.message, 'contract path');
  assert.ok(observedTargets.every(path => path.startsWith('/v1/')));
});

function jsonResponse(value, { status = 200 } = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'x-trace-id': 'trace-response-001'
    }
  });
}