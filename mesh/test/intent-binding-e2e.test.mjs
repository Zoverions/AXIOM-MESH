import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createGatewayClient } from '../../packages/axiom-client/index.mjs';
import { startDevelopmentStack } from '../src/dev.mjs';
import { reserveProductionPortBlock } from '../src/lib/production-host.mjs';

const TOKEN = `intent-binding-${'i'.repeat(40)}`;

test('Gateway replay and Hypervisor approval identity share canonical data scopes', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-intent-binding-e2e-'));
  const lease = await reserveProductionPortBlock('intent binding e2e');
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
      [TOKEN]: {
        id: 'owner.intent-binding',
        type: 'human',
        roles: ['administrator'],
        scopes: ['*']
      }
    }
  });

  const gateway = `http://127.0.0.1:${basePort}`;
  const client = createGatewayClient({
    token: TOKEN,
    request: (path, options) => fetch(`${gateway}${path}`, options)
  });
  const idempotencyKey = 'intent-binding-e2e-0001';
  const first = await client.call('intents.submit', {
    body: {
      action: 'system.echo',
      input: { message: 'canonical-scope-replay' },
      purpose: 'operator-request',
      data_scopes: ['memory.beta', 'memory.alpha', 'memory.beta']
    },
    idempotencyKey
  });
  assert.equal(first.status, 'completed');

  const replay = await client.call('intents.submit', {
    body: {
      action: 'system.echo',
      input: { message: 'canonical-scope-replay' },
      purpose: 'operator-request',
      data_scopes: ['memory.alpha', 'memory.beta']
    },
    idempotencyKey
  });

  assert.equal(replay.idempotent_replay, true);
  assert.equal(replay.intent_id, first.intent_id);
});
