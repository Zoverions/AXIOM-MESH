import assert from 'node:assert/strict';
import test from 'node:test';

import { computeBehavioralAssuranceProfileDigest } from '../src/lib/behavioral-assurance-profile.mjs';
import {
  computeBehavioralDriftComparisonDigest,
  resolveBehavioralDriftComparison,
  validateBehavioralDriftComparison
} from '../src/lib/behavioral-drift-comparison.mjs';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);
const D = 'd'.repeat(64);
const E = 'e'.repeat(64);
const F = 'f'.repeat(64);
const ZERO = '0'.repeat(64);

function profile({
  id,
  subjectDigest,
  modelRevision,
  instructionDigest,
  harnessDigest,
  populationDigest,
  domain = 'research-question-answering',
  taskFamily = 'source-grounded-analysis',
  consequenceClass = 'informational',
  sampleCount = 500,
  minimumSampleCount = 100,
  metricValue = 0.95,
  from = '2026-09-01T00:00:00.000Z',
  to = '2026-09-10T00:00:00.000Z'
}) {
  const item = {
    schema: 'axiom-behavioral-assurance-profile.v0',
    version: 0,
    status: 'inert-behavioral-assurance-evidence',
    profile_id: id,
    subject: {
      subject_kind: 'agent-harness',
      subject_id: `${id}.subject`,
      subject_digest: subjectDigest,
      provider_model_revision: modelRevision,
      binding_strength: 'exact-artifact',
      instruction_policy_digest: instructionDigest,
      context_memory_policy_digest: C,
      tool_policy_digest: D,
      sampling_configuration_digest: E,
      environment_harness_digest: harnessDigest
    },
    populations: [{
      population_id: 'population.research.qa.v1',
      population_digest: populationDigest,
      domain,
      task_family: taskFamily,
      consequence_class: consequenceClass,
      evaluation_period: { from, to },
      sample_count: sampleCount,
      minimum_sample_count: minimumSampleCount,
      sample_sufficiency: sampleCount >= minimumSampleCount ? 'sufficient' : 'insufficient',
      inclusion_criteria: ['independently checked research QA'],
      exclusion_criteria: [],
      verification_sources: [{
        source_id: 'deterministic.source-checker.v1',
        source_digest: B,
        source_class: 'deterministic-checker',
        independence_group: 'checker-a'
      }],
      rubric_refs: [{ rubric_id: 'rubric.source-support.v1', rubric_digest: C }],
      dimensions: [{
        dimension_id: 'source-provenance-fidelity',
        evidence_state: 'accepted-evidence',
        metric_kind: 'probability',
        value: metricValue,
        sample_count: sampleCount,
        calibration_ref: 'calibration.source-support.v1',
        calibration_digest: D,
        calibration_state: 'reviewed'
      }],
      incident_events: [],
      known_limitations: [],
      distribution_shift_notes: []
    }],
    created_at: '2026-09-16T22:00:00.000Z',
    valid_until: '2026-10-16T22:00:00.000Z',
    profile_digest: ZERO,
    authority_effect: 'none',
    assurance_effect: 'evidence-only',
    network_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false,
    selection_effect: 'evidence-only'
  };
  item.profile_digest = computeBehavioralAssuranceProfileDigest(item);
  return item;
}

function pair(overrides = {}) {
  const predecessor = profile({
    id: 'behavior.profile.predecessor.v1',
    subjectDigest: A,
    modelRevision: 'fixture-model-r1',
    instructionDigest: B,
    harnessDigest: E,
    populationDigest: A,
    metricValue: 0.95,
    from: '2026-09-01T00:00:00.000Z',
    to: '2026-09-10T00:00:00.000Z',
    ...(overrides.predecessor || {})
  });
  const candidate = profile({
    id: 'behavior.profile.candidate.v1',
    subjectDigest: B,
    modelRevision: 'fixture-model-r2',
    instructionDigest: C,
    harnessDigest: F,
    populationDigest: A,
    metricValue: 0.87,
    from: '2026-09-11T00:00:00.000Z',
    to: '2026-09-15T00:00:00.000Z',
    ...(overrides.candidate || {})
  });
  return { predecessor, candidate };
}

function comparison(predecessor, candidate, overrides = {}) {
  const item = {
    schema: 'axiom-behavioral-drift-comparison.v0',
    version: 0,
    status: 'inert-behavioral-drift-evidence',
    comparison_id: 'behavior.drift.fixture.v1',
    predecessor: {
      profile_id: predecessor.profile_id,
      profile_digest: predecessor.profile_digest,
      population_id: predecessor.populations[0].population_id
    },
    candidate: {
      profile_id: candidate.profile_id,
      profile_digest: candidate.profile_digest,
      population_id: candidate.populations[0].population_id
    },
    comparison_method: {
      method_ref: 'method.behavior-drift.v1',
      method_digest: C,
      bounds_ref: 'bounds.behavior-drift.research.v1',
      bounds_digest: D
    },
    declared_change_factors: [
      'model-revision',
      'subject-artifact',
      'instruction-policy',
      'environment-harness',
      'time-window'
    ],
    dimension_deltas: [{
      dimension_id: 'source-provenance-fidelity',
      metric_kind: 'probability',
      predecessor_value: 0.95,
      candidate_value: 0.87,
      delta: -0.08
    }],
    drift_status: 'material-drift',
    compared_at: '2026-09-16T23:00:00.000Z',
    comparison_digest: ZERO,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false,
    selection_effect: 'evidence-only',
    ...overrides
  };
  item.comparison_digest = computeBehavioralDriftComparisonDigest(item);
  return item;
}

test('validates exact-profile drift evidence and preserves explicit change factors', () => {
  const { predecessor, candidate } = pair();
  const item = comparison(predecessor, candidate);
  const validated = validateBehavioralDriftComparison(item);
  const resolved = resolveBehavioralDriftComparison(item, predecessor, candidate);

  assert.equal(validated.valid, true);
  assert.equal(validated.authority_effect, 'none');
  assert.equal(resolved.drift_status, 'material-drift');
  assert.deepEqual(resolved.change_factors, item.declared_change_factors);
  assert.equal(resolved.compatibility, 'compatible');
  assert.equal(Object.hasOwn(resolved, 'route'), false);
  assert.equal(Object.hasOwn(resolved, 'winner'), false);
  assert.equal(Object.isFrozen(resolved), true);
});

test('metric deltas must exactly match the bound profile populations', () => {
  const { predecessor, candidate } = pair();
  const item = comparison(predecessor, candidate);
  item.dimension_deltas[0].candidate_value = 0.99;
  item.dimension_deltas[0].delta = 0.04;
  item.comparison_digest = computeBehavioralDriftComparisonDigest(item);

  assert.throws(
    () => resolveBehavioralDriftComparison(item, predecessor, candidate),
    /dimension.*bound|delta.*bound|candidate_value/i
  );
});

test('domain transfer is incompatible rather than silently treated as drift', () => {
  const { predecessor, candidate } = pair({
    candidate: { domain: 'medical-diagnosis' }
  });
  const item = comparison(predecessor, candidate, {
    dimension_deltas: [],
    drift_status: 'incompatible'
  });

  const resolved = resolveBehavioralDriftComparison(item, predecessor, candidate);
  assert.equal(resolved.compatibility, 'incompatible');
  assert.equal(resolved.drift_status, 'incompatible');
  assert.ok(resolved.compatibility_reason_codes.includes('domain-mismatch'));
});

test('insufficient population evidence cannot carry numeric drift claims', () => {
  const { predecessor, candidate } = pair({
    candidate: { sampleCount: 10, minimumSampleCount: 100 }
  });
  const item = comparison(predecessor, candidate, {
    dimension_deltas: [],
    drift_status: 'insufficient-evidence'
  });

  const resolved = resolveBehavioralDriftComparison(item, predecessor, candidate);
  assert.equal(resolved.compatibility, 'insufficient-evidence');
  assert.equal(resolved.drift_status, 'insufficient-evidence');
});

test('declared change factors must match exact subject and evaluation changes', () => {
  const { predecessor, candidate } = pair();
  const item = comparison(predecessor, candidate);
  item.declared_change_factors = ['model-revision'];
  item.comparison_digest = computeBehavioralDriftComparisonDigest(item);

  assert.throws(
    () => resolveBehavioralDriftComparison(item, predecessor, candidate),
    /change factor/i
  );
});

test('rejects authority-shaped fields and boundary widening', () => {
  const { predecessor, candidate } = pair();
  const item = comparison(predecessor, candidate);
  item.route = 'provider.fastest';
  assert.throws(() => computeBehavioralDriftComparisonDigest(item), /unknown field/i);

  for (const [field, value] of [
    ['authority_effect', 'allow'],
    ['network_effect', 'egress'],
    ['runtime_activation', true],
    ['selection_effect', 'select-and-run']
  ]) {
    assert.throws(
      () => comparison(predecessor, candidate, { [field]: value }),
      /boundary effect|effect boundary/i
    );
  }
});
