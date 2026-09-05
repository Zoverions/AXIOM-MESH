import assert from 'node:assert/strict';
import test from 'node:test';
import { cognitiveTopologyDigest } from '../src/lib/cognitive-topology.mjs';
import { rewardProbeManifestDigest } from '../src/lib/reward-probe-manifest.mjs';
import {
  REWARD_INTROSPECTION_OBSERVATION_SCHEMA,
  rewardIntrospectionObservationDigest,
  resolveRewardIntrospectionObservation,
  validateRewardIntrospectionObservation
} from '../src/lib/reward-introspection-observation.mjs';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);
const D = 'd'.repeat(64);

function topology() {
  return {
    schema: 'axiom-cognitive-topology.v0', version: 0, status: 'inert-contract-laboratory',
    topology_id: 'topology.reward.obs.v1', composition_id: 'composition.reward.obs.v1', composition_digest: D,
    nodes: [{
      node_id: 'node.reward.obs', model_id: 'model.reward.obs', engagement: 'persistent',
      topology_role: 'evaluator', access_mode: 'local-runtime', custody: 'owner-local',
      weights: { state: 'open-acquired', artifact_digest: A, licence_ref: 'MIT' },
      persistence: { mode: 'local', provider_id: null, state_ref: 'state.reward.obs.v1', exportability: 'full' },
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
    node_id: 'node.reward.obs', model_id: 'model.reward.obs', artifact_digest: A,
    profile_id: null, offering_ref: null, catalog_entry_id: null, catalog_entry_digest: null,
    artifact_digest_availability: 'exact'
  };
}

function manifest(t = topology(), calibrationClass = 'calibrated-probabilistic') {
  const calibrated = calibrationClass !== 'uncalibrated';
  return {
    schema: 'axiom-reward-probe-manifest.v0', version: 0, status: 'inert-evidence',
    manifest_id: `reward.probe.obs.${calibrationClass}.v1`, probe_type: 'state-value',
    measurement_method: 'linear-probe', target: target(t),
    probe_artifact_ref: 'artifact.reward.probe.obs.v1', probe_artifact_digest: B,
    method_ref: 'method.linear-probe.v1', evidence_ref: 'evidence.reward.probe.obs.v1', evidence_digest: C,
    feature_descriptor: 'bounded state-value probe', training_data_class: 'reviewed-evaluation-corpus',
    dataset_refs: ['dataset.reward.obs.v1'],
    calibration: {
      class: calibrationClass,
      method_ref: calibrated ? 'calibration.obs.v1' : null,
      evidence_digest: calibrated ? D : null,
      population_ref: calibrated ? 'population.reasoning.obs.v1' : null,
      score_range: calibrated ? [0, 1] : null,
      normalization_rule_ref: calibrated ? 'normalization.obs.v1' : null,
      uncertainty_method_ref: calibrated ? 'uncertainty.bootstrap.v1' : null
    },
    transfer_scope: 'exact-target-only', transfer_evidence_refs: [], limitations: [],
    source_refs: ['arxiv:2602.00986'], created_at: '2026-09-05T18:01:00.000Z',
    recorded_at: '2026-09-05T18:02:00.000Z', contains_secret_material: false,
    authority_effect: 'none', network_effect: 'none', credential_visibility: 'none', runtime_activation: false,
    routing_effect: 'none', promotion_effect: 'evidence-only'
  };
}

function observation(m, overrides = {}) {
  return {
    schema: 'axiom-reward-introspection-observation.v0', version: 0, status: 'inert-evidence',
    observation_id: 'reward.observation.step12.v1',
    probe_manifest_id: m.manifest_id, probe_manifest_digest: rewardProbeManifestDigest(m),
    target_ref: m.target.target_ref, target_digest: m.target.target_digest,
    reasoning_state_ref: 'reasoning.state.step12.v1', reasoning_state_digest: C, step_ref: 'step.12',
    raw_score: 2.4, normalized_score: 0.82, normalized_range: [0, 1], probability_semantics: true,
    uncertainty: { lower: 0.76, upper: 0.88, method_ref: 'uncertainty.bootstrap.v1' },
    provenance_ref: 'provenance.reward.obs.v1', provenance_digest: D,
    observed_at: '2026-09-05T18:03:00.000Z', recorded_at: '2026-09-05T18:04:00.000Z',
    contains_secret_material: false, authority_effect: 'none', network_effect: 'none',
    credential_visibility: 'none', runtime_activation: false, routing_effect: 'none', promotion_effect: 'evidence-only',
    ...overrides
  };
}

function uncalibratedObservation(m) {
  return observation(m, {
    normalized_score: null, normalized_range: null, probability_semantics: false, uncertainty: null
  });
}

function clone(value) { return structuredClone(value); }
function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

test('calibrated observation is deterministic, exactly bound, and evidence-only', () => {
  const t = topology();
  const m = manifest(t);
  const item = observation(m);
  assert.equal(REWARD_INTROSPECTION_OBSERVATION_SCHEMA, 'axiom-reward-introspection-observation.v0');
  assert.equal(validateRewardIntrospectionObservation(item).valid, true);
  assert.match(rewardIntrospectionObservationDigest(item), /^[a-f0-9]{64}$/);
  assert.equal(
    rewardIntrospectionObservationDigest(item),
    rewardIntrospectionObservationDigest(Object.fromEntries(Object.entries(item).reverse()))
  );
  const resolved = resolveRewardIntrospectionObservation(item, m, { kind: 'topology-node', topology: t, node_id: 'node.reward.obs' });
  assert.equal(resolved.probe_manifest_id, m.manifest_id);
  assert.equal(resolved.target_ref, t.topology_id);
  assert.equal(resolved.probability_semantics, true);
  assert.equal(resolved.authority_effect, 'none');
  assert.equal(resolved.network_effect, 'none');
  assert.equal(resolved.credential_visibility, 'none');
  assert.equal(resolved.runtime_activation, false);
  assert.equal(resolved.routing_effect, 'none');
  assert.equal(resolved.promotion_effect, 'evidence-only');
  assert.equal(Object.isFrozen(resolved), true);
});

test('non-finite scores and uncertainty bounds fail closed', () => {
  const m = manifest();
  for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const item = observation(m); item.raw_score = value;
    assert.throws(() => validateRewardIntrospectionObservation(item));
  }
  for (const mutate of [
    x => { x.uncertainty.lower = Number.NaN; },
    x => { x.uncertainty.upper = Number.POSITIVE_INFINITY; },
    x => { x.uncertainty.lower = 0.9; x.uncertainty.upper = 0.8; }
  ]) {
    const item = observation(m); mutate(item); assert.throws(() => validateRewardIntrospectionObservation(item));
  }
});

test('uncalibrated probes cannot claim normalization, uncertainty, or probability semantics', () => {
  const m = manifest(topology(), 'uncalibrated');
  const good = uncalibratedObservation(m);
  assert.equal(resolveRewardIntrospectionObservation(good, m, { kind: 'topology-node', topology: topology(), node_id: 'node.reward.obs' }).probability_semantics, false);
  for (const mutate of [
    x => { x.normalized_score = 0.5; x.normalized_range = [0, 1]; },
    x => { x.probability_semantics = true; },
    x => { x.uncertainty = { lower: 0.4, upper: 0.6, method_ref: 'uncertainty.hidden' }; }
  ]) {
    const item = uncalibratedObservation(m); mutate(item);
    assert.throws(() => resolveRewardIntrospectionObservation(item, m, { kind: 'topology-node', topology: topology(), node_id: 'node.reward.obs' }));
  }
});

test('normalized evidence must use the manifest range and remain inside it', () => {
  const m = manifest();
  for (const mutate of [
    x => { x.normalized_score = 1.2; },
    x => { x.normalized_range = [-1, 1]; },
    x => { x.normalized_range = null; },
    x => { x.normalized_score = null; }
  ]) {
    const item = observation(m); mutate(item);
    assert.throws(() => resolveRewardIntrospectionObservation(item, m, { kind: 'topology-node', topology: topology(), node_id: 'node.reward.obs' }));
  }
});

test('probability semantics require probabilistic calibration and exact [0, 1] range', () => {
  const bounded = manifest(topology(), 'calibrated-bounded');
  const item = observation(bounded, { probability_semantics: true });
  assert.throws(() => resolveRewardIntrospectionObservation(item, bounded, { kind: 'topology-node', topology: topology(), node_id: 'node.reward.obs' }));
  const good = observation(manifest());
  assert.equal(validateRewardIntrospectionObservation(good).valid, true);
});

test('uncertainty method must be declared by the bound manifest', () => {
  const m = manifest();
  const bad = observation(m);
  bad.uncertainty.method_ref = 'uncertainty.other';
  assert.throws(() => resolveRewardIntrospectionObservation(bad, m, { kind: 'topology-node', topology: topology(), node_id: 'node.reward.obs' }));
  const noUncertainty = clone(m);
  noUncertainty.calibration.uncertainty_method_ref = null;
  const item = observation(noUncertainty);
  assert.throws(() => resolveRewardIntrospectionObservation(item, noUncertainty, { kind: 'topology-node', topology: topology(), node_id: 'node.reward.obs' }));
});

test('manifest, target, and chronology mismatches fail closed', () => {
  const t = topology(); const m = manifest(t);
  for (const mutate of [
    x => { x.probe_manifest_id = 'reward.probe.other'; },
    x => { x.probe_manifest_digest = B; },
    x => { x.target_ref = 'topology.other'; },
    x => { x.target_digest = B; },
    x => { x.recorded_at = '2026-09-05T18:02:00.000Z'; }
  ]) {
    const item = observation(m); mutate(item);
    assert.throws(() => resolveRewardIntrospectionObservation(item, m, { kind: 'topology-node', topology: t, node_id: 'node.reward.obs' }));
  }
});

test('raw cognitive payloads and action/effect fields are rejected', () => {
  const m = manifest();
  for (const [field, value] of [
    ['prompt', 'secret'], ['response', 'secret'], ['chain_of_thought', 'secret'], ['hidden_state', [1]],
    ['activation_tensor', [1]], ['embedding', [1]], ['recommended_action', 'continue'], ['route_to', 'model.other'],
    ['activate_model', true], ['approve_candidate', true], ['grant_capability', true], ['execute', true],
    ['token', 'secret'], ['credential', 'secret']
  ]) {
    const item = observation(m); item[field] = value;
    assert.throws(() => validateRewardIntrospectionObservation(item));
  }
});

test('boundary widening and malformed reasoning references fail closed', () => {
  const m = manifest();
  for (const mutate of [
    x => { x.contains_secret_material = true; }, x => { x.authority_effect = 'grant'; },
    x => { x.network_effect = 'egress'; }, x => { x.credential_visibility = 'read'; },
    x => { x.runtime_activation = true; }, x => { x.routing_effect = 'route'; }, x => { x.promotion_effect = 'promote'; },
    x => { x.reasoning_state_ref = ''; }, x => { x.reasoning_state_digest = 'bad'; }
  ]) {
    const item = observation(m); mutate(item); assert.throws(() => validateRewardIntrospectionObservation(item));
  }
});

test('validator and resolver preserve deeply frozen inputs', () => {
  const t = deepFreeze(topology());
  const m = deepFreeze(manifest(t));
  const item = deepFreeze(observation(m));
  const before = JSON.stringify({ t, m, item });
  validateRewardIntrospectionObservation(item);
  resolveRewardIntrospectionObservation(item, m, { kind: 'topology-node', topology: t, node_id: 'node.reward.obs' });
  assert.equal(JSON.stringify({ t, m, item }), before);
});
