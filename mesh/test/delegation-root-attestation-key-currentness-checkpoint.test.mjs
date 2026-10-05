import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import { DELEGATION_ROOT_BINDING_SCHEMA } from '../src/lib/delegation-ledger.mjs';
import {
  createDelegationRootAttestationKeyCredential,
  createDelegationRootAttestationKeyRevocation
} from '../src/lib/delegation-root-attestation-key-lifecycle.mjs';

const T0 = '2026-08-28T05:00:00.000Z';
const T1 = '2026-08-28T05:10:00.000Z';
const T2 = '2026-08-28T05:20:00.000Z';
const T3 = '2026-08-28T05:30:00.000Z';

function keys() {
  return generateKeyPairSync('ed25519');
}

function rootBinding({ holder = 'owner.alice', authorityDigest = 'a'.repeat(64) } = {}) {
  const core = {
    schema: DELEGATION_ROOT_BINDING_SCHEMA,
    root_holder: holder,
    root_authority_digest: authorityDigest,
    execution_authority_granted: false,
    authority_effect: 'none'
  };
  return { ...core, binding_digest: digestObject(core) };
}

async function checkpoints() {
  try {
    return await import('../src/lib/delegation-root-attestation-key-currentness-checkpoint.mjs');
  } catch (error) {
    assert.fail(
      `delegation root attestation key currentness checkpoint module must exist: ${error.message}`
    );
  }
}

function initialCredential({ binding, controller, operational, activatedAt = T0 }) {
  return createDelegationRootAttestationKeyCredential({
    rootBinding: binding,
    controllerPrivateKey: controller.privateKey,
    operationalPublicKey: operational.publicKey,
    keyEpoch: 1,
    activatedAt
  });
}

function successorCredential({
  binding,
  controller,
  operational,
  predecessor,
  activatedAt = T1
}) {
  return createDelegationRootAttestationKeyCredential({
    rootBinding: binding,
    controllerPrivateKey: controller.privateKey,
    operationalPublicKey: operational.publicKey,
    keyEpoch: predecessor.statement.key_epoch + 1,
    activatedAt,
    transitionKind: 'rotation',
    predecessorCredential: predecessor,
    predecessorDisposition: 'retired'
  });
}

function fixture() {
  const binding = rootBinding();
  const controller = keys();
  const firstKey = keys();
  const secondKey = keys();
  const first = initialCredential({ binding, controller, operational: firstKey });
  const second = successorCredential({
    binding,
    controller,
    operational: secondKey,
    predecessor: first
  });
  return { binding, controller, firstKey, secondKey, first, second };
}

function revoke(credential, controller, effectiveAt = T1) {
  return createDelegationRootAttestationKeyRevocation(credential, {
    trustedControllerPublicKey: controller.publicKey,
    controllerPrivateKey: controller.privateKey,
    effectiveAt,
    reasonCode: 'administrative'
  });
}

test('controller-signed currentness checkpoint binds exact lifecycle head and grants no authority', async () => {
  const { binding, controller, first } = fixture();
  const {
    DELEGATION_ROOT_ATTESTATION_KEY_CURRENTNESS_CHECKPOINT_SCHEMA,
    createDelegationRootAttestationKeyCurrentnessCheckpoint,
    verifyDelegationRootAttestationKeyCurrentnessCheckpoint
  } = await checkpoints();

  const checkpoint = createDelegationRootAttestationKeyCurrentnessCheckpoint({
    credentials: [first],
    revocations: [],
    trustedControllerPublicKey: controller.publicKey,
    controllerPrivateKey: controller.privateKey,
    checkpointSequence: 1,
    checkpointedAt: T1
  });
  const verified = verifyDelegationRootAttestationKeyCurrentnessCheckpoint(checkpoint, {
    trustedControllerPublicKey: controller.publicKey,
    expectedRootBindingDigest: binding.binding_digest,
    expectedRootAuthorityDigest: binding.root_authority_digest,
    expectedRootHolder: binding.root_holder
  });

  assert.equal(checkpoint.schema, DELEGATION_ROOT_ATTESTATION_KEY_CURRENTNESS_CHECKPOINT_SCHEMA);
  assert.equal(verified.statement.root_binding_digest, binding.binding_digest);
  assert.equal(verified.statement.root_authority_digest, binding.root_authority_digest);
  assert.equal(verified.statement.root_holder, binding.root_holder);
  assert.match(verified.statement.controller_key_id, /^[a-f0-9]{64}$/);
  assert.equal(verified.statement.checkpoint_sequence, 1);
  assert.equal(verified.statement.predecessor_checkpoint_digest, null);
  assert.equal(verified.statement.credential_head_digest, first.credential_digest);
  assert.equal(verified.statement.credential_head_epoch, 1);
  assert.equal(
    verified.statement.credential_head_operational_key_id,
    first.statement.operational_key_id
  );
  assert.match(verified.statement.credential_path_digest, /^[a-f0-9]{64}$/);
  assert.deepEqual(verified.statement.revocation_digests, []);
  assert.equal(verified.statement.revocation_count, 0);
  assert.match(verified.statement.revocation_set_digest, /^[a-f0-9]{64}$/);
  assert.equal(verified.statement.checkpoint_scope, 'delegation-root-attestation-key-lifecycle');
  assert.equal(verified.statement.checkpoint_effect, 'retainable-currentness-boundary-only');
  assert.equal(verified.statement.authority_effect, 'none');
  assert.equal(verified.statement.delegation_effect, 'none');
  assert.equal(verified.statement.execution_authority_granted, false);
  assert.equal(verified.statement.capability_promotion_effect, 'none');
  assert.equal(verified.statement.network_effect, 'none');
  assert.equal(verified.statement.global_currentness_claimed, false);
  assert.equal(verified.statement.wall_clock_checkpoint_time_proved, false);
});

test('checkpoint transitions advance exactly one sequence and chain predecessor digest', async () => {
  const { controller, first, second } = fixture();
  const {
    createDelegationRootAttestationKeyCurrentnessCheckpoint,
    validateDelegationRootAttestationKeyCurrentnessCheckpointTransition
  } = await checkpoints();

  const firstCheckpoint = createDelegationRootAttestationKeyCurrentnessCheckpoint({
    credentials: [first],
    trustedControllerPublicKey: controller.publicKey,
    controllerPrivateKey: controller.privateKey,
    checkpointSequence: 1,
    checkpointedAt: T1
  });
  const secondCheckpoint = createDelegationRootAttestationKeyCurrentnessCheckpoint({
    credentials: [first, second],
    trustedControllerPublicKey: controller.publicKey,
    controllerPrivateKey: controller.privateKey,
    checkpointSequence: 2,
    checkpointedAt: T2,
    predecessorCheckpoint: firstCheckpoint
  });

  const transition = validateDelegationRootAttestationKeyCurrentnessCheckpointTransition(
    firstCheckpoint,
    secondCheckpoint,
    { trustedControllerPublicKey: controller.publicKey }
  );
  assert.equal(transition.previous_sequence, 1);
  assert.equal(transition.current_sequence, 2);
  assert.equal(
    secondCheckpoint.statement.predecessor_checkpoint_digest,
    firstCheckpoint.checkpoint_digest
  );
  assert.equal(transition.previous_credential_head_epoch, 1);
  assert.equal(transition.current_credential_head_epoch, 2);
  assert.equal(transition.authority_effect, 'none');
  assert.equal(transition.execution_authority_granted, false);
});

test('checkpoint creation rejects sequence gaps, wrong predecessor root, and controller substitution', async () => {
  const { binding, controller, first, second } = fixture();
  const otherController = keys();
  const otherBinding = rootBinding({ holder: 'owner.bob', authorityDigest: 'b'.repeat(64) });
  const otherOperational = keys();
  const otherFirst = initialCredential({
    binding: otherBinding,
    controller,
    operational: otherOperational
  });
  const {
    createDelegationRootAttestationKeyCurrentnessCheckpoint
  } = await checkpoints();

  const firstCheckpoint = createDelegationRootAttestationKeyCurrentnessCheckpoint({
    credentials: [first],
    trustedControllerPublicKey: controller.publicKey,
    controllerPrivateKey: controller.privateKey,
    checkpointSequence: 1,
    checkpointedAt: T1
  });

  assert.throws(() => createDelegationRootAttestationKeyCurrentnessCheckpoint({
    credentials: [first, second],
    trustedControllerPublicKey: controller.publicKey,
    controllerPrivateKey: controller.privateKey,
    checkpointSequence: 3,
    checkpointedAt: T2,
    predecessorCheckpoint: firstCheckpoint
  }), /sequence.*advance by one|checkpoint sequence/i);

  assert.throws(() => createDelegationRootAttestationKeyCurrentnessCheckpoint({
    credentials: [otherFirst],
    trustedControllerPublicKey: controller.publicKey,
    controllerPrivateKey: controller.privateKey,
    checkpointSequence: 2,
    checkpointedAt: T2,
    predecessorCheckpoint: firstCheckpoint
  }), /root.*mismatch|different root/i);

  assert.throws(() => createDelegationRootAttestationKeyCurrentnessCheckpoint({
    credentials: [first, second],
    trustedControllerPublicKey: controller.publicKey,
    controllerPrivateKey: otherController.privateKey,
    checkpointSequence: 2,
    checkpointedAt: T2,
    predecessorCheckpoint: firstCheckpoint
  }), /controller.*mismatch|controller.*substitution/i);

  assert.equal(binding.binding_digest, first.statement.root_binding_digest);
});

test('revocation-only checkpoint advances preserve credential head and cannot forget retained revocations', async () => {
  const { controller, first, second } = fixture();
  const revocation = revoke(first, controller, T1);
  const {
    createDelegationRootAttestationKeyCurrentnessCheckpoint,
    validateDelegationRootAttestationKeyCurrentnessCheckpointTransition
  } = await checkpoints();

  const firstCheckpoint = createDelegationRootAttestationKeyCurrentnessCheckpoint({
    credentials: [first, second],
    revocations: [],
    trustedControllerPublicKey: controller.publicKey,
    controllerPrivateKey: controller.privateKey,
    checkpointSequence: 1,
    checkpointedAt: T2
  });
  const secondCheckpoint = createDelegationRootAttestationKeyCurrentnessCheckpoint({
    credentials: [first, second],
    revocations: [revocation],
    trustedControllerPublicKey: controller.publicKey,
    controllerPrivateKey: controller.privateKey,
    checkpointSequence: 2,
    checkpointedAt: T3,
    predecessorCheckpoint: firstCheckpoint
  });

  const transition = validateDelegationRootAttestationKeyCurrentnessCheckpointTransition(
    firstCheckpoint,
    secondCheckpoint,
    { trustedControllerPublicKey: controller.publicKey }
  );
  assert.equal(transition.previous_credential_head_epoch, 2);
  assert.equal(transition.current_credential_head_epoch, 2);
  assert.equal(secondCheckpoint.statement.credential_head_digest, firstCheckpoint.statement.credential_head_digest);
  assert.deepEqual(secondCheckpoint.statement.revocation_digests, [revocation.revocation_digest]);

  assert.throws(() => createDelegationRootAttestationKeyCurrentnessCheckpoint({
    credentials: [first, second],
    revocations: [],
    trustedControllerPublicKey: controller.publicKey,
    controllerPrivateKey: controller.privateKey,
    checkpointSequence: 3,
    checkpointedAt: '2026-08-28T05:40:00.000Z',
    predecessorCheckpoint: secondCheckpoint
  }), /revocation.*cannot be removed|revocation.*retained|forget.*revocation/i);
});

test('checkpoint paths fail closed on truncated genesis, sequence gaps, and broken predecessor links', async () => {
  const { controller, first, second } = fixture();
  const {
    createDelegationRootAttestationKeyCurrentnessCheckpoint,
    validateDelegationRootAttestationKeyCurrentnessCheckpointPath
  } = await checkpoints();

  const checkpoint1 = createDelegationRootAttestationKeyCurrentnessCheckpoint({
    credentials: [first],
    trustedControllerPublicKey: controller.publicKey,
    controllerPrivateKey: controller.privateKey,
    checkpointSequence: 1,
    checkpointedAt: T1
  });
  const checkpoint2 = createDelegationRootAttestationKeyCurrentnessCheckpoint({
    credentials: [first, second],
    trustedControllerPublicKey: controller.publicKey,
    controllerPrivateKey: controller.privateKey,
    checkpointSequence: 2,
    checkpointedAt: T2,
    predecessorCheckpoint: checkpoint1
  });
  const checkpoint3 = createDelegationRootAttestationKeyCurrentnessCheckpoint({
    credentials: [first, second],
    trustedControllerPublicKey: controller.publicKey,
    controllerPrivateKey: controller.privateKey,
    checkpointSequence: 3,
    checkpointedAt: T3,
    predecessorCheckpoint: checkpoint2
  });

  assert.throws(() => validateDelegationRootAttestationKeyCurrentnessCheckpointPath(
    [checkpoint2, checkpoint3],
    { trustedControllerPublicKey: controller.publicKey }
  ), /begin at sequence 1|truncat/i);

  assert.throws(() => validateDelegationRootAttestationKeyCurrentnessCheckpointPath(
    [checkpoint1, checkpoint3],
    { trustedControllerPublicKey: controller.publicKey }
  ), /sequence.*advance by one|predecessor.*mismatch|gap/i);

  const valid = validateDelegationRootAttestationKeyCurrentnessCheckpointPath(
    [checkpoint1, checkpoint2, checkpoint3],
    { trustedControllerPublicKey: controller.publicKey }
  );
  assert.equal(valid.first_sequence, 1);
  assert.equal(valid.last_sequence, 3);
  assert.equal(valid.checkpoint_count, 3);
  assert.equal(valid.execution_authority_granted, false);
});

test('currentness verification rejects credential rollback relative to a retained checkpoint', async () => {
  const { controller, first, second } = fixture();
  const {
    createDelegationRootAttestationKeyCurrentnessCheckpoint,
    verifyDelegationRootAttestationKeyLifecycleCurrentness
  } = await checkpoints();

  const retained = createDelegationRootAttestationKeyCurrentnessCheckpoint({
    credentials: [first, second],
    trustedControllerPublicKey: controller.publicKey,
    controllerPrivateKey: controller.privateKey,
    checkpointSequence: 1,
    checkpointedAt: T2
  });

  assert.throws(() => verifyDelegationRootAttestationKeyLifecycleCurrentness({
    checkpoint: retained,
    credentials: [first],
    revocations: [],
    trustedControllerPublicKey: controller.publicKey,
    retainedCheckpoint: retained
  }), /credential.*head.*checkpoint|rollback|older.*credential/i);
});

test('currentness verification rejects omission of revocations already captured by retained checkpoint', async () => {
  const { controller, first, second } = fixture();
  const revocation = revoke(first, controller, T1);
  const {
    createDelegationRootAttestationKeyCurrentnessCheckpoint,
    verifyDelegationRootAttestationKeyLifecycleCurrentness
  } = await checkpoints();

  const retained = createDelegationRootAttestationKeyCurrentnessCheckpoint({
    credentials: [first, second],
    revocations: [revocation],
    trustedControllerPublicKey: controller.publicKey,
    controllerPrivateKey: controller.privateKey,
    checkpointSequence: 1,
    checkpointedAt: T2
  });

  assert.throws(() => verifyDelegationRootAttestationKeyLifecycleCurrentness({
    checkpoint: retained,
    credentials: [first, second],
    revocations: [],
    trustedControllerPublicKey: controller.publicKey,
    retainedCheckpoint: retained
  }), /revocation.*omission|revocation.*set.*mismatch|checkpoint.*revocation/i);
});

test('same checkpoint sequence with a different signed digest is rejected as equivocation', async () => {
  const { controller, first } = fixture();
  const {
    createDelegationRootAttestationKeyCurrentnessCheckpoint,
    verifyDelegationRootAttestationKeyLifecycleCurrentness
  } = await checkpoints();

  const retained = createDelegationRootAttestationKeyCurrentnessCheckpoint({
    credentials: [first],
    trustedControllerPublicKey: controller.publicKey,
    controllerPrivateKey: controller.privateKey,
    checkpointSequence: 1,
    checkpointedAt: T1
  });
  const conflicting = createDelegationRootAttestationKeyCurrentnessCheckpoint({
    credentials: [first],
    trustedControllerPublicKey: controller.publicKey,
    controllerPrivateKey: controller.privateKey,
    checkpointSequence: 1,
    checkpointedAt: T2
  });
  assert.notEqual(conflicting.checkpoint_digest, retained.checkpoint_digest);

  assert.throws(() => verifyDelegationRootAttestationKeyLifecycleCurrentness({
    checkpoint: conflicting,
    credentials: [first],
    revocations: [],
    trustedControllerPublicKey: controller.publicKey,
    retainedCheckpoint: retained
  }), /equivocation|same sequence.*different|checkpoint.*conflict/i);
});

test('newer checkpoint path satisfies retained state without claiming global or wall-clock currentness', async () => {
  const { binding, controller, first, second } = fixture();
  const revocation = revoke(first, controller, T1);
  const {
    createDelegationRootAttestationKeyCurrentnessCheckpoint,
    verifyDelegationRootAttestationKeyLifecycleCurrentness
  } = await checkpoints();

  const checkpoint1 = createDelegationRootAttestationKeyCurrentnessCheckpoint({
    credentials: [first],
    revocations: [],
    trustedControllerPublicKey: controller.publicKey,
    controllerPrivateKey: controller.privateKey,
    checkpointSequence: 1,
    checkpointedAt: T1
  });
  const checkpoint2 = createDelegationRootAttestationKeyCurrentnessCheckpoint({
    credentials: [first, second],
    revocations: [revocation],
    trustedControllerPublicKey: controller.publicKey,
    controllerPrivateKey: controller.privateKey,
    checkpointSequence: 2,
    checkpointedAt: T2,
    predecessorCheckpoint: checkpoint1
  });

  const result = verifyDelegationRootAttestationKeyLifecycleCurrentness({
    checkpoint: checkpoint2,
    credentials: [first, second],
    revocations: [revocation],
    trustedControllerPublicKey: controller.publicKey,
    retainedCheckpoint: checkpoint1,
    checkpointPath: [checkpoint1, checkpoint2],
    expectedRootBindingDigest: binding.binding_digest,
    expectedRootAuthorityDigest: binding.root_authority_digest,
    expectedRootHolder: binding.root_holder
  });

  assert.equal(result.verified, true);
  assert.equal(result.retained_checkpoint_satisfied, true);
  assert.equal(result.rollback_detected, false);
  assert.equal(result.tail_withholding_detected_relative_to_retained_checkpoint, false);
  assert.equal(result.presented_checkpoint_sequence, 2);
  assert.equal(result.retained_checkpoint_sequence, 1);
  assert.equal(result.credential_head_epoch, 2);
  assert.equal(result.revocation_count, 1);
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.delegation_effect, 'none');
  assert.equal(result.execution_authority_granted, false);
  assert.equal(result.capability_promotion_effect, 'none');
  assert.equal(result.network_effect, 'none');
  assert.equal(result.global_currentness_claimed, false);
  assert.equal(result.global_currentness_proved, false);
  assert.equal(result.wall_clock_currentness_proved, false);
});
