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
import { createPublicWitnessServiceLab } from '../src/lib/public-witness-service.mjs';

const T0 = '2026-08-17T19:10:00.000Z';
const T1 = '2026-08-17T19:11:00.000Z';
const T2 = '2026-08-17T19:12:00.000Z';

function keys() {
  const pair = generateKeyPairSync('ed25519');
  return {
    privateKey: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
  };
}

function credentialFixture(suffix) {
  const persona = {
    schema: PUBLICATION_PERSONA_SCHEMA,
    persona_id: `persona-durable-serialization-${suffix}`,
    controller_actor_id: `actor-private-durable-serialization-${suffix}`,
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
  return { root, credential };
}

function request(data, observedAt) {
  return {
    credential: data.credential,
    trusted_persona_root_public_key: data.root.publicKey,
    observed_at: observedAt
  };
}

test('durable observation lookup is serialized behind queued commits', async () => {
  const firstData = credentialFixture('first');
  const secondData = credentialFixture('second');
  const witness = keys();
  const dir = await mkdtemp(join(tmpdir(), 'axiom-witness-serialization-'));
  const statePath = join(dir, 'witness-state.jsonl');
  const store = await openPublicWitnessDurableStore({
    statePath,
    domainId: 'axiom.social.public.v1',
    witnessId: 'witness-durable-serialization',
    witnessPrivateKey: witness.privateKey
  });

  const model = createPublicWitnessServiceLab({
    domainId: 'axiom.social.public.v1',
    witnessId: 'witness-durable-serialization',
    witnessPrivateKey: witness.privateKey
  });
  model.observeCredential(firstData.credential, {
    trustedPersonaRootPublicKey: firstData.root.publicKey,
    observedAt: T1
  });
  const expectedSecond = model.observeCredential(secondData.credential, {
    trustedPersonaRootPublicKey: secondData.root.publicKey,
    observedAt: T2
  });

  const firstCommit = store.commit('observe-credential', request(firstData, T1), { committedAt: T1 });
  const secondCommit = store.commit('observe-credential', request(secondData, T2), { committedAt: T2 });
  const lookup = store.findDurableObservationRecord(expectedSecond.observation.observation_digest, { statePath });

  const [, second, found] = await Promise.all([firstCommit, secondCommit, lookup]);
  assert.ok(found);
  assert.equal(found.record_digest, second.durable_record.record_digest);
  assert.equal(found.statement.observation_digest, expectedSecond.observation.observation_digest);
  assert.equal(store.snapshot().durable_record_count, 2);
  assert.equal((await store.verifyState()).valid, true);
});
