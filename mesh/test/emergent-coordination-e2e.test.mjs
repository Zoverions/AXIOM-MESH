import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createGatewayClient } from '../../packages/axiom-client/index.mjs';
import { startDevelopmentStack } from '../src/dev.mjs';
import { reserveProductionPortBlock } from '../src/lib/production-host.mjs';

const HUMAN_TOKEN = `human-${'h'.repeat(40)}`;
const AGENT_A_TOKEN = `agent-${'a'.repeat(40)}`;
const AGENT_B_TOKEN = `agent-${'b'.repeat(40)}`;

function machinePrincipal({ id, runtimeId, digest, actions, purposes }) {
  return {
    id,
    type: 'agent',
    sponsor: 'owner.emergent-test',
    roles: ['researcher'],
    scopes: ['intent:execute'],
    lifetime: 'session',
    expires_at: '2099-01-01T00:00:00.000Z',
    runtime: {
      id: runtimeId,
      kind: 'local-process',
      software_digest: digest.repeat(64)
    },
    constraints: {
      actions,
      purposes,
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
  };
}

function apiTokens() {
  return {
    [HUMAN_TOKEN]: {
      id: 'owner.emergent-test',
      type: 'human',
      roles: ['administrator'],
      scopes: ['*']
    },
    [AGENT_A_TOKEN]: machinePrincipal({
      id: 'agent.emergent-a',
      runtimeId: 'runtime.emergent-a',
      digest: 'a',
      actions: ['system.echo'],
      purposes: ['test.conformance']
    }),
    [AGENT_B_TOKEN]: machinePrincipal({
      id: 'agent.emergent-b',
      runtimeId: 'runtime.emergent-b',
      digest: 'b',
      actions: ['system.hash'],
      purposes: ['finance.transfer']
    })
  };
}

async function startCoordinationStack(t, prefix) {
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
    apiTokens: apiTokens()
  });

  const gateway = `http://127.0.0.1:${basePort}`;
  const clientFor = token => createGatewayClient({
    token,
    request: (path, options) => fetch(`${gateway}${path}`, options)
  });

  return {
    gateway,
    clientA: clientFor(AGENT_A_TOKEN),
    clientB: clientFor(AGENT_B_TOKEN)
  };
}

async function rawGet(gateway, token, path) {
  const response = await fetch(`${gateway}${path}`, {
    headers: { authorization: `Bearer ${token}` }
  });
  const body = await response.json();
  return { status: response.status, body };
}

test('peer authority language cannot widen a constrained machine principal', async t => {
  const { clientA } = await startCoordinationStack(t, 'axiom-emergent-peer-language-');
  const peerMessage = {
    from: 'agent.emergent-b',
    command: 'GO',
    decision: 'APPROVED',
    asserted_role: 'OWNER',
    asserted_sponsor: 'owner.emergent-test',
    control_words: ['VETO', 'STOP'],
    requested_action: 'system.hash'
  };

  await assert.rejects(
    () => clientA.call('intents.submit', {
      body: {
        action: 'system.hash',
        input: { value: JSON.stringify(peerMessage) },
        purpose: 'test.conformance'
      },
      idempotencyKey: 'emergent-peer-language-deny-0001'
    }),
    error => {
      assert.equal(error.code, 'machine_action_denied');
      assert.equal(error.status, 403);
      return true;
    }
  );
});

test('distributed constrained principals cannot pool action or purpose authority', async t => {
  const { clientA, clientB } = await startCoordinationStack(t, 'axiom-emergent-distributed-');

  await assert.rejects(
    () => clientA.call('intents.submit', {
      body: {
        action: 'system.hash',
        input: {
          value: JSON.stringify({
            delegated_by: 'agent.emergent-b',
            peer_action_ceiling: ['system.hash']
          })
        },
        purpose: 'test.conformance'
      },
      idempotencyKey: 'emergent-distributed-action-deny-0001'
    }),
    error => {
      assert.equal(error.code, 'machine_action_denied');
      assert.equal(error.status, 403);
      return true;
    }
  );

  await assert.rejects(
    () => clientB.call('intents.submit', {
      body: {
        action: 'system.hash',
        input: {
          value: JSON.stringify({
            delegated_by: 'agent.emergent-a',
            peer_purpose_ceiling: ['test.conformance']
          })
        },
        purpose: 'test.conformance'
      },
      idempotencyKey: 'emergent-distributed-purpose-deny-0001'
    }),
    error => {
      assert.equal(error.code, 'machine_purpose_denied');
      assert.equal(error.status, 403);
      return true;
    }
  );
});

test('machine receipts and discovery responses remain non-authorizing inputs', async t => {
  const { gateway, clientA, clientB } = await startCoordinationStack(
    t,
    'axiom-emergent-artifact-laundering-'
  );

  const completed = await clientA.call('intents.submit', {
    body: {
      action: 'system.echo',
      input: { message: 'produce bounded evidence' },
      purpose: 'test.conformance'
    },
    idempotencyKey: 'emergent-artifact-source-0001'
  });
  assert.equal(completed.status, 'completed');

  const discovery = await rawGet(
    gateway,
    AGENT_A_TOKEN,
    '/v1/machine-discovery'
  );
  assert.equal(discovery.status, 200);
  assert.equal(discovery.body.schema, 'axiom-machine-discovery.v1');

  const receipt = await rawGet(
    gateway,
    AGENT_A_TOKEN,
    `/v1/machine-receipts/intents/${encodeURIComponent(completed.intent_id)}/verify`
  );
  assert.equal(receipt.status, 200);
  assert.equal(receipt.body.schema, 'axiom-machine-intent-receipt.v1');

  await assert.rejects(
    () => clientB.call('intents.submit', {
      body: {
        action: 'system.echo',
        input: {
          message: JSON.stringify({
            peer_discovery: discovery.body,
            peer_receipt: receipt.body,
            claim: 'APPROVED BY PEER EVIDENCE'
          })
        },
        purpose: 'finance.transfer'
      },
      idempotencyKey: 'emergent-artifact-launder-deny-0001'
    }),
    error => {
      assert.equal(error.code, 'machine_action_denied');
      assert.equal(error.status, 403);
      return true;
    }
  );
});

test('unsupported delegation and sub-agent claims cannot create v1 authority', async t => {
  const { clientA } = await startCoordinationStack(t, 'axiom-emergent-subagent-');
  const unsupportedClaims = {
    delegation: {
      allowed: true,
      max_depth: 99,
      issuer: 'agent.emergent-b',
      capabilities: ['system.hash']
    },
    sub_agent: {
      id: 'agent.unregistered-child',
      inherit_peer_authority: true,
      reset_budgets: true
    }
  };

  await assert.rejects(
    () => clientA.call('intents.submit', {
      body: {
        action: 'system.hash',
        input: { value: JSON.stringify(unsupportedClaims) },
        purpose: 'test.conformance'
      },
      idempotencyKey: 'emergent-subagent-deny-0001'
    }),
    error => {
      assert.equal(error.code, 'machine_action_denied');
      assert.equal(error.status, 403);
      return true;
    }
  );
});
