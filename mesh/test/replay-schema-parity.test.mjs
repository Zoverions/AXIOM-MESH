import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validateDiscoveryTrace } from '../src/lib/discovery-trace.mjs';
import { validateReplayWorld } from '../src/lib/replay-world.mjs';
import { validateExplorationPolicy } from '../src/lib/exploration-policy.mjs';
import { validateReplayObjective } from '../src/lib/replay-objective.mjs';
import { validateReplayWorldPool } from '../src/lib/replay-world-pool.mjs';
import { validateReplayPolicyEvaluation } from '../src/lib/replay-policy-evaluation.mjs';
import { digestReplayWorld } from '../src/lib/replay-world.mjs';
import { makeDiscoveryTrace, makeReplayWorld, H, H2, H3, H4 } from './fixtures/replay-grounded-fixtures.mjs';

const paths = {
  trace: '../../docs/architecture/contracts/discovery-trace.v0.schema.json',
  world: '../../docs/architecture/contracts/replay-world.v0.schema.json',
  policy: '../../docs/architecture/contracts/exploration-policy.v0.schema.json',
  objective: '../../docs/architecture/contracts/replay-objective.v0.schema.json',
  pool: '../../docs/architecture/contracts/replay-world-pool.v0.schema.json',
  evaluation: '../../docs/architecture/contracts/replay-policy-evaluation.v0.schema.json'
};

async function load(name) {
  return JSON.parse(await readFile(new URL(paths[name], import.meta.url), 'utf8'));
}

function assertBase(schema, schemaConst, statusConst) {
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.type, 'object');
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.schema.const, schemaConst);
  assert.equal(schema.properties.status.const, statusConst);
  assert.equal(schema.properties.authority_effect.const, 'none');
  assert.equal(schema.properties.network_effect.const, 'none');
  assert.equal(schema.properties.runtime_activation.const, false);
  assert.equal(schema.properties.production_promotion.const, false);
  assert.equal(schema.$defs.sha256.pattern, '^[a-f0-9]{64}$');
}

function assertRequiredMatches(schema, value) {
  assert.deepEqual([...schema.required].sort(), Object.keys(value).sort());
}

function makePolicy() {
  return {
    schema: 'axiom-exploration-policy.v0',
    status: 'inert-policy-manifest',
    policy_id: 'policy.candidate',
    version: '1',
    artifact_digest: H,
    implementation: { kind: 'external-artifact', runtime: 'not-executed-by-replay-core' },
    interface_version: 'axiom-replay-policy-interface.v0',
    observation_schema: 'axiom-replay-observation.v0',
    derived_features: [],
    max_internal_state_bytes: 0,
    proposer: { kind: 'human', ref: 'proposer.owner', digest: null },
    created_at: '2026-09-16T13:10:00.000Z',
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false,
    production_promotion: false
  };
}

function makeObjective() {
  return {
    schema: 'axiom-replay-objective.v0',
    status: 'inert-objective',
    objective_id: 'objective.discovery-quality-cost',
    comparison_mode: 'lexicographic',
    quality_scale: 1000000,
    hard_limits: {
      max_rounds: 16,
      max_worker_slots: 2,
      max_generation_calls: 64,
      max_evaluation_calls: 64,
      max_token_or_cost_units: 100000,
      max_wall_clock_ms: 3600000,
      max_storage_bytes: 100000000,
      max_external_effects: 0
    },
    metrics: [{ metric: 'best_quality', direction: 'maximize' }],
    created_at: '2026-09-16T13:11:00.000Z',
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false,
    production_promotion: false
  };
}

function makePool(world) {
  return {
    schema: 'axiom-replay-world-pool.v0',
    status: 'inert-world-pool',
    pool_id: 'pool.training.1',
    cycle_id: 'cycle.1',
    role: 'training',
    visibility: 'development-visible',
    worlds: [{ world_id: world.world_id, world_digest: digestReplayWorld(world), compatibility: 'current-compatible' }],
    selection: { method: 'explicit', seed: null, evidence_ref: 'split.explicit.1', evidence_digest: H2 },
    created_at: '2026-09-16T14:00:00.000Z',
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false,
    production_promotion: false
  };
}

function metricRecord() {
  return {
    best_quality: 730000,
    generation_calls: 1,
    evaluation_calls: 1,
    token_or_cost_units: 100,
    wall_clock_ms: 500,
    storage_bytes: 2048,
    worker_slot_peak: 1,
    rounds: 1,
    out_of_support_requests: 0,
    failed_attempts: 0
  };
}

function makeEvaluation(world) {
  return {
    schema: 'axiom-replay-policy-evaluation.v0',
    status: 'inert-evaluation-evidence',
    evaluation_id: 'evaluation.example',
    candidate_policy: { policy_id: 'policy.candidate', policy_digest: H },
    baseline_policy: { policy_id: 'policy.baseline', policy_digest: H2 },
    world_pool: { pool_id: 'pool.holdout.1', pool_digest: H3, role: 'sealed-holdout' },
    objective: { objective_id: 'objective.example', objective_digest: H4 },
    runner: { runner_id: 'axiom-replay-engine.v0', runner_version: '0', runner_digest: H },
    world_results: [{
      world_id: world.world_id,
      world_digest: digestReplayWorld(world),
      candidate_run_digest: H2,
      baseline_run_digest: H3,
      compatibility: 'current-compatible'
    }],
    aggregate: {
      candidate_metrics: metricRecord(),
      baseline_metrics: metricRecord(),
      relation: 'equivalent',
      no_worse_on_fixed_history: true,
      compared_world_count: 1,
      excluded_world_count: 0,
      out_of_support_requests: 0,
      failure_count: 0,
      regression_world_ids: []
    },
    claim_scope: 'fixed-replay-pool-and-objective-only',
    evaluated_at: '2026-09-16T14:30:00.000Z',
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false,
    production_promotion: false
  };
}

test('all six replay schemas are closed Draft 2020-12 mirrors with exact non-authority constants', async () => {
  const [trace, world, policy, objective, pool, evaluation] = await Promise.all([
    load('trace'), load('world'), load('policy'), load('objective'), load('pool'), load('evaluation')
  ]);
  assertBase(trace, 'axiom-discovery-trace.v0', 'inert-evidence');
  assertBase(world, 'axiom-replay-world.v0', 'inert-replay-world');
  assertBase(policy, 'axiom-exploration-policy.v0', 'inert-policy-manifest');
  assertBase(objective, 'axiom-replay-objective.v0', 'inert-objective');
  assertBase(pool, 'axiom-replay-world-pool.v0', 'inert-world-pool');
  assertBase(evaluation, 'axiom-replay-policy-evaluation.v0', 'inert-evaluation-evidence');
});

test('schema mirrors lock the replay-specific fail-closed constraints', async () => {
  const trace = await load('trace');
  const objective = await load('objective');
  const pool = await load('pool');
  assert.equal(trace.$defs.resources.properties.external_effects.const, 0);
  assert.equal(trace.$defs.node.additionalProperties, false);
  assert.equal(objective.properties.comparison_mode.const, 'lexicographic');
  assert.equal(objective.$defs.hardLimits.properties.max_external_effects.const, 0);
  assert.deepEqual(pool.properties.role.enum, ['training', 'validation', 'sealed-holdout']);
  assert.deepEqual(pool.properties.visibility.enum, ['development-visible', 'acceptance-sealed']);
  assert.equal(pool.$defs.worldEntry.additionalProperties, false);
});

test('representative semantic-valid artifacts have exact schema-required top-level fields', async () => {
  const traceValue = validateDiscoveryTrace(makeDiscoveryTrace());
  const worldValue = validateReplayWorld(makeReplayWorld(traceValue));
  const policyValue = validateExplorationPolicy(makePolicy());
  const objectiveValue = validateReplayObjective(makeObjective());
  const poolValue = validateReplayWorldPool(makePool(worldValue));
  const evaluationValue = validateReplayPolicyEvaluation(makeEvaluation(worldValue));
  const schemas = await Promise.all(['trace', 'world', 'policy', 'objective', 'pool', 'evaluation'].map(load));
  [traceValue, worldValue, policyValue, objectiveValue, poolValue, evaluationValue]
    .forEach((value, index) => assertRequiredMatches(schemas[index], value));
});

test('representative semantic-invalid artifacts correspond to closed schema constraints', async () => {
  const trace = makeDiscoveryTrace();
  trace.nodes[0].resources.external_effects = 1;
  assert.throws(() => validateDiscoveryTrace(trace));

  assert.throws(() => validateExplorationPolicy({ ...makePolicy(), runtime_activation: true }));
  assert.throws(() => validateReplayObjective({ ...makeObjective(), comparison_mode: 'weighted' }));
  const world = makeReplayWorld(makeDiscoveryTrace());
  assert.throws(() => validateReplayWorldPool({ ...makePool(world), role: 'sealed-holdout', visibility: 'development-visible' }));
  assert.throws(() => validateReplayPolicyEvaluation({ ...makeEvaluation(world), network_effect: 'egress' }));

  const [traceSchema, objectiveSchema] = await Promise.all([load('trace'), load('objective')]);
  assert.equal(traceSchema.$defs.resources.properties.external_effects.const, 0);
  assert.equal(objectiveSchema.properties.comparison_mode.const, 'lexicographic');
});
