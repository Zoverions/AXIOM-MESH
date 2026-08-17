import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import { PUBLICATION_PERSONA_SCHEMA } from '../src/identity/actor-state.mjs';
import { createPublicPersonaProjection } from '../src/lib/social-publication.mjs';
import { createPersonaSigningCredential } from '../src/lib/persona-journal-credential.mjs';
import {
  createPublicWitnessSourceAdmission,
  createPublicWitnessTransferPackage,
  createPublicWitnessTransferReceipt,
  verifyPublicWitnessTransferReceipt
} from '../src/lib/public-witness-transfer.mjs';

const T0 = '2026-08-17T20:00:00.000Z';
const T1 = '2026-08-17T20:01:00.000Z';
const T3 = '2026-08-17T20:03:00.000Z';
const T5 = '2026-08-17T20:05:00.000Z';
const T6 = '2026-08-17T20:06:00.000Z';
const T9 = '2026-08-17T20:09:00.000Z';

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
    persona_id: 'persona-receipt-lifecycle',
    controller_actor_id: 'actor-private-receipt-lifecycle',
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
    sourceId: 'source-receipt-lifecycle',
    sourcePublicKey: source.publicKey,
    validFrom: T0,
    expiresAt: '2026-08-17T21:00:00.000Z'
  });
  const transfer = createPublicWitnessTransferPackage({
    operation: 'observe-credential',
    request: { credential }
  }, {
    sourceAdmission: admission,
    sourcePrivateKey: source.privateKey,
    transferId: 'receipt-lifecycle-transfer',
    createdAt: T1,
    expiresAt: T5,
    now: Date.parse(T1)
  });
  return { root, witness, credential, admission, transfer };
}

test('a valid locally timed receipt remains auditable after the short transfer intake window expires', () => {
  const data = fixture();
  const receipt = createPublicWitnessTransferReceipt(data.transfer, {
    sourceAdmission: data.admission,
    trustedPersonaRootPublicKey: data.root.publicKey,
    witnessId: 'witness-receipt-lifecycle',
    witnessPrivateKey: data.witness.privateKey,
    receivedAt: T3,
    now: Date.parse(T3)
  });

  const audited = verifyPublicWitnessTransferReceipt(receipt, {
    trustedWitnessPublicKey: data.witness.publicKey,
    transfer: data.transfer,
    sourceAdmission: data.admission,
    trustedPersonaRootPublicKey: data.root.publicKey,
    now: Date.parse(T9)
  });
  assert.equal(audited.valid, true);
  assert.equal(audited.observation_committed, false);
  assert.equal(audited.finality_claimed, false);
});

test('a receiver cannot create a verification receipt for a transfer that was already expired when locally received', () => {
  const data = fixture();
  assert.throws(
    () => createPublicWitnessTransferReceipt(data.transfer, {
      sourceAdmission: data.admission,
      trustedPersonaRootPublicKey: data.root.publicKey,
      witnessId: 'witness-receipt-lifecycle',
      witnessPrivateKey: data.witness.privateKey,
      receivedAt: T6,
      now: Date.parse(T6)
    }),
    /expired/
  );
});
