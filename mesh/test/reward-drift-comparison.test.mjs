import assert from 'node:assert/strict';
import test from 'node:test';
import { rewardProbeManifestDigest } from '../src/lib/reward-probe-manifest.mjs';
import { rewardCalibrationReportDigest } from '../src/lib/reward-calibration-report.mjs';
import {
  REWARD_DRIFT_COMPARISON_SCHEMA,
  rewardDriftComparisonDigest,
  resolveRewardDriftComparison,
  validateRewardDriftComparison
} from '../src/lib/reward-drift-comparison.mjs';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);
const D = 'd'.repeat(64);
const E = 'e'.repeat(64);
const F = 'f'.repeat(64);

function target(id, modelId, artifactDigest) {
  return {
    kind: 'model-artifact', target_ref: id, target_digest: artifactDigest,
    node_id: null, model_id: modelId, artifact_digest: artifactDigest,
    profile_id: null, offering_ref: null, catalog_entry_id: null, catalog_entry_digest: null,
    artifact_digest_availability: 'exact'
  };
}

function manifest({
  id = 'reward.probe.drift.reference.v1',
  targetId = 'artifact.reward.reference.v1',
  modelId = 'model.reward.reference',
  artifactDigest = A,
  probeType = 'state-value',
  method = 'linear-probe',
  calibrationClass = 'calibrated-probabilistic',
  normalization = 'normalization.reward.drift.v1',
  transferScope = 'reviewed-cross-target'
} = {}) {
  return {
    schema: 'axiom-reward-probe-manifest.v0', version: 0, status: 'inert-evidence',
    manifest_id: id, probe_type: probeType, measurement_method: method,
    target: target(targetId, modelId, artifactDigest),
    probe_artifact_ref: 'artifact.reward.probe.drift.v1', probe_artifact_digest: C,
    method_ref: 'method.reward.probe.drift.v1', evidence_ref: 'evidence.reward.probe.drift.v1', evidence_digest: D,
    feature_descriptor: 'bounded drift comparison probe', training_data_class: 'reviewed-evaluation-corpus',
    dataset_refs: ['dataset.reward.drift.v1'],
    calibration: {
      class: calibrationClass,
      method_ref: 'calibration.reward.drift.v1', evidence_digest: E,
      population_ref: 'population.reward.drift.v1', score_range: [0, 1],
      normalization_rule_ref: normalization, uncertainty_method_ref: null
    },
    transfer_scope: transferScope,
    transfer_evidence_refs: transferScope === 'exact-target-only' ? [] : ['evidence.transfer.reward.drift.v1'],
    limitations: [], source_refs: ['arxiv:2602.00986'],
    created_at: '2026-09-05T18:00:00.000Z', recorded_at: '2026-09-05T18:01:00.000Z',
    contains_secret_material: false, authority_effect: 'none', network_effect: 'none',
    credential_visibility: 'none', runtime_activation: false, routing_effect: 'none', promotion_effect: 'evidence-only'
  };
}

function metric(name, value) { return { name, value }; }

function calibrationReport(m, {
  id = 'reward.calibration.drift.reference.v1',
  taskDomain = 'mathematical-reasoning',
  status = 'calibrated',
  calibrationError = 0.08,
  successRate = 0.75,
  disagreement = 2
} = {}) {
  const refs = [0, 1, 2, 3].map(index => ({
    observation_id: `reward.observation.drift.${id}.${index}`,
    observation_digest: [A, B, C, D][index],
    outcome: index < 3 ? 'success' : 'failure',
    outcome_ref: `outcome.reward.drift.${index}`,
    outcome_digest: E
  }));
  return {
    schema: 'axiom-reward-calibration-report.v0', version: 0, status: 'inert-evidence',
    report_id: id, probe_manifest_id: m.manifest_id, probe_manifest_digest: rewardProbeManifestDigest(m),
    target_ref: m.target.target_ref, target_digest: m.target.target_digest,
    evaluation_set_ref: `evaluation.set.${id}`, evaluation_set_digest: F,
    task_domain: taskDomain, sample_count: 4, minimum_sample_count: 2,
    inclusion_rule_ref: 'inclusion.reward.drift.v1', inclusion_rule_digest: D,
    verification_source: {
      source_class: 'deterministic-checker', source_ref: `verifier.${id}`, source_digest: E,
      principal_ref: 'principal.external.reward.verifier', independent_from_probe: true
    },
    observation_refs: refs,
    metrics: [
      metric('agreement-count', 2), metric('disagreement-count', disagreement),
      metric('success-rate', successRate), metric('calibration-error', calibrationError),
      metric('false-high-confidence-count', 1), metric('false-low-confidence-count', 0),
      metric('missing-invalid-observation-count', 0)
    ],
    calibration_status: status,
    evaluated_from: '2026-09-05T18:02:00.000Z', evaluated_to: '2026-09-05T18:10:00.000Z',
    recorded_at: '2026-09-05T18:11:00.000Z', contains_secret_material: false,
    authority_effect: 'none', network_effect: 'none', credential_visibility: 'none', runtime_activation: false,
    routing_effect: 'none', promotion_effect: 'evidence-only'
  };
}

function side(m, report) { return { manifest: m, report }; }

function comparison(predecessor, candidate, overrides = {}) {
  return {
    schema: 'axiom-reward-drift-comparison.v0', version: 0, status: 'inert-evidence',
    comparison_id: 'reward.drift.reference.to.candidate.v1',
    predecessor: {
      probe_manifest_id: predecessor.manifest.manifest_id,
      probe_manifest_digest: rewardProbeManifestDigest(predecessor.manifest),
      report_id: predecessor.report.report_id,
      report_digest: rewardCalibrationReportDigest(predecessor.report),
      target_ref: predecessor.manifest.target.target_ref,
      target_digest: predecessor.manifest.target.target_digest
    },
    candidate: {
      probe_manifest_id: candidate.manifest.manifest_id,
      probe_manifest_digest: rewardProbeManifestDigest(candidate.manifest),
      report_id: candidate.report.report_id,
      report_digest: rewardCalibrationReportDigest(candidate.report),
      target_ref: candidate.manifest.target.target_ref,
      target_digest: candidate.manifest.target.target_digest
    },
    comparison_method: {
      method_ref: 'method.reward.drift.compare.v1', method_digest: C,
      bounds_ref: 'bounds.reward.drift.v1', bounds_digest: D
    },
    metric_deltas: [
      { name: 'calibration-error', predecessor_value: 0.08, candidate_value: 0.1, delta: 0.02 },
      { name: 'success-rate', predecessor_value: 0.75, candidate_value: 0.8, delta: 0.05 },
      { name: 'disagreement-count', predecessor_value: 2, candidate_value: 1, delta: -1 }
    ],
    drift_status: 'stable-within-declared-bounds',
    compared_at: '2026-09-05T18:12:00.000Z', recorded_at: '2026-09-05T18:13:00.000Z',
    contains_secret_material: false, authority_effect: 'none', network_effect: 'none',
    credential_visibility: 'none', runtime_activation: false, routing_effect: 'none', promotion_effect: 'evidence-only',
    ...overrides
  };
}

function fixtures() {
  const pm = manifest();
  const cm = manifest({
    id: 'reward.probe.drift.candidate.v1', targetId: 'artifact.reward.candidate.v1',
    modelId: 'model.reward.candidate', artifactDigest: B
  });
  return {
    predecessor: side(pm, calibrationReport(pm)),
    candidate: side(cm, calibrationReport(cm, {
      id: 'reward.calibration.drift.candidate.v1', calibrationError: 0.1, successRate: 0.8, disagreement: 1
    }))
  };
}
function clone(value) { return structuredClone(value); }
function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

test('compatible drift comparison is deterministic, directional, and evidence-only', () => {
  const { predecessor, candidate } = fixtures();
  const item = comparison(predecessor, candidate);
  assert.equal(REWARD_DRIFT_COMPARISON_SCHEMA, 'axiom-reward-drift-comparison.v0');
  assert.equal(validateRewardDriftComparison(item).valid, true);
  assert.match(rewardDriftComparisonDigest(item), /^[a-f0-9]{64}$/);
  assert.equal(rewardDriftComparisonDigest(item), rewardDriftComparisonDigest(Object.fromEntries(Object.entries(item).reverse())));
  const resolved = resolveRewardDriftComparison(item, predecessor, candidate);
  assert.equal(resolved.drift_status, 'stable-within-declared-bounds');
  assert.deepEqual(resolved.compatibility_reason_codes, []);
  assert.equal(resolved.predecessor.report_id, predecessor.report.report_id);
  assert.equal(resolved.candidate.report_id, candidate.report.report_id);
  assert.deepEqual(
    [resolved.authority_effect, resolved.network_effect, resolved.credential_visibility, resolved.runtime_activation, resolved.routing_effect, resolved.promotion_effect],
    ['none', 'none', 'none', false, 'none', 'evidence-only']
  );
  assert.equal(Object.isFrozen(resolved), true);
});

test('metric deltas must exactly equal the bound calibration report metrics', () => {
  const { predecessor, candidate } = fixtures();
  for (const mutate of [
    x => { x.metric_deltas[0].predecessor_value = 99; },
    x => { x.metric_deltas[1].candidate_value = 99; },
    x => { x.metric_deltas[2].delta = 99; },
    x => { x.metric_deltas.push({ ...x.metric_deltas[0] }); },
    x => { x.metric_deltas[0].name = 'magic-score'; },
    x => { x.metric_deltas[0].delta = Number.NaN; }
  ]) {
    const item = comparison(predecessor, candidate); mutate(item);
    assert.throws(() => resolveRewardDriftComparison(item, predecessor, candidate));
  }
});

test('probe type, method, calibration, normalization, task domain, metric set, and transfer incompatibilities fail to incompatible', () => {
  const cases = [
    ['probe-type-mismatch', c => { c.manifest.probe_type = 'reward-prediction-error'; }],
    ['measurement-method-mismatch', c => { c.manifest.measurement_method = 'sparse-feature-probe'; }],
    ['calibration-class-mismatch', c => { c.manifest.calibration.class = 'calibrated-bounded'; }],
    ['normalization-semantics-mismatch', c => { c.manifest.calibration.normalization_rule_ref = 'normalization.other.v1'; }],
    ['task-domain-mismatch', c => { c.report.task_domain = 'coding'; }],
    ['metric-set-mismatch', c => { c.report.metrics = c.report.metrics.filter(metric => metric.name !== 'disagreement-count'); }],
    ['target-transfer-not-supported', c => { c.manifest.transfer_scope = 'exact-target-only'; c.manifest.transfer_evidence_refs = []; }]
  ];
  for (const [reason, mutateCandidate] of cases) {
    const { predecessor, candidate } = fixtures();
    mutateCandidate(candidate);
    candidate.report.probe_manifest_digest = rewardProbeManifestDigest(candidate.manifest);
    const item = comparison(predecessor, candidate, { metric_deltas: [], drift_status: 'incompatible' });
    const resolved = resolveRewardDriftComparison(item, predecessor, candidate);
    assert.equal(resolved.drift_status, 'incompatible');
    assert.ok(resolved.compatibility_reason_codes.includes(reason), reason);
    assert.deepEqual(resolved.metric_deltas, []);
  }
});

test('incompatible evidence cannot carry numeric drift claims or a non-incompatible status', () => {
  const { predecessor, candidate } = fixtures();
  candidate.manifest.probe_type = 'reward-prediction-error';
  candidate.report.probe_manifest_digest = rewardProbeManifestDigest(candidate.manifest);
  const numeric = comparison(predecessor, candidate, { drift_status: 'incompatible' });
  assert.throws(() => resolveRewardDriftComparison(numeric, predecessor, candidate));
  const wrongStatus = comparison(predecessor, candidate, { metric_deltas: [], drift_status: 'material-drift' });
  assert.throws(() => resolveRewardDriftComparison(wrongStatus, predecessor, candidate));
});

test('insufficient calibration evidence produces insufficient-evidence without numeric drift', () => {
  const { predecessor, candidate } = fixtures();
  candidate.report.minimum_sample_count = 5;
  candidate.report.calibration_status = 'insufficient-evidence';
  const item = comparison(predecessor, candidate, { metric_deltas: [], drift_status: 'insufficient-evidence' });
  const resolved = resolveRewardDriftComparison(item, predecessor, candidate);
  assert.equal(resolved.drift_status, 'insufficient-evidence');
  assert.deepEqual(resolved.metric_deltas, []);
  const falseClaim = comparison(predecessor, candidate, { drift_status: 'material-drift' });
  assert.throws(() => resolveRewardDriftComparison(falseClaim, predecessor, candidate));
});

test('exact predecessor/candidate manifest and report bindings fail closed on drift', () => {
  const { predecessor, candidate } = fixtures();
  for (const mutate of [
    x => { x.predecessor.report_digest = A; },
    x => { x.predecessor.probe_manifest_digest = A; },
    x => { x.candidate.report_id = 'reward.report.other.v1'; },
    x => { x.candidate.target_digest = A; }
  ]) {
    const item = comparison(predecessor, candidate); mutate(item);
    assert.throws(() => resolveRewardDriftComparison(item, predecessor, candidate));
  }
});

test('comparison method/bounds provenance is mandatory but no universal threshold is embedded', () => {
  const { predecessor, candidate } = fixtures();
  const good = comparison(predecessor, candidate, { drift_status: 'material-drift' });
  assert.equal(resolveRewardDriftComparison(good, predecessor, candidate).drift_status, 'material-drift');
  for (const mutate of [
    x => { x.comparison_method.method_digest = 'bad'; },
    x => { x.comparison_method.bounds_digest = 'bad'; },
    x => { x.comparison_method.threshold = 0.1; }
  ]) {
    const item = comparison(predecessor, candidate); mutate(item);
    assert.throws(() => validateRewardDriftComparison(item));
  }
});

test('chronology, raw/action fields, and effect widening fail closed', () => {
  const { predecessor, candidate } = fixtures();
  for (const mutate of [
    x => { x.recorded_at = '2026-09-05T18:11:00.000Z'; },
    x => { x.prompt = 'secret'; }, x => { x.chain_of_thought = 'secret'; },
    x => { x.route_to = 'model.other'; }, x => { x.promote_candidate = true; },
    x => { x.contains_secret_material = true; }, x => { x.authority_effect = 'grant'; },
    x => { x.network_effect = 'egress'; }, x => { x.credential_visibility = 'read'; },
    x => { x.runtime_activation = true; }, x => { x.routing_effect = 'route'; }, x => { x.promotion_effect = 'promote'; }
  ]) {
    const item = comparison(predecessor, candidate); mutate(item);
    assert.throws(() => validateRewardDriftComparison(item));
  }
});

test('validator and resolver preserve deeply frozen inputs', () => {
  const { predecessor, candidate } = fixtures();
  const p = deepFreeze(predecessor);
  const c = deepFreeze(candidate);
  const item = deepFreeze(comparison(p, c));
  const before = JSON.stringify({ p, c, item });
  validateRewardDriftComparison(item);
  resolveRewardDriftComparison(item, p, c);
  assert.equal(JSON.stringify({ p, c, item }), before);
});
