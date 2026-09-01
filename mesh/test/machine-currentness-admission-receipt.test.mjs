import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import { MeshIdentity } from '../src/lib/identity.mjs';
import {
  MACHINE_PRINCIPAL_EFFECT_CURRENTNESS_EVALUATION_SCHEMA,
  machinePrincipalAdmissionDigest
} from '../src/lib/machine-principal-currentness.mjs';
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
  const base = {
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
  const admissionDigest = machinePrincipalAdmissionDigest({
    principalId: base.principalId,
    principalType: base.principalType,
    authorityDigest: base.authorityDigest,
    capabilityId: base.capabilityId,
    intentDigest: base.intentDigest,
    planDigest: base.planDigest,
    effectDestination: base.effectDestination
  });
  const currentnessEvidenceDigest = '2'.repeat(64);
  const effectCurrentnessEvaluationDigest = digestObject({
    schema: MACHINE_PRINCIPAL_EFFECT_CURRENTNESS_EVALUATION_SCHEMA,
    admission_digest: admissionDigest,
    currentness_evidence_digest: currentnessEvidenceDigest,
    currentness_sequence: base.currentnessSequence,
    currentness_head_digest: base.retainedSourceHeadDigest
  });
  return {
    ...base,
    admissionDigest,
    currentnessEvidenceDigest,
    effectCurrentnessEvaluationDigest
  };
}

function verifyArgs(grid, f, extra = {}) {
  return {
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
    expectedAdmissionDigest: f.admissionDigest,
    expectedCurrentnessEvidenceDigest: f.currentnessEvidenceDigest,
    expectedEffectCurrentnessEvaluationDigest: f.effectCurrentnessEvaluationDigest,
    maxAgeMs: 5_000,
    now: new Date('2026-09-01T17:59:02.000Z'),
    ...extra
  };
}

test('Grid-signed machine currentness receipt binds canonical evaluation and remains non-authorizing', () => {
  const grid = gridIdentity();
  const f = fixture();
  const receipt = createMachineCurrentnessAdmissionReceipt({
    identity: grid,
    ...f
  });
  const verified = verifyMachineCurrentnessAdmissionReceipt(
    receipt,
    verifyArgs(grid, f)
  );
  assert.equal(verified.valid, true);
  assert.equal(verified.execution_authority_granted, false);
  assert.equal(verified.authority_effect, 'none');
  assert.equal(verified.capability_promotion_effect, 'none');
  assert.equal(verified.global_currentness_claimed, false);
  assert.equal(verified.currentness_sequence, 7);
  assert.equal(verified.admission_digest, f.admissionDigest);
  assert.equal(verified.currentness_evidence_digest, f.currentnessEvidenceDigest);
  assert.equal(
    verified.effect_currentness_evaluation_digest,
    f.effectCurrentnessEvaluationDigest
  );
  assert.equal(
    verified.admission_binding_digest,
    machineCurrentnessAdmissionBindingDigest({ ...f })
  );
});

test('receipt transplantation to another capability, plan, destination, or retained head is rejected', () => {
  const grid = gridIdentity();
  const f = fixture();
  const receipt = createMachineCurrentnessAdmissionReceipt({
    identity: grid,
    ...f
  });
  const base = verifyArgs(grid, f);
  for (const override of [
    { expectedCapabilityId: 'cap_' + '9'.repeat(64) },
    { expectedPlanDigest: '8'.repeat(64) },
    { expectedEffectDestination: 'provider:other' },
    { expectedRetainedCheckpointDigest: '7'.repeat(64) },
    { expectedRetainedSourceHeadDigest: '6'.repeat(64) }
  ]) {
    assert.throws(
      () => verifyMachineCurrentnessAdmissionReceipt(receipt, { ...base, ...override }),
      /does not bind|retained .* mismatch|canonical admission digest mismatch/i
    );
  }
});

test('tampered Grid statement, wrong Grid key, stale receipt, and unknown fields fail closed', () => {
  const grid = gridIdentity();
  const other = gridIdentity();
  const f = fixture();
  const receipt = createMachineCurrentnessAdmissionReceipt({
    identity: grid,
    ...f
  });
  const args = verifyArgs(grid, f);

  assert.throws(() => verifyMachineCurrentnessAdmissionReceipt({
    ...receipt,
    statement: { ...receipt.statement, currentness_sequence: 8 }
  }, args), /signature verification|evaluation digest/);

  assert.throws(() => verifyMachineCurrentnessAdmissionReceipt(receipt, {
    ...args,
    gridPublicKey: other.publicKey
  }), /signature verification/);

  assert.throws(() => verifyMachineCurrentnessAdmissionReceipt(receipt, {
    ...args,
    now: new Date('2026-09-01T17:59:10.000Z')
  }), /stale or future-dated/);

  assert.throws(() => verifyMachineCurrentnessAdmissionReceipt({
    ...receipt,
    surprise: true
  }, args), /unsupported field/);

  assert.throws(() => verifyMachineCurrentnessAdmissionReceipt({
    ...receipt,
    statement: { ...receipt.statement, surprise: true }
  }, args), /unsupported field/);
});

test('constructor rejects mismatched canonical admission/evaluation digests and inverted time', () => {
  const grid = gridIdentity();
  const f = fixture();

  assert.throws(() => createMachineCurrentnessAdmissionReceipt({
    identity: grid,
    ...f,
    admissionDigest: '9'.repeat(64)
  }), /admission digest does not match canonical/);

  assert.throws(() => createMachineCurrentnessAdmissionReceipt({
    identity: grid,
    ...f,
    effectCurrentnessEvaluationDigest: '8'.repeat(64)
  }), /evaluation digest does not match canonical/);

  assert.throws(() => createMachineCurrentnessAdmissionReceipt({
    identity: grid,
    ...f,
    currentnessObservedAt: '2026-09-01T17:59:02.000Z',
    evaluatedAt: '2026-09-01T17:59:01.000Z'
  }), /observation cannot occur after evaluation/);
});

test('receipt refuses authority-widening statements even when otherwise shaped correctly', () => {
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
  assert.throws(() => verifyMachineCurrentnessAdmissionReceipt(
    widened,
    verifyArgs(grid, f)
  ), /widens its non-authorizing boundary|signature verification/);
});
