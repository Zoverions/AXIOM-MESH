import assert from 'node:assert/strict';
import { createPublicKey, generateKeyPairSync } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { PUBLICATION_PERSONA_SCHEMA } from '../src/identity/actor-state.mjs';
import {
  createCredentialedPersonaPublicationAttestation,
  createPersonaSigningCredential
} from '../src/lib/persona-journal-credential.mjs';
import {
  createPublicWitnessAuthenticatedIngressFromTrustBundle,
  createPublicWitnessIngressTrustBundle,
  loadPublicWitnessIngressTrustBundle,
  validatePublicWitnessIngressTrustBundle,
  validatePublicWitnessIngressTrustTransition,
  verifyPublicWitnessIngressTrustBundleAgainstReceiver
} from '../src/lib/public-witness-ingress-trust.mjs';
import { openPublicWitnessReceiverStore } from '../src/lib/public-witness-receiver-store.mjs';
import {
  createPublicPersonaProjection,
  createSocialPublicationProjection
} from '../src/lib/social-publication.mjs';
import {
  createPublicWitnessSourceAdmission,
  createPublicWitnessTransferPackage
} from '../src/lib/public-witness-transfer.mjs';
import { sha256 } from '../src/lib/canonical.mjs';

const DOMAIN = 'axiom.social.public.v1';
const T0 = '2026-08-17T23:00:00.000Z';
const T1 = '2026-08-17T23:01:00.000Z';
const T2 = '2026-08-17T23:02:00.000Z';
const T3 = '2026-08-17T23:03:00.000Z';
const T4 = '2026-08-17T23:04:00.000Z';
const TEND = '2026-08-17T23:05:00.000Z';

function keys() {
  const pair = generateKeyPairSync('ed25519');
  return {
    privateKey: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
  };
}

function keyId(publicKey) {
  return sha256(createPublicKey(publicKey).export({ type: 'spki', format: 'pem' }).toString());
}

function fixture() {
  const persona = {
    schema: PUBLICATION_PERSONA_SCHEMA,
    persona_id: 'persona-ingress-trust',
    controller_actor_id: 'actor-private-ingress-trust',
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
  const otherRoot = keys();
  const credential = createPersonaSigningCredential({
    personaId: projection.persona_id,
    personaProjectionDigest: projection.projection_digest,
    personaRootPrivateKey: root.privateKey,
    signingPublicKey: journal.publicKey,
    epoch: 1,
    activatedAt: T0
  });
  const publication = createSocialPublicationProjection({
    publication_id: 'ingress-trust-publication',
    content: { media_type: 'text/plain', text: 'Trust rotation must remain local and explicit.' },
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
    sourceId: 'source-ingress-trust',
    sourcePublicKey: source.publicKey,
    sourceEpoch: 1,
    validFrom: T0,
    expiresAt: TEND
  });
  const admission2 = createPublicWitnessSourceAdmission({
    domainId: DOMAIN,
    sourceId: 'source-ingress-trust',
    sourcePublicKey: source2.publicKey,
    sourceEpoch: 2,
    validFrom: T1,
    expiresAt: TEND
  });
  const transfer = createPublicWitnessTransferPackage({
    operation: 'observe-journal',
    request: {
      attestation,
      persona_signing_credential: credential,
      entry: publication,
      publication: null
    }
  }, {
    sourceAdmission: admission1,
    sourcePrivateKey: source.privateKey,
    transferId: 'ingress-trust-transfer-1',
    createdAt: T2,
    expiresAt: TEND,
    now: Date.parse(T2)
  });
  return {
    root,
    otherRoot,
    source,
    source2,
    witness,
    admission1,
    admission2,
    transfer
  };
}

async function receiver(data, { admit = true } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'axiom-ingress-trust-'));
  const store = await openPublicWitnessReceiverStore({
    statePath: join(dir, 'receiver.jsonl'),
    domainId: DOMAIN,
    witnessId: 'witness-ingress-trust',
    witnessPrivateKey: data.witness.privateKey
  });
  if (admit) await store.admitSource(data.admission1, { admittedAt: T0 });
  return store;
}

function rootEntry(publicKey) {
  return { key_id: keyId(publicKey), public_key: publicKey };
}

function bundle1(data, certificate = 'a'.repeat(64)) {
  return createPublicWitnessIngressTrustBundle({
    domainId: DOMAIN,
    generation: 1,
    activatedAt: T1,
    sources: [{ certificate_sha256: certificate, admission: data.admission1 }],
    personaRoots: [rootEntry(data.root.publicKey)]
  });
}

test('ingress trust bundle is content-addressed local trust metadata over pre-admitted W2c2 sources', async () => {
  const data = fixture();
  const store = await receiver(data);
  const bundle = bundle1(data);
  const verified = validatePublicWitnessIngressTrustBundle(bundle);
  assert.equal(verified.bundle_digest, bundle.bundle_digest);
  assert.equal(verified.source_trust_input, 'pre-admitted-w2c2-source');
  assert.equal(verified.persona_root_trust_input, 'local-operator-config');
  assert.equal(verified.remote_self_admission_allowed, false);
  assert.equal(verified.social_authority_effect, 'none');
  assert.equal(verified.finality_claimed, false);
  assert.equal(verified.authority_effect, 'none');
  assert.equal(verified.network_effect, 'none');

  const before = store.snapshot();
  const receiverVerification = verifyPublicWitnessIngressTrustBundleAgainstReceiver({
    receiverStore: store,
    bundle
  });
  assert.equal(receiverVerification.receiver_mutation, false);
  assert.equal(receiverVerification.sources[0].admission_digest, data.admission1.admission_digest);
  assert.deepEqual(store.snapshot(), before);
});

test('trust-bundle factory uses retained W2c2 admission and rotates certificate binding without mutating receiver trust', async () => {
  const data = fixture();
  const store = await receiver(data);
  const firstBundle = bundle1(data, 'a'.repeat(64));
  const before = store.snapshot();
  const ingress1 = createPublicWitnessAuthenticatedIngressFromTrustBundle({
    receiverStore: store,
    bundle: firstBundle,
    clock: () => Date.parse(T3)
  });
  const request = {
    transfer: data.transfer,
    persona_root_key_id: keyId(data.root.publicKey)
  };
  const accepted = await ingress1.accept({ certificate_sha256: 'a'.repeat(64), request });
  assert.equal(accepted.status, 'received');

  const secondBundle = createPublicWitnessIngressTrustBundle({
    domainId: DOMAIN,
    generation: 2,
    previousBundle: firstBundle,
    activatedAt: T4,
    sources: [{ certificate_sha256: 'b'.repeat(64), admission: data.admission1 }],
    personaRoots: [rootEntry(data.root.publicKey)]
  });
  validatePublicWitnessIngressTrustTransition(firstBundle, secondBundle);
  const ingress2 = createPublicWitnessAuthenticatedIngressFromTrustBundle({
    receiverStore: store,
    bundle: secondBundle,
    previousBundle: firstBundle,
    clock: () => Date.parse(T4)
  });
  await assert.rejects(
    () => ingress2.accept({ certificate_sha256: 'a'.repeat(64), request }),
    /transport identity is not bound/
  );
  const replay = await ingress2.accept({ certificate_sha256: 'b'.repeat(64), request });
  assert.equal(replay.status, 'replay');
  assert.equal(store.snapshot().source_count, before.source_count);
  assert.equal(store.snapshot().transfer_count, before.transfer_count + 1);
});

test('future trust bundle cannot activate ingress before its declared activation boundary', async () => {
  const data = fixture();
  const store = await receiver(data);
  const firstBundle = bundle1(data);
  const futureBundle = createPublicWitnessIngressTrustBundle({
    domainId: DOMAIN,
    generation: 2,
    previousBundle: firstBundle,
    activatedAt: T4,
    sources: [{ certificate_sha256: 'b'.repeat(64), admission: data.admission1 }],
    personaRoots: [rootEntry(data.root.publicKey)]
  });
  const before = store.snapshot();
  assert.throws(
    () => createPublicWitnessAuthenticatedIngressFromTrustBundle({
      receiverStore: store,
      bundle: futureBundle,
      previousBundle: firstBundle,
      clock: () => Date.parse(T3)
    }),
    /not active yet/
  );
  assert.deepEqual(store.snapshot(), before);
});

test('trust-bundle root removal contracts accepted persona-root trust on the next ingress generation', async () => {
  const data = fixture();
  const store = await receiver(data);
  const firstBundle = bundle1(data);
  const secondBundle = createPublicWitnessIngressTrustBundle({
    domainId: DOMAIN,
    generation: 2,
    previousBundle: firstBundle,
    activatedAt: T4,
    sources: [{ certificate_sha256: 'b'.repeat(64), admission: data.admission1 }],
    personaRoots: [rootEntry(data.otherRoot.publicKey)]
  });
  const ingress = createPublicWitnessAuthenticatedIngressFromTrustBundle({
    receiverStore: store,
    bundle: secondBundle,
    previousBundle: firstBundle,
    clock: () => Date.parse(T4)
  });
  const before = store.snapshot();
  await assert.rejects(
    () => ingress.accept({
      certificate_sha256: 'b'.repeat(64),
      request: {
        transfer: data.transfer,
        persona_root_key_id: keyId(data.root.publicKey)
      }
    }),
    /persona root is not locally trusted/
  );
  assert.deepEqual(store.snapshot(), before);
});

test('bundle transitions fail closed on rollback, epoch replacement, skipped epoch, predecessor tamper, or non-advancing time', () => {
  const data = fixture();
  const first = bundle1(data);
  const sameEpochDifferentAdmission = createPublicWitnessSourceAdmission({
    domainId: DOMAIN,
    sourceId: data.admission1.source_id,
    sourcePublicKey: data.source2.publicKey,
    sourceEpoch: 1,
    validFrom: T1,
    expiresAt: TEND
  });
  assert.throws(
    () => createPublicWitnessIngressTrustBundle({
      domainId: DOMAIN,
      generation: 2,
      previousBundle: first,
      activatedAt: T4,
      sources: [{ certificate_sha256: 'b'.repeat(64), admission: sameEpochDifferentAdmission }],
      personaRoots: [rootEntry(data.root.publicKey)]
    }),
    /cannot replace a source admission within one epoch/
  );

  const admission3 = createPublicWitnessSourceAdmission({
    domainId: DOMAIN,
    sourceId: data.admission1.source_id,
    sourcePublicKey: data.source2.publicKey,
    sourceEpoch: 3,
    validFrom: T1,
    expiresAt: TEND
  });
  assert.throws(
    () => createPublicWitnessIngressTrustBundle({
      domainId: DOMAIN,
      generation: 2,
      previousBundle: first,
      activatedAt: T4,
      sources: [{ certificate_sha256: 'b'.repeat(64), admission: admission3 }],
      personaRoots: [rootEntry(data.root.publicKey)]
    }),
    /must advance exactly one epoch/
  );

  const validSecond = createPublicWitnessIngressTrustBundle({
    domainId: DOMAIN,
    generation: 2,
    previousBundle: first,
    activatedAt: T4,
    sources: [{ certificate_sha256: 'b'.repeat(64), admission: data.admission2 }],
    personaRoots: [rootEntry(data.root.publicKey)]
  });
  const tampered = structuredClone(validSecond);
  tampered.previous_bundle_digest = 'f'.repeat(64);
  assert.throws(() => validatePublicWitnessIngressTrustBundle(tampered), /digest mismatch/);
  assert.throws(
    () => createPublicWitnessIngressTrustBundle({
      domainId: DOMAIN,
      generation: 2,
      previousBundle: first,
      activatedAt: T1,
      sources: [{ certificate_sha256: 'b'.repeat(64), admission: data.admission2 }],
      personaRoots: [rootEntry(data.root.publicKey)]
    }),
    /activation time must advance/
  );
});

test('trust bundle refuses duplicate certificates, duplicate source IDs, root substitution, and missing receiver admission', async () => {
  const data = fixture();
  const otherSource = keys();
  const otherAdmission = createPublicWitnessSourceAdmission({
    domainId: DOMAIN,
    sourceId: 'source-ingress-trust-other',
    sourcePublicKey: otherSource.publicKey,
    sourceEpoch: 1,
    validFrom: T0,
    expiresAt: TEND
  });
  assert.throws(
    () => createPublicWitnessIngressTrustBundle({
      domainId: DOMAIN,
      activatedAt: T1,
      sources: [
        { certificate_sha256: 'a'.repeat(64), admission: data.admission1 },
        { certificate_sha256: 'a'.repeat(64), admission: otherAdmission }
      ],
      personaRoots: [rootEntry(data.root.publicKey)]
    }),
    /certificate digest cannot authenticate multiple source entries/
  );
  assert.throws(
    () => createPublicWitnessIngressTrustBundle({
      domainId: DOMAIN,
      activatedAt: T1,
      sources: [
        { certificate_sha256: 'a'.repeat(64), admission: data.admission1 },
        { certificate_sha256: 'b'.repeat(64), admission: data.admission1 }
      ],
      personaRoots: [rootEntry(data.root.publicKey)]
    }),
    /one active entry per source_id/
  );

  const bundle = bundle1(data);
  const substitutedRoot = structuredClone(bundle);
  substitutedRoot.persona_roots[0].public_key = data.otherRoot.publicKey;
  assert.throws(() => validatePublicWitnessIngressTrustBundle(substitutedRoot), /key_id does not match public key/);

  const emptyStore = await receiver(data, { admit: false });
  assert.throws(
    () => verifyPublicWitnessIngressTrustBundleAgainstReceiver({ receiverStore: emptyStore, bundle }),
    /not exactly retained by W2c2/
  );
});

test('trust bundle file loader accepts bounded regular JSON and rejects configured oversize', async () => {
  const data = fixture();
  const bundle = bundle1(data);
  const dir = await mkdtemp(join(tmpdir(), 'axiom-ingress-trust-file-'));
  const path = join(dir, 'trust.json');
  await writeFile(path, JSON.stringify(bundle, null, 2), 'utf8');
  const loaded = await loadPublicWitnessIngressTrustBundle(path);
  assert.equal(loaded.bundle_digest, bundle.bundle_digest);
  await assert.rejects(
    () => loadPublicWitnessIngressTrustBundle(path, { maxFileBytes: 32 }),
    /exceeds configured bounds/
  );
  await assert.rejects(
    () => loadPublicWitnessIngressTrustBundle(dir),
    /regular non-symlink file/
  );
});
