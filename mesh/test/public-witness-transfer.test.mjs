import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import { PUBLICATION_PERSONA_SCHEMA } from '../src/identity/actor-state.mjs';
import {
  createPublicPersonaProjection,
  createSocialPublicationProjection
} from '../src/lib/social-publication.mjs';
import {
  createCredentialedPersonaPublicationAttestation,
  createPersonaSigningCredential,
  createPersonaSigningRevocation
} from '../src/lib/persona-journal-credential.mjs';
import {
  PUBLIC_WITNESS_SOURCE_ADMISSION_SCHEMA,
  PUBLIC_WITNESS_SOURCE_EQUIVOCATION_SCHEMA,
  PUBLIC_WITNESS_TRANSFER_PACKAGE_SCHEMA,
  PUBLIC_WITNESS_TRANSFER_RECEIPT_SCHEMA,
  createPublicWitnessSourceAdmission,
  createPublicWitnessTransferPackage,
  createPublicWitnessTransferReceipt,
  detectPublicWitnessSourceEquivocation,
  validatePublicWitnessSourceAdmission,
  validatePublicWitnessTransferContinuity,
  verifyPublicWitnessTransferEnvelope,
  verifyPublicWitnessTransferPackage,
  verifyPublicWitnessTransferReceipt
} from '../src/lib/public-witness-transfer.mjs';

const A0 = '2026-08-17T19:59:00.000Z';
const T0 = '2026-08-17T20:00:00.000Z';
const T1 = '2026-08-17T20:01:00.000Z';
const T2 = '2026-08-17T20:02:00.000Z';
const T3 = '2026-08-17T20:03:00.000Z';
const T4 = '2026-08-17T20:04:00.000Z';
const T5 = '2026-08-17T20:05:00.000Z';
const T6 = '2026-08-17T20:06:00.000Z';
const T9 = '2026-08-17T20:09:00.000Z';
const AEND = '2026-08-17T21:00:00.000Z';

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
    persona_id: 'persona-transfer-lab',
    controller_actor_id: 'actor-private-transfer-lab',
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
  const publication = createSocialPublicationProjection({
    publication_id: 'transfer-publication',
    content: {
      media_type: 'text/plain',
      text: 'Remote sources can transport evidence without becoming identity or truth authorities.'
    },
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
  const revocation = createPersonaSigningRevocation(credential, {
    trustedPersonaRootPublicKey: root.publicKey,
    personaRootPrivateKey: root.privateKey,
    effectiveAt: T3,
    reasonCode: 'suspected-compromise'
  });
  const admission = createPublicWitnessSourceAdmission({
    domainId: 'axiom.social.public.v1',
    sourceId: 'source-one',
    sourcePublicKey: source.publicKey,
    sourceEpoch: 1,
    validFrom: A0,
    expiresAt: AEND,
    maxTransferLifetimeSeconds: 300
  });
  return {
    persona,
    projection,
    root,
    journal,
    source,
    witness,
    credential,
    publication,
    attestation,
    revocation,
    admission
  };
}

function credentialTransfer(data, overrides = {}) {
  return createPublicWitnessTransferPackage({
    operation: 'observe-credential',
    request: { credential: data.credential }
  }, {
    sourceAdmission: data.admission,
    sourcePrivateKey: data.source.privateKey,
    transferId: 'transfer-credential-1',
    createdAt: T1,
    expiresAt: T5,
    now: Date.parse(T1),
    ...overrides
  });
}

function journalTransfer(data, previousTransfer, overrides = {}) {
  return createPublicWitnessTransferPackage({
    operation: 'observe-journal',
    request: {
      attestation: data.attestation,
      persona_signing_credential: data.credential,
      entry: data.publication,
      publication: null
    }
  }, {
    sourceAdmission: data.admission,
    sourcePrivateKey: data.source.privateKey,
    previousTransfer,
    transferId: 'transfer-journal-2',
    createdAt: T2,
    expiresAt: T6,
    now: Date.parse(T2),
    ...overrides
  });
}

test('source admission is an explicit local trust input and cannot create persona-root trust', () => {
  const data = fixture();
  const admission = validatePublicWitnessSourceAdmission(data.admission);
  assert.equal(admission.schema, PUBLIC_WITNESS_SOURCE_ADMISSION_SCHEMA);
  assert.equal(admission.local_trust_input, true);
  assert.equal(admission.remote_self_admission_allowed, false);
  assert.equal(admission.persona_root_trust_effect, 'none');
  assert.equal(admission.authority_effect, 'none');
  assert.equal(admission.network_effect, 'none');

  const transfer = credentialTransfer(data);
  assert.equal(transfer.schema, PUBLIC_WITNESS_TRANSFER_PACKAGE_SCHEMA);
  assert.equal(JSON.stringify(transfer).includes(data.root.publicKey), false);
  assert.throws(
    () => verifyPublicWitnessTransferPackage(transfer, {
      sourceAdmission: data.admission,
      now: Date.parse(T2)
    }),
    /requires a locally trusted persona root public key/
  );
  const otherRoot = keys();
  assert.throws(
    () => verifyPublicWitnessTransferPackage(transfer, {
      sourceAdmission: data.admission,
      trustedPersonaRootPublicKey: otherRoot.publicKey,
      now: Date.parse(T2)
    }),
    /root key|trusted persona root|does not match/i
  );
});

test('source-authenticated credential transfer verifies exact artifact under separately trusted persona root', () => {
  const data = fixture();
  const transfer = credentialTransfer(data);
  assert.equal(transfer.statement.source_signature_claimed, true);
  assert.equal(transfer.statement.delivery_claimed, false);
  assert.equal(transfer.statement.federation_claimed, false);
  assert.equal(transfer.statement.persona_root_trust_claimed, false);
  assert.equal(transfer.statement.finality_claimed, false);
  assert.equal(transfer.statement.authority_effect, 'none');
  assert.equal(transfer.statement.network_effect, 'none');
  assert.deepEqual(Object.keys(transfer.request), ['credential']);

  const envelope = verifyPublicWitnessTransferEnvelope(transfer, {
    sourceAdmission: data.admission,
    now: Date.parse(T2)
  });
  assert.equal(envelope.source_signature_verified, true);
  assert.equal(envelope.source_minted_persona_root_trust, false);

  const verified = verifyPublicWitnessTransferPackage(transfer, {
    sourceAdmission: data.admission,
    trustedPersonaRootPublicKey: data.root.publicKey,
    now: Date.parse(T2)
  });
  assert.equal(verified.persona_artifact_verified, true);
  assert.equal(verified.persona_root_trust_source, 'local-verifier-input');
  assert.equal(verified.source_minted_persona_root_trust, false);
  assert.equal(verified.artifact.artifact_digest, data.credential.credential_digest);
  assert.equal(verified.artifact.persona_id, data.projection.persona_id);
  assert.equal(verified.observation_input.observed_at_source, 'receiver-local-time-required');
});

test('journal and revocation transfers require their exact cryptographic dependencies', () => {
  const data = fixture();
  const first = credentialTransfer(data);
  const second = journalTransfer(data, first);
  const verifiedJournal = verifyPublicWitnessTransferPackage(second, {
    sourceAdmission: data.admission,
    trustedPersonaRootPublicKey: data.root.publicKey,
    now: Date.parse(T3)
  });
  assert.equal(verifiedJournal.artifact.artifact_digest, data.attestation.attestation_digest);

  const revocationTransfer = createPublicWitnessTransferPackage({
    operation: 'observe-revocation',
    request: {
      revocation: data.revocation,
      credential: data.credential
    }
  }, {
    sourceAdmission: data.admission,
    sourcePrivateKey: data.source.privateKey,
    previousTransfer: second,
    transferId: 'transfer-revocation-3',
    createdAt: T3,
    expiresAt: '2026-08-17T20:07:00.000Z',
    now: Date.parse(T3)
  });
  const verifiedRevocation = verifyPublicWitnessTransferPackage(revocationTransfer, {
    sourceAdmission: data.admission,
    trustedPersonaRootPublicKey: data.root.publicKey,
    now: Date.parse(T4)
  });
  assert.equal(verifiedRevocation.artifact.artifact_digest, data.revocation.revocation_digest);

  const wrongCredential = structuredClone(data.credential);
  wrongCredential.credential_digest = 'f'.repeat(64);
  const tampered = structuredClone(revocationTransfer);
  tampered.request.credential = wrongCredential;
  assert.throws(
    () => verifyPublicWitnessTransferPackage(tampered, {
      sourceAdmission: data.admission,
      trustedPersonaRootPublicKey: data.root.publicKey,
      now: Date.parse(T4)
    }),
    /request digest|source signature|transfer digest/
  );
});

test('transfer continuity is explicit and exact replay is distinct from source equivocation', () => {
  const data = fixture();
  const first = credentialTransfer(data);
  const second = journalTransfer(data, first);
  const continuity = validatePublicWitnessTransferContinuity(first, second, {
    sourceAdmission: data.admission,
    now: Date.parse(T3)
  });
  assert.equal(continuity.valid, true);
  assert.equal(continuity.previous_sequence, 1);
  assert.equal(continuity.current_sequence, 2);
  assert.equal(continuity.previous_transfer_digest, first.transfer_digest);
  assert.equal(detectPublicWitnessSourceEquivocation(first, structuredClone(first), {
    sourceAdmission: data.admission,
    now: Date.parse(T3)
  }), null);
  assert.throws(
    () => validatePublicWitnessTransferContinuity(second, first, {
      sourceAdmission: data.admission,
      now: Date.parse(T3)
    }),
    /next source sequence|predecessor|continuity/
  );
});

test('two source-signed packages at the same source position become equivocation evidence without selecting a winner', () => {
  const data = fixture();
  const first = credentialTransfer(data);
  const fork = createPublicWitnessTransferPackage({
    operation: 'observe-journal',
    request: {
      attestation: data.attestation,
      persona_signing_credential: data.credential,
      entry: data.publication,
      publication: null
    }
  }, {
    sourceAdmission: data.admission,
    sourcePrivateKey: data.source.privateKey,
    transferId: 'transfer-fork-1',
    createdAt: T2,
    expiresAt: T6,
    now: Date.parse(T2)
  });
  assert.equal(first.statement.sequence, 1);
  assert.equal(fork.statement.sequence, 1);
  const evidence = detectPublicWitnessSourceEquivocation(first, fork, {
    sourceAdmission: data.admission,
    now: Date.parse(T3)
  });
  assert.equal(evidence.schema, PUBLIC_WITNESS_SOURCE_EQUIVOCATION_SCHEMA);
  assert.equal(evidence.source_signatures_verified, true);
  assert.equal(evidence.preferred_transfer_digest, null);
  assert.equal(evidence.truth_resolution_claimed, false);
  assert.equal(evidence.persona_root_trust_effect, 'none');
  assert.deepEqual(evidence.transfer_digests, [first.transfer_digest, fork.transfer_digest].sort());
});

test('source epoch, operation allowlist, domain, source key, lifetime, expiry, and byte limits fail closed', () => {
  const data = fixture();
  const first = credentialTransfer(data);
  const rotatedAdmission = createPublicWitnessSourceAdmission({
    domainId: 'axiom.social.public.v1',
    sourceId: 'source-one',
    sourcePublicKey: data.source.publicKey,
    sourceEpoch: 2,
    validFrom: A0,
    expiresAt: AEND
  });
  assert.throws(
    () => verifyPublicWitnessTransferEnvelope(first, {
      sourceAdmission: rotatedAdmission,
      now: Date.parse(T2)
    }),
    /does not match the local source admission/
  );

  const credentialOnlyAdmission = createPublicWitnessSourceAdmission({
    domainId: 'axiom.social.public.v1',
    sourceId: 'source-one',
    sourcePublicKey: data.source.publicKey,
    allowedOperations: ['observe-credential'],
    validFrom: A0,
    expiresAt: AEND
  });
  assert.throws(
    () => createPublicWitnessTransferPackage({
      operation: 'observe-journal',
      request: {
        attestation: data.attestation,
        persona_signing_credential: data.credential,
        entry: data.publication,
        publication: null
      }
    }, {
      sourceAdmission: credentialOnlyAdmission,
      sourcePrivateKey: data.source.privateKey,
      transferId: 'denied-journal',
      createdAt: T2,
      expiresAt: T5,
      now: Date.parse(T2)
    }),
    /not allowed/
  );

  const wrongDomainAdmission = createPublicWitnessSourceAdmission({
    domainId: 'other.domain',
    sourceId: 'source-one',
    sourcePublicKey: data.source.publicKey,
    validFrom: A0,
    expiresAt: AEND
  });
  assert.throws(
    () => verifyPublicWitnessTransferEnvelope(first, {
      sourceAdmission: wrongDomainAdmission,
      now: Date.parse(T2)
    }),
    /does not match the local source admission/
  );

  const wrongSource = keys();
  const wrongKeyAdmission = createPublicWitnessSourceAdmission({
    domainId: 'axiom.social.public.v1',
    sourceId: 'source-one',
    sourcePublicKey: wrongSource.publicKey,
    validFrom: A0,
    expiresAt: AEND
  });
  assert.throws(
    () => verifyPublicWitnessTransferEnvelope(first, {
      sourceAdmission: wrongKeyAdmission,
      now: Date.parse(T2)
    }),
    /does not match the local source admission/
  );

  assert.throws(
    () => verifyPublicWitnessTransferEnvelope(first, {
      sourceAdmission: data.admission,
      now: Date.parse(T6)
    }),
    /expired/
  );

  const tinyAdmission = createPublicWitnessSourceAdmission({
    domainId: 'axiom.social.public.v1',
    sourceId: 'source-one',
    sourcePublicKey: data.source.publicKey,
    validFrom: A0,
    expiresAt: AEND,
    maxTransferBytes: 512
  });
  assert.throws(
    () => createPublicWitnessTransferPackage({
      operation: 'observe-credential',
      request: { credential: data.credential }
    }, {
      sourceAdmission: tinyAdmission,
      sourcePrivateKey: data.source.privateKey,
      transferId: 'too-large',
      createdAt: T1,
      expiresAt: T5,
      now: Date.parse(T1)
    }),
    /byte limit/
  );

  const shortAdmission = createPublicWitnessSourceAdmission({
    domainId: 'axiom.social.public.v1',
    sourceId: 'source-one',
    sourcePublicKey: data.source.publicKey,
    validFrom: A0,
    expiresAt: AEND,
    maxTransferLifetimeSeconds: 60
  });
  assert.throws(
    () => createPublicWitnessTransferPackage({
      operation: 'observe-credential',
      request: { credential: data.credential }
    }, {
      sourceAdmission: shortAdmission,
      sourcePrivateKey: data.source.privateKey,
      transferId: 'too-long',
      createdAt: T1,
      expiresAt: T5,
      now: Date.parse(T1)
    }),
    /lifetime exceeds/
  );
});

test('source cannot package an artifact before its own signed artifact time and future packages are clock-bounded', () => {
  const data = fixture();
  const early = createPublicWitnessTransferPackage({
    operation: 'observe-journal',
    request: {
      attestation: data.attestation,
      persona_signing_credential: data.credential,
      entry: data.publication,
      publication: null
    }
  }, {
    sourceAdmission: data.admission,
    sourcePrivateKey: data.source.privateKey,
    transferId: 'early-journal',
    createdAt: T1,
    expiresAt: T5,
    now: Date.parse(T1)
  });
  assert.throws(
    () => verifyPublicWitnessTransferPackage(early, {
      sourceAdmission: data.admission,
      trustedPersonaRootPublicKey: data.root.publicKey,
      now: Date.parse(T2)
    }),
    /cannot predate the transferred artifact/
  );

  const future = createPublicWitnessTransferPackage({
    operation: 'observe-credential',
    request: { credential: data.credential }
  }, {
    sourceAdmission: data.admission,
    sourcePrivateKey: data.source.privateKey,
    transferId: 'future-transfer',
    createdAt: T9,
    expiresAt: '2026-08-17T20:10:00.000Z',
    now: Date.parse(T9)
  });
  assert.throws(
    () => verifyPublicWitnessTransferEnvelope(future, {
      sourceAdmission: data.admission,
      now: Date.parse(T1)
    }),
    /clock skew/
  );
});

test('source/request tampering and source-key substitution fail before artifact admission', () => {
  const data = fixture();
  const transfer = credentialTransfer(data);
  const tampered = structuredClone(transfer);
  tampered.statement.transfer_id = 'tampered-transfer';
  assert.throws(
    () => verifyPublicWitnessTransferEnvelope(tampered, {
      sourceAdmission: data.admission,
      now: Date.parse(T2)
    }),
    /statement digest|source signature|transfer digest/
  );

  const tamperedRequest = structuredClone(transfer);
  tamperedRequest.request.credential.credential_digest = 'f'.repeat(64);
  assert.throws(
    () => verifyPublicWitnessTransferEnvelope(tamperedRequest, {
      sourceAdmission: data.admission,
      now: Date.parse(T2)
    }),
    /request digest|source signature|transfer digest/
  );

  const otherSource = keys();
  assert.throws(
    () => createPublicWitnessTransferPackage({
      operation: 'observe-credential',
      request: { credential: data.credential }
    }, {
      sourceAdmission: data.admission,
      sourcePrivateKey: otherSource.privateKey,
      transferId: 'wrong-source-key',
      createdAt: T1,
      expiresAt: T5,
      now: Date.parse(T1)
    }),
    /does not match the local source admission/
  );
});

test('witness transfer receipt proves package verification but not observation commit, truth, root trust, delivery, or finality', () => {
  const data = fixture();
  const transfer = credentialTransfer(data);
  const receipt = createPublicWitnessTransferReceipt(transfer, {
    sourceAdmission: data.admission,
    trustedPersonaRootPublicKey: data.root.publicKey,
    witnessId: 'witness-receiver-one',
    witnessPrivateKey: data.witness.privateKey,
    receivedAt: T3,
    now: Date.parse(T4)
  });
  assert.equal(receipt.schema, PUBLIC_WITNESS_TRANSFER_RECEIPT_SCHEMA);
  assert.equal(receipt.statement.source_signature_verified, true);
  assert.equal(receipt.statement.persona_artifact_verified, true);
  assert.equal(receipt.statement.persona_root_trust_source, 'local-verifier-input');
  assert.equal(receipt.statement.source_minted_persona_root_trust, false);
  assert.equal(receipt.statement.observation_committed, false);
  assert.equal(receipt.statement.end_to_end_delivery_claimed, false);
  assert.equal(receipt.statement.content_truth_claimed, false);
  assert.equal(receipt.statement.authorship_claimed, false);
  assert.equal(receipt.statement.legal_identity_claimed, false);
  assert.equal(receipt.statement.finality_claimed, false);
  assert.equal(receipt.statement.authority_effect, 'none');
  assert.equal(receipt.statement.network_effect, 'none');

  const checked = verifyPublicWitnessTransferReceipt(receipt, {
    trustedWitnessPublicKey: data.witness.publicKey,
    transfer,
    sourceAdmission: data.admission,
    trustedPersonaRootPublicKey: data.root.publicKey,
    now: Date.parse(T4)
  });
  assert.equal(checked.valid, true);
  assert.equal(checked.witness_signature_verified, true);

  const tampered = structuredClone(receipt);
  tampered.statement.observation_committed = true;
  assert.throws(
    () => verifyPublicWitnessTransferReceipt(tampered, {
      trustedWitnessPublicKey: data.witness.publicKey
    }),
    /claims exceed|statement digest/
  );
});
