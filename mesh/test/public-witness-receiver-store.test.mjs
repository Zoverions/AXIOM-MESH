import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { PUBLICATION_PERSONA_SCHEMA } from '../src/identity/actor-state.mjs';
import {
  createPublicPersonaProjection,
  createSocialPublicationProjection
} from '../src/lib/social-publication.mjs';
import {
  createCredentialedPersonaPublicationAttestation,
  createPersonaSigningCredential
} from '../src/lib/persona-journal-credential.mjs';
import {
  createPublicWitnessSourceAdmission,
  createPublicWitnessTransferPackage
} from '../src/lib/public-witness-transfer.mjs';
import {
  openPublicWitnessReceiverStore
} from '../src/lib/public-witness-receiver-store.mjs';

const T0 = '2026-08-17T21:00:00.000Z';
const T1 = '2026-08-17T21:01:00.000Z';
const T2 = '2026-08-17T21:02:00.000Z';
const T3 = '2026-08-17T21:03:00.000Z';
const T4 = '2026-08-17T21:04:00.000Z';
const T5 = '2026-08-17T21:05:00.000Z';
const T6 = '2026-08-17T21:06:00.000Z';
const T7 = '2026-08-17T21:07:00.000Z';
const T8 = '2026-08-17T21:08:00.000Z';
const TEND = '2026-08-17T22:00:00.000Z';

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
    persona_id: 'persona-receiver-store',
    controller_actor_id: 'actor-private-receiver-store',
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
    publication_id: 'receiver-publication',
    content: { media_type: 'text/plain', text: 'Receiver intake must be restart-safe before network exposure.' },
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
    domainId: 'axiom.social.public.v1',
    sourceId: 'source-receiver-one',
    sourcePublicKey: source.publicKey,
    sourceEpoch: 1,
    validFrom: T0,
    expiresAt: TEND
  });
  const admission2 = createPublicWitnessSourceAdmission({
    domainId: 'axiom.social.public.v1',
    sourceId: 'source-receiver-one',
    sourcePublicKey: source2.publicKey,
    sourceEpoch: 2,
    validFrom: T4,
    expiresAt: TEND
  });
  return { persona, projection, root, journal, source, source2, witness, credential, publication, attestation, admission1, admission2 };
}

function credentialTransfer(data, {
  admission = data.admission1,
  sourcePrivateKey = data.source.privateKey,
  previousTransfer = null,
  transferId = 'receiver-transfer-1',
  createdAt = T1,
  expiresAt = T6
} = {}) {
  return createPublicWitnessTransferPackage({
    operation: 'observe-credential',
    request: { credential: data.credential }
  }, {
    sourceAdmission: admission,
    sourcePrivateKey,
    previousTransfer,
    transferId,
    createdAt,
    expiresAt,
    now: Date.parse(createdAt)
  });
}

function journalTransfer(data, {
  admission = data.admission1,
  sourcePrivateKey = data.source.privateKey,
  previousTransfer = null,
  transferId = 'receiver-journal-1',
  createdAt = T2,
  expiresAt = T7
} = {}) {
  return createPublicWitnessTransferPackage({
    operation: 'observe-journal',
    request: {
      attestation: data.attestation,
      persona_signing_credential: data.credential,
      entry: data.publication,
      publication: null
    }
  }, {
    sourceAdmission: admission,
    sourcePrivateKey,
    previousTransfer,
    transferId,
    createdAt,
    expiresAt,
    now: Date.parse(createdAt)
  });
}

async function paths() {
  const dir = await mkdtemp(join(tmpdir(), 'axiom-witness-receiver-'));
  return { dir, statePath: join(dir, 'receiver-state.jsonl') };
}

async function openStore(statePath, witness, overrides = {}) {
  return openPublicWitnessReceiverStore({
    statePath,
    domainId: 'axiom.social.public.v1',
    witnessId: 'witness-receiver-one',
    witnessPrivateKey: witness.privateKey,
    ...overrides
  });
}

test('source admission and transfer receipt survive restart with exact replay idempotency', async () => {
  const data = fixture();
  const { statePath } = await paths();
  const store = await openStore(statePath, data.witness);
  const admitted = await store.admitSource(data.admission1, { admittedAt: T0 });
  assert.equal(admitted.status, 'admitted');
  const transfer = credentialTransfer(data);
  const received = await store.receiveTransfer(transfer, {
    trustedPersonaRootPublicKey: data.root.publicKey,
    receivedAt: T2
  });
  assert.equal(received.status, 'received');
  assert.equal(received.observation_status, 'pending-observation');
  assert.equal(received.transfer_receipt.statement.observation_committed, false);
  const bytes = (await stat(statePath)).size;

  const reopened = await openStore(statePath, data.witness);
  assert.equal((await reopened.verifyState()).valid, true);
  assert.equal(reopened.snapshot().source_count, 1);
  assert.equal(reopened.snapshot().transfer_count, 1);
  assert.equal(reopened.snapshot().pending_observation_count, 1);
  const replay = await reopened.receiveTransfer(structuredClone(transfer), {
    trustedPersonaRootPublicKey: data.root.publicKey,
    receivedAt: T3
  });
  assert.equal(replay.status, 'replay');
  assert.equal(replay.transfer_receipt.receipt_digest, received.transfer_receipt.receipt_digest);
  assert.equal((await stat(statePath)).size, bytes);
});

test('source sequence gaps and missing predecessors fail before persistence', async () => {
  const data = fixture();
  const { statePath } = await paths();
  const store = await openStore(statePath, data.witness);
  await store.admitSource(data.admission1, { admittedAt: T0 });
  const first = credentialTransfer(data);
  const second = journalTransfer(data, { previousTransfer: first, transferId: 'receiver-transfer-2' });
  await assert.rejects(
    () => store.receiveTransfer(second, {
      trustedPersonaRootPublicKey: data.root.publicKey,
      receivedAt: T3
    }),
    /next contiguous source sequence/
  );
  assert.equal(store.snapshot().transfer_count, 0);
  await store.receiveTransfer(first, {
    trustedPersonaRootPublicKey: data.root.publicKey,
    receivedAt: T2
  });
  const badPredecessor = structuredClone(second);
  badPredecessor.statement.previous_transfer_digest = 'f'.repeat(64);
  await assert.rejects(
    () => store.receiveTransfer(badPredecessor, {
      trustedPersonaRootPublicKey: data.root.publicKey,
      receivedAt: T3
    }),
    /statement digest|source signature|transfer digest/
  );
  assert.equal(store.snapshot().transfer_count, 1);
});

test('same source position fork is preserved as equivocation and halts forward source advancement', async () => {
  const data = fixture();
  const { statePath } = await paths();
  const store = await openStore(statePath, data.witness);
  await store.admitSource(data.admission1, { admittedAt: T0 });
  const first = credentialTransfer(data);
  const fork = journalTransfer(data, {
    previousTransfer: null,
    transferId: 'receiver-fork-1',
    createdAt: T2
  });
  await store.receiveTransfer(first, {
    trustedPersonaRootPublicKey: data.root.publicKey,
    receivedAt: T2
  });
  const conflicted = await store.receiveTransfer(fork, {
    trustedPersonaRootPublicKey: data.root.publicKey,
    receivedAt: T3
  });
  assert.equal(conflicted.status, 'received-with-equivocation');
  assert.equal(conflicted.source_equivocation_evidence.preferred_transfer_digest, null);
  assert.equal(store.snapshot().conflicted_source_count, 1);
  assert.equal(store.listSourcePositions('source-receiver-one', 1).length, 2);

  const next = journalTransfer(data, {
    previousTransfer: first,
    transferId: 'receiver-next-after-fork',
    createdAt: T4,
    expiresAt: T8
  });
  await assert.rejects(
    () => store.receiveTransfer(next, {
      trustedPersonaRootPublicKey: data.root.publicKey,
      receivedAt: T4
    }),
    /conflicted and cannot advance/
  );
});

test('transfer id reuse at a later sequence is rejected even when source predecessor chain is otherwise valid', async () => {
  const data = fixture();
  const { statePath } = await paths();
  const store = await openStore(statePath, data.witness);
  await store.admitSource(data.admission1, { admittedAt: T0 });
  const first = credentialTransfer(data, { transferId: 'reused-id' });
  const second = journalTransfer(data, {
    previousTransfer: first,
    transferId: 'middle-id',
    createdAt: T2
  });
  const third = credentialTransfer(data, {
    previousTransfer: second,
    transferId: 'reused-id',
    createdAt: T3,
    expiresAt: T8
  });
  await store.receiveTransfer(first, {
    trustedPersonaRootPublicKey: data.root.publicKey,
    receivedAt: T1
  });
  await store.receiveTransfer(second, {
    trustedPersonaRootPublicKey: data.root.publicKey,
    receivedAt: T2
  });
  await assert.rejects(
    () => store.receiveTransfer(third, {
      trustedPersonaRootPublicKey: data.root.publicKey,
      receivedAt: T3
    }),
    /transfer_id was already used/
  );
  assert.equal(store.snapshot().transfer_count, 2);
});

test('local source epoch rollover rejects unseen stale-epoch traffic but preserves exact historical replay', async () => {
  const data = fixture();
  const { statePath } = await paths();
  const store = await openStore(statePath, data.witness);
  await store.admitSource(data.admission1, { admittedAt: T0 });
  const first = credentialTransfer(data);
  const firstReceipt = await store.receiveTransfer(first, {
    trustedPersonaRootPublicKey: data.root.publicKey,
    receivedAt: T2
  });
  await store.admitSource(data.admission2, { admittedAt: T4 });

  const oldEpochSecond = journalTransfer(data, {
    previousTransfer: first,
    transferId: 'old-epoch-after-rollover',
    createdAt: T4,
    expiresAt: T8
  });
  await assert.rejects(
    () => store.receiveTransfer(oldEpochSecond, {
      trustedPersonaRootPublicKey: data.root.publicKey,
      receivedAt: T5
    }),
    /stale source epoch/
  );
  const replay = await store.receiveTransfer(first, {
    trustedPersonaRootPublicKey: data.root.publicKey,
    receivedAt: T5
  });
  assert.equal(replay.status, 'replay');
  assert.equal(replay.transfer_receipt.receipt_digest, firstReceipt.transfer_receipt.receipt_digest);

  const epoch2First = credentialTransfer(data, {
    admission: data.admission2,
    sourcePrivateKey: data.source2.privateKey,
    previousTransfer: null,
    transferId: 'epoch-two-first',
    createdAt: T5,
    expiresAt: '2026-08-17T21:09:00.000Z'
  });
  const accepted = await store.receiveTransfer(epoch2First, {
    trustedPersonaRootPublicKey: data.root.publicKey,
    receivedAt: T5
  });
  assert.equal(accepted.status, 'received');
  assert.equal(store.listSourcePositions('source-receiver-one', 2).length, 1);
});

test('persona-root mismatch and transfer capacity exhaustion leave no partial durable intake', async () => {
  const data = fixture();
  const { statePath } = await paths();
  const store = await openStore(statePath, data.witness, { maxTransfers: 1 });
  await store.admitSource(data.admission1, { admittedAt: T0 });
  const first = credentialTransfer(data);
  const wrongRoot = keys();
  const beforeMismatch = (await stat(statePath)).size;
  await assert.rejects(
    () => store.receiveTransfer(first, {
      trustedPersonaRootPublicKey: wrongRoot.publicKey,
      receivedAt: T2
    }),
    /root key|trusted persona root|does not match/i
  );
  assert.equal((await stat(statePath)).size, beforeMismatch);

  await store.receiveTransfer(first, {
    trustedPersonaRootPublicKey: data.root.publicKey,
    receivedAt: T2
  });
  const second = journalTransfer(data, {
    previousTransfer: first,
    transferId: 'capacity-second',
    createdAt: T3,
    expiresAt: T8
  });
  const beforeCapacity = (await stat(statePath)).size;
  await assert.rejects(
    () => store.receiveTransfer(second, {
      trustedPersonaRootPublicKey: data.root.publicKey,
      receivedAt: T3
    }),
    /transfer capacity is exhausted/
  );
  assert.equal((await stat(statePath)).size, beforeCapacity);
  assert.equal(store.snapshot().transfer_count, 1);
});

test('tampered and truncated receiver state fail closed on restart', async () => {
  const data = fixture();
  const { dir, statePath } = await paths();
  const store = await openStore(statePath, data.witness);
  await store.admitSource(data.admission1, { admittedAt: T0 });
  const valid = await readFile(statePath, 'utf8');

  const tamperedPath = join(dir, 'tampered.jsonl');
  const parsed = JSON.parse(valid.trimEnd());
  parsed.payload.admitted_at = T1;
  await writeFile(tamperedPath, `${JSON.stringify(parsed)}\n`, 'utf8');
  await assert.rejects(
    () => openStore(tamperedPath, data.witness),
    /canonical JSON|payload digest|signature|record digest/
  );

  const truncatedPath = join(dir, 'truncated.jsonl');
  await writeFile(truncatedPath, valid.slice(0, -1), 'utf8');
  await assert.rejects(
    () => openStore(truncatedPath, data.witness),
    /incomplete trailing record/
  );
});

test('source admission epoch is monotonic and same-epoch local replacement fails closed', async () => {
  const data = fixture();
  const { statePath } = await paths();
  const store = await openStore(statePath, data.witness);
  await store.admitSource(data.admission1, { admittedAt: T0 });
  const replacementKey = keys();
  const sameEpoch = createPublicWitnessSourceAdmission({
    domainId: 'axiom.social.public.v1',
    sourceId: 'source-receiver-one',
    sourcePublicKey: replacementKey.publicKey,
    sourceEpoch: 1,
    validFrom: T1,
    expiresAt: TEND
  });
  await assert.rejects(
    () => store.admitSource(sameEpoch, { admittedAt: T1 }),
    /within the same epoch/
  );
  await store.admitSource(data.admission2, { admittedAt: T4 });
  const epoch4 = createPublicWitnessSourceAdmission({
    domainId: 'axiom.social.public.v1',
    sourceId: 'source-receiver-one',
    sourcePublicKey: replacementKey.publicKey,
    sourceEpoch: 4,
    validFrom: T5,
    expiresAt: TEND
  });
  await assert.rejects(
    () => store.admitSource(epoch4, { admittedAt: T5 }),
    /epoch must advance exactly one/
  );
});
