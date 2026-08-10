// Final verification anchor after Gateway machine hook repair #925.
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

function apiTokens({ budgets = {} } = {}) {
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

test('constrained agent executes an authorized intent and returns bound authority evidence', async t => {
  const { client } = await startMachineStack(t, 'axiom-machine-e2e-', {
    budgets: {
      max_request_bytes: 1_024,
      max_requests_per_minute: 3
    }
  });
  const body = {
    action: 'system.echo',
    input: { message: 'machine-authorized' },
    purpose: 'test.conformance'
  };
  const idempotencyKey = 'machine-e2e-allowed-0001';

  const result = await client.call('intents.submit', {
    body,
    idempotencyKey
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.message, 'machine-authorized');
  assert.equal(result.evidence.machine_sponsor, 'owner.machine-test');
  assert.match(result.evidence.machine_authority_digest, /^[a-f0-9]{64}$/);
  assert.match(result.evidence.plan_digest, /^[a-f0-9]{64}$/);

  const replay = await client.call('intents.submit', {
    body,
    idempotencyKey
  });
  assert.equal(replay.idempotent_replay, true);
  assert.equal(
    replay.evidence.machine_authority_digest,
    result.evidence.machine_authority_digest
  );

  const events = await client.call('events.list', {
    query: { after: 0, limit: 100 }
  });
  const accepted = events.events.find(event => (
    event.kind === 'intent.accepted'
    && event.subject === result.intent_id
  ));
  assert.ok(accepted);
  assert.equal(accepted.payload.invocation.limits.ingress.max_concurrent_requests, 1);
  assert.equal(accepted.payload.invocation.limits.ingress.max_response_bytes, 262_144);

  // Request-size denial occurs before rate consumption, so the next bounded call
  // still deterministically proves the three-request rate ceiling.
  await assert.rejects(
    () => client.call('intents.submit', {
      body: {
        action: 'system.echo',
        input: { message: 'x'.repeat(2_000) },
        purpose: 'test.conformance'
      },
      idempotencyKey: 'machine-e2e-bound-request-budget-0001'
    }),
    error => {
      assert.equal(error.code, 'machine_request_budget_exceeded');
      assert.equal(error.status, 413);
      return true;
    }
  );

  await assert.rejects(
    () => client.call('status.get'),
    error => {
      assert.equal(error.code, 'machine_rate_budget_exceeded');
      assert.equal(error.status, 429);
      return true;
    }
  );

  // Final claim anchor: response-size enforcement uses an isolated stack so the
  // proof is independent of event-page bytes and rate-budget sequencing above.
  // A 2 KiB echo request is beneath this stack's default 64 KiB request ceiling,
  // while its returned JSON necessarily exceeds the explicit 1 KiB response ceiling.
  const { client: responseBoundClient } = await startMachineStack(
    t,
    'axiom-machine-response-bound-e2e-',
    { budgets: { max_response_bytes: 1_024 } }
  );
  await assert.rejects(
    () => responseBoundClient.call('intents.submit', {
      body: {
        action: 'system.echo',
        input: { message: 'r'.repeat(2_048) },
        purpose: 'test.conformance'
      },
      idempotencyKey: 'machine-e2e-response-budget-0001'
    }),
    error => {
      assert.equal(error.code, 'machine_response_budget_exceeded');
      assert.equal(error.status, 502);
      return true;
    }
  );
});

test('constrained agent is denied when purpose or action exceeds its authority ceiling', async t => {
  const { client } = await startMachineStack(t, 'axiom-machine-deny-');

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

test('machine request-size ceiling is enforced at authenticated Gateway ingress', async t => {
  const { client } = await startMachineStack(t, 'axiom-machine-request-budget-', {
    budgets: { max_request_bytes: 1_024 }
  });

  await assert.rejects(
    () => client.call('intents.submit', {
      body: {
        action: 'system.echo',
        input: { message: 'x'.repeat(2_000) },
        purpose: 'test.conformance'
      },
      idempotencyKey: 'machine-e2e-request-budget-0001'
    }),
    error => error.code === 'machine_request_budget_exceeded' && error.status === 413
  );
});

test('machine request-rate ceiling tightens the global Gateway rate limit', async t => {
  const { client } = await startMachineStack(t, 'axiom-machine-rate-budget-', {
    budgets: { max_requests_per_minute: 1 }
  });

  const first = await client.call('status.get');
  assert.equal(first.kernel_version, '0.12.0-dev.3');

  await assert.rejects(
    () => client.call('status.get'),
    error => error.code === 'machine_rate_budget_exceeded' && error.status === 429
  );
});
