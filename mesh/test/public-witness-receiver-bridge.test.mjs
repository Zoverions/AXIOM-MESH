import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { PUBLICATION_PERSONA_SCHEMA } from '../src/identity/actor-state.mjs';
import { createPublicPersonaProjection } from '../src/lib/social-publication.mjs';
import { createPersonaSigningCredential } from '../src/lib/persona-journal-credential.mjs';
import { openPublicWitnessDurableStore } from '../src/lib/public-witness-durable-store.mjs';
import {
  createPublicWitnessSourceAdmission,
  createPublicWitnessTransferPackage
} from '../src/lib/public-witness-transfer.mjs';
import { openPublicWitnessReceiverStore } from '../src/lib/public-witness-receiver-store.mjs';
import {
  commitReceiverTransferObservation,
  findPublicWitnessDurableObservationRecord,
  reconcileReceiverTransferObservation
} from '../src/lib/public-witness-receiver-bridge.mjs';

const T0 = '2026-08-17T21:20:00.000Z';
const T1 = '2026-08-17T21:21:00.000Z';
const T2 = '2026-08-17T21:22:00.000Z';
const T3 = '2026-08-17T21:23:00.000Z';
const T4 = '2026-08-17T21:24:00.000Z';
const T5 = '2026-08-17T21:25:00.000Z';
const T6 = '2026-08-17T21:26:00.000Z';

function keys() {
  const pair = generateKeyPairSync('ed25519');
  return {
    privateKey: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
  };
}

function fixture() {
  const persona = {
    schema: PUBLICATION_PERSONA_SCHEMA,
    persona_id: 'persona-receiver-bridge',
    controller_actor_id: 'actor-private-receiver-bridge',
    represented_actor_id: null,
    attribution_mode: 'pseudonymous',
    public_actor_link: null,
    selective_link_commitment: null,
    delegation_authority_digest: null,
    created_at: T0,
    status: 'active'
  };
  const projection = createPublicPersonaProjection(persona);
  const root = keys();
  const journal = keys();
  const source = keys();
  const witness = keys();
  const credential = createPersonaSigningCredential({
    personaId: projection.persona_id,
    personaProjectionDigest: projection.projection_digest,
    personaRootPrivateKey: root.privateKey,
    signingPublicKey: journal.publicKey,
    epoch: 1,
    activatedAt: T0
  });
  const admission = createPublicWitnessSourceAdmission({
    domainId: 'axiom.social.public.v1',
    sourceId: 'source-receiver-bridge',
    sourcePublicKey: source.publicKey,
    validFrom: T0,
    expiresAt: '2026-08-17T22:00:00.000Z'
  });
  const transfer = createPublicWitnessTransferPackage({
    operation: 'observe-credential',
    request: { credential }
  }, {
    sourceAdmission: admission,
    sourcePrivateKey: source.privateKey,
    transferId: 'receiver-bridge-transfer',
    createdAt: T1,
    expiresAt: T6,
    now: Date.parse(T1)
  });
  return { root, witness, credential, admission, transfer };
}

async function stores(data) {
  const dir = await mkdtemp(join(tmpdir(), 'axiom-receiver-bridge-'));
  const receiverStatePath = join(dir, 'receiver.jsonl');
  const witnessStatePath = join(dir, 'witness.jsonl');
  const receiverStore = await openPublicWitnessReceiverStore({
    statePath: receiverStatePath,
    domainId: 'axiom.social.public.v1',
    witnessId: 'witness-receiver-bridge',
    witnessPrivateKey: data.witness.privateKey
  });
  const witnessStore = await openPublicWitnessDurableStore({
    statePath: witnessStatePath,
    domainId: 'axiom.social.public.v1',
    witnessId: 'witness-receiver-bridge',
    witnessPrivateKey: data.witness.privateKey
  });
  return { dir, receiverStatePath, witnessStatePath, receiverStore, witnessStore };
}

async function intake(data, receiverStore) {
  await receiverStore.admitSource(data.admission, { admittedAt: T0 });
  return receiverStore.receiveTransfer(data.transfer, {
    trustedPersonaRootPublicKey: data.root.publicKey,
    receivedAt: T2
  });
}

test('receiver bridge commits an intake into the durable witness and links both evidence chains', async () => {
  const data = fixture();
  const setup = await stores(data);
  const received = await intake(data, setup.receiverStore);
  const result = await commitReceiverTransferObservation({
    receiverStore: setup.receiverStore,
    witnessStore: setup.witnessStore,
    witnessStatePath: setup.witnessStatePath,
    transferDigest: received.transfer_digest,
    sourceAdmission: data.admission,
    trustedPersonaRootPublicKey: data.root.publicKey,
    observedAt: T3,
    committedAt: T4
  });
  assert.equal(result.status, 'observation-committed');
  assert.equal(result.receiver_commit.transfer.observation_status, 'observation-committed');
  assert.equal(result.receiver_commit.transfer.reconciled_after_restart, false);
  assert.equal(result.witness_durable_record.statement.observation_digest, result.observation.observation_digest);
  assert.equal(setup.receiverStore.snapshot().pending_observation_count, 0);
  assert.equal(setup.receiverStore.snapshot().committed_observation_count, 1);
  assert.equal((await setup.receiverStore.verifyState()).valid, true);
  assert.equal((await setup.witnessStore.verifyState()).valid, true);
});

test('crash after witness commit but before receiver linkage remains visible and reconciles after restart without a second observation', async () => {
  const data = fixture();
  const setup = await stores(data);
  const received = await intake(data, setup.receiverStore);

  const direct = await setup.witnessStore.commit('observe-credential', {
    credential: data.credential,
    trusted_persona_root_public_key: data.root.publicKey,
    observed_at: T3
  }, { committedAt: T4 });
  assert.equal(direct.status, 'observed');
  assert.equal(setup.receiverStore.getTransfer(received.transfer_digest).observation_status, 'pending-observation');

  const reopenedReceiver = await openPublicWitnessReceiverStore({
    statePath: setup.receiverStatePath,
    domainId: 'axiom.social.public.v1',
    witnessId: 'witness-receiver-bridge',
    witnessPrivateKey: data.witness.privateKey
  });
  const reopenedWitness = await openPublicWitnessDurableStore({
    statePath: setup.witnessStatePath,
    domainId: 'axiom.social.public.v1',
    witnessId: 'witness-receiver-bridge',
    witnessPrivateKey: data.witness.privateKey
  });
  assert.equal(reopenedReceiver.listPendingTransfers().length, 1);

  const reconciled = await reconcileReceiverTransferObservation({
    receiverStore: reopenedReceiver,
    witnessStore: reopenedWitness,
    witnessStatePath: setup.witnessStatePath,
    transferDigest: received.transfer_digest,
    sourceAdmission: data.admission,
    trustedPersonaRootPublicKey: data.root.publicKey,
    now: Date.parse(T5)
  });
  assert.equal(reconciled.status, 'reconciled');
  assert.equal(reconciled.receiver_commit.transfer.reconciled_after_restart, true);
  assert.equal(reconciled.receiver_commit.transfer.observation_digest, direct.observation.observation_digest);
  assert.equal(reopenedReceiver.listPendingTransfers().length, 0);
  assert.equal(reopenedReceiver.snapshot().committed_observation_count, 1);

  const durable = await findPublicWitnessDurableObservationRecord({
    statePath: setup.witnessStatePath,
    trustedWitnessPublicKey: reopenedWitness.witnessPublicKey,
    observationDigest: direct.observation.observation_digest,
    expectedDomainId: 'axiom.social.public.v1',
    expectedWitnessId: 'witness-receiver-bridge'
  });
  assert.equal(durable.record_digest, direct.durable_record.record_digest);
});

test('reconciliation remains pending when the durable witness has not observed the transfer artifact', async () => {
  const data = fixture();
  const setup = await stores(data);
  const received = await intake(data, setup.receiverStore);
  const reconciled = await reconcileReceiverTransferObservation({
    receiverStore: setup.receiverStore,
    witnessStore: setup.witnessStore,
    witnessStatePath: setup.witnessStatePath,
    transferDigest: received.transfer_digest,
    sourceAdmission: data.admission,
    trustedPersonaRootPublicKey: data.root.publicKey,
    now: Date.parse(T4)
  });
  assert.equal(reconciled.status, 'pending-observation');
  assert.equal(setup.receiverStore.getTransfer(received.transfer_digest).observation_status, 'pending-observation');
});

test('bridge rejects source-admission substitution, persona-root substitution, and witness-key mismatch', async () => {
  const data = fixture();
  const setup = await stores(data);
  const received = await intake(data, setup.receiverStore);
  const otherSource = keys();
  const otherAdmission = createPublicWitnessSourceAdmission({
    domainId: 'axiom.social.public.v1',
    sourceId: 'source-receiver-bridge-other',
    sourcePublicKey: otherSource.publicKey,
    validFrom: T0,
    expiresAt: '2026-08-17T22:00:00.000Z'
  });
  await assert.rejects(
    () => commitReceiverTransferObservation({
      receiverStore: setup.receiverStore,
      witnessStore: setup.witnessStore,
      witnessStatePath: setup.witnessStatePath,
      transferDigest: received.transfer_digest,
      sourceAdmission: otherAdmission,
      trustedPersonaRootPublicKey: data.root.publicKey,
      observedAt: T3,
      committedAt: T4
    }),
    /source admission does not match durable intake/
  );

  const wrongRoot = keys();
  await assert.rejects(
    () => commitReceiverTransferObservation({
      receiverStore: setup.receiverStore,
      witnessStore: setup.witnessStore,
      witnessStatePath: setup.witnessStatePath,
      transferDigest: received.transfer_digest,
      sourceAdmission: data.admission,
      trustedPersonaRootPublicKey: wrongRoot.publicKey,
      observedAt: T3,
      committedAt: T4
    }),
    /root key|trusted persona root|does not match/i
  );

  const otherWitness = keys();
  const otherWitnessStore = await openPublicWitnessDurableStore({
    statePath: join(setup.dir, 'other-witness.jsonl'),
    domainId: 'axiom.social.public.v1',
    witnessId: 'witness-receiver-bridge',
    witnessPrivateKey: otherWitness.privateKey
  });
  await assert.rejects(
    () => commitReceiverTransferObservation({
      receiverStore: setup.receiverStore,
      witnessStore: otherWitnessStore,
      witnessStatePath: join(setup.dir, 'other-witness.jsonl'),
      transferDigest: received.transfer_digest,
      sourceAdmission: data.admission,
      trustedPersonaRootPublicKey: data.root.publicKey,
      observedAt: T3,
      committedAt: T4
    }),
    /must use the same witness key/
  );
});
