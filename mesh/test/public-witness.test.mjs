import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import { PUBLICATION_PERSONA_SCHEMA } from '../src/identity/actor-state.mjs';
import {
  createSocialPublicationProjection,
  createSocialPublicationRetraction,
  createSupersedingSocialPublication
} from '../src/lib/social-publication.mjs';
import {
  PUBLIC_JOURNAL_ATTESTATION_SCHEMA,
  PUBLIC_WITNESS_CHECKPOINT_SCHEMA,
  PUBLIC_WITNESS_RECEIPT_SCHEMA,
  computePublicWitnessReceiptsRoot,
  createPersonaPublicationAttestation,
  createPersonaRetractionAttestation,
  createPublicWitnessCheckpoint,
  createPublicWitnessReceipt,
  validatePublicJournalContinuity,
  validatePublicWitnessCheckpoint,
  verifyPublicJournalAttestation,
  verifyPublicWitnessReceipt
} from '../src/lib/public-witness.mjs';

const T0 = '2026-08-17T17:00:00.000Z';
const T1 = '2026-08-17T17:01:00.000Z';
const T2 = '2026-08-17T17:02:00.000Z';
const T3 = '2026-08-17T17:03:00.000Z';
const T4 = '2026-08-17T17:04:00.000Z';
const T5 = '2026-08-17T17:05:00.000Z';

function keys() {
  const pair = generateKeyPairSync('ed25519');
  return {
    privateKey: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
  };
}

function persona(overrides = {}) {
  return {
    schema: PUBLICATION_PERSONA_SCHEMA,
    persona_id: 'persona-zov',
    controller_actor_id: 'actor-private-zov',
    represented_actor_id: null,
    attribution_mode: 'pseudonymous',
    public_actor_link: null,
    selective_link_commitment: null,
    delegation_authority_digest: null,
    created_at: T0,
    status: 'active',
    ...overrides
  };
}

function publicationInput(overrides = {}) {
  return {
    publication_id: 'publication-alpha',
    content: {
      media_type: 'text/plain',
      text: 'Public history should be correctable without becoming silently rewritable.'
    },
    attachment_digests: [],
    audience: { mode: 'public' },
    discoverability: 'listed',
    authorship_mode: 'human-authored',
    created_at: T1,
    supersedes_digest: null,
    ...overrides
  };
}

function socialFixture() {
  const protectedPersona = persona();
  const original = createSocialPublicationProjection(publicationInput(), {
    persona: protectedPersona
  });
  const revision = createSupersedingSocialPublication(original, publicationInput({
    publication_id: 'publication-alpha-r2',
    content: {
      media_type: 'text/plain',
      text: 'Corrections are new signed history, not replacements for old history.'
    },
    created_at: T2,
    supersedes_digest: undefined
  }), { persona: protectedPersona });
  const retraction = createSocialPublicationRetraction(revision, {
    reason_code: 'author-retracted',
    occurred_at: T3
  });
  return { protectedPersona, original, revision, retraction };
}

test('persona-signed public journal chains publications and retractions without identity or truth claims', () => {
  const social = socialFixture();
  const personaKeys = keys();
  const first = createPersonaPublicationAttestation(social.original, {
    personaPrivateKey: personaKeys.privateKey,
    issuedAt: T1
  });
  const second = createPersonaPublicationAttestation(social.revision, {
    personaPrivateKey: personaKeys.privateKey,
    previousAttestation: first,
    issuedAt: T2
  });
  const third = createPersonaRetractionAttestation(social.retraction, {
    publication: social.revision,
    personaPrivateKey: personaKeys.privateKey,
    previousAttestation: second,
    issuedAt: T3
  });

  assert.equal(first.schema, PUBLIC_JOURNAL_ATTESTATION_SCHEMA);
  assert.equal(first.statement.sequence, 1);
  assert.equal(first.statement.previous_attestation_digest, null);
  assert.equal(second.statement.sequence, 2);
  assert.equal(second.statement.previous_attestation_digest, first.attestation_digest);
  assert.equal(third.statement.sequence, 3);
  assert.equal(third.statement.previous_attestation_digest, second.attestation_digest);
  assert.equal(third.statement.entry_type, 'retraction');
  assert.equal(third.statement.content_truth_claimed, false);
  assert.equal(third.statement.authorship_claimed, false);
  assert.equal(third.statement.legal_identity_claimed, false);
  assert.equal(third.statement.authority_effect, 'none');
  assert.equal(third.statement.network_effect, 'none');
  assert.equal(validatePublicJournalContinuity(first, second, {
    trustedPersonaPublicKey: personaKeys.publicKey
  }).valid, true);
  assert.equal(validatePublicJournalContinuity(second, third, {
    trustedPersonaPublicKey: personaKeys.publicKey
  }).valid, true);

  const verified = verifyPublicJournalAttestation(third, {
    trustedPersonaPublicKey: personaKeys.publicKey,
    entry: social.retraction,
    publication: social.revision
  });
  assert.equal(verified.valid, true);
  assert.equal(verified.persona_key_signature_valid, true);
  assert.equal(verified.content_truth_claimed, false);
});

test('public witness foundation refuses followers/circle content and key substitution', () => {
  const privateSocial = createSocialPublicationProjection(publicationInput({
    publication_id: 'followers-only',
    audience: { mode: 'followers' }
  }), { persona: persona() });
  const personaKeys = keys();
  assert.throws(
    () => createPersonaPublicationAttestation(privateSocial, {
      personaPrivateKey: personaKeys.privateKey,
      issuedAt: T1
    }),
    /only public-audience publications/
  );

  const social = socialFixture();
  const attestation = createPersonaPublicationAttestation(social.original, {
    personaPrivateKey: personaKeys.privateKey,
    issuedAt: T1
  });
  const otherKeys = keys();
  assert.throws(
    () => verifyPublicJournalAttestation(attestation, {
      trustedPersonaPublicKey: otherKeys.publicKey,
      entry: social.original
    }),
    /does not match the trusted public key/
  );
});

test('journal tampering and predecessor substitution fail closed', () => {
  const social = socialFixture();
  const personaKeys = keys();
  const first = createPersonaPublicationAttestation(social.original, {
    personaPrivateKey: personaKeys.privateKey,
    issuedAt: T1
  });
  const second = createPersonaPublicationAttestation(social.revision, {
    personaPrivateKey: personaKeys.privateKey,
    previousAttestation: first,
    issuedAt: T2
  });

  const tampered = structuredClone(second);
  tampered.statement.entry_digest = 'f'.repeat(64);
  assert.throws(
    () => verifyPublicJournalAttestation(tampered, {
      trustedPersonaPublicKey: personaKeys.publicKey,
      entry: social.revision
    }),
    /statement digest does not match canonical content/
  );

  const otherPersonaKeys = keys();
  assert.throws(
    () => createPersonaPublicationAttestation(social.revision, {
      personaPrivateKey: otherPersonaKeys.privateKey,
      previousAttestation: first,
      issuedAt: T2
    }),
    /signing key does not match the trusted public key/
  );
});

test('independent witness receipt binds an exact verified persona attestation but claims no finality', () => {
  const social = socialFixture();
  const personaKeys = keys();
  const witnessKeys = keys();
  const attestation = createPersonaPublicationAttestation(social.original, {
    personaPrivateKey: personaKeys.privateKey,
    issuedAt: T1
  });
  const receipt = createPublicWitnessReceipt(attestation, {
    trustedPersonaPublicKey: personaKeys.publicKey,
    entry: social.original,
    domainId: 'axiom.social.public.v1',
    witnessId: 'witness-one',
    witnessPrivateKey: witnessKeys.privateKey,
    observedAt: T2
  });

  assert.equal(receipt.schema, PUBLIC_WITNESS_RECEIPT_SCHEMA);
  assert.equal(receipt.statement.journal_attestation_digest, attestation.attestation_digest);
  assert.equal(receipt.statement.persona_signature_verified, true);
  assert.equal(receipt.statement.finality_claimed, false);
  assert.equal(receipt.statement.content_truth_claimed, false);
  assert.equal(receipt.statement.authority_effect, 'none');
  assert.equal(receipt.statement.network_effect, 'none');

  const verified = verifyPublicWitnessReceipt(receipt, {
    trustedWitnessPublicKey: witnessKeys.publicKey,
    expectedDomainId: 'axiom.social.public.v1',
    attestation,
    trustedPersonaPublicKey: personaKeys.publicKey,
    entry: social.original
  });
  assert.equal(verified.valid, true);
  assert.equal(verified.witness_signature_valid, true);
  assert.equal(verified.finality_claimed, false);

  const otherWitness = keys();
  assert.throws(
    () => verifyPublicWitnessReceipt(receipt, {
      trustedWitnessPublicKey: otherWitness.publicKey,
      attestation,
      trustedPersonaPublicKey: personaKeys.publicKey,
      entry: social.original
    }),
    /does not match the trusted public key/
  );
});

test('checkpoint is a deterministic receipt commitment and never upgrades receipt count into consensus', () => {
  const receipts = ['c'.repeat(64), 'a'.repeat(64), 'b'.repeat(64)];
  const firstRoot = computePublicWitnessReceiptsRoot(receipts);
  const secondRoot = computePublicWitnessReceiptsRoot([...receipts].reverse());
  assert.equal(firstRoot, secondRoot);

  const checkpoint = createPublicWitnessCheckpoint({
    domainId: 'axiom.social.public.v1',
    epoch: 1,
    height: 1,
    receiptDigests: receipts,
    createdAt: T4
  });
  assert.equal(checkpoint.schema, PUBLIC_WITNESS_CHECKPOINT_SCHEMA);
  assert.equal(checkpoint.receipt_count, 3);
  assert.equal(checkpoint.receipts_root, firstRoot);
  assert.equal(checkpoint.finality, 'unfinalized');
  assert.equal(checkpoint.consensus_claimed, false);
  assert.equal(checkpoint.data_availability_claimed, false);
  assert.equal(checkpoint.authority_effect, 'none');
  assert.equal(checkpoint.network_effect, 'none');
  assert.equal(
    validatePublicWitnessCheckpoint(checkpoint, { receiptDigests: receipts }).valid,
    true
  );

  assert.throws(
    () => createPublicWitnessCheckpoint({
      domainId: 'axiom.social.public.v1',
      epoch: 1,
      height: 1,
      receiptDigests: [receipts[0], receipts[0]],
      createdAt: T4
    }),
    /duplicate receipt digests/
  );
  assert.throws(
    () => validatePublicWitnessCheckpoint({
      ...checkpoint,
      consensus_claimed: true
    }, { receiptDigests: receipts }),
    /cannot claim finality, consensus, or data availability/
  );
});

test('checkpoint history is append-only through explicit predecessor digests', () => {
  const first = createPublicWitnessCheckpoint({
    domainId: 'axiom.social.public.v1',
    epoch: 1,
    height: 1,
    receiptDigests: ['a'.repeat(64)],
    createdAt: T4
  });
  const second = createPublicWitnessCheckpoint({
    domainId: 'axiom.social.public.v1',
    epoch: 1,
    height: 2,
    previousCheckpointDigest: first.checkpoint_digest,
    receiptDigests: ['b'.repeat(64)],
    createdAt: T5
  });
  assert.equal(second.previous_checkpoint_digest, first.checkpoint_digest);
  assert.throws(
    () => createPublicWitnessCheckpoint({
      domainId: 'axiom.social.public.v1',
      epoch: 1,
      height: 2,
      previousCheckpointDigest: null,
      receiptDigests: ['b'.repeat(64)],
      createdAt: T5
    }),
    /later heights require one/
  );
});
