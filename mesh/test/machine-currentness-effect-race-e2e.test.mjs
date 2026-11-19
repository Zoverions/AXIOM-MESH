import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { startDevelopmentStack } from '../src/dev.mjs';
import { executeSandboxBuiltin } from '../src/sandbox/education-executor.mjs';
import { reserveProductionPortBlock } from '../src/lib/production-host.mjs';

const OWNER_TOKEN = `owner-${'o'.repeat(40)}`;
const APPROVER_TOKEN = `approver-${'a'.repeat(40)}`;
const MACHINE_TOKEN = `machine-${'m'.repeat(40)}`;

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function machineRoot({ id = 'agent.currentness-race.1', expiresAt } = {}) {
  return {
    type: 'agent',
    id,
    sponsor: 'machine-owner',
    roles: ['researcher'],
    scopes: ['intent:execute'],
    lifetime: 'session',
    expires_at: expiresAt ?? new Date(Date.now() + 120_000).toISOString(),
    runtime: {
      id: `runtime.${id}`,
      kind: 'local-process',
      software_digest: 'a'.repeat(64)
    },
    constraints: {
      actions: ['system.echo', 'system.hash'],
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
  };
}

async function api(base, token, path, {
  method = 'GET',
  body,
  idempotencyKey = `currentness-race-${crypto.randomUUID()}`
} = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
      ...(body === undefined ? {} : {
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey
      })
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.status, body: await response.json() };
}

async function approvedLifecycle(gateway, action, input) {
  const confirmation = `confirm:${action}`;
  const pending = await api(gateway, OWNER_TOKEN, '/v1/intents', {
    method: 'POST',
    body: { action, input, confirmations: [confirmation] }
  });
  assert.equal(pending.status, 409);
  assert.equal(pending.body.error?.code, 'independent_approval_required');
  const approval = await api(gateway, APPROVER_TOKEN, '/v1/intents', {
    method: 'POST',
    body: {
      action: 'approval.grant',
      input: {
        requester: 'machine-owner',
        action,
        request_digest: pending.body.error.details.request_digest,
        expires_at: new Date(Date.now() + 60_000).toISOString()
      }
    }
  });
  assert.equal(approval.status, 200);
  return api(gateway, OWNER_TOKEN, '/v1/intents', {
    method: 'POST',
    body: {
      action,
      input,
      confirmations: [confirmation],
      approval_ids: [approval.body.approval_id]
    }
  });
}

async function fixture(t, { dependencies = {}, root = machineRoot() } = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-machine-currentness-race-'));
  const lease = await reserveProductionPortBlock('machine currentness race');
  const basePort = lease.base_port;
  let stack;
  t.after(async () => {
    try { await stack?.stop(); } finally {
      await lease.release();
      await rm(dataDir, { recursive: true, force: true });
    }
  });
  stack = await startDevelopmentStack({
    dataDir,
    environment: 'test',
    autoBootstrap: true,
    machineCurrentnessEnforcement: true,
    capabilityTtlSeconds: 300,
    gatewayPort: basePort,
    hypervisorPort: basePort + 1,
    sandboxPort: basePort + 2,
    gridPort: basePort + 3,
    hypervisorUrl: `http://127.0.0.1:${basePort + 1}`,
    sandboxUrl: `http://127.0.0.1:${basePort + 2}`,
    gridUrl: `http://127.0.0.1:${basePort + 3}`,
    rateLimitCapacity: 2_000,
    rateLimitRefillPerSecond: 2_000,
    apiTokens: {
      [OWNER_TOKEN]: { id: 'machine-owner', type: 'human', roles: ['administrator'], scopes: ['*'] },
      [APPROVER_TOKEN]: {
        id: 'machine-approver', type: 'human', roles: ['reviewer'],
        scopes: ['approval:write', 'intent:execute']
      },
      [MACHINE_TOKEN]: root
    }
  }, dependencies);
  const gateway = `http://127.0.0.1:${basePort}`;
  const initialized = await approvedLifecycle(
    gateway,
    'machine.principal.lifecycle.initialize',
    { target_principal_id: root.id, reason: 'race-test-initialize' }
  );
  assert.equal(initialized.status, 200);
  return { gateway, root, stack };
}

test('test-only Sandbox builtin injection preserves one exact positive invocation', async t => {
  const invocations = { value: 0 };
  const root = machineRoot();
  const f = await fixture(t, {
    root,
    dependencies: {
      sandbox: {
        executeBuiltin(args) {
          if (args.intent.principal.id === root.id) invocations.value += 1;
          return executeSandboxBuiltin(args);
        }
      }
    }
  });
  // Lifecycle approval/setup may use the ordinary builtin path. This proof
  // measures only the machine effect submitted below.
  invocations.value = 0;
  const result = await api(f.gateway, MACHINE_TOKEN, '/v1/intents', {
    method: 'POST',
    body: {
      action: 'system.echo',
      input: { message: 'ordered-once' },
      purpose: 'test.conformance'
    },
    idempotencyKey: 'machine-currentness-race-positive-0001'
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.status, 'completed');
  assert.equal(invocations.value, 1);

  const replay = await api(f.gateway, MACHINE_TOKEN, '/v1/intents', {
    method: 'POST',
    body: {
      action: 'system.echo',
      input: { message: 'ordered-once' },
      purpose: 'test.conformance'
    },
    idempotencyKey: 'machine-currentness-race-positive-0001'
  });
  assert.equal(replay.status, 200);
  assert.equal(replay.body.idempotent_replay, true);
  assert.equal(invocations.value, 1);

  const revoked = await approvedLifecycle(
    f.gateway,
    'machine.principal.lifecycle.mutate',
    {
      target_principal_id: root.id,
      transition: 'revoke',
      reason: 'historical-release-remains-evidence'
    }
  );
  assert.equal(revoked.status, 200);
  const grid = f.stack.services.find(service => service.name === 'grid');
  const events = grid.store.listEvents({ after: 0, limit: 200 });
  assert.equal(events.some(event => (
    event.kind === 'machine.effect.released'
    && event.actor === root.id
  )), true);
  assert.equal(invocations.value, 1);
});

for (const testCase of [
  {
    name: 'revoke',
    action: 'system.echo',
    successor(root) {
      return {
        target_principal_id: root.id,
        transition: 'revoke',
        reason: 'deterministic-race-revoke'
      };
    }
  },
  {
    name: 'narrow',
    action: 'system.hash',
    successor(root) {
      return {
        target_principal_id: root.id,
        transition: 'narrow',
        reason: 'deterministic-race-narrow',
        successor_authority: {
          ...root,
          constraints: { ...root.constraints, actions: ['system.echo'] }
        }
      };
    }
  }
]) {
  test(`${testCase.name} committed before release denies with zero machine builtin invocation`, async t => {
    const reached = deferred();
    const resume = deferred();
    const invocations = { value: 0 };
    const root = machineRoot({ id: `agent.currentness-race.${testCase.name}` });
    const f = await fixture(t, {
      root,
      dependencies: {
        hypervisor: {
          async beforeMachineEffectRelease({ intent }) {
            if (intent.principal.id !== root.id) return;
            reached.resolve();
            await resume.promise;
          }
        },
        sandbox: {
          executeBuiltin(args) {
            if (args.intent.principal.id === root.id) invocations.value += 1;
            return executeSandboxBuiltin(args);
          }
        }
      }
    });

    const pending = api(f.gateway, MACHINE_TOKEN, '/v1/intents', {
      method: 'POST',
      body: {
        action: testCase.action,
        input: testCase.action === 'system.hash'
          ? { value: 'must-not-run' }
          : { message: 'must-not-run' },
        purpose: 'test.conformance'
      },
      idempotencyKey: `machine-currentness-race-${testCase.name}-0001`
    });
    await reached.promise;

    const mutation = await approvedLifecycle(
      f.gateway,
      'machine.principal.lifecycle.mutate',
      testCase.successor(root)
    );
    assert.equal(mutation.status, 200);
    resume.resolve();

    const result = await pending;
    assert.ok([403, 409].includes(result.status), JSON.stringify(result.body));
    assert.ok(
      ['machine_currentness_stale', 'machine_currentness_terminal'].includes(result.body.error?.code),
      JSON.stringify(result.body)
    );
    assert.equal(invocations.value, 0);
  });
}

test('natural authority expiry before release denies with zero machine builtin invocation', async t => {
  const reached = deferred();
  const resume = deferred();
  const invocations = { value: 0 };
  const expiresAt = new Date(Date.now() + 2_000).toISOString();
  const root = machineRoot({ id: 'agent.currentness-race.expiry', expiresAt });
  const f = await fixture(t, {
    root,
    dependencies: {
      hypervisor: {
        async beforeMachineEffectRelease({ intent }) {
          if (intent.principal.id !== root.id) return;
          reached.resolve();
          await resume.promise;
        }
      },
      sandbox: {
        executeBuiltin(args) {
          if (args.intent.principal.id === root.id) invocations.value += 1;
          return executeSandboxBuiltin(args);
        }
      }
    }
  });

  const pending = api(f.gateway, MACHINE_TOKEN, '/v1/intents', {
    method: 'POST',
    body: {
      action: 'system.echo',
      input: { message: 'expires-before-release' },
      purpose: 'test.conformance'
    },
    idempotencyKey: 'machine-currentness-race-expiry-0001'
  });
  await reached.promise;
  await new Promise(resolve => setTimeout(resolve, Math.max(0, Date.parse(expiresAt) - Date.now() + 25)));
  resume.resolve();

  const result = await pending;
  assert.equal(result.status, 401, JSON.stringify(result.body));
  assert.equal(result.body.error?.code, 'machine_principal_expired');
  assert.equal(invocations.value, 0);
  const grid = f.stack.services.find(service => service.name === 'grid');
  assert.equal(grid.store.listEvents({ after: 0, limit: 200 }).some(event => (
    event.kind === 'machine.effect.released' && event.actor === root.id
  )), false);
});
