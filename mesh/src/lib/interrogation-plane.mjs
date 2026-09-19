import { digestObject, ValidationError } from './canonical.mjs';

export const INTERROGATION_PLANE_SCHEMA = 'axiom-interrogation-plane.v0';
export const AUTHORITY_SEQUENCE = Object.freeze([
  'gateway',
  'hypervisor',
  'sandbox',
  'grid'
]);

export function buildInterrogationPlane({
  capabilityRegistry,
  evidenceBindings,
  serviceNetworkPolicy,
  verification
}) {
  requireRecord(capabilityRegistry, 'capabilityRegistry');
  requireRecord(evidenceBindings, 'evidenceBindings');
  requireRecord(serviceNetworkPolicy, 'serviceNetworkPolicy');

  const registryDigest = digestObject(capabilityRegistry);
  if (evidenceBindings.registry_digest !== registryDigest) {
    throw new ValidationError(
      'Interrogation Plane evidence bindings must match the exact capability registry digest'
    );
  }
  if (evidenceBindings.kernel_version !== capabilityRegistry.kernel_version) {
    throw new ValidationError(
      'Interrogation Plane evidence bindings kernel_version must match the capability registry'
    );
  }
  if (serviceNetworkPolicy.kernel_version !== capabilityRegistry.kernel_version) {
    throw new ValidationError(
      'Interrogation Plane service-network kernel_version must match the capability registry'
    );
  }
  if (serviceNetworkPolicy.default_action !== 'deny') {
    throw new ValidationError(
      'Interrogation Plane refuses a service-network policy that is not default-deny'
    );
  }

  const capabilities = requireArray(capabilityRegistry.capabilities, 'capabilityRegistry.capabilities');
  const bindings = requireArray(evidenceBindings.bindings, 'evidenceBindings.bindings');
  const flows = requireArray(serviceNetworkPolicy.flows, 'serviceNetworkPolicy.flows');
  const verificationState = normalizeVerification(verification);

  const bindingByCapability = new Map();
  for (const binding of bindings) {
    requireRecord(binding, 'evidence binding');
    const capabilityId = requireString(binding.capability_id, 'evidence binding capability_id');
    if (bindingByCapability.has(capabilityId)) {
      throw new ValidationError(
        `Interrogation Plane found duplicate evidence binding for ${capabilityId}`
      );
    }
    bindingByCapability.set(capabilityId, binding);
  }

  const nodes = [];
  const edges = [];
  const attention = [];

  for (const service of collectServices(serviceNetworkPolicy)) {
    nodes.push({
      id: `service:${service}`,
      kind: 'service',
      service
    });
  }

  for (let index = 0; index < AUTHORITY_SEQUENCE.length; index += 1) {
    const stage = AUTHORITY_SEQUENCE[index];
    nodes.push({
      id: `authority-stage:${stage}`,
      kind: 'authority_stage',
      stage,
      sequence: index
    });
    if (index > 0) {
      const previous = AUTHORITY_SEQUENCE[index - 1];
      edges.push({
        id: `authority:${previous}->${stage}`,
        kind: 'authority_sequence',
        source: `authority-stage:${previous}`,
        destination: `authority-stage:${stage}`,
        conceptual: true,
        network_edge: false
      });
    }
  }

  for (const flow of flows) {
    requireRecord(flow, 'service network flow');
    const source = requireString(flow.source, 'service network flow source');
    const destination = requireString(flow.destination, 'service network flow destination');
    const routes = requireArray(flow.routes, 'service network flow routes')
      .map(route => ({
        method: requireString(route.method, 'service network route method'),
        path: requireString(route.path, 'service network route path')
      }))
      .sort((left, right) => (
        left.method.localeCompare(right.method)
        || left.path.localeCompare(right.path)
      ));
    edges.push({
      id: `network:${requireString(flow.id, 'service network flow id')}`,
      kind: 'network_flow',
      source: `service:${source}`,
      destination: `service:${destination}`,
      conceptual: false,
      network_edge: true,
      route_count: routes.length,
      routes
    });
  }

  const evidenceFiles = new Set();
  for (const capability of [...capabilities].sort((left, right) => left.id.localeCompare(right.id))) {
    requireRecord(capability, 'capability');
    const capabilityId = requireString(capability.id, 'capability id');
    const status = requireString(capability.status, `capability ${capabilityId} status`);
    const evidence = Array.isArray(capability.evidence)
      ? [...capability.evidence].sort()
      : [];
    const binding = bindingByCapability.get(capabilityId);

    if (status === 'implemented' && !binding) {
      throw new ValidationError(
        `Interrogation Plane refuses implemented capability without exact evidence binding: ${capabilityId}`
      );
    }
    if (status === 'experimental' && !binding) {
      attention.push({
        kind: 'experimental_without_exact_binding',
        capability_id: capabilityId
      });
    }

    nodes.push({
      id: `capability:${capabilityId}`,
      kind: 'capability',
      capability_id: capabilityId,
      family: requireString(capability.family, `capability ${capabilityId} family`),
      status,
      summary: requireString(capability.summary, `capability ${capabilityId} summary`),
      evidence_count: evidence.length,
      exact_binding: Boolean(binding)
    });

    for (const path of evidence) {
      requireString(path, `capability ${capabilityId} evidence path`);
      evidenceFiles.add(path);
      edges.push({
        id: `capability-evidence:${capabilityId}:${path}`,
        kind: 'capability_evidence',
        source: `capability:${capabilityId}`,
        destination: `evidence:${path}`
      });
    }

    if (binding) {
      const bindingId = `binding:${capabilityId}`;
      nodes.push({
        id: bindingId,
        kind: 'evidence_binding',
        capability_id: capabilityId,
        path: binding.path,
        test: binding.test,
        assertion_count: requireArray(
          binding.assertions,
          `evidence binding assertions for ${capabilityId}`
        ).length
      });
      edges.push({
        id: `capability-binding:${capabilityId}`,
        kind: 'capability_binding',
        source: `capability:${capabilityId}`,
        destination: bindingId
      });
      edges.push({
        id: `binding-evidence:${capabilityId}`,
        kind: 'binding_evidence',
        source: bindingId,
        destination: `evidence:${binding.path}`
      });
      evidenceFiles.add(binding.path);
    }
  }

  for (const path of [...evidenceFiles].sort()) {
    nodes.push({
      id: `evidence:${path}`,
      kind: 'evidence_file',
      path
    });
  }

  nodes.sort((left, right) => left.id.localeCompare(right.id));
  edges.sort((left, right) => left.id.localeCompare(right.id));
  attention.sort((left, right) => (
    left.kind.localeCompare(right.kind)
    || left.capability_id.localeCompare(right.capability_id)
  ));

  const report = {
    schema: INTERROGATION_PLANE_SCHEMA,
    kernel_version: capabilityRegistry.kernel_version,
    posture: {
      mode: 'read_only',
      execution_authority: 'none',
      discovery_is_authorization: false,
      semantic_judgments: 'advisory_only_not_loaded'
    },
    source_digests: {
      capability_registry: registryDigest,
      evidence_bindings: digestObject(evidenceBindings),
      service_network_policy: digestObject(serviceNetworkPolicy)
    },
    verification: verificationState,
    summary: {
      capabilities: capabilities.length,
      implemented_capabilities: capabilities.filter(item => item.status === 'implemented').length,
      exact_evidence_bindings: bindings.length,
      evidence_files: evidenceFiles.size,
      network_flows: flows.length,
      network_routes: flows.reduce((total, flow) => total + flow.routes.length, 0),
      attention_items: attention.length
    },
    authority: {
      sequence: [...AUTHORITY_SEQUENCE],
      note: 'Conceptual authority sequence. It is not a claim that every adjacent stage is a direct network edge.'
    },
    network: {
      default_action: serviceNetworkPolicy.default_action,
      public_ingress: serviceNetworkPolicy.public_ingress
    },
    attention,
    nodes,
    edges
  };

  return deepFreeze({
    ...report,
    report_digest: digestObject(report)
  });
}

function normalizeVerification(verification) {
  requireRecord(verification, 'verification');
  const expected = ['registry', 'evidence_bindings', 'service_network', 'documentation'];
  const output = {};
  for (const key of expected) {
    const value = verification[key];
    requireRecord(value, `verification.${key}`);
    if (value.valid !== true) {
      throw new ValidationError(
        `Interrogation Plane requires valid deterministic verification: ${key}`
      );
    }
    output[key] = sortRecord(value);
  }
  return output;
}

function collectServices(policy) {
  const services = new Set();
  if (policy.public_ingress?.service) services.add(policy.public_ingress.service);
  for (const segment of policy.network_segments ?? []) {
    for (const member of segment.members ?? []) services.add(member);
  }
  for (const flow of policy.flows ?? []) {
    if (flow.source) services.add(flow.source);
    if (flow.destination) services.add(flow.destination);
  }
  return [...services].sort();
}

function sortRecord(value) {
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
  );
}

function requireRecord(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${name} must be an object`);
  }
  return value;
}

function requireArray(value, name) {
  if (!Array.isArray(value)) {
    throw new ValidationError(`${name} must be an array`);
  }
  return value;
}

function requireString(value, name) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ValidationError(`${name} must be a non-empty string`);
  }
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
