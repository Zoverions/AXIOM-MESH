import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createGatewayClient } from '../../packages/axiom-client/index.mjs';
import { startDevelopmentStack } from '../src/dev.mjs';
import { reserveProductionPortBlock } from '../src/lib/production-host.mjs';

const HUMAN_TOKEN = `human-${'h'.repeat(40)}`;
const AGENT_TOKEN = `agent-${'a'.repeat(40)}`;

function apiTokens() {
  return {
    [HUMAN_TOKEN]: {
      id: 'owner.machine-test',
      type: 'human',
      roles: ['administrator'],
      scopes: ['*']
    },
    [AGENT_TOKEN]: {
      id: 'agent.machine-test',
      type: 'agent',
      sponsor: 'owner.machine-test',
      roles: ['researcher'],
      scopes: ['intent:execute'],
      lifetime: 'session',
      expires_at: '2099-01-01T00:00:00.000Z',
      runtime: {
        id: 'runtime.machine-test',
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
          max_response_bytes: 262_144
        },
        delegation: { allowed: false, max_depth: 0 }
      }
    }
  };
}

test('constrained agent executes an authorized intent and returns bound authority evidence', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-machine-e2e-'));
  const lease = await reserveProductionPortBlock('machine principal e2e');
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
    apiTokens: apiTokens()
  });
  const gateway = `http://127.0.0.1:${basePort}`;
  const client = createGatewayClient({
    token: AGENT_TOKEN,
    request: (path, options) => fetch(`${gateway}${path}`, options)
  });

  const result = await client.call('intents.submit', {
    body: {
      action: 'system.echo',
      input: { message: 'machine-authorized' },
      purpose: 'test.conformance'
    },
    idempotencyKey: 'machine-e2e-allowed-0001'
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.message, 'machine-authorized');
  assert.equal(result.evidence.machine_sponsor, 'owner.machine-test');
  assert.match(result.evidence.machine_authority_digest, /^[a-f0-9]{64}$/);
  assert.match(result.evidence.plan_digest, /^[a-f0-9]{64}$/);
});

test('constrained agent is denied when purpose or action exceeds its authority ceiling', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-machine-deny-'));
  const lease = await reserveProductionPortBlock('machine principal deny e2e');
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
    apiTokens: apiTokens()
  });
  const gateway = `http://127.0.0.1:${basePort}`;
  const client = createGatewayClient({
    token: AGENT_TOKEN,
    request: (path, options) => fetch(`${gateway}${path}`, options)
  });

  await assert.rejects(
    () => client.call('intents.submit', {
      body: {
        action: 'system.echo',
        input: { message: 'wrong purpose' },
        purpose: 'finance.transfer'
      },
      idempotencyKey: 'machine-e2e-purpose-deny-0001'
    }),
    error => error.code === 'machine_purpose_denied' && error.status === 403
  );

  await assert.rejects(
    () => client.call('intents.submit', {
      body: {
        action: 'system.hash',
        input: { value: 'outside action ceiling' },
        purpose: 'test.conformance'
      },
      idempotencyKey: 'machine-e2e-action-deny-0001'
    }),
    error => error.code === 'machine_action_denied' && error.status === 403
  );
});
