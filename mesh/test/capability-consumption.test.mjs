import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { digestObject, sha256 } from '../src/lib/canonical.mjs';
import { signedFetch } from '../src/lib/client.mjs';
import { meshConfig } from '../src/lib/config.mjs';
import {
  buildCapabilityConsumptionStatement,
  capabilityConsumptionEventId,
  verifyCapabilityConsumptionReceipt
} from '../src/lib/capability-consumption.mjs';
import {
  ensureMeshIdentity,
  issueCapability,
  verifyCapability
} from '../src/lib/identity.mjs';
import { buildPlan, planDigest } from '../src/lib/plan.mjs';
import { createGridService } from '../src/grid/server.mjs';
import { createSandboxService } from '../src/sandbox/server.mjs';

function capabilityFixture(identity, {
  jti,
  suffix,
  ttlSeconds = 120
}) {
  const intent = {
    intent_id: `intent_capability_restart_${suffix}`,
    principal: {
      id: 'owner.restart',
      type: 'human',
      roles: ['administrator'],
      scopes: ['*']
    },
    action: 'system.echo',
    input: { message: `restart-safe-${suffix}` },
    purpose: 'restart-safe-capability-test',
    data_scopes: [],
    confirmations: [],
    approval_ids: [],
    submitted_at: new Date().toISOString()
  };
  const policyDigest = sha256(`capability-policy-${suffix}`);
  const plan = buildPlan(intent, {
    risk: 'low',
    tool: 'builtin.echo',
    constraints: {},
    policy_version: 'capability-restart-test.v1',
    policy_digest: policyDigest,
    policy_layers: [{
      version: 'capability-restart-test.v1',
      digest: policyDigest
    }]
  });
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: 'hypervisor',
    aud: 'sandbox',
    subject: intent.principal.id,
    principal_type: 'human',
    jti,
    nbf: now - 1,
    exp: now + ttlSeconds,
    intent_digest: digestObject(intent),
    tool: 'builtin.echo',
    constraints: {},
    policy_digest: policyDigest,
    plan_digest: planDigest(plan)
  };
  return {
    intent,
    plan,
    claims,
    capability: issueCapability(identity, claims)
  };
}

async function consumeCapability({
  identity,
  config,
  traceId,
  fixture,
  executionEpoch
}) {
  const response = await signedFetch(
    identity,
    'grid',
    `${config.urls.grid}/internal/v1/commit`,
    {
      method: 'POST',
      traceId,
      body: {
        actor: fixture.claims.subject,
        principal: fixture.claims.subject,
        events: [{
          kind: 'capability.consume.requested',
          subject: fixture.claims.jti,
          payload: {
            capability: fixture.capability,
            execution_epoch: executionEpoch
          }
        }]
      }
    }
  );
  assert.equal(response.events?.length, 1);
  assert.equal(response.events[0].kind, 'capability.consumed');
  const consumed = response.capability_consumptions?.[0];
  assert.ok(consumed);
  assert.equal(consumed.event_id, response.events[0].event_id);
  assert.equal(consumed.event_hash, response.events[0].event_hash);
  return consumed;
}

test('Grid receipt contract binds exact capability claims and Sandbox process epoch', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-capability-receipt-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const hypervisor = await ensureMeshIdentity(dataDir, 'hypervisor', { create: true });
  const grid = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const fixture = capabilityFixture(hypervisor, {
    jti: 'capability-contract-one',
    suffix: 'contract'
  });
  const verifiedClaims = verifyCapability(
    fixture.capability,
    hypervisor.publicKey,
    { audience: 'sandbox', issuer: 'hypervisor' }
  );
  const statement = buildCapabilityConsumptionStatement({
    capability: fixture.capability,
    claims: verifiedClaims,
    executionEpoch: 'sandbox_epoch_contract'
  });
  const receipt = {
    statement,
    signature: grid.signObject(statement)
  };

  const verified = verifyCapabilityConsumptionReceipt(receipt, {
    gridPublicKey: grid.publicKey,
    capability: fixture.capability,
    claims: verifiedClaims,
    executionEpoch: 'sandbox_epoch_contract'
  });
  assert.match(verified.receipt_digest, /^[a-f0-9]{64}$/);
  assert.equal(
    capabilityConsumptionEventId(verifiedClaims.jti),
    `evt_capability_consume_${sha256(verifiedClaims.jti)}`
  );
  assert.throws(
    () => verifyCapabilityConsumptionReceipt(receipt, {
      gridPublicKey: grid.publicKey,
      capability: fixture.capability,
      claims: verifiedClaims,
      executionEpoch: 'sandbox_epoch_restarted'
    }),
    error => error?.code === 'capability_consumption_mismatch'
  );

  const substituted = capabilityFixture(hypervisor, {
    jti: 'capability-contract-two',
    suffix: 'substitution'
  });
  assert.throws(
    () => verifyCapabilityConsumptionReceipt(receipt, {
      gridPublicKey: grid.publicKey,
      capability: substituted.capability,
      claims: substituted.claims,
      executionEpoch: 'sandbox_epoch_contract'
    }),
    error => error?.code === 'capability_consumption_mismatch'
  );
});

test('durable Grid consumption survives Sandbox and Grid restart and burns uncertain capabilities', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-capability-restart-'));
  const basePort = await findPortBlock();
  const config = meshConfig({
    dataDir,
    environment: 'test',
    autoBootstrap: true,
    gatewayPort: basePort,
    hypervisorPort: basePort + 1,
    sandboxPort: basePort + 2,
    gridPort: basePort + 3,
    hypervisorUrl: `http://127.0.0.1:${basePort + 1}`,
    sandboxUrl: `http://127.0.0.1:${basePort + 2}`,
    gridUrl: `http://127.0.0.1:${basePort + 3}`
  });
  const hypervisor = await ensureMeshIdentity(dataDir, 'hypervisor', { create: true });
  await ensureMeshIdentity(dataDir, 'grid', { create: true });
  await ensureMeshIdentity(dataDir, 'sandbox', { create: true });

  let grid = await createGridService(config);
  let sandbox = await createSandboxService(config);
  await grid.start();
  await sandbox.start();
  t.after(async () => {
    await sandbox?.stop().catch(() => {});
    await grid?.stop().catch(() => {});
    await rm(dataDir, { recursive: true, force: true });
  });

  const traceId = 'trace_capability_restart_safe';
  const operations = await signedFetch(
    hypervisor,
    'sandbox',
    `${config.urls.sandbox}/internal/v1/operations`,
    { traceId }
  );
  assert.equal(operations.status, 'ready');
  assert.match(operations.execution_epoch, /^sandbox_epoch_/);
  assert.equal(
    operations.topology.effect_path.join('>'),
    'gateway>hypervisor>sandbox>grid'
  );

  const executed = capabilityFixture(hypervisor, {
    jti: 'capability-restart-executed',
    suffix: 'executed'
  });
  const consumed = await consumeCapability({
    identity: hypervisor,
    config,
    traceId,
    fixture: executed,
    executionEpoch: operations.execution_epoch
  });
  const verifiedExecutedReceipt = verifyCapabilityConsumptionReceipt(
    consumed.receipt,
    {
      gridPublicKey: grid.identity.publicKey,
      capability: executed.capability,
      claims: executed.claims,
      executionEpoch: operations.execution_epoch
    }
  );
  assert.equal(consumed.receipt_digest, verifiedExecutedReceipt.receipt_digest);

  const execution = await signedFetch(
    hypervisor,
    'sandbox',
    `${config.urls.sandbox}/internal/v1/execute`,
    {
      method: 'POST',
      traceId,
      body: {
        intent: executed.intent,
        capability: executed.capability,
        plan: executed.plan,
        consumption_receipt: consumed.receipt
      }
    }
  );
  assert.equal(execution.result.output.message, 'restart-safe-executed');
  assert.equal(
    execution.attestation.statement.capability_consumption_receipt_digest,
    consumed.receipt_digest
  );
  assert.equal(
    execution.attestation.statement.sandbox_execution_epoch,
    operations.execution_epoch
  );
  await assert.rejects(
    () => signedFetch(
      hypervisor,
      'sandbox',
      `${config.urls.sandbox}/internal/v1/execute`,
      {
        method: 'POST',
        traceId: `${traceId}_same_process_replay`,
        body: {
          intent: executed.intent,
          capability: executed.capability,
          plan: executed.plan,
          consumption_receipt: consumed.receipt
        }
      }
    ),
    error => error?.code === 'capability_replayed'
  );

  // Simulate execution succeeding while Hypervisor dies before intent.completed:
  // no completion is appended, but the durable consume event remains authoritative.
  assert.equal(
    grid.store.db.prepare(`
      SELECT COUNT(*) AS count FROM events
      WHERE event_id = ? AND kind = 'capability.consumed'
    `).get(capabilityConsumptionEventId(executed.claims.jti)).count,
    1
  );
  assert.equal(
    grid.store.db.prepare(`
      SELECT COUNT(*) AS count FROM events
      WHERE subject = ? AND kind = 'intent.completed'
    `).get(executed.intent.intent_id).count,
    0
  );

  await sandbox.stop();
  sandbox = await createSandboxService(config);
  await sandbox.start();
  const restartedOperations = await signedFetch(
    hypervisor,
    'sandbox',
    `${config.urls.sandbox}/internal/v1/operations`,
    { traceId: `${traceId}_sandbox_restart` }
  );
  assert.notEqual(restartedOperations.execution_epoch, operations.execution_epoch);
  await assert.rejects(
    () => signedFetch(
      hypervisor,
      'sandbox',
      `${config.urls.sandbox}/internal/v1/execute`,
      {
        method: 'POST',
        traceId: `${traceId}_old_receipt`,
        body: {
          intent: executed.intent,
          capability: executed.capability,
          plan: executed.plan,
          consumption_receipt: consumed.receipt
        }
      }
    ),
    error => error?.code === 'capability_consumption_mismatch'
  );
  await assert.rejects(
    () => consumeCapability({
      identity: hypervisor,
      config,
      traceId: `${traceId}_duplicate_after_sandbox_restart`,
      fixture: executed,
      executionEpoch: restartedOperations.execution_epoch
    }),
    error => error?.code === 'capability_consumed'
  );

  // Simulate Grid consumption committing and Sandbox dying before any execution.
  const burned = capabilityFixture(hypervisor, {
    jti: 'capability-restart-burned',
    suffix: 'burned'
  });
  const burnedReceipt = await consumeCapability({
    identity: hypervisor,
    config,
    traceId: `${traceId}_burn_before_execute`,
    fixture: burned,
    executionEpoch: restartedOperations.execution_epoch
  });
  assert.match(burnedReceipt.receipt_digest, /^[a-f0-9]{64}$/);
  await sandbox.stop();
  sandbox = await createSandboxService(config);
  await sandbox.start();
  const thirdOperations = await signedFetch(
    hypervisor,
    'sandbox',
    `${config.urls.sandbox}/internal/v1/operations`,
    { traceId: `${traceId}_second_sandbox_restart` }
  );
  assert.notEqual(thirdOperations.execution_epoch, restartedOperations.execution_epoch);
  await assert.rejects(
    () => consumeCapability({
      identity: hypervisor,
      config,
      traceId: `${traceId}_burned_duplicate`,
      fixture: burned,
      executionEpoch: thirdOperations.execution_epoch
    }),
    error => error?.code === 'capability_consumed'
  );

  await grid.stop();
  grid = await createGridService(config);
  await grid.start();
  assert.equal(grid.store.verifyChain().valid, true);
  await assert.rejects(
    () => consumeCapability({
      identity: hypervisor,
      config,
      traceId: `${traceId}_duplicate_after_grid_restart`,
      fixture: burned,
      executionEpoch: thirdOperations.execution_epoch
    }),
    error => error?.code === 'capability_consumed'
  );

  await assert.rejects(
    () => signedFetch(
      hypervisor,
      'grid',
      `${config.urls.grid}/internal/v1/commit`,
      {
        method: 'POST',
        traceId: `${traceId}_forged_consumed`,
        body: {
          actor: burned.claims.subject,
          principal: burned.claims.subject,
          events: [{
            kind: 'capability.consumed',
            subject: 'forged-capability',
            payload: { receipt: {}, receipt_digest: sha256('forged') }
          }]
        }
      }
    ),
    error => error?.code === 'validation_error'
  );
  await assert.rejects(
    () => signedFetch(
      hypervisor,
      'grid',
      `${config.urls.grid}/internal/v1/commit`,
      {
        method: 'POST',
        traceId: `${traceId}_mixed_consume`,
        body: {
          actor: burned.claims.subject,
          principal: burned.claims.subject,
          events: [{
            kind: 'capability.consume.requested',
            subject: 'unrelated-jti',
            payload: {
              capability: burned.capability,
              execution_epoch: thirdOperations.execution_epoch
            }
          }, {
            kind: 'memory.put',
            subject: 'unrelated-memory',
            payload: {}
          }]
        }
      }
    ),
    error => error?.code === 'validation_error'
  );
});

test('restart-safe consumption reuses existing Hypervisor to Grid commit and adds no route', async () => {
  const { authorizeServiceRequest, ACTIVE_SERVICE_NETWORK_POLICY } = await import(
    '../src/lib/service-network-policy.mjs'
  );
  const commit = authorizeServiceRequest({
    policy: ACTIVE_SERVICE_NETWORK_POLICY,
    source: 'hypervisor',
    destination: 'grid',
    method: 'POST',
    url: 'http://127.0.0.1:8083/internal/v1/commit'
  });
  assert.equal(commit.allowed, true);
  assert.throws(
    () => authorizeServiceRequest({
      policy: ACTIVE_SERVICE_NETWORK_POLICY,
      source: 'sandbox',
      destination: 'grid',
      method: 'POST',
      url: 'http://127.0.0.1:8083/internal/v1/commit'
    }),
    error => error?.code === 'service_network_policy_denied'
  );
  assert.equal(
    ACTIVE_SERVICE_NETWORK_POLICY.network_segments.some(
      segment => segment.members.includes('sandbox') && segment.members.includes('grid')
    ),
    false
  );
  const routes = ACTIVE_SERVICE_NETWORK_POLICY.flows.flatMap(flow => flow.routes);
  assert.equal(routes.length, 41);
  assert.equal(
    routes.some(route => route.path === '/internal/v1/capabilities/consume'),
    false
  );
});

async function findPortBlock() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const base = 42_000 + Math.floor(Math.random() * 10_000);
    const servers = [];
    try {
      for (let port = base; port < base + 4; port += 1) {
        const server = net.createServer();
        await new Promise((resolve, reject) => {
          server.once('error', reject);
          server.listen(port, '127.0.0.1', resolve);
        });
        servers.push(server);
      }
      await Promise.all(
        servers.map(server => new Promise(resolve => server.close(resolve)))
      );
      return base;
    } catch {
      await Promise.all(
        servers.map(server => new Promise(resolve => server.close(resolve)))
      );
    }
  }
  throw new Error('Unable to reserve a local capability-test port block');
}
