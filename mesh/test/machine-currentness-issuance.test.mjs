import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { startDevelopmentStack } from '../src/dev.mjs';
import { reserveProductionPortBlock } from '../src/lib/production-host.mjs';

const OWNER_TOKEN = `owner-${'o'.repeat(40)}`;
const APPROVER_TOKEN = `approver-${'a'.repeat(40)}`;
const MACHINE_TOKEN = `machine-${'m'.repeat(40)}`;

function machineRoot(expiresAt) {
  return {
    type: 'agent',
    id: 'agent.currentness-issuance.1',
    sponsor: 'machine-owner',
    roles: ['researcher'],
    scopes: ['intent:execute'],
    lifetime: 'session',
    expires_at: expiresAt,
    runtime: {
      id: 'runtime.currentness-issuance.1',
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
  };
}

async function api(base, token, path, {
  method = 'GET',
  body,
  idempotencyKey = `issuance-${crypto.randomUUID()}`
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

  const initialized = await api(gateway, OWNER_TOKEN, '/v1/intents', {
    method: 'POST',
    body: {
      action,
      input,
      confirmations: [confirmation],
      approval_ids: [approval.body.approval_id]
    }
  });
  assert.equal(initialized.status, 200);
  return initialized.body.lifecycle;
}

test('enforced machine issuance requires initialized currentness and binds the exact head through execution evidence', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-machine-currentness-issuance-'));
  const lease = await reserveProductionPortBlock('machine currentness issuance');
  const basePort = lease.base_port;
  const expiresAt = new Date(Date.now() + 120_000).toISOString();
  const root = machineRoot(expiresAt);
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
    machineCurrentnessEnforcement: true,
    capabilityTtlSeconds: 300,
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
      [OWNER_TOKEN]: {
        id: 'machine-owner', type: 'human', roles: ['administrator'], scopes: ['*']
      },
      [APPROVER_TOKEN]: {
        id: 'machine-approver', type: 'human', roles: ['reviewer'],
        scopes: ['approval:write', 'intent:execute']
      },
      [MACHINE_TOKEN]: root
    }
  });
  const gateway = `http://127.0.0.1:${basePort}`;
  const request = {
    action: 'system.echo',
    input: { message: 'currentness-bound' },
    purpose: 'test.conformance'
  };

  const unavailable = await api(gateway, MACHINE_TOKEN, '/v1/intents', {
    method: 'POST',
    body: request,
    idempotencyKey: 'machine-currentness-unavailable-0001'
  });
  assert.equal(unavailable.status, 409);
  assert.equal(unavailable.body.error?.code, 'machine_currentness_unavailable');

  const current = await approvedLifecycle(
    gateway,
    'machine.principal.lifecycle.initialize',
    { target_principal_id: root.id, reason: 'issuance-enforcement' }
  );
  const executed = await api(gateway, MACHINE_TOKEN, '/v1/intents', {
    method: 'POST',
    body: request,
    idempotencyKey: 'machine-currentness-bound-0001'
  });
  assert.equal(executed.status, 200);
  assert.equal(executed.body.status, 'completed');

  const eventsResponse = await api(gateway, MACHINE_TOKEN, '/v1/events?after=0&limit=200');
  assert.equal(eventsResponse.status, 200);
  const events = eventsResponse.body.events;
  const accepted = events.find(event => (
    event.kind === 'intent.accepted' && event.subject === executed.body.intent_id
  ));
  const consume = events.find(event => (
    event.kind === 'capability.consumed'
    && event.actor === root.id
  ));
  assert.ok(accepted, JSON.stringify(events.map(event => ({
    kind: event.kind,
    subject: event.subject,
    actor: event.actor
  }))));
  assert.ok(consume, JSON.stringify(events.map(event => ({
    kind: event.kind,
    subject: event.subject,
    actor: event.actor
  }))));

  const expectedBinding = {
    root_authority_digest: current.root_authority_digest,
    effective_authority_digest: current.effective_authority_digest,
    lifecycle_seq: current.lifecycle_seq,
    lifecycle_head_digest: current.lifecycle_head_digest
  };
  assert.deepEqual(accepted.payload.machine_currentness, expectedBinding);
  assert.deepEqual(accepted.payload.invocation.caller.machine.currentness, expectedBinding);
  assert.deepEqual(executed.body.evidence.machine_currentness, expectedBinding);
  assert.match(accepted.payload.execution_attempt_id, /^attempt_[A-Za-z0-9_-]+$/);
  assert.equal(
    executed.body.evidence.execution_attempt_id,
    accepted.payload.execution_attempt_id
  );
  assert.match(consume.payload.receipt.statement.claims_digest, /^[a-f0-9]{64}$/);
  assert.equal(
    consume.payload.receipt.statement.expires_at,
    Math.floor(Date.parse(expiresAt) / 1000)
  );

  await approvedLifecycle(
    gateway,
    'machine.principal.lifecycle.mutate',
    {
      target_principal_id: root.id,
      transition: 'revoke',
      reason: 'issuance-terminal-check'
    }
  );
  const terminal = await api(gateway, MACHINE_TOKEN, '/v1/intents', {
    method: 'POST',
    body: request,
    idempotencyKey: 'machine-currentness-terminal-0001'
  });
  assert.equal(terminal.status, 403);
  assert.equal(terminal.body.error?.code, 'machine_currentness_terminal');
});
