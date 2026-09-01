import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import {
  MACHINE_PRINCIPAL_CURRENTNESS_SCHEMA
} from '../src/lib/machine-principal-currentness.mjs';
import {
  machineCurrentnessControllerKeyId
} from '../src/lib/machine-currentness-controller-key-lifecycle.mjs';
import {
  createMachinePrincipalCurrentnessCheckpoint,
  validateMachinePrincipalCurrentnessCheckpointTransition,
  verifyMachinePrincipalCurrentnessCheckpoint,
  verifyMachinePrincipalCurrentnessCheckpointWithControllerLifecycle
} from '../src/lib/machine-principal-currentness-checkpoint.mjs';
import {
  createMachineCurrentnessControllerKeyCredential,
  createMachineCurrentnessControllerKeyRevocation
} from '../src/lib/machine-currentness-controller-key-lifecycle.mjs';

const AUTHORITY = 'a'.repeat(64);

function currentness({
  sequence = 1,
  status = 'active',
  sourceHead = 'd'.repeat(64),
  predecessorHead = null,
  observedAt = sequence === 1
    ? '2026-09-01T17:00:00.000Z'
    : '2026-09-01T17:00:01.000Z',
  authorityDigest = AUTHORITY
} = {}) {
  return {
    schema: MACHINE_PRINCIPAL_CURRENTNESS_SCHEMA,
    principal_id: 'agent.fixture.1',
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

test('controller-signed lifecycle checkpoint verifies and remains non-authorizing', () => {
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
  assert.equal(
    verified.statement.controller_key_id,
    machineCurrentnessControllerKeyId(controller.publicKey)
  );
  assert.equal('admission_digest' in verified.statement, false);
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

test('transitions advance exactly one sequence, chain predecessor head, and advance observed time', () => {
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
      predecessorHead: '1'.repeat(64),
      observedAt: '2026-09-01T17:00:01.000Z'
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

  const badSequence = createMachinePrincipalCurrentnessCheckpoint({
    currentness: currentness({
      sequence: 3,
      sourceHead: '3'.repeat(64),
      predecessorHead: '1'.repeat(64),
      observedAt: '2026-09-01T17:00:02.000Z'
    }),
    controllerPrivateKey: controller.privateKey,
    trustedControllerPublicKey: controller.publicKey
  });
  assert.throws(() => validateMachinePrincipalCurrentnessCheckpointTransition(
    first,
    badSequence,
    { trustedControllerPublicKey: controller.publicKey }
  ), /advance by one/);

  const nonAdvancingTime = createMachinePrincipalCurrentnessCheckpoint({
    currentness: currentness({
      sequence: 2,
      sourceHead: '4'.repeat(64),
      predecessorHead: '1'.repeat(64),
      observedAt: '2026-09-01T17:00:00.000Z'
    }),
    controllerPrivateKey: controller.privateKey,
    trustedControllerPublicKey: controller.publicKey
  });
  assert.throws(() => validateMachinePrincipalCurrentnessCheckpointTransition(
    first,
    nonAdvancingTime,
    { trustedControllerPublicKey: controller.publicKey }
  ), /chronologically/);
});

test('authority digest may change across a valid lifecycle successor', () => {
  const controller = generateKeyPairSync('ed25519');
  const first = createMachinePrincipalCurrentnessCheckpoint({
    currentness: currentness({ sequence: 1, sourceHead: '1'.repeat(64) }),
    controllerPrivateKey: controller.privateKey,
    trustedControllerPublicKey: controller.publicKey
  });
  const narrowed = createMachinePrincipalCurrentnessCheckpoint({
    currentness: currentness({
      sequence: 2,
      status: 'narrowed',
      authorityDigest: 'f'.repeat(64),
      sourceHead: '2'.repeat(64),
      predecessorHead: '1'.repeat(64),
      observedAt: '2026-09-01T17:00:01.000Z'
    }),
    controllerPrivateKey: controller.privateKey,
    trustedControllerPublicKey: controller.publicKey
  });
  const result = validateMachinePrincipalCurrentnessCheckpointTransition(
    first,
    narrowed,
    { trustedControllerPublicKey: controller.publicKey }
  );
  assert.equal(result.valid, true);
});

test('retained checkpoints reject rollback and same-sequence equivocation', () => {
  const controller = generateKeyPairSync('ed25519');
  const first = createMachinePrincipalCurrentnessCheckpoint({
    currentness: currentness({ sequence: 1, sourceHead: '1'.repeat(64) }),
    controllerPrivateKey: controller.privateKey,
    trustedControllerPublicKey: controller.publicKey
  });
  const retained = createMachinePrincipalCurrentnessCheckpoint({
    currentness: currentness({
      sequence: 2,
      sourceHead: '2'.repeat(64),
      predecessorHead: '1'.repeat(64)
    }),
    controllerPrivateKey: controller.privateKey,
    trustedControllerPublicKey: controller.publicKey
  });
  const older = first;
  assert.throws(() => verifyMachinePrincipalCurrentnessCheckpoint(older, {
    trustedControllerPublicKey: controller.publicKey,
    retainedCheckpoint: retained
  }), /rollback/);

  const conflicting = createMachinePrincipalCurrentnessCheckpoint({
    currentness: currentness({
      sequence: 2,
      sourceHead: '9'.repeat(64),
      predecessorHead: '1'.repeat(64),
      authorityDigest: 'f'.repeat(64)
    }),
    controllerPrivateKey: controller.privateKey,
    trustedControllerPublicKey: controller.publicKey
  });
  assert.throws(() => verifyMachinePrincipalCurrentnessCheckpoint(conflicting, {
    trustedControllerPublicKey: controller.publicKey,
    retainedCheckpoint: retained
  }), /equivocation/);
});


test('checkpoint verification can require a root-verified currentness-controller lifecycle', () => {
  const root = generateKeyPairSync('ed25519');
  const operational = generateKeyPairSync('ed25519');
  const credential = createMachineCurrentnessControllerKeyCredential({
    principalId: 'controller.currentness.1',
    rootPrivateKey: root.privateKey,
    trustedRootPublicKey: root.publicKey,
    operationalPublicKey: operational.publicKey,
    keyEpoch: 1,
    activatedAt: '2026-09-01T16:59:00.000Z'
  });
  const checkpoint = createMachinePrincipalCurrentnessCheckpoint({
    currentness: currentness({ observedAt: '2026-09-01T17:00:00.000Z' }),
    controllerPrivateKey: operational.privateKey,
    trustedControllerPublicKey: operational.publicKey
  });
  const verified = verifyMachinePrincipalCurrentnessCheckpointWithControllerLifecycle(
    checkpoint,
    {
      controllerCredential: credential,
      trustedControllerRootPublicKey: root.publicKey,
      expectedControllerPrincipalId: 'controller.currentness.1',
      expectedPrincipalId: 'agent.fixture.1',
      expectedPrincipalType: 'agent'
    }
  );
  assert.equal(verified.checkpoint.checkpoint_digest, checkpoint.checkpoint_digest);
  assert.equal(verified.controller_credential_digest, credential.credential_digest);
  assert.equal(verified.controller_key_epoch, 1);
  assert.equal(verified.execution_authority_granted, false);
  assert.equal(verified.authority_effect, 'none');
  assert.equal(verified.global_currentness_claimed, false);
  assert.equal(verified.controller_wall_clock_signing_time_proved, false);
});

test('retired or revoked currentness-controller key cannot validate a checkpoint after its lifecycle boundary', () => {
  const root = generateKeyPairSync('ed25519');
  const firstOperational = generateKeyPairSync('ed25519');
  const secondOperational = generateKeyPairSync('ed25519');
  const first = createMachineCurrentnessControllerKeyCredential({
    principalId: 'controller.currentness.1',
    rootPrivateKey: root.privateKey,
    trustedRootPublicKey: root.publicKey,
    operationalPublicKey: firstOperational.publicKey,
    keyEpoch: 1,
    activatedAt: '2026-09-01T16:59:00.000Z'
  });
  const second = createMachineCurrentnessControllerKeyCredential({
    principalId: 'controller.currentness.1',
    rootPrivateKey: root.privateKey,
    trustedRootPublicKey: root.publicKey,
    operationalPublicKey: secondOperational.publicKey,
    keyEpoch: 2,
    activatedAt: '2026-09-01T17:00:00.000Z',
    transitionKind: 'rotation',
    predecessorCredential: first,
    predecessorDisposition: 'retired'
  });
  const staleCheckpoint = createMachinePrincipalCurrentnessCheckpoint({
    currentness: currentness({ observedAt: '2026-09-01T17:00:01.000Z' }),
    controllerPrivateKey: firstOperational.privateKey,
    trustedControllerPublicKey: firstOperational.publicKey
  });
  assert.throws(() => verifyMachinePrincipalCurrentnessCheckpointWithControllerLifecycle(
    staleCheckpoint,
    {
      controllerCredential: first,
      trustedControllerRootPublicKey: root.publicKey,
      successorControllerCredential: second,
      expectedControllerPrincipalId: 'controller.currentness.1'
    }
  ), /stale after successor activation/);

  const revocation = createMachineCurrentnessControllerKeyRevocation(first, {
    trustedRootPublicKey: root.publicKey,
    rootPrivateKey: root.privateKey,
    effectiveAt: '2026-09-01T16:59:30.000Z',
    reasonCode: 'compromised'
  });
  assert.throws(() => verifyMachinePrincipalCurrentnessCheckpointWithControllerLifecycle(
    staleCheckpoint,
    {
      controllerCredential: first,
      trustedControllerRootPublicKey: root.publicKey,
      controllerRevocation: revocation,
      expectedControllerPrincipalId: 'controller.currentness.1'
    }
  ), /revoked at requested time/);
});

test('controller credential substitution is rejected even when checkpoint signature is cryptographically valid', () => {
  const root = generateKeyPairSync('ed25519');
  const signer = generateKeyPairSync('ed25519');
  const other = generateKeyPairSync('ed25519');
  const otherCredential = createMachineCurrentnessControllerKeyCredential({
    principalId: 'controller.currentness.1',
    rootPrivateKey: root.privateKey,
    trustedRootPublicKey: root.publicKey,
    operationalPublicKey: other.publicKey,
    keyEpoch: 1,
    activatedAt: '2026-09-01T16:59:00.000Z'
  });
  const checkpoint = createMachinePrincipalCurrentnessCheckpoint({
    currentness: currentness(),
    controllerPrivateKey: signer.privateKey,
    trustedControllerPublicKey: signer.publicKey
  });
  assert.throws(() => verifyMachinePrincipalCurrentnessCheckpointWithControllerLifecycle(
    checkpoint,
    {
      controllerCredential: otherCredential,
      trustedControllerRootPublicKey: root.publicKey,
      expectedControllerPrincipalId: 'controller.currentness.1'
    }
  ), /does not match signed controller key/);
});
