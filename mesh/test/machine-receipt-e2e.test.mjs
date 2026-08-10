import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createGatewayClient } from '../../packages/axiom-client/index.mjs';
import { digestObject } from '../src/lib/canonical.mjs';
import { loadTrustedKey } from '../src/lib/identity.mjs';
import { verifyMachineIntentReceipt } from '../src/lib/machine-receipt.mjs';
import { startDevelopmentStack } from '../src/dev.mjs';
import { reserveProductionPortBlock } from '../src/lib/production-host.mjs';

const HUMAN_TOKEN = `human-receipt-${'h'.repeat(32)}`;
const AGENT_TOKEN = `agent-receipt-${'a'.repeat(32)}`;
const OTHER_AGENT_TOKEN = `agent-receipt-other-${'b'.repeat(32)}`;

function machinePrincipal(id, sponsor, runtimeId) {
  return {
    id,
    type: 'agent',
    sponsor,
    roles: ['researcher'],
    scopes: ['intent:execute'],
    lifetime: 'session',
    expires_at: '2099-01-01T00:00:00.000Z',
    runtime: {
      id: runtimeId,
      kind: 'local-process',
      software_digest: 'd'.repeat(64)
    },
    constraints: {
      actions: ['system.echo'],
      purposes: ['test.conformance'],
      destinations: ['local'],
      budgets: {
        max_requests_per_minute: 60,
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
      id: 'owner.receipt-e2e',
      type: 'human',
      roles: ['administrator'],
      scopes: ['*']
    },
    [AGENT_TOKEN]: machinePrincipal(
      'agent.receipt-e2e',
      'owner.receipt-e2e',
      'runtime.receipt-e2e'
    ),
    [OTHER_AGENT_TOKEN]: machinePrincipal(
      'agent.receipt-other',
      'owner.receipt-e2e',
      'runtime.receipt-other'
    )
  };
}

async function stackFixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-machine-receipt-e2e-'));
  const lease = await reserveProductionPortBlock('machine receipt e2e');
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
  const client = token => createGatewayClient({
    token,
    request: (path, options) => fetch(`${gateway}${path}`, options)
  });
  return {
    dataDir,
    machine: client(AGENT_TOKEN),
    otherMachine: client(OTHER_AGENT_TOKEN),
    human: client(HUMAN_TOKEN)
  };
}

test('real Gateway returns an owner-scoped Grid-attested machine receipt that verifies independently', async t => {
  const { dataDir, machine, otherMachine, human } = await stackFixture(t);
  const result = await machine.call('intents.submit', {
    body: {
      action: 'system.echo',
      input: { message: 'receipt-bound-output' },
      purpose: 'test.conformance'
    },
    idempotencyKey: 'machine-receipt-e2e-0001'
  });
  assert.equal(result.status, 'completed');

  const receipt = await machine.call('machine_receipts.verify', {
    params: { id: result.intent_id }
  });
  assert.equal(receipt.schema, 'axiom-machine-intent-receipt.v1');
  assert.equal(receipt.statement.intent.intent_id, result.intent_id);
  assert.equal(receipt.statement.intent.principal, 'agent.receipt-e2e');
  assert.equal(receipt.statement.intent.action, 'system.echo');
  assert.equal(receipt.statement.intent.status, 'completed');
  assert.equal(receipt.statement.outcome.result_digest, digestObject(result));
  assert.equal(receipt.statement.authority.invocation_digest, result.evidence.invocation_digest);
  assert.equal(
    receipt.statement.authority.machine_authority_digest,
    result.evidence.machine_authority_digest
  );
  assert.deepEqual(
    receipt.statement.evidence_events.map(event => event.kind),
    ['intent.accepted', 'intent.completed']
  );
  assert.equal(receipt.statement.chain.valid, true);
  assert.ok(['checkpoint', 'full'].includes(receipt.statement.chain.verification_mode));
  assert.equal(receipt.statement.verification.owner_bound, true);
  assert.equal(receipt.statement.verification.request_bound, true);
  assert.equal(receipt.statement.verification.terminal_bound, true);
  assert.equal(receipt.statement.verification.chain_verified, true);
  assert.match(receipt.receipt_digest, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(receipt).includes('receipt-bound-output'), false);
  assert.equal(JSON.stringify(receipt).includes(AGENT_TOKEN), false);

  const gridKey = await loadTrustedKey(dataDir, 'grid');
  const verification = verifyMachineIntentReceipt(receipt, gridKey);
  assert.equal(verification.valid, true);
  assert.equal(verification.intent_id, result.intent_id);

  await assert.rejects(
    () => otherMachine.call('machine_receipts.verify', {
      params: { id: result.intent_id }
    }),
    error => error.code === 'forbidden' && error.status === 403
  );
  await assert.rejects(
    () => human.call('machine_receipts.verify', {
      params: { id: result.intent_id }
    }),
    error => error.code === 'forbidden' && error.status === 403
  );
});
