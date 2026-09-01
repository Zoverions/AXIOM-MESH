import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import {
  MACHINE_PRINCIPAL_CURRENTNESS_SCHEMA,
  machinePrincipalAdmissionDigest
} from '../src/lib/machine-principal-currentness.mjs';
import {
  createMachinePrincipalCurrentnessCheckpoint,
  validateMachinePrincipalCurrentnessCheckpointTransition,
  verifyMachinePrincipalCurrentnessCheckpoint
} from '../src/lib/machine-principal-currentness-checkpoint.mjs';

const AUTHORITY = 'a'.repeat(64);
const INTENT = 'b'.repeat(64);
const PLAN = 'c'.repeat(64);

function admission(capabilityId = 'cap_1') {
  return machinePrincipalAdmissionDigest({
    principalId: 'agent.fixture.1',
    principalType: 'agent',
    authorityDigest: AUTHORITY,
    capabilityId,
    intentDigest: INTENT,
    planDigest: PLAN,
    effectDestination: 'local'
  });
}

function currentness({
  sequence = 1,
  status = 'active',
  sourceHead = 'd'.repeat(64),
  predecessorHead = null,
  admissionDigest = admission()
} = {}) {
  return {
    schema: MACHINE_PRINCIPAL_CURRENTNESS_SCHEMA,
    principal_id: 'agent.fixture.1',
    principal_type: 'agent',
    authority_digest: AUTHORITY,
    status,
    sequence,
    observed_at: '2026-09-01T17:00:00.000Z',
    source_head_digest: sourceHead,
    predecessor_head_digest: predecessorHead,
    admission_digest: admissionDigest,
    authority_effect: 'none',
    execution_authority_granted: false,
    global_currentness_claimed: false
  };
}

test('controller-signed currentness checkpoint verifies and remains non-authorizing', () => {
  const controller = generateKeyPairSync('ed25519');
  const checkpoint = createMachinePrincipalCurrentnessCheckpoint({
    currentness: currentness(),
    controllerPrivateKey: controller.privateKey,
    trustedControllerPublicKey: controller.publicKey
  });
  const verified = verifyMachinePrincipalCurrentnessCheckpoint(checkpoint, {
    trustedControllerPublicKey: controller.publicKey,
    expectedPrincipalId: 'agent.fixture.1',
    expectedPrincipalType: 'agent'
  });
  assert.equal(verified.statement.sequence, 1);
  assert.equal(verified.statement.status, 'active');
  assert.equal(verified.statement.authority_effect, 'none');
  assert.equal(verified.statement.execution_authority_granted, false);
  assert.equal(verified.statement.global_currentness_claimed, false);
});

test('controller substitution is rejected', () => {
  const trusted = generateKeyPairSync('ed25519');
  const attacker = generateKeyPairSync('ed25519');
  assert.throws(() => createMachinePrincipalCurrentnessCheckpoint({
    currentness: currentness(),
    controllerPrivateKey: attacker.privateKey,
    trustedControllerPublicKey: trusted.publicKey
  }), /substitution/);
});

test('tampered checkpoint statement or digest is rejected', () => {
  const controller = generateKeyPairSync('ed25519');
  const checkpoint = createMachinePrincipalCurrentnessCheckpoint({
    currentness: currentness(),
    controllerPrivateKey: controller.privateKey,
    trustedControllerPublicKey: controller.publicKey
  });
  assert.throws(() => verifyMachinePrincipalCurrentnessCheckpoint({
    ...checkpoint,
    statement: { ...checkpoint.statement, status: 'revoked' }
  }, {
    trustedControllerPublicKey: controller.publicKey
  }), /digest mismatch|signature verification/);

  assert.throws(() => verifyMachinePrincipalCurrentnessCheckpoint({
    ...checkpoint,
    checkpoint_digest: 'f'.repeat(64)
  }, {
    trustedControllerPublicKey: controller.publicKey
  }), /checkpoint digest mismatch/);
});

test('transitions advance exactly one sequence and chain predecessor head', () => {
  const controller = generateKeyPairSync('ed25519');
  const first = createMachinePrincipalCurrentnessCheckpoint({
    currentness: currentness({ sequence: 1, sourceHead: '1'.repeat(64) }),
    controllerPrivateKey: controller.privateKey,
    trustedControllerPublicKey: controller.publicKey
  });
  const second = createMachinePrincipalCurrentnessCheckpoint({
    currentness: currentness({
      sequence: 2,
      sourceHead: '2'.repeat(64),
      predecessorHead: '1'.repeat(64)
    }),
    controllerPrivateKey: controller.privateKey,
    trustedControllerPublicKey: controller.publicKey
  });
  const transition = validateMachinePrincipalCurrentnessCheckpointTransition(
    first,
    second,
    { trustedControllerPublicKey: controller.publicKey }
  );
  assert.equal(transition.previous_sequence, 1);
  assert.equal(transition.current_sequence, 2);
  assert.equal(transition.authority_effect, 'none');

  const bad = createMachinePrincipalCurrentnessCheckpoint({
    currentness: currentness({
      sequence: 3,
      sourceHead: '3'.repeat(64),
      predecessorHead: '1'.repeat(64)
    }),
    controllerPrivateKey: controller.privateKey,
    trustedControllerPublicKey: controller.publicKey
  });
  assert.throws(() => validateMachinePrincipalCurrentnessCheckpointTransition(
    first,
    bad,
    { trustedControllerPublicKey: controller.publicKey }
  ), /advance by one|predecessor/);
});

test('retained checkpoints reject rollback and same-sequence equivocation', () => {
  const controller = generateKeyPairSync('ed25519');
  const retained = createMachinePrincipalCurrentnessCheckpoint({
    currentness: currentness({ sequence: 2, sourceHead: '2'.repeat(64) }),
    controllerPrivateKey: controller.privateKey,
    trustedControllerPublicKey: controller.publicKey
  });
  const older = createMachinePrincipalCurrentnessCheckpoint({
    currentness: currentness({ sequence: 1, sourceHead: '1'.repeat(64) }),
    controllerPrivateKey: controller.privateKey,
    trustedControllerPublicKey: controller.publicKey
  });
  assert.throws(() => verifyMachinePrincipalCurrentnessCheckpoint(older, {
    trustedControllerPublicKey: controller.publicKey,
    retainedCheckpoint: retained
  }), /rollback/);

  const conflicting = createMachinePrincipalCurrentnessCheckpoint({
    currentness: currentness({
      sequence: 2,
      sourceHead: '9'.repeat(64),
      admissionDigest: admission('cap_other')
    }),
    controllerPrivateKey: controller.privateKey,
    trustedControllerPublicKey: controller.publicKey
  });
  assert.throws(() => verifyMachinePrincipalCurrentnessCheckpoint(conflicting, {
    trustedControllerPublicKey: controller.publicKey,
    retainedCheckpoint: retained
  }), /equivocation/);
});
