import { canonicalize, digestObject, ValidationError } from './canonical.mjs';
import {
  assertBoundedId,
  assertCanonicalInstant,
  assertExactKeys,
  assertSafeNonNegativeInteger,
  assertSha256,
  deepFreezeJson
} from './replay-grounded-common.mjs';
import { validateExplorationPolicy, digestExplorationPolicy } from './exploration-policy.mjs';
import { validateReplayObjective, digestReplayObjective, compareReplayMetrics } from './replay-objective.mjs';
import { validateReplayWorld, digestReplayWorld } from './replay-world.mjs';
import { validateReplayWorldPool, digestReplayWorldPool, resolveReplayWorldPool } from './replay-world-pool.mjs';
import { verifyReplayRunResult } from './replay-engine.mjs';

export const REPLAY_POLICY_EVALUATION_SCHEMA = 'axiom-replay-policy-evaluation.v0';

const TOP_KEYS = Object.freeze([
  'schema', 'status', 'evaluation_id', 'candidate_policy', 'baseline_policy',
  'world_pool', 'objective', 'runner', 'world_results', 'aggregate',
  'claim_scope', 'evaluated_at', 'authority_effect', 'network_effect',
  'runtime_activation', 'production_promotion'
]);
const METRIC_KEYS = Object.freeze([
  'best_quality', 'generation_calls', 'evaluation_calls', 'token_or_cost_units',
  'wall_clock_ms', 'storage_bytes', 'worker_slot_peak', 'rounds',
  'out_of_support_requests', 'failed_attempts'
]);
const AGGREGATE_KEYS = Object.freeze([
  'candidate_metrics', 'baseline_metrics', 'relation', 'no_worse_on_fixed_history',
  'compared_world_count', 'excluded_world_count', 'out_of_support_requests',
  'failure_count', 'regression_world_ids'
]);
const RELATIONS = new Set(['better', 'equivalent', 'worse']);
const COMPATIBILITY = new Set(['historical-valid', 'current-compatible', 'incompatible', 'unverified']);

function literal(actual, expected, name) {
  if (actual !== expected) throw new ValidationError(`${name} must equal ${JSON.stringify(expected)}`);
}

function assertMetricRecord(metrics, name) {
  assertExactKeys(metrics, METRIC_KEYS, name);
  for (const key of METRIC_KEYS) assertSafeNonNegativeInteger(metrics[key], `${name}.${key}`);
}

function safeAdd(left, right, name) {
  const value = left + right;
  if (!Number.isSafeInteger(value)) throw new ValidationError(`${name} exceeds safe integer range`);
  return value;
}

function aggregateRuns(runs) {
  const aggregate = {
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
  for (const run of runs) {
    aggregate.best_quality = Math.max(aggregate.best_quality, run.metrics.best_quality);
    aggregate.worker_slot_peak = Math.max(aggregate.worker_slot_peak, run.metrics.worker_slot_peak);
    for (const key of [
      'generation_calls', 'evaluation_calls', 'token_or_cost_units', 'wall_clock_ms',
      'storage_bytes', 'rounds', 'out_of_support_requests', 'failed_attempts'
    ]) {
      aggregate[key] = safeAdd(aggregate[key], run.metrics[key], `aggregate.${key}`);
    }
  }
  return aggregate;
}

function validatePolicyRef(value, name) {
  assertExactKeys(value, ['policy_id', 'policy_digest'], name);
  assertBoundedId(value.policy_id, `${name}.policy_id`);
  assertSha256(value.policy_digest, `${name}.policy_digest`);
}

function validateEvaluationShape(input) {
  const evaluation = canonicalize(input);
  assertExactKeys(evaluation, TOP_KEYS, 'replay_policy_evaluation');
  literal(evaluation.schema, REPLAY_POLICY_EVALUATION_SCHEMA, 'schema');
  literal(evaluation.status, 'inert-evaluation-evidence', 'status');
  assertBoundedId(evaluation.evaluation_id, 'evaluation_id');
  validatePolicyRef(evaluation.candidate_policy, 'candidate_policy');
  validatePolicyRef(evaluation.baseline_policy, 'baseline_policy');
  if (evaluation.candidate_policy.policy_digest === evaluation.baseline_policy.policy_digest) {
    throw new ValidationError('candidate and baseline policy digests must be distinct');
  }

  assertExactKeys(evaluation.world_pool, ['pool_id', 'pool_digest', 'role'], 'world_pool');
  assertBoundedId(evaluation.world_pool.pool_id, 'world_pool.pool_id');
  assertSha256(evaluation.world_pool.pool_digest, 'world_pool.pool_digest');
  if (!['training', 'validation', 'sealed-holdout'].includes(evaluation.world_pool.role)) {
    throw new ValidationError('world_pool.role is unsupported');
  }

  assertExactKeys(evaluation.objective, ['objective_id', 'objective_digest'], 'objective');
  assertBoundedId(evaluation.objective.objective_id, 'objective.objective_id');
  assertSha256(evaluation.objective.objective_digest, 'objective.objective_digest');

  assertExactKeys(evaluation.runner, ['runner_id', 'runner_version', 'runner_digest'], 'runner');
  literal(evaluation.runner.runner_id, 'axiom-replay-engine.v0', 'runner.runner_id');
  literal(evaluation.runner.runner_version, '0', 'runner.runner_version');
  assertSha256(evaluation.runner.runner_digest, 'runner.runner_digest');

  if (!Array.isArray(evaluation.world_results) || evaluation.world_results.length === 0) {
    throw new ValidationError('world_results must be a non-empty array');
  }
  let priorId = null;
  const worldIds = new Set();
  for (let index = 0; index < evaluation.world_results.length; index += 1) {
    const item = evaluation.world_results[index];
    assertExactKeys(
      item,
      ['world_id', 'world_digest', 'candidate_run_digest', 'baseline_run_digest', 'compatibility'],
      `world_results[${index}]`
    );
    assertBoundedId(item.world_id, `world_results[${index}].world_id`);
    assertSha256(item.world_digest, `world_results[${index}].world_digest`);
    assertSha256(item.candidate_run_digest, `world_results[${index}].candidate_run_digest`);
    assertSha256(item.baseline_run_digest, `world_results[${index}].baseline_run_digest`);
    if (!COMPATIBILITY.has(item.compatibility)) {
      throw new ValidationError(`world_results[${index}].compatibility is unsupported`);
    }
    if (worldIds.has(item.world_id)) throw new ValidationError('world_results contains duplicate world_id values');
    if (priorId !== null && item.world_id <= priorId) throw new ValidationError('world_results must be ordered by world_id');
    priorId = item.world_id;
    worldIds.add(item.world_id);
  }

  assertExactKeys(evaluation.aggregate, AGGREGATE_KEYS, 'aggregate');
  assertMetricRecord(evaluation.aggregate.candidate_metrics, 'aggregate.candidate_metrics');
  assertMetricRecord(evaluation.aggregate.baseline_metrics, 'aggregate.baseline_metrics');
  if (!RELATIONS.has(evaluation.aggregate.relation)) throw new ValidationError('aggregate.relation is unsupported');
  if (typeof evaluation.aggregate.no_worse_on_fixed_history !== 'boolean') {
    throw new ValidationError('aggregate.no_worse_on_fixed_history must be boolean');
  }
  assertSafeNonNegativeInteger(evaluation.aggregate.compared_world_count, 'aggregate.compared_world_count');
  assertSafeNonNegativeInteger(evaluation.aggregate.excluded_world_count, 'aggregate.excluded_world_count');
  assertSafeNonNegativeInteger(evaluation.aggregate.out_of_support_requests, 'aggregate.out_of_support_requests');
  assertSafeNonNegativeInteger(evaluation.aggregate.failure_count, 'aggregate.failure_count');
  if (evaluation.aggregate.compared_world_count + evaluation.aggregate.excluded_world_count !== evaluation.world_results.length) {
    throw new ValidationError('aggregate world counts must match world_results length');
  }
  if (!Array.isArray(evaluation.aggregate.regression_world_ids)) {
    throw new ValidationError('aggregate.regression_world_ids must be an array');
  }
  let priorRegression = null;
  const regressionIds = new Set();
  for (let index = 0; index < evaluation.aggregate.regression_world_ids.length; index += 1) {
    const id = assertBoundedId(evaluation.aggregate.regression_world_ids[index], `aggregate.regression_world_ids[${index}]`);
    if (!worldIds.has(id)) throw new ValidationError('regression_world_id must exist in world_results');
    if (regressionIds.has(id)) throw new ValidationError('regression_world_ids cannot contain duplicates');
    if (priorRegression !== null && id <= priorRegression) throw new ValidationError('regression_world_ids must be ordered');
    priorRegression = id;
    regressionIds.add(id);
  }
  if (evaluation.aggregate.no_worse_on_fixed_history && (
    evaluation.aggregate.relation === 'worse' || evaluation.aggregate.regression_world_ids.length !== 0
  )) {
    throw new ValidationError('no_worse_on_fixed_history contradicts aggregate evidence');
  }

  literal(evaluation.claim_scope, 'fixed-replay-pool-and-objective-only', 'claim_scope');
  assertCanonicalInstant(evaluation.evaluated_at, 'evaluated_at');
  literal(evaluation.authority_effect, 'none', 'authority_effect');
  literal(evaluation.network_effect, 'none', 'network_effect');
  literal(evaluation.runtime_activation, false, 'runtime_activation');
  literal(evaluation.production_promotion, false, 'production_promotion');
  return deepFreezeJson(evaluation);
}

export function validateReplayPolicyEvaluation(input) {
  return validateEvaluationShape(input);
}

export function digestReplayPolicyEvaluation(input) {
  return digestObject(validateEvaluationShape(input));
}

function indexRuns(runInputs, expectedPolicy, objective, resolvedPool, name) {
  if (!Array.isArray(runInputs) || runInputs.length !== resolvedPool.pool.worlds.length) {
    throw new ValidationError(`${name} must contain exactly one run per pool world`);
  }
  const expectedPolicyDigest = digestExplorationPolicy(expectedPolicy);
  const objectiveDigest = digestReplayObjective(objective);
  const byWorld = new Map();
  for (let index = 0; index < runInputs.length; index += 1) {
    const run = verifyReplayRunResult(runInputs[index]);
    if (byWorld.has(run.world_id)) throw new ValidationError(`${name} contains duplicate world_id ${run.world_id}`);
    const resolvedEntry = resolvedPool.resolved_worlds.find((entry) => entry.world_id === run.world_id);
    if (!resolvedEntry) throw new ValidationError(`${name} contains a world outside the pool`);
    if (run.world_digest !== resolvedEntry.world_digest) throw new ValidationError(`${name} world_digest mismatch`);
    if (run.trace_digest !== resolvedEntry.world.trace_digest) throw new ValidationError(`${name} trace_digest mismatch`);
    if (run.policy_id !== expectedPolicy.policy_id || run.policy_digest !== expectedPolicyDigest) {
      throw new ValidationError(`${name} policy binding mismatch`);
    }
    if (run.objective_id !== objective.objective_id || run.objective_digest !== objectiveDigest) {
      throw new ValidationError(`${name} objective binding mismatch`);
    }
    byWorld.set(run.world_id, run);
  }
  for (const entry of resolvedPool.pool.worlds) {
    if (!byWorld.has(entry.world_id)) throw new ValidationError(`${name} is missing world ${entry.world_id}`);
  }
  return byWorld;
}

export function deriveReplayPolicyEvaluation({
  evaluation_id,
  candidate_policy,
  baseline_policy,
  pool,
  worlds,
  objective,
  candidate_runs,
  baseline_runs,
  runner,
  evaluated_at
}) {
  assertBoundedId(evaluation_id, 'evaluation_id');
  const candidate = validateExplorationPolicy(candidate_policy);
  const baseline = validateExplorationPolicy(baseline_policy);
  const candidateDigest = digestExplorationPolicy(candidate);
  const baselineDigest = digestExplorationPolicy(baseline);
  if (candidateDigest === baselineDigest) throw new ValidationError('candidate and baseline policy must be distinct');
  const validatedObjective = validateReplayObjective(objective);
  const objectiveDigest = digestReplayObjective(validatedObjective);
  const validatedPool = validateReplayWorldPool(pool);
  const resolvedPool = resolveReplayWorldPool(validatedPool, worlds.map((world) => validateReplayWorld(world)));
  const poolDigest = digestReplayWorldPool(validatedPool);

  assertExactKeys(runner, ['runner_id', 'runner_version', 'runner_digest'], 'runner');
  literal(runner.runner_id, 'axiom-replay-engine.v0', 'runner.runner_id');
  literal(runner.runner_version, '0', 'runner.runner_version');
  assertSha256(runner.runner_digest, 'runner.runner_digest');
  assertCanonicalInstant(evaluated_at, 'evaluated_at');

  const candidateByWorld = indexRuns(candidate_runs, candidate, validatedObjective, resolvedPool, 'candidate_runs');
  const baselineByWorld = indexRuns(baseline_runs, baseline, validatedObjective, resolvedPool, 'baseline_runs');

  const worldResults = [];
  const includedCandidateRuns = [];
  const includedBaselineRuns = [];
  const regressions = [];
  for (const entry of resolvedPool.pool.worlds) {
    const candidateRun = candidateByWorld.get(entry.world_id);
    const baselineRun = baselineByWorld.get(entry.world_id);
    worldResults.push({
      world_id: entry.world_id,
      world_digest: entry.world_digest,
      candidate_run_digest: candidateRun.run_digest,
      baseline_run_digest: baselineRun.run_digest,
      compatibility: entry.compatibility
    });
    if (entry.compatibility !== 'current-compatible') continue;
    includedCandidateRuns.push(candidateRun);
    includedBaselineRuns.push(baselineRun);
    if (compareReplayMetrics(candidateRun.metrics, baselineRun.metrics, validatedObjective) === 'worse') {
      regressions.push(entry.world_id);
    }
  }

  if (includedCandidateRuns.length === 0) {
    throw new ValidationError('insufficient current-compatible replay worlds');
  }

  const candidateMetrics = aggregateRuns(includedCandidateRuns);
  const baselineMetrics = aggregateRuns(includedBaselineRuns);
  const relation = compareReplayMetrics(candidateMetrics, baselineMetrics, validatedObjective);
  const noWorse = (relation === 'better' || relation === 'equivalent') && regressions.length === 0;

  const evaluation = {
    schema: REPLAY_POLICY_EVALUATION_SCHEMA,
    status: 'inert-evaluation-evidence',
    evaluation_id,
    candidate_policy: { policy_id: candidate.policy_id, policy_digest: candidateDigest },
    baseline_policy: { policy_id: baseline.policy_id, policy_digest: baselineDigest },
    world_pool: { pool_id: validatedPool.pool_id, pool_digest: poolDigest, role: validatedPool.role },
    objective: { objective_id: validatedObjective.objective_id, objective_digest: objectiveDigest },
    runner: canonicalize(runner),
    world_results: worldResults,
    aggregate: {
      candidate_metrics: candidateMetrics,
      baseline_metrics: baselineMetrics,
      relation,
      no_worse_on_fixed_history: noWorse,
      compared_world_count: includedCandidateRuns.length,
      excluded_world_count: worldResults.length - includedCandidateRuns.length,
      out_of_support_requests: candidateMetrics.out_of_support_requests,
      failure_count: candidateMetrics.failed_attempts,
      regression_world_ids: regressions
    },
    claim_scope: 'fixed-replay-pool-and-objective-only',
    evaluated_at,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false,
    production_promotion: false
  };
  return validateEvaluationShape(evaluation);
}
