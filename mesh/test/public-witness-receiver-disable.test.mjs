import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { PUBLICATION_PERSONA_SCHEMA } from '../src/identity/actor-state.mjs';
import {
  createCredentialedPersonaPublicationAttestation,
  createPersonaSigningCredential
} from '../src/lib/persona-journal-credential.mjs';
import { openPublicWitnessReceiverStore } from '../src/lib/public-witness-receiver-store.mjs';
import {
  createPublicPersonaProjection,
  createSocialPublicationProjection
} from '../src/lib/social-publication.mjs';
import {
  createPublicWitnessSourceAdmission,
  createPublicWitnessTransferPackage
} from '../src/lib/public-witness-transfer.mjs';

const DOMAIN = 'axiom.social.public.v1';
const T0 = '2026-08-17T23:00:00.000Z';
const T1 = '2026-08-17T23:01:00.000Z';
const T2 = '2026-08-17T23:02:00.000Z';
const T3 = '2026-08-17T23:03:00.000Z';
const T4 = '2026-08-17T23:04:00.000Z';
const T5 = '2026-08-17T23:05:00.000Z';
const TEND = '2026-08-17T23:10:00.000Z';

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
    persona_id: 'persona-receiver-disable',
    controller_actor_id: 'actor-private-receiver-disable',
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
  const source1 = keys();
  const source2 = keys();
  const witness = keys();
  const credential = createPersonaSigningCredential({
    personaId: projection.persona_id,
    personaProjectionDigest: projection.projection_digest,
    personaRootPrivateKey: root.privateKey,
    signingPublicKey: journal.publicKey,
    epoch: 1,
    activatedAt: T0
  });
  const publication = createSocialPublicationProjection({
    publication_id: 'receiver-disable-publication',
    content: { media_type: 'text/plain', text: 'Disable must contract future source trust without erasing history.' },
    attachment_digests: [],
    audience: { mode: 'public' },
    discoverability: 'listed',
    authorship_mode: 'human-authored',
    created_at: T1,
    supersedes_digest: null
  }, { persona });
  const attestation = createCredentialedPersonaPublicationAttestation(publication, {
    personaJournalPrivateKey: journal.privateKey,
    personaSigningCredential: credential,
    trustedPersonaRootPublicKey: root.publicKey,
    issuedAt: T2
  });
  const admission1 = createPublicWitnessSourceAdmission({
    domainId: DOMAIN,
    sourceId: 'source-receiver-disable',
    sourcePublicKey: source1.publicKey,
    sourceEpoch: 1,
    validFrom: T0,
    expiresAt: TEND
  });
  const admission2 = createPublicWitnessSourceAdmission({
    domainId: DOMAIN,
    sourceId: 'source-receiver-disable',
    sourcePublicKey: source2.publicKey,
    sourceEpoch: 2,
    validFrom: T4,
    expiresAt: TEND
  });
  const request = {
    attestation,
    persona_signing_credential: credential,
    entry: publication,
    publication: null
  };
  return { root, source1, source2, witness, admission1, admission2, request };
}

function transfer(data, {
  admission = data.admission1,
  sourcePrivateKey = data.source1.privateKey,
  transferId,
  sequence,
  previousTransfer = null,
  createdAt
}) {
  return createPublicWitnessTransferPackage({ operation: 'observe-journal', request: data.request }, {
    sourceAdmission: admission,
    sourcePrivateKey,
    transferId,
    sequence,
    previousTransfer,
    createdAt,
    expiresAt: TEND,
    now: Date.parse(createdAt)
  });
}

async function openStore(data) {
  const dir = await mkdtemp(join(tmpdir(), 'axiom-receiver-disable-'));
  const statePath = join(dir, 'receiver.jsonl');
  const store = await openPublicWitnessReceiverStore({
    statePath,
    domainId: DOMAIN,
    witnessId: 'witness-receiver-disable',
    witnessPrivateKey: data.witness.privateKey
  });
  return { store, statePath };
}

test('source disable is durable trust contraction: unseen traffic stops while exact historical replay remains idempotent', async () => {
  const data = fixture();
  const { store, statePath } = await openStore(data);
  await store.admitSource(data.admission1, { admittedAt: T0 });
  const first = transfer(data, { transferId: 'disable-first', sequence: 1, createdAt: T2 });
  const firstReceipt = await store.receiveTransfer(first, {
    trustedPersonaRootPublicKey: data.root.publicKey,
    receivedAt: T2
  });
  const disabled = await store.disableSource({
    sourceId: data.admission1.source_id,
    sourceEpoch: 1,
    sourceAdmissionDigest: data.admission1.admission_digest,
    disabledAt: T3,
    reason: 'operator-disable'
  });
  assert.equal(disabled.status, 'disabled');
  assert.equal(disabled.source.source_status, 'disabled');
  assert.equal(disabled.source.disabled_at, T3);
  assert.equal(disabled.source.disable_reason, 'operator-disable');
  assert.equal(disabled.durable_record.statement.record_kind, 'source-disable');
  assert.equal(disabled.durable_record.payload.source_trust_effect, 'disable-only');
  assert.equal(disabled.durable_record.payload.remote_disable_allowed, false);

  const second = transfer(data, {
    transferId: 'disable-second',
    sequence: 2,
    previousTransfer: first,
    createdAt: T4
  });
  await assert.rejects(
    () => store.receiveTransfer(second, {
      trustedPersonaRootPublicKey: data.root.publicKey,
      receivedAt: T4
    }),
    /source epoch is locally disabled/
  );

  const replay = await store.receiveTransfer(first, {
    trustedPersonaRootPublicKey: data.root.publicKey,
    receivedAt: T4
  });
  assert.equal(replay.status, 'replay');
  assert.equal(replay.transfer_receipt.receipt_digest, firstReceipt.transfer_receipt.receipt_digest);
  const bytesAfterReplay = (await stat(statePath)).size;

  const reopened = await openPublicWitnessReceiverStore({
    statePath,
    domainId: DOMAIN,
    witnessId: 'witness-receiver-disable',
    witnessPrivateKey: data.witness.privateKey
  });
  assert.equal((await reopened.verifyState()).valid, true);
  assert.equal(reopened.getActiveSourceAdmission(data.admission1.source_id).source_status, 'disabled');
  const replayAfterRestart = await reopened.receiveTransfer(first, {
    trustedPersonaRootPublicKey: data.root.publicKey,
    receivedAt: T4
  });
  assert.equal(replayAfterRestart.status, 'replay');
  assert.equal((await stat(statePath)).size, bytesAfterReplay);
  await assert.rejects(
    () => reopened.receiveTransfer(second, {
      trustedPersonaRootPublicKey: data.root.publicKey,
      receivedAt: T4
    }),
    /source epoch is locally disabled/
  );
});

test('disabled source can return only through the exact next admission epoch after disable time', async () => {
  const data = fixture();
  const { store } = await openStore(data);
  await store.admitSource(data.admission1, { admittedAt: T0 });
  await store.disableSource({
    sourceId: data.admission1.source_id,
    sourceEpoch: 1,
    sourceAdmissionDigest: data.admission1.admission_digest,
    disabledAt: T3,
    reason: 'suspected-key-compromise'
  });

  await assert.rejects(
    () => store.admitSource(data.admission2, { admittedAt: T3 }),
    /activation must occur after local disable/
  );
  const admitted = await store.admitSource(data.admission2, { admittedAt: T4 });
  assert.equal(admitted.status, 'admitted');
  const active = store.getActiveSourceAdmission(data.admission1.source_id);
  assert.equal(active.source_epoch, 2);
  assert.equal(active.source_status, 'active');

  const epoch2 = transfer(data, {
    admission: data.admission2,
    sourcePrivateKey: data.source2.privateKey,
    transferId: 'epoch-two-after-disable',
    sequence: 1,
    createdAt: T5
  });
  const accepted = await store.receiveTransfer(epoch2, {
    trustedPersonaRootPublicKey: data.root.publicKey,
    receivedAt: T5
  });
  assert.equal(accepted.status, 'received');
});

test('disable requires exact active source identity, is idempotent only for the same disable, and cannot backdate', async () => {
  const data = fixture();
  const { store, statePath } = await openStore(data);
  await store.admitSource(data.admission1, { admittedAt: T0 });

  await assert.rejects(
    () => store.disableSource({
      sourceId: data.admission1.source_id,
      sourceEpoch: 2,
      sourceAdmissionDigest: data.admission1.admission_digest,
      disabledAt: T3,
      reason: 'operator-disable'
    }),
    /does not match the exact active admission/
  );
  await assert.rejects(
    () => store.disableSource({
      sourceId: data.admission1.source_id,
      sourceEpoch: 1,
      sourceAdmissionDigest: 'f'.repeat(64),
      disabledAt: T3,
      reason: 'operator-disable'
    }),
    /does not match the exact active admission/
  );
  await assert.rejects(
    () => store.disableSource({
      sourceId: data.admission1.source_id,
      sourceEpoch: 1,
      sourceAdmissionDigest: data.admission1.admission_digest,
      disabledAt: T0,
      reason: 'operator-disable'
    }),
    /disable time must follow source activation/
  );

  const first = await store.disableSource({
    sourceId: data.admission1.source_id,
    sourceEpoch: 1,
    sourceAdmissionDigest: data.admission1.admission_digest,
    disabledAt: T3,
    reason: 'policy-withdrawal'
  });
  const bytes = (await stat(statePath)).size;
  const replay = await store.disableSource({
    sourceId: data.admission1.source_id,
    sourceEpoch: 1,
    sourceAdmissionDigest: data.admission1.admission_digest,
    disabledAt: T3,
    reason: 'policy-withdrawal'
  });
  assert.equal(replay.status, 'replay');
  assert.equal(replay.durable_record, null);
  assert.equal(replay.source.disable_record_digest, first.source.disable_record_digest);
  assert.equal((await stat(statePath)).size, bytes);

  await assert.rejects(
    () => store.disableSource({
      sourceId: data.admission1.source_id,
      sourceEpoch: 1,
      sourceAdmissionDigest: data.admission1.admission_digest,
      disabledAt: T4,
      reason: 'operator-disable'
    }),
    /already disabled with different evidence/
  );
});

test('disable reason and durable record claims remain bounded and non-authoritative', async () => {
  const data = fixture();
  const { store } = await openStore(data);
  await store.admitSource(data.admission1, { admittedAt: T0 });
  await assert.rejects(
    () => store.disableSource({
      sourceId: data.admission1.source_id,
      sourceEpoch: 1,
      sourceAdmissionDigest: data.admission1.admission_digest,
      disabledAt: T3,
      reason: 'remote-requested-disable'
    }),
    /disable reason is unsupported/
  );
  const result = await store.disableSource({
    sourceId: data.admission1.source_id,
    sourceEpoch: 1,
    sourceAdmissionDigest: data.admission1.admission_digest,
    disabledAt: T3,
    reason: 'source-retirement'
  });
  assert.equal(result.durable_record.payload.local_operator_input, true);
  assert.equal(result.durable_record.payload.remote_disable_allowed, false);
  assert.equal(result.durable_record.payload.persona_root_trust_effect, 'none');
  assert.equal(result.durable_record.payload.social_authority_effect, 'none');
  assert.equal(result.durable_record.payload.finality_claimed, false);
  assert.equal(result.durable_record.payload.authority_effect, 'none');
  assert.equal(result.durable_record.payload.network_effect, 'none');
});
