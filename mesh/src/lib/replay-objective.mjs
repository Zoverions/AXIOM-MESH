import { canonicalize, digestObject, ValidationError } from './canonical.mjs';
import {
  assertBoundedId,
  assertCanonicalInstant,
  assertExactKeys,
  assertSafeNonNegativeInteger,
  assertSafePositiveInteger,
  deepFreezeJson
} from './replay-grounded-common.mjs';

export const REPLAY_OBJECTIVE_SCHEMA = 'axiom-replay-objective.v0';

const OBJECTIVE_KEYS = Object.freeze([
  'schema', 'status', 'objective_id', 'comparison_mode', 'quality_scale', 'hard_limits',
  'metrics', 'created_at', 'authority_effect', 'network_effect', 'runtime_activation',
  'production_promotion'
]);
const HARD_LIMIT_KEYS = Object.freeze([
  'max_rounds', 'max_worker_slots', 'max_generation_calls', 'max_evaluation_calls',
  'max_token_or_cost_units', 'max_wall_clock_ms', 'max_storage_bytes', 'max_external_effects'
]);
const METRICS = new Set([
  'best_quality', 'generation_calls', 'evaluation_calls', 'token_or_cost_units',
  'wall_clock_ms', 'storage_bytes', 'worker_slot_peak', 'rounds',
  'out_of_support_requests', 'failed_attempts'
]);
const DIRECTIONS = new Set(['maximize', 'minimize']);

function literal(actual, expected, name) {
  if (actual !== expected) throw new ValidationError(`${name} must equal ${JSON.stringify(expected)}`);
}

export function validateReplayObjective(input) {
  const objective = canonicalize(input);
  assertExactKeys(objective, OBJECTIVE_KEYS, 'replay_objective');
  literal(objective.schema, REPLAY_OBJECTIVE_SCHEMA, 'schema');
  literal(objective.status, 'inert-objective', 'status');
  assertBoundedId(objective.objective_id, 'objective_id');
  literal(objective.comparison_mode, 'lexicographic', 'comparison_mode');
  assertSafePositiveInteger(objective.quality_scale, 'quality_scale');

  assertExactKeys(objective.hard_limits, HARD_LIMIT_KEYS, 'hard_limits');
  assertSafePositiveInteger(objective.hard_limits.max_rounds, 'hard_limits.max_rounds');
  assertSafePositiveInteger(objective.hard_limits.max_worker_slots, 'hard_limits.max_worker_slots');
  assertSafePositiveInteger(objective.hard_limits.max_generation_calls, 'hard_limits.max_generation_calls');
  assertSafePositiveInteger(objective.hard_limits.max_evaluation_calls, 'hard_limits.max_evaluation_calls');
  assertSafePositiveInteger(objective.hard_limits.max_token_or_cost_units, 'hard_limits.max_token_or_cost_units');
  assertSafePositiveInteger(objective.hard_limits.max_wall_clock_ms, 'hard_limits.max_wall_clock_ms');
  assertSafePositiveInteger(objective.hard_limits.max_storage_bytes, 'hard_limits.max_storage_bytes');
  assertSafeNonNegativeInteger(objective.hard_limits.max_external_effects, 'hard_limits.max_external_effects');
  if (objective.hard_limits.max_external_effects !== 0) {
    throw new ValidationError('hard_limits.max_external_effects must be zero in Replay Core v0');
  }

  if (!Array.isArray(objective.metrics) || objective.metrics.length === 0) {
    throw new ValidationError('metrics must be a non-empty array');
  }
  const seen = new Set();
  for (let index = 0; index < objective.metrics.length; index += 1) {
    const entry = objective.metrics[index];
    assertExactKeys(entry, ['metric', 'direction'], `metrics[${index}]`);
    if (!METRICS.has(entry.metric)) throw new ValidationError(`metrics[${index}].metric is unsupported`);
    if (!DIRECTIONS.has(entry.direction)) throw new ValidationError(`metrics[${index}].direction is unsupported`);
    if (seen.has(entry.metric)) throw new ValidationError('metrics cannot contain duplicates');
    seen.add(entry.metric);
  }

  assertCanonicalInstant(objective.created_at, 'created_at');
  literal(objective.authority_effect, 'none', 'authority_effect');
  literal(objective.network_effect, 'none', 'network_effect');
  literal(objective.runtime_activation, false, 'runtime_activation');
  literal(objective.production_promotion, false, 'production_promotion');
  return deepFreezeJson(objective);
}

export function digestReplayObjective(input) {
  return digestObject(validateReplayObjective(input));
}

function assertMetricRecord(record, objective, name) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new ValidationError(`${name} must be a metric record`);
  }
  for (const { metric } of objective.metrics) {
    if (!Object.hasOwn(record, metric)) throw new ValidationError(`${name}.${metric} is required`);
    assertSafeNonNegativeInteger(record[metric], `${name}.${metric}`);
    if (metric === 'best_quality' && record[metric] > objective.quality_scale) {
      throw new ValidationError(`${name}.best_quality cannot exceed objective quality_scale`);
    }
  }
}

export function compareReplayMetrics(candidateMetrics, baselineMetrics, objectiveInput) {
  const objective = validateReplayObjective(objectiveInput);
  const candidate = canonicalize(candidateMetrics);
  const baseline = canonicalize(baselineMetrics);
  assertMetricRecord(candidate, objective, 'candidateMetrics');
  assertMetricRecord(baseline, objective, 'baselineMetrics');

  for (const { metric, direction } of objective.metrics) {
    const left = candidate[metric];
    const right = baseline[metric];
    if (left === right) continue;
    if (direction === 'maximize') return left > right ? 'better' : 'worse';
    return left < right ? 'better' : 'worse';
  }
  return 'equivalent';
}
