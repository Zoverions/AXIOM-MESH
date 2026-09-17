import {
  canonicalize,
  digestObject,
  ValidationError
} from './canonical.mjs';
import {
  assertBoundedId,
  assertCanonicalInstant,
  assertExactKeys,
  assertSafePositiveInteger,
  assertSha256,
  deepFreezeJson
} from './replay-grounded-common.mjs';
import {
  validateDiscoveryTrace,
  digestDiscoveryTrace
} from './discovery-trace.mjs';

export const REPLAY_WORLD_SCHEMA = 'axiom-replay-world.v0';

const WORLD_KEYS = Object.freeze([
  'schema',
  'status',
  'world_id',
  'trace_id',
  'trace_digest',
  'compiler',
  'evaluator_digest',
  'objective_digest',
  'semantics',
  'ceilings',
  'created_at',
  'authority_effect',
  'network_effect',
  'runtime_activation',
  'production_promotion'
]);

function assertLiteral(actual, expected, name) {
  if (actual !== expected) throw new ValidationError(`${name} must equal ${JSON.stringify(expected)}`);
}

export function validateReplayWorld(input) {
  const world = canonicalize(input);
  assertExactKeys(world, WORLD_KEYS, 'replay_world');
  assertLiteral(world.schema, REPLAY_WORLD_SCHEMA, 'schema');
  assertLiteral(world.status, 'inert-replay-world', 'status');
  assertBoundedId(world.world_id, 'world_id');
  assertBoundedId(world.trace_id, 'trace_id');
  assertSha256(world.trace_digest, 'trace_digest');

  assertExactKeys(world.compiler, ['compiler_id', 'compiler_version', 'compiler_digest'], 'compiler');
  assertBoundedId(world.compiler.compiler_id, 'compiler.compiler_id');
  assertLiteral(world.compiler.compiler_id, 'axiom-replay-world-compiler.v0', 'compiler.compiler_id');
  assertBoundedId(world.compiler.compiler_version, 'compiler.compiler_version');
  assertLiteral(world.compiler.compiler_version, '0', 'compiler.compiler_version');
  assertSha256(world.compiler.compiler_digest, 'compiler.compiler_digest');

  assertSha256(world.evaluator_digest, 'evaluator_digest');
  assertSha256(world.objective_digest, 'objective_digest');

  assertExactKeys(
    world.semantics,
    ['opening', 'child_reveal', 'sibling_order', 'out_of_support', 'terminal'],
    'semantics'
  );
  assertLiteral(world.semantics.opening, 'root-children', 'semantics.opening');
  assertLiteral(world.semantics.child_reveal, 'after-parent-revealed', 'semantics.child_reveal');
  assertLiteral(world.semantics.sibling_order, 'creation-ordinal', 'semantics.sibling_order');
  assertLiteral(world.semantics.out_of_support, 'record-and-stop', 'semantics.out_of_support');
  assertLiteral(
    world.semantics.terminal,
    'stop-or-no-eligible-or-round-limit',
    'semantics.terminal'
  );

  assertExactKeys(world.ceilings, ['max_worker_slots', 'max_rounds'], 'ceilings');
  assertSafePositiveInteger(world.ceilings.max_worker_slots, 'ceilings.max_worker_slots');
  assertSafePositiveInteger(world.ceilings.max_rounds, 'ceilings.max_rounds');
  assertCanonicalInstant(world.created_at, 'created_at');

  assertLiteral(world.authority_effect, 'none', 'authority_effect');
  assertLiteral(world.network_effect, 'none', 'network_effect');
  assertLiteral(world.runtime_activation, false, 'runtime_activation');
  assertLiteral(world.production_promotion, false, 'production_promotion');

  return deepFreezeJson(world);
}

export function digestReplayWorld(input) {
  return digestObject(validateReplayWorld(input));
}

export function resolveReplayWorld(worldInput, traceInput) {
  const world = validateReplayWorld(worldInput);
  const trace = validateDiscoveryTrace(traceInput);
  const traceDigest = digestDiscoveryTrace(trace);

  if (world.trace_id !== trace.trace_id) throw new ValidationError('world trace_id does not match trace');
  if (world.trace_digest !== traceDigest) throw new ValidationError('world trace_digest does not match trace');
  if (world.evaluator_digest !== trace.evaluator.evaluator_digest) {
    throw new ValidationError('world evaluator_digest does not match trace');
  }
  if (world.objective_digest !== trace.objective.objective_digest) {
    throw new ValidationError('world objective_digest does not match trace');
  }

  const node_by_id = {};
  const children_by_parent = { [trace.root_state.node_id]: [] };
  for (const node of trace.nodes) {
    node_by_id[node.node_id] = node;
    if (!children_by_parent[node.primary_parent_id]) children_by_parent[node.primary_parent_id] = [];
    children_by_parent[node.primary_parent_id].push(node.node_id);
    if (!children_by_parent[node.node_id]) children_by_parent[node.node_id] = [];
  }

  for (const ids of Object.values(children_by_parent)) {
    ids.sort((left, right) => node_by_id[left].creation_ordinal - node_by_id[right].creation_ordinal);
  }

  return deepFreezeJson({
    world,
    trace,
    root_id: trace.root_state.node_id,
    node_by_id,
    children_by_parent
  });
}

function outcomeSummary(node) {
  return {
    node_id: node.node_id,
    primary_parent_id: node.primary_parent_id,
    creation_ordinal: node.creation_ordinal,
    candidate_digest: node.candidate_artifact.digest,
    evaluator_result_digest: node.evaluator_result.digest,
    quality: {
      value: node.evaluator_result.quality.value,
      scale: node.evaluator_result.quality.scale
    },
    diagnostics_digest: node.diagnostics.digest,
    resources: { ...node.resources },
    termination: node.termination
  };
}

export function projectReplayPrefix(resolvedWorld, revealedNodeIds) {
  if (!resolvedWorld || typeof resolvedWorld !== 'object') {
    throw new ValidationError('resolvedWorld must be a resolved replay world');
  }
  if (!Array.isArray(revealedNodeIds)) throw new ValidationError('revealedNodeIds must be an array');

  const seen = new Set();
  for (let index = 0; index < revealedNodeIds.length; index += 1) {
    const id = assertBoundedId(revealedNodeIds[index], `revealedNodeIds[${index}]`);
    if (seen.has(id)) throw new ValidationError('revealedNodeIds cannot contain duplicates');
    const node = resolvedWorld.node_by_id[id];
    if (!node) throw new ValidationError(`revealed node ${id} is not in the replay world`);
    if (node.primary_parent_id !== resolvedWorld.root_id && !seen.has(node.primary_parent_id)) {
      throw new ValidationError(`revealed node ${id} is not prefix-reachable`);
    }
    seen.add(id);
  }

  const revealedSorted = [...seen].sort(
    (left, right) => resolvedWorld.node_by_id[left].creation_ordinal - resolvedWorld.node_by_id[right].creation_ordinal
  );
  const eligible = [];
  for (const node of resolvedWorld.trace.nodes) {
    if (seen.has(node.node_id)) continue;
    if (node.primary_parent_id === resolvedWorld.root_id || seen.has(node.primary_parent_id)) {
      eligible.push(node.node_id);
    }
  }
  eligible.sort(
    (left, right) => resolvedWorld.node_by_id[left].creation_ordinal - resolvedWorld.node_by_id[right].creation_ordinal
  );

  const exhausted = [];
  for (const id of revealedSorted) {
    const children = resolvedWorld.children_by_parent[id] ?? [];
    if (children.every((childId) => seen.has(childId))) exhausted.push(id);
  }

  return deepFreezeJson({
    world_id: resolvedWorld.world.world_id,
    trace_id: resolvedWorld.trace.trace_id,
    revealed: revealedSorted.map((id) => outcomeSummary(resolvedWorld.node_by_id[id])),
    eligible_node_ids: eligible,
    exhausted_node_ids: exhausted
  });
}
