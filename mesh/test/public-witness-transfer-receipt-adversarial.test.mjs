import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';

import { PUBLICATION_PERSONA_SCHEMA } from '../src/identity/actor-state.mjs';
import { createPublicPersonaProjection } from '../src/lib/social-publication.mjs';
import { createPersonaSigningCredential } from '../src/lib/persona-journal-credential.mjs';
import { canonicalJson, digestObject } from '../src/lib/canonical.mjs';
import {
  PUBLIC_WITNESS_TRANSFER_RECEIPT_SCHEMA,
  createPublicWitnessSourceAdmission,
  createPublicWitnessTransferPackage,
  createPublicWitnessTransferReceipt,
  verifyPublicWitnessTransferReceipt
} from '../src/lib/public-witness-transfer.mjs';

const T0 = '2026-08-17T20:00:00.000Z';
const T1 = '2026-08-17T20:01:00.000Z';
const T2 = '2026-08-17T20:02:00.000Z';
const T5 = '2026-08-17T20:05:00.000Z';
const T9 = '2026-08-17T20:09:00.000Z';

function keys() {
  const pair = generateKeyPairSync('ed25519');
  return {
    privateKey: pair.privateKey,
    publicKey: pair.publicKey,
    privatePem: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicPem: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
  };
}

function fixture() {
  const persona = {
    schema: PUBLICATION_PERSONA_SCHEMA,
    persona_id: 'persona-adversarial-receipt',
    controller_actor_id: 'actor-private-adversarial-receipt',
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
    personaRootPrivateKey: root.privatePem,
    signingPublicKey: journal.publicPem,
    epoch: 1,
    activatedAt: T0
  });
  const admission = createPublicWitnessSourceAdmission({
    domainId: 'axiom.social.public.v1',
    sourceId: 'source-adversarial-receipt',
    sourcePublicKey: source.publicPem,
    validFrom: T0,
    expiresAt: '2026-08-17T21:00:00.000Z'
  });
  const transfer = createPublicWitnessTransferPackage({
    operation: 'observe-credential',
    request: { credential }
  }, {
    sourceAdmission: admission,
    sourcePrivateKey: source.privatePem,
    transferId: 'adversarial-receipt-transfer',
    createdAt: T1,
    expiresAt: T5,
    now: Date.parse(T1)
  });
  const legitimate = createPublicWitnessTransferReceipt(transfer, {
    sourceAdmission: admission,
    trustedPersonaRootPublicKey: root.publicPem,
    witnessId: 'witness-adversarial-receipt',
    witnessPrivateKey: witness.privatePem,
    receivedAt: T2,
    now: Date.parse(T2)
  });
  return { root, witness, admission, transfer, legitimate };
}

function resignReceipt(receipt, witnessPrivateKey, statementOverrides) {
  const statement = Object.freeze({
    ...structuredClone(receipt.statement),
    ...statementOverrides
  });
  const statementDigest = digestObject(statement);
  const signable = Object.freeze({
    schema: PUBLIC_WITNESS_TRANSFER_RECEIPT_SCHEMA,
    statement,
    statement_digest: statementDigest
  });
  const witnessSignature = sign(
    null,
    Buffer.from(canonicalJson(signable)),
    witnessPrivateKey
  ).toString('base64url');
  const signed = Object.freeze({
    ...signable,
    witness_signature: witnessSignature
  });
  return Object.freeze({
    ...signed,
    receipt_digest: digestObject(signed)
  });
}

test('a valid witness signature cannot legitimize a receipt time that predates its bound transfer', () => {
  const data = fixture();
  const malicious = resignReceipt(
    data.legitimate,
    data.witness.privateKey,
    { received_at: T0 }
  );

  assert.throws(
    () => verifyPublicWitnessTransferReceipt(malicious, {
      trustedWitnessPublicKey: data.witness.publicPem,
      transfer: data.transfer,
      sourceAdmission: data.admission,
      trustedPersonaRootPublicKey: data.root.publicPem,
      now: Date.parse(T9)
    }),
    /predates the bound package or artifact/
  );
});
