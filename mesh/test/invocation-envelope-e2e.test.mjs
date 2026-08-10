import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createGatewayClient } from '../../packages/axiom-client/index.mjs';
import { startDevelopmentStack } from '../src/dev.mjs';
import { reserveProductionPortBlock } from '../src/lib/production-host.mjs';

const HUMAN_TOKEN = `invocation-owner-${'h'.repeat(32)}`;
const AGENT_TOKEN = `invocation-agent-${'a'.repeat(32)}`;

function apiTokens() {
  return {
    [HUMAN_TOKEN]: {
      id: 'owner.invocation-e2e',
      type: 'human',
      roles: ['administrator'],
      scopes: ['*']
    },
    [AGENT_TOKEN]: {
      id: 'agent.invocation-e2e',
      type: 'agent',
      sponsor: 'owner.invocation-e2e',
      roles: ['researcher'],
      scopes: ['intent:execute'],
      lifetime: 'session',
      expires_at: '2099-01-01T00:00:00.000Z',
      runtime: {
        id: 'runtime.invocation-e2e',
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

test('native invocation envelope digest binds Grid acceptance to returned machine evidence', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-invocation-envelope-e2e-'));
  const lease = await reserveProductionPortBlock('invocation envelope e2e');
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
      input: { message: 'invocation-envelope-bound' },
      purpose: 'test.conformance',
      data_scopes: ['memory.beta', 'memory.alpha', 'memory.beta']
    },
    idempotencyKey: 'invocation-envelope-e2e-0001'
  });

  assert.equal(result.status, 'completed');
  assert.match(result.evidence.invocation_digest, /^[a-f0-9]{64}$/);

  const page = await client.call('events.list', {
    query: { after: 0, limit: 100 }
  });
  const accepted = page.events.find(event => (
    event.kind === 'intent.accepted'
    && event.subject === result.intent_id
  ));
  assert.ok(accepted);
  assert.equal(
    accepted.payload.invocation_digest,
    result.evidence.invocation_digest
  );
  assert.equal(accepted.payload.invocation.schema, 'axiom-invocation-envelope.v1');
  assert.equal(
    accepted.payload.invocation.protocol_profile,
    'axiom-native-gateway.v1'
  );
  assert.equal(
    accepted.payload.invocation.caller.machine.sponsor,
    'owner.invocation-e2e'
  );
  assert.equal(
    accepted.payload.invocation.caller.machine.runtime_id,
    'runtime.invocation-e2e'
  );
  assert.deepEqual(
    accepted.payload.invocation.request.data_scopes,
    ['memory.alpha', 'memory.beta']
  );
  assert.deepEqual(
    accepted.payload.invocation.limits.ingress,
    {
      max_request_bytes: 65_536,
      max_requests_per_minute: 30,
      max_concurrent_requests: 1,
      max_response_bytes: 262_144
    }
  );
});
