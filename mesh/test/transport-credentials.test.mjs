import assert from 'node:assert/strict';
import https from 'node:https';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { closeTransportPools, signedFetch, transportPoolStats } from '../src/lib/client.mjs';
import { canonicalJson } from '../src/lib/canonical.mjs';
import {
  ReplayGuard,
  ensureMeshIdentity,
  verifySignedRequest
} from '../src/lib/identity.mjs';
import {
  close,
  createServiceServer,
  listen,
  Router
} from '../src/lib/http.mjs';
import {
  loadTransportRuntime,
  provisionTransportCredentials,
  rollbackTransportCredentials,
  rotateTransportCredentials,
  transportServerOptions,
  validateTransportCredentials
} from '../src/lib/transport-credentials.mjs';
import { provisionProduction } from '../src/provision-production.mjs';
import {
  runTransportDrill,
  verifyTransportDrillEvidence
} from '../src/transport-drill.mjs';

test('transport provisioning emits exact private Ed25519 identities and rejects drift', async t => {
  const root = await mkdtemp(join(tmpdir(), 'axiom-transport-provision-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const now = new Date('2026-07-29T05:00:00.000Z');
  const first = await provisionTransportCredentials({
    secretDir: root,
    now
  });
  const second = await provisionTransportCredentials({
    secretDir: root,
    now
  });
  assert.equal(first.valid, true);
  assert.equal(first.generation, 1);
  assert.equal(first.ca_fingerprint_sha256.length, 64);
  assert.deepEqual(Object.keys(first.services).sort(), [
    'gateway',
    'grid',
    'hypervisor',
    'sandbox',
    'supervisor'
  ]);
  assert.deepEqual(second.services, first.services);
  assert.equal(
    first.services.gateway.spiffe_id,
    'spiffe://axiom-mesh/service/gateway'
  );

  const manifest = JSON.parse(await readFile(first.manifest_file, 'utf8'));
  manifest.active_peers.gateway = '0'.repeat(64);
  await writeFile(first.manifest_file, `${canonicalJson(manifest)}\n`);
  await assert.rejects(
    () => validateTransportCredentials({ secretDir: root, now }),
    /active-peer registry/
  );
});

test('mutual TLS binds the active certificate peer to the signed service caller', async t => {
  const root = await mkdtemp(join(tmpdir(), 'axiom-transport-peer-'));
  const provisioned = await provisionProduction({
    dataDir: join(root, 'data'),
    secretDir: join(root, 'secrets')
  });
  t.after(() => rm(root, { recursive: true, force: true }));

  const gatewayIdentity = await ensureMeshIdentity(
    provisioned.data_dir,
    'gateway',
    { create: false }
  );
  gatewayIdentity.transport = await loadTransportRuntime({
    transportDir: provisioned.transport.transport_dir,
    service: 'gateway'
  });
  const active = await startAuthenticatedTestService({
    dataDir: provisioned.data_dir,
    transportDir: provisioned.transport.transport_dir,
    certificateService: 'hypervisor',
    audience: 'hypervisor',
    allowedCallers: ['gateway']
  });
  t.after(() => close(active.server));

  const accepted = await signedFetch(
    gatewayIdentity,
    'hypervisor',
    `${active.origin}/internal/v1/operations`
  );
  assert.equal(accepted.caller, 'gateway');
  assert.equal(accepted.protocol, 'TLSv1.3');

  const supervisorTransport = await loadTransportRuntime({
    transportDir: provisioned.transport.transport_dir,
    service: 'supervisor'
  });
  gatewayIdentity.transport = {
    ...supervisorTransport,
    service: 'gateway'
  };
  await assert.rejects(
    () => signedFetch(
      gatewayIdentity,
      'hypervisor',
      `${active.origin}/internal/v1/operations`
    ),
    error => (
      error.code === 'invalid_transport_peer'
      && error.status === 401
    )
  );

  await assert.rejects(
    () => unauthenticatedTlsGet({
      url: `${active.origin}/health`,
      ca: supervisorTransport.ca,
      servername: 'hypervisor.service.axiom-mesh.internal'
    }),
    /certificate|required|alert/i
  );

  gatewayIdentity.transport = await loadTransportRuntime({
    transportDir: provisioned.transport.transport_dir,
    service: 'gateway'
  });
  const wrongServer = await startAuthenticatedTestService({
    dataDir: provisioned.data_dir,
    transportDir: provisioned.transport.transport_dir,
    certificateService: 'sandbox',
    audience: 'hypervisor',
    allowedCallers: ['gateway']
  });
  t.after(() => close(wrongServer.server));
  await assert.rejects(
    () => signedFetch(
      gatewayIdentity,
      'hypervisor',
      `${wrongServer.origin}/internal/v1/operations`
    ),
    /not cert's CN|not in the cert's altnames|active peer identity/i
  );
});

test('offline rotation rejects retired leaf certificates and supports exact rollback', async t => {
  const root = await mkdtemp(join(tmpdir(), 'axiom-transport-rotation-'));
  const provisioned = await provisionProduction({
    dataDir: join(root, 'data'),
    secretDir: join(root, 'secrets')
  });
  t.after(() => rm(root, { recursive: true, force: true }));
  const applicationIdentity = await ensureMeshIdentity(
    provisioned.data_dir,
    'gateway',
    { create: false }
  );
  const retiredGateway = await loadTransportRuntime({
    transportDir: provisioned.transport.transport_dir,
    service: 'gateway'
  });
  const rotation = await rotateTransportCredentials({
    secretDir: provisioned.secret_dir
  });
  assert.equal(rotation.status, 'rotated');
  assert.deepEqual(rotation.generation, { before: 1, after: 2 });
  assert.doesNotMatch(JSON.stringify(rotation), /PRIVATE KEY|\\.key\\.pem/i);

  const server = await startAuthenticatedTestService({
    dataDir: provisioned.data_dir,
    transportDir: provisioned.transport.transport_dir,
    certificateService: 'hypervisor',
    audience: 'hypervisor',
    allowedCallers: ['gateway']
  });
  t.after(() => close(server.server));

  const activeGateway = await loadTransportRuntime({
    transportDir: provisioned.transport.transport_dir,
    service: 'gateway'
  });
  applicationIdentity.transport = {
    ...retiredGateway,
    peers: activeGateway.peers
  };
  assert.equal(
    await tlsGet({
      url: `${server.origin}/health`,
      ca: activeGateway.ca,
      cert: retiredGateway.cert,
      key: retiredGateway.key,
      servername: 'hypervisor.service.axiom-mesh.internal'
    }),
    401
  );
  await assert.rejects(
    () => signedFetch(
      applicationIdentity,
      'hypervisor',
      `${server.origin}/internal/v1/operations`
    ),
    error => error.code === 'invalid_transport_peer'
  );
  applicationIdentity.transport = activeGateway;
  assert.equal(
    (
      await signedFetch(
        applicationIdentity,
        'hypervisor',
        `${server.origin}/internal/v1/operations`
      )
    ).caller,
    'gateway'
  );

  await close(server.server);
  const rollback = await rollbackTransportCredentials({
    secretDir: provisioned.secret_dir
  });
  assert.equal(rollback.status, 'rolled_back');
  assert.deepEqual(rollback.generation, { before: 2, after: 1 });
  const restored = await validateTransportCredentials({
    secretDir: provisioned.secret_dir
  });
  assert.equal(
    restored.services.gateway.fingerprint_sha256,
    retiredGateway.fingerprint
  );
  await assert.rejects(
    () => validateTransportCredentials({
      secretDir: provisioned.secret_dir,
      now: new Date(
        new Date(restored.services.gateway.valid_to).getTime() + 1
      )
    }),
    /expired or too close/
  );
});

test('transport drill signs secret-free rotation and runtime evidence', async t => {
  const root = await mkdtemp(join(tmpdir(), 'axiom-transport-drill-'));
  const workspace = join(root, 'workspace');
  t.after(() => rm(root, {
    recursive: true,
    force: true,
    maxRetries: process.platform === 'win32' ? 5 : 0,
    retryDelay: 100
  }));
  const evidence = await runTransportDrill({
    workspaceDir: workspace,
    sourceRevision: 'd'.repeat(40),
    generatedAt: '2026-07-29T06:00:00.000Z'
  });
  assert.equal(verifyTransportDrillEvidence(evidence).valid, true);
  assert.equal(evidence.rotation.retired_rejection_code, 'invalid_transport_peer');
  assert.ok(Object.values(evidence.checks).every(Boolean));
  assert.doesNotMatch(
    JSON.stringify(evidence),
    /PRIVATE KEY|operator\.token|transport-forward|transport-previous/i
  );
  const tampered = structuredClone(evidence);
  tampered.rotation.exact_rollback = false;
  assert.throws(
    () => verifyTransportDrillEvidence(tampered),
    /metadata or checks/
  );
});

async function startAuthenticatedTestService({
  dataDir,
  transportDir,
  certificateService,
  audience,
  allowedCallers
}) {
  const transport = await loadTransportRuntime({
    transportDir,
    service: certificateService
  });
  const router = new Router();
  const replayGuard = new ReplayGuard();
  router.add('GET', '/health', async () => ({
    service: certificateService,
    status: 'live'
  }), { auth: false });
  router.add('GET', '/internal/v1/operations', async ({ req, principal }) => ({
    caller: principal.service,
    protocol: req.socket.getProtocol()
  }));
  const server = createServiceServer({
    name: certificateService,
    router,
    tls: transportServerOptions(transport),
    transportPeers: transport.peers,
    allowedTransportPeers: [...allowedCallers, 'supervisor'],
    authenticate: ({ req, body }) => verifySignedRequest({
      req,
      body,
      audience,
      dataDir,
      allowedCallers,
      replayGuard,
      transportPeers: transport.peers
    })
  });
  const address = await listen(server, { host: '127.0.0.1', port: 0 });
  return {
    server,
    origin: `https://127.0.0.1:${address.port}`
  };
}

function unauthenticatedTlsGet({ url, ca, servername }) {
  return tlsGet({ url, ca, servername });
}

function tlsGet({ url, ca, cert, key, servername }) {
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const request = https.get({
      hostname: target.hostname,
      port: target.port,
      path: target.pathname,
      ca,
      ...(cert ? { cert } : {}),
      ...(key ? { key } : {}),
      servername,
      rejectUnauthorized: true,
      minVersion: 'TLSv1.3',
      maxVersion: 'TLSv1.3',
      agent: false
    }, response => {
      response.resume();
      response.once('end', () => resolve(response.statusCode));
    });
    request.once('error', reject);
  });
}

test('warm internal calls reuse one authenticated connection; a new credential generation never does', async t => {
  const root = await mkdtemp(join(tmpdir(), 'axiom-transport-pool-'));
  const provisioned = await provisionProduction({
    dataDir: join(root, 'data'),
    secretDir: join(root, 'secrets')
  });
  t.after(() => rm(root, { recursive: true, force: true }));
  const gatewayIdentity = await ensureMeshIdentity(provisioned.data_dir, 'gateway', { create: false });
  const gatewayTransport = await loadTransportRuntime({
    transportDir: provisioned.transport.transport_dir,
    service: 'gateway'
  });
  gatewayIdentity.transport = gatewayTransport;
  const active = await startAuthenticatedTestService({
    dataDir: provisioned.data_dir,
    transportDir: provisioned.transport.transport_dir,
    certificateService: 'hypervisor',
    audience: 'hypervisor',
    allowedCallers: ['gateway']
  });
  t.after(() => close(active.server));
  t.after(() => closeTransportPools());
  closeTransportPools();

  const url = `${active.origin}/internal/v1/operations`;
  const start = transportPoolStats();
  for (let index = 0; index < 5; index += 1) {
    assert.equal((await signedFetch(gatewayIdentity, 'hypervisor', url)).caller, 'gateway');
  }
  const warm = transportPoolStats();
  assert.equal(warm.connections - start.connections, 1, 'one handshake for five calls');
  assert.equal(warm.reused - start.reused, 4);

  // Another certificate for the same caller name is a new generation: it
  // gets its own connection, and the server still refuses it.
  const supervisorTransport = await loadTransportRuntime({
    transportDir: provisioned.transport.transport_dir,
    service: 'supervisor'
  });
  gatewayIdentity.transport = { ...supervisorTransport, service: 'gateway' };
  await assert.rejects(
    () => signedFetch(gatewayIdentity, 'hypervisor', url),
    error => error.code === 'invalid_transport_peer'
  );
  const swapped = transportPoolStats();
  assert.equal(swapped.connections - warm.connections, 1);
  assert.equal(swapped.drained_pools - warm.drained_pools, 1);

  gatewayIdentity.transport = gatewayTransport;
  assert.equal((await signedFetch(gatewayIdentity, 'hypervisor', url)).caller, 'gateway');
  assert.equal(transportPoolStats().connections - swapped.connections, 1, 'no socket crosses generations');

  // Rotating the audience's pinned certificate is also a new generation. A
  // warm socket would skip the handshake, so it must not be reused: the call
  // opens a new connection and the old pin's check refuses the server.
  const warmAgain = transportPoolStats();
  gatewayIdentity.transport = {
    ...gatewayTransport,
    peers: { ...gatewayTransport.peers, hypervisor: 'ab'.repeat(32) }
  };
  await assert.rejects(
    () => signedFetch(gatewayIdentity, 'hypervisor', url),
    /not the active peer identity/
  );
  const repinned = transportPoolStats();
  assert.equal(repinned.connections - warmAgain.connections, 1, 'a new pin never reuses a socket');
  assert.equal(repinned.drained_pools - warmAgain.drained_pools, 1);
});
