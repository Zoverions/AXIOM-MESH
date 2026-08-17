import assert from 'node:assert/strict';
import { createPublicKey, generateKeyPairSync, X509Certificate } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
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
  PublicWitnessIngressLifecycleController,
  createPublicWitnessIngressControl,
  loadPublicWitnessIngressControl,
  validatePublicWitnessIngressControl,
  validatePublicWitnessIngressControlTransition
} from '../src/lib/public-witness-ingress-control.mjs';
import {
  createPublicWitnessIngressTrustBundle
} from '../src/lib/public-witness-ingress-trust.mjs';
import { certificateSha256 } from '../src/lib/public-witness-live-ingress.mjs';
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
    persona_id: 'persona-ingress-control',
    controller_actor_id: 'actor-private-ingress-control',
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
    publication_id: 'ingress-control-publication',
    content: { media_type: 'text/plain', text: 'Listener control must be explicit and fail closed.' },
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
    sourceId: 'source-ingress-control',
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
    transferId: 'ingress-control-transfer-1',
    createdAt: T2,
    expiresAt: TEND,
    now: Date.parse(T2)
  });
  return { root, source, witness, admission, transfer };
}

async function receiver(data) {
  const dir = await mkdtemp(join(tmpdir(), 'axiom-ingress-control-receiver-'));
  const store = await openPublicWitnessReceiverStore({
    statePath: join(dir, 'receiver.jsonl'),
    domainId: DOMAIN,
    witnessId: 'witness-ingress-control',
    witnessPrivateKey: data.witness.privateKey
  });
  await store.admitSource(data.admission, { admittedAt: T0 });
  return store;
}

async function transportFixture() {
  const secretDir = await mkdtemp(join(tmpdir(), 'axiom-ingress-control-transport-'));
  const status = await provisionTransportCredentials({ secretDir });
  return {
    secretDir,
    status,
    server: await loadTransportRuntime({ transportDir: status.transport_dir, service: 'grid' }),
    client: await loadTransportRuntime({ transportDir: status.transport_dir, service: 'gateway' })
  };
}

function certificateDigest(runtime) {
  return certificateSha256(new X509Certificate(runtime.cert).raw);
}

function trustBundle(data, client, { generation = 1, previousBundle = null, activatedAt = T0 } = {}) {
  return createPublicWitnessIngressTrustBundle({
    domainId: DOMAIN,
    generation,
    previousBundle,
    activatedAt,
    sources: [{ certificate_sha256: certificateDigest(client), admission: data.admission }],
    personaRoots: [{ key_id: keyId(data.root.publicKey), public_key: data.root.publicKey }]
  });
}

function requestBody(data) {
  return canonicalJson({
    transfer: data.transfer,
    persona_root_key_id: keyId(data.root.publicKey)
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
        resolve({
          status: response.statusCode,
          payload: JSON.parse(Buffer.concat(chunks).toString('utf8'))
        });
      });
    });
    request.setTimeout(5000, () => request.destroy(new Error('client timeout')));
    request.on('error', reject);
    request.end(body);
  });
}

function controller(store, transport, clockRef) {
  return new PublicWitnessIngressLifecycleController({
    receiverStore: store,
    tlsKey: transport.server.key,
    tlsCertificate: transport.server.cert,
    clientCa: transport.server.ca,
    host: '127.0.0.1',
    port: 0,
    clock: () => clockRef.value
  });
}

test('control artifacts are content-addressed, predecessor chained, and disabled state cannot retain trust', () => {
  const disabled = createPublicWitnessIngressControl({
    domainId: DOMAIN,
    effectiveAt: T0,
    ingressState: 'disabled'
  });
  assert.equal(validatePublicWitnessIngressControl(disabled).control_digest, disabled.control_digest);
  assert.equal(disabled.trust_bundle_digest, null);
  assert.equal(disabled.source_admission_effect, 'none');
  assert.equal(disabled.persona_root_trust_effect, 'none');
  assert.equal(disabled.finality_claimed, false);

  const next = createPublicWitnessIngressControl({
    domainId: DOMAIN,
    generation: 2,
    previousControl: disabled,
    effectiveAt: T1,
    ingressState: 'disabled'
  });
  validatePublicWitnessIngressControlTransition(disabled, next);
  const tampered = structuredClone(next);
  tampered.previous_control_digest = 'f'.repeat(64);
  assert.throws(() => validatePublicWitnessIngressControl(tampered), /digest mismatch/);
  assert.throws(
    () => createPublicWitnessIngressControl({
      domainId: DOMAIN,
      generation: 2,
      previousControl: disabled,
      effectiveAt: T0,
      ingressState: 'disabled'
    }),
    /effective time must advance/
  );
});

test('lifecycle can begin disabled, enable exact trust, disable the listener, and re-enable historical replay', async () => {
  const data = fixture();
  const store = await receiver(data);
  const transport = await transportFixture();
  const bundle = trustBundle(data, transport.client);
  const clockRef = { value: Date.parse(T4) };
  const lifecycle = controller(store, transport, clockRef);
  const disabled1 = createPublicWitnessIngressControl({
    domainId: DOMAIN,
    effectiveAt: T0,
    ingressState: 'disabled'
  });
  const enabled2 = createPublicWitnessIngressControl({
    domainId: DOMAIN,
    generation: 2,
    previousControl: disabled1,
    effectiveAt: T1,
    ingressState: 'enabled',
    trustBundle: bundle
  });
  const disabled3 = createPublicWitnessIngressControl({
    domainId: DOMAIN,
    generation: 3,
    previousControl: enabled2,
    effectiveAt: T2,
    ingressState: 'disabled'
  });
  const enabled4 = createPublicWitnessIngressControl({
    domainId: DOMAIN,
    generation: 4,
    previousControl: disabled3,
    effectiveAt: T3,
    ingressState: 'enabled',
    trustBundle: bundle
  });

  const first = await lifecycle.apply({ control: disabled1 });
  assert.equal(first.configured_ingress_state, 'disabled');
  assert.equal(first.listening, false);
  assert.equal(store.snapshot().transfer_count, 0);

  const active = await lifecycle.apply({
    control: enabled2,
    previousControl: disabled1,
    trustBundle: bundle
  });
  assert.equal(active.configured_ingress_state, 'enabled');
  assert.equal(active.listening, true);
  const oldAddress = active.listen_address;
  const received = await post(oldAddress, transport.client, requestBody(data));
  assert.equal(received.status, 202);
  assert.equal(received.payload.status, 'received');
  assert.equal(store.snapshot().transfer_count, 1);

  const stopped = await lifecycle.apply({
    control: disabled3,
    previousControl: enabled2
  });
  assert.equal(stopped.configured_ingress_state, 'disabled');
  assert.equal(stopped.listening, false);
  assert.equal(stopped.network_effect, 'none');
  await assert.rejects(() => post(oldAddress, transport.client, requestBody(data)));
  assert.equal(store.snapshot().transfer_count, 1);

  const restarted = await lifecycle.apply({
    control: enabled4,
    previousControl: disabled3,
    trustBundle: bundle
  });
  const replay = await post(restarted.listen_address, transport.client, requestBody(data));
  assert.equal(replay.status, 200);
  assert.equal(replay.payload.status, 'replay');
  assert.equal(store.snapshot().transfer_count, 1);
  await lifecycle.close();
});

test('invalid or future enabled transition is preflighted without closing the active listener', async () => {
  const data = fixture();
  const store = await receiver(data);
  const transport = await transportFixture();
  const firstBundle = trustBundle(data, transport.client);
  const clockRef = { value: Date.parse(T2) };
  const lifecycle = controller(store, transport, clockRef);
  const disabled1 = createPublicWitnessIngressControl({
    domainId: DOMAIN,
    effectiveAt: T0,
    ingressState: 'disabled'
  });
  const enabled2 = createPublicWitnessIngressControl({
    domainId: DOMAIN,
    generation: 2,
    previousControl: disabled1,
    effectiveAt: T1,
    ingressState: 'enabled',
    trustBundle: firstBundle
  });
  await lifecycle.apply({ control: disabled1 });
  const active = await lifecycle.apply({
    control: enabled2,
    previousControl: disabled1,
    trustBundle: firstBundle
  });
  const address = active.listen_address;

  const wrongClient = await transportFixture();
  const otherBundle = trustBundle(data, wrongClient.client, {
    generation: 2,
    previousBundle: firstBundle,
    activatedAt: T2
  });
  const wrongDigestControl = createPublicWitnessIngressControl({
    domainId: DOMAIN,
    generation: 3,
    previousControl: enabled2,
    effectiveAt: T2,
    ingressState: 'enabled',
    trustBundle: otherBundle
  });
  await assert.rejects(
    () => lifecycle.apply({
      control: wrongDigestControl,
      previousControl: enabled2,
      trustBundle: firstBundle
    }),
    /does not bind the supplied trust bundle/
  );
  assert.equal(lifecycle.snapshot().listening, true);
  const stillAccepted = await post(address, transport.client, requestBody(data));
  assert.equal(stillAccepted.status, 202);

  const futureControl = createPublicWitnessIngressControl({
    domainId: DOMAIN,
    generation: 3,
    previousControl: enabled2,
    effectiveAt: T3,
    ingressState: 'disabled'
  });
  await assert.rejects(
    () => lifecycle.apply({ control: futureControl, previousControl: enabled2 }),
    /not effective yet/
  );
  assert.equal(lifecycle.snapshot().listening, true);
  const replay = await post(address, transport.client, requestBody(data));
  assert.equal(replay.status, 200);
  await lifecycle.close();
});

test('live trust rotation replaces certificate binding while keeping W2c2 source authority unchanged', async () => {
  const data = fixture();
  const store = await receiver(data);
  const transport = await transportFixture();
  const retiredClient = transport.client;
  const bundle1 = trustBundle(data, retiredClient, { activatedAt: T0 });
  const clockRef = { value: Date.parse(T4) };
  const lifecycle = controller(store, transport, clockRef);
  const disabled1 = createPublicWitnessIngressControl({
    domainId: DOMAIN,
    effectiveAt: T0,
    ingressState: 'disabled'
  });
  const enabled2 = createPublicWitnessIngressControl({
    domainId: DOMAIN,
    generation: 2,
    previousControl: disabled1,
    effectiveAt: T1,
    ingressState: 'enabled',
    trustBundle: bundle1
  });
  await lifecycle.apply({ control: disabled1 });
  const active1 = await lifecycle.apply({
    control: enabled2,
    previousControl: disabled1,
    trustBundle: bundle1
  });
  const first = await post(active1.listen_address, retiredClient, requestBody(data));
  assert.equal(first.status, 202);

  await rotateTransportCredentials({ secretDir: transport.secretDir });
  const activeClient = await loadTransportRuntime({
    transportDir: transport.status.transport_dir,
    service: 'gateway'
  });
  assert.notEqual(certificateDigest(retiredClient), certificateDigest(activeClient));
  const bundle2 = trustBundle(data, activeClient, {
    generation: 2,
    previousBundle: bundle1,
    activatedAt: T2
  });
  const enabled3 = createPublicWitnessIngressControl({
    domainId: DOMAIN,
    generation: 3,
    previousControl: enabled2,
    effectiveAt: T3,
    ingressState: 'enabled',
    trustBundle: bundle2
  });
  const active2 = await lifecycle.apply({
    control: enabled3,
    previousControl: enabled2,
    trustBundle: bundle2,
    previousTrustBundle: bundle1
  });
  const oldCert = await post(active2.listen_address, retiredClient, requestBody(data));
  assert.equal(oldCert.status, 403);
  assert.match(oldCert.payload.detail, /transport identity is not bound/);
  const newCert = await post(active2.listen_address, activeClient, requestBody(data));
  assert.equal(newCert.status, 200);
  assert.equal(newCert.payload.status, 'replay');
  assert.equal(store.snapshot().source_count, 1);
  assert.equal(store.snapshot().transfer_count, 1);
  await lifecycle.close();
});

test('control file loader is bounded and rejects non-files', async () => {
  const control = createPublicWitnessIngressControl({
    domainId: DOMAIN,
    effectiveAt: T0,
    ingressState: 'disabled'
  });
  const dir = await mkdtemp(join(tmpdir(), 'axiom-ingress-control-file-'));
  const path = join(dir, 'control.json');
  await writeFile(path, JSON.stringify(control, null, 2), 'utf8');
  const loaded = await loadPublicWitnessIngressControl(path);
  assert.equal(loaded.control_digest, control.control_digest);
  await assert.rejects(
    () => loadPublicWitnessIngressControl(path, { maxFileBytes: 32 }),
    /exceeds configured bounds/
  );
  await assert.rejects(
    () => loadPublicWitnessIngressControl(dir),
    /regular non-symlink file/
  );
});
