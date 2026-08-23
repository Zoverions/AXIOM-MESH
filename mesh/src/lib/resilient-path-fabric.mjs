import { digestObject, ValidationError } from './canonical.mjs';

export const RESILIENT_PATH_FABRIC_SCHEMA = 'axiom-resilient-path-fabric.v0';
export const RESILIENT_PATH_FABRIC_STATUS = 'inert-contract-laboratory';
export const FAILURE_DOMAIN_DIMENSIONS = Object.freeze([
  'spectrum',
  'power',
  'backhaul',
  'vendor',
  'administration',
  'site'
]);

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const NODE_ROLES = new Set(['core', 'regional-relay', 'constrained-router', 'leaf']);
const ATTESTATION_STATES = new Set(['current', 'stale', 'quarantined']);
const ENERGY_STATES = new Set(['mains', 'sufficient', 'reserve', 'depleted']);
const COMPUTE_CLASSES = new Set(['none', 'edge', 'accelerated']);
const MAINTENANCE_CLASSES = new Set(['routine', 'restricted', 'specialist']);
const MEDIA = new Set(['wired', 'wifi', 'subghz', 'cellular', 'microwave', 'optical', 'other']);
const REGULATORY_STATES = new Set(['allowed', 'unknown', 'denied']);
const PATH_ROLES = new Set(['primary', 'repair']);

export function validateResilientPathFabric(document) {
  exactObject(document, 'Resilient Path Fabric package', [
    'schema',
    'version',
    'status',
    'traffic_intent',
    'nodes',
    'links',
    'path_portfolio',
    'repair_policy',
    'optimizer',
    'authority_effect',
    'network_effect',
    'runtime_activation'
  ]);

  if (
    document.schema !== RESILIENT_PATH_FABRIC_SCHEMA
    || document.version !== 0
    || document.status !== RESILIENT_PATH_FABRIC_STATUS
    || document.authority_effect !== 'none'
    || document.network_effect !== 'none'
    || document.runtime_activation !== false
  ) {
    throw new ValidationError('Resilient Path Fabric activation boundary is invalid');
  }

  const intent = validateTrafficIntent(document.traffic_intent);
  const nodes = validateNodes(document.nodes);
  const nodeById = new Map(nodes.map(node => [node.node_id, node]));
  if (!nodeById.has(intent.source_node_id) || !nodeById.has(intent.destination_node_id)) {
    throw new ValidationError('Traffic intent source and destination must name declared nodes');
  }
  if (intent.source_node_id === intent.destination_node_id) {
    throw new ValidationError('Traffic intent source and destination must be distinct');
  }

  const links = validateLinks(document.links, nodeById);
  const linkById = new Map(links.map(link => [link.link_id, link]));
  const portfolio = validatePortfolio(
    document.path_portfolio,
    intent,
    nodeById,
    linkById
  );
  const repairPolicy = validateRepairPolicy(document.repair_policy, portfolio, intent);
  const optimizer = validateOptimizer(document.optimizer, portfolio);

  const portfolioDigest = digestObject({
    traffic_intent: intent,
    nodes,
    links,
    path_portfolio: document.path_portfolio,
    repair_policy: repairPolicy,
    optimizer
  });

  return Object.freeze({
    valid: true,
    schema: RESILIENT_PATH_FABRIC_SCHEMA,
    intent_id: intent.intent_id,
    path_count: portfolio.paths.length,
    minimum_observed_failure_domain_diversity:
      portfolio.minimumObservedFailureDomainDiversity,
    dtn_fallback_enabled: portfolio.dtnFallback.enabled,
    portfolio_digest: portfolioDigest,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false,
    live_routing_changed: false,
    radio_control_performed: false
  });
}

export function resilientPathFabricDigest(document) {
  return validateResilientPathFabric(document).portfolio_digest;
}

function validateTrafficIntent(intent) {
  exactObject(intent, 'Traffic intent', [
    'intent_id',
    'source_node_id',
    'destination_node_id',
    'criticality',
    'required_live_paths',
    'minimum_failure_domain_diversity',
    'max_path_latency_ms',
    'allow_dtn_fallback',
    'required_attestation_state'
  ]);
  identifier(intent.intent_id, 'traffic_intent.intent_id');
  identifier(intent.source_node_id, 'traffic_intent.source_node_id');
  identifier(intent.destination_node_id, 'traffic_intent.destination_node_id');
  if (!['ordinary', 'critical'].includes(intent.criticality)) {
    throw new ValidationError('Traffic intent criticality is invalid');
  }
  integerRange(intent.required_live_paths, 'traffic_intent.required_live_paths', 1, 4);
  integerRange(
    intent.minimum_failure_domain_diversity,
    'traffic_intent.minimum_failure_domain_diversity',
    0,
    FAILURE_DOMAIN_DIMENSIONS.length
  );
  integerRange(intent.max_path_latency_ms, 'traffic_intent.max_path_latency_ms', 1, 3_600_000);
  if (typeof intent.allow_dtn_fallback !== 'boolean') {
    throw new ValidationError('Traffic intent allow_dtn_fallback must be boolean');
  }
  if (intent.required_attestation_state !== 'current') {
    throw new ValidationError('Resilient Path Fabric v0 requires current attestation for live transit');
  }
  if (
    intent.criticality === 'critical'
    && (intent.required_live_paths < 2 || intent.minimum_failure_domain_diversity < 2)
  ) {
    throw new ValidationError('Critical traffic requires at least two live paths and two independent failure dimensions');
  }
  return intent;
}

function validateNodes(nodes) {
  if (!Array.isArray(nodes) || nodes.length < 2 || nodes.length > 256) {
    throw new ValidationError('Resilient Path Fabric requires 2-256 nodes');
  }
  const seen = new Set();
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    exactObject(node, `nodes[${index}]`, [
      'node_id',
      'role',
      'attestation_state',
      'energy_state',
      'transit_allowed',
      'compute_class',
      'maintenance_class'
    ]);
    identifier(node.node_id, `nodes[${index}].node_id`);
    if (seen.has(node.node_id)) throw new ValidationError(`Node ${node.node_id} is duplicated`);
    seen.add(node.node_id);
    if (!NODE_ROLES.has(node.role)) throw new ValidationError(`Node ${node.node_id} role is invalid`);
    if (!ATTESTATION_STATES.has(node.attestation_state)) {
      throw new ValidationError(`Node ${node.node_id} attestation state is invalid`);
    }
    if (!ENERGY_STATES.has(node.energy_state)) {
      throw new ValidationError(`Node ${node.node_id} energy state is invalid`);
    }
    if (typeof node.transit_allowed !== 'boolean') {
      throw new ValidationError(`Node ${node.node_id} transit_allowed must be boolean`);
    }
    if (!COMPUTE_CLASSES.has(node.compute_class)) {
      throw new ValidationError(`Node ${node.node_id} compute class is invalid`);
    }
    if (!MAINTENANCE_CLASSES.has(node.maintenance_class)) {
      throw new ValidationError(`Node ${node.node_id} maintenance class is invalid`);
    }
    if (node.role === 'leaf' && node.transit_allowed) {
      throw new ValidationError(`Leaf node ${node.node_id} cannot declare routine transit authority`);
    }
  }
  return nodes;
}

function validateLinks(links, nodeById) {
  if (!Array.isArray(links) || links.length < 1 || links.length > 1024) {
    throw new ValidationError('Resilient Path Fabric requires 1-1024 links');
  }
  const seen = new Set();
  for (let index = 0; index < links.length; index += 1) {
    const link = links[index];
    exactObject(link, `links[${index}]`, [
      'link_id',
      'from_node_id',
      'to_node_id',
      'medium',
      'regulatory_state',
      'observed_latency_ms',
      'failure_domains',
      'maintenance_class'
    ]);
    identifier(link.link_id, `links[${index}].link_id`);
    if (seen.has(link.link_id)) throw new ValidationError(`Link ${link.link_id} is duplicated`);
    seen.add(link.link_id);
    identifier(link.from_node_id, `links[${index}].from_node_id`);
    identifier(link.to_node_id, `links[${index}].to_node_id`);
    if (!nodeById.has(link.from_node_id) || !nodeById.has(link.to_node_id)) {
      throw new ValidationError(`Link ${link.link_id} references an unknown node`);
    }
    if (link.from_node_id === link.to_node_id) {
      throw new ValidationError(`Link ${link.link_id} cannot loop to the same node`);
    }
    if (!MEDIA.has(link.medium)) throw new ValidationError(`Link ${link.link_id} medium is invalid`);
    if (!REGULATORY_STATES.has(link.regulatory_state)) {
      throw new ValidationError(`Link ${link.link_id} regulatory state is invalid`);
    }
    integerRange(link.observed_latency_ms, `links[${index}].observed_latency_ms`, 0, 3_600_000);
    exactObject(link.failure_domains, `links[${index}].failure_domains`, FAILURE_DOMAIN_DIMENSIONS);
    for (const dimension of FAILURE_DOMAIN_DIMENSIONS) {
      identifier(link.failure_domains[dimension], `links[${index}].failure_domains.${dimension}`);
    }
    if (!MAINTENANCE_CLASSES.has(link.maintenance_class)) {
      throw new ValidationError(`Link ${link.link_id} maintenance class is invalid`);
    }
  }
  return links;
}

function validatePortfolio(portfolio, intent, nodeById, linkById) {
  exactObject(portfolio, 'Path portfolio', ['paths', 'dtn_fallback']);
  if (!Array.isArray(portfolio.paths) || portfolio.paths.length < 1 || portfolio.paths.length > 8) {
    throw new ValidationError('Path portfolio requires 1-8 live paths');
  }

  const pathIds = new Set();
  const paths = portfolio.paths.map((path, index) =>
    validatePath(path, index, intent, nodeById, linkById, pathIds)
  );
  const primary = paths.filter(path => path.role === 'primary');
  if (primary.length !== 1) throw new ValidationError('Path portfolio must contain exactly one primary path');
  if (paths.length < intent.required_live_paths) {
    throw new ValidationError('Path portfolio does not satisfy required live path count');
  }

  let minimumObserved = FAILURE_DOMAIN_DIMENSIONS.length;
  if (paths.length === 1) minimumObserved = 0;
  for (let left = 0; left < paths.length; left += 1) {
    for (let right = left + 1; right < paths.length; right += 1) {
      const diversity = countIndependentFailureDimensions(paths[left], paths[right], linkById);
      minimumObserved = Math.min(minimumObserved, diversity);
      if (diversity < intent.minimum_failure_domain_diversity) {
        throw new ValidationError(
          `Paths ${paths[left].path_id} and ${paths[right].path_id} share too many correlated failure domains`
        );
      }
    }
  }

  const dtnFallback = validateDtnFallback(portfolio.dtn_fallback, intent);
  return Object.freeze({
    paths,
    dtnFallback,
    minimumObservedFailureDomainDiversity: minimumObserved
  });
}

function validatePath(path, index, intent, nodeById, linkById, pathIds) {
  exactObject(path, `path_portfolio.paths[${index}]`, [
    'path_id',
    'role',
    'link_ids',
    'declared_latency_ms',
    'external_effect_performed'
  ]);
  identifier(path.path_id, `paths[${index}].path_id`);
  if (pathIds.has(path.path_id)) throw new ValidationError(`Path ${path.path_id} is duplicated`);
  pathIds.add(path.path_id);
  if (!PATH_ROLES.has(path.role)) throw new ValidationError(`Path ${path.path_id} role is invalid`);
  if (!Array.isArray(path.link_ids) || path.link_ids.length < 1 || path.link_ids.length > 64) {
    throw new ValidationError(`Path ${path.path_id} requires 1-64 links`);
  }
  if (new Set(path.link_ids).size !== path.link_ids.length) {
    throw new ValidationError(`Path ${path.path_id} cannot repeat a link`);
  }
  integerRange(path.declared_latency_ms, `path ${path.path_id} declared_latency_ms`, 0, 3_600_000);
  if (path.external_effect_performed !== false) {
    throw new ValidationError(`Path ${path.path_id} cannot claim a live network effect in the inert contract`);
  }

  const links = path.link_ids.map(linkId => {
    identifier(linkId, `path ${path.path_id} link id`);
    const link = linkById.get(linkId);
    if (!link) throw new ValidationError(`Path ${path.path_id} references unknown link ${linkId}`);
    if (link.regulatory_state !== 'allowed') {
      throw new ValidationError(`Path ${path.path_id} uses link ${linkId} without confirmed legal availability`);
    }
    return link;
  });

  let currentNode = intent.source_node_id;
  const visitedNodes = new Set([currentNode]);
  let latency = 0;
  for (const link of links) {
    if (link.from_node_id !== currentNode) {
      throw new ValidationError(`Path ${path.path_id} is not a continuous source-to-destination chain`);
    }
    currentNode = link.to_node_id;
    if (visitedNodes.has(currentNode)) {
      throw new ValidationError(`Path ${path.path_id} contains a node cycle`);
    }
    visitedNodes.add(currentNode);
    latency += link.observed_latency_ms;
  }
  if (currentNode !== intent.destination_node_id) {
    throw new ValidationError(`Path ${path.path_id} does not terminate at the traffic destination`);
  }
  if (latency !== path.declared_latency_ms) {
    throw new ValidationError(`Path ${path.path_id} declared latency does not match link observations`);
  }
  if (latency > intent.max_path_latency_ms) {
    throw new ValidationError(`Path ${path.path_id} exceeds the traffic latency ceiling`);
  }

  const orderedNodes = [...visitedNodes];
  for (let nodeIndex = 0; nodeIndex < orderedNodes.length; nodeIndex += 1) {
    const node = nodeById.get(orderedNodes[nodeIndex]);
    if (node.attestation_state !== intent.required_attestation_state) {
      throw new ValidationError(`Path ${path.path_id} uses node ${node.node_id} without current attestation`);
    }
    const isEndpoint = node.node_id === intent.source_node_id || node.node_id === intent.destination_node_id;
    if (!isEndpoint) {
      if (!node.transit_allowed || node.role === 'leaf') {
        throw new ValidationError(`Path ${path.path_id} uses node ${node.node_id} that is not eligible for transit`);
      }
      if (node.energy_state === 'reserve' || node.energy_state === 'depleted') {
        throw new ValidationError(`Path ${path.path_id} uses energy-constrained transit node ${node.node_id}`);
      }
    }
  }

  return Object.freeze({ ...path, link_ids: Object.freeze([...path.link_ids]) });
}

function countIndependentFailureDimensions(leftPath, rightPath, linkById) {
  let independent = 0;
  for (const dimension of FAILURE_DOMAIN_DIMENSIONS) {
    const left = new Set(
      leftPath.link_ids.map(linkId => linkById.get(linkId).failure_domains[dimension])
    );
    const right = new Set(
      rightPath.link_ids.map(linkId => linkById.get(linkId).failure_domains[dimension])
    );
    let overlap = false;
    for (const value of left) {
      if (right.has(value)) {
        overlap = true;
        break;
      }
    }
    if (!overlap) independent += 1;
  }
  return independent;
}

function validateDtnFallback(fallback, intent) {
  exactObject(fallback, 'DTN fallback', [
    'enabled',
    'protocol',
    'store_forward_only',
    'authority_effect',
    'network_effect'
  ]);
  if (typeof fallback.enabled !== 'boolean') {
    throw new ValidationError('DTN fallback enabled must be boolean');
  }
  if (fallback.enabled) {
    if (!intent.allow_dtn_fallback || fallback.protocol !== 'bpv7' || fallback.store_forward_only !== true) {
      throw new ValidationError('Enabled DTN fallback must be explicitly allowed and use BPv7 store-forward semantics');
    }
  } else if (fallback.protocol !== 'none' || fallback.store_forward_only !== false) {
    throw new ValidationError('Disabled DTN fallback must use protocol none and store_forward_only false');
  }
  if (fallback.authority_effect !== 'none' || fallback.network_effect !== 'none') {
    throw new ValidationError('DTN fallback declaration cannot grant authority or perform a network effect');
  }
  return fallback;
}

function validateRepairPolicy(policy, portfolio, intent) {
  exactObject(policy, 'Local repair policy', [
    'mode',
    'primary_path_id',
    'repair_path_ids',
    'fast_local_repair_target_ms',
    'selective_replication',
    'direct_forwarding_change_allowed',
    'global_route_mutation_allowed',
    'authority_effect',
    'network_effect'
  ]);
  if (policy.mode !== 'prepared-candidates-only') {
    throw new ValidationError('Local repair policy must remain prepared-candidates-only');
  }
  identifier(policy.primary_path_id, 'repair_policy.primary_path_id');
  uniqueIdentifierArray(policy.repair_path_ids, 'repair_policy.repair_path_ids', 0, 7);
  integerRange(policy.fast_local_repair_target_ms, 'repair_policy.fast_local_repair_target_ms', 1, 60_000);
  if (!['none', 'critical-only'].includes(policy.selective_replication)) {
    throw new ValidationError('Local repair selective replication mode is invalid');
  }
  if (
    policy.direct_forwarding_change_allowed !== false
    || policy.global_route_mutation_allowed !== false
    || policy.authority_effect !== 'none'
    || policy.network_effect !== 'none'
  ) {
    throw new ValidationError('Local repair contract cannot mutate live forwarding or route state');
  }

  const pathById = new Map(portfolio.paths.map(path => [path.path_id, path]));
  const primary = pathById.get(policy.primary_path_id);
  if (!primary || primary.role !== 'primary') {
    throw new ValidationError('Local repair policy primary path must name the portfolio primary');
  }
  const expectedRepairIds = portfolio.paths
    .filter(path => path.role === 'repair')
    .map(path => path.path_id)
    .sort();
  const suppliedRepairIds = [...policy.repair_path_ids].sort();
  if (
    expectedRepairIds.length !== suppliedRepairIds.length
    || expectedRepairIds.some((value, index) => value !== suppliedRepairIds[index])
  ) {
    throw new ValidationError('Local repair policy must bind the complete repair path set');
  }
  if (intent.criticality === 'critical' && policy.selective_replication !== 'critical-only') {
    throw new ValidationError('Critical traffic must retain critical-only selective replication as an available policy');
  }
  return policy;
}

function validateOptimizer(optimizer, portfolio) {
  exactObject(optimizer, 'Path optimizer', [
    'mode',
    'recommendation_id',
    'recommended_path_ids',
    'hard_constraints_first',
    'ai_direct_control',
    'requires_deterministic_executor',
    'authority_effect',
    'network_effect'
  ]);
  if (optimizer.mode !== 'shadow-only') {
    throw new ValidationError('Path optimizer must remain shadow-only in v0');
  }
  identifier(optimizer.recommendation_id, 'optimizer.recommendation_id');
  uniqueIdentifierArray(
    optimizer.recommended_path_ids,
    'optimizer.recommended_path_ids',
    1,
    portfolio.paths.length
  );
  const validPathIds = new Set(portfolio.paths.map(path => path.path_id));
  for (const pathId of optimizer.recommended_path_ids) {
    if (!validPathIds.has(pathId)) {
      throw new ValidationError(`Path optimizer recommends unknown path ${pathId}`);
    }
  }
  if (
    optimizer.hard_constraints_first !== true
    || optimizer.ai_direct_control !== false
    || optimizer.requires_deterministic_executor !== true
    || optimizer.authority_effect !== 'none'
    || optimizer.network_effect !== 'none'
  ) {
    throw new ValidationError('Path optimizer attempts to bypass deterministic hard constraints or authority boundaries');
  }
  return optimizer;
}

function exactObject(value, label, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${label} must be an object`);
  }
  const expected = new Set(fields);
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) throw new ValidationError(`${label} contains unknown field ${key}`);
  }
  for (const field of fields) {
    if (!Object.hasOwn(value, field)) throw new ValidationError(`${label} is missing required field ${field}`);
  }
}

function identifier(value, label) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) {
    throw new ValidationError(`${label} must be a bounded identifier`);
  }
  return value;
}

function integerRange(value, label, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ValidationError(`${label} must be an integer from ${min} through ${max}`);
  }
  return value;
}

function uniqueIdentifierArray(value, label, min, max) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new ValidationError(`${label} must contain ${min}-${max} identifiers`);
  }
  const seen = new Set();
  for (let index = 0; index < value.length; index += 1) {
    const item = identifier(value[index], `${label}[${index}]`);
    if (seen.has(item)) throw new ValidationError(`${label} must not contain duplicates`);
    seen.add(item);
  }
  return value;
}
