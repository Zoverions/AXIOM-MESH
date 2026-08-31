import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { cognitiveCapabilityProfileDigest } from '../src/lib/cognitive-capability-profile.mjs';
import { cognitiveCapabilityObservationDigest } from '../src/lib/cognitive-capability-observation.mjs';
import {
  COGNITIVE_CAPABILITY_SURFACE_REPORT_SCHEMA,
  cognitiveCapabilitySurfaceReportDigest,
  deriveCognitiveCapabilitySurfaceReport,
  validateCognitiveCapabilitySurfaceReport
} from '../src/lib/cognitive-capability-surface-report.mjs';

function validProfile() {
  return {
    schema: 'axiom-cognitive-capability-profile.v0', version: 0,
    status: 'inert-routing-metadata-laboratory',
    profile_id: 'cognitive.example.remote.general',
    catalog_entry: { entry_id: 'provider:example-api', entry_version: '0.1.0', entry_digest: 'e'.repeat(64) },
    integration_class: 'model-provider', offering_ref: 'model.example.general',
    capabilities: ['reasoning', 'research', 'summarization'],
    modalities: { input: ['text'], output: ['text'] },
    deployment: { locality: 'provider-remote', access_mode: 'api' },
    data_policy: { retention: 'unknown', training_use: 'unknown', exportability: 'unknown', policy_ref: 'policy.example.provider.v1' },
    economics: { cost_class: 'medium', latency_class: 'interactive', context_class: 'large' },
    openness: { weight_access: 'closed', artifact_digest: null, license_ref: null },
    assurance: { ceiling: 'self-asserted', evidence_refs: ['evidence.example.provider-review'] },
    created_at: '2026-08-31T12:00:00.000Z', updated_at: '2026-08-31T12:00:00.000Z',
    authority_effect: 'none', network_effect: 'none', credential_visibility: 'none',
    runtime_activation: false, selection_effect: 'eligibility-only'
  };
}

function validObservation(profile = validProfile(), o = {}) {
  const base = {
    schema: 'axiom-cognitive-capability-observation.v0', version: 0, status: 'inert-evidence',
    observation_id: 'capobs.reasoning.project.v1', profile_id: profile.profile_id,
    profile_digest: cognitiveCapabilityProfileDigest(profile), capability: 'reasoning',
    context: {
      context_ref: 'context.reasoning.project.v1', context_digest: 'a'.repeat(64),
      task_family_ref: 'task-family.reasoning.project.v1', task_family_digest: 'b'.repeat(64),
      difficulty_class: 'challenging', environment_ref: 'environment.node22.v1', environment_digest: 'c'.repeat(64),
      toolset_ref: 'toolset.none.v1', toolset_digest: 'd'.repeat(64)
    },
    evaluation: {
      suite_ref: 'suite.reasoning.v1', suite_digest: 'a'.repeat(64),
      metric_set_ref: 'metrics.reasoning.v1', metric_set_digest: 'b'.repeat(64),
      threshold_ref: 'threshold.reasoning.v1', threshold_digest: 'c'.repeat(64),
      method_ref: 'method.deterministic.v1', method_digest: 'd'.repeat(64)
    },
    result: {
      classification: 'pass', confidence: 0.9,
      observed_metric_ref: 'metric-result.reasoning.v1', observed_metric_digest: 'a'.repeat(64), failure_mode_refs: []
    },
    evaluator: { evaluator_kind: 'synthetic-harness', evaluator_ref: 'evaluator.reasoning.harness.v1', evaluator_principal_ref: null },
    evidence: { evidence_kind: 'evaluation-run', evidence_ref: 'evidence.reasoning.run.v1', evidence_digest: 'b'.repeat(64), verification_ref: null, verification_digest: null, assurance_class: 'declared' },
    resource_observations: [
      { resource_class: 'input-tokens', basis: 'observed', amount: 2400, unit: 'tokens', source_ref: 'usage.reasoning.v1' },
      { resource_class: 'energy', basis: 'unknown', amount: null, unit: null, source_ref: null }
    ],
    observed_at: '2026-08-31T12:00:00.000Z', valid_until: '2026-09-30T12:00:00.000Z', recorded_at: '2026-08-31T12:01:00.000Z',
    contains_secret_material: false, authority_effect: 'none', network_effect: 'none', training_effect: 'none', spend_effect: 'none', runtime_activation: false, selection_effect: 'evidence-only'
  };
  if (o.observation_id) base.observation_id = o.observation_id;
  if (o.capability) base.capability = o.capability;
  if (o.classification) base.result.classification = o.classification;
  if (o.observed_metric_ref) base.result.observed_metric_ref = o.observed_metric_ref;
  if (o.observed_metric_digest) base.result.observed_metric_digest = o.observed_metric_digest;
  if (o.failure_mode_refs) base.result.failure_mode_refs = [...o.failure_mode_refs];
  if (o.context_ref) base.context.context_ref = o.context_ref;
  if (o.context_digest) base.context.context_digest = o.context_digest;
  if (o.toolset_ref) base.context.toolset_ref = o.toolset_ref;
  if (o.toolset_digest) base.context.toolset_digest = o.toolset_digest;
  if (o.observed_at) base.observed_at = o.observed_at;
  if (o.valid_until) base.valid_until = o.valid_until;
  if (o.recorded_at) base.recorded_at = o.recorded_at;
  return base;
}

function deriveAt13(profile, observations) {
  return deriveCognitiveCapabilitySurfaceReport({
    report_id: 'capsurface.example.v1', profile, observations,
    assessment_at: '2026-08-31T13:00:00.000Z', recorded_at: '2026-08-31T13:01:00.000Z'
  });
}

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

test('derives deterministic inert report and preserves zero evidence', () => {
  const profile = validProfile();
  const report = deriveAt13(profile, [validObservation(profile)]);
  assert.equal(report.schema, COGNITIVE_CAPABILITY_SURFACE_REPORT_SCHEMA);
  assert.equal(report.profile_id, profile.profile_id);
  assert.equal(report.profile_digest, cognitiveCapabilityProfileDigest(profile));
  assert.deepEqual(report.capability_surfaces.map(item => item.capability), ['reasoning', 'research', 'summarization']);
  const research = report.capability_surfaces.find(item => item.capability === 'research');
  assert.deepEqual(research.observation_counts, { current: 0, stale: 0, future: 0, not_yet_recorded: 0 });
  assert.deepEqual(research.current_cells, []);
  assert.equal(research.declared, true);
  assert.equal(report.authority_effect, 'none');
  assert.equal(report.selection_effect, 'evidence-only');
  assert.equal(Object.isFrozen(report), true);
  assert.equal(validateCognitiveCapabilitySurfaceReport(report).valid, true);
  assert.match(cognitiveCapabilitySurfaceReportDigest(report), /^[a-f0-9]{64}$/);
});

test('freshness classification follows time-travel-safe precedence', () => {
  const profile = validProfile();
  const current = validObservation(profile, { observation_id: 'obs.current' });
  const stale = validObservation(profile, { observation_id: 'obs.stale', valid_until: '2026-08-31T12:30:00.000Z' });
  const future = validObservation(profile, { observation_id: 'obs.future', observed_at: '2026-08-31T14:00:00.000Z', recorded_at: '2026-08-31T14:01:00.000Z', valid_until: '2026-09-30T14:00:00.000Z' });
  const notRecorded = validObservation(profile, { observation_id: 'obs.not-recorded', observed_at: '2026-08-31T12:10:00.000Z', recorded_at: '2026-08-31T14:00:00.000Z' });
  const report = deriveAt13(profile, [future, notRecorded, stale, current]);
  assert.deepEqual(Object.fromEntries(report.observations.map(item => [item.observation_id, item.freshness_class])), {
    'obs.current': 'current', 'obs.future': 'future', 'obs.not-recorded': 'not-yet-recorded', 'obs.stale': 'stale'
  });
  assert.deepEqual(report.capability_surfaces[0].observation_counts, { current: 1, stale: 1, future: 1, not_yet_recorded: 1 });
});

test('duplicate source identity fails closed', () => {
  const profile = validProfile();
  const first = validObservation(profile);
  const changed = validObservation(profile, { classification: 'fail', observed_metric_ref: 'metric.fail.v1', observed_metric_digest: 'f'.repeat(64) });
  assert.throws(() => deriveAt13(profile, [first, changed]), /duplicate.*observation/i);
  assert.equal(cognitiveCapabilityObservationDigest(first), cognitiveCapabilityObservationDigest(structuredClone(first)));
  assert.throws(() => deriveAt13(profile, [first, structuredClone(first)]), /duplicate.*observation/i);
});

test('profile binding and declared capability fail closed', () => {
  const profile = validProfile();
  const badId = validObservation(profile); badId.profile_id = 'cognitive.other';
  assert.throws(() => deriveAt13(profile, [badId]), /profile_id|profile/i);
  const badDigest = validObservation(profile); badDigest.profile_digest = 'f'.repeat(64);
  assert.throws(() => deriveAt13(profile, [badDigest]), /profile_digest|profile/i);
  const absent = validObservation(profile, { capability: 'coding' });
  assert.throws(() => deriveAt13(profile, [absent]), /capability.*declared/i);
});

test('timestamps, unknown fields, and hard boundaries fail closed', () => {
  const profile = validProfile();
  assert.throws(() => deriveCognitiveCapabilitySurfaceReport({ report_id: 'capsurface.badtime', profile, observations: [], assessment_at: '2026-08-31 13:00:00Z', recorded_at: '2026-08-31T13:01:00.000Z' }), /assessment_at|timestamp/i);
  assert.throws(() => deriveCognitiveCapabilitySurfaceReport({ report_id: 'capsurface.badorder', profile, observations: [], assessment_at: '2026-08-31T13:00:00.000Z', recorded_at: '2026-08-31T12:59:00.000Z' }), /recorded_at/i);
  const report = deriveAt13(profile, []);
  const extra = structuredClone(report); extra.score = 99;
  assert.throws(() => validateCognitiveCapabilitySurfaceReport(extra), /unknown field/i);
  const widened = structuredClone(report); widened.authority_effect = 'grant';
  assert.throws(() => validateCognitiveCapabilitySurfaceReport(widened), /boundary/i);
});

test('derivation does not mutate frozen source inputs', () => {
  const profile = deepFreeze(validProfile());
  const observation = deepFreeze(validObservation(profile));
  assert.doesNotThrow(() => deriveAt13(profile, [observation]));
});

test('production module imports only canonical, profile, and observation helpers', async () => {
  const source = await readFile(new URL('../src/lib/cognitive-capability-surface-report.mjs', import.meta.url), 'utf8');
  const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match => match[1]).sort();
  assert.deepEqual(imports, ['./canonical.mjs', './cognitive-capability-observation.mjs', './cognitive-capability-profile.mjs']);
});

test('same exact cell preserves direct conflict without winner selection', () => {
  const profile = validProfile();
  const pass = validObservation(profile, { observation_id: 'obs.pass' });
  const fail = validObservation(profile, {
    observation_id: 'obs.fail', classification: 'fail',
    observed_metric_ref: 'metric-result.fail.v1', observed_metric_digest: 'f'.repeat(64),
    failure_mode_refs: ['failure.reasoning.logic']
  });
  const reasoning = deriveAt13(profile, [fail, pass]).capability_surfaces[0];
  assert.equal(reasoning.current_cells.length, 1);
  assert.deepEqual(reasoning.current_cells[0].classification_counts, { pass: 1, degraded: 0, fail: 1, indeterminate: 0 });
  assert.deepEqual(reasoning.current_cells[0].classification_set, ['pass', 'fail']);
  assert.equal(reasoning.current_cells[0].conflict_class, 'direct');
  assert.equal(reasoning.direct_conflict_cells, 1);
  assert.equal(Object.hasOwn(reasoning, 'score'), false);
  assert.equal(Object.hasOwn(reasoning.current_cells[0], 'winner'), false);
  assert.equal(Object.hasOwn(reasoning.current_cells[0], 'confidence'), false);
});

test('mixed and indeterminate conflict semantics stay non-voting', () => {
  const profile = validProfile();
  const pair = (classification, suffix) => validObservation(profile, {
    observation_id: `obs.${suffix}`,
    classification,
    observed_metric_ref: `metric.${suffix}`,
    observed_metric_digest: suffix[0].repeat(64)
  });
  const passDegraded = deriveAt13(profile, [pair('pass', 'aaaa'), pair('degraded', 'bbbb')]).capability_surfaces[0].current_cells[0];
  assert.equal(passDegraded.conflict_class, 'mixed');
  const degradedFail = deriveAt13(profile, [pair('degraded', 'cccc'), pair('fail', 'dddd')]).capability_surfaces[0].current_cells[0];
  assert.equal(degradedFail.conflict_class, 'mixed');
  const passIndeterminate = deriveAt13(profile, [pair('pass', 'eeee'), pair('indeterminate', 'ffff')]).capability_surfaces[0].current_cells[0];
  assert.equal(passIndeterminate.conflict_class, 'none');
});

test('different exact contexts create variation instead of direct conflict', () => {
  const profile = validProfile();
  const pass = validObservation(profile, { observation_id: 'obs.pass.context' });
  const fail = validObservation(profile, {
    observation_id: 'obs.fail.other-context', classification: 'fail',
    context_ref: 'context.reasoning.other.v1', context_digest: 'f'.repeat(64),
    observed_metric_ref: 'metric-result.other.v1', observed_metric_digest: 'e'.repeat(64)
  });
  const reasoning = deriveAt13(profile, [pass, fail]).capability_surfaces[0];
  assert.equal(reasoning.current_cells.length, 2);
  assert.equal(reasoning.direct_conflict_cells, 0);
  assert.equal(reasoning.variation_present, true);
});

test('only current evidence participates in evaluator, failure, and resource aggregates', () => {
  const profile = validProfile();
  const current = validObservation(profile, { observation_id: 'obs.current.aggregate', failure_mode_refs: ['failure.shared'] });
  const stale = validObservation(profile, {
    observation_id: 'obs.stale.aggregate', classification: 'fail', failure_mode_refs: ['failure.stale'],
    valid_until: '2026-08-31T12:30:00.000Z', observed_metric_ref: 'metric.stale', observed_metric_digest: 'f'.repeat(64)
  });
  stale.evaluator = { evaluator_kind: 'human-reviewer', evaluator_ref: 'evaluator.stale.human', evaluator_principal_ref: null };
  const reasoning = deriveAt13(profile, [current, stale]).capability_surfaces[0];
  assert.deepEqual(reasoning.current_evaluator_coverage.evaluator_kinds, ['synthetic-harness']);
  assert.deepEqual(reasoning.current_failure_modes.map(x => x.failure_mode_ref), ['failure.shared']);
  assert.equal(reasoning.current_resource_ranges.some(x => x.resource_class === 'input-tokens'), true);
});

test('evaluator assurance and repeated failure attribution remain sorted and attributable', () => {
  const profile = validProfile();
  const one = validObservation(profile, { observation_id: 'obs.eval.a', failure_mode_refs: ['failure.shared'] });
  const two = validObservation(profile, {
    observation_id: 'obs.eval.b', classification: 'degraded',
    observed_metric_ref: 'metric.eval.b', observed_metric_digest: 'f'.repeat(64),
    failure_mode_refs: ['failure.shared', 'failure.zeta']
  });
  two.evaluator = { evaluator_kind: 'human-reviewer', evaluator_ref: 'evaluator.human.v1', evaluator_principal_ref: null };
  two.evidence = {
    evidence_kind: 'human-review', evidence_ref: 'evidence.human.v1', evidence_digest: 'c'.repeat(64),
    verification_ref: 'verification.human.v1', verification_digest: 'd'.repeat(64), assurance_class: 'verified-local'
  };
  const reasoning = deriveAt13(profile, [two, one]).capability_surfaces[0];
  assert.deepEqual(reasoning.current_evaluator_coverage.evaluator_kinds, ['human-reviewer', 'synthetic-harness']);
  assert.deepEqual(reasoning.current_evaluator_coverage.evaluator_refs, ['evaluator.human.v1', 'evaluator.reasoning.harness.v1']);
  assert.deepEqual(reasoning.current_assurance_classes, ['declared', 'verified-local']);
  const shared = reasoning.current_failure_modes.find(x => x.failure_mode_ref === 'failure.shared');
  assert.equal(shared.supporting_observations.length, 2);
  assert.deepEqual(shared.supporting_observations.map(x => x.observation_id), ['obs.eval.a', 'obs.eval.b']);
});

test('resource ranges count measurements while preserving basis, unit, and source attribution', () => {
  const profile = validProfile();
  const observation = validObservation(profile, { observation_id: 'obs.resources' });
  observation.resource_observations = [
    { resource_class: 'input-tokens', basis: 'observed', amount: 100, unit: 'tokens', source_ref: null },
    { resource_class: 'input-tokens', basis: 'observed', amount: 140, unit: 'tokens', source_ref: null },
    { resource_class: 'input-tokens', basis: 'estimated', amount: 120, unit: 'tokens', source_ref: null },
    { resource_class: 'input-tokens', basis: 'observed', amount: 2, unit: 'kilotokens', source_ref: null },
    { resource_class: 'energy', basis: 'unknown', amount: null, unit: null, source_ref: null }
  ];
  const ranges = deriveAt13(profile, [observation]).capability_surfaces[0].current_resource_ranges;
  const observed = ranges.find(x => x.resource_class === 'input-tokens' && x.basis === 'observed' && x.unit === 'tokens');
  assert.equal(observed.measurement_count, 2);
  assert.equal(observed.minimum, 100);
  assert.equal(observed.maximum, 140);
  assert.equal(observed.supporting_observations.length, 1);
  assert.equal(ranges.some(x => x.basis === 'estimated' && x.unit === 'tokens'), true);
  assert.equal(ranges.some(x => x.basis === 'observed' && x.unit === 'kilotokens'), true);
  const unknown = ranges.find(x => x.resource_class === 'energy' && x.basis === 'unknown');
  assert.equal(unknown.unit, null);
  assert.equal(unknown.minimum, null);
  assert.equal(unknown.maximum, null);
});

test('source order does not affect report content or digest and nested output is frozen', () => {
  const profile = validProfile();
  const one = validObservation(profile, { observation_id: 'obs.order.a' });
  const two = validObservation(profile, {
    observation_id: 'obs.order.b', context_ref: 'context.other', context_digest: 'f'.repeat(64),
    observed_metric_ref: 'metric.order.b', observed_metric_digest: 'e'.repeat(64)
  });
  const a = deriveAt13(profile, [one, two]);
  const b = deriveAt13(profile, [two, one]);
  assert.deepEqual(a, b);
  assert.equal(cognitiveCapabilitySurfaceReportDigest(a), cognitiveCapabilitySurfaceReportDigest(b));
  assert.equal(Object.isFrozen(a.capability_surfaces[0]), true);
  assert.equal(Object.isFrozen(a.capability_surfaces[0].current_cells), true);
});

test('verifier rejects derived-field tampering, source-set drift, and non-canonical order', async () => {
  const module = await import('../src/lib/cognitive-capability-surface-report.mjs');
  assert.equal(typeof module.verifyCognitiveCapabilitySurfaceReport, 'function');
  const profile = validProfile();
  const observation = validObservation(profile);
  const report = deriveAt13(profile, [observation]);
  const verified = module.verifyCognitiveCapabilitySurfaceReport(report, profile, [observation]);
  assert.equal(verified.valid, true);
  assert.equal(Object.isFrozen(verified), true);
  const tampered = structuredClone(report);
  tampered.capability_surfaces[0].observation_counts.current = 99;
  assert.throws(() => module.verifyCognitiveCapabilitySurfaceReport(tampered, profile, [observation]), /re-derivation|mismatch/i);
  assert.throws(() => module.verifyCognitiveCapabilitySurfaceReport(report, profile, []), /re-derivation|mismatch|inventory/i);

  const other = validObservation(profile, {
    observation_id: 'obs.zzz', context_ref: 'context.zzz', context_digest: 'f'.repeat(64),
    observed_metric_ref: 'metric.zzz', observed_metric_digest: 'e'.repeat(64)
  });
  const ordered = deriveAt13(profile, [observation, other]);
  const reversed = structuredClone(ordered);
  reversed.observations.reverse();
  assert.throws(() => module.verifyCognitiveCapabilitySurfaceReport(reversed, profile, [observation, other]), /canonical|re-derivation|mismatch/i);
});
