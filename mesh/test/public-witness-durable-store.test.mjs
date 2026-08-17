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
import { canonicalJson } from '../src/lib/canonical.mjs';
import {
  PUBLIC_WITNESS_DURABLE_RECORD_SCHEMA,
  openPublicWitnessDurableStore,
  verifyPublicWitnessDurableRecord
} from '../src/lib/public-witness-durable-store.mjs';

const T0 = '2026-08-17T19:10:00.000Z';
const T1 = '2026-08-17T19:11:00.000Z';
const T2 = '2026-08-17T19:12:00.000Z';
const T3 = '2026-08-17T19:13:00.000Z';

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
    persona_id: 'persona-durable-witness',
    controller_actor_id: 'actor-private-durable-witness',
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
  const credential = createPersonaSigningCredential({
    personaId: projection.persona_id,
    personaProjectionDigest: projection.projection_digest,
    personaRootPrivateKey: root.privateKey,
    signingPublicKey: journal.publicKey,
    epoch: 1,
    activatedAt: T0
  });
  const publication = createSocialPublicationProjection({
    publication_id: 'durable-publication',
    content: { media_type: 'text/plain', text: 'Durable witness state must replay to the same evidence.' },
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
    issuedAt: T1
  });
  return { persona, projection, root, journal, credential, publication, attestation };
}

async function paths() {
  const dir = await mkdtemp(join(tmpdir(), 'axiom-witness-durable-'));
  return { dir, statePath: join(dir, 'witness-state.jsonl') };
}

async function storeAt(statePath, witness, overrides = {}) {
  return openPublicWitnessDurableStore({
    statePath,
    domainId: 'axiom.social.public.v1',
    witnessId: 'witness-durable-one',
    witnessPrivateKey: witness.privateKey,
    ...overrides
  });
}

function credentialRequest(data, observedAt = T1) {
  return {
    credential: data.credential,
    trusted_persona_root_public_key: data.root.publicKey,
    observed_at: observedAt
  };
}

function journalRequest(data, observedAt = T2) {
  return {
    attestation: data.attestation,
    persona_signing_credential: data.credential,
    trusted_persona_root_public_key: data.root.publicKey,
    entry: data.publication,
    publication: null,
    observed_at: observedAt
  };
}

test('durable witness records are signed, hash-chained, fsynced state that reproduces across restart', async () => {
  const data = fixture();
  const witness = keys();
  const { statePath } = await paths();
  const firstStore = await storeAt(statePath, witness);
  const first = await firstStore.commit('observe-credential', credentialRequest(data), { committedAt: T1 });
  const second = await firstStore.commit('observe-journal', journalRequest(data), { committedAt: T2 });
  assert.equal(first.durable_record.schema, PUBLIC_WITNESS_DURABLE_RECORD_SCHEMA);
  assert.equal(first.durable_record.statement.sequence, 1);
  assert.equal(first.durable_record.statement.previous_record_digest, null);
  assert.equal(second.durable_record.statement.sequence, 2);
  assert.equal(second.durable_record.statement.previous_record_digest, first.durable_record.record_digest);
  assert.equal(second.durable_record.statement.data_availability_claimed, false);
  assert.equal(second.durable_record.statement.finality_claimed, false);
  assert.equal(second.durable_record.statement.authority_effect, 'none');
  assert.equal(second.durable_record.statement.network_effect, 'none');
  assert.equal((await firstStore.verifyState()).valid, true);

  const before = firstStore.snapshot();
  const reopened = await storeAt(statePath, witness);
  const after = reopened.snapshot();
  assert.equal(after.artifact_count, before.artifact_count);
  assert.equal(after.conflict_count, before.conflict_count);
  assert.equal(after.durable_record_count, 2);
  assert.equal(after.durable_last_record_digest, second.durable_record.record_digest);
  assert.equal(reopened.getObservation(data.attestation.attestation_digest).observation_digest, second.observation.observation_digest);

  const lines = (await readFile(statePath, 'utf8')).trimEnd().split('\n').map(JSON.parse);
  const checked = verifyPublicWitnessDurableRecord(lines[1], {
    trustedWitnessPublicKey: reopened.witnessPublicKey,
    expectedDomainId: 'axiom.social.public.v1',
    expectedWitnessId: 'witness-durable-one'
  });
  assert.equal(checked.record_digest, second.durable_record.record_digest);
});

test('exact replay is idempotent and does not append a second durable record', async () => {
  const data = fixture();
  const witness = keys();
  const { statePath } = await paths();
  const store = await storeAt(statePath, witness);
  const first = await store.commit('observe-credential', credentialRequest(data), { committedAt: T1 });
  const bytes = (await stat(statePath)).size;
  const replay = await store.commit('observe-credential', credentialRequest(data), { committedAt: T2 });
  assert.equal(replay.status, 'replay');
  assert.equal(replay.durable_record, null);
  assert.equal(replay.observation.observation_digest, first.observation.observation_digest);
  assert.equal((await stat(statePath)).size, bytes);
  assert.equal(store.snapshot().durable_record_count, 1);
});

test('credential equivocation and signed conflict evidence survive durable restart', async () => {
  const data = fixture();
  const witness = keys();
  const alternate = keys();
  const alternateCredential = createPersonaSigningCredential({
    personaId: data.projection.persona_id,
    personaProjectionDigest: data.projection.projection_digest,
    personaRootPrivateKey: data.root.privateKey,
    signingPublicKey: alternate.publicKey,
    epoch: 1,
    activatedAt: T0
  });
  const { statePath } = await paths();
  const store = await storeAt(statePath, witness);
  await store.commit('observe-credential', credentialRequest(data), { committedAt: T1 });
  const conflict = await store.commit('observe-credential', {
    credential: alternateCredential,
    trusted_persona_root_public_key: data.root.publicKey,
    observed_at: T2
  }, { committedAt: T2 });
  assert.equal(conflict.status, 'observed-with-conflict');
  assert.equal(conflict.conflicts[0].statement.conflict_kind, 'credential-epoch');
  const digest = conflict.conflicts[0].conflict_digest;
  const reopened = await storeAt(statePath, witness);
  assert.equal(reopened.listConflicts().length, 1);
  assert.equal(reopened.listConflicts()[0].conflict_digest, digest);
  assert.equal((await reopened.verifyState()).valid, true);
});

test('tampered, non-canonical, truncated, and wrong-witness durable state fail closed', async () => {
  const data = fixture();
  const witness = keys();
  const { dir, statePath } = await paths();
  const store = await storeAt(statePath, witness);
  await store.commit('observe-credential', credentialRequest(data), { committedAt: T1 });
  const valid = await readFile(statePath, 'utf8');

  const tamperedPath = join(dir, 'tampered.jsonl');
  const parsed = JSON.parse(valid.trimEnd());
  parsed.request.observed_at = T2;
  await writeFile(tamperedPath, `${canonicalJson(parsed)}\n`, 'utf8');
  await assert.rejects(() => storeAt(tamperedPath, witness), /request digest|signature|record digest/);

  const nonCanonicalPath = join(dir, 'noncanonical.jsonl');
  await writeFile(nonCanonicalPath, `${JSON.stringify(JSON.parse(valid.trimEnd()), null, 2)}\n`, 'utf8');
  await assert.rejects(() => storeAt(nonCanonicalPath, witness), /must use canonical JSON|not valid JSON/);

  const truncatedPath = join(dir, 'truncated.jsonl');
  await writeFile(truncatedPath, valid.slice(0, -1), 'utf8');
  await assert.rejects(() => storeAt(truncatedPath, witness), /incomplete trailing record/);

  const wrongWitness = keys();
  await assert.rejects(() => storeAt(statePath, wrongWitness), /witness key does not match trusted public key|witness signature is invalid/);
});

test('external state-file drift is detected before a new operation can commit', async () => {
  const data = fixture();
  const witness = keys();
  const { statePath } = await paths();
  const store = await storeAt(statePath, witness);
  await store.commit('observe-credential', credentialRequest(data), { committedAt: T1 });
  const original = await readFile(statePath, 'utf8');
  await writeFile(statePath, `${original}\n`, 'utf8');
  await assert.rejects(
    () => store.commit('observe-journal', journalRequest(data), { committedAt: T2 }),
    /not valid JSON|changed outside|canonical JSON/
  );
  assert.equal(store.snapshot().durable_record_count, 1);
});

test('commit timestamps cannot predate observations or move backward', async () => {
  const data = fixture();
  const witness = keys();
  const { statePath } = await paths();
  const store = await storeAt(statePath, witness);
  await assert.rejects(
    () => store.commit('observe-credential', credentialRequest(data, T2), { committedAt: T1 }),
    /cannot predate the witness observation/
  );
  await store.commit('observe-credential', credentialRequest(data, T1), { committedAt: T2 });
  await assert.rejects(
    () => store.commit('observe-journal', journalRequest(data, T2), { committedAt: T1 }),
    /cannot move backward/
  );
});
