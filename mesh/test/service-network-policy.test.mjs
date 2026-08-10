import assert from 'node:assert/strict';
import net from 'node:net';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { signedFetch } from '../src/lib/client.mjs';
import {
  ACTIVE_SERVICE_NETWORK_POLICY,
  allowedInboundTransportPeers,
  authorizeInboundServiceRequest,
  authorizeServiceRequest,
  validateComposeNetworkSegmentation,
  validateServiceNetworkPolicy,
  validateServiceRouteImplementation
} from '../src/lib/service-network-policy.mjs';
import { verifyConnectionDenied } from '../src/network-policy-probe.mjs';

const MESH_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

test('current service network policy is exact, default-deny, and segmented', async () => {
  const result = validateServiceNetworkPolicy(
    ACTIVE_SERVICE_NETWORK_POLICY
  );
  assert.equal(result.valid, true);
  assert.equal(result.schema, 'axiom-service-network-policy.v1');
  assert.equal(result.kernel_version, '0.12.0-dev.3');
  assert.equal(result.default_action, 'deny');
  assert.equal(result.segments, 4);
  assert.equal(result.flows, 10);
  assert.equal(result.routes, 39);
  assert.match(result.policy_digest, /^[a-f0-9]{64}$/);

  assert.deepEqual(
    allowedInboundTransportPeers('grid'),
    ['gateway', 'grid', 'hypervisor', 'supervisor']
  );
  assert.deepEqual(
    allowedInboundTransportPeers('hypervisor'),
    ['gateway', 'hypervisor', 'supervisor']
  );
  assert.deepEqual(
    allowedInboundTransportPeers('sandbox'),
    ['hypervisor', 'sandbox', 'supervisor']
  );
  assert.throws(
    () => allowedInboundTransportPeers('gateway'),
    /destination is invalid/
  );

  const compose = await readFile(join(MESH_ROOT, 'compose.units.yml'), 'utf8');
  const segmentation = validateComposeNetworkSegmentation(compose);
  assert.equal(segmentation.valid, true);
  assert.equal(segmentation.services, 4);
  assert.match(segmentation.compose_sha256, /^[a-f0-9]{64}$/);

  const sources = await serviceSources();
  const implementation = validateServiceRouteImplementation({ sources });
  assert.equal(implementation.valid, true);
  assert.equal(implementation.destinations, 3);
  assert.equal(implementation.implemented_routes, 35);
});

test('service request policy allows only exact caller, destination, method, and route', () => {
  const allowed = [
    ['gateway', 'hypervisor', 'GET', '/internal/v1/operations'],
    ['gateway', 'hypervisor', 'POST', '/internal/v1/intents'],
    ['gateway', 'grid', 'GET', '/internal/v1/events?after=1'],
    ['gateway', 'grid', 'GET', '/internal/v1/intents/intent_123'],
    [
      'gateway',
      'grid',
      'GET',
      `/internal/v1/sync/person/bundles/${'a'.repeat(64)}`
    ],
    ['hypervisor', 'grid', 'GET', '/internal/v1/approval/approval_1'],
    ['hypervisor', 'grid', 'POST', '/internal/v1/commit'],
    ['hypervisor', 'sandbox', 'GET', '/internal/v1/operations'],
    ['hypervisor', 'sandbox', 'POST', '/internal/v1/execute'],
    ['supervisor', 'grid', 'GET', '/health'],
    ['grid', 'grid', 'GET', '/health'],
    ['sandbox', 'sandbox', 'GET', '/health']
  ];
  for (const [source, destination, method, path] of allowed) {
    const result = authorizeServiceRequest({
      source,
      destination,
      method,
      url: `https://${destination}:8443${path}`
    });
    assert.equal(result.allowed, true);
    assert.equal(result.source, source);
    assert.equal(result.destination, destination);
    assert.equal(result.method, method);
  }

  const denied = [
    ['gateway', 'sandbox', 'GET', '/internal/v1/operations'],
    ['grid', 'hypervisor', 'GET', '/internal/v1/operations'],
    ['sandbox', 'grid', 'GET', '/internal/v1/events'],
    ['hypervisor', 'grid', 'POST', '/internal/v1/intents'],
    ['gateway', 'hypervisor', 'GET', '/internal/v1/intents'],
    ['gateway', 'hypervisor', 'POST', '/internal/v1/operations'],
    ['gateway', 'grid', 'GET', '/internal/v1/unknown']
  ];
  for (const [source, destination, method, path] of denied) {
    assert.throws(
      () => authorizeServiceRequest({
        source,
        destination,
        method,
        url: `https://${destination}:8443${path}`
      }),
      error => error.code === 'service_network_policy_denied' && error.status === 403
    );
  }
});

test('signed client rejects a forbidden edge before signing or network I/O', async () => {
  let requests = 0;
  const identity = {
    id: 'gateway',
    sign: () => {
      throw new Error('request should fail before signing');
    }
  };
  await assert.rejects(
    () => signedFetch(
      identity,
      'sandbox',
      'https://sandbox:8443/internal/v1/execute',
      {
        method: 'POST',
        body: { intent_id: 'intent_1' },
        request: async () => {
          requests += 1;
          return new Response();
        }
      }
    ),
    error => error.code === 'service_network_policy_denied'
  );
  assert.equal(requests, 0);
});

test('receiving service enforces caller, method, and route policy', () => {
  const principal = { service: 'gateway' };
  const allowed = authorizeInboundServiceRequest({
    destination: 'grid',
    req: { method: 'GET' },
    url: new URL('https://grid.internal/internal/v1/events?after=1'),
    principal
  });
  assert.equal(allowed.allowed, true);

  assert.throws(
    () => authorizeInboundServiceRequest({
      destination: 'sandbox',
      req: { method: 'GET' },
      url: new URL('https://sandbox.internal/internal/v1/operations'),
      principal
    }),
    error => error.code === 'service_network_policy_denied' && error.status === 403
  );
});

test('service network policy rejects weakening and exact-route drift', () => {
  const base = structuredClone(ACTIVE_SERVICE_NETWORK_POLICY);
  base.default_action = 'allow';
  assert.throws(() => validateServiceNetworkPolicy(base), /weakened/);

  const extra = structuredClone(ACTIVE_SERVICE_NETWORK_POLICY);
  extra.flows[0].routes.push({ method: 'GET', path: '/internal/v1/extra' });
  assert.throws(() => validateServiceNetworkPolicy(extra), /drifted/);
});

test('service network policy exactly covers implemented internal and health routes', async () => {
  const result = validateServiceRouteImplementation({
    sources: await serviceSources()
  });
  assert.equal(result.valid, true);
  assert.equal(result.destinations, 3);
  assert.equal(result.policy_digest, validateServiceNetworkPolicy(ACTIVE_SERVICE_NETWORK_POLICY).policy_digest);
});

test('Compose segmentation rejects shared, missing, external, and published networks', async () => {
  const compose = await readFile(join(MESH_ROOT, 'compose.units.yml'), 'utf8');
  assert.equal(validateComposeNetworkSegmentation(compose).valid, true);
  assert.throws(
    () => validateComposeNetworkSegmentation(
      compose.replace('internal: true', 'internal: false')
    ),
    /not internal/
  );
  assert.throws(
    () => validateComposeNetworkSegmentation(
      compose.replace('    - gateway-hypervisor\n', '')
    ),
    /membership drifted/
  );
  assert.throws(
    () => validateComposeNetworkSegmentation(
      compose.replace('services:\n', 'services:\n  shared:\n    image: busybox\n    networks:\n      - gateway-hypervisor\n')
    ),
    /Unexpected service-unit Compose service/
  );
  assert.throws(
    () => validateComposeNetworkSegmentation(
      compose.replace('    read_only: true\n', '    read_only: true\n    ports:\n      - "8080:8080"\n')
    ),
    /forbidden network boundary/
  );
});

test('forbidden-edge probe succeeds only when connection is denied', async t => {
  const blockedServer = net.createServer(socket => socket.end());
  blockedServer.listen(0, '127.0.0.1');
  await once(blockedServer, 'listening');
  t.after(() => blockedServer.close());
  const address = blockedServer.address();
  const blocked = await verifyConnectionDenied({
    host: '203.0.113.1',
    port: address.port,
    timeoutMs: 50
  });
  assert.equal(blocked.denied, true);

  const reachable = await verifyConnectionDenied({
    host: '127.0.0.1',
    port: address.port,
    timeoutMs: 500
  });
  assert.equal(reachable.denied, false);
});

async function serviceSources() {
  const [grid, hypervisor, sandbox] = await Promise.all([
    readFile(join(MESH_ROOT, 'src', 'grid', 'server.mjs'), 'utf8'),
    readFile(join(MESH_ROOT, 'src', 'hypervisor', 'server.mjs'), 'utf8'),
    readFile(join(MESH_ROOT, 'src', 'sandbox', 'server.mjs'), 'utf8')
  ]);
  return { grid, hypervisor, sandbox };
}
