import {
  AxiomError,
  ValidationError,
  assertPlainObject,
  assertString,
  assertStringArray,
  digestObject,
  sha256
} from './canonical.mjs';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;

export function normalizeNodeScheduleRequest(input, requester) {
  const value = assertPlainObject(input, 'node schedule request');
  const owner = assertString(requester, 'requester', {
    max: 160,
    pattern: ID
  });
  const replicas = boundedInteger(value.replicas ?? 1, 'replicas', 1, 16);
  const request = {
    format: 'axiom-node-schedule-request.v1',
    request_id: assertString(value.request_id, 'request_id', {
      max: 160,
      pattern: ID
    }),
    required_capabilities: uniqueStrings(
      value.required_capabilities,
      'required_capabilities',
      64,
      160
    ),
    required_roles: uniqueStrings(
      value.required_roles ?? [],
      'required_roles',
      32,
      128
    ),
    minimum_security_level: boundedInteger(
      value.minimum_security_level ?? 0,
      'minimum_security_level',
      0,
      3
    ),
    resources: normalizeResources(value.resources),
    replicas,
    lease_seconds: boundedInteger(
      value.lease_seconds ?? 300,
      'lease_seconds',
      5,
      3_600
    ),
    excluded_node_ids: uniqueStrings(
      value.excluded_node_ids ?? [],
      'excluded_node_ids',
      128,
      160,
      ID
    ),
    distinct_failure_domains: booleanValue(
      value.distinct_failure_domains ?? false,
      'distinct_failure_domains'
    ),
    max_per_owner: boundedInteger(
      value.max_per_owner ?? replicas,
      'max_per_owner',
      1,
      replicas
    )
  };
  if (!request.required_capabilities.length) {
    throw new ValidationError(
      'required_capabilities must contain at least one capability'
    );
  }
  const requestDigest = digestObject({
    requester: owner,
    request
  });
  return {
    requester: owner,
    request,
    request_digest: requestDigest,
    schedule_id: `schedule_${requestDigest}`
  };
}

export function normalizeNodeDiscoveryQuery(input = {}) {
  const value = assertPlainObject(input, 'node discovery query');
  return {
    required_capabilities: uniqueStrings(
      value.required_capabilities ?? [],
      'required_capabilities',
      64,
      160
    ),
    required_roles: uniqueStrings(
      value.required_roles ?? [],
      'required_roles',
      32,
      128
    ),
    minimum_security_level: boundedInteger(
      value.minimum_security_level ?? 0,
      'minimum_security_level',
      0,
      3
    ),
    minimum_lease_seconds: boundedInteger(
      value.minimum_lease_seconds ?? 0,
      'minimum_lease_seconds',
      0,
      86_400
    ),
    limit: boundedInteger(value.limit ?? 100, 'limit', 1, 500)
  };
}

export function discoverAdmittedNodes(nodes, query, {
  asOf = new Date().toISOString()
} = {}) {
  const normalized = normalizeNodeDiscoveryQuery(query);
  const instant = normalizeTimestamp(asOf, 'discovery as_of');
  const leaseBoundary = new Date(
    Date.parse(instant) + normalized.minimum_lease_seconds * 1_000
  ).toISOString();
  const eligible = nodes
    .filter(node => nodeIsEligible(node, normalized, leaseBoundary))
    .sort((left, right) => (
      securityLevel(right.security_profile)
      - securityLevel(left.security_profile)
      || left.node_id.localeCompare(right.node_id)
    ))
    .slice(0, normalized.limit)
    .map(publicNode);
  return {
    schema: 'axiom-node-discovery.v1',
    as_of: instant,
    query: normalized,
    count: eligible.length,
    nodes: eligible
  };
}

export function selectNodePlacements({
  nodes,
  schedules,
  normalizedRequest,
  occurredAt
}) {
  const instant = normalizeTimestamp(occurredAt, 'schedule occurred_at');
  const { requester, request, schedule_id: scheduleId } = normalizedRequest;
  const expiresAt = new Date(
    Date.parse(instant) + request.lease_seconds * 1_000
  ).toISOString();
  const loads = activeLoads(schedules, instant);
  const excluded = new Set(request.excluded_node_ids);
  const candidates = nodes
    .filter(node => (
      !excluded.has(node.node_id)
      && nodeIsEligible(node, {
        required_capabilities: request.required_capabilities,
        required_roles: request.required_roles,
        minimum_security_level: request.minimum_security_level
      }, expiresAt)
    ))
    .map(node => candidateWithLoad(node, loads.get(node.node_id)))
    .filter(candidate => hasCapacity(candidate, request.resources));
  const selected = [];
  const domains = new Set();
  const ownerCounts = new Map();
  while (selected.length < request.replicas) {
    const pool = candidates.filter(candidate => (
      !selected.some(item => item.node.node_id === candidate.node.node_id)
      && (ownerCounts.get(candidate.node.owner) ?? 0) < request.max_per_owner
      && (
        !request.distinct_failure_domains
        || !domains.has(candidate.node.discovery.failure_domain)
      )
    ));
    if (!pool.length) break;
    pool.sort((left, right) => compareCandidates(
      left,
      right,
      scheduleId,
      domains,
      ownerCounts
    ));
    const chosen = pool[0];
    selected.push(chosen);
    domains.add(chosen.node.discovery.failure_domain);
    ownerCounts.set(
      chosen.node.owner,
      (ownerCounts.get(chosen.node.owner) ?? 0) + 1
    );
  }
  if (selected.length !== request.replicas) {
    throw new AxiomError(
      'schedule_capacity_unavailable',
      'No complete admitted-node placement satisfies the bounded request',
      503,
      {
        eligible_candidates: candidates.length,
        requested_replicas: request.replicas
      }
    );
  }
  return {
    schema: 'axiom-node-schedule.v1',
    schedule_id: scheduleId,
    requester,
    request_digest: normalizedRequest.request_digest,
    created_at: instant,
    expires_at: expiresAt,
    status: 'active',
    requirements: request,
    placements: selected.map((candidate, index) => ({
      rank: index + 1,
      node_id: candidate.node.node_id,
      owner: candidate.node.owner,
      endpoint: candidate.node.discovery.endpoint,
      failure_domain: candidate.node.discovery.failure_domain,
      security_profile: candidate.node.security_profile,
      public_key_digest: candidate.node.public_key_digest,
      allocated_resources: { ...request.resources }
    }))
  };
}

export function effectiveScheduleStatus(schedule, nodes, {
  asOf = new Date().toISOString(),
  schedules = []
} = {}) {
  const instant = normalizeTimestamp(asOf, 'schedule status as_of');
  if (schedule.status === 'revoked') return 'revoked';
  if (schedule.expires_at <= instant) return 'expired';
  const byId = new Map(nodes.map(node => [node.node_id, node]));
  const loads = activeLoads(schedules, instant);
  if (schedule.placements.some(placement => {
    const node = byId.get(placement.node_id);
    const load = loads.get(placement.node_id);
    return (
      !node
      || node.status !== 'active'
      || node.expires_at <= instant
      || !node.discovery
      || node.owner !== placement.owner
      || node.public_key_digest !== placement.public_key_digest
      || node.discovery.endpoint !== placement.endpoint
      || node.discovery.failure_domain !== placement.failure_domain
      || node.security_profile !== placement.security_profile
      || node.expires_at < schedule.expires_at
      || securityLevel(node.security_profile)
        < schedule.requirements.minimum_security_level
      || schedule.requirements.required_capabilities.some(
        capability => !node.capabilities.includes(capability)
      )
      || schedule.requirements.required_roles.some(
        role => !node.discovery.roles.includes(role)
      )
      || placement.allocated_resources.cpu_millis
        > node.discovery.resources.cpu_millis
      || placement.allocated_resources.memory_bytes
        > node.discovery.resources.memory_bytes
      || placement.allocated_resources.storage_bytes
        > node.discovery.resources.storage_bytes
      || (
        load
        && (
          load.assignments
            > node.discovery.resources.max_concurrent_assignments
          || load.cpu_millis > node.discovery.resources.cpu_millis
          || load.memory_bytes > node.discovery.resources.memory_bytes
          || load.storage_bytes > node.discovery.resources.storage_bytes
        )
      )
    );
  })) return 'degraded';
  return schedule.status === 'degraded' ? 'degraded' : 'active';
}

function activeLoads(schedules, instant) {
  const loads = new Map();
  for (const schedule of schedules) {
    if (
      !['active', 'degraded'].includes(schedule.status)
      || schedule.expires_at <= instant
    ) continue;
    for (const placement of schedule.placements) {
      const current = loads.get(placement.node_id) ?? {
        assignments: 0,
        cpu_millis: 0,
        memory_bytes: 0,
        storage_bytes: 0
      };
      current.assignments += 1;
      for (const resource of ['cpu_millis', 'memory_bytes', 'storage_bytes']) {
        current[resource] += placement.allocated_resources[resource];
      }
      loads.set(placement.node_id, current);
    }
  }
  return loads;
}

function candidateWithLoad(node, load = {}) {
  const used = {
    assignments: load.assignments ?? 0,
    cpu_millis: load.cpu_millis ?? 0,
    memory_bytes: load.memory_bytes ?? 0,
    storage_bytes: load.storage_bytes ?? 0
  };
  const total = node.discovery.resources;
  return {
    node,
    used,
    utilization: Math.max(
      used.assignments / total.max_concurrent_assignments,
      used.cpu_millis / total.cpu_millis,
      used.memory_bytes / total.memory_bytes,
      total.storage_bytes === 0
        ? (used.storage_bytes === 0 ? 0 : Number.POSITIVE_INFINITY)
        : used.storage_bytes / total.storage_bytes
    )
  };
}

function hasCapacity(candidate, requested) {
  const total = candidate.node.discovery.resources;
  const used = candidate.used;
  return (
    used.assignments < total.max_concurrent_assignments
    && used.cpu_millis + requested.cpu_millis <= total.cpu_millis
    && used.memory_bytes + requested.memory_bytes <= total.memory_bytes
    && used.storage_bytes + requested.storage_bytes <= total.storage_bytes
  );
}

function compareCandidates(left, right, scheduleId, domains, ownerCounts) {
  const leftDomain = domains.has(left.node.discovery.failure_domain) ? 1 : 0;
  const rightDomain = domains.has(right.node.discovery.failure_domain) ? 1 : 0;
  const leftOwner = ownerCounts.get(left.node.owner) ?? 0;
  const rightOwner = ownerCounts.get(right.node.owner) ?? 0;
  return (
    leftDomain - rightDomain
    || leftOwner - rightOwner
    || left.utilization - right.utilization
    || securityLevel(right.node.security_profile)
      - securityLevel(left.node.security_profile)
    || sha256(`${scheduleId}\n${left.node.node_id}`).localeCompare(
      sha256(`${scheduleId}\n${right.node.node_id}`)
    )
  );
}

function nodeIsEligible(node, query, leaseBoundary) {
  if (
    node.status !== 'active'
    || node.expires_at <= leaseBoundary
    || !node.discovery
    || securityLevel(node.security_profile) < query.minimum_security_level
  ) return false;
  return (
    query.required_capabilities.every(
      capability => node.capabilities.includes(capability)
    )
    && query.required_roles.every(role => node.discovery.roles.includes(role))
  );
}

function publicNode(node) {
  return {
    node_id: node.node_id,
    owner: node.owner,
    security_profile: node.security_profile,
    capabilities: [...node.capabilities],
    software_digest: node.software_digest,
    public_key_digest: node.public_key_digest,
    expires_at: node.expires_at,
    renewed_at: node.renewed_at,
    discovery: structuredClone(node.discovery)
  };
}

function normalizeResources(value) {
  const input = assertPlainObject(value, 'resources');
  return {
    cpu_millis: boundedInteger(
      input.cpu_millis,
      'resources.cpu_millis',
      1,
      1_000_000_000
    ),
    memory_bytes: boundedInteger(
      input.memory_bytes,
      'resources.memory_bytes',
      1,
      Number.MAX_SAFE_INTEGER
    ),
    storage_bytes: boundedInteger(
      input.storage_bytes ?? 0,
      'resources.storage_bytes',
      0,
      Number.MAX_SAFE_INTEGER
    )
  };
}

function uniqueStrings(
  value,
  name,
  maxItems,
  itemMax,
  pattern = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/
) {
  const items = assertStringArray(value, name, { maxItems, itemMax });
  for (const [index, item] of items.entries()) {
    if (!pattern.test(item)) {
      throw new ValidationError(`${name}[${index}] has an invalid format`);
    }
  }
  return [...new Set(items)].sort();
}

function securityLevel(profile) {
  const match = /^S([0-3])_/.exec(profile ?? '');
  return match ? Number(match[1]) : -1;
}

function boundedInteger(value, name, minimum, maximum) {
  if (
    !Number.isSafeInteger(value)
    || value < minimum
    || value > maximum
  ) {
    throw new ValidationError(
      `${name} must be an integer between ${minimum} and ${maximum}`
    );
  }
  return value;
}

function booleanValue(value, name) {
  if (typeof value !== 'boolean') {
    throw new ValidationError(`${name} must be a boolean`);
  }
  return value;
}

function normalizeTimestamp(value, name) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new ValidationError(`${name} must be an ISO timestamp`);
  }
  return new Date(value).toISOString();
}
