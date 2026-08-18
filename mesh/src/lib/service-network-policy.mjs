import { readFileSync } from 'node:fs';
import { canonicalJson, digestObject, AxiomError, ValidationError } from './canonical.mjs';

export const SERVICE_NETWORK_POLICY_SCHEMA =
  'axiom-service-network-policy.v1';

const SERVICES = Object.freeze([
  'gateway',
  'grid',
  'hypervisor',
  'sandbox',
  'supervisor'
]);
const DEPLOYABLE_SERVICES = Object.freeze(SERVICES.slice(0, 4));
const METHODS = new Set(['GET', 'POST']);
const IDENTIFIER = /^[a-z][a-z0-9-]{0,63}$/;
const PATH = /^\/[A-Za-z0-9._~!$&'()+,;=:@%/-]+$/;
const PARAMETER = /^:[a-z][a-z0-9_]{0,63}$/;
const EXPECTED_SEGMENTS = Object.freeze([
  {
    id: 'gateway-hypervisor',
    members: ['gateway', 'hypervisor']
  },
  {
    id: 'gateway-grid',
    members: ['gateway', 'grid']
  },
  {
    id: 'hypervisor-grid',
    members: ['hypervisor', 'grid']
  },
  {
    id: 'hypervisor-sandbox',
    members: ['hypervisor', 'sandbox']
  }
]);
const EXPECTED_FLOW_IDS = Object.freeze([
  'gateway-to-hypervisor',
  'gateway-to-grid',
  'hypervisor-to-grid',
  'hypervisor-to-sandbox',
  'supervisor-to-grid-health',
  'supervisor-to-hypervisor-health',
  'supervisor-to-sandbox-health',
  'grid-self-health',
  'hypervisor-self-health',
  'sandbox-self-health'
]);
const EXPECTED_POLICY_DIGEST =
  '7b655a6792b71a45e17d50e83d72c7e7c27cf60c05dfacf68b9e7a4e40dc76cb';

export const ACTIVE_SERVICE_NETWORK_POLICY = deepFreeze(
  validateServiceNetworkPolicy(JSON.parse(readFileSync(
    new URL('../../config/service-network-policy.json', import.meta.url),
    'utf8'
  ))).policy
);

export function validateServiceNetworkPolicy(policy) {
  exactObject(policy, 'Service network policy', [
    'schema',
    'version',
    'kernel_version',
    'default_action',
    'public_ingress',
    'network_segments',
    'flows'
  ]);
  if (
    policy.schema !== SERVICE_NETWORK_POLICY_SCHEMA
    || policy.version !== 1
    || policy.kernel_version !== '0.12.0-dev.3'
    || policy.default_action !== 'deny'
  ) throw new ValidationError('Service network policy identity is invalid or weakened');

  exactObject(policy.public_ingress, 'Service network public ingress', [
    'service',
    'channel',
    'container_bind',
    'published_tcp_ports'
  ]);
  if (
    policy.public_ingress.service !== 'gateway'
    || policy.public_ingress.channel !== 'unix_domain_socket'
    || policy.public_ingress.container_bind !== '127.0.0.1'
    || policy.public_ingress.published_tcp_ports !== 0
  ) throw new ValidationError('Service network public ingress boundary is weakened');

  if (
    !Array.isArray(policy.network_segments)
    || canonicalJson(policy.network_segments) !== canonicalJson(EXPECTED_SEGMENTS)
  ) throw new ValidationError('Service network segments drifted');
  for (const segment of policy.network_segments) {
    exactObject(segment, `Service network segment ${segment?.id ?? 'unknown'}`, [
      'id',
      'members'
    ]);
    if (
      !IDENTIFIER.test(segment.id)
      || !Array.isArray(segment.members)
      || segment.members.length !== 2
      || segment.members.some(service => !DEPLOYABLE_SERVICES.includes(service))
      || new Set(segment.members).size !== segment.members.length
    ) throw new ValidationError(`Service network segment is invalid: ${segment?.id}`);
  }

  if (
    !Array.isArray(policy.flows)
    || policy.flows.length !== EXPECTED_FLOW_IDS.length
  ) throw new ValidationError('Service network flows are incomplete');
  const flowIds = [];
  const routeKeys = new Set();
  for (const flow of policy.flows) {
    exactObject(flow, `Service network flow ${flow?.id ?? 'unknown'}`, [
      'id',
      'source',
      'destination',
      'routes'
    ]);
    if (
      !IDENTIFIER.test(flow.id)
      || !SERVICES.includes(flow.source)
      || !DEPLOYABLE_SERVICES.includes(flow.destination)
      || flow.destination === 'gateway'
      || !Array.isArray(flow.routes)
      || !flow.routes.length
    ) throw new ValidationError(`Service network flow is invalid: ${flow?.id}`);
    flowIds.push(flow.id);
    for (const route of flow.routes) {
      exactObject(route, `Service network route ${flow.id}`, ['method', 'path']);
      if (
        !METHODS.has(route.method)
        || !validPathPattern(route.path)
      ) throw new ValidationError(`Service network route is invalid: ${flow.id}`);
      const key = `${flow.source}\n${flow.destination}\n${route.method}\n${route.path}`;
      if (routeKeys.has(key)) {
        throw new ValidationError(`Service network route is duplicated: ${flow.id}`);
      }
      routeKeys.add(key);
    }
  }
  if (canonicalJson(flowIds) !== canonicalJson(EXPECTED_FLOW_IDS)) {
    throw new ValidationError('Service network flow order or identity drifted');
  }
  validateExactCurrentRoutes(policy.flows);
  const policyDigest = digestObject(policy);
  if (policyDigest !== EXPECTED_POLICY_DIGEST) {
    throw new ValidationError('Exact current-build service network allowlist drifted');
  }

  return {
    valid: true,
    schema: policy.schema,
    kernel_version: policy.kernel_version,
    default_action: policy.default_action,
    segments: policy.network_segments.length,
    flows: policy.flows.length,
    routes: routeKeys.size,
    policy_digest: policyDigest,
    policy
  };
}

export function authorizeServiceRequest({
  policy = ACTIVE_SERVICE_NETWORK_POLICY,
  source,
  destination,
  method = 'GET',
  url
}) {
  validateServiceNetworkPolicy(policy);
  const normalizedMethod = String(method).toUpperCase();
  let target;
  try {
    target = new URL(url);
  } catch {
    return deny(source, destination, normalizedMethod, '[invalid]');
  }
  if (
    !SERVICES.includes(source)
    || !DEPLOYABLE_SERVICES.includes(destination)
    || source === 'supervisor' && destination === 'gateway'
    || !['http:', 'https:'].includes(target.protocol)
    || target.username
    || target.password
    || target.hash
    || (
      target.protocol === 'http:'
      && !['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)
    )
  ) return deny(source, destination, normalizedMethod, target.pathname);

  const allowed = policy.flows.some(flow => (
    flow.source === source
    && flow.destination === destination
    && flow.routes.some(route => (
      route.method === normalizedMethod
      && matchesPathPattern(route.path, target.pathname)
    ))
  ));
  if (!allowed) {
    return deny(source, destination, normalizedMethod, target.pathname);
  }
  return {
    allowed: true,
    source,
    destination,
    method: normalizedMethod,
    path: target.pathname,
    policy_digest: digestObject(policy)
  };
}

export function allowedInboundTransportPeers(
  destination,
  policy = ACTIVE_SERVICE_NETWORK_POLICY
) {
  validateServiceNetworkPolicy(policy);
  if (!DEPLOYABLE_SERVICES.includes(destination) || destination === 'gateway') {
    throw new ValidationError('Inbound transport destination is invalid');
  }
  const callers = new Set(policy.flows
    .filter(flow => flow.destination === destination)
    .map(flow => flow.source));
  return SERVICES.filter(service => callers.has(service));
}

export function authorizeInboundServiceRequest({
  policy = ACTIVE_SERVICE_NETWORK_POLICY,
  destination,
  req,
  url,
  principal,
  transportPeer
}) {
  const signedCaller = principal?.service;
  const transportCaller = transportPeer?.service;
  if (
    signedCaller
    && transportCaller
    && signedCaller !== transportCaller
  ) return deny(signedCaller, destination, req?.method, url?.pathname ?? '[invalid]');
  const source = signedCaller ?? transportCaller;
  if (!source) {
    throw new AxiomError(
      'service_network_identity_required',
      'Internal service network authorization requires a caller identity',
      401
    );
  }
  let target;
  try {
    target = new URL(
      `${url.pathname}${url.search}`,
      `https://${destination}.internal`
    );
  } catch {
    target = 'invalid';
  }
  return authorizeServiceRequest({
    policy,
    source,
    destination,
    method: req?.method,
    url: target
  });
}

export function validateComposeNetworkSegmentation(
  compose,
  policy = ACTIVE_SERVICE_NETWORK_POLICY
) {
  const policyResult = validateServiceNetworkPolicy(policy);
  if (typeof compose !== 'string' || !compose.trim()) {
    throw new ValidationError('Service-unit Compose policy is missing');
  }
  if (
    /^\s+ports\s*:/m.test(compose)
    || /^\s+network_mode\s*:/m.test(compose)
  ) throw new ValidationError('Service-unit Compose exposes a forbidden network boundary');
  const servicesOffset = compose.search(/^services:\s*$/m);
  if (
    servicesOffset < 0
    || /^  networks\s*:/m.test(compose.slice(0, servicesOffset))
  ) throw new ValidationError('Service-unit Compose inherits an unreviewed network');

  const actualMembership = parseServiceNetworks(compose);
  const expectedMembership = Object.fromEntries(
    DEPLOYABLE_SERVICES.map(service => [
      service,
      policy.network_segments
        .filter(segment => segment.members.includes(service))
        .map(segment => segment.id)
    ])
  );
  if (canonicalJson(actualMembership) !== canonicalJson(expectedMembership)) {
    throw new ValidationError('Service-unit Compose network membership drifted');
  }

  const rootNetworks = parseRootNetworks(compose);
  const expectedNetworkIds = policy.network_segments.map(segment => segment.id);
  if (canonicalJson(Object.keys(rootNetworks)) !== canonicalJson(expectedNetworkIds)) {
    throw new ValidationError('Service-unit Compose network inventory drifted');
  }
  for (const [network, settings] of Object.entries(rootNetworks)) {
    if (
      canonicalJson(Object.keys(settings).sort())
        !== canonicalJson(['driver', 'internal'])
      || settings.internal !== 'true'
      || settings.driver !== 'bridge'
    ) throw new ValidationError(`Service-unit Compose network is not internal: ${network}`);
  }
  return {
    ...policyResult,
    services: DEPLOYABLE_SERVICES.length,
    compose_sha256: digestObject({
      membership: actualMembership,
      networks: rootNetworks
    })
  };
}

export function validateServiceRouteImplementation({
  policy = ACTIVE_SERVICE_NETWORK_POLICY,
  sources
}) {
  const policyResult = validateServiceNetworkPolicy(policy);
  exactObject(sources, 'Service network route sources', [
    'grid',
    'hypervisor',
    'sandbox'
  ]);
  let implementedRoutes = 0;
  for (const destination of ['grid', 'hypervisor', 'sandbox']) {
    if (typeof sources[destination] !== 'string') {
      throw new ValidationError(
        `Service network route source is missing: ${destination}`
      );
    }
    const routeDeclarations = [
      ...sources[destination].matchAll(/router\.add\(/g)
    ].length;
    const routeMatches = [...sources[destination].matchAll(
      /router\.add\(\s*(['"])([A-Z]+)\1\s*,\s*(['"])([^'"]+)\3/g
    )];
    if (routeMatches.length !== routeDeclarations) {
      throw new ValidationError(
        `${destination} contains a non-literal or unsupported router.add declaration`
      );
    }
    const implemented = routeMatches
      .map(match => `${match[2]} ${match[4]}`)
      .sort();
    const allowed = [...new Set(policy.flows
      .filter(flow => flow.destination === destination)
      .flatMap(flow => flow.routes.map(route => `${route.method} ${route.path}`))
    )].sort();
    if (canonicalJson(implemented) !== canonicalJson(allowed)) {
      throw new ValidationError(
        `Service network policy and ${destination} routes disagree`
      );
    }
    implementedRoutes += implemented.length;
  }
  return {
    valid: true,
    schema: policyResult.schema,
    destinations: 3,
    implemented_routes: implementedRoutes,
    policy_digest: policyResult.policy_digest
  };
}

function validateExactCurrentRoutes(flows) {
  const gatewayGrid = flows.find(flow => flow.id === 'gateway-to-grid');
  if (
    gatewayGrid.routes.length !== 26
    || !gatewayGrid.routes.some(route => route.path === '/internal/v1/verify-chain')
    || !gatewayGrid.routes.some(route => (
      route.method === 'GET'
      && route.path === '/internal/v1/machine-receipts/intents/:id/verify'
    ))
    || !gatewayGrid.routes.some(route => (
      route.method === 'GET'
      && route.path === '/internal/v1/social/remote-review/:owner'
    ))
  ) throw new ValidationError('Gateway-to-Grid route allowlist drifted');
  const required = {
    'gateway-to-hypervisor': [
      'GET /internal/v1/operations',
      'POST /internal/v1/machine-discovery',
      'POST /internal/v1/intents'
    ],
    'hypervisor-to-grid': [
      'GET /internal/v1/status',
      'GET /internal/v1/policy-overlays',
      'GET /internal/v1/approval/:id',
      'POST /internal/v1/capabilities/consume',
      'POST /internal/v1/commit'
    ],
    'hypervisor-to-sandbox': [
      'GET /internal/v1/operations',
      'POST /internal/v1/execute'
    ]
  };
  for (const [id, routes] of Object.entries(required)) {
    const flow = flows.find(item => item.id === id);
    const actual = flow?.routes.map(route => `${route.method} ${route.path}`);
    if (canonicalJson(actual) !== canonicalJson(routes)) {
      throw new ValidationError(`Service network application routes drifted: ${id}`);
    }
  }
  for (const flow of flows.filter(item => item.id.endsWith('-health'))) {
    if (
      canonicalJson(flow.routes)
      !== canonicalJson([{ method: 'GET', path: '/health' }])
    ) throw new ValidationError(`Service network health route drifted: ${flow.id}`);
  }
}

function matchesPathPattern(pattern, path) {
  const patternParts = pattern.split('/');
  const pathParts = path.split('/');
  if (patternParts.length !== pathParts.length) return false;
  return patternParts.every((part, index) => (
    part.startsWith(':')
      ? pathParts[index].length > 0
      : part === pathParts[index]
  ));
}

function validPathPattern(pattern) {
  if (!PATH.test(pattern) || pattern.includes('//')) return false;
  return pattern.split('/').every(part => (
    !part.startsWith(':') || PARAMETER.test(part)
  ));
}

function deny(source, destination, method, path) {
  throw new AxiomError(
    'service_network_policy_denied',
    'Internal service request is not allowed by the current network policy',
    403,
    {
      source: typeof source === 'string' ? source : 'invalid',
      destination: typeof destination === 'string' ? destination : 'invalid',
      method,
      path
    }
  );
}

function parseServiceNetworks(compose) {
  const membership = Object.fromEntries(
    DEPLOYABLE_SERVICES.map(service => [service, []])
  );
  const lines = compose.replace(/\r/g, '').split('\n');
  const seenServices = new Set();
  let inServices = false;
  let service = null;
  let inNetworks = false;
  for (const line of lines) {
    if (line === 'services:') {
      inServices = true;
      continue;
    }
    if (inServices && /^[a-z]/.test(line)) break;
    const serviceMatch = line.match(/^  ([a-z][a-z0-9-]*):$/);
    if (inServices && serviceMatch) {
      if (
        DEPLOYABLE_SERVICES.includes(serviceMatch[1])
        && seenServices.has(serviceMatch[1])
      ) {
        throw new ValidationError(
          `Service-unit Compose service is declared more than once: ${serviceMatch[1]}`
        );
      }
      seenServices.add(serviceMatch[1]);
      service = DEPLOYABLE_SERVICES.includes(serviceMatch[1])
        ? serviceMatch[1]
        : null;
      inNetworks = false;
      continue;
    }
    if (service && line === '    networks:') {
      inNetworks = true;
      continue;
    }
    if (inNetworks) {
      const item = line.match(/^      - ([a-z][a-z0-9-]*)$/);
      if (item) {
        membership[service].push(item[1]);
        continue;
      }
      if (/^      \S/.test(line)) {
        throw new ValidationError(
          `Service-unit Compose network syntax is invalid: ${service}`
        );
      }
      if (!/^\s*$/.test(line)) inNetworks = false;
    }
  }
  return membership;
}

function parseRootNetworks(compose) {
  const lines = compose.replace(/\r/g, '').split('\n');
  const start = lines.findIndex(line => line === 'networks:');
  if (start < 0) throw new ValidationError('Service-unit Compose networks are missing');
  const networks = {};
  let current = null;
  for (const line of lines.slice(start + 1)) {
    if (/^[a-z]/.test(line)) break;
    const network = line.match(/^  ([a-z][a-z0-9-]*):$/);
    if (network) {
      current = network[1];
      if (Object.hasOwn(networks, current)) {
        throw new ValidationError(
          `Service-unit Compose network is declared more than once: ${current}`
        );
      }
      networks[current] = {};
      continue;
    }
    const setting = line.match(/^    ([a-z][a-z0-9_-]*): (.+)$/);
    if (current && setting) {
      networks[current][setting[1]] = setting[2];
      continue;
    }
    if (current && /^    \S/.test(line)) {
      throw new ValidationError(
        `Service-unit Compose network settings are invalid: ${current}`
      );
    }
  }
  return networks;
}

function exactObject(value, name, keys) {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
    || canonicalJson(Object.keys(value).sort()) !== canonicalJson([...keys].sort())
  ) throw new ValidationError(`${name} fields are invalid`);
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
