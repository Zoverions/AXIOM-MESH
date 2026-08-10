// Final verification anchor after Gateway hook repair and response-size claim promotion.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createGatewayClient } from '../../packages/axiom-client/index.mjs';
import { startDevelopmentStack } from '../src/dev.mjs';
import { reserveProductionPortBlock } from '../src/lib/production-host.mjs';

const HUMAN_TOKEN = `destination-human-${'h'.repeat(32)}`;
const LOCAL_AGENT_TOKEN = `destination-local-${'l'.repeat(32)}`;
const REMOTE_AGENT_TOKEN = `destination-remote-${'r'.repeat(32)}`;

function machine(id, destinations) {
  return {
    id,
    type: 'agent',
    sponsor: 'owner.destination-e2e',
    roles: ['researcher'],
    scopes: ['intent:execute'],
    lifetime: 'session',
    expires_at: '2099-01-01T00:00:00.000Z',
    runtime: {
      id: `runtime.${id}`,
      kind: 'local-process',
      software_digest: 'a'.repeat(64)
    },
    constraints: {
      actions: ['system.echo'],
      purposes: ['test.conformance'],
      destinations,
      budgets: {
        max_requests_per_minute: 30,
        max_concurrent_requests: 1,
        max_execution_ms: 2_000,
        max_request_bytes: 65_536,
        max_response_bytes: 262_144
      },
      delegation: { allowed: false, max_depth: 0 }
    }
  };
}

test('computed local destination is allowed only when present in machine authority', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-machine-destination-e2e-'));
  const lease = await reserveProductionPortBlock('machine destination e2e');
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
    apiTokens: {
      [HUMAN_TOKEN]: {
        id: 'owner.destination-e2e',
        type: 'human',
        roles: ['administrator'],
        scopes: ['*']
      },
      [LOCAL_AGENT_TOKEN]: machine('agent.destination-local', ['local']),
      [REMOTE_AGENT_TOKEN]: machine('agent.destination-remote', ['remote'])
    }
  });

  const gateway = `http://127.0.0.1:${basePort}`;
  const localClient = createGatewayClient({
    token: LOCAL_AGENT_TOKEN,
    request: (path, options) => fetch(`${gateway}${path}`, options)
  });
  const remoteOnlyClient = createGatewayClient({
    token: REMOTE_AGENT_TOKEN,
    request: (path, options) => fetch(`${gateway}${path}`, options)
  });

  const allowed = await localClient.call('intents.submit', {
    body: {
      action: 'system.echo',
      input: { message: 'local-destination-allowed' },
      purpose: 'test.conformance'
    },
    idempotencyKey: 'machine-destination-local-0001'
  });
  assert.equal(allowed.status, 'completed');
  assert.equal(allowed.message, 'local-destination-allowed');
  assert.equal(allowed.evidence.effect_destination, 'local');

  const events = await localClient.call('events.list', {
    query: { after: 0, limit: 100 }
  });
  const accepted = events.events.find(event => (
    event.kind === 'intent.accepted'
    && event.subject === allowed.intent_id
  ));
  assert.ok(accepted);
  assert.equal(accepted.payload.invocation.authority.effect_destination, 'local');

  await assert.rejects(
    () => remoteOnlyClient.call('intents.submit', {
      body: {
        action: 'system.echo',
        input: { message: 'must-not-execute' },
        purpose: 'test.conformance'
      },
      idempotencyKey: 'machine-destination-remote-deny-0001'
    }),
    error => {
      assert.equal(error.code, 'machine_destination_denied');
      assert.equal(error.status, 403);
      return true;
    }
  );

  const deniedEvents = await remoteOnlyClient.call('events.list', {
    query: { after: 0, limit: 100 }
  });
  assert.equal(
    deniedEvents.events.some(event => (
      event.kind === 'intent.completed'
      && event.payload?.result?.message === 'must-not-execute'
    )),
    false
  );
});
