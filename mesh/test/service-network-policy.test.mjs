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
  assert.equal(implementation.implemented_routes, 34);
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
    ['sandbox', 'grid', 'GET', '/internal/v1/status'],
    ['gateway', 'grid', 'POST', '/internal/v1/status'],
    ['gateway', 'grid', 'GET', '/internal/v1/unknown'],
    ['hypervisor', 'grid', 'GET', '/internal/v1/commit'],
    ['supervisor', 'gateway', 'GET', '/health'],
    ['unknown', 'grid', 'GET', '/internal/v1/status']
  ];
  for (const [source, destination, method, path] of denied) {
    assert.throws(
      () => authorizeServiceRequest({
        source,
        destination,
        method,
        url: `https://${destination}:8443${path}`
      }),
      error => error.code === 'service_network_policy_denied'
    );
  }
  const credentialedTarget = new URL(
    'https://grid:8443/internal/v1/status'
  );
  credentialedTarget.username = 'test-user';
  credentialedTarget.password = 'password';
  assert.throws(
    () => authorizeServiceRequest({
      source: 'gateway',
      destination: 'grid',
      method: 'GET',
      url: credentialedTarget
    }),
    error => error.code === 'service_network_policy_denied'
  );
  assert.throws(
    () => authorizeServiceRequest({
      source: 'gateway',
      destination: 'grid',
      method: 'GET',
      url: 'http://grid:8083/internal/v1/status'
    }),
    error => error.code === 'service_network_policy_denied'
  );
  assert.equal(authorizeServiceRequest({
    source: 'gateway',
    destination: 'grid',
    method: 'GET',
    url: 'http://127.0.0.1:8083/internal/v1/status'
  }).allowed, true);
  assert.throws(
    () => authorizeServiceRequest({
      source: 'gateway',
      destination: 'grid',
      method: 'GET',
      url: 'https://grid:8443/internal/v1/status#fragment'
    }),
    error => error.code === 'service_network_policy_denied'
  );
});

test('signed client rejects a forbidden edge before signing or network I/O', async () => {
  await assert.rejects(
    () => signedFetch(
      { service: 'grid' },
      'hypervisor',
      'https://hypervisor:8081/internal/v1/operations'
    ),
    error => error.code === 'service_network_policy_denied'
  );
});

test('receiving service enforces caller, method, and route policy', () => {
  const request = (method, path) => ({
    req: { method },
    url: new URL(path, 'http://untrusted-host.invalid')
  });
  assert.equal(authorizeInboundServiceRequest({
    destination: 'grid',
    transportPeer: { service: 'hypervisor' },
    ...request('POST', '/internal/v1/commit')
  }).allowed, true);
  assert.equal(authorizeInboundServiceRequest({
    destination: 'grid',
    principal: { service: 'gateway' },
    ...request('GET', '/internal/v1/events?after=1')
  }).allowed, true);

  assert.throws(
    () => authorizeInboundServiceRequest({
      destination: 'grid',
      transportPeer: { service: 'hypervisor' },
      ...request('GET', '/internal/v1/events')
    }),
    error => error.code === 'service_network_policy_denied'
  );
  assert.throws(
    () => authorizeInboundServiceRequest({
      destination: 'grid',
      principal: { service: 'gateway' },
      transportPeer: { service: 'hypervisor' },
      ...request('GET', '/internal/v1/status')
    }),
    error => error.code === 'service_network_policy_denied'
  );
  assert.throws(
    () => authorizeInboundServiceRequest({
      destination: 'grid',
      ...request('GET', '/health')
    }),
    error => error.code === 'service_network_identity_required'
  );
});

test('service network policy rejects weakening and exact-route drift', () => {
  const allowDefault = structuredClone(ACTIVE_SERVICE_NETWORK_POLICY);
  allowDefault.default_action = 'allow';
  assert.throws(
    () => validateServiceNetworkPolicy(allowDefault),
    /invalid or weakened/
  );

  const publicPort = structuredClone(ACTIVE_SERVICE_NETWORK_POLICY);
  publicPort.public_ingress.published_tcp_ports = 1;
  assert.throws(
    () => validateServiceNetworkPolicy(publicPort),
    /ingress boundary is weakened/
  );

  const sharedNetwork = structuredClone(ACTIVE_SERVICE_NETWORK_POLICY);
  sharedNetwork.network_segments[0].members.push('sandbox');
  assert.throws(
    () => validateServiceNetworkPolicy(sharedNetwork),
    /segments drifted/
  );

  const addedFlow = structuredClone(ACTIVE_SERVICE_NETWORK_POLICY);
  addedFlow.flows.push({
    id: 'sandbox-to-grid',
    source: 'sandbox',
    destination: 'grid',
    routes: [{ method: 'GET', path: '/internal/v1/status' }]
  });
  assert.throws(
    () => validateServiceNetworkPolicy(addedFlow),
    /flows are incomplete/
  );

  const widenedRoute = structuredClone(ACTIVE_SERVICE_NETWORK_POLICY);
  widenedRoute.flows[1].routes[0].path = '/internal/v1/admin';
  assert.throws(
    () => validateServiceNetworkPolicy(widenedRoute),
    /exact current-build.*allowlist drifted/i
  );

  const wildcardRoute = structuredClone(ACTIVE_SERVICE_NETWORK_POLICY);
  wildcardRoute.flows[1].routes[0].path = '/internal/v1/*';
  assert.throws(
    () => validateServiceNetworkPolicy(wildcardRoute),
    /route is invalid/
  );
});

test('service network policy exactly covers implemented internal and health routes', async () => {
  const sources = await serviceSources();
  const missing = {
    ...sources,
    grid: sources.grid.replace(
      "router.add('GET', '/internal/v1/status'",
      "router.add('GET', '/internal/v1/status-unlisted'"
    )
  };
  assert.throws(
    () => validateServiceRouteImplementation({ sources: missing }),
    /policy and grid routes disagree/
  );

  const added = {
    ...sources,
    sandbox: sources.sandbox.replace(
      "router.add('GET', '/health'",
      "router.add('GET', '/internal/v1/unlisted', async () => ({}));\n\n"
        + "  router.add('GET', '/health'"
    )
  };
  assert.throws(
    () => validateServiceRouteImplementation({ sources: added }),
    /policy and sandbox routes disagree/
  );

  const nonLiteral = {
    ...sources,
    hypervisor: sources.hypervisor.replace(
      "router.add('GET', '/health'",
      "router.add('GET', healthRoute"
    )
  };
  assert.throws(
    () => validateServiceRouteImplementation({ sources: nonLiteral }),
    /non-literal or unsupported/
  );

  const doubleQuoted = {
    ...sources,
    sandbox: sources.sandbox.replace(
      "router.add('GET', '/health'",
      'router.add("GET", "/internal/v1/unlisted", async () => ({}));\n\n'
        + "  router.add('GET', '/health'"
    )
  };
  assert.throws(
    () => validateServiceRouteImplementation({ sources: doubleQuoted }),
    /policy and sandbox routes disagree/
  );
});

test('Compose segmentation rejects shared, missing, external, and published networks', async () => {
  const compose = await readFile(join(MESH_ROOT, 'compose.units.yml'), 'utf8');

  assert.throws(
    () => validateComposeNetworkSegmentation(
      compose.replace(
        '    networks:\n      - hypervisor-sandbox\n    healthcheck:',
        '    networks:\n      - hypervisor-sandbox\n      - gateway-grid\n    healthcheck:'
      )
    ),
    /membership drifted/
  );
  assert.throws(
    () => validateComposeNetworkSegmentation(
      compose.replace(
        '      - gateway-hypervisor\n      - gateway-grid',
        '      - gateway-hypervisor'
      )
    ),
    /membership drifted/
  );
  assert.throws(
    () => validateComposeNetworkSegmentation(
      compose.replace('    internal: true', '    internal: false')
    ),
    /not internal/
  );
  assert.throws(
    () => validateComposeNetworkSegmentation(
      compose.replace(
        '    networks:\n      - hypervisor-sandbox',
        '    ports:\n      - "8082:8082"\n    networks:\n      - hypervisor-sandbox'
      )
    ),
    /forbidden network boundary/
  );
  assert.throws(
    () => validateComposeNetworkSegmentation(
      compose.replace(
        '  stop_grace_period: 15s',
        '  networks:\n    - gateway-grid\n  stop_grace_period: 15s'
      )
    ),
    /inherits an unreviewed network/
  );
  assert.throws(
    () => validateComposeNetworkSegmentation(
      compose.replace(
        '    driver: bridge',
        '    driver: bridge\n    external: true'
      )
    ),
    /not internal/
  );
  assert.throws(
    () => validateComposeNetworkSegmentation(
      compose.replace(
        '\nnetworks:',
        '\n  gateway:\n    networks:\n      - gateway-grid\n\nnetworks:'
      )
    ),
    /service is declared more than once/
  );
  assert.throws(
    () => validateComposeNetworkSegmentation(
      compose.replace(
        '\nsecrets:',
        '\n  gateway-grid:\n    internal: true\n    driver: bridge\n\nsecrets:'
      )
    ),
    /network is declared more than once/
  );
});

test('forbidden-edge probe succeeds only when connection is denied', async t => {
  const server = net.createServer(socket => socket.end());
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => {
    if (server.listening) server.close();
  });
  const port = server.address().port;

  await assert.rejects(
    () => verifyConnectionDenied({
      host: 'localhost',
      port,
      timeoutMs: 1_000
    }),
    /Forbidden service network edge connected/
  );
  await new Promise(resolve => server.close(resolve));
  const denied = await verifyConnectionDenied({
    host: 'localhost',
    port,
    timeoutMs: 1_000
  });
  assert.equal(denied.denied, true);
  assert.equal(denied.outcome, 'rejected');

  await assert.rejects(
    () => verifyConnectionDenied({
      host: '127.0.0.1',
      port,
      timeoutMs: 1_000
    }),
    /input is invalid/
  );
});

async function serviceSources() {
  const [grid, hypervisor, sandbox] = await Promise.all([
    readFile(join(MESH_ROOT, 'src', 'grid', 'server.mjs'), 'utf8'),
    readFile(join(MESH_ROOT, 'src', 'hypervisor', 'server.mjs'), 'utf8'),
    readFile(join(MESH_ROOT, 'src', 'sandbox', 'server.mjs'), 'utf8')
  ]);
  return { grid, hypervisor, sandbox };
}
