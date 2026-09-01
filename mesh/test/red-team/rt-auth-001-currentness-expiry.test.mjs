import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import test from 'node:test';
import { createGatewayClient } from '../../../packages/axiom-client/index.mjs';
import { startDevelopmentStack } from '../../src/dev.mjs';
import { reserveProductionPortBlock } from '../../src/lib/production-host.mjs';

const HUMAN_TOKEN = `human-${'h'.repeat(40)}`;
const AGENT_TOKEN = `agent-${'a'.repeat(40)}`;

function apiTokens(expiresAt) {
  return {
    [HUMAN_TOKEN]: {
      id: 'owner.rt-auth-001',
      type: 'human',
      roles: ['administrator'],
      scopes: ['*']
    },
    [AGENT_TOKEN]: {
      id: 'agent.rt-auth-001',
      type: 'agent',
      sponsor: 'owner.rt-auth-001',
      roles: ['researcher'],
      scopes: ['intent:execute'],
      lifetime: 'session',
      expires_at: expiresAt,
      runtime: {
        id: 'runtime.rt-auth-001',
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

test('RT-AUTH-001 reproduces stale machine authority when principal expires before Sandbox effect', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-rt-auth-001-expiry-'));
  const lease = await reserveProductionPortBlock('axiom-rt-auth-001-expiry-');
  const basePort = lease.base_port;

  // Keep the expiry barrier inside the existing 10-second request budget.
  // Hosted CI stack startup is complete before the intercepted execute call.
  const expiresAt = new Date(Date.now() + 8_000).toISOString();
  let stack;
  const originalFetch = globalThis.fetch;
  let intercepted = false;
  let releasedAfterExpiryAt = null;

  t.after(async () => {
    globalThis.fetch = originalFetch;
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
    apiTokens: apiTokens(expiresAt)
  });

  const gateway = `http://127.0.0.1:${basePort}`;
  const agent = createGatewayClient({
    token: AGENT_TOKEN,
    request: (path, options) => fetch(`${gateway}${path}`, options)
  });
  const human = createGatewayClient({
    token: HUMAN_TOKEN,
    request: (path, options) => fetch(`${gateway}${path}`, options)
  });

  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input?.url;
    if (!intercepted && url === `http://127.0.0.1:${basePort + 2}/internal/v1/execute`) {
      intercepted = true;
      const expiryMs = new Date(expiresAt).valueOf();
      await sleep(Math.max(0, expiryMs - Date.now()) + 250);
      releasedAfterExpiryAt = new Date().toISOString();
      assert.ok(Date.now() > expiryMs, 'Sandbox request must be released after principal expiry');
    }
    return originalFetch(input, init);
  };

  const result = await agent.call('intents.submit', {
    body: {
      action: 'system.echo',
      input: { message: 'stale-authority-effect' },
      purpose: 'test.conformance'
    },
    idempotencyKey: 'rt-auth-001-expiry-race-0001'
  });

  assert.equal(intercepted, true, 'test must intercept the real Hypervisor -> Sandbox execute request');
  assert.ok(releasedAfterExpiryAt, 'test must record release after expiry');
  assert.ok(new Date(releasedAfterExpiryAt) > new Date(expiresAt));
  assert.equal(result.status, 'completed');
  assert.equal(result.message, 'stale-authority-effect');

  // Independently inspect committed evidence through a still-authorized human principal.
  const events = await human.call('events.list', {
    query: { after: 0, limit: 100 }
  });
  const completed = events.events.find(event => (
    event.kind === 'intent.completed'
    && event.subject === result.intent_id
  ));
  assert.ok(completed, 'Grid must contain an intent.completed event proving the effect path completed');
  assert.match(result.evidence.machine_authority_digest, /^[a-f0-9]{64}$/);
});
