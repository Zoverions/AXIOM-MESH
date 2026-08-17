import assert from 'node:assert/strict';
import { createPublicKey, generateKeyPairSync } from 'node:crypto';
import { mkdtemp, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { PUBLICATION_PERSONA_SCHEMA } from '../src/identity/actor-state.mjs';
import {
  createCredentialedPersonaPublicationAttestation,
  createPersonaSigningCredential
} from '../src/lib/persona-journal-credential.mjs';
import {
  PublicWitnessAuthenticatedIngress,
  certificateSha256,
  createPublicWitnessHttpsIngress
} from '../src/lib/public-witness-live-ingress.mjs';
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

const T0 = '2026-08-17T23:00:00.000Z';
const T1 = '2026-08-17T23:01:00.000Z';
const T2 = '2026-08-17T23:02:00.000Z';
const T3 = '2026-08-17T23:03:00.000Z';
const TEND = '2026-08-17T23:30:00.000Z';

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
    persona_id: 'persona-live-ingress',
    controller_actor_id: 'actor-private-live-ingress',
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
    publication_id: 'live-ingress-publication',
    content: { media_type: 'text/plain', text: 'Transport must not become authority.' },
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
  const admission = createPublicWitnessSourceAdmission({
    domainId: 'axiom.social.public.v1',
    sourceId: 'source-live-ingress',
    sourcePublicKey: source.publicKey,
    sourceEpoch: 1,
    validFrom: T0,
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
    sourceAdmission: admission,
    sourcePrivateKey: source.privateKey,
    transferId: 'live-ingress-transfer-1',
    createdAt: T2,
    expiresAt: TEND,
    now: Date.parse(T2)
  });
  return { root, source, witness, admission, transfer };
}

async function receiver(data) {
  const dir = await mkdtemp(join(tmpdir(), 'axiom-live-ingress-'));
  const statePath = join(dir, 'receiver.jsonl');
  const store = await openPublicWitnessReceiverStore({
    statePath,
    domainId: 'axiom.social.public.v1',
    witnessId: 'witness-live-ingress',
    witnessPrivateKey: data.witness.privateKey
  });
  await store.admitSource(data.admission, { admittedAt: T0 });
  return { store, statePath };
}

test('authenticated ingress dual-binds transport certificate and admitted source before durable intake', async () => {
  const data = fixture();
  const setup = await receiver(data);
  const certificateDigest = certificateSha256(Buffer.from('synthetic-client-certificate-one'));
  const rootId = keyId(data.root.publicKey);
  let now = Date.parse(T3);
  const ingress = new PublicWitnessAuthenticatedIngress({
    receiverStore: setup.store,
    sourceBindings: [{
      certificate_sha256: certificateDigest,
      source_id: data.admission.source_id,
      source_epoch: data.admission.source_epoch
    }],
    personaRoots: [{ key_id: rootId, public_key: data.root.publicKey }],
    clock: () => now
  });
  const request = { transfer: data.transfer, persona_root_key_id: rootId };
  const first = await ingress.accept({ certificate_sha256: certificateDigest, request });
  assert.equal(first.status, 'received');
  assert.equal(first.transport_certificate_sha256, certificateDigest);
  assert.equal(first.persona_root_trust_source, 'local-config');
  assert.equal(first.source_admission_effect, 'none');
  assert.equal(first.persona_root_trust_effect, 'none');
  assert.equal(first.finality_claimed, false);
  assert.equal(first.authority_effect, 'none');
  assert.equal(first.network_effect, 'receive-only-laboratory');
  const bytes = (await stat(setup.statePath)).size;

  now += 100;
  const replay = await ingress.accept({ certificate_sha256: certificateDigest, request: structuredClone(request) });
  assert.equal(replay.status, 'replay');
  assert.equal(replay.transfer_receipt.receipt_digest, first.transfer_receipt.receipt_digest);
  assert.equal((await stat(setup.statePath)).size, bytes);
  assert.equal(ingress.snapshot().accepted_requests, 1);
  assert.equal(ingress.snapshot().replayed_requests, 1);
});

test('transport identity and persona-root trust are local allowlists, not remote package claims', async () => {
  const data = fixture();
  const setup = await receiver(data);
  const allowedCertificate = certificateSha256(Buffer.from('synthetic-client-certificate-one'));
  const otherCertificate = certificateSha256(Buffer.from('synthetic-client-certificate-two'));
  const rootId = keyId(data.root.publicKey);
  const ingress = new PublicWitnessAuthenticatedIngress({
    receiverStore: setup.store,
    sourceBindings: [{
      certificate_sha256: allowedCertificate,
      source_id: data.admission.source_id,
      source_epoch: data.admission.source_epoch
    }],
    personaRoots: [{ key_id: rootId, public_key: data.root.publicKey }],
    clock: () => Date.parse(T3)
  });
  const before = (await stat(setup.statePath)).size;
  await assert.rejects(
    () => ingress.accept({
      certificate_sha256: otherCertificate,
      request: { transfer: data.transfer, persona_root_key_id: rootId }
    }),
    /transport identity is not bound/
  );
  await assert.rejects(
    () => ingress.accept({
      certificate_sha256: allowedCertificate,
      request: { transfer: data.transfer, persona_root_key_id: 'f'.repeat(64) }
    }),
    /persona root is not locally trusted/
  );
  assert.equal((await stat(setup.statePath)).size, before);
  assert.equal(setup.store.snapshot().transfer_count, 0);
  assert.equal(ingress.snapshot().rejected_requests, 2);
});

test('ingress rate limits fail before receiver mutation and HTTPS adapter refuses wildcard bind by default', async () => {
  const data = fixture();
  const setup = await receiver(data);
  const certificateDigest = certificateSha256(Buffer.from('synthetic-client-certificate-one'));
  const rootId = keyId(data.root.publicKey);
  const ingress = new PublicWitnessAuthenticatedIngress({
    receiverStore: setup.store,
    sourceBindings: [{
      certificate_sha256: certificateDigest,
      source_id: data.admission.source_id,
      source_epoch: data.admission.source_epoch
    }],
    personaRoots: [{ key_id: rootId, public_key: data.root.publicKey }],
    clock: () => Date.parse(T3),
    perClientBurst: 1,
    rateWindowMs: 1000
  });
  const request = { transfer: data.transfer, persona_root_key_id: rootId };
  await ingress.accept({ certificate_sha256: certificateDigest, request });
  const bytes = (await stat(setup.statePath)).size;
  await assert.rejects(
    () => ingress.accept({ certificate_sha256: certificateDigest, request }),
    /client rate limit is exhausted/
  );
  assert.equal((await stat(setup.statePath)).size, bytes);
  assert.equal(ingress.snapshot().automatic_source_admission, false);
  assert.equal(ingress.snapshot().outbound_fetch, false);
  assert.equal(ingress.snapshot().discovery, false);
  assert.equal(ingress.snapshot().grid_credentials, false);

  assert.throws(
    () => createPublicWitnessHttpsIngress({
      ingress,
      tlsKey: 'not-evaluated-before-host-validation',
      tlsCertificate: 'not-evaluated-before-host-validation',
      clientCa: 'not-evaluated-before-host-validation',
      host: '0.0.0.0',
      port: 8443
    }),
    /wildcard bind requires a separately reviewed deployment wrapper/
  );
});