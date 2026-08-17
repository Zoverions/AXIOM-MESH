import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { PUBLICATION_PERSONA_SCHEMA } from '../src/identity/actor-state.mjs';
import { createPublicPersonaProjection } from '../src/lib/social-publication.mjs';
import { createPersonaSigningCredential } from '../src/lib/persona-journal-credential.mjs';
import {
  createPublicWitnessSourceAdmission,
  createPublicWitnessTransferPackage
} from '../src/lib/public-witness-transfer.mjs';
import { openPublicWitnessReceiverStore } from '../src/lib/public-witness-receiver-store.mjs';

const T0 = '2026-08-17T21:40:00.000Z';
const T1 = '2026-08-17T21:41:00.000Z';
const T2 = '2026-08-17T21:42:00.000Z';
const T5 = '2026-08-17T21:45:00.000Z';

function keys() {
  const pair = generateKeyPairSync('ed25519');
  return {
    privateKey: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
  };
}

test('a caller cannot claim replay merely by copying a retained transfer_digest onto different bytes', async () => {
  const persona = {
    schema: PUBLICATION_PERSONA_SCHEMA,
    persona_id: 'persona-replay-adversarial',
    controller_actor_id: 'actor-private-replay-adversarial',
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
    sourceId: 'source-replay-adversarial',
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
    transferId: 'replay-adversarial-transfer',
    createdAt: T1,
    expiresAt: T5,
    now: Date.parse(T1)
  });
  const dir = await mkdtemp(join(tmpdir(), 'axiom-replay-adversarial-'));
  const store = await openPublicWitnessReceiverStore({
    statePath: join(dir, 'receiver.jsonl'),
    domainId: 'axiom.social.public.v1',
    witnessId: 'witness-replay-adversarial',
    witnessPrivateKey: witness.privateKey
  });
  await store.admitSource(admission, { admittedAt: T0 });
  await store.receiveTransfer(transfer, {
    trustedPersonaRootPublicKey: root.publicKey,
    receivedAt: T2
  });

  const forgedReplay = structuredClone(transfer);
  forgedReplay.request.credential.credential_digest = 'f'.repeat(64);
  forgedReplay.transfer_digest = transfer.transfer_digest;
  await assert.rejects(
    () => store.receiveTransfer(forgedReplay, {
      trustedPersonaRootPublicKey: root.publicKey,
      receivedAt: T2
    }),
    /request digest|source signature|transfer digest|replay/i
  );
  assert.equal(store.snapshot().transfer_count, 1);
});
