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
const PRINCIPAL = 'agent.effect.release.1';
const OTHER_PRINCIPAL = 'agent.effect.release.other';
const OWNER = 'owner.alice';
const EPOCH = 'sandbox_epoch_effect_release_1';
const CONSUMPTION_DIGEST = D('c');

function authority(id = PRINCIPAL) {
  const profile = {
    id,
    type: 'agent',
    sponsor: OWNER,
    roles: ['researcher'],
    scopes: ['intent:execute'],
    lifetime: 'session',
    expires_at: '2027-01-01T00:00:00.000Z',
    runtime: {
      id: `runtime.${id}`,
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
  return {
    schema: 'axiom-machine-principal.v1',
    ...profile,
    authority_digest: digestObject(profile)
  };
}

function lifecycleCommand({ id = PRINCIPAL, root, current = null, transition = 'initialize', nonce }) {
  const intentId = `intent_${D(nonce)}`;
  const authorization = {
    schema: 'axiom-machine-principal-mutation-authorization.v1',
    actor_id: OWNER,
    target_principal_id: id,
    target_principal_type: 'agent',
    root_authority_digest: root.authority_digest,
    predecessor_lifecycle_seq: current?.lifecycle_seq ?? null,
    predecessor_lifecycle_head_digest: current?.lifecycle_head_digest ?? null,
    predecessor_authority_digest: current?.effective_authority_digest ?? null,
    transition_kind: transition,
    successor_authority_digest: transition === 'revoke' ? null : root.authority_digest,
    reason: 'effect-release-test',
    policy_version: '2026-11-19.1',
    policy_digest: D('9'),
    operation: transition === 'initialize'
      ? 'machine.principal.lifecycle.initialize'
      : 'machine.principal.lifecycle.mutate',
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
      principal_id: id,
      principal_type: 'agent',
      root_authority_digest: root.authority_digest,
      predecessor_lifecycle_seq: current?.lifecycle_seq ?? null,
      predecessor_lifecycle_head_digest: current?.lifecycle_head_digest ?? null,
      predecessor_authority_digest: current?.effective_authority_digest ?? null,
      successor_lifecycle_seq: (current?.lifecycle_seq ?? 0) + 1,
      successor_status: transition === 'revoke' ? 'revoked' : 'active',
      successor_authority_digest: transition === 'revoke' ? null : root.authority_digest,
      successor_authority: transition === 'revoke' ? null : root,
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

function claims(current) {
  return {
    iss: 'hypervisor',
    aud: 'sandbox',
    subject: PRINCIPAL,
    principal_type: 'agent',
    jti: 'cap_effect_release_1',
    nbf: 1_795_113_599,
    exp: 1_795_200_000,
    intent_id: `intent_${D('4')}`,
    intent_digest: D('1'),
    invocation_digest: D('2'),
    policy_digest: D('3'),
    plan_digest: D('4'),
    tool: 'system.echo',
    action: 'system.echo',
    effect_destination: 'local',
    constraints: {},
    root_authority_digest: current.root_authority_digest,
    effective_authority_digest: current.effective_authority_digest,
    currentness_seq: current.lifecycle_seq,
    currentness_head_digest: current.lifecycle_head_digest,
    execution_attempt_id: 'attempt_effect_release_1'
  };
}

async function fixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-machine-effect-release-'));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const store = new GridStore({
    path: join(dataDir, 'grid.sqlite'),
    dataDir,
    identity,
    protector
  });
  t.after(async () => {
    try { store.close(); } catch {}
    await rm(dataDir, { recursive: true, force: true });
  });
  return store;
}

function initialize(store, id, nonce) {
  const root = authority(id);
  return {
    root,
    current: store.commitMachineCurrentnessMutation({
      traceId: `trace:effect-release:init:${id}`,
      actor: OWNER,
      ...lifecycleCommand({ id, root, nonce })
    })
  };
}

function recordConsumption(store, capabilityClaims) {
  store.appendEvents({
    traceId: 'trace:effect-release:consumption',
    actor: PRINCIPAL,
    events: [{
      event_id: capabilityConsumptionEventId(capabilityClaims.jti),
      kind: 'capability.consumed',
      subject: capabilityClaims.jti,
      payload: {
        receipt: {
          statement: {
            schema: 'axiom-capability-consumption-receipt.v1',
            jti: capabilityClaims.jti,
            execution_epoch: EPOCH
          },
          signature: { algorithm: 'Ed25519', value: 'test-only' }
        },
        receipt_digest: CONSUMPTION_DIGEST
      }
    }]
  });
}

test('release commits exact currentness attempt epoch and rebuildable event projection', async t => {
  const store = await fixture(t);
  const { current } = initialize(store, PRINCIPAL, '1');
  const capabilityClaims = claims(current);
  recordConsumption(store, capabilityClaims);

  const committed = store.commitMachineEffectRelease({
    traceId: 'trace:effect-release:commit',
    actor: PRINCIPAL,
    capabilityClaims,
    attemptId: capabilityClaims.execution_attempt_id,
    sandboxExecutionEpoch: EPOCH,
    consumptionReceiptDigest: CONSUMPTION_DIGEST,
    observedAt: '2026-11-19T20:05:00.000Z'
  });

  assert.equal(committed.release.schema, 'axiom-machine-effect-release.v1');
  assert.equal(committed.release.capability_id, capabilityClaims.jti);
  assert.equal(committed.release.lifecycle_seq, current.lifecycle_seq);
  assert.equal(committed.release.lifecycle_head_digest, current.lifecycle_head_digest);
  assert.equal(committed.release.execution_attempt_id, capabilityClaims.execution_attempt_id);
  assert.equal(committed.release.sandbox_execution_epoch, EPOCH);
  assert.equal(committed.event.kind, 'machine.effect.released');
  assert.deepEqual(store.readMachineEffectRelease(committed.release.release_id), committed.release);

  const replayed = store.commitMachineEffectRelease({
    traceId: 'trace:effect-release:replay',
    actor: PRINCIPAL,
    capabilityClaims,
    attemptId: capabilityClaims.execution_attempt_id,
    sandboxExecutionEpoch: EPOCH,
    consumptionReceiptDigest: CONSUMPTION_DIGEST,
    observedAt: '2026-11-19T20:06:00.000Z'
  });
  assert.equal(replayed.event, null);
  assert.deepEqual(replayed.release, committed.release);

  store.rebuildMaterializedState();
  assert.deepEqual(store.readMachineEffectRelease(committed.release.release_id), committed.release);
});

test('release denies stale principal currentness but ignores unrelated lifecycle changes', async t => {
  const store = await fixture(t);
  const { root, current } = initialize(store, PRINCIPAL, '2');
  const capabilityClaims = claims(current);
  recordConsumption(store, capabilityClaims);

  initialize(store, OTHER_PRINCIPAL, '3');
  const released = store.commitMachineEffectRelease({
    traceId: 'trace:effect-release:unrelated',
    actor: PRINCIPAL,
    capabilityClaims,
    attemptId: capabilityClaims.execution_attempt_id,
    sandboxExecutionEpoch: EPOCH,
    consumptionReceiptDigest: CONSUMPTION_DIGEST,
    observedAt: '2026-11-19T20:05:00.000Z'
  });
  assert.equal(released.release.principal_id, PRINCIPAL);

  const secondClaims = { ...capabilityClaims, jti: 'cap_effect_release_2' };
  recordConsumption(store, secondClaims);
  store.commitMachineCurrentnessMutation({
    traceId: 'trace:effect-release:revoke',
    actor: OWNER,
    ...lifecycleCommand({ id: PRINCIPAL, root, current, transition: 'revoke', nonce: '5' })
  });
  assert.throws(
    () => store.commitMachineEffectRelease({
      traceId: 'trace:effect-release:stale',
      actor: PRINCIPAL,
      capabilityClaims: secondClaims,
      attemptId: secondClaims.execution_attempt_id,
      sandboxExecutionEpoch: EPOCH,
      consumptionReceiptDigest: CONSUMPTION_DIGEST,
      observedAt: '2026-11-19T20:05:00.000Z'
    }),
    error => error?.code === 'machine_currentness_stale'
  );
});

