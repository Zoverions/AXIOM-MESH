// Connector trigger: apply the already-present branch-locked Gateway hook repair.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createGatewayClient } from '../../packages/axiom-client/index.mjs';
import { startDevelopmentStack } from '../src/dev.mjs';
import { createGatewayAuthenticator } from '../src/gateway/server.mjs';
import { reserveProductionPortBlock } from '../src/lib/production-host.mjs';

test('Gateway rate-limit wrapper preserves machine admission and response hooks', async () => {
  const admitRequest = () => () => {};
  const inspectResponse = () => ({ constrained: true });
  inspectResponse.requiresPreflight = () => true;
  const bearerAuth = async () => ({
    id: 'agent.gateway-hook-test',
    schema: 'axiom-machine-principal.v1',
    scopes: ['intent:execute']
  });
  bearerAuth.admitRequest = admitRequest;
  bearerAuth.inspectResponse = inspectResponse;
  const limiter = { take: () => true };
  const authenticate = createGatewayAuthenticator({
    bearerAuth,
    ipLimiter: limiter,
    principalLimiter: limiter
  });

  const principal = await authenticate({
    req: {
      method: 'GET',
      url: '/v1/status',
      socket: { remoteAddress: '127.0.0.1' }
    }
  });
  assert.equal(principal.id, 'agent.gateway-hook-test');
  assert.equal(authenticate.admitRequest, admitRequest);
  assert.equal(authenticate.inspectResponse, inspectResponse);
  assert.equal(authenticate.inspectResponse.requiresPreflight, inspectResponse.requiresPreflight);
});

test('real Gateway enforces constrained machine response size after auth wrapping', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-gateway-machine-hooks-'));
  const lease = await reserveProductionPortBlock('gateway machine hooks');
  const basePort = lease.base_port;
  const humanToken = `gateway-hook-human-${'h'.repeat(32)}`;
  const agentToken = `gateway-hook-agent-${'a'.repeat(32)}`;
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
      [humanToken]: {
        id: 'owner.gateway-hook-test',
        type: 'human',
        roles: ['administrator'],
        scopes: ['*']
      },
      [agentToken]: {
        id: 'agent.gateway-hook-test',
        type: 'agent',
        sponsor: 'owner.gateway-hook-test',
        roles: ['researcher'],
        scopes: ['intent:execute'],
        lifetime: 'session',
        expires_at: '2099-01-01T00:00:00.000Z',
        runtime: {
          id: 'runtime.gateway-hook-test',
          kind: 'local-process',
          software_digest: 'a'.repeat(64)
        },
        constraints: {
          actions: ['system.echo'],
          purposes: ['test.conformance'],
          destinations: ['local'],
          budgets: {
            max_requests_per_minute: 30,
            max_concurrent_requests: 1,
            max_execution_ms: 2_000,
            max_request_bytes: 65_536,
            max_response_bytes: 1_024
          },
          delegation: { allowed: false, max_depth: 0 }
        }
      }
    }
  });
  const gateway = `http://127.0.0.1:${basePort}`;
  const client = createGatewayClient({
    token: agentToken,
    request: (path, options) => fetch(`${gateway}${path}`, options)
  });

  await assert.rejects(
    () => client.call('intents.submit', {
      body: {
        action: 'system.echo',
        input: { message: 'r'.repeat(2_048) },
        purpose: 'test.conformance'
      },
      idempotencyKey: 'gateway-machine-response-budget-0001'
    }),
    error => error.code === 'machine_response_budget_exceeded' && error.status === 502
  );
});
