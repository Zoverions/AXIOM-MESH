import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  validateExplorationPolicy,
  digestExplorationPolicy,
  REPLAY_POLICY_INTERFACE,
  REPLAY_OBSERVATION_SCHEMA
} from '../src/lib/exploration-policy.mjs';
import {
  validateReplayObjective,
  digestReplayObjective,
  compareReplayMetrics
} from '../src/lib/replay-objective.mjs';
import { H, H2, H3 } from './fixtures/replay-grounded-fixtures.mjs';

function makePolicy(overrides = {}) {
  const base = {
    schema: 'axiom-exploration-policy.v0',
    status: 'inert-policy-manifest',
    policy_id: 'policy.candidate',
    version: '1',
    artifact_digest: H,
    implementation: {
      kind: 'external-artifact',
      runtime: 'not-executed-by-replay-core'
    },
    interface_version: 'axiom-replay-policy-interface.v0',
    observation_schema: 'axiom-replay-observation.v0',
    derived_features: [],
    max_internal_state_bytes: 0,
    proposer: {
      kind: 'human',
      ref: 'proposer.owner',
      digest: null
    },
    created_at: '2026-09-16T13:10:00.000Z',
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false,
    production_promotion: false
  };
  return {
    ...structuredClone(base),
    ...structuredClone(overrides),
    implementation: { ...base.implementation, ...(overrides.implementation ?? {}) },
    proposer: { ...base.proposer, ...(overrides.proposer ?? {}) },
    derived_features: structuredClone(overrides.derived_features ?? base.derived_features)
  };
}

function makeObjective(overrides = {}) {
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

function metrics(overrides = {}) {
  return {
    best_quality: 730000,
    generation_calls: 2,
    evaluation_calls: 2,
    token_or_cost_units: 200,
    rounds: 2,
    ...overrides
  };
}

test('policy manifest is exact, content-addressed, and non-authorizing', () => {
  const policy = validateExplorationPolicy(makePolicy());
  assert.equal(policy.interface_version, REPLAY_POLICY_INTERFACE);
  assert.equal(policy.observation_schema, REPLAY_OBSERVATION_SCHEMA);
  assert.match(digestExplorationPolicy(policy), /^[a-f0-9]{64}$/);
  assert.equal(policy.authority_effect, 'none');
  assert.equal(policy.network_effect, 'none');
  assert.equal(policy.runtime_activation, false);
  assert.equal(policy.production_promotion, false);
  assert.throws(() => validateExplorationPolicy(makePolicy({ extra: true })));
  assert.throws(() => validateExplorationPolicy(makePolicy({ runtime_activation: true })));
});

test('policy artifact binding and proposer digest are validated', () => {
  assert.throws(() => validateExplorationPolicy(makePolicy({ artifact_digest: 'not-a-digest' })));
  assert.doesNotThrow(() => validateExplorationPolicy(makePolicy({ proposer: { digest: H2 } })));
  assert.throws(() => validateExplorationPolicy(makePolicy({ proposer: { digest: 'bad' } })));
  assert.throws(() => validateExplorationPolicy(makePolicy({ proposer: { kind: 'unreviewed-kind' } })));
});

test('derived features must be unique and ordered by feature_id', () => {
  const ordered = [
    { feature_id: 'feature.a', feature_digest: H },
    { feature_id: 'feature.b', feature_digest: H2 }
  ];
  assert.doesNotThrow(() => validateExplorationPolicy(makePolicy({ derived_features: ordered })));
  assert.throws(() => validateExplorationPolicy(makePolicy({ derived_features: [...ordered].reverse() })));
  assert.throws(() => validateExplorationPolicy(makePolicy({
    derived_features: [ordered[0], { feature_id: 'feature.a', feature_digest: H3 }]
  })));
});

test('derived feature ordering uses deterministic code-unit comparison, never locale collation', async () => {
  const source = await readFile(new URL('../src/lib/exploration-policy.mjs', import.meta.url), 'utf8');
  assert.equal(source.includes('.localeCompare('), false);
  const codeUnitOrdered = [
    { feature_id: 'feature.Z', feature_digest: H },
    { feature_id: 'feature.a', feature_digest: H2 }
  ];
  assert.doesNotThrow(() => validateExplorationPolicy(makePolicy({ derived_features: codeUnitOrdered })));
  assert.throws(() => validateExplorationPolicy(makePolicy({ derived_features: [...codeUnitOrdered].reverse() })));
});

test('objective hard ceilings are exact and external effects remain zero', () => {
  const objective = validateReplayObjective(makeObjective());
  assert.match(digestReplayObjective(objective), /^[a-f0-9]{64}$/);
  assert.equal(objective.comparison_mode, 'lexicographic');
  assert.equal(objective.hard_limits.max_external_effects, 0);
  assert.throws(() => validateReplayObjective(makeObjective({ extra: true })));
  assert.throws(() => validateReplayObjective(makeObjective({ comparison_mode: 'weighted' })));
  assert.throws(() => validateReplayObjective(makeObjective({ hard_limits: { max_external_effects: 1 } })));
  assert.throws(() => validateReplayObjective(makeObjective({ hard_limits: { max_rounds: 0 } })));
});

test('objective rejects duplicate or unsupported metrics', () => {
  assert.throws(() => validateReplayObjective(makeObjective({
    metrics: [
      { metric: 'best_quality', direction: 'maximize' },
      { metric: 'best_quality', direction: 'maximize' }
    ]
  })));
  assert.throws(() => validateReplayObjective(makeObjective({
    metrics: [{ metric: 'magic_score', direction: 'maximize' }]
  })));
  assert.throws(() => validateReplayObjective(makeObjective({
    metrics: [{ metric: 'best_quality', direction: 'sideways' }]
  })));
});

test('lexicographic comparison respects declared priority and direction', () => {
  const objective = makeObjective();
  assert.equal(compareReplayMetrics(metrics({ best_quality: 740000, generation_calls: 99 }), metrics(), objective), 'better');
  assert.equal(compareReplayMetrics(metrics({ best_quality: 720000, generation_calls: 1 }), metrics(), objective), 'worse');
  assert.equal(compareReplayMetrics(metrics({ generation_calls: 1 }), metrics(), objective), 'better');
  assert.equal(compareReplayMetrics(metrics(), metrics(), objective), 'equivalent');
});

test('comparison requires every objective metric as a safe integer', () => {
  const objective = makeObjective();
  const missing = metrics();
  delete missing.rounds;
  assert.throws(() => compareReplayMetrics(missing, metrics(), objective));
  assert.throws(() => compareReplayMetrics(metrics({ rounds: 1.5 }), metrics(), objective));
  assert.throws(() => compareReplayMetrics(metrics({ rounds: Number.MAX_SAFE_INTEGER + 1 }), metrics(), objective));
});

test('objective metric order is digest- and comparison-significant', () => {
  const original = makeObjective();
  const reordered = makeObjective({ metrics: [
    { metric: 'generation_calls', direction: 'minimize' },
    { metric: 'best_quality', direction: 'maximize' },
    { metric: 'evaluation_calls', direction: 'minimize' },
    { metric: 'token_or_cost_units', direction: 'minimize' },
    { metric: 'rounds', direction: 'minimize' }
  ] });
  assert.notEqual(digestReplayObjective(original), digestReplayObjective(reordered));
  assert.equal(compareReplayMetrics(metrics({ best_quality: 740000, generation_calls: 3 }), metrics(), reordered), 'worse');
});
