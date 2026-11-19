import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { digestObject, sha256 } from '../src/lib/canonical.mjs';
import { closeTransportPools, signedFetch } from '../src/lib/client.mjs';
import { meshConfig } from '../src/lib/config.mjs';
import { capabilityConsumptionEventId } from '../src/lib/capability-consumption.mjs';
import { ensureMeshIdentity, issueCapability, loadTrustedKey } from '../src/lib/identity.mjs';
import { verifyMachineEffectReleaseReceipt } from '../src/lib/machine-effect-release.mjs';
import { reserveProductionPortBlock } from '../src/lib/production-host.mjs';
import { createGridService } from '../src/grid/server.mjs';

const D = character => character.repeat(64);
const PRINCIPAL = 'agent.effect.release.route.1';
const OWNER = 'owner.alice';
const EPOCH = 'sandbox_epoch_effect_release_route_1';
const CONSUMPTION_DIGEST = D('c');

function authority(expiresAt) {
  const profile = {
    id: PRINCIPAL,
    type: 'agent',
    sponsor: OWNER,
    roles: ['researcher'],
    scopes: ['intent:execute'],
    lifetime: 'session',
    expires_at: expiresAt,
    runtime: {
      id: 'runtime.effect.release.route.1',
      kind: 'local-process',
      software_digest: D('a')
    },
    constraints: {
      actions: ['system.echo'],
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
  return { schema: 'axiom-machine-principal.v1', ...profile, authority_digest: digestObject(profile) };
}

function initialize(store, root) {
  const issuedAt = new Date(Date.now() - 1_000).toISOString();
  const intentId = `intent_${D('1')}`;
  const authorization = {
    schema: 'axiom-machine-principal-mutation-authorization.v1',
    actor_id: OWNER,
    target_principal_id: PRINCIPAL,
    target_principal_type: 'agent',
    root_authority_digest: root.authority_digest,
    predecessor_lifecycle_seq: null,
    predecessor_lifecycle_head_digest: null,
    predecessor_authority_digest: null,
    transition_kind: 'initialize',
    successor_authority_digest: root.authority_digest,
    reason: 'effect-release-route-test',
    policy_version: 'route-test.v1',
    policy_digest: D('9'),
    operation: 'machine.principal.lifecycle.initialize',
    intent_id: intentId,
    issued_at: issuedAt,
    effective_at: issuedAt,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    command_id: `machine_cmd_${sha256(intentId)}`
  };
  const authorizationDigest = digestObject(authorization);
  return store.commitMachineCurrentnessMutation({
    traceId: 'trace:effect-release-route:init',
    actor: OWNER,
    authorization,
    transition: {
      schema: 'axiom-machine-principal-lifecycle-transition.v1',
      principal_id: PRINCIPAL,
      principal_type: 'agent',
      root_authority_digest: root.authority_digest,
      predecessor_lifecycle_seq: null,
      predecessor_lifecycle_head_digest: null,
      predecessor_authority_digest: null,
      successor_lifecycle_seq: 1,
      successor_status: 'active',
      successor_authority_digest: root.authority_digest,
      successor_authority: root,
      command_id: authorization.command_id,
      command_digest: authorizationDigest,
      mutation_authorization_digest: authorizationDigest,
      actor_id: OWNER,
      policy_version: authorization.policy_version,
      policy_digest: authorization.policy_digest,
      reason: authorization.reason,
      effective_at: issuedAt
    }
  });
}

async function fixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-machine-effect-release-route-'));
  const lease = await reserveProductionPortBlock('machine effect release route');
  const basePort = lease.base_port;
  const config = meshConfig({
    dataDir,
    environment: 'test',
    autoBootstrap: true,
    capabilityTtlSeconds: 60,
    gatewayPort: basePort,
    hypervisorPort: basePort + 1,
    sandboxPort: basePort + 2,
    gridPort: basePort + 3,
    hypervisorUrl: `http://127.0.0.1:${basePort + 1}`,
    sandboxUrl: `http://127.0.0.1:${basePort + 2}`,
    gridUrl: `http://127.0.0.1:${basePort + 3}`
  });
  const hypervisor = await ensureMeshIdentity(dataDir, 'hypervisor', { create: true });
  const gateway = await ensureMeshIdentity(dataDir, 'gateway', { create: true });
  await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const grid = await createGridService(config);
  await grid.start();
  t.after(async () => {
    closeTransportPools();
    try { await grid.stop().catch(() => {}); } finally {
      await lease.release();
      await rm(dataDir, { recursive: true, force: true });
    }
  });
  return { config, gateway, grid, hypervisor };
}

test('Grid release route is Hypervisor-only and returns an exact signed receipt', async t => {
  const f = await fixture(t);
  const root = authority(new Date(Date.now() + 3_600_000).toISOString());
  const current = initialize(f.grid.store, root);
  const now = Math.floor(Date.now() / 1_000);
  const claims = {
    iss: 'hypervisor', aud: 'sandbox', subject: PRINCIPAL, principal_type: 'agent',
    jti: 'cap_effect_release_route_1', nbf: now - 1, exp: now + 60,
    intent_id: `intent_${D('4')}`, intent_digest: D('1'), invocation_digest: D('2'),
    policy_digest: D('3'), plan_digest: D('4'), tool: 'system.echo', action: 'system.echo',
    effect_destination: 'local', constraints: {},
    root_authority_digest: current.root_authority_digest,
    effective_authority_digest: current.effective_authority_digest,
    currentness_seq: current.lifecycle_seq,
    currentness_head_digest: current.lifecycle_head_digest,
    execution_attempt_id: 'attempt_effect_release_route_1'
  };
  const capability = issueCapability(f.hypervisor, claims);
  f.grid.store.appendEvents({
    traceId: 'trace:effect-release-route:consume',
    actor: PRINCIPAL,
    events: [{
      event_id: capabilityConsumptionEventId(claims.jti),
      kind: 'capability.consumed',
      subject: claims.jti,
      payload: {
        receipt: {
          statement: { schema: 'axiom-capability-consumption-receipt.v1', jti: claims.jti, execution_epoch: EPOCH },
          signature: { algorithm: 'Ed25519', value: 'test-only' }
        },
        receipt_digest: CONSUMPTION_DIGEST
      }
    }]
  });
  const url = `${f.config.urls.grid}/internal/v1/machine-effect/release`;
  const body = {
    actor: PRINCIPAL,
    capability,
    attempt_id: claims.execution_attempt_id,
    sandbox_execution_epoch: EPOCH,
    consumption_receipt_digest: CONSUMPTION_DIGEST
  };

  await assert.rejects(
    () => signedFetch(f.gateway, 'grid', url, { method: 'POST', traceId: 'trace:wrong-caller', body }),
    error => error?.status === 403
  );

  const receipt = await signedFetch(f.hypervisor, 'grid', url, {
    method: 'POST', traceId: 'trace:release-route', body
  });
  const gridKey = await loadTrustedKey(f.config.dataDir, 'grid');
  const verified = verifyMachineEffectReleaseReceipt(receipt, {
    gridPublicKey: gridKey,
    claims,
    consumptionReceiptDigest: CONSUMPTION_DIGEST,
    attemptId: claims.execution_attempt_id,
    executionEpoch: EPOCH
  });
  assert.equal(verified.statement.capability_id, claims.jti);
  assert.equal(verified.statement.authority_effect, 'exact-machine-effect-release');

  await assert.rejects(
    () => signedFetch(f.hypervisor, 'grid', url, {
      method: 'POST', traceId: 'trace:release-route:mismatch',
      body: { ...body, sandbox_execution_epoch: 'sandbox_epoch_substituted' }
    }),
    error => error?.code === 'capability_consumption_mismatch'
  );
});

