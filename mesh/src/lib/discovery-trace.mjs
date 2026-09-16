import {
  canonicalize,
  digestObject,
  ValidationError
} from './canonical.mjs';
import {
  assertBoundedId,
  assertCanonicalInstant,
  assertExactKeys,
  assertSafeNonNegativeInteger,
  assertSafePositiveInteger,
  assertSha256,
  deepFreezeJson
} from './replay-grounded-common.mjs';

export const DISCOVERY_TRACE_SCHEMA = 'axiom-discovery-trace.v0';

const TRACE_KEYS = Object.freeze([
  'schema',
  'status',
  'trace_id',
  'domain',
  'task_definition',
  'root_state',
  'online_policy',
  'evaluator',
  'objective',
  'environment',
  'resource_envelope',
  'started_at',
  'ended_at',
  'privacy_class',
  'nodes',
  'contains_secret_material',
  'authority_effect',
  'network_effect',
  'runtime_activation',
  'production_promotion'
]);

const NODE_KEYS = Object.freeze([
  'node_id',
  'primary_parent_id',
  'creation_ordinal',
  'prefix_state_digest',
  'attempt_digest',
  'state_snapshot',
  'candidate_artifact',
  'evaluator_result',
  'diagnostics',
  'resources',
  'runtime',
  'tool_capability_ids',
  'receipt_refs',
  'started_at',
  'ended_at',
  'termination'
]);

const RESOURCE_KEYS = Object.freeze([
  'generation_calls',
  'evaluation_calls',
  'token_or_cost_units',
  'wall_clock_ms',
  'storage_bytes',
  'worker_slots',
  'external_effects'
]);

const TERMINATIONS = new Set(['completed', 'failed', 'cancelled', 'budget-exhausted', 'unsupported']);
const PRIVACY_CLASSES = new Set(['public', 'owner-private', 'restricted']);

function assertLiteral(actual, expected, name) {
  if (actual !== expected) throw new ValidationError(`${name} must equal ${JSON.stringify(expected)}`);
}

function assertReference(value, name) {
  assertExactKeys(value, ['ref', 'digest'], name);
  assertBoundedId(value.ref, `${name}.ref`);
  assertSha256(value.digest, `${name}.digest`);
}

function assertStringIdList(value, name) {
  if (!Array.isArray(value)) throw new ValidationError(`${name} must be an array`);
  const seen = new Set();
  for (let index = 0; index < value.length; index += 1) {
    const item = assertBoundedId(value[index], `${name}[${index}]`);
    if (seen.has(item)) throw new ValidationError(`${name} cannot contain duplicate identifiers`);
    seen.add(item);
  }
}

function validateNode(node, index, traceStartMs, traceEndMs, rootId, seenNodeIds) {
  const name = `nodes[${index}]`;
  assertExactKeys(node, NODE_KEYS, name);
  assertBoundedId(node.node_id, `${name}.node_id`);
  if (node.node_id === rootId) throw new ValidationError(`${name}.node_id cannot equal root_state.node_id`);
  if (seenNodeIds.has(node.node_id)) throw new ValidationError(`duplicate node_id ${node.node_id}`);

  assertBoundedId(node.primary_parent_id, `${name}.primary_parent_id`);
  assertSafePositiveInteger(node.creation_ordinal, `${name}.creation_ordinal`);
  if (node.creation_ordinal !== index + 1) {
    throw new ValidationError(`${name}.creation_ordinal must equal ${index + 1}`);
  }
  if (node.primary_parent_id !== rootId && !seenNodeIds.has(node.primary_parent_id)) {
    throw new ValidationError(`${name}.primary_parent_id must reference root or an earlier node`);
  }

  assertSha256(node.prefix_state_digest, `${name}.prefix_state_digest`);
  assertSha256(node.attempt_digest, `${name}.attempt_digest`);
  assertReference(node.state_snapshot, `${name}.state_snapshot`);
  assertReference(node.candidate_artifact, `${name}.candidate_artifact`);

  assertExactKeys(node.evaluator_result, ['ref', 'digest', 'quality'], `${name}.evaluator_result`);
  assertBoundedId(node.evaluator_result.ref, `${name}.evaluator_result.ref`);
  assertSha256(node.evaluator_result.digest, `${name}.evaluator_result.digest`);
  assertExactKeys(node.evaluator_result.quality, ['value', 'scale'], `${name}.evaluator_result.quality`);
  assertSafeNonNegativeInteger(node.evaluator_result.quality.value, `${name}.evaluator_result.quality.value`);
  assertSafePositiveInteger(node.evaluator_result.quality.scale, `${name}.evaluator_result.quality.scale`);
  if (node.evaluator_result.quality.value > node.evaluator_result.quality.scale) {
    throw new ValidationError(`${name}.evaluator_result.quality.value cannot exceed scale`);
  }

  assertReference(node.diagnostics, `${name}.diagnostics`);
  assertExactKeys(node.resources, RESOURCE_KEYS, `${name}.resources`);
  assertSafeNonNegativeInteger(node.resources.generation_calls, `${name}.resources.generation_calls`);
  assertSafeNonNegativeInteger(node.resources.evaluation_calls, `${name}.resources.evaluation_calls`);
  assertSafeNonNegativeInteger(node.resources.token_or_cost_units, `${name}.resources.token_or_cost_units`);
  assertSafeNonNegativeInteger(node.resources.wall_clock_ms, `${name}.resources.wall_clock_ms`);
  assertSafeNonNegativeInteger(node.resources.storage_bytes, `${name}.resources.storage_bytes`);
  assertSafePositiveInteger(node.resources.worker_slots, `${name}.resources.worker_slots`);
  assertSafeNonNegativeInteger(node.resources.external_effects, `${name}.resources.external_effects`);
  if (node.resources.external_effects !== 0) {
    throw new ValidationError(`${name}.resources.external_effects must be zero in Replay Core v0`);
  }

  assertExactKeys(node.runtime, ['runtime_ref', 'model_ref', 'provider_ref'], `${name}.runtime`);
  assertBoundedId(node.runtime.runtime_ref, `${name}.runtime.runtime_ref`);
  assertBoundedId(node.runtime.model_ref, `${name}.runtime.model_ref`);
  assertBoundedId(node.runtime.provider_ref, `${name}.runtime.provider_ref`);
  assertStringIdList(node.tool_capability_ids, `${name}.tool_capability_ids`);
  assertStringIdList(node.receipt_refs, `${name}.receipt_refs`);

  assertCanonicalInstant(node.started_at, `${name}.started_at`);
  assertCanonicalInstant(node.ended_at, `${name}.ended_at`);
  const nodeStartMs = Date.parse(node.started_at);
  const nodeEndMs = Date.parse(node.ended_at);
  if (nodeStartMs > nodeEndMs) throw new ValidationError(`${name} has inverted chronology`);
  if (nodeStartMs < traceStartMs || nodeEndMs > traceEndMs) {
    throw new ValidationError(`${name} must be temporally contained by the trace`);
  }

  if (!TERMINATIONS.has(node.termination)) {
    throw new ValidationError(`${name}.termination is unsupported`);
  }

  seenNodeIds.add(node.node_id);
}

export function validateDiscoveryTrace(input) {
  const trace = canonicalize(input);
  assertExactKeys(trace, TRACE_KEYS, 'discovery_trace');
  assertLiteral(trace.schema, DISCOVERY_TRACE_SCHEMA, 'schema');
  assertLiteral(trace.status, 'inert-evidence', 'status');
  assertBoundedId(trace.trace_id, 'trace_id');
  assertLiteral(trace.domain, 'coding', 'domain');

  assertReference(trace.task_definition, 'task_definition');
  assertExactKeys(trace.root_state, ['node_id', 'state_ref', 'state_digest'], 'root_state');
  assertBoundedId(trace.root_state.node_id, 'root_state.node_id');
  assertBoundedId(trace.root_state.state_ref, 'root_state.state_ref');
  assertSha256(trace.root_state.state_digest, 'root_state.state_digest');

  assertExactKeys(trace.online_policy, ['policy_id', 'artifact_digest'], 'online_policy');
  assertBoundedId(trace.online_policy.policy_id, 'online_policy.policy_id');
  assertSha256(trace.online_policy.artifact_digest, 'online_policy.artifact_digest');

  assertExactKeys(trace.evaluator, ['evaluator_id', 'evaluator_digest'], 'evaluator');
  assertBoundedId(trace.evaluator.evaluator_id, 'evaluator.evaluator_id');
  assertSha256(trace.evaluator.evaluator_digest, 'evaluator.evaluator_digest');

  assertExactKeys(trace.objective, ['objective_id', 'objective_digest'], 'objective');
  assertBoundedId(trace.objective.objective_id, 'objective.objective_id');
  assertSha256(trace.objective.objective_digest, 'objective.objective_digest');

  assertExactKeys(trace.environment, ['runtime_ref', 'runtime_digest'], 'environment');
  assertBoundedId(trace.environment.runtime_ref, 'environment.runtime_ref');
  assertSha256(trace.environment.runtime_digest, 'environment.runtime_digest');

  if (trace.resource_envelope !== null) {
    assertReference(trace.resource_envelope, 'resource_envelope');
  }

  assertCanonicalInstant(trace.started_at, 'started_at');
  assertCanonicalInstant(trace.ended_at, 'ended_at');
  const traceStartMs = Date.parse(trace.started_at);
  const traceEndMs = Date.parse(trace.ended_at);
  if (traceStartMs > traceEndMs) throw new ValidationError('trace has inverted chronology');

  if (!PRIVACY_CLASSES.has(trace.privacy_class)) {
    throw new ValidationError('privacy_class is unsupported');
  }
  if (!Array.isArray(trace.nodes)) throw new ValidationError('nodes must be an array');

  assertLiteral(trace.contains_secret_material, false, 'contains_secret_material');
  assertLiteral(trace.authority_effect, 'none', 'authority_effect');
  assertLiteral(trace.network_effect, 'none', 'network_effect');
  assertLiteral(trace.runtime_activation, false, 'runtime_activation');
  assertLiteral(trace.production_promotion, false, 'production_promotion');

  const seenNodeIds = new Set();
  for (let index = 0; index < trace.nodes.length; index += 1) {
    validateNode(trace.nodes[index], index, traceStartMs, traceEndMs, trace.root_state.node_id, seenNodeIds);
  }

  return deepFreezeJson(trace);
}

export function digestDiscoveryTrace(input) {
  return digestObject(validateDiscoveryTrace(input));
}

export function summarizeDiscoveryTrace(input) {
  const trace = validateDiscoveryTrace(input);
  const termination_counts = {
    completed: 0,
    failed: 0,
    cancelled: 0,
    'budget-exhausted': 0,
    unsupported: 0
  };
  const total_resources = {
    generation_calls: 0,
    evaluation_calls: 0,
    token_or_cost_units: 0,
    wall_clock_ms: 0,
    storage_bytes: 0,
    worker_slots: 0,
    external_effects: 0
  };
  let qualityMin = null;
  let qualityMax = null;

  for (const node of trace.nodes) {
    termination_counts[node.termination] += 1;
    for (const key of Object.keys(total_resources)) total_resources[key] += node.resources[key];
    const quality = node.evaluator_result.quality;
    const normalized = quality.value / quality.scale;
    qualityMin = qualityMin === null ? normalized : Math.min(qualityMin, normalized);
    qualityMax = qualityMax === null ? normalized : Math.max(qualityMax, normalized);
  }

  return deepFreezeJson({
    schema: DISCOVERY_TRACE_SCHEMA,
    trace_id: trace.trace_id,
    trace_digest: digestObject(trace),
    domain: trace.domain,
    task_id: trace.task_definition.ref,
    task_digest: trace.task_definition.digest,
    policy_id: trace.online_policy.policy_id,
    policy_digest: trace.online_policy.artifact_digest,
    evaluator_id: trace.evaluator.evaluator_id,
    evaluator_digest: trace.evaluator.evaluator_digest,
    objective_id: trace.objective.objective_id,
    objective_digest: trace.objective.objective_digest,
    node_count: trace.nodes.length,
    termination_counts,
    total_resources,
    quality_range: qualityMin === null ? null : { min: qualityMin, max: qualityMax },
    privacy_class: trace.privacy_class,
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false,
    production_promotion: false
  });
}
