import policyJson from '../../config/service-network-policy.json' with { type: 'json' };
import { AxiomError, ValidationError, canonicalJson, digestObject } from './canonical.mjs';

export const SERVICE_NETWORK_POLICY_SCHEMA = 'axiom-service-network-policy.v1';
const EXPECTED_POLICY_DIGEST =
  'd5d87e12fc3bfe62c948a12aa8c446e7559c7a6529189141fdae7a0152243217';
const SERVICES = Object.freeze(['gateway', 'grid', 'hypervisor', 'sandbox', 'supervisor']);
const DEPLOYABLE_SERVICES = Object.freeze(['gateway', 'grid', 'hypervisor', 'sandbox']);
const METHODS = new Set(['GET', 'POST']);
const PATH = /^\/(?:[A-Za-z0-9._~-]+|:[A-Za-z][A-Za-z0-9_~-]*)(?:\/(?:[A-Za-z0-9._~-]+|:[A-Za-z][A-Za-z0-9_~-]*))*$/;
const PARAMETER = /^:[A-Za-z][A-Za-z0-9_~-]*$/;
const SERVICE_UNIT_SOURCE_FILES = Object.freeze({
  gateway: ['mesh/src/gateway-unit.mjs', 'mesh/src/gateway/server.mjs'],
  grid: ['mesh/src/grid/server.mjs'],
  hypervisor: [
    'mesh/src/hypervisor/server.mjs',
    'mesh/src/hypervisor/intent-resolver-grid-prepare.mjs'
  ],
  sandbox: ['mesh/src/sandbox/server.mjs']
});

export const ACTIVE_SERVICE_NETWORK_POLICY = deepFreeze(
  validateServiceNetworkPolicy(policyJson).policy
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
    || policy.kernel_version !== '0.12.0-dev.4'
    || policy.default_action !== 'deny'
  ) throw new ValidationError('Service network policy version is stale');
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

  if (!Array.isArray(policy.network_segments) || policy.network_segments.length !== 4) {
    throw new ValidationError('Service network segment inventory is incomplete');
  }
  const expectedSegments = [
    ['gateway-hypervisor', ['gateway', 'hypervisor']],
    ['gateway-grid', ['gateway', 'grid']],
    ['hypervisor-grid', ['hypervisor', 'grid']],
    ['hypervisor-sandbox', ['hypervisor', 'sandbox']]
  ];
  for (let index = 0; index < expectedSegments.length; index += 1) {
    const segment = policy.network_segments[index];
    exactObject(segment, `Service network segment ${index}`, ['id', 'members']);
    if (
      segment.id !== expectedSegments[index][0]
      || canonicalJson(segment.members) !== canonicalJson(expectedSegments[index][1])
    ) throw new ValidationError(`Service network segment drifted: ${segment.id}`);
  }

  if (!Array.isArray(policy.flows) || policy.flows.length !== 10) {
    throw new ValidationError('Service network flow inventory is incomplete');
  }
  const flowIds = new Set();
  const routeKeys = new Set();
  let routeCount = 0;
  for (const flow of policy.flows) {
    exactObject(flow, `Service network flow ${flow?.id ?? 'unknown'}`, [
      'id',
      'source',
      'destination',
      'routes'
    ]);
    if (
      typeof flow.id !== 'string'
      || flowIds.has(flow.id)
      || !SERVICES.includes(flow.source)
      || !SERVICES.includes(flow.destination)
      || !Array.isArray(flow.routes)
      || !flow.routes.length
    ) throw new ValidationError(`Service network flow is invalid: ${flow?.id}`);
    flowIds.add(flow.id);
    for (const route of flow.routes) {
      exactObject(route, `Service network route ${flow.id}`, ['method', 'path']);
      if (!METHODS.has(route.method) || !validPathPattern(route.path)) {
        throw new ValidationError(`Service network route is invalid: ${flow.id}`);
      }
      const key = `${flow.source}\0${flow.destination}\0${route.method}\0${route.path}`;
      if (routeKeys.has(key)) throw new ValidationError(`Service network route is duplicated: ${flow.id}`);
      routeKeys.add(key);
      routeCount += 1;
    }
  }
  if (routeCount !== 40) throw new ValidationError('Service network route count drifted');
  const expectedFlows = [
    ['gateway-to-hypervisor', 'gateway', 'hypervisor'],
    ['gateway-to-grid', 'gateway', 'grid'],
    ['hypervisor-to-grid', 'hypervisor', 'grid'],
    ['hypervisor-to-sandbox', 'hypervisor', 'sandbox'],
    ['supervisor-to-grid-health', 'supervisor', 'grid'],
    ['supervisor-to-hypervisor-health', 'supervisor', 'hypervisor'],
    ['supervisor-to-sandbox-health', 'supervisor', 'sandbox'],
    ['grid-self-health', 'grid', 'grid'],
    ['hypervisor-self-health', 'hypervisor', 'hypervisor'],
    ['sandbox-self-health', 'sandbox', 'sandbox']
  ];
  for (const expected of expectedFlows) {
    const flow = policy.flows.find(candidate => candidate.id === expected[0]);
    if (!flow || flow.source !== expected[1] || flow.destination !== expected[2]) {
      throw new ValidationError(`Service network flow drifted: ${expected[0]}`);
    }
  }
  validateExactCurrentRoutes(policy.flows);
  const policyDigest = digestObject(policy);
  if (policyDigest !== EXPECTED_POLICY_DIGEST) {
    throw new ValidationError('Service network policy digest drifted');
  }
  return {
    valid: true,
    schema: policy.schema,
    kernel_version: policy.kernel_version,
    default_action: policy.default_action,
    routes: routeCount,
    segments: policy.network_segments.length,
    policy_digest: policyDigest,
    policy
  };
}

export function authorizeServiceRequest({
  source,
  destination,
  method,
  path,
  policy = ACTIVE_SERVICE_NETWORK_POLICY
}) {
  const result = validateServiceNetworkPolicy(policy);
  if (
    !SERVICES.includes(source)
    || !SERVICES.includes(destination)
    || typeof method !== 'string'
    || typeof path !== 'string'
  ) deny(source, destination, method, path);
  const normalizedMethod = method.toUpperCase();
  if (!METHODS.has(normalizedMethod)) deny(source, destination, normalizedMethod, path);
  for (const flow of result.policy.flows) {
    if (flow.source !== source || flow.destination !== destination) continue;
    const route = flow.routes.find(candidate => (
      candidate.method === normalizedMethod
      && matchesPathPattern(candidate.path, path)
    ));
    if (route) {
      return {
        allowed: true,
        flow_id: flow.id,
        source,
        destination,
        method: normalizedMethod,
        path,
        route_pattern: route.path,
        policy_digest: result.policy_digest
      };
    }
  }
  deny(source, destination, normalizedMethod, path);
}

export function serviceCallerAllowed({
  source,
  destination,
  policy = ACTIVE_SERVICE_NETWORK_POLICY
}) {
  const result = validateServiceNetworkPolicy(policy);
  if (!SERVICES.includes(source) || !SERVICES.includes(destination)) return false;
  return result.policy.flows.some(flow => (
    flow.source === source && flow.destination === destination
  ));
}

export function allowedTlsPeersFor(destination, policy = ACTIVE_SERVICE_NETWORK_POLICY) {
  const result = validateServiceNetworkPolicy(policy);
  if (!SERVICES.includes(destination)) throw new ValidationError('Service destination is invalid');
  return [...new Set(
    result.policy.flows
      .filter(flow => flow.destination === destination)
      .map(flow => flow.source)
      .filter(source => SERVICES.includes(source))
  )].sort();
}

export function validateServiceUnitNetworkSegmentation(compose, policy = ACTIVE_SERVICE_NETWORK_POLICY) {
  if (typeof compose !== 'string' || !compose.length) {
    throw new ValidationError('Service-unit Compose is missing');
  }
  const result = validateServiceNetworkPolicy(policy);
  const membership = parseServiceNetworks(compose);
  const rootNetworks = parseRootNetworks(compose);
  const expectedNetworks = Object.fromEntries(
    result.policy.network_segments.map(segment => [segment.id, segment])
  );
  const networkNames = Object.keys(rootNetworks).sort();
  const expectedNames = Object.keys(expectedNetworks).sort();
  if (canonicalJson(networkNames) !== canonicalJson(expectedNames)) {
    throw new ValidationError('Service-unit Compose network inventory drifted');
  }
  for (const [name, segment] of Object.entries(expectedNetworks)) {
    if (
      rootNetworks[name]?.internal !== 'true'
      || rootNetworks[name]?.driver !== 'bridge'
      || Object.keys(rootNetworks[name]).length !== 2
    ) throw new ValidationError(`Service-unit Compose network is weakened: ${name}`);
    const actualMembers = DEPLOYABLE_SERVICES
      .filter(service => membership[service].includes(name))
      .sort();
    const expectedMembers = [...segment.members].sort();
    if (canonicalJson(actualMembers) !== canonicalJson(expectedMembers)) {
      throw new ValidationError(`Service-unit Compose network membership drifted: ${name}`);
    }
  }
  for (const service of DEPLOYABLE_SERVICES) {
    const networks = membership[service];
    if (!networks.length) {
      throw new ValidationError(`Service-unit Compose service lacks an internal network: ${service}`);
    }
    for (const network of networks) {
      if (!Object.hasOwn(expectedNetworks, network)) {
        throw new ValidationError(
          `Service-unit Compose service joins an undeclared network: ${service} -> ${network}`
        );
      }
      if (!expectedNetworks[network].members.includes(service)) {
        throw new ValidationError(
          `Service-unit Compose service joins an unauthorized network: ${service} -> ${network}`
        );
      }
    }
  }
  const adjacency = new Set();
  for (const segment of Object.values(expectedNetworks)) {
    const members = segment.members;
    for (const left of members) {
      for (const right of members) {
        if (left !== right) adjacency.add(`${left}\0${right}`);
      }
    }
  }
  const crossServiceFlows = result.policy.flows.filter(flow => (
    DEPLOYABLE_SERVICES.includes(flow.source)
    && DEPLOYABLE_SERVICES.includes(flow.destination)
    && flow.source !== flow.destination
  ));
  for (const flow of crossServiceFlows) {
    if (!adjacency.has(`${flow.source}\0${flow.destination}`)) {
      throw new ValidationError(`Allowed service flow lacks network adjacency: ${flow.id}`);
    }
  }
  return {
    valid: true,
    schema: result.schema,
    segments: result.policy.network_segments.length,
    services: DEPLOYABLE_SERVICES.length,
    memberships: Object.fromEntries(
      DEPLOYABLE_SERVICES.map(service => [service, [...membership[service]].sort()])
    ),
    policy_digest: result.policy_digest
  };
}

export function validateServiceRouteImplementation({
  sources,
  policy = ACTIVE_SERVICE_NETWORK_POLICY
}) {
  if (!sources || typeof sources !== 'object' || Array.isArray(sources)) {
    throw new ValidationError('Service source inventory is invalid');
  }
  const policyResult = validateServiceNetworkPolicy(policy);
  const declaredByDestination = new Map(
    DEPLOYABLE_SERVICES.map(service => [service, new Set()])
  );
  for (const [service, paths] of Object.entries(SERVICE_UNIT_SOURCE_FILES)) {
    const declarations = [];
    for (const sourcePath of paths) {
      const source = sources[sourcePath];
      if (typeof source !== 'string' || !source.length) {
        throw new ValidationError(`Service source is missing: ${sourcePath}`);
      }
      const count = [...source.matchAll(/router\.add\(/g)].length;
      const matches = [...source.matchAll(
        /router\.add\(\s*(['"])([A-Z]+)\1\s*,\s*(['"])([^'"]+)\3/g
      )];
      if (matches.length !== count) {
        throw new ValidationError(`Service source has a non-literal router.add: ${sourcePath}`);
      }
      declarations.push(...matches.map(match => `${match[2]} ${match[4]}`));
    }
    const implemented = [...new Set(declarations)].sort();
    const expected = policyResult.policy.flows
      .filter(flow => flow.destination === service)
      .flatMap(flow => flow.routes.map(route => `${route.method} ${route.path}`))
      .sort();
    if (canonicalJson(implemented) !== canonicalJson(expected)) {
      throw new ValidationError(`Service implementation routes drifted: ${service}`);
    }
    declaredByDestination.set(service, new Set(implemented));
  }
  let implementedRoutes = 0;
  for (const [service, routes] of declaredByDestination) {
    const implemented = [...routes];
    for (const route of implemented) {
      const separator = route.indexOf(' ');
      const method = route.slice(0, separator);
      const path = route.slice(separator + 1);
      const allowed = policyResult.policy.flows.some(flow => (
        flow.destination === service
        && flow.routes.some(candidate => (
          candidate.method === method && candidate.path === path
        ))
      ));
      if (!allowed) {
        throw new ValidationError(
          `Service implementation route is not policy-authorized: ${service} ${route}`
        );
      }
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
    gatewayGrid.routes.length !== 25
    || !gatewayGrid.routes.some(route => route.path === '/internal/v1/verify-chain')
    || !gatewayGrid.routes.some(route => (
      route.method === 'GET'
      && route.path === '/internal/v1/machine-receipts/intents/:id/verify'
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
