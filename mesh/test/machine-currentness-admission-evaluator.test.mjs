import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { MeshIdentity } from '../src/lib/identity.mjs';
import {
  createMachineCurrentnessControllerKeyCredential
} from '../src/lib/machine-currentness-controller-key-lifecycle.mjs';
import {
  createMachinePrincipalCurrentnessCheckpoint
} from '../src/lib/machine-principal-currentness-checkpoint.mjs';
import {
  openMachinePrincipalCurrentnessStore
} from '../src/lib/machine-principal-currentness-store.mjs';
import {
  evaluateRetainedMachineCurrentnessAdmission
} from '../src/lib/machine-currentness-admission-evaluator.mjs';
import {
  verifyMachineCurrentnessAdmissionReceipt
} from '../src/lib/machine-currentness-admission-receipt.mjs';

function gridIdentity() {
  const pair = generateKeyPairSync('ed25519');
  return new MeshIdentity(
    'grid',
    pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    pair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
  );
}

function currentness({
  authorityDigest = 'a'.repeat(64),
  status = 'active',
  sequence = 1,
  observedAt = '2026-09-01T18:00:00.000Z',
  sourceHead = 'b'.repeat(64),
  predecessorHead = null
} = {}) {
  return {
    schema: 'axiom-machine-principal-currentness.v1',
    principal_id: 'agent.runtime.currentness',
    principal_type: 'agent',
    authority_digest: authorityDigest,
    status,
    sequence,
    observed_at: observedAt,
    source_head_digest: sourceHead,
    predecessor_head_digest: predecessorHead,
    authority_effect: 'none',
    execution_authority_granted: false,
    global_currentness_claimed: false
  };
}

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'axiom-machine-currentness-evaluator-'));
  t.after(async () => rm(dir, { recursive: true, force: true }));
  const root = generateKeyPairSync('ed25519');
  const operational = generateKeyPairSync('ed25519');
  const credential = createMachineCurrentnessControllerKeyCredential({
    principalId: 'controller.currentness.runtime',
    rootPrivateKey: root.privateKey,
    trustedRootPublicKey: root.publicKey,
    operationalPublicKey: operational.publicKey,
    keyEpoch: 1,
    activatedAt: '2026-09-01T17:59:00.000Z'
  });
  const store = await openMachinePrincipalCurrentnessStore({
    statePath: join(dir, 'currentness.jsonl'),
    trustedControllerPublicKey: operational.publicKey,
    expectedPrincipalId: 'agent.runtime.currentness',
    expectedPrincipalType: 'agent'
  });
  return { root, operational, credential, store, grid: gridIdentity() };
}

function request(overrides = {}) {
  return {
    principalId: 'agent.runtime.currentness',
    principalType: 'agent',
    authorityDigest: 'a'.repeat(64),
    capabilityId: 'cap_' + 'c'.repeat(64),
    intentDigest: 'd'.repeat(64),
    planDigest: 'e'.repeat(64),
    effectDestination: 'local',
    maxCurrentnessAgeMs: 5_000,
    now: new Date('2026-09-01T18:00:02.000Z'),
    ...overrides
  };
}

test('Grid evaluator uses retained lifecycle-verified head and emits exact effect-bound receipt', async t => {
  const f = await fixture(t);
  const checkpoint = createMachinePrincipalCurrentnessCheckpoint({
    currentness: currentness(),
    controllerPrivateKey: f.operational.privateKey,
    trustedControllerPublicKey: f.operational.publicKey
  });
  await f.store.retain(checkpoint);

  const result = await evaluateRetainedMachineCurrentnessAdmission({
    identity: f.grid,
    currentnessStore: f.store,
    controllerCredential: f.credential,
    trustedControllerRootPublicKey: f.root.publicKey,
    expectedControllerPrincipalId: 'controller.currentness.runtime',
    ...request()
  });
  assert.equal(result.allow, true);
  assert.equal(result.execution_authority_granted, false);
  assert.equal(result.retained_checkpoint_digest, checkpoint.checkpoint_digest);
  assert.equal(result.receipt.receipt_digest, result.receipt_digest);

  const verifiedReceipt = verifyMachineCurrentnessAdmissionReceipt(result.receipt, {
    gridPublicKey: f.grid.publicKey,
    expectedPrincipalId: 'agent.runtime.currentness',
    expectedPrincipalType: 'agent',
    expectedAuthorityDigest: 'a'.repeat(64),
    expectedCapabilityId: request().capabilityId,
    expectedIntentDigest: request().intentDigest,
    expectedPlanDigest: request().planDigest,
    expectedEffectDestination: 'local',
    expectedRetainedCheckpointDigest: checkpoint.checkpoint_digest,
    expectedRetainedSourceHeadDigest: checkpoint.statement.source_head_digest,
    maxAgeMs: 5_000,
    now: new Date('2026-09-01T18:00:03.000Z')
  });
  assert.equal(verifiedReceipt.valid, true);
});

test('no retained head fails closed without creating a receipt', async t => {
  const f = await fixture(t);
  const result = await evaluateRetainedMachineCurrentnessAdmission({
    identity: f.grid,
    currentnessStore: f.store,
    controllerCredential: f.credential,
    trustedControllerRootPublicKey: f.root.publicKey,
    expectedControllerPrincipalId: 'controller.currentness.runtime',
    ...request()
  });
  assert.equal(result.allow, false);
  assert.equal(result.code, 'machine_currentness_unavailable');
  assert.equal('receipt' in result, false);
});

test('narrowed, revoked, authority-changed, or stale retained state cannot mint admission receipt', async t => {
  for (const variant of [
    { status: 'narrowed' },
    { status: 'revoked' },
    { authorityDigest: '9'.repeat(64) },
    { observedAt: '2026-09-01T17:59:00.000Z' }
  ]) {
    await t.test(JSON.stringify(variant), async st => {
      const f = await fixture(st);
      const checkpoint = createMachinePrincipalCurrentnessCheckpoint({
        currentness: currentness(variant),
        controllerPrivateKey: f.operational.privateKey,
        trustedControllerPublicKey: f.operational.publicKey
      });
      await f.store.retain(checkpoint);
      const result = await evaluateRetainedMachineCurrentnessAdmission({
        identity: f.grid,
        currentnessStore: f.store,
        controllerCredential: f.credential,
        trustedControllerRootPublicKey: f.root.publicKey,
        expectedControllerPrincipalId: 'controller.currentness.runtime',
        ...request()
      });
      assert.equal(result.allow, false);
      assert.equal('receipt' in result, false);
    });
  }
});

test('external mutation of retained store is detected before Grid can sign a currentness receipt', async t => {
  const f = await fixture(t);
  const checkpoint = createMachinePrincipalCurrentnessCheckpoint({
    currentness: currentness(),
    controllerPrivateKey: f.operational.privateKey,
    trustedControllerPublicKey: f.operational.publicKey
  });
  await f.store.retain(checkpoint);

  // verifyState is part of the evaluator contract; simulate an active-store
  // integrity failure without weakening the real durable store implementation.
  const wrappedStore = {
    retainedHead: () => f.store.retainedHead(),
    verifyState: async () => {
      throw new Error('simulated durable state divergence');
    }
  };
  await assert.rejects(
    evaluateRetainedMachineCurrentnessAdmission({
      identity: f.grid,
      currentnessStore: wrappedStore,
      controllerCredential: f.credential,
      trustedControllerRootPublicKey: f.root.publicKey,
      expectedControllerPrincipalId: 'controller.currentness.runtime',
      ...request()
    }),
    /durable state divergence/
  );
});
