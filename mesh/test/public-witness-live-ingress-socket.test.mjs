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
  provisionTransportCredentials,
  rotateTransportCredentials
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

function journalFixture() {
  const persona = {
    schema: PUBLICATION_PERSONA_SCHEMA,
    persona_id: 'persona-live-socket',
    controller_actor_id: 'actor-private-live-socket',
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
    publication_id: 'live-socket-publication',
    content: { media_type: 'text/plain', text: 'Transport authentication does not create authority.' },
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
  return {
    root,
    witness,
    request: {
      attestation,
      persona_signing_credential: credential,
      entry: publication,
      publication: null
    }
  };
}

function sourceAdmission(source, epoch) {
  return createPublicWitnessSourceAdmission({
    domainId: DOMAIN,
    sourceId: 'source-live-socket',
    sourcePublicKey: source.publicKey,
    sourceEpoch: epoch,
    validFrom: T0,
    expiresAt: TEND
  });
}

function transferFor(app, source, admission, transferId) {
  return createPublicWitnessTransferPackage({
    operation: 'observe-journal',
    request: app.request
  }, {
    sourceAdmission: admission,
    sourcePrivateKey: source.privateKey,
    transferId,
    createdAt: T2,
    expiresAt: TEND,
    now: Date.parse(T2)
  });
}

async function receiver(app, admissions) {
  const dir = await mkdtemp(join(tmpdir(), 'axiom-live-socket-receiver-'));
  const store = await openPublicWitnessReceiverStore({
    statePath: join(dir, 'receiver.jsonl'),
    domainId: DOMAIN,
    witnessId: 'witness-live-socket',
    witnessPrivateKey: app.witness.privateKey
  });
  for (const [index, admission] of admissions.entries()) {
    await store.admitSource(admission, { admittedAt: index === 0 ? T0 : T1 });
  }
  return store;
}

async function transportFixture(prefix = 'axiom-live-socket-transport-') {
  const secretDir = await mkdtemp(join(tmpdir(), prefix));
  const status = await provisionTransportCredentials({ secretDir });
  return {
    secretDir,
    status,
    server: await loadTransportRuntime({ transportDir: status.transport_dir, service: 'grid' }),
    client: await loadTransportRuntime({ transportDir: status.transport_dir, service: 'gateway' })
  };
}

function transportCertificateDigest(runtime) {
  return certificateSha256(new X509Certificate(runtime.cert).raw);
}

function requestBody(transfer, rootPublicKey) {
  return canonicalJson({
    transfer,
    persona_root_key_id: keyId(rootPublicKey)
  });
}

function requestOptions(address, client, body, { trustCa = client.ca } = {}) {
  return {
    host: '127.0.0.1',
    port: address.port,
    path: '/v1/transfers',
    method: 'POST',
    servername: 'grid.service.axiom-mesh.internal',
    key: client.key,
    cert: client.cert,
    ca: trustCa,
    rejectUnauthorized: true,
    minVersion: 'TLSv1.3',
    maxVersion: 'TLSv1.3',
    headers: {
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(body),
      connection: 'close'
    }
  };
}

async function post(address, client, body, options = {}) {
  return new Promise((resolve, reject) => {
    const request = httpsRequest(requestOptions(address, client, body, options), response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let payload = null;
        try {
          payload = text ? JSON.parse(text) : null;
        } catch {
          reject(new Error(`response was not JSON: ${text}`));
          return;
        }
        resolve({ status: response.statusCode, payload });
      });
    });
    request.setTimeout(5000, () => request.destroy(new Error('client request timeout')));
    request.on('error', reject);
    request.end(body);
  });
}

async function abortPartial(address, client, body) {
  return new Promise(resolve => {
    const request = httpsRequest(requestOptions(address, client, body), () => {});
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      resolve();
    };
    request.on('error', done);
    request.on('close', done);
    request.on('socket', socket => {
      socket.once('secureConnect', () => {
        request.write(body.slice(0, Math.max(1, Math.floor(body.length / 4))));
        request.destroy();
      });
    });
  });
}

async function slowPartial(address, client, body) {
  return new Promise((resolve, reject) => {
    const request = httpsRequest(requestOptions(address, client, body), response => {
      response.resume();
      response.on('end', () => resolve({ status: response.statusCode }));
    });
    request.setTimeout(5000, () => request.destroy(new Error('slow client request timeout')));
    request.on('error', error => {
      if (/socket hang up|ECONNRESET|aborted/i.test(String(error?.message ?? error))) {
        resolve({ status: null, error });
        return;
      }
      reject(error);
    });
    request.write(body.slice(0, 1));
  });
}

function makeIngress({ store, root, bindings, maxConcurrent, perClientBurst }) {
  return new PublicWitnessAuthenticatedIngress({
    receiverStore: store,
    sourceBindings: bindings,
    personaRoots: [{ key_id: keyId(root.publicKey), public_key: root.publicKey }],
    clock: () => Date.parse(T3),
    maxConcurrent,
    perClientBurst
  });
}

function makeServer(ingress, serverRuntime, options = {}) {
  return createPublicWitnessHttpsIngress({
    ingress,
    tlsKey: serverRuntime.key,
    tlsCertificate: serverRuntime.cert,
    clientCa: serverRuntime.ca,
    host: '127.0.0.1',
    port: 0,
    ...options
  });
}

test('mTLS socket accepts exact bound client, preserves replay, and rejects an untrusted client CA before receiver mutation', async () => {
  const app = journalFixture();
  const source = keys();
  const admission = sourceAdmission(source, 1);
  const transfer = transferFor(app, source, admission, 'socket-transfer-1');
  const store = await receiver(app, [admission]);
  const transport = await transportFixture();
  const ingress = makeIngress({
    store,
    root: app.root,
    bindings: [{
      certificate_sha256: transportCertificateDigest(transport.client),
      source_id: admission.source_id,
      source_epoch: admission.source_epoch
    }]
  });
  const server = makeServer(ingress, transport.server);
  const address = await server.listen();
  try {
    const body = requestBody(transfer, app.root.publicKey);
    const first = await post(address, transport.client, body);
    assert.equal(first.status, 202);
    assert.equal(first.payload.status, 'received');
    assert.equal(first.payload.finality_claimed, false);
    assert.equal(first.payload.authority_effect, 'none');
    assert.equal(first.payload.network_effect, 'receive-only-laboratory');

    const replay = await post(address, transport.client, body);
    assert.equal(replay.status, 200);
    assert.equal(replay.payload.status, 'replay');
    assert.equal(replay.payload.transfer_receipt.receipt_digest, first.payload.transfer_receipt.receipt_digest);
    assert.equal(store.snapshot().transfer_count, 1);

    const rogue = await transportFixture('axiom-live-socket-rogue-');
    await assert.rejects(
      () => post(address, rogue.client, body, { trustCa: transport.server.ca })
    );
    assert.equal(store.snapshot().transfer_count, 1);
    assert.equal(ingress.snapshot().accepted_requests, 1);
    assert.equal(ingress.snapshot().replayed_requests, 1);
  } finally {
    await server.close();
  }
});

test('certificate and source-epoch rollover remain separate exact checks through the socket', async () => {
  const app = journalFixture();
  const source1 = keys();
  const source2 = keys();
  const admission1 = sourceAdmission(source1, 1);
  const admission2 = sourceAdmission(source2, 2);
  const staleTransfer = transferFor(app, source1, admission1, 'socket-stale-epoch-transfer');
  const currentTransfer = transferFor(app, source2, admission2, 'socket-current-epoch-transfer');
  const store = await receiver(app, [admission1, admission2]);
  const transport = await transportFixture();
  const retiredClient = transport.client;
  await rotateTransportCredentials({ secretDir: transport.secretDir });
  const rotated = await loadTransportRuntime({
    transportDir: transport.status.transport_dir,
    service: 'grid'
  });
  const activeClient = await loadTransportRuntime({
    transportDir: transport.status.transport_dir,
    service: 'gateway'
  });

  assert.notEqual(transportCertificateDigest(retiredClient), transportCertificateDigest(activeClient));
  const ingress = makeIngress({
    store,
    root: app.root,
    bindings: [
      {
        certificate_sha256: transportCertificateDigest(retiredClient),
        source_id: admission1.source_id,
        source_epoch: admission1.source_epoch
      },
      {
        certificate_sha256: transportCertificateDigest(activeClient),
        source_id: admission2.source_id,
        source_epoch: admission2.source_epoch
      }
    ]
  });
  const server = makeServer(ingress, rotated);
  const address = await server.listen();
  try {
    const staleBody = requestBody(staleTransfer, app.root.publicKey);
    const currentBody = requestBody(currentTransfer, app.root.publicKey);

    const substitutedCertificate = await post(address, activeClient, staleBody);
    assert.equal(substitutedCertificate.status, 403);
    assert.match(substitutedCertificate.payload.detail, /transport identity is not bound/);
    assert.equal(store.snapshot().transfer_count, 0);

    const staleEpoch = await post(address, retiredClient, staleBody, { trustCa: rotated.ca });
    assert.equal(staleEpoch.status, 400);
    assert.match(staleEpoch.payload.detail, /stale source epoch/);
    assert.equal(store.snapshot().transfer_count, 0);

    const current = await post(address, activeClient, currentBody);
    assert.equal(current.status, 202);
    assert.equal(current.payload.status, 'received');
    assert.equal(current.payload.transfer_receipt.statement.source_epoch, 2);
    assert.equal(store.snapshot().transfer_count, 1);
  } finally {
    await server.close();
  }
});

test('oversized, aborted, and slow socket bodies fail without durable receiver mutation', async () => {
  const app = journalFixture();
  const source = keys();
  const admission = sourceAdmission(source, 1);
  const transfer = transferFor(app, source, admission, 'socket-pressure-transfer');
  const store = await receiver(app, [admission]);
  const transport = await transportFixture();
  const ingress = makeIngress({
    store,
    root: app.root,
    bindings: [{
      certificate_sha256: transportCertificateDigest(transport.client),
      source_id: admission.source_id,
      source_epoch: admission.source_epoch
    }]
  });
  const server = makeServer(ingress, transport.server, {
    maxBodyBytes: 512,
    requestTimeoutMs: 250
  });
  const address = await server.listen();
  try {
    const canonicalBody = requestBody(transfer, app.root.publicKey);
    assert.ok(Buffer.byteLength(canonicalBody) > 512);

    const oversized = await post(address, transport.client, canonicalBody);
    assert.equal(oversized.status, 413);
    assert.equal(store.snapshot().transfer_count, 0);

    await abortPartial(address, transport.client, canonicalBody);
    assert.equal(store.snapshot().transfer_count, 0);

    const slow = await slowPartial(address, transport.client, canonicalBody);
    assert.ok(slow.status === 408 || slow.status === null);
    assert.equal(store.snapshot().transfer_count, 0);
  } finally {
    await server.close();
  }
});

test('actual socket concurrency pressure returns 429 before a second receiver invocation', async () => {
  const root = keys();
  const transport = await transportFixture();
  let enter;
  let release;
  const entered = new Promise(resolve => { enter = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  let receiverCalls = 0;
  const fakeStore = {
    async receiveTransfer() {
      receiverCalls += 1;
      enter();
      await gate;
      return {
        status: 'received',
        transfer_digest: 'a'.repeat(64),
        transfer_receipt: null,
        source_equivocation_evidence: null,
        observation_status: 'pending-observation'
      };
    }
  };
  const certificateDigest = transportCertificateDigest(transport.client);
  const ingress = new PublicWitnessAuthenticatedIngress({
    receiverStore: fakeStore,
    sourceBindings: [{
      certificate_sha256: certificateDigest,
      source_id: 'source-concurrency-socket',
      source_epoch: 1
    }],
    personaRoots: [{ key_id: keyId(root.publicKey), public_key: root.publicKey }],
    clock: () => Date.parse(T3),
    maxConcurrent: 1,
    perClientBurst: 16
  });
  const server = makeServer(ingress, transport.server);
  const address = await server.listen();
  const body = canonicalJson({
    transfer: { statement: { source_id: 'source-concurrency-socket', source_epoch: 1 } },
    persona_root_key_id: keyId(root.publicKey)
  });
  try {
    const firstPromise = post(address, transport.client, body);
    await entered;
    const second = await post(address, transport.client, body);
    assert.equal(second.status, 429);
    assert.match(second.payload.detail, /concurrent request capacity/);
    assert.equal(receiverCalls, 1);
    release();
    const first = await firstPromise;
    assert.equal(first.status, 202);
    assert.equal(receiverCalls, 1);
    assert.equal(ingress.snapshot().accepted_requests, 1);
    assert.equal(ingress.snapshot().rejected_requests, 1);
  } finally {
    release();
    await server.close();
  }
});
