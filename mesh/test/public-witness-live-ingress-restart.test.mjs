import assert from 'node:assert/strict';
import { createPublicKey, generateKeyPairSync, X509Certificate } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { request as httpsRequest } from 'node:https';
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
import {
  loadTransportRuntime,
  provisionTransportCredentials
} from '../src/lib/transport-credentials.mjs';
import { canonicalJson, sha256 } from '../src/lib/canonical.mjs';

const DOMAIN = 'axiom.social.public.v1';
const T0 = '2026-08-17T23:00:00.000Z';
const T1 = '2026-08-17T23:01:00.000Z';
const T2 = '2026-08-17T23:02:00.000Z';
const T3 = '2026-08-17T23:03:00.000Z';
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
    persona_id: 'persona-live-restart',
    controller_actor_id: 'actor-private-live-restart',
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
    publication_id: 'live-restart-publication',
    content: { media_type: 'text/plain', text: 'Restart must preserve exact public witness history.' },
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
    domainId: DOMAIN,
    sourceId: 'source-live-restart',
    sourcePublicKey: source.publicKey,
    sourceEpoch: 1,
    validFrom: T0,
    expiresAt: TEND
  });
  const request = {
    attestation,
    persona_signing_credential: credential,
    entry: publication,
    publication: null
  };
  const makeTransfer = transferId => createPublicWitnessTransferPackage({
    operation: 'observe-journal',
    request
  }, {
    sourceAdmission: admission,
    sourcePrivateKey: source.privateKey,
    transferId,
    createdAt: T2,
    expiresAt: TEND,
    now: Date.parse(T2)
  });
  return {
    root,
    witness,
    admission,
    first: makeTransfer('live-restart-transfer-one'),
    fork: makeTransfer('live-restart-transfer-fork')
  };
}

async function transportFixture() {
  const secretDir = await mkdtemp(join(tmpdir(), 'axiom-live-restart-transport-'));
  const status = await provisionTransportCredentials({ secretDir });
  return {
    server: await loadTransportRuntime({ transportDir: status.transport_dir, service: 'grid' }),
    client: await loadTransportRuntime({ transportDir: status.transport_dir, service: 'gateway' })
  };
}

function certificateDigest(runtime) {
  return certificateSha256(new X509Certificate(runtime.cert).raw);
}

function makeIngress(store, data, client) {
  return new PublicWitnessAuthenticatedIngress({
    receiverStore: store,
    sourceBindings: [{
      certificate_sha256: certificateDigest(client),
      source_id: data.admission.source_id,
      source_epoch: data.admission.source_epoch
    }],
    personaRoots: [{
      key_id: keyId(data.root.publicKey),
      public_key: data.root.publicKey
    }],
    clock: () => Date.parse(T3)
  });
}

function makeServer(ingress, serverRuntime) {
  return createPublicWitnessHttpsIngress({
    ingress,
    tlsKey: serverRuntime.key,
    tlsCertificate: serverRuntime.cert,
    clientCa: serverRuntime.ca,
    host: '127.0.0.1',
    port: 0
  });
}

function bodyFor(transfer, rootPublicKey) {
  return canonicalJson({
    transfer,
    persona_root_key_id: keyId(rootPublicKey)
  });
}

async function post(address, client, body) {
  return new Promise((resolve, reject) => {
    const request = httpsRequest({
      host: '127.0.0.1',
      port: address.port,
      path: '/v1/transfers',
      method: 'POST',
      servername: 'grid.service.axiom-mesh.internal',
      key: client.key,
      cert: client.cert,
      ca: client.ca,
      rejectUnauthorized: true,
      minVersion: 'TLSv1.3',
      maxVersion: 'TLSv1.3',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
        connection: 'close'
      }
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        resolve({ status: response.statusCode, payload });
      });
    });
    request.on('error', reject);
    request.end(body);
  });
}

test('actual mTLS ingress preserves exact replay and source equivocation across receiver restart', async () => {
  const data = fixture();
  const dir = await mkdtemp(join(tmpdir(), 'axiom-live-restart-receiver-'));
  const statePath = join(dir, 'receiver.jsonl');
  const transport = await transportFixture();

  const firstStore = await openPublicWitnessReceiverStore({
    statePath,
    domainId: DOMAIN,
    witnessId: 'witness-live-restart',
    witnessPrivateKey: data.witness.privateKey
  });
  await firstStore.admitSource(data.admission, { admittedAt: T0 });
  const firstIngress = makeIngress(firstStore, data, transport.client);
  const firstServer = makeServer(firstIngress, transport.server);
  const firstAddress = await firstServer.listen();
  let first;
  try {
    first = await post(firstAddress, transport.client, bodyFor(data.first, data.root.publicKey));
    assert.equal(first.status, 202);
    assert.equal(first.payload.status, 'received');
    assert.equal(firstStore.snapshot().transfer_count, 1);
  } finally {
    await firstServer.close();
  }

  const reopenedStore = await openPublicWitnessReceiverStore({
    statePath,
    domainId: DOMAIN,
    witnessId: 'witness-live-restart',
    witnessPrivateKey: data.witness.privateKey
  });
  assert.equal((await reopenedStore.verifyState()).valid, true);
  assert.equal(reopenedStore.snapshot().transfer_count, 1);

  const restartedIngress = makeIngress(reopenedStore, data, transport.client);
  const restartedServer = makeServer(restartedIngress, transport.server);
  const restartedAddress = await restartedServer.listen();
  try {
    const replay = await post(restartedAddress, transport.client, bodyFor(data.first, data.root.publicKey));
    assert.equal(replay.status, 200);
    assert.equal(replay.payload.status, 'replay');
    assert.equal(replay.payload.transfer_receipt.receipt_digest, first.payload.transfer_receipt.receipt_digest);
    assert.equal(reopenedStore.snapshot().transfer_count, 1);

    const fork = await post(restartedAddress, transport.client, bodyFor(data.fork, data.root.publicKey));
    assert.equal(fork.status, 202);
    assert.equal(fork.payload.status, 'received-with-equivocation');
    assert.equal(fork.payload.source_equivocation_evidence.preferred_transfer_digest, null);
    assert.equal(reopenedStore.snapshot().transfer_count, 2);
    assert.equal(reopenedStore.snapshot().conflicted_source_count, 1);
    assert.equal(reopenedStore.listSourcePositions(data.admission.source_id, 1).length, 2);
  } finally {
    await restartedServer.close();
  }
});
