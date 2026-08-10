import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createGatewayClient } from '../../packages/axiom-client/index.mjs';
import { startDevelopmentStack } from '../src/dev.mjs';
import { reserveProductionPortBlock } from '../src/lib/production-host.mjs';

const HUMAN_TOKEN = `gateway-hook-human-${'h'.repeat(32)}`;
const AGENT_TOKEN = `gateway-hook-agent-${'a'.repeat(32)}`;

function apiTokens({ budgets = {} } = {}) {
  return {
    [HUMAN_TOKEN]: {
      id: 'owner.gateway-hook-test',
      type: 'human',
      roles: ['administrator'],
      scopes: ['*']
    },
    [AGENT_TOKEN]: {
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
          max_requests_per_minute: 100,
          max_concurrent_requests: 1,
          max_execution_ms: 2_000,
          max_request_bytes: 65_536,
          max_response_bytes: 262_144,
          ...budgets
        },
        delegation: { allowed: false, max_depth: 0 }
      }
    }
  };
}

async function startMachineStack(t, prefix, tokenConfig = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), prefix));
  const lease = await reserveProductionPortBlock(prefix);
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
    apiTokens: apiTokens(tokenConfig)
  });
  const gateway = `http://127.0.0.1:${basePort}`;
  const client = createGatewayClient({
    token: AGENT_TOKEN,
    request: (path, options) => fetch(`${gateway}${path}`, options)
  });
  return { gateway, client };
}

test('Gateway passes bearer machine admission and response hooks into the HTTP lifecycle', async () => {
  const source = await readFile(new URL('../src/gateway/server.mjs', import.meta.url), 'utf8');
  assert.match(source, /admitRequest:\s*bearerAuth\.admitRequest/);
  assert.match(source, /inspectResponse:\s*bearerAuth\.inspectResponse/);
});

test('real Gateway enforces constrained machine response size after auth wrapping', async t => {
  const { client } = await startMachineStack(t, 'axiom-gateway-response-hook-', {
    budgets: { max_response_bytes: 1_024 }
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
    error => {
      assert.equal(error.code, 'machine_response_budget_exceeded');
      assert.equal(error.status, 502);
      return true;
    }
  );
});

test('real Gateway holds constrained machine concurrency for the full handler lifetime', async t => {
  const { client } = await startMachineStack(t, 'axiom-gateway-concurrency-hook-');

  const first = client.call('intents.submit', {
    body: {
      action: 'system.echo',
      input: { message: 'c'.repeat(50_000) },
      purpose: 'test.conformance'
    },
    idempotencyKey: 'gateway-machine-concurrency-first-0001'
  });

  await new Promise(resolve => setTimeout(resolve, 5));
  await assert.rejects(
    () => client.call('status.get'),
    error => {
      assert.equal(error.code, 'machine_concurrency_budget_exceeded');
      assert.equal(error.status, 429);
      return true;
    }
  );

  const completed = await first;
  assert.equal(completed.status, 'completed');
  assert.equal(completed.message.length, 50_000);

  const afterRelease = await client.call('status.get');
  assert.equal(afterRelease.kernel_version, '0.12.0-dev.3');
});
