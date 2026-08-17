import assert from 'node:assert/strict';
import { createPublicKey, generateKeyPairSync, X509Certificate } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { request as httpsRequest } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  PublicWitnessIngressLifecycleController,
  createPublicWitnessIngressControl,
  validatePublicWitnessIngressControlChain
} from '../src/lib/public-witness-ingress-control.mjs';
import { createPublicWitnessIngressTrustBundle } from '../src/lib/public-witness-ingress-trust.mjs';
import { certificateSha256 } from '../src/lib/public-witness-live-ingress.mjs';
import { openPublicWitnessReceiverStore } from '../src/lib/public-witness-receiver-store.mjs';
import { createPublicWitnessSourceAdmission } from '../src/lib/public-witness-transfer.mjs';
import { loadTransportRuntime, provisionTransportCredentials } from '../src/lib/transport-credentials.mjs';
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

async function transportFixture() {
  const secretDir = await mkdtemp(join(tmpdir(), 'axiom-ingress-control-restore-transport-'));
  const status = await provisionTransportCredentials({ secretDir });
  return {
    server: await loadTransportRuntime({ transportDir: status.transport_dir, service: 'grid' }),
    client: await loadTransportRuntime({ transportDir: status.transport_dir, service: 'gateway' })
  };
}

function certificateDigest(runtime) {
  return certificateSha256(new X509Certificate(runtime.cert).raw);
}

async function fixture() {
  const source = keys();
  const witness = keys();
  const root = keys();
  const admission = createPublicWitnessSourceAdmission({
    domainId: DOMAIN,
    sourceId: 'source-control-restore',
    sourcePublicKey: source.publicKey,
    sourceEpoch: 1,
    validFrom: T0,
    expiresAt: TEND
  });
  const dir = await mkdtemp(join(tmpdir(), 'axiom-ingress-control-restore-receiver-'));
  const store = await openPublicWitnessReceiverStore({
    statePath: join(dir, 'receiver.jsonl'),
    domainId: DOMAIN,
    witnessId: 'witness-control-restore',
    witnessPrivateKey: witness.privateKey
  });
  await store.admitSource(admission, { admittedAt: T0 });
  const transport = await transportFixture();
  const bundle = createPublicWitnessIngressTrustBundle({
    domainId: DOMAIN,
    generation: 1,
    activatedAt: T0,
    sources: [{ certificate_sha256: certificateDigest(transport.client), admission }],
    personaRoots: [{ key_id: keyId(root.publicKey), public_key: root.publicKey }]
  });
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
    effectiveAt: T3,
    ingressState: 'disabled'
  });
  return { store, transport, bundle, disabled1, enabled2, disabled3 };
}

function controller(data, now) {
  return new PublicWitnessIngressLifecycleController({
    receiverStore: data.store,
    tlsKey: data.transport.server.key,
    tlsCertificate: data.transport.server.cert,
    clientCa: data.transport.server.ca,
    host: '127.0.0.1',
    port: 0,
    clock: () => Date.parse(now)
  });
}

async function postNotFound(address, client) {
  const body = canonicalJson({ ping: true });
  return new Promise((resolve, reject) => {
    const request = httpsRequest({
      host: '127.0.0.1',
      port: address.port,
      path: '/not-a-transfer-route',
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
      response.resume();
      response.on('end', () => resolve(response.statusCode));
    });
    request.on('error', reject);
    request.end(body);
  });
}

test('restart restore selects only the latest effective control without replaying historical listeners', async () => {
  const data = await fixture();
  const history = [data.disabled1, data.enabled2, data.disabled3];
  assert.equal(validatePublicWitnessIngressControlChain(history).length, 3);

  const beforeFutureDisable = controller(data, T2);
  const active = await beforeFutureDisable.restore({
    controls: history,
    trustBundle: data.bundle
  });
  assert.equal(active.control_generation, 2);
  assert.equal(active.configured_ingress_state, 'enabled');
  assert.equal(active.listening, true);
  assert.equal(await postNotFound(active.listen_address, data.transport.client), 404);
  assert.equal(data.store.snapshot().transfer_count, 0);
  await beforeFutureDisable.close();

  const afterDisable = controller(data, T4);
  const disabled = await afterDisable.restore({ controls: history });
  assert.equal(disabled.control_generation, 3);
  assert.equal(disabled.configured_ingress_state, 'disabled');
  assert.equal(disabled.listening, false);
  assert.equal(data.store.snapshot().transfer_count, 0);
});

test('wrong-domain disabled control cannot poison a fresh controller', async () => {
  const data = await fixture();
  const lifecycle = controller(data, T4);
  const wrong = createPublicWitnessIngressControl({
    domainId: 'other.public.domain',
    effectiveAt: T0,
    ingressState: 'disabled'
  });
  await assert.rejects(
    () => lifecycle.apply({ control: wrong }),
    /different receiver domain/
  );
  assert.equal(lifecycle.snapshot().configured_ingress_state, 'unconfigured');
  assert.equal(lifecycle.snapshot().listening, false);
});

test('enabled control cannot claim an effective time before its trust bundle activates', async () => {
  const data = await fixture();
  const laterBundle = createPublicWitnessIngressTrustBundle({
    domainId: DOMAIN,
    generation: 1,
    activatedAt: T2,
    sources: data.bundle.sources,
    personaRoots: data.bundle.persona_roots
  });
  assert.throws(
    () => createPublicWitnessIngressControl({
      domainId: DOMAIN,
      effectiveAt: T1,
      ingressState: 'enabled',
      trustBundle: laterBundle
    }),
    /cannot enable before its trust bundle activates/
  );
});

test('control history rejects missing generations and restart with no effective genesis', async () => {
  const data = await fixture();
  const skipped = structuredClone(data.disabled3);
  skipped.generation = 4;
  assert.throws(
    () => validatePublicWitnessIngressControlChain([data.disabled1, data.enabled2, skipped]),
    /digest mismatch|advance exactly one generation/
  );

  const futureGenesis = createPublicWitnessIngressControl({
    domainId: DOMAIN,
    effectiveAt: T4,
    ingressState: 'disabled'
  });
  const lifecycle = controller(data, T2);
  await assert.rejects(
    () => lifecycle.restore({ controls: [futureGenesis] }),
    /no effective control yet/
  );
  assert.equal(lifecycle.snapshot().configured_ingress_state, 'unconfigured');
  assert.equal(lifecycle.snapshot().listening, false);
});
