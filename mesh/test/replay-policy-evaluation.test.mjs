import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveReplayPolicyEvaluation,
  validateReplayPolicyEvaluation,
  digestReplayPolicyEvaluation
} from '../src/lib/replay-policy-evaluation.mjs';
import { runReplayDecisionScript } from '../src/lib/replay-engine.mjs';
import { digestExplorationPolicy } from '../src/lib/exploration-policy.mjs';
import { digestReplayObjective } from '../src/lib/replay-objective.mjs';
import { digestReplayWorld } from '../src/lib/replay-world.mjs';
import { digestReplayWorldPool } from '../src/lib/replay-world-pool.mjs';
import { makeDiscoveryTrace, makeReplayWorld, H, H2, H3, H4 } from './fixtures/replay-grounded-fixtures.mjs';

function makePolicy(id, digest) {
  return {
    schema: 'axiom-exploration-policy.v0',
    status: 'inert-policy-manifest',
    policy_id: id,
    version: '1',
    artifact_digest: digest,
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

function objective() {
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
}

function makeWorld(id, compilerDigest, obj) {
  const trace = makeDiscoveryTrace({
    trace_id: `trace.${id}`,
    objective: { objective_id: obj.objective_id, objective_digest: digestReplayObjective(obj) }
  });
  const world = makeReplayWorld(trace, { world_id: id, compiler: { compiler_digest: compilerDigest } });
  return { trace, world };
}

function makePool(worldEntries, compatibilities = {}) {
  return {
    schema: 'axiom-replay-world-pool.v0',
    status: 'inert-world-pool',
    pool_id: 'pool.holdout.1',
    cycle_id: 'cycle.1',
    role: 'sealed-holdout',
    visibility: 'acceptance-sealed',
    worlds: worldEntries.map(({ world }) => ({
      world_id: world.world_id,
      world_digest: digestReplayWorld(world),
      compatibility: compatibilities[world.world_id] ?? 'current-compatible'
    })),
    selection: {
      method: 'explicit',
      seed: null,
      evidence_ref: 'split.explicit.1',
      evidence_digest: H4
    },
    created_at: '2026-09-16T14:00:00.000Z',
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false,
    production_promotion: false
  };
}

function makeRun(entry, policy, obj, decisions) {
  return runReplayDecisionScript({
    trace: entry.trace,
    world: entry.world,
    policy,
    objective: obj,
    decisions
  });
}

function fixture({ compatibilities = {}, twoWorlds = false } = {}) {
  const obj = objective();
  const candidate = makePolicy('policy.candidate', H2);
  const baseline = makePolicy('policy.baseline', H3);
  const entries = [makeWorld('world.a', H, obj)];
  if (twoWorlds) entries.push(makeWorld('world.b', H4, obj));
  const pool = makePool(entries, compatibilities);
  const candidateRuns = [];
  const baselineRuns = [];
  for (const entry of entries) {
    candidateRuns.push(makeRun(entry, candidate, obj, [
      { round: 1, open_node_ids: ['n1'], stop: false },
      { round: 2, open_node_ids: ['n3'], stop: false }
    ]));
    baselineRuns.push(makeRun(entry, baseline, obj, [
      { round: 1, open_node_ids: ['n1'], stop: false }
    ]));
  }
  return { obj, candidate, baseline, entries, pool, candidateRuns, baselineRuns };
}

function derive(f, overrides = {}) {
  return deriveReplayPolicyEvaluation({
    evaluation_id: 'evaluation.candidate-vs-baseline.1',
    candidate_policy: f.candidate,
    baseline_policy: f.baseline,
    pool: f.pool,
    worlds: f.entries.map(({ world }) => world),
    objective: f.obj,
    candidate_runs: f.candidateRuns,
    baseline_runs: f.baselineRuns,
    runner: {
      runner_id: 'axiom-replay-engine.v0',
      runner_version: '0',
      runner_digest: H
    },
    evaluated_at: '2026-09-16T14:30:00.000Z',
    ...overrides
  });
}

test('candidate and baseline bind the exact same fixed pool and objective', () => {
  const f = fixture();
  const evaluation = derive(f);
  assert.equal(evaluation.world_pool.pool_digest, digestReplayWorldPool(f.pool));
  assert.equal(evaluation.objective.objective_digest, digestReplayObjective(f.obj));
  assert.equal(evaluation.candidate_policy.policy_digest, digestExplorationPolicy(f.candidate));
  assert.equal(evaluation.baseline_policy.policy_digest, digestExplorationPolicy(f.baseline));
  assert.equal(evaluation.claim_scope, 'fixed-replay-pool-and-objective-only');
});

test('evaluation independently verifies every run digest', () => {
  const f = fixture();
  const tampered = structuredClone(f.candidateRuns);
  tampered[0].metrics.generation_calls += 1;
  assert.throws(() => derive(f, { candidate_runs: tampered }));
});

test('baseline substitution and candidate policy substitution fail closed', () => {
  const f = fixture();
  const wrongBaseline = makePolicy('policy.other', H4);
  assert.throws(() => derive(f, { baseline_policy: wrongBaseline }));
  const wrongCandidate = makePolicy('policy.changed', H4);
  assert.throws(() => derive(f, { candidate_policy: wrongCandidate }));
});

test('historical and incompatible worlds remain recorded but do not count as current acceptance', () => {
  const f = fixture({ twoWorlds: true, compatibilities: { 'world.a': 'historical-valid', 'world.b': 'current-compatible' } });
  const evaluation = derive(f);
  assert.equal(evaluation.world_results.length, 2);
  assert.equal(evaluation.aggregate.compared_world_count, 1);
  assert.equal(evaluation.aggregate.excluded_world_count, 1);
  assert.equal(evaluation.world_results[0].compatibility, 'historical-valid');
});

test('zero current-compatible worlds fails instead of inventing equivalence', () => {
  const f = fixture({ compatibilities: { 'world.a': 'unverified' } });
  assert.throws(() => derive(f), /insufficient current-compatible replay worlds/);
});

test('per-world regression prevents no-worse claim even if aggregate improves', () => {
  const f = fixture({ twoWorlds: true });
  f.candidateRuns[0] = makeRun(f.entries[0], f.candidate, f.obj, [
    { round: 1, open_node_ids: ['n2'], stop: false }
  ]);
  const evaluation = derive(f);
  assert.equal(evaluation.aggregate.relation, 'better');
  assert.deepEqual(evaluation.aggregate.regression_world_ids, ['world.a']);
  assert.equal(evaluation.aggregate.no_worse_on_fixed_history, false);
});

test('no-worse claim is scoped to exact pool and objective and recomputed metrics', () => {
  const f = fixture();
  const evaluation = derive(f);
  assert.equal(evaluation.aggregate.relation, 'better');
  assert.equal(evaluation.aggregate.no_worse_on_fixed_history, true);
  assert.equal(evaluation.claim_scope, 'fixed-replay-pool-and-objective-only');
  assert.doesNotThrow(() => validateReplayPolicyEvaluation(evaluation));
  assert.match(digestReplayPolicyEvaluation(evaluation), /^[a-f0-9]{64}$/);

  const tampered = structuredClone(evaluation);
  tampered.aggregate.candidate_metrics.generation_calls += 1;
  assert.notEqual(digestReplayPolicyEvaluation(tampered), digestReplayPolicyEvaluation(evaluation));
});

test('negative results and out-of-support counts affect evaluation digest', () => {
  const f = fixture();
  const normal = derive(f);
  const out = structuredClone(f.candidateRuns);
  out[0] = makeRun(f.entries[0], f.candidate, f.obj, [
    { round: 1, open_node_ids: ['unknown-branch'], stop: false }
  ]);
  const degraded = derive(f, { candidate_runs: out });
  assert.notEqual(digestReplayPolicyEvaluation(normal), digestReplayPolicyEvaluation(degraded));
  assert.equal(degraded.aggregate.out_of_support_requests, 1);
});

test('evaluation cannot set runtime network authority deployment or promotion semantics', () => {
  const f = fixture();
  const evaluation = derive(f);
  assert.equal(evaluation.authority_effect, 'none');
  assert.equal(evaluation.network_effect, 'none');
  assert.equal(evaluation.runtime_activation, false);
  assert.equal(evaluation.production_promotion, false);
  assert.equal('merge_authority' in evaluation, false);
  assert.equal('deployment_authority' in evaluation, false);
  assert.equal('eligible' in evaluation, false);
  assert.throws(() => validateReplayPolicyEvaluation({ ...evaluation, runtime_activation: true }));
});
