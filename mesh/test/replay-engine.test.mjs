import test from 'node:test';
import assert from 'node:assert/strict';
import {
  runReplayDecisionScript,
  verifyReplayRunResult,
  validateReplayDecision
} from '../src/lib/replay-engine.mjs';
import { digestReplayObjective } from '../src/lib/replay-objective.mjs';
import { projectReplayPrefix, resolveReplayWorld } from '../src/lib/replay-world.mjs';
import { makeDiscoveryTrace, makeReplayWorld, H } from './fixtures/replay-grounded-fixtures.mjs';

function policy(overrides = {}) {
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
    production_promotion: false,
    ...structuredClone(overrides)
  };
}

function objective(overrides = {}) {
  const base = {
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
    metrics: [
      { metric: 'best_quality', direction: 'maximize' },
      { metric: 'generation_calls', direction: 'minimize' },
      { metric: 'evaluation_calls', direction: 'minimize' },
      { metric: 'token_or_cost_units', direction: 'minimize' },
      { metric: 'rounds', direction: 'minimize' }
    ],
    created_at: '2026-09-16T13:11:00.000Z',
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false,
    production_promotion: false
  };
  return {
    ...structuredClone(base),
    ...structuredClone(overrides),
    hard_limits: { ...base.hard_limits, ...(overrides.hard_limits ?? {}) },
    metrics: structuredClone(overrides.metrics ?? base.metrics)
  };
}

function context({ objectiveOverrides = {}, worldOverrides = {} } = {}) {
  const obj = objective(objectiveOverrides);
  const trace = makeDiscoveryTrace({
    objective: {
      objective_id: obj.objective_id,
      objective_digest: digestReplayObjective(obj)
    }
  });
  return {
    objective: obj,
    trace,
    world: makeReplayWorld(trace, worldOverrides),
    policy: policy()
  };
}

function run(ctx, decisions) {
  return runReplayDecisionScript({ ...ctx, decisions });
}

test('same world, policy, objective, and decisions produce identical run digest', () => {
  const ctx = context();
  const decisions = [
    { round: 1, open_node_ids: ['n1'], stop: false },
    { round: 2, open_node_ids: [], stop: true }
  ];
  const first = run(ctx, decisions);
  const second = run(ctx, structuredClone(decisions));
  assert.equal(first.run_digest, second.run_digest);
  assert.equal(first.stop_reason, 'explicit-stop');
  assert.deepEqual(first.revealed_node_ids, ['n1']);
  assert.equal(first.rounds, 1);
  assert.equal(first.metrics.rounds, 1);
});

test('initial observation exposes eligible root children but no unrevealed outcomes', () => {
  const ctx = context();
  const resolved = resolveReplayWorld(ctx.world, ctx.trace);
  const prefix = projectReplayPrefix(resolved, []);
  assert.deepEqual(prefix.eligible_node_ids, ['n1', 'n2']);
  assert.deepEqual(prefix.revealed, []);
  assert.equal(JSON.stringify(prefix).includes('n3'), false);
  assert.equal(JSON.stringify(prefix).includes('800000'), false);
});

test('revealing a parent makes only its recorded children eligible', () => {
  const ctx = context();
  const result = run(ctx, [{ round: 1, open_node_ids: ['n1'], stop: false }]);
  assert.equal(result.stop_reason, 'script-exhausted');
  const prefix = projectReplayPrefix(resolveReplayWorld(ctx.world, ctx.trace), result.revealed_node_ids);
  assert.deepEqual(prefix.eligible_node_ids, ['n2', 'n3']);
});

test('unknown continuation becomes out-of-support and no outcome is synthesized', () => {
  const ctx = context();
  const result = run(ctx, [{ round: 1, open_node_ids: ['n999'], stop: false }]);
  assert.equal(result.stop_reason, 'out-of-support');
  assert.deepEqual(result.revealed_node_ids, []);
  assert.deepEqual(result.out_of_support, [{ round: 1, node_id: 'n999' }]);
  assert.equal(result.metrics.out_of_support_requests, 1);
});

test('known grandchild selected before parent fails as prefix leakage', () => {
  const ctx = context();
  assert.throws(() => run(ctx, [{ round: 1, open_node_ids: ['n3'], stop: false }]));
});

test('decision cannot exceed worker ceiling', () => {
  const ctx = context({ worldOverrides: { ceilings: { max_worker_slots: 1 } } });
  assert.throws(() => run(ctx, [{ round: 1, open_node_ids: ['n1', 'n2'], stop: false }]));
});

test('prospective resource overflow stops before revealing the node', () => {
  const ctx = context({ objectiveOverrides: { hard_limits: { max_generation_calls: 1 } } });
  const result = run(ctx, [{ round: 1, open_node_ids: ['n1', 'n2'], stop: false }]);
  assert.equal(result.stop_reason, 'budget-limit');
  assert.deepEqual(result.revealed_node_ids, []);
  assert.equal(result.metrics.generation_calls, 0);
});

test('decision ordering cannot change reveal order or digest', () => {
  const ctx = context();
  const a = run(ctx, [{ round: 1, open_node_ids: ['n1', 'n2'], stop: false }]);
  const b = run(ctx, [{ round: 1, open_node_ids: ['n2', 'n1'], stop: false }]);
  assert.deepEqual(a.revealed_node_ids, ['n1', 'n2']);
  assert.deepEqual(b.revealed_node_ids, ['n1', 'n2']);
  assert.equal(a.run_digest, b.run_digest);
});

test('script exhaustion is explicit and engine never invents a next move', () => {
  const ctx = context();
  const result = run(ctx, [{ round: 1, open_node_ids: ['n1'], stop: false }]);
  assert.equal(result.stop_reason, 'script-exhausted');
  assert.deepEqual(result.revealed_node_ids, ['n1']);
});

test('candidate diagnostics cannot override recorded resource use', () => {
  assert.throws(() => validateReplayDecision({
    round: 1,
    open_node_ids: ['n1'],
    stop: false,
    claimed_generation_calls: 0
  }, 1));
  const ctx = context();
  const result = run(ctx, [{ round: 1, open_node_ids: ['n1'], stop: false }]);
  assert.equal(result.metrics.generation_calls, 1);
  assert.equal(result.metrics.token_or_cost_units, 100);
});

test('tampered run result fails digest verification', () => {
  const ctx = context();
  const result = run(ctx, [{ round: 1, open_node_ids: ['n1'], stop: false }]);
  assert.doesNotThrow(() => verifyReplayRunResult(result));
  const tampered = structuredClone(result);
  tampered.metrics.generation_calls += 1;
  assert.throws(() => verifyReplayRunResult(tampered));
});
