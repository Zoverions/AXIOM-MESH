import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import {
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises';
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

const T0 = '2026-08-28T05:00:00.000Z';
const T1 = '2026-08-28T05:10:00.000Z';
const T2 = '2026-08-28T05:20:00.000Z';
const T3 = '2026-08-28T05:30:00.000Z';
const T4 = '2026-08-28T05:40:00.000Z';

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

function initialCredential({ binding, controller, operational }) {
  return createDelegationRootAttestationKeyCredential({
    rootBinding: binding,
    controllerPrivateKey: controller.privateKey,
    operationalPublicKey: operational.publicKey,
    keyEpoch: 1,
    activatedAt: T0
  });
}

function successorCredential({ binding, controller, operational, predecessor }) {
  return createDelegationRootAttestationKeyCredential({
    rootBinding: binding,
    controllerPrivateKey: controller.privateKey,
    operationalPublicKey: operational.publicKey,
    keyEpoch: 2,
    activatedAt: T1,
    transitionKind: 'rotation',
    predecessorCredential: predecessor,
    predecessorDisposition: 'retired'
  });
}

function checkpointFixture() {
  const binding = rootBinding();
  const controller = keys();
  const firstOperational = keys();
  const secondOperational = keys();
  const first = initialCredential({ binding, controller, operational: firstOperational });
  const second = successorCredential({
    binding,
    controller,
    operational: secondOperational,
    predecessor: first
  });
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
  const conflictingCheckpoint1 = createDelegationRootAttestationKeyCurrentnessCheckpoint({
    credentials: [first],
    trustedControllerPublicKey: controller.publicKey,
    controllerPrivateKey: controller.privateKey,
    checkpointSequence: 1,
    checkpointedAt: T4
  });
  return {
    binding,
    controller,
    first,
    second,
    checkpoint1,
    checkpoint2,
    checkpoint3,
    conflictingCheckpoint1
  };
}

async function storeModule() {
  try {
    return await import('../src/lib/delegation-root-attestation-key-currentness-store.mjs');
  } catch (error) {
    assert.fail(
      `delegation root attestation key currentness durable store module must exist: ${error.message}`
    );
  }
}

async function tempState(t, suffix = 'state.jsonl') {
  const dir = await mkdtemp(join(tmpdir(), 'axiom-delegation-currentness-store-'));
  t.after(async () => rm(dir, { recursive: true, force: true }));
  return { dir, statePath: join(dir, suffix) };
}

function openOptions(statePath, fixture, extra = {}) {
  return {
    statePath,
    trustedControllerPublicKey: fixture.controller.publicKey,
    expectedRootBindingDigest: fixture.binding.binding_digest,
    expectedRootAuthorityDigest: fixture.binding.root_authority_digest,
    expectedRootHolder: fixture.binding.root_holder,
    ...extra
  };
}

test('durable currentness store persists retained head across reopen and declares only local retention', async t => {
  const fixture = checkpointFixture();
  const { statePath } = await tempState(t);
  const { openDelegationRootAttestationKeyCurrentnessStore } = await storeModule();

  const store = await openDelegationRootAttestationKeyCurrentnessStore(openOptions(statePath, fixture));
  const retained = await store.retain(fixture.checkpoint1);
  assert.equal(retained.status, 'retained');
  assert.equal(retained.checkpoint_digest, fixture.checkpoint1.checkpoint_digest);

  const snapshot = store.snapshot();
  assert.equal(snapshot.durable_checkpoint_count, 1);
  assert.equal(snapshot.durable_head_checkpoint_sequence, 1);
  assert.equal(snapshot.durable_head_checkpoint_digest, fixture.checkpoint1.checkpoint_digest);
  assert.equal(snapshot.state_path_disclosed, false);
  assert.equal(snapshot.local_durable_retention_claimed, true);
  assert.equal(snapshot.storage_rollback_proof_claimed, false);
  assert.equal(snapshot.hardware_monotonicity_claimed, false);
  assert.equal(snapshot.global_currentness_claimed, false);
  assert.equal(snapshot.external_timestamp_claimed, false);
  assert.equal(snapshot.authority_effect, 'none');
  assert.equal(snapshot.delegation_effect, 'none');
  assert.equal(snapshot.execution_authority_granted, false);
  assert.equal(snapshot.capability_promotion_effect, 'none');
  assert.equal(snapshot.network_effect, 'none');

  const reopened = await openDelegationRootAttestationKeyCurrentnessStore(openOptions(statePath, fixture));
  const verified = await reopened.verifyState();
  assert.equal(verified.valid, true);
  assert.equal(verified.checkpoint_count, 1);
  assert.equal(verified.head_checkpoint_sequence, 1);
  assert.equal(verified.head_checkpoint_digest, fixture.checkpoint1.checkpoint_digest);
  assert.equal(verified.storage_rollback_proof_claimed, false);
  assert.equal(verified.execution_authority_granted, false);
});

test('retain is idempotent for the exact head and rejects older or same-sequence conflicting checkpoints', async t => {
  const fixture = checkpointFixture();
  const { statePath } = await tempState(t);
  const { openDelegationRootAttestationKeyCurrentnessStore } = await storeModule();
  const store = await openDelegationRootAttestationKeyCurrentnessStore(openOptions(statePath, fixture));

  await store.retain(fixture.checkpoint1);
  const replay = await store.retain(fixture.checkpoint1);
  assert.equal(replay.status, 'already-retained');
  assert.equal(replay.checkpoint_digest, fixture.checkpoint1.checkpoint_digest);

  await assert.rejects(
    store.retain(fixture.conflictingCheckpoint1),
    /equivocation|same sequence.*different|conflicting checkpoint/i
  );

  await store.retain(fixture.checkpoint2);
  await assert.rejects(
    store.retain(fixture.checkpoint1),
    /rollback|older than retained|older checkpoint/i
  );
});

test('empty store requires checkpoint sequence one and later retention advances exactly one signed transition', async t => {
  const fixture = checkpointFixture();
  const { statePath } = await tempState(t);
  const { openDelegationRootAttestationKeyCurrentnessStore } = await storeModule();
  const store = await openDelegationRootAttestationKeyCurrentnessStore(openOptions(statePath, fixture));

  await assert.rejects(
    store.retain(fixture.checkpoint2),
    /sequence 1|genesis|first retained checkpoint/i
  );

  await store.retain(fixture.checkpoint1);
  await assert.rejects(
    store.retain(fixture.checkpoint3),
    /advance by one|sequence gap|next checkpoint/i
  );

  const retained = await store.retain(fixture.checkpoint2);
  assert.equal(retained.status, 'retained');
  assert.equal(retained.checkpoint_sequence, 2);
});

test('open rejects an incomplete trailing checkpoint instead of accepting a torn durable write', async t => {
  const fixture = checkpointFixture();
  const { statePath } = await tempState(t);
  const { openDelegationRootAttestationKeyCurrentnessStore } = await storeModule();
  await writeFile(statePath, canonicalJson(fixture.checkpoint1), 'utf8');

  await assert.rejects(
    openDelegationRootAttestationKeyCurrentnessStore(openOptions(statePath, fixture)),
    /incomplete trailing|torn/i
  );
});

test('durable currentness state path must be a regular non-symlink file', async t => {
  const fixture = checkpointFixture();
  const { dir } = await tempState(t);
  const target = join(dir, 'target.jsonl');
  const link = join(dir, 'link.jsonl');
  const { openDelegationRootAttestationKeyCurrentnessStore } = await storeModule();
  await writeFile(target, '', 'utf8');
  await symlink(target, link);

  await assert.rejects(
    openDelegationRootAttestationKeyCurrentnessStore(openOptions(link, fixture)),
    /regular non-symlink file/i
  );
});

test('durable currentness store enforces configurable state and checkpoint byte bounds', async t => {
  const fixture = checkpointFixture();
  const { statePath } = await tempState(t);
  const { openDelegationRootAttestationKeyCurrentnessStore } = await storeModule();
  const line = `${canonicalJson(fixture.checkpoint1)}\n`;
  await writeFile(statePath, line, 'utf8');
  const stateBytes = Buffer.byteLength(line, 'utf8');
  const checkpointBytes = Buffer.byteLength(canonicalJson(fixture.checkpoint1), 'utf8');

  await assert.rejects(
    openDelegationRootAttestationKeyCurrentnessStore(openOptions(statePath, fixture, {
      maxStateBytes: stateBytes - 1
    })),
    /state exceeds configured byte limit/i
  );

  await assert.rejects(
    openDelegationRootAttestationKeyCurrentnessStore(openOptions(statePath, fixture, {
      maxCheckpointBytes: checkpointBytes - 1
    })),
    /checkpoint 1 exceeds configured byte limit/i
  );
});

test('active store rejects external durable-state mutation before appending a new retained checkpoint', async t => {
  const fixture = checkpointFixture();
  const { statePath } = await tempState(t);
  const { openDelegationRootAttestationKeyCurrentnessStore } = await storeModule();
  const store = await openDelegationRootAttestationKeyCurrentnessStore(openOptions(statePath, fixture));
  await store.retain(fixture.checkpoint1);

  await writeFile(
    statePath,
    `${canonicalJson(fixture.checkpoint1)}\n${canonicalJson(fixture.checkpoint2)}\n`,
    'utf8'
  );

  await assert.rejects(
    store.retain(fixture.checkpoint2),
    /changed outside|disk.*memory|durable state changed/i
  );
});

test('open rejects non-canonical JSON even when it parses to a valid signed checkpoint', async t => {
  const fixture = checkpointFixture();
  const { statePath } = await tempState(t);
  const { openDelegationRootAttestationKeyCurrentnessStore } = await storeModule();
  await writeFile(statePath, `${JSON.stringify(fixture.checkpoint1, null, 2)}\n`, 'utf8');

  await assert.rejects(
    openDelegationRootAttestationKeyCurrentnessStore(openOptions(statePath, fixture)),
    /canonical JSON/i
  );
});

test('open rejects tampered signed checkpoint content in durable state', async t => {
  const fixture = checkpointFixture();
  const { statePath } = await tempState(t);
  const { openDelegationRootAttestationKeyCurrentnessStore } = await storeModule();
  const tampered = structuredClone(fixture.checkpoint1);
  tampered.statement.root_authority_digest = 'b'.repeat(64);
  await writeFile(statePath, `${canonicalJson(tampered)}\n`, 'utf8');

  await assert.rejects(
    openDelegationRootAttestationKeyCurrentnessStore(openOptions(statePath, fixture)),
    /statement digest|signature|root authority|digest.*match/i
  );
});

test('open rejects a locally truncated checkpoint path that omits controller-signed sequence one', async t => {
  const fixture = checkpointFixture();
  const { statePath } = await tempState(t);
  const { openDelegationRootAttestationKeyCurrentnessStore } = await storeModule();
  await writeFile(statePath, `${canonicalJson(fixture.checkpoint2)}\n`, 'utf8');

  await assert.rejects(
    openDelegationRootAttestationKeyCurrentnessStore(openOptions(statePath, fixture)),
    /begin at sequence 1|truncated path|sequence one/i
  );
});

test('durable currentness implementation uses an explicitly synced file handle and avoids appendFile', async () => {
  await storeModule();
  const source = await readFile(
    new URL('../src/lib/delegation-root-attestation-key-currentness-store.mjs', import.meta.url),
    'utf8'
  );
  assert.match(source, /await\s+handle\.sync\(\)/);
  assert.doesNotMatch(source, /\bappendFile\s*\(/);
});
