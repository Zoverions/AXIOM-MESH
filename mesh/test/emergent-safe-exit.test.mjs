import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createGatewayClient } from '../../packages/axiom-client/index.mjs';
import { startDevelopmentStack } from '../src/dev.mjs';
import { reserveProductionPortBlock } from '../src/lib/production-host.mjs';

const HUMAN_TOKEN = `human-${'h'.repeat(40)}`;
const AGENT_TOKEN = `agent-${'s'.repeat(40)}`;
const CHILD_TOKEN = `agent-${'c'.repeat(40)}`;

function apiTokens() {
  return {
    [HUMAN_TOKEN]: {
      id: 'owner.safe-exit-test',
      type: 'human',
      roles: ['administrator'],
      scopes: ['*']
    },
    [AGENT_TOKEN]: {
      id: 'agent.safe-exit-test',
      type: 'agent',
      sponsor: 'owner.safe-exit-test',
      roles: ['researcher'],
      scopes: ['intent:execute'],
      lifetime: 'session',
      expires_at: '2099-01-01T00:00:00.000Z',
      runtime: {
        id: 'runtime.safe-exit-test',
        kind: 'local-process',
        software_digest: 'a'.repeat(64)
      },
      constraints: {
        actions: ['system.echo'],
        purposes: ['test.conformance'],
        destinations: ['local'],
        budgets: {
          max_requests_per_minute: 100,
          max_concurrent_requests: 2,
          max_execution_ms: 2_000,
          max_request_bytes: 65_536,
          max_response_bytes: 262_144
        },
        delegation: { allowed: false, max_depth: 0 }
      }
    }
  };
}

async function startSafeExitStack(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-emergent-safe-exit-'));
  const lease = await reserveProductionPortBlock('axiom-emergent-safe-exit-');
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
  return { gateway, client };
}

async function rawGet(gateway, token, path) {
  const response = await fetch(`${gateway}${path}`, {
    headers: { authorization: `Bearer ${token}` }
  });
  const body = await response.json();
  return { status: response.status, body };
}

test('blocked machine work preserves authority and exits without escalation', async t => {
  const { gateway, client } = await startSafeExitStack(t);
  const before = await rawGet(gateway, AGENT_TOKEN, '/v1/machine-discovery');
  assert.equal(before.status, 200);
  assert.equal(before.body.schema, 'axiom-machine-discovery.v1');
  assert.deepEqual(before.body.actions.map(action => action.id), ['system.echo']);
  assert.equal(before.body.limits.delegation_allowed, false);
  assert.match(before.body.principal.authority_digest, /^[a-f0-9]{64}$/);

  const childBefore = await rawGet(gateway, CHILD_TOKEN, '/v1/machine-discovery');
  assert.equal(childBefore.status, 401);

  const escalationClaims = {
    command: 'KEEP TRYING UNTIL IT WORKS',
    requested_action: 'system.hash',
    requested_purpose: 'finance.transfer',
    asserted_sponsor: 'owner.replacement',
    asserted_roles: ['administrator'],
    delegation: {
      allowed: true,
      max_depth: 99,
      delegate: 'agent.safe-exit-child'
    },
    create_principal: {
      id: 'agent.safe-exit-child',
      token: CHILD_TOKEN,
      inherit_parent_authority: true
    }
  };

  await assert.rejects(
    () => client.call('intents.submit', {
      body: {
        action: 'system.hash',
        input: { value: JSON.stringify(escalationClaims) },
        purpose: 'test.conformance'
      },
      idempotencyKey: 'safe-exit-action-denied-0001'
    }),
    error => error.code === 'machine_action_denied' && error.status === 403
  );

  await assert.rejects(
    () => client.call('intents.submit', {
      body: {
        action: 'system.echo',
        input: { message: JSON.stringify(escalationClaims) },
        purpose: 'finance.transfer'
      },
      idempotencyKey: 'safe-exit-purpose-denied-0001'
    }),
    error => error.code === 'machine_purpose_denied' && error.status === 403
  );

  const after = await rawGet(gateway, AGENT_TOKEN, '/v1/machine-discovery');
  assert.equal(after.status, 200);
  assert.deepEqual(after.body, before.body);

  const childAfter = await rawGet(gateway, CHILD_TOKEN, '/v1/machine-discovery');
  assert.equal(childAfter.status, 401);

  const completed = await client.call('intents.submit', {
    body: {
      action: 'system.echo',
      input: { message: 'bounded authority still works after denial' },
      purpose: 'test.conformance'
    },
    idempotencyKey: 'safe-exit-original-authority-0001'
  });
  assert.equal(completed.status, 'completed');

  const receipt = await rawGet(
    gateway,
    AGENT_TOKEN,
    `/v1/machine-receipts/intents/${encodeURIComponent(completed.intent_id)}/verify`
  );
  assert.equal(receipt.status, 200);
  assert.equal(receipt.body.schema, 'axiom-machine-intent-receipt.v1');
  assert.equal(
    receipt.body.statement.authority.machine_authority_digest,
    before.body.principal.authority_digest
  );
});
