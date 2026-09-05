import assert from 'node:assert/strict';
import test from 'node:test';
import { cognitiveTopologyDigest } from '../src/lib/cognitive-topology.mjs';
import { rewardProbeManifestDigest } from '../src/lib/reward-probe-manifest.mjs';
import { rewardIntrospectionObservationDigest } from '../src/lib/reward-introspection-observation.mjs';
import {
  REWARD_CALIBRATION_REPORT_SCHEMA,
  rewardCalibrationReportDigest,
  resolveRewardCalibrationReport,
  validateRewardCalibrationReport
} from '../src/lib/reward-calibration-report.mjs';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);
const D = 'd'.repeat(64);
const E = 'e'.repeat(64);

function topology() {
  return {
    schema: 'axiom-cognitive-topology.v0', version: 0, status: 'inert-contract-laboratory',
    topology_id: 'topology.reward.calibration.v1', composition_id: 'composition.reward.calibration.v1', composition_digest: E,
    nodes: [{
      node_id: 'node.reward.calibration', model_id: 'model.reward.calibration', engagement: 'persistent',
      topology_role: 'evaluator', access_mode: 'local-runtime', custody: 'owner-local',
      weights: { state: 'open-acquired', artifact_digest: A, licence_ref: 'MIT' },
      persistence: { mode: 'local', provider_id: null, state_ref: 'state.reward.calibration.v1', exportability: 'full' },
      continuity_importance: 'important', fidelity_importance: 'important',
      adaptation_authorization_ref: null, lineage_ref: null, transition_policy_ref: null
    }],
    created_at: '2026-09-05T18:00:00.000Z', updated_at: '2026-09-05T18:00:00.000Z',
    contains_secret_material: false, authority_effect: 'none', network_effect: 'none', runtime_activation: false
  };
}

function target(t = topology()) {
  return {
    kind: 'topology-node', target_ref: t.topology_id, target_digest: cognitiveTopologyDigest(t),
    node_id: 'node.reward.calibration', model_id: 'model.reward.calibration', artifact_digest: A,
    profile_id: null, offering_ref: null, catalog_entry_id: null, catalog_entry_digest: null,
    artifact_digest_availability: 'exact'
  };
}

function manifest(calibrationClass = 'calibrated-probabilistic', t = topology()) {
  const calibrated = calibrationClass !== 'uncalibrated';
  return {
    schema: 'axiom-reward-probe-manifest.v0', version: 0, status: 'inert-evidence',
    manifest_id: `reward.probe.calibration.${calibrationClass}.v1`, probe_type: 'state-value',
    measurement_method: 'linear-probe', target: target(t),
    probe_artifact_ref: 'artifact.reward.probe.calibration.v1', probe_artifact_digest: B,
    method_ref: 'method.linear-probe.v1', evidence_ref: 'evidence.reward.probe.calibration.v1', evidence_digest: C,
    feature_descriptor: 'bounded state-value calibration probe', training_data_class: 'reviewed-evaluation-corpus',
    dataset_refs: ['dataset.reward.calibration.v1'],
    calibration: {
      class: calibrationClass,
      method_ref: calibrated ? 'calibration.probe.v1' : null,
      evidence_digest: calibrated ? D : null,
      population_ref: calibrated ? 'population.reasoning.calibration.v1' : null,
      score_range: calibrated ? [0, 1] : null,
      normalization_rule_ref: calibrated ? 'normalization.probe.v1' : null,
      uncertainty_method_ref: null
    },
    transfer_scope: 'exact-target-only', transfer_evidence_refs: [], limitations: [],
    source_refs: ['arxiv:2602.00986'], created_at: '2026-09-05T18:01:00.000Z',
    recorded_at: '2026-09-05T18:02:00.000Z', contains_secret_material: false,
    authority_effect: 'none', network_effect: 'none', credential_visibility: 'none', runtime_activation: false,
    routing_effect: 'none', promotion_effect: 'evidence-only'
  };
}

function observation(m, index, normalizedScore) {
  return {
    schema: 'axiom-reward-introspection-observation.v0', version: 0, status: 'inert-evidence',
    observation_id: `reward.observation.calibration.${index}.v1`,
    probe_manifest_id: m.manifest_id, probe_manifest_digest: rewardProbeManifestDigest(m),
    target_ref: m.target.target_ref, target_digest: m.target.target_digest,
    reasoning_state_ref: `reasoning.state.calibration.${index}.v1`, reasoning_state_digest: C,
    step_ref: `step.${index}`, raw_score: normalizedScore,
    normalized_score: normalizedScore, normalized_range: [0, 1],
    probability_semantics: m.calibration.class === 'calibrated-probabilistic',
    uncertainty: null, provenance_ref: `provenance.reward.calibration.${index}.v1`, provenance_digest: D,
    observed_at: `2026-09-05T18:${String(3 + index).padStart(2, '0')}:00.000Z`,
    recorded_at: `2026-09-05T18:${String(4 + index).padStart(2, '0')}:00.000Z`,
    contains_secret_material: false, authority_effect: 'none', network_effect: 'none',
    credential_visibility: 'none', runtime_activation: false, routing_effect: 'none', promotion_effect: 'evidence-only'
  };
}

function pair(item, outcome, index) {
  return {
    observation_id: item.observation_id,
    observation_digest: rewardIntrospectionObservationDigest(item),
    outcome,
    outcome_ref: `outcome.calibration.${index}.v1`,
    outcome_digest: E
  };
}

function metric(name, value) { return { name, value }; }

function report(m, observations, overrides = {}) {
  const pairs = observations.map((item, index) => pair(item, index % 2 === 0 ? 'success' : 'failure', index));
  return {
    schema: 'axiom-reward-calibration-report.v0', version: 0, status: 'inert-evidence',
    report_id: 'reward.calibration.report.v1',
    probe_manifest_id: m.manifest_id, probe_manifest_digest: rewardProbeManifestDigest(m),
    target_ref: m.target.target_ref, target_digest: m.target.target_digest,
    evaluation_set_ref: 'evaluation.set.reward.calibration.v1', evaluation_set_digest: C,
    task_domain: 'mathematical-reasoning', sample_count: pairs.length, minimum_sample_count: 2,
    inclusion_rule_ref: 'inclusion.reward.calibration.v1', inclusion_rule_digest: D,
    verification_source: {
      source_class: 'deterministic-checker', source_ref: 'verifier.math.checker.v1', source_digest: E,
      principal_ref: 'principal.external.verifier.v1', independent_from_probe: true
    },
    observation_refs: pairs,
    metrics: [
      metric('agreement-count', 2), metric('disagreement-count', 0), metric('success-rate', 0.5),
      metric('calibration-error', 0.08), metric('false-high-confidence-count', 0),
      metric('false-low-confidence-count', 0), metric('missing-invalid-observation-count', 0)
    ],
    calibration_status: 'calibrated',
    evaluated_from: '2026-09-05T18:03:00.000Z', evaluated_to: '2026-09-05T18:10:00.000Z',
    recorded_at: '2026-09-05T18:11:00.000Z', contains_secret_material: false,
    authority_effect: 'none', network_effect: 'none', credential_visibility: 'none', runtime_activation: false,
    routing_effect: 'none', promotion_effect: 'evidence-only',
    ...overrides
  };
}

function fixtures(calibrationClass = 'calibrated-probabilistic') {
  const m = manifest(calibrationClass);
  return { m, observations: [observation(m, 0, 0.9), observation(m, 1, 0.2)] };
}
function clone(value) { return structuredClone(value); }
function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

test('valid calibration report is deterministic, exactly bound, and evidence-only', () => {
  const { m, observations } = fixtures();
  const item = report(m, observations);
  assert.equal(REWARD_CALIBRATION_REPORT_SCHEMA, 'axiom-reward-calibration-report.v0');
  assert.equal(validateRewardCalibrationReport(item).valid, true);
  assert.match(rewardCalibrationReportDigest(item), /^[a-f0-9]{64}$/);
  assert.equal(rewardCalibrationReportDigest(item), rewardCalibrationReportDigest(Object.fromEntries(Object.entries(item).reverse())));
  const resolved = resolveRewardCalibrationReport(item, m, observations);
  assert.equal(resolved.calibration_status, 'calibrated');
  assert.equal(resolved.sample_count, 2);
  assert.equal(resolved.verification_source.independent_from_probe, true);
  assert.deepEqual(
    [resolved.authority_effect, resolved.network_effect, resolved.credential_visibility, resolved.runtime_activation, resolved.routing_effect, resolved.promotion_effect],
    ['none', 'none', 'none', false, 'none', 'evidence-only']
  );
  assert.equal(Object.isFrozen(resolved), true);
});

test('observation/outcome pairs bind exactly once to supplied observations', () => {
  const { m, observations } = fixtures();
  const good = report(m, observations);
  assert.equal(resolveRewardCalibrationReport(good, m, observations).sample_count, 2);
  const duplicate = clone(good);
  duplicate.observation_refs[1] = { ...duplicate.observation_refs[0] };
  assert.throws(() => validateRewardCalibrationReport(duplicate));
  const badDigest = clone(good);
  badDigest.observation_refs[0].observation_digest = B;
  assert.throws(() => resolveRewardCalibrationReport(badDigest, m, observations));
  const missing = clone(good);
  missing.observation_refs[0].observation_id = 'reward.observation.missing.v1';
  assert.throws(() => resolveRewardCalibrationReport(missing, m, observations));
});

test('manifest and target binding is exact across all supplied observations', () => {
  const { m, observations } = fixtures();
  const wrongManifest = clone(observations[1]);
  wrongManifest.probe_manifest_id = 'reward.probe.other.v1';
  assert.throws(() => resolveRewardCalibrationReport(report(m, observations), m, [observations[0], wrongManifest]));
  const wrongTarget = clone(observations[1]);
  wrongTarget.target_digest = B;
  assert.throws(() => resolveRewardCalibrationReport(report(m, observations), m, [observations[0], wrongTarget]));
  const wrongReport = report(m, observations);
  wrongReport.probe_manifest_digest = B;
  assert.throws(() => resolveRewardCalibrationReport(wrongReport, m, observations));
});

test('sample insufficiency is explicit and cannot be promoted to calibrated', () => {
  const { m, observations } = fixtures();
  const wrongCount = report(m, observations);
  wrongCount.sample_count = 3;
  assert.throws(() => validateRewardCalibrationReport(wrongCount));
  const insufficient = report(m, observations, { minimum_sample_count: 3, calibration_status: 'insufficient-evidence' });
  assert.equal(validateRewardCalibrationReport(insufficient).valid, true);
  assert.equal(resolveRewardCalibrationReport(insufficient, m, observations).calibration_status, 'insufficient-evidence');
  const falseClaim = clone(insufficient);
  falseClaim.calibration_status = 'calibrated';
  assert.throws(() => validateRewardCalibrationReport(falseClaim));
});

test('calibration-error requires probabilistic calibration in the bound manifest', () => {
  const { m: bounded, observations } = fixtures('calibrated-bounded');
  const item = report(bounded, observations);
  assert.equal(validateRewardCalibrationReport(item).valid, true);
  assert.throws(() => resolveRewardCalibrationReport(item, bounded, observations));
  item.metrics = item.metrics.filter(entry => entry.name !== 'calibration-error');
  assert.equal(resolveRewardCalibrationReport(item, bounded, observations).calibration_status, 'calibrated');
});

test('verification evidence must remain independent from probe and target identities', () => {
  const { m, observations } = fixtures();
  for (const mutate of [
    x => { x.verification_source.independent_from_probe = false; },
    x => { x.verification_source.principal_ref = m.manifest_id; },
    x => { x.verification_source.principal_ref = m.target.model_id; },
    x => { x.verification_source.source_ref = m.target.target_ref; }
  ]) {
    const item = report(m, observations); mutate(item);
    assert.throws(() => resolveRewardCalibrationReport(item, m, observations));
  }
});

test('metric/status/source vocabularies are closed and numeric metrics are finite', () => {
  const { m, observations } = fixtures();
  for (const mutate of [
    x => { x.metrics.push(metric('agreement-count', 1)); },
    x => { x.metrics[0].name = 'magic-score'; },
    x => { x.metrics[0].value = Number.NaN; },
    x => { x.metrics[0].value = Number.POSITIVE_INFINITY; },
    x => { x.calibration_status = 'perfect'; },
    x => { x.verification_source.source_class = 'self'; }
  ]) {
    const item = report(m, observations); mutate(item);
    assert.throws(() => validateRewardCalibrationReport(item));
  }
});

test('chronology, raw/action fields, and effect widening fail closed', () => {
  const { m, observations } = fixtures();
  for (const mutate of [
    x => { x.evaluated_to = '2026-09-05T18:02:00.000Z'; },
    x => { x.recorded_at = '2026-09-05T18:09:00.000Z'; },
    x => { x.prompt = 'secret'; }, x => { x.chain_of_thought = 'secret'; },
    x => { x.recommended_action = 'promote'; }, x => { x.route_to = 'model.other'; },
    x => { x.approve_candidate = true; }, x => { x.execute = true; }, x => { x.credential = 'secret'; },
    x => { x.contains_secret_material = true; }, x => { x.authority_effect = 'grant'; },
    x => { x.network_effect = 'egress'; }, x => { x.credential_visibility = 'read'; },
    x => { x.runtime_activation = true; }, x => { x.routing_effect = 'route'; }, x => { x.promotion_effect = 'promote'; }
  ]) {
    const item = report(m, observations); mutate(item);
    assert.throws(() => validateRewardCalibrationReport(item));
  }
});

test('validator and resolver preserve deeply frozen caller inputs', () => {
  const { m, observations } = fixtures();
  const fm = deepFreeze(m);
  const fo = deepFreeze(observations);
  const item = deepFreeze(report(fm, fo));
  const before = JSON.stringify({ fm, fo, item });
  validateRewardCalibrationReport(item);
  resolveRewardCalibrationReport(item, fm, fo);
  assert.equal(JSON.stringify({ fm, fo, item }), before);
});
