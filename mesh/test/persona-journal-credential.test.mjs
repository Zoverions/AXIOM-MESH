import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import { PUBLICATION_PERSONA_SCHEMA } from '../src/identity/actor-state.mjs';
import {
  createPublicPersonaProjection,
  createSocialPublicationProjection,
  createSocialPublicationRetraction,
  createSupersedingSocialPublication
} from '../src/lib/social-publication.mjs';
import {
  CREDENTIALED_PUBLIC_JOURNAL_ATTESTATION_SCHEMA,
  PERSONA_SIGNING_CREDENTIAL_SCHEMA,
  PERSONA_SIGNING_REVOCATION_SCHEMA,
  assertPersonaSigningCredentialUsableAt,
  createCredentialedPersonaPublicationAttestation,
  createCredentialedPersonaRetractionAttestation,
  createPersonaSigningCredential,
  createPersonaSigningRevocation,
  validateCredentialedPublicJournalContinuity,
  validatePersonaSigningCredentialPath,
  validatePersonaSigningCredentialTransition,
  verifyCredentialedPublicJournalAttestation,
  verifyPersonaSigningCredential,
  verifyPersonaSigningRevocation
} from '../src/lib/persona-journal-credential.mjs';

const T0 = '2026-08-17T18:00:00.000Z';
const T1 = '2026-08-17T18:01:00.000Z';
const T2 = '2026-08-17T18:02:00.000Z';
const T3 = '2026-08-17T18:03:00.000Z';
const T4 = '2026-08-17T18:04:00.000Z';
const T5 = '2026-08-17T18:05:00.000Z';
const T6 = '2026-08-17T18:06:00.000Z';

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
      text: 'A public persona should be able to rotate signing keys without exposing its controller.'
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
  const projection = createPublicPersonaProjection(protectedPersona);
  const original = createSocialPublicationProjection(publicationInput(), {
    persona: protectedPersona
  });
  const revision = createSupersedingSocialPublication(original, publicationInput({
    publication_id: 'publication-alpha-r2',
    content: { media_type: 'text/plain', text: 'Operational keys are replaceable; history is not silently rewritten.' },
    created_at: T4,
    supersedes_digest: undefined
  }), { persona: protectedPersona });
  const retraction = createSocialPublicationRetraction(revision, {
    reason_code: 'author-retracted',
    occurred_at: T6
  });
  return { protectedPersona, projection, original, revision, retraction };
}

function credentialFixture() {
  const social = socialFixture();
  const root = keys();
  const journal1 = keys();
  const journal2 = keys();
  const credential1 = createPersonaSigningCredential({
    personaId: social.projection.persona_id,
    personaProjectionDigest: social.projection.projection_digest,
    personaRootPrivateKey: root.privateKey,
    signingPublicKey: journal1.publicKey,
    epoch: 1,
    activatedAt: T0
  });
  const credential2 = createPersonaSigningCredential({
    personaId: social.projection.persona_id,
    personaProjectionDigest: social.projection.projection_digest,
    personaRootPrivateKey: root.privateKey,
    signingPublicKey: journal2.publicKey,
    epoch: 2,
    activatedAt: T3,
    transitionKind: 'rotation',
    predecessorCredential: credential1,
    predecessorDisposition: 'retired'
  });
  return { social, root, journal1, journal2, credential1, credential2 };
}

test('root-signed persona credential binds an operational key without leaking controller identity', () => {
  const data = credentialFixture();
  const credential = data.credential1;
  assert.equal(credential.schema, PERSONA_SIGNING_CREDENTIAL_SCHEMA);
  assert.equal(credential.statement.epoch, 1);
  assert.equal(credential.statement.transition_kind, 'initial');
  assert.equal(credential.statement.predecessor_credential_digest, null);
  assert.equal(credential.statement.controller_identity_disclosed, false);
  assert.equal(credential.statement.legal_identity_claimed, false);
  assert.equal(credential.statement.authority_effect, 'none');
  assert.equal(credential.statement.network_effect, 'none');

  const verified = verifyPersonaSigningCredential(credential, {
    trustedPersonaRootPublicKey: data.root.publicKey,
    expectedPersonaId: data.social.projection.persona_id,
    expectedPersonaProjectionDigest: data.social.projection.projection_digest
  });
  assert.equal(verified.credential_digest, credential.credential_digest);
  const serialized = JSON.stringify(credential);
  assert.equal(serialized.includes(data.social.protectedPersona.controller_actor_id), false);
  assert.equal(serialized.includes(data.root.privateKey), false);
  assert.equal(serialized.includes(data.journal1.privateKey), false);
});

test('rotation advances the key epoch, retires the predecessor, and makes the old key stale after activation', () => {
  const data = credentialFixture();
  const transition = validatePersonaSigningCredentialTransition(
    data.credential1,
    data.credential2,
    { trustedPersonaRootPublicKey: data.root.publicKey }
  );
  assert.equal(transition.valid, true);
  assert.equal(transition.previous_epoch, 1);
  assert.equal(transition.current_epoch, 2);
  assert.equal(transition.transition_kind, 'rotation');
  assert.equal(transition.predecessor_disposition, 'retired');
  assert.equal(validatePersonaSigningCredentialPath(
    [data.credential1, data.credential2],
    { trustedPersonaRootPublicKey: data.root.publicKey }
  ).last_epoch, 2);

  assert.equal(assertPersonaSigningCredentialUsableAt(data.credential1, {
    trustedPersonaRootPublicKey: data.root.publicKey,
    at: T2,
    successorCredential: data.credential2
  }).valid, true);
  assert.throws(
    () => assertPersonaSigningCredentialUsableAt(data.credential1, {
      trustedPersonaRootPublicKey: data.root.publicKey,
      at: T3,
      successorCredential: data.credential2
    }),
    /stale after successor activation/
  );
  const current = assertPersonaSigningCredentialUsableAt(data.credential2, {
    trustedPersonaRootPublicKey: data.root.publicKey,
    at: T4
  });
  assert.equal(current.valid, true);
  assert.equal(current.global_currentness_claimed, false);
});

test('recovery requires a compromised or revoked predecessor and preserves the same private persona binding', () => {
  const social = socialFixture();
  const root = keys();
  const firstKey = keys();
  const recoveredKey = keys();
  const first = createPersonaSigningCredential({
    personaId: social.projection.persona_id,
    personaProjectionDigest: social.projection.projection_digest,
    personaRootPrivateKey: root.privateKey,
    signingPublicKey: firstKey.publicKey,
    epoch: 1,
    activatedAt: T0
  });
  const recovered = createPersonaSigningCredential({
    personaId: social.projection.persona_id,
    personaProjectionDigest: social.projection.projection_digest,
    personaRootPrivateKey: root.privateKey,
    signingPublicKey: recoveredKey.publicKey,
    epoch: 2,
    activatedAt: T3,
    transitionKind: 'recovery',
    predecessorCredential: first,
    predecessorDisposition: 'compromised'
  });
  const result = validatePersonaSigningCredentialTransition(first, recovered, {
    trustedPersonaRootPublicKey: root.publicKey
  });
  assert.equal(result.transition_kind, 'recovery');
  assert.equal(result.predecessor_disposition, 'compromised');
  assert.equal(recovered.statement.persona_projection_digest, first.statement.persona_projection_digest);

  assert.throws(
    () => createPersonaSigningCredential({
      personaId: social.projection.persona_id,
      personaProjectionDigest: social.projection.projection_digest,
      personaRootPrivateKey: root.privateKey,
      signingPublicKey: keys().publicKey,
      epoch: 2,
      activatedAt: T3,
      transitionKind: 'recovery',
      predecessorCredential: first,
      predecessorDisposition: 'retired'
    }),
    /recovery requires a revoked or compromised predecessor/
  );
});

test('root-signed revocation terminates a credential at an exact time without claiming global propagation', () => {
  const data = credentialFixture();
  const revocation = createPersonaSigningRevocation(data.credential1, {
    trustedPersonaRootPublicKey: data.root.publicKey,
    personaRootPrivateKey: data.root.privateKey,
    effectiveAt: T2,
    reasonCode: 'suspected-compromise'
  });
  assert.equal(revocation.schema, PERSONA_SIGNING_REVOCATION_SCHEMA);
  const verified = verifyPersonaSigningRevocation(revocation, {
    trustedPersonaRootPublicKey: data.root.publicKey,
    credential: data.credential1
  });
  assert.equal(verified.statement.credential_digest, data.credential1.credential_digest);
  assert.equal(verified.statement.controller_identity_disclosed, false);

  assert.equal(assertPersonaSigningCredentialUsableAt(data.credential1, {
    trustedPersonaRootPublicKey: data.root.publicKey,
    at: T1,
    revocation
  }).valid, true);
  assert.throws(
    () => assertPersonaSigningCredentialUsableAt(data.credential1, {
      trustedPersonaRootPublicKey: data.root.publicKey,
      at: T2,
      revocation
    }),
    /revoked at the requested time/
  );
});

test('root substitution, key substitution, and credential tampering fail closed', () => {
  const data = credentialFixture();
  const otherRoot = keys();
  assert.throws(
    () => verifyPersonaSigningCredential(data.credential1, {
      trustedPersonaRootPublicKey: otherRoot.publicKey
    }),
    /does not match the trusted public key/
  );

  const tampered = structuredClone(data.credential1);
  tampered.statement.signing_public_key = keys().publicKey;
  assert.throws(
    () => verifyPersonaSigningCredential(tampered, {
      trustedPersonaRootPublicKey: data.root.publicKey
    }),
    /signing_key_id does not match signing_public_key|statement digest does not match/
  );

  const wrongJournalPrivateKey = keys();
  assert.throws(
    () => createCredentialedPersonaPublicationAttestation(data.social.original, {
      personaJournalPrivateKey: wrongJournalPrivateKey.privateKey,
      personaSigningCredential: data.credential1,
      trustedPersonaRootPublicKey: data.root.publicKey,
      issuedAt: T1
    }),
    /does not match the signing credential/
  );
});

test('credentialed journal v2 keeps one append-only sequence across a signing-key rotation', () => {
  const data = credentialFixture();
  const first = createCredentialedPersonaPublicationAttestation(data.social.original, {
    personaJournalPrivateKey: data.journal1.privateKey,
    personaSigningCredential: data.credential1,
    trustedPersonaRootPublicKey: data.root.publicKey,
    successorCredential: data.credential2,
    issuedAt: T1
  });
  const second = createCredentialedPersonaPublicationAttestation(data.social.revision, {
    personaJournalPrivateKey: data.journal2.privateKey,
    personaSigningCredential: data.credential2,
    trustedPersonaRootPublicKey: data.root.publicKey,
    previousAttestation: first,
    previousCredential: data.credential1,
    credentialPath: [data.credential1, data.credential2],
    issuedAt: T4
  });
  const third = createCredentialedPersonaRetractionAttestation(data.social.retraction, {
    publication: data.social.revision,
    personaJournalPrivateKey: data.journal2.privateKey,
    personaSigningCredential: data.credential2,
    trustedPersonaRootPublicKey: data.root.publicKey,
    previousAttestation: second,
    previousCredential: data.credential2,
    issuedAt: T6
  });

  assert.equal(first.schema, CREDENTIALED_PUBLIC_JOURNAL_ATTESTATION_SCHEMA);
  assert.equal(first.statement.persona_key_epoch, 1);
  assert.equal(second.statement.persona_key_epoch, 2);
  assert.equal(first.statement.sequence, 1);
  assert.equal(second.statement.sequence, 2);
  assert.equal(third.statement.sequence, 3);
  assert.equal(second.statement.previous_attestation_digest, first.attestation_digest);
  assert.equal(third.statement.previous_attestation_digest, second.attestation_digest);

  const continuity = validateCredentialedPublicJournalContinuity(first, second, {
    previousCredential: data.credential1,
    currentCredential: data.credential2,
    trustedPersonaRootPublicKey: data.root.publicKey,
    credentialPath: [data.credential1, data.credential2]
  });
  assert.equal(continuity.valid, true);
  assert.equal(continuity.previous_key_epoch, 1);
  assert.equal(continuity.current_key_epoch, 2);

  const verified = verifyCredentialedPublicJournalAttestation(second, {
    personaSigningCredential: data.credential2,
    trustedPersonaRootPublicKey: data.root.publicKey,
    entry: data.social.revision
  });
  assert.equal(verified.valid, true);
  assert.equal(verified.persona_key_signature_valid, true);
  assert.equal(verified.persona_root_credential_valid, true);
  assert.equal(verified.legal_identity_claimed, false);
  assert.equal(verified.global_currentness_claimed, false);
});

test('credentialed journal rejects stale old-key attestations once successor evidence is supplied', () => {
  const data = credentialFixture();
  assert.throws(
    () => createCredentialedPersonaPublicationAttestation(data.social.revision, {
      personaJournalPrivateKey: data.journal1.privateKey,
      personaSigningCredential: data.credential1,
      trustedPersonaRootPublicKey: data.root.publicKey,
      successorCredential: data.credential2,
      issuedAt: T4
    }),
    /stale after successor activation/
  );
});

test('credentialed public journal still refuses non-public social content', () => {
  const social = socialFixture();
  const root = keys();
  const journal = keys();
  const credential = createPersonaSigningCredential({
    personaId: social.projection.persona_id,
    personaProjectionDigest: social.projection.projection_digest,
    personaRootPrivateKey: root.privateKey,
    signingPublicKey: journal.publicKey,
    epoch: 1,
    activatedAt: T0
  });
  const followersOnly = createSocialPublicationProjection(publicationInput({
    publication_id: 'followers-only',
    audience: { mode: 'followers' }
  }), { persona: social.protectedPersona });
  assert.throws(
    () => createCredentialedPersonaPublicationAttestation(followersOnly, {
      personaJournalPrivateKey: journal.privateKey,
      personaSigningCredential: credential,
      trustedPersonaRootPublicKey: root.publicKey,
      issuedAt: T1
    }),
    /only public-audience publications/
  );
});

test('cross-epoch continuity rejects a predecessor signed after its credential was superseded', () => {
  const data = credentialFixture();
  const stalePredecessor = createCredentialedPersonaPublicationAttestation(data.social.revision, {
    personaJournalPrivateKey: data.journal1.privateKey,
    personaSigningCredential: data.credential1,
    trustedPersonaRootPublicKey: data.root.publicKey,
    issuedAt: T4
  });

  assert.throws(
    () => createCredentialedPersonaRetractionAttestation(data.social.retraction, {
      publication: data.social.revision,
      personaJournalPrivateKey: data.journal2.privateKey,
      personaSigningCredential: data.credential2,
      trustedPersonaRootPublicKey: data.root.publicKey,
      previousAttestation: stalePredecessor,
      previousCredential: data.credential1,
      credentialPath: [data.credential1, data.credential2],
      issuedAt: T6
    }),
    /predecessor was issued after its key became stale/
  );
});
