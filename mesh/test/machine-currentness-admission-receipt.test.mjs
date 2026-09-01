import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import { MeshIdentity } from '../src/lib/identity.mjs';
import {
  createMachineCurrentnessAdmissionReceipt,
  machineCurrentnessAdmissionBindingDigest,
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

function fixture() {
  return {
    principalId: 'agent.currentness.1',
    principalType: 'agent',
    authorityDigest: 'a'.repeat(64),
    capabilityId: 'cap_' + 'b'.repeat(64),
    intentDigest: 'c'.repeat(64),
    planDigest: 'd'.repeat(64),
    effectDestination: 'local',
    retainedCheckpointDigest: 'e'.repeat(64),
    retainedSourceHeadDigest: 'f'.repeat(64),
    currentnessSequence: 7,
    currentnessObservedAt: '2026-09-01T17:59:00.000Z',
    controllerCredentialDigest: '1'.repeat(64),
    controllerKeyEpoch: 3,
    evaluatedAt: '2026-09-01T17:59:01.000Z'
  };
}

test('Grid-signed machine currentness admission receipt binds exact effect and remains non-authorizing', () => {
  const grid = gridIdentity();
  const f = fixture();
  const receipt = createMachineCurrentnessAdmissionReceipt({
    identity: grid,
    ...f
  });
  const verified = verifyMachineCurrentnessAdmissionReceipt(receipt, {
    gridPublicKey: grid.publicKey,
    expectedPrincipalId: f.principalId,
    expectedPrincipalType: f.principalType,
    expectedAuthorityDigest: f.authorityDigest,
    expectedCapabilityId: f.capabilityId,
    expectedIntentDigest: f.intentDigest,
    expectedPlanDigest: f.planDigest,
    expectedEffectDestination: f.effectDestination,
    expectedRetainedCheckpointDigest: f.retainedCheckpointDigest,
    expectedRetainedSourceHeadDigest: f.retainedSourceHeadDigest,
    maxAgeMs: 5_000,
    now: new Date('2026-09-01T17:59:02.000Z')
  });
  assert.equal(verified.valid, true);
  assert.equal(verified.execution_authority_granted, false);
  assert.equal(verified.authority_effect, 'none');
  assert.equal(verified.capability_promotion_effect, 'none');
  assert.equal(verified.global_currentness_claimed, false);
  assert.equal(verified.currentness_sequence, 7);
  assert.equal(
    verified.admission_binding_digest,
    machineCurrentnessAdmissionBindingDigest({
      ...f
    })
  );
});

test('receipt transplantation to another capability, plan, destination, or retained head is rejected', () => {
  const grid = gridIdentity();
  const f = fixture();
  const receipt = createMachineCurrentnessAdmissionReceipt({
    identity: grid,
    ...f
  });
  const base = {
    gridPublicKey: grid.publicKey,
    expectedPrincipalId: f.principalId,
    expectedPrincipalType: f.principalType,
    expectedAuthorityDigest: f.authorityDigest,
    expectedCapabilityId: f.capabilityId,
    expectedIntentDigest: f.intentDigest,
    expectedPlanDigest: f.planDigest,
    expectedEffectDestination: f.effectDestination,
    expectedRetainedCheckpointDigest: f.retainedCheckpointDigest,
    expectedRetainedSourceHeadDigest: f.retainedSourceHeadDigest,
    maxAgeMs: 5_000,
    now: new Date('2026-09-01T17:59:02.000Z')
  };
  for (const override of [
    { expectedCapabilityId: 'cap_' + '9'.repeat(64) },
    { expectedPlanDigest: '8'.repeat(64) },
    { expectedEffectDestination: 'provider:other' },
    { expectedRetainedCheckpointDigest: '7'.repeat(64) },
    { expectedRetainedSourceHeadDigest: '6'.repeat(64) }
  ]) {
    assert.throws(
      () => verifyMachineCurrentnessAdmissionReceipt(receipt, { ...base, ...override }),
      /does not bind|retained .* mismatch/i
    );
  }
});

test('tampered Grid statement, wrong Grid key and stale receipt fail closed', () => {
  const grid = gridIdentity();
  const other = gridIdentity();
  const f = fixture();
  const receipt = createMachineCurrentnessAdmissionReceipt({
    identity: grid,
    ...f
  });
  const args = {
    expectedPrincipalId: f.principalId,
    expectedPrincipalType: f.principalType,
    expectedAuthorityDigest: f.authorityDigest,
    expectedCapabilityId: f.capabilityId,
    expectedIntentDigest: f.intentDigest,
    expectedPlanDigest: f.planDigest,
    expectedEffectDestination: f.effectDestination,
    expectedRetainedCheckpointDigest: f.retainedCheckpointDigest,
    expectedRetainedSourceHeadDigest: f.retainedSourceHeadDigest,
    maxAgeMs: 5_000
  };

  assert.throws(() => verifyMachineCurrentnessAdmissionReceipt({
    ...receipt,
    statement: { ...receipt.statement, currentness_sequence: 8 }
  }, {
    ...args,
    gridPublicKey: grid.publicKey,
    now: new Date('2026-09-01T17:59:02.000Z')
  }), /signature verification/);

  assert.throws(() => verifyMachineCurrentnessAdmissionReceipt(receipt, {
    ...args,
    gridPublicKey: other.publicKey,
    now: new Date('2026-09-01T17:59:02.000Z')
  }), /signature verification/);

  assert.throws(() => verifyMachineCurrentnessAdmissionReceipt(receipt, {
    ...args,
    gridPublicKey: grid.publicKey,
    now: new Date('2026-09-01T17:59:10.000Z')
  }), /stale or future-dated/);
});

test('receipt refuses malformed or authority-widening statements even if outer object is otherwise shaped correctly', () => {
  const grid = gridIdentity();
  const f = fixture();
  const receipt = createMachineCurrentnessAdmissionReceipt({
    identity: grid,
    ...f
  });
  const widened = {
    ...receipt,
    statement: {
      ...receipt.statement,
      execution_authority_granted: true
    }
  };
  assert.throws(() => verifyMachineCurrentnessAdmissionReceipt(widened, {
    gridPublicKey: grid.publicKey,
    expectedPrincipalId: f.principalId,
    expectedPrincipalType: f.principalType,
    expectedAuthorityDigest: f.authorityDigest,
    expectedCapabilityId: f.capabilityId,
    expectedIntentDigest: f.intentDigest,
    expectedPlanDigest: f.planDigest,
    expectedEffectDestination: f.effectDestination,
    maxAgeMs: 5_000,
    now: new Date('2026-09-01T17:59:02.000Z')
  }), /widens its non-authorizing boundary|signature verification/);
});
