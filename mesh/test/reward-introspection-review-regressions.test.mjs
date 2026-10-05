import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { validateRewardProbeManifest } from '../src/lib/reward-probe-manifest.mjs';
import { validateRewardCalibrationReport } from '../src/lib/reward-calibration-report.mjs';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);

function manifest(target) {
  return {
    schema: 'axiom-reward-probe-manifest.v0',
    version: 0,
    status: 'inert-evidence',
    manifest_id: 'reward.probe.review-regression.v1',
    probe_type: 'state-value',
    measurement_method: 'linear-probe',
    target,
    probe_artifact_ref: 'artifact.reward.probe.review-regression.v1',
    probe_artifact_digest: B,
    method_ref: 'method.linear-probe.v1',
    evidence_ref: 'evidence.reward.probe.review-regression.v1',
    evidence_digest: A,
    feature_descriptor: 'review regression probe',
    training_data_class: 'reviewed-evaluation-corpus',
    dataset_refs: [],
    calibration: {
      class: 'uncalibrated',
      method_ref: null,
      evidence_digest: null,
      population_ref: null,
      score_range: null,
      normalization_rule_ref: null,
      uncertainty_method_ref: null
    },
    transfer_scope: 'exact-target-only',
    transfer_evidence_refs: [],
    limitations: [],
    source_refs: [],
    created_at: '2026-09-05T19:30:00.000Z',
    recorded_at: '2026-09-05T19:31:00.000Z',
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false,
    routing_effect: 'none',
    promotion_effect: 'evidence-only'
  };
}

function calibrationReport(overrides = {}) {
  return {
    schema: 'axiom-reward-calibration-report.v0',
    version: 0,
    status: 'inert-evidence',
    report_id: 'reward.calibration.review-regression.v1',
    probe_manifest_id: 'reward.probe.review-regression.v1',
    probe_manifest_digest: A,
    target_ref: 'target.review-regression.v1',
    target_digest: B,
    evaluation_set_ref: 'evaluation.review-regression.v1',
    evaluation_set_digest: A,
    task_domain: 'review-regression',
    sample_count: 1,
    minimum_sample_count: 1,
    inclusion_rule_ref: 'inclusion.review-regression.v1',
    inclusion_rule_digest: B,
    verification_source: {
      source_class: 'deterministic-checker',
      source_ref: 'verifier.review-regression.v1',
      source_digest: A,
      principal_ref: 'principal.external.review-regression.v1',
      independent_from_probe: true
    },
    observation_refs: [{
      observation_id: 'reward.observation.review-regression.v1',
      observation_digest: A,
      outcome: 'success',
      outcome_ref: 'outcome.review-regression.v1',
      outcome_digest: B
    }],
    metrics: [{ name: 'agreement-count', value: 1 }],
    calibration_status: 'calibrated',
    evaluated_from: '2026-09-05T19:30:00.000Z',
    evaluated_to: '2026-09-05T19:31:00.000Z',
    recorded_at: '2026-09-05T19:32:00.000Z',
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false,
    routing_effect: 'none',
    promotion_effect: 'evidence-only',
    ...overrides
  };
}

test('topology-node reward targets reject provider-controlled artifact availability', () => {
  const target = {
    kind: 'topology-node',
    target_ref: 'topology.review-regression.v1',
    target_digest: A,
    node_id: 'node.review-regression',
    model_id: 'model.review-regression',
    artifact_digest: null,
    profile_id: null,
    offering_ref: null,
    catalog_entry_id: null,
    catalog_entry_digest: null,
    artifact_digest_availability: 'unavailable-provider-controlled'
  };

  assert.throws(() => validateRewardProbeManifest(manifest(target)));
});

test('runtime-offering reward targets reject an unbound model_id', () => {
  const target = {
    kind: 'runtime-offering',
    target_ref: 'profile.review-regression.v1',
    target_digest: A,
    node_id: null,
    model_id: 'model.unbound.review-regression',
    artifact_digest: null,
    profile_id: 'profile.review-regression.v1',
    offering_ref: 'offering.review-regression.v1',
    catalog_entry_id: 'catalog.review-regression.v1',
    catalog_entry_digest: B,
    artifact_digest_availability: 'unavailable-provider-controlled'
  };

  assert.throws(() => validateRewardProbeManifest(manifest(target)));
});

test('calibration sample bounds cannot exceed the representable observation set', () => {
  const oversizedMinimum = calibrationReport({
    minimum_sample_count: 100001,
    calibration_status: 'insufficient-evidence'
  });
  assert.throws(() => validateRewardCalibrationReport(oversizedMinimum));

  const schema = JSON.parse(readFileSync(
    new URL('../config/reward-calibration-report-v0.schema.json', import.meta.url),
    'utf8'
  ));
  const observationMaximum = schema.properties.observation_refs.maxItems;
  assert.equal(schema.properties.sample_count.maximum, observationMaximum);
  assert.equal(schema.properties.minimum_sample_count.maximum, observationMaximum);
});
