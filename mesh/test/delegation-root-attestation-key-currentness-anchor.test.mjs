import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { canonicalJson, digestObject } from '../src/lib/canonical.mjs';
import { DELEGATION_ROOT_BINDING_SCHEMA } from '../src/lib/delegation-ledger.mjs';
import {
  createDelegationRootAttestationKeyCredential
} from '../src/lib/delegation-root-attestation-key-lifecycle.mjs';
import {
  createDelegationRootAttestationKeyCurrentnessCheckpoint
} from '../src/lib/delegation-root-attestation-key-currentness-checkpoint.mjs';
import {
  openDelegationRootAttestationKeyCurrentnessStore
} from '../src/lib/delegation-root-attestation-key-currentness-store.mjs';

const T0 = '2026-08-28T06:00:00.000Z';
const T1 = '2026-08-28T06:10:00.000Z';
const T2 = '2026-08-28T06:20:00.000Z';
const T3 = '2026-08-28T06:30:00.000Z';
const T4 = '2026-08-28T06:40:00.000Z';

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

function fixture() {
  const binding = rootBinding();
  const controller = keys();
  const witness = keys();
  const otherWitness = keys();
  const operational1 = keys();
  const operational2 = keys();

  const credential1 = createDelegationRootAttestationKeyCredential({
    rootBinding: binding,
    controllerPrivateKey: controller.privateKey,
    operationalPublicKey: operational1.publicKey,
    keyEpoch: 1,
    activatedAt: T0
  });
  const credential2 = createDelegationRootAttestationKeyCredential({
    rootBinding: binding,
    controllerPrivateKey: controller.privateKey,
    operationalPublicKey: operational2.publicKey,
    keyEpoch: 2,
    activatedAt: T1,
    transitionKind: 'rotation',
    predecessorCredential: credential1,
    predecessorDisposition: 'retired'
  });

  const checkpoint1 = createDelegationRootAttestationKeyCurrentnessCheckpoint({
    credentials: [credential1],
    trustedControllerPublicKey: controller.publicKey,
    controllerPrivateKey: controller.privateKey,
    checkpointSequence: 1,
    checkpointedAt: T1
  });
  const checkpoint2 = createDelegationRootAttestationKeyCurrentnessCheckpoint({
    credentials: [credential1, credential2],
    trustedControllerPublicKey: controller.publicKey,
    controllerPrivateKey: controller.privateKey,
    checkpointSequence: 2,
    checkpointedAt: T2,
    predecessorCheckpoint: checkpoint1
  });
  const checkpoint3 = createDelegationRootAttestationKeyCurrentnessCheckpoint({
    credentials: [credential1, credential2],
    trustedControllerPublicKey: controller.publicKey,
    controllerPrivateKey: controller.privateKey,
    checkpointSequence: 3,
    checkpointedAt: T3,
    predecessorCheckpoint: checkpoint2
  });
  const alternateCheckpoint2 = createDelegationRootAttestationKeyCurrentnessCheckpoint({
    credentials: [credential1, credential2],
    trustedControllerPublicKey: controller.publicKey,
    controllerPrivateKey: controller.privateKey,
    checkpointSequence: 2,
    checkpointedAt: T4,
    predecessorCheckpoint: checkpoint1
  });

  return {
    binding,
    controller,
    witness,
    otherWitness,
    credential1,
    credential2,
    checkpoint1,
    checkpoint2,
    checkpoint3,
    alternateCheckpoint2
  };
}

async function anchorModule() {
  try {
    return await import('../src/lib/delegation-root-attestation-key-currentness-anchor.mjs');
  } catch (error) {
    assert.fail(`delegation currentness independent anchor module must exist: ${error.message}`);
  }
}

function anchorCreateOptions(f, checkpoint, checkpointPath, extra = {}) {
  return {
    checkpoint,
    checkpointPath,
    trustedControllerPublicKey: f.controller.publicKey,
    expectedRootBindingDigest: f.binding.binding_digest,
    expectedRootAuthorityDigest: f.binding.root_authority_digest,
    expectedRootHolder: f.binding.root_holder,
    witnessId: 'witness.alpha',
    witnessPrivateKey: f.witness.privateKey,
    anchorSequence: 1,
    anchoredAt: T2,
    ...extra
  };
}

function anchorVerifyOptions(f, checkpoint, extra = {}) {
  return {
    trustedWitnessPublicKey: f.witness.publicKey,
    trustedControllerPublicKey: f.controller.publicKey,
    anchoredCheckpoint: checkpoint,
    expectedRootBindingDigest: f.binding.binding_digest,
    expectedRootAuthorityDigest: f.binding.root_authority_digest,
    expectedRootHolder: f.binding.root_holder,
    ...extra
  };
}

async function createAnchors(f) {
  const {
    createDelegationRootAttestationKeyCurrentnessAnchor
  } = await anchorModule();
  const anchor1 = createDelegationRootAttestationKeyCurrentnessAnchor(
    anchorCreateOptions(f, f.checkpoint1, [f.checkpoint1])
  );
  const anchor2 = createDelegationRootAttestationKeyCurrentnessAnchor(
    anchorCreateOptions(f, f.checkpoint2, [f.checkpoint1, f.checkpoint2], {
      anchorSequence: 2,
      anchoredAt: T3,
      predecessorAnchor: anchor1
    })
  );
  return { anchor1, anchor2 };
}

async function tempState(t) {
  const dir = await mkdtemp(join(tmpdir(), 'axiom-currentness-anchor-'));
  t.after(async () => rm(dir, { recursive: true, force: true }));
  return join(dir, 'state.jsonl');
}

function storeOptions(f, statePath, extra = {}) {
  return {
    statePath,
    trustedControllerPublicKey: f.controller.publicKey,
    expectedRootBindingDigest: f.binding.binding_digest,
    expectedRootAuthorityDigest: f.binding.root_authority_digest,
    expectedRootHolder: f.binding.root_holder,
    ...extra
  };
}

test('independent witness anchor signs one exact controller checkpoint and grants no authority', async () => {
  const f = fixture();
  const {
    DELEGATION_ROOT_ATTESTATION_KEY_CURRENTNESS_ANCHOR_SCHEMA,
    createDelegationRootAttestationKeyCurrentnessAnchor,
    verifyDelegationRootAttestationKeyCurrentnessAnchor
  } = await anchorModule();

  const anchor = createDelegationRootAttestationKeyCurrentnessAnchor(
    anchorCreateOptions(f, f.checkpoint1, [f.checkpoint1])
  );
  const verified = verifyDelegationRootAttestationKeyCurrentnessAnchor(
    anchor,
    anchorVerifyOptions(f, f.checkpoint1)
  );

  assert.equal(anchor.schema, DELEGATION_ROOT_ATTESTATION_KEY_CURRENTNESS_ANCHOR_SCHEMA);
  assert.equal(verified.anchor_digest, anchor.anchor_digest);
  assert.equal(anchor.statement.checkpoint_sequence, 1);
  assert.equal(anchor.statement.checkpoint_digest, f.checkpoint1.checkpoint_digest);
  assert.equal(anchor.statement.root_binding_digest, f.binding.binding_digest);
  assert.equal(anchor.statement.root_authority_digest, f.binding.root_authority_digest);
  assert.equal(anchor.statement.root_holder, f.binding.root_holder);
  assert.equal(anchor.statement.anchor_scope, 'delegation-root-attestation-key-currentness-head');
  assert.equal(anchor.statement.rollback_detection_scope, 'relative-to-retained-witness-anchor');
  assert.equal(anchor.statement.authority_effect, 'none');
  assert.equal(anchor.statement.delegation_effect, 'none');
  assert.equal(anchor.statement.execution_authority_granted, false);
  assert.equal(anchor.statement.capability_promotion_effect, 'none');
  assert.equal(anchor.statement.network_effect, 'none');
  assert.equal(anchor.statement.global_currentness_claimed, false);
  assert.equal(anchor.statement.wall_clock_anchor_time_proved, false);
  assert.equal(anchor.statement.witness_independence_proved, false);
  assert.equal(anchor.statement.external_persistence_proved, false);
});

test('independent anchor rejects witness-key substitution and signed-content tampering', async () => {
  const f = fixture();
  const {
    createDelegationRootAttestationKeyCurrentnessAnchor,
    verifyDelegationRootAttestationKeyCurrentnessAnchor
  } = await anchorModule();
  const anchor = createDelegationRootAttestationKeyCurrentnessAnchor(
    anchorCreateOptions(f, f.checkpoint1, [f.checkpoint1])
  );

  assert.throws(
    () => verifyDelegationRootAttestationKeyCurrentnessAnchor(anchor, anchorVerifyOptions(f, f.checkpoint1, {
      trustedWitnessPublicKey: f.otherWitness.publicKey
    })),
    /witness.*substitution|witness key|trusted witness/i
  );

  const tampered = structuredClone(anchor);
  tampered.statement.checkpoint_digest = 'b'.repeat(64);
  assert.throws(
    () => verifyDelegationRootAttestationKeyCurrentnessAnchor(tampered, anchorVerifyOptions(f, f.checkpoint1)),
    /statement digest|signature|checkpoint digest/i
  );
});

test('anchor verification requires the exact controller-signed checkpoint it claims to witness', async () => {
  const f = fixture();
  const {
    createDelegationRootAttestationKeyCurrentnessAnchor,
    verifyDelegationRootAttestationKeyCurrentnessAnchor
  } = await anchorModule();
  const anchor = createDelegationRootAttestationKeyCurrentnessAnchor(
    anchorCreateOptions(f, f.checkpoint2, [f.checkpoint1, f.checkpoint2])
  );

  assert.throws(
    () => verifyDelegationRootAttestationKeyCurrentnessAnchor(
      anchor,
      anchorVerifyOptions(f, f.alternateCheckpoint2)
    ),
    /anchored checkpoint.*digest|checkpoint.*does not match|equivocation/i
  );
});

test('anchor chain is monotonic, predecessor-bound, and cannot switch witness or controller/root identity', async () => {
  const f = fixture();
  const {
    createDelegationRootAttestationKeyCurrentnessAnchor
  } = await anchorModule();
  const { anchor1, anchor2 } = await createAnchors(f);
  assert.equal(anchor2.statement.anchor_sequence, 2);
  assert.equal(anchor2.statement.predecessor_anchor_digest, anchor1.anchor_digest);
  assert.equal(anchor2.statement.checkpoint_sequence, 2);

  assert.throws(
    () => createDelegationRootAttestationKeyCurrentnessAnchor(
      anchorCreateOptions(f, f.checkpoint1, [f.checkpoint1], {
        anchorSequence: 3,
        anchoredAt: T4,
        predecessorAnchor: anchor2
      })
    ),
    /rollback|checkpoint sequence.*backward|older checkpoint/i
  );

  assert.throws(
    () => createDelegationRootAttestationKeyCurrentnessAnchor(
      anchorCreateOptions(f, f.checkpoint2, [f.checkpoint1, f.checkpoint2], {
        witnessId: 'witness.beta',
        anchorSequence: 3,
        anchoredAt: T4,
        predecessorAnchor: anchor2
      })
    ),
    /witness.*changed|witness identity|anchor chain/i
  );
});

test('same checkpoint sequence cannot be re-anchored to a different valid controller fork', async () => {
  const f = fixture();
  const {
    createDelegationRootAttestationKeyCurrentnessAnchor
  } = await anchorModule();
  const anchor = createDelegationRootAttestationKeyCurrentnessAnchor(
    anchorCreateOptions(f, f.checkpoint2, [f.checkpoint1, f.checkpoint2])
  );

  assert.throws(
    () => createDelegationRootAttestationKeyCurrentnessAnchor(
      anchorCreateOptions(f, f.alternateCheckpoint2, [f.checkpoint1, f.alternateCheckpoint2], {
        anchorSequence: 2,
        anchoredAt: T4,
        predecessorAnchor: anchor
      })
    ),
    /equivocation|same checkpoint sequence|different.*checkpoint digest/i
  );
});

test('durable store accepts a retained external anchor when local history contains the exact anchored prefix', async t => {
  const f = fixture();
  const statePath = await tempState(t);
  const { anchor2 } = await createAnchors(f);
  await writeFile(
    statePath,
    `${canonicalJson(f.checkpoint1)}\n${canonicalJson(f.checkpoint2)}\n${canonicalJson(f.checkpoint3)}\n`,
    'utf8'
  );

  const store = await openDelegationRootAttestationKeyCurrentnessStore(storeOptions(f, statePath, {
    retainedExternalAnchor: anchor2,
    trustedExternalWitnessPublicKey: f.witness.publicKey
  }));
  const snapshot = store.snapshot();
  assert.equal(snapshot.durable_head_checkpoint_sequence, 3);
  assert.equal(snapshot.retained_external_anchor_checked, true);
  assert.equal(snapshot.external_anchor_digest, anchor2.anchor_digest);
  assert.equal(snapshot.external_anchor_checkpoint_sequence, 2);
  assert.equal(snapshot.rollback_checked_relative_to_external_anchor, true);
  assert.equal(snapshot.storage_rollback_proof_claimed, false);
  assert.equal(snapshot.external_anchor_storage_independence_proved, false);
  assert.equal(snapshot.external_anchor_monotonicity_proved, false);
  assert.equal(snapshot.execution_authority_granted, false);
});

test('durable store rejects a whole-file rollback older than the retained external anchor', async t => {
  const f = fixture();
  const statePath = await tempState(t);
  const { anchor2 } = await createAnchors(f);
  await writeFile(statePath, `${canonicalJson(f.checkpoint1)}\n`, 'utf8');

  await assert.rejects(
    openDelegationRootAttestationKeyCurrentnessStore(storeOptions(f, statePath, {
      retainedExternalAnchor: anchor2,
      trustedExternalWitnessPublicKey: f.witness.publicKey
    })),
    /external anchor.*rollback|older than.*anchor|anchored checkpoint.*missing/i
  );
});

test('durable store rejects a different valid controller fork at the externally anchored sequence', async t => {
  const f = fixture();
  const statePath = await tempState(t);
  const { anchor2 } = await createAnchors(f);
  await writeFile(
    statePath,
    `${canonicalJson(f.checkpoint1)}\n${canonicalJson(f.alternateCheckpoint2)}\n`,
    'utf8'
  );

  await assert.rejects(
    openDelegationRootAttestationKeyCurrentnessStore(storeOptions(f, statePath, {
      retainedExternalAnchor: anchor2,
      trustedExternalWitnessPublicKey: f.witness.publicKey
    })),
    /external anchor.*equivocation|anchored checkpoint.*digest|does not match.*anchor/i
  );
});

test('external anchor guard requires anchor and trusted witness key together and preserves unanchored compatibility', async t => {
  const f = fixture();
  const statePath = await tempState(t);
  const { anchor1 } = await createAnchors(f);
  await writeFile(statePath, `${canonicalJson(f.checkpoint1)}\n`, 'utf8');

  await assert.rejects(
    openDelegationRootAttestationKeyCurrentnessStore(storeOptions(f, statePath, {
      retainedExternalAnchor: anchor1
    })),
    /trusted.*witness.*required|external witness/i
  );
  await assert.rejects(
    openDelegationRootAttestationKeyCurrentnessStore(storeOptions(f, statePath, {
      trustedExternalWitnessPublicKey: f.witness.publicKey
    })),
    /external anchor.*required|anchor and.*witness/i
  );

  const unanchored = await openDelegationRootAttestationKeyCurrentnessStore(storeOptions(f, statePath));
  const snapshot = unanchored.snapshot();
  assert.equal(snapshot.retained_external_anchor_checked, false);
  assert.equal(snapshot.external_anchor_digest, null);
  assert.equal(snapshot.external_anchor_checkpoint_sequence, null);
  assert.equal(snapshot.rollback_checked_relative_to_external_anchor, false);
  assert.equal(snapshot.storage_rollback_proof_claimed, false);
});
