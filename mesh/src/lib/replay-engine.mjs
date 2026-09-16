import { canonicalize, digestObject, ValidationError } from './canonical.mjs';
import {
  assertBoundedId,
  assertExactKeys,
  assertSafeNonNegativeInteger,
  assertSafePositiveInteger,
  assertSha256,
  deepFreezeJson
} from './replay-grounded-common.mjs';
import { validateDiscoveryTrace, digestDiscoveryTrace } from './discovery-trace.mjs';
import { validateReplayWorld, digestReplayWorld, resolveReplayWorld, projectReplayPrefix } from './replay-world.mjs';
import { validateExplorationPolicy, digestExplorationPolicy } from './exploration-policy.mjs';
import { validateReplayObjective, digestReplayObjective } from './replay-objective.mjs';

export const REPLAY_RUN_RESULT_SCHEMA = 'axiom-replay-run-result.v0';
const STOP_REASONS = new Set([
  'explicit-stop', 'no-eligible-nodes', 'round-limit', 'out-of-support', 'budget-limit', 'script-exhausted'
]);
const METRIC_KEYS = Object.freeze([
  'best_quality', 'generation_calls', 'evaluation_calls', 'token_or_cost_units',
  'wall_clock_ms', 'storage_bytes', 'worker_slot_peak', 'rounds',
  'out_of_support_requests', 'failed_attempts'
]);
const RESULT_KEYS = Object.freeze([
  'schema', 'status', 'world_id', 'world_digest', 'trace_id', 'trace_digest',
  'policy_id', 'policy_digest', 'objective_id', 'objective_digest',
  'revealed_node_ids', 'rounds', 'stop_reason', 'metrics', 'out_of_support',
  'failures', 'authority_effect', 'network_effect', 'runtime_activation',
  'production_promotion', 'run_digest'
]);

function literal(actual, expected, name) {
  if (actual !== expected) throw new ValidationError(`${name} must equal ${JSON.stringify(expected)}`);
}

export function validateReplayDecision(input, expectedRound) {
  const decision = canonicalize(input);
  assertExactKeys(decision, ['round', 'open_node_ids', 'stop'], 'replay_decision');
  assertSafePositiveInteger(decision.round, 'replay_decision.round');
  if (decision.round !== expectedRound) {
    throw new ValidationError(`replay_decision.round must equal ${expectedRound}`);
  }
  if (!Array.isArray(decision.open_node_ids)) throw new ValidationError('open_node_ids must be an array');
  const seen = new Set();
  for (let index = 0; index < decision.open_node_ids.length; index += 1) {
    const id = assertBoundedId(decision.open_node_ids[index], `open_node_ids[${index}]`);
    if (seen.has(id)) throw new ValidationError('open_node_ids cannot contain duplicates');
    seen.add(id);
  }
  if (typeof decision.stop !== 'boolean') throw new ValidationError('stop must be boolean');
  if (decision.stop && decision.open_node_ids.length !== 0) {
    throw new ValidationError('stop=true requires no open_node_ids');
  }
  if (!decision.stop && decision.open_node_ids.length === 0) {
    throw new ValidationError('stop=false requires at least one open_node_id');
  }
  return deepFreezeJson(decision);
}

function blankMetrics() {
  return {
    best_quality: 0,
    generation_calls: 0,
    evaluation_calls: 0,
    token_or_cost_units: 0,
    wall_clock_ms: 0,
    storage_bytes: 0,
    worker_slot_peak: 0,
    rounds: 0,
    out_of_support_requests: 0,
    failed_attempts: 0
  };
}

function prospectiveMetrics(metrics, nodes, qualityScale) {
  const next = { ...metrics };
  next.rounds += 1;
  next.worker_slot_peak = Math.max(next.worker_slot_peak, nodes.length);
  for (const node of nodes) {
    if (node.evaluator_result.quality.scale !== qualityScale) {
      throw new ValidationError(`node ${node.node_id} quality scale does not match objective quality_scale`);
    }
    next.best_quality = Math.max(next.best_quality, node.evaluator_result.quality.value);
    next.generation_calls += node.resources.generation_calls;
    next.evaluation_calls += node.resources.evaluation_calls;
    next.token_or_cost_units += node.resources.token_or_cost_units;
    next.wall_clock_ms += node.resources.wall_clock_ms;
    next.storage_bytes += node.resources.storage_bytes;
    next.worker_slot_peak = Math.max(next.worker_slot_peak, node.resources.worker_slots);
    if (node.termination !== 'completed') next.failed_attempts += 1;
  }
  return next;
}

function exceedsHardLimits(metrics, objective, world) {
  const limits = objective.hard_limits;
  return (
    metrics.rounds > Math.min(limits.max_rounds, world.ceilings.max_rounds) ||
    metrics.worker_slot_peak > Math.min(limits.max_worker_slots, world.ceilings.max_worker_slots) ||
    metrics.generation_calls > limits.max_generation_calls ||
    metrics.evaluation_calls > limits.max_evaluation_calls ||
    metrics.token_or_cost_units > limits.max_token_or_cost_units ||
    metrics.wall_clock_ms > limits.max_wall_clock_ms ||
    metrics.storage_bytes > limits.max_storage_bytes
  );
}

function makeResult({ resolved, policy, objective, revealed, metrics, stopReason, outOfSupport, failures }) {
  const base = {
    schema: REPLAY_RUN_RESULT_SCHEMA,
    status: 'inert-replay-result',
    world_id: resolved.world.world_id,
    world_digest: digestReplayWorld(resolved.world),
    trace_id: resolved.trace.trace_id,
    trace_digest: digestDiscoveryTrace(resolved.trace),
    policy_id: policy.policy_id,
    policy_digest: digestExplorationPolicy(policy),
    objective_id: objective.objective_id,
    objective_digest: digestReplayObjective(objective),
    revealed_node_ids: [...revealed],
    rounds: metrics.rounds,
    stop_reason: stopReason,
    metrics: { ...metrics },
    out_of_support: structuredClone(outOfSupport),
    failures: structuredClone(failures),
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false,
    production_promotion: false
  };
  return deepFreezeJson({ ...base, run_digest: digestObject(base) });
}

export function runReplayDecisionScript({ trace, world, policy, objective, decisions }) {
  const validatedTrace = validateDiscoveryTrace(trace);
  const validatedWorld = validateReplayWorld(world);
  const validatedPolicy = validateExplorationPolicy(policy);
  const validatedObjective = validateReplayObjective(objective);
  const objectiveDigest = digestReplayObjective(validatedObjective);

  if (validatedTrace.objective.objective_id !== validatedObjective.objective_id) {
    throw new ValidationError('trace objective_id does not match replay objective');
  }
  if (validatedTrace.objective.objective_digest !== objectiveDigest) {
    throw new ValidationError('trace objective_digest does not match replay objective');
  }

  const resolved = resolveReplayWorld(validatedWorld, validatedTrace);
  if (!Array.isArray(decisions)) throw new ValidationError('decisions must be an array');

  const revealed = [];
  const revealedSet = new Set();
  let metrics = blankMetrics();
  const outOfSupport = [];
  const failures = [];
  let stopReason = null;

  for (let index = 0; index < decisions.length; index += 1) {
    const decision = validateReplayDecision(decisions[index], index + 1);
    if (decision.stop) {
      stopReason = 'explicit-stop';
      break;
    }

    if (metrics.rounds >= Math.min(validatedWorld.ceilings.max_rounds, validatedObjective.hard_limits.max_rounds)) {
      stopReason = 'round-limit';
      break;
    }
    const workerCeiling = Math.min(
      validatedWorld.ceilings.max_worker_slots,
      validatedObjective.hard_limits.max_worker_slots
    );
    if (decision.open_node_ids.length > workerCeiling) {
      throw new ValidationError('decision exceeds worker ceiling');
    }

    const unknownIds = decision.open_node_ids.filter((id) => !resolved.node_by_id[id]);
    if (unknownIds.length > 0) {
      for (const id of [...unknownIds].sort()) outOfSupport.push({ round: decision.round, node_id: id });
      metrics = { ...metrics, out_of_support_requests: metrics.out_of_support_requests + unknownIds.length };
      stopReason = 'out-of-support';
      break;
    }

    const prefix = projectReplayPrefix(resolved, revealed);
    const eligible = new Set(prefix.eligible_node_ids);
    for (const id of decision.open_node_ids) {
      if (!eligible.has(id)) throw new ValidationError(`node ${id} is known but not currently eligible`);
    }

    const selectedNodes = [...decision.open_node_ids]
      .map((id) => resolved.node_by_id[id])
      .sort((a, b) => a.creation_ordinal - b.creation_ordinal);
    const prospective = prospectiveMetrics(metrics, selectedNodes, validatedObjective.quality_scale);
    if (exceedsHardLimits(prospective, validatedObjective, validatedWorld)) {
      stopReason = 'budget-limit';
      break;
    }

    metrics = prospective;
    for (const node of selectedNodes) {
      revealed.push(node.node_id);
      revealedSet.add(node.node_id);
      if (node.termination !== 'completed') failures.push({ node_id: node.node_id, termination: node.termination });
    }

    const after = projectReplayPrefix(resolved, revealed);
    if (after.eligible_node_ids.length === 0) {
      stopReason = 'no-eligible-nodes';
      break;
    }
  }

  if (stopReason === null) stopReason = 'script-exhausted';

  return makeResult({
    resolved,
    policy: validatedPolicy,
    objective: validatedObjective,
    revealed,
    metrics,
    stopReason,
    outOfSupport,
    failures
  });
}

export function verifyReplayRunResult(input) {
  const result = canonicalize(input);
  assertExactKeys(result, RESULT_KEYS, 'replay_run_result');
  literal(result.schema, REPLAY_RUN_RESULT_SCHEMA, 'schema');
  literal(result.status, 'inert-replay-result', 'status');
  assertBoundedId(result.world_id, 'world_id');
  assertSha256(result.world_digest, 'world_digest');
  assertBoundedId(result.trace_id, 'trace_id');
  assertSha256(result.trace_digest, 'trace_digest');
  assertBoundedId(result.policy_id, 'policy_id');
  assertSha256(result.policy_digest, 'policy_digest');
  assertBoundedId(result.objective_id, 'objective_id');
  assertSha256(result.objective_digest, 'objective_digest');
  if (!Array.isArray(result.revealed_node_ids)) throw new ValidationError('revealed_node_ids must be an array');
  const revealed = new Set();
  for (let i = 0; i < result.revealed_node_ids.length; i += 1) {
    const id = assertBoundedId(result.revealed_node_ids[i], `revealed_node_ids[${i}]`);
    if (revealed.has(id)) throw new ValidationError('revealed_node_ids cannot contain duplicates');
    revealed.add(id);
  }
  assertSafeNonNegativeInteger(result.rounds, 'rounds');
  if (!STOP_REASONS.has(result.stop_reason)) throw new ValidationError('stop_reason is unsupported');
  assertExactKeys(result.metrics, METRIC_KEYS, 'metrics');
  for (const key of METRIC_KEYS) assertSafeNonNegativeInteger(result.metrics[key], `metrics.${key}`);
  if (result.rounds !== result.metrics.rounds) throw new ValidationError('rounds must match metrics.rounds');

  if (!Array.isArray(result.out_of_support)) throw new ValidationError('out_of_support must be an array');
  for (let i = 0; i < result.out_of_support.length; i += 1) {
    const item = result.out_of_support[i];
    assertExactKeys(item, ['round', 'node_id'], `out_of_support[${i}]`);
    assertSafePositiveInteger(item.round, `out_of_support[${i}].round`);
    assertBoundedId(item.node_id, `out_of_support[${i}].node_id`);
  }
  if (!Array.isArray(result.failures)) throw new ValidationError('failures must be an array');
  for (let i = 0; i < result.failures.length; i += 1) {
    const item = result.failures[i];
    assertExactKeys(item, ['node_id', 'termination'], `failures[${i}]`);
    assertBoundedId(item.node_id, `failures[${i}].node_id`);
    assertBoundedId(item.termination, `failures[${i}].termination`);
  }

  literal(result.authority_effect, 'none', 'authority_effect');
  literal(result.network_effect, 'none', 'network_effect');
  literal(result.runtime_activation, false, 'runtime_activation');
  literal(result.production_promotion, false, 'production_promotion');
  assertSha256(result.run_digest, 'run_digest');

  const { run_digest, ...withoutDigest } = result;
  if (digestObject(withoutDigest) !== run_digest) throw new ValidationError('run_digest mismatch');
  return deepFreezeJson(result);
}
