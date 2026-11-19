import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { digestObject, sha256 } from '../src/lib/canonical.mjs';
import { capabilityConsumptionEventId } from '../src/lib/capability-consumption.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { GridStore } from '../src/grid/store.mjs';

const D = character => character.repeat(64);
const PRINCIPAL = 'agent.currentness.recovery.1';
const OWNER = 'owner.alice';
const EPOCH = 'sandbox_epoch_currentness_recovery_1';
const CONSUMPTION_DIGEST = D('c');

function authority() {
  const profile = {
    id: PRINCIPAL,
    type: 'agent',
    sponsor: OWNER,
    roles: ['researcher'],
    scopes: ['intent:execute'],
    lifetime: 'session',
    expires_at: '2027-01-01T00:00:00.000Z',
    runtime: {
      id: 'runtime.currentness.recovery.1',
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

function initializeCommand(root) {
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
    reason: 'recovery-test',
    policy_version: '2026-11-19.1',
    policy_digest: D('9'),
    operation: 'machine.principal.lifecycle.initialize',
    intent_id: intentId,
    issued_at: '2026-11-19T20:00:00.000Z',
    effective_at: '2026-11-19T20:00:00.000Z',
    expires_at: '2026-11-20T20:00:00.000Z',
    command_id: `machine_cmd_${sha256(intentId)}`
  };
  const authorizationDigest = digestObject(authorization);
  return {
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
      effective_at: authorization.effective_at
    }
  };
}

function capabilityClaims(current) {
  return {
    iss: 'hypervisor', aud: 'sandbox', subject: PRINCIPAL, principal_type: 'agent',
    jti: 'cap_currentness_recovery_1', nbf: 1_795_113_599, exp: 1_795_200_000,
    intent_id: `intent_${D('4')}`, intent_digest: D('1'), invocation_digest: D('2'),
    policy_digest: D('3'), plan_digest: D('4'), tool: 'system.echo', action: 'system.echo',
    effect_destination: 'local', constraints: {},
    root_authority_digest: current.root_authority_digest,
    effective_authority_digest: current.effective_authority_digest,
    currentness_seq: current.lifecycle_seq,
    currentness_head_digest: current.lifecycle_head_digest,
    execution_attempt_id: 'attempt_currentness_recovery_1'
  };
}

async function fixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-machine-currentness-recovery-'));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const path = join(dataDir, 'grid.sqlite');
  let store = new GridStore({ path, dataDir, identity, protector });
  t.after(async () => {
    try { store.close(); } catch {}
    await rm(dataDir, { recursive: true, force: true });
  });
  return {
    get store() { return store; },
    restart() {
      store.close();
      store = new GridStore({ path, dataDir, identity, protector });
      return store;
    }
  };
}

function recordConsumption(store, claims) {
  store.appendEvents({
    traceId: 'trace:recovery:consumption',
    actor: PRINCIPAL,
    events: [{
      event_id: capabilityConsumptionEventId(claims.jti),
      kind: 'capability.consumed',
      subject: claims.jti,
      payload: {
        receipt: {
          statement: {
            schema: 'axiom-capability-consumption-receipt.v1',
            jti: claims.jti,
            execution_epoch: EPOCH
          },
          signature: { algorithm: 'Ed25519', value: 'test-only' }
        },
        receipt_digest: CONSUMPTION_DIGEST
      }
    }]
  });
}

function commitRelease(store, claims, overrides = {}) {
  return store.commitMachineEffectRelease({
    traceId: 'trace:recovery:release',
    actor: PRINCIPAL,
    capabilityClaims: claims,
    attemptId: claims.execution_attempt_id,
    sandboxExecutionEpoch: EPOCH,
    consumptionReceiptDigest: CONSUMPTION_DIGEST,
    observedAt: '2026-11-19T20:05:00.000Z',
    ...overrides
  });
}

test('committed lifecycle and release responses replay exactly after restart', async t => {
  const f = await fixture(t);
  const root = authority();
  const command = initializeCommand(root);
  const current = f.store.commitMachineCurrentnessMutation({
    traceId: 'trace:recovery:initialize', actor: OWNER, ...command
  });

  // Simulate a lost response by discarding the first result, restarting, and
  // retrying the exact command bytes.
  f.restart();
  const mutationReplay = f.store.commitMachineCurrentnessMutation({
    traceId: 'trace:recovery:initialize-replay', actor: OWNER, ...command
  });
  assert.deepEqual(mutationReplay, current);

  const claims = capabilityClaims(current);
  recordConsumption(f.store, claims);
  const committed = commitRelease(f.store, claims);
  f.restart();
  const replayed = commitRelease(f.store, claims);
  assert.equal(replayed.event, null);
  assert.deepEqual(replayed.release, committed.release);
});

test('release replay rejects attempt, epoch, and byte substitution with conflict', async t => {
  const f = await fixture(t);
  const root = authority();
  const current = f.store.commitMachineCurrentnessMutation({
    traceId: 'trace:recovery:initialize-conflicts',
    actor: OWNER,
    ...initializeCommand(root)
  });
  const claims = capabilityClaims(current);
  recordConsumption(f.store, claims);
  commitRelease(f.store, claims);

  assert.throws(
    () => commitRelease(f.store, claims, { attemptId: 'attempt_currentness_recovery_other' }),
    error => error?.code === 'machine_effect_release_conflict' && error?.status === 409
  );
  assert.throws(
    () => commitRelease(f.store, claims, { sandboxExecutionEpoch: 'sandbox_epoch_currentness_recovery_other' }),
    error => error?.status === 409
  );
  assert.throws(
    () => commitRelease(f.store, { ...claims, action: 'system.hash' }),
    error => error?.code === 'machine_effect_release_conflict' && error?.status === 409
  );
});
