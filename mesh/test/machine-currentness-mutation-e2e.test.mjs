import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { canonicalJson } from '../src/lib/canonical.mjs';
import { startDevelopmentStack } from '../src/dev.mjs';
import { reserveProductionPortBlock } from '../src/lib/production-host.mjs';

function machineRoot() {
  return {
    type: 'agent',
    id: 'agent.lifecycle.e2e.1',
    sponsor: 'machine-owner',
    roles: ['researcher'],
    scopes: ['intent:execute'],
    lifetime: 'session',
    expires_at: '2027-01-01T00:00:00.000Z',
    runtime: {
      id: 'runtime.lifecycle.e2e.1',
      kind: 'local-process',
      software_digest: 'a'.repeat(64)
    },
    constraints: {
      actions: ['system.echo', 'system.hash'],
      purposes: ['test.conformance'],
      destinations: ['local'],
      budgets: {
        max_requests_per_minute: 10,
        max_concurrent_requests: 1,
        max_execution_ms: 30_000,
        max_request_bytes: 32_768,
        max_response_bytes: 131_072
      },
      delegation: { allowed: false, max_depth: 0 }
    }
  };
}

async function api(base, token, path, {
  method = 'GET',
  body,
  idempotencyKey = `machine-lifecycle-${crypto.randomUUID()}`
} = {}, expectedStatus = 200) {
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
  const payload = await response.json();
  if (response.status !== expectedStatus) {
    throw new Error(
      `HTTP ${method} ${path} expected ${expectedStatus}, got ${response.status}: ${canonicalJson(payload)}`
    );
  }
  return payload;
}

async function approvedLifecycle({
  gateway,
  requesterToken,
  requesterId,
  approverToken,
  action,
  input,
  idempotencyKey = `machine-approved-${crypto.randomUUID()}`,
  expectedStatus = 200
}) {
  const confirmation = `confirm:${action}`;
  const needsConfirmation = await api(gateway, requesterToken, '/v1/intents', {
    method: 'POST',
    body: { action, input }
  }, 409);
  assert.equal(needsConfirmation.error?.code, 'confirmation_required');

  const needsApproval = await api(gateway, requesterToken, '/v1/intents', {
    method: 'POST',
    body: { action, input, confirmations: [confirmation] }
  }, 409);
  assert.equal(needsApproval.error?.code, 'independent_approval_required');
  const requestDigest = needsApproval.error?.details?.request_digest;
  assert.match(requestDigest, /^[a-f0-9]{64}$/);

  const approval = await api(gateway, approverToken, '/v1/intents', {
    method: 'POST',
    body: {
      action: 'approval.grant',
      input: {
        requester: requesterId,
        action,
        request_digest: requestDigest,
        expires_at: new Date(Date.now() + 60_000).toISOString()
      }
    }
  });
  assert.equal(approval.status, 'completed');

  const request = {
    action,
    input,
    confirmations: [confirmation],
    approval_ids: [approval.approval_id]
  };
  return {
    approval,
    request,
    result: await api(gateway, requesterToken, '/v1/intents', {
      method: 'POST',
      body: request,
      idempotencyKey
    }, expectedStatus),
    idempotencyKey
  };
}

test('Gateway and Hypervisor authorize lifecycle initialization and terminal mutation without Sandbox authority', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-machine-lifecycle-e2e-'));
  const portLease = await reserveProductionPortBlock('machine lifecycle e2e');
  const basePort = portLease.base_port;
  const tokens = {
    owner: `owner-${'o'.repeat(40)}`,
    limited: `limited-${'l'.repeat(40)}`,
    approver: `approver-${'a'.repeat(40)}`,
    machine: `machine-${'m'.repeat(40)}`
  };
  const root = machineRoot();
  const stack = await startDevelopmentStack({
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
    rateLimitCapacity: 2_000,
    rateLimitRefillPerSecond: 2_000,
    apiTokens: {
      [tokens.owner]: {
        id: 'machine-owner', type: 'human', roles: ['administrator'], scopes: ['*']
      },
      [tokens.limited]: {
        id: 'limited-human', type: 'human', roles: [], scopes: ['intent:execute']
      },
      [tokens.approver]: {
        id: 'machine-approver', type: 'human', roles: ['reviewer'],
        scopes: ['approval:write', 'intent:execute']
      },
      [tokens.machine]: root
    }
  });
  t.after(async () => {
    try {
      await stack.stop();
    } finally {
      await portLease.release();
      await rm(dataDir, { recursive: true, force: true });
    }
  });
  const gateway = `http://127.0.0.1:${basePort}`;
  const initializeAction = 'machine.principal.lifecycle.initialize';
  const initializeInput = {
    target_principal_id: root.id,
    reason: 'establish-retained-head'
  };

  const machineDenied = await api(gateway, tokens.machine, '/v1/intents', {
    method: 'POST',
    body: { action: initializeAction, input: initializeInput }
  }, 403);
  assert.equal(machineDenied.error?.code, 'forbidden');

  const limitedDenied = await api(gateway, tokens.limited, '/v1/intents', {
    method: 'POST',
    body: {
      action: initializeAction,
      input: { target_principal_id: 'agent.does.not.exist', reason: 'enumerate' }
    }
  }, 403);
  assert.equal(limitedDenied.error?.code, 'forbidden');

  for (const extra of [
    { command_id: `machine_cmd_${'1'.repeat(64)}` },
    { resolved_machine_root: root },
    { policy_digest: '9'.repeat(64) },
    { predecessor_lifecycle_seq: 1 }
  ]) {
    const rejected = await api(gateway, tokens.owner, '/v1/intents', {
      method: 'POST',
      body: { action: initializeAction, input: { ...initializeInput, ...extra } }
    }, 400);
    assert.equal(rejected.error?.code, 'validation_error');
  }

  const initialized = await approvedLifecycle({
    gateway,
    requesterToken: tokens.owner,
    requesterId: 'machine-owner',
    approverToken: tokens.approver,
    action: initializeAction,
    input: initializeInput
  });
  assert.equal(initialized.result.status, 'completed');
  assert.equal(initialized.result.lifecycle.principal_id, root.id);
  assert.equal(initialized.result.lifecycle.status, 'active');
  assert.equal(initialized.result.lifecycle.lifecycle_seq, 1);
  assert.equal(initialized.result.lifecycle.authority_effect, 'none');
  assert.equal(Object.hasOwn(initialized.result, 'capability'), false);

  const replay = await api(gateway, tokens.owner, '/v1/intents', {
    method: 'POST',
    body: initialized.request,
    idempotencyKey: initialized.idempotencyKey
  });
  assert.equal(replay.idempotent_replay, true);
  assert.equal(replay.result_json.lifecycle.lifecycle_seq, 1);

  const reused = await api(gateway, tokens.owner, '/v1/intents', {
    method: 'POST',
    body: initialized.request
  }, 403);
  assert.equal(reused.error?.code, 'approval_mismatch');

  const revokeAction = 'machine.principal.lifecycle.mutate';
  const narrowedAuthority = {
    ...root,
    constraints: {
      ...root.constraints,
      actions: ['system.echo'],
      budgets: {
        ...root.constraints.budgets,
        max_requests_per_minute: 5,
        max_execution_ms: 20_000
      }
    }
  };
  const narrowed = await approvedLifecycle({
    gateway,
    requesterToken: tokens.owner,
    requesterId: 'machine-owner',
    approverToken: tokens.approver,
    action: revokeAction,
    input: {
      target_principal_id: root.id,
      transition: 'narrow',
      reason: 'least-privilege',
      successor_authority: narrowedAuthority
    }
  });
  assert.equal(narrowed.result.lifecycle.status, 'narrowed');
  assert.equal(narrowed.result.lifecycle.lifecycle_seq, 2);

  const wideningCases = [
    {
      label: 'action',
      successor: {
        ...narrowedAuthority,
        constraints: { ...narrowedAuthority.constraints, actions: ['system.echo', 'system.hash'] }
      }
    },
    {
      label: 'destination',
      successor: {
        ...narrowedAuthority,
        constraints: { ...narrowedAuthority.constraints, destinations: ['local', 'remote'] }
      }
    },
    {
      label: 'budget',
      successor: {
        ...narrowedAuthority,
        constraints: {
          ...narrowedAuthority.constraints,
          budgets: { ...narrowedAuthority.constraints.budgets, max_execution_ms: 30_000 }
        }
      }
    }
  ];
  for (const testCase of wideningCases) {
    const denied = await approvedLifecycle({
      gateway,
      requesterToken: tokens.owner,
      requesterId: 'machine-owner',
      approverToken: tokens.approver,
      action: revokeAction,
      input: {
        target_principal_id: root.id,
        transition: 'narrow',
        reason: `widen-${testCase.label}`,
        successor_authority: testCase.successor
      },
      expectedStatus: 400
    });
    assert.equal(denied.result.error?.code, 'validation_error');
  }

  const revoked = await approvedLifecycle({
    gateway,
    requesterToken: tokens.owner,
    requesterId: 'machine-owner',
    approverToken: tokens.approver,
    action: revokeAction,
    input: {
      target_principal_id: root.id,
      transition: 'revoke',
      reason: 'incident-response'
    }
  });
  assert.equal(revoked.result.status, 'completed');
  assert.equal(revoked.result.lifecycle.status, 'revoked');
  assert.equal(revoked.result.lifecycle.lifecycle_seq, 3);
  assert.equal(revoked.result.lifecycle.effective_authority_digest, null);
  assert.equal(revoked.result.lifecycle.authority_effect, 'none');
});
