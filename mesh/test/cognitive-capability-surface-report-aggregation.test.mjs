import assert from 'node:assert/strict';
import test from 'node:test';
import { cognitiveCapabilityProfileDigest } from '../src/lib/cognitive-capability-profile.mjs';
import * as surfaceModule from '../src/lib/cognitive-capability-surface-report.mjs';

const D = Object.freeze({
  a: 'a'.repeat(64), b: 'b'.repeat(64), c: 'c'.repeat(64),
  d: 'd'.repeat(64), e: 'e'.repeat(64), f: 'f'.repeat(64)
});

function profile() {
  return {
    schema: 'axiom-cognitive-capability-profile.v0', version: 0,
    status: 'inert-routing-metadata-laboratory', profile_id: 'cognitive.example.surface.aggregate',
    catalog_entry: { entry_id: 'provider:example', entry_version: '0.1.0', entry_digest: D.f },
    integration_class: 'model-provider', offering_ref: 'model.example.v1', capabilities: ['reasoning'],
    modalities: { input: ['text'], output: ['text'] },
    deployment: { locality: 'provider-remote', access_mode: 'api' },
    data_policy: { retention: 'unknown', training_use: 'unknown', exportability: 'unknown', policy_ref: 'policy.example.v1' },
    economics: { cost_class: 'medium', latency_class: 'interactive', context_class: 'large' },
    openness: { weight_access: 'closed', artifact_digest: null, license_ref: null },
    assurance: { ceiling: 'self-asserted', evidence_refs: ['evidence.example'] },
    created_at: '2026-09-06T12:00:00.000Z', updated_at: '2026-09-06T12:00:00.000Z',
    authority_effect: 'none', network_effect: 'none', credential_visibility: 'none', runtime_activation: false,
    selection_effect: 'eligibility-only'
  };
}

function observation(p, id, classification = 'pass') {
  return {
    schema: 'axiom-cognitive-capability-observation.v0', version: 0, status: 'inert-evidence',
    observation_id: id, profile_id: p.profile_id, profile_digest: cognitiveCapabilityProfileDigest(p), capability: 'reasoning',
    context: {
      context_ref: 'context.reasoning.v1', context_digest: D.a,
      task_family_ref: 'task-family.reasoning.v1', task_family_digest: D.b,
      difficulty_class: 'challenging', environment_ref: 'environment.node24.v1', environment_digest: D.c,
      toolset_ref: 'toolset.none.v1', toolset_digest: D.d
    },
    evaluation: {
      suite_ref: 'suite.reasoning.v1', suite_digest: D.a,
      metric_set_ref: 'metrics.reasoning.v1', metric_set_digest: D.b,
      threshold_ref: 'threshold.reasoning.v1', threshold_digest: D.c,
      method_ref: 'method.deterministic.v1', method_digest: D.d
    },
    result: {
      classification, confidence: 0.9, observed_metric_ref: `metric.${id}`, observed_metric_digest: D.e,
      failure_mode_refs: classification === 'fail' ? ['failure.reasoning.wrong-answer'] : []
    },
    evaluator: { evaluator_kind: 'synthetic-harness', evaluator_ref: 'evaluator.harness.v1', evaluator_principal_ref: null },
    evidence: {
      evidence_kind: 'evaluation-run', evidence_ref: `evidence.${id}`, evidence_digest: D.f,
      verification_ref: null, verification_digest: null, assurance_class: 'declared'
    },
    resource_observations: [
      { resource_class: 'input-tokens', basis: 'observed', amount: 100, unit: 'tokens', source_ref: `usage.${id}.1` },
      { resource_class: 'energy', basis: 'unknown', amount: null, unit: null, source_ref: null }
    ],
    observed_at: '2026-09-06T12:00:00.000Z', valid_until: '2026-10-06T12:00:00.000Z',
    recorded_at: '2026-09-06T12:01:00.000Z', contains_secret_material: false, authority_effect: 'none',
    network_effect: 'none', training_effect: 'none', spend_effect: 'none', runtime_activation: false,
    selection_effect: 'evidence-only'
  };
}

function derive(observations) {
  const p = profile();
  return surfaceModule.deriveCognitiveCapabilitySurfaceReport({
    report_id: 'capsurface.aggregate.v1', profile: p,
    observations: observations ?? [observation(p, 'capobs.aggregate.a')],
    assessment_at: '2026-09-06T13:00:00.000Z', recorded_at: '2026-09-06T13:01:00.000Z'
  });
}

function findBucket(cell, resourceClass, basis, unit) {
  return cell.resource_buckets.find(item =>
    item.resource_class === resourceClass && item.basis === basis && item.unit === unit);
}

test('same exact cell pass plus fail preserves direct conflict without a winner or score', () => {
  const p = profile();
  const pass = observation(p, 'capobs.aggregate.pass', 'pass');
  const fail = observation(p, 'capobs.aggregate.fail', 'fail');
  const report = surfaceModule.deriveCognitiveCapabilitySurfaceReport({
    report_id: 'capsurface.aggregate.v1', profile: p, observations: [pass, fail],
    assessment_at: '2026-09-06T13:00:00.000Z', recorded_at: '2026-09-06T13:01:00.000Z'
  });
  const surface = report.capability_surfaces[0];
  assert.equal(surface.current_cells.length, 1);
  const cell = surface.current_cells[0];
  assert.deepEqual(cell.classification_counts, { pass: 1, degraded: 0, fail: 1, indeterminate: 0 });
  assert.deepEqual(cell.classification_set, ['pass', 'fail']);
  assert.equal(cell.conflict_class, 'direct');
  assert.equal(surface.direct_conflict_cells, 1);
  assert.equal(surface.mixed_conflict_cells, 0);
  assert.equal(Object.hasOwn(cell, 'winner'), false);
  assert.equal(Object.hasOwn(surface, 'score'), false);
  assert.equal(Object.hasOwn(report, 'universal_score'), false);
});

test('same cell pass plus degraded is mixed conflict; indeterminate alone is none', () => {
  const p = profile();
  const pass = observation(p, 'capobs.aggregate.pass', 'pass');
  const degraded = observation(p, 'capobs.aggregate.degraded', 'degraded');
  let report = surfaceModule.deriveCognitiveCapabilitySurfaceReport({
    report_id: 'capsurface.aggregate.v1', profile: p, observations: [pass, degraded],
    assessment_at: '2026-09-06T13:00:00.000Z', recorded_at: '2026-09-06T13:01:00.000Z'
  });
  assert.equal(report.capability_surfaces[0].current_cells[0].conflict_class, 'mixed');
  assert.equal(report.capability_surfaces[0].mixed_conflict_cells, 1);

  const indeterminate = observation(p, 'capobs.aggregate.indeterminate', 'indeterminate');
  report = surfaceModule.deriveCognitiveCapabilitySurfaceReport({
    report_id: 'capsurface.aggregate.v1', profile: p, observations: [indeterminate],
    assessment_at: '2026-09-06T13:00:00.000Z', recorded_at: '2026-09-06T13:01:00.000Z'
  });
  assert.equal(report.capability_surfaces[0].current_cells[0].conflict_class, 'none');
});

test('different exact cells are contextual variation, never direct conflict', () => {
  const p = profile();
  const pass = observation(p, 'capobs.aggregate.context.pass', 'pass');
  const fail = observation(p, 'capobs.aggregate.context.fail', 'fail');
  fail.context = { ...fail.context, context_ref: 'context.reasoning.alt.v1', context_digest: D.f };
  const report = surfaceModule.deriveCognitiveCapabilitySurfaceReport({
    report_id: 'capsurface.aggregate.v1', profile: p, observations: [pass, fail],
    assessment_at: '2026-09-06T13:00:00.000Z', recorded_at: '2026-09-06T13:01:00.000Z'
  });
  const surface = report.capability_surfaces[0];
  assert.equal(surface.current_cells.length, 2);
  assert.equal(surface.direct_conflict_cells, 0);
  assert.equal(surface.variation_present, true);
});

test('stale future and not-yet-recorded observations remain inventory-only', () => {
  const p = profile();
  const stale = observation(p, 'capobs.aggregate.stale');
  stale.valid_until = '2026-09-06T12:30:00.000Z';
  const future = observation(p, 'capobs.aggregate.future');
  future.observed_at = '2026-09-06T14:00:00.000Z';
  future.valid_until = '2026-10-06T14:00:00.000Z';
  future.recorded_at = '2026-09-06T14:01:00.000Z';
  const delayed = observation(p, 'capobs.aggregate.delayed');
  delayed.recorded_at = '2026-09-06T14:00:00.000Z';
  const report = surfaceModule.deriveCognitiveCapabilitySurfaceReport({
    report_id: 'capsurface.aggregate.v1', profile: p, observations: [stale, future, delayed],
    assessment_at: '2026-09-06T13:00:00.000Z', recorded_at: '2026-09-06T13:01:00.000Z'
  });
  assert.deepEqual(report.source_observations.map(item => item.freshness).sort(), ['future', 'not-yet-recorded', 'stale']);
  assert.deepEqual(report.capability_surfaces[0].current_cells, []);
});

test('every exact context or evaluation binding participates in cell identity', () => {
  const p = profile();
  const base = observation(p, 'capobs.aggregate.base');
  const dimensions = [
    ['context', 'context_ref', 'context.reasoning.alt.v1'], ['context', 'context_digest', D.f],
    ['context', 'task_family_ref', 'task-family.alt.v1'], ['context', 'task_family_digest', D.f],
    ['context', 'difficulty_class', 'expert'], ['context', 'environment_ref', 'environment.alt.v1'],
    ['context', 'environment_digest', D.f], ['context', 'toolset_ref', 'toolset.alt.v1'],
    ['context', 'toolset_digest', D.f], ['evaluation', 'suite_ref', 'suite.alt.v1'],
    ['evaluation', 'suite_digest', D.f], ['evaluation', 'metric_set_ref', 'metrics.alt.v1'],
    ['evaluation', 'metric_set_digest', D.f], ['evaluation', 'threshold_ref', 'threshold.alt.v1'],
    ['evaluation', 'threshold_digest', D.f], ['evaluation', 'method_ref', 'method.alt.v1'],
    ['evaluation', 'method_digest', D.f]
  ];
  for (const [section, key, value] of dimensions) {
    const changed = structuredClone(base);
    changed.observation_id = `capobs.aggregate.changed.${section}.${key}`;
    changed[section][key] = value;
    const report = surfaceModule.deriveCognitiveCapabilitySurfaceReport({
      report_id: 'capsurface.aggregate.v1', profile: p, observations: [base, changed],
      assessment_at: '2026-09-06T13:00:00.000Z', recorded_at: '2026-09-06T13:01:00.000Z'
    });
    assert.equal(report.capability_surfaces[0].current_cells.length, 2, `${section}.${key}`);
  }
});

test('cell derivation is deterministic under source permutation with fixed classification order', () => {
  const p = profile();
  const observations = ['fail', 'indeterminate', 'pass', 'degraded'].map((classification, index) =>
    observation(p, `capobs.aggregate.order.${index}`, classification));
  const common = {
    report_id: 'capsurface.aggregate.v1', profile: p,
    assessment_at: '2026-09-06T13:00:00.000Z', recorded_at: '2026-09-06T13:01:00.000Z'
  };
  const forward = surfaceModule.deriveCognitiveCapabilitySurfaceReport({ ...common, observations });
  const reverse = surfaceModule.deriveCognitiveCapabilitySurfaceReport({ ...common, observations: [...observations].reverse() });
  assert.deepEqual(forward.capability_surfaces, reverse.capability_surfaces);
  assert.deepEqual(forward.capability_surfaces[0].current_cells[0].classification_set,
    ['pass', 'degraded', 'fail', 'indeterminate']);
});

test('preserves failure and evaluator/evidence provenance without independence claims', () => {
  const p = profile();
  const failed = observation(p, 'capobs.aggregate.provenance', 'fail');
  const report = surfaceModule.deriveCognitiveCapabilitySurfaceReport({
    report_id: 'capsurface.aggregate.v1', profile: p, observations: [failed],
    assessment_at: '2026-09-06T13:00:00.000Z', recorded_at: '2026-09-06T13:01:00.000Z'
  });
  const cell = report.capability_surfaces[0].current_cells[0];
  assert.deepEqual(cell.failure_modes, [{
    failure_mode_ref: 'failure.reasoning.wrong-answer', observation_refs: ['capobs.aggregate.provenance']
  }]);
  assert.deepEqual(cell.evaluator_evidence, [{
    evaluator_kind: 'synthetic-harness', evaluator_ref: 'evaluator.harness.v1', evaluator_principal_ref: null,
    assurance_class: 'declared', evidence_kind: 'evaluation-run', evidence_ref: 'evidence.capobs.aggregate.provenance',
    evidence_digest: D.f, verification_ref: null, verification_digest: null,
    observation_refs: ['capobs.aggregate.provenance']
  }]);
  assert.equal(Object.hasOwn(cell.evaluator_evidence[0], 'independent'), false);
});

test('resource ranges preserve exact basis and unit without averages or conversion', () => {
  const p = profile();
  const first = observation(p, 'capobs.aggregate.resource.a');
  first.resource_observations = [
    { resource_class: 'input-tokens', basis: 'observed', amount: 100, unit: 'tokens', source_ref: 'usage.a.1' },
    { resource_class: 'input-tokens', basis: 'observed', amount: 110, unit: 'tokens', source_ref: 'usage.a.2' },
    { resource_class: 'compute-time', basis: 'observed', amount: 500, unit: 'milliseconds', source_ref: 'usage.a.ms' },
    { resource_class: 'energy', basis: 'unknown', amount: null, unit: null, source_ref: null }
  ];
  const second = observation(p, 'capobs.aggregate.resource.b');
  second.resource_observations = [
    { resource_class: 'input-tokens', basis: 'observed', amount: 140, unit: 'tokens', source_ref: 'usage.b.1' },
    { resource_class: 'input-tokens', basis: 'estimated', amount: 150, unit: 'tokens', source_ref: 'usage.b.estimate' },
    { resource_class: 'compute-time', basis: 'observed', amount: 1, unit: 'seconds', source_ref: 'usage.b.s' }
  ];
  const report = surfaceModule.deriveCognitiveCapabilitySurfaceReport({
    report_id: 'capsurface.aggregate.v1', profile: p, observations: [first, second],
    assessment_at: '2026-09-06T13:00:00.000Z', recorded_at: '2026-09-06T13:01:00.000Z'
  });
  const cell = report.capability_surfaces[0].current_cells[0];
  const tokens = findBucket(cell, 'input-tokens', 'observed', 'tokens');
  assert.equal(tokens.measurement_count, 3);
  assert.equal(tokens.min_amount, 100);
  assert.equal(tokens.max_amount, 140);
  assert.deepEqual(tokens.observation_refs, ['capobs.aggregate.resource.a', 'capobs.aggregate.resource.b']);
  assert.ok(findBucket(cell, 'input-tokens', 'estimated', 'tokens'));
  assert.ok(findBucket(cell, 'compute-time', 'observed', 'milliseconds'));
  assert.ok(findBucket(cell, 'compute-time', 'observed', 'seconds'));
  const unknown = findBucket(cell, 'energy', 'unknown', null);
  assert.equal(unknown.measurement_count, 1);
  assert.equal(unknown.min_amount, null);
  assert.equal(unknown.max_amount, null);
  assert.equal(Object.hasOwn(tokens, 'average'), false);
});

test('report never averages confidence or emits a hidden routing utility', () => {
  const report = derive();
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /average_confidence|routing_weight|utility_score|universal_score|winner/);
});

test('verifier re-derives exact report and fails closed on aggregate or source substitution', () => {
  const p = profile();
  const source = observation(p, 'capobs.aggregate.verify');
  const report = surfaceModule.deriveCognitiveCapabilitySurfaceReport({
    report_id: 'capsurface.aggregate.verify.v1', profile: p, observations: [source],
    assessment_at: '2026-09-06T13:00:00.000Z', recorded_at: '2026-09-06T13:01:00.000Z'
  });
  assert.equal(typeof surfaceModule.verifyCognitiveCapabilitySurfaceReport, 'function');
  const summary = surfaceModule.verifyCognitiveCapabilitySurfaceReport(report, p, [source]);
  assert.equal(summary.valid, true);
  assert.equal(summary.report_digest, surfaceModule.cognitiveCapabilitySurfaceReportDigest(report));
  assert.equal(summary.authority_effect, 'none');
  assert.equal(summary.selection_effect, 'evidence-only');
  assert.equal(Object.isFrozen(summary), true);

  const tampered = structuredClone(report);
  tampered.capability_surfaces[0].direct_conflict_cells = 99;
  assert.throws(() => surfaceModule.verifyCognitiveCapabilitySurfaceReport(tampered, p, [source]), /does not match|mismatch/i);

  const substituted = observation(p, 'capobs.aggregate.verify.substitute');
  assert.throws(() => surfaceModule.verifyCognitiveCapabilitySurfaceReport(report, p, [substituted]), /does not match|mismatch/i);
});
