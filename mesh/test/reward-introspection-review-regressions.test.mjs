import assert from 'node:assert/strict';
import test from 'node:test';
import { validateRewardProbeManifest } from '../src/lib/reward-probe-manifest.mjs';

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
