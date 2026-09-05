import assert from 'node:assert/strict';
import test from 'node:test';
import { digestObject } from '../src/lib/canonical.mjs';
import { cognitiveTopologyDigest } from '../src/lib/cognitive-topology.mjs';
import { cognitiveCapabilityProfileDigest } from '../src/lib/cognitive-capability-profile.mjs';
import {
  REWARD_PROBE_MANIFEST_SCHEMA,
  rewardProbeManifestDigest,
  resolveRewardProbeManifest,
  validateRewardProbeManifest
} from '../src/lib/reward-probe-manifest.mjs';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);
const D = 'd'.repeat(64);

function topology() {
  return {
    schema: 'axiom-cognitive-topology.v0', version: 0, status: 'inert-contract-laboratory',
    topology_id: 'topology.reward.v1', composition_id: 'composition.reward.v1', composition_digest: D,
    nodes: [{
      node_id: 'node.reward.base', model_id: 'model.reward.base', engagement: 'persistent',
      topology_role: 'evaluator', access_mode: 'local-runtime', custody: 'owner-local',
      weights: { state: 'open-acquired', artifact_digest: A, licence_ref: 'MIT' },
      persistence: { mode: 'local', provider_id: null, state_ref: 'state.reward.v1', exportability: 'full' },
      continuity_importance: 'important', fidelity_importance: 'important',
      adaptation_authorization_ref: null, lineage_ref: null, transition_policy_ref: null
    }],
    created_at: '2026-09-05T18:00:00.000Z', updated_at: '2026-09-05T18:00:00.000Z',
    contains_secret_material: false, authority_effect: 'none', network_effect: 'none', runtime_activation: false
  };
}

function remoteProfile() {
  return {
    schema: 'axiom-cognitive-capability-profile.v0', version: 0,
    status: 'inert-routing-metadata-laboratory', profile_id: 'cognitive.reward.remote',
    catalog_entry: { entry_id: 'provider:reward', entry_version: '0.1.0', entry_digest: C },
    integration_class: 'model-provider', offering_ref: 'model.reward.remote',
    capabilities: ['reasoning'], modalities: { input: ['text'], output: ['text'] },
    deployment: { locality: 'provider-remote', access_mode: 'api' },
    data_policy: { retention: 'unknown', training_use: 'unknown', exportability: 'unknown', policy_ref: null },
    economics: { cost_class: 'medium', latency_class: 'interactive', context_class: 'large' },
    openness: { weight_access: 'closed', artifact_digest: null, license_ref: null },
    assurance: { ceiling: 'self-asserted', evidence_refs: ['evidence.reward.remote'] },
    created_at: '2026-09-05T18:00:00.000Z', updated_at: '2026-09-05T18:00:00.000Z',
    authority_effect: 'none', network_effect: 'none', credential_visibility: 'none',
    runtime_activation: false, selection_effect: 'eligibility-only'
  };
}

function topologyTarget(t = topology()) {
  return {
    kind: 'topology-node', target_ref: t.topology_id, target_digest: cognitiveTopologyDigest(t),
    node_id: 'node.reward.base', model_id: 'model.reward.base', artifact_digest: A,
    profile_id: null, offering_ref: null, catalog_entry_id: null, catalog_entry_digest: null,
    artifact_digest_availability: 'exact'
  };
}

function artifactTarget() {
  return {
    kind: 'model-artifact', target_ref: 'artifact.reward.base', target_digest: A,
    node_id: null, model_id: 'model.reward.base', artifact_digest: A,
    profile_id: null, offering_ref: null, catalog_entry_id: null, catalog_entry_digest: null,
    artifact_digest_availability: 'exact'
  };
}

function runtimeTarget(profile = remoteProfile()) {
  return {
    kind: 'runtime-offering', target_ref: profile.profile_id,
    target_digest: cognitiveCapabilityProfileDigest(profile), node_id: null, model_id: null,
    artifact_digest: null, profile_id: profile.profile_id, offering_ref: profile.offering_ref,
    catalog_entry_id: profile.catalog_entry.entry_id, catalog_entry_digest: profile.catalog_entry.entry_digest,
    artifact_digest_availability: 'unavailable-provider-controlled'
  };
}

function manifest(target = topologyTarget(), overrides = {}) {
  return {
    schema: 'axiom-reward-probe-manifest.v0', version: 0, status: 'inert-evidence',
    manifest_id: 'reward.probe.state-value.v1', probe_type: 'state-value',
    measurement_method: 'linear-probe', target,
    probe_artifact_ref: 'artifact.reward.probe.v1', probe_artifact_digest: B,
    method_ref: 'method.linear-probe.v1', evidence_ref: 'evidence.reward.probe.v1', evidence_digest: C,
    feature_descriptor: 'bounded residual-stream linear probe', training_data_class: 'reviewed-evaluation-corpus',
    dataset_refs: ['dataset.reward.probe.v1'],
    calibration: {
      class: 'calibrated-probabilistic', method_ref: 'calibration.isotonic.v1', evidence_digest: D,
      population_ref: 'population.math.reasoning.v1', score_range: [0, 1],
      normalization_rule_ref: 'normalization.probability.v1', uncertainty_method_ref: 'uncertainty.bootstrap.v1'
    },
    transfer_scope: 'exact-target-only', transfer_evidence_refs: [],
    limitations: ['Validated only for the declared target and evaluation population.'],
    source_refs: ['arxiv:2602.00986'], created_at: '2026-09-05T18:01:00.000Z',
    recorded_at: '2026-09-05T18:02:00.000Z', contains_secret_material: false,
    authority_effect: 'none', network_effect: 'none', credential_visibility: 'none',
    runtime_activation: false, routing_effect: 'none', promotion_effect: 'evidence-only',
    ...overrides
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

test('valid manifest is deterministic and evidence-only', () => {
  const item = manifest();
  const validated = validateRewardProbeManifest(item);
  assert.equal(REWARD_PROBE_MANIFEST_SCHEMA, 'axiom-reward-probe-manifest.v0');
  assert.equal(validated.valid, true);
  assert.match(rewardProbeManifestDigest(item), /^[a-f0-9]{64}$/);
  assert.equal(rewardProbeManifestDigest(item), rewardProbeManifestDigest(Object.fromEntries(Object.entries(item).reverse())));
  assert.equal(validated.authority_effect, 'none');
  assert.equal(validated.network_effect, 'none');
  assert.equal(validated.credential_visibility, 'none');
  assert.equal(validated.runtime_activation, false);
  assert.equal(validated.routing_effect, 'none');
  assert.equal(validated.promotion_effect, 'evidence-only');
});

test('all three target kinds bind exactly', () => {
  const t = topology();
  assert.equal(resolveRewardProbeManifest(manifest(topologyTarget(t)), { kind: 'topology-node', topology: t, node_id: 'node.reward.base' }).target_kind, 'topology-node');
  assert.equal(resolveRewardProbeManifest(manifest(artifactTarget()), { kind: 'model-artifact', model_id: 'model.reward.base', artifact_digest: A }).target_kind, 'model-artifact');
  const profile = remoteProfile();
  assert.equal(resolveRewardProbeManifest(manifest(runtimeTarget(profile)), { kind: 'runtime-offering', profile }).target_kind, 'runtime-offering');
});

test('closed vocabularies reject biological aliases and unknown methods', () => {
  for (const [field, value] of [['probe_type', 'dopamine'], ['measurement_method', 'magic-probe'], ['transfer_scope', 'universal']]) {
    const item = manifest();
    item[field] = value;
    assert.throws(() => validateRewardProbeManifest(item));
  }
});

test('uncalibrated probes cannot smuggle calibration or probability semantics', () => {
  const item = manifest();
  item.calibration = {
    class: 'uncalibrated', method_ref: null, evidence_digest: null, population_ref: null,
    score_range: null, normalization_rule_ref: null, uncertainty_method_ref: null
  };
  assert.equal(validateRewardProbeManifest(item).valid, true);
  const bad = clone(item);
  bad.calibration.method_ref = 'calibration.hidden';
  assert.throws(() => validateRewardProbeManifest(bad));
});

test('broader transfer claims require explicit transfer evidence', () => {
  for (const scope of ['declared-family', 'reviewed-cross-target']) {
    const bad = manifest(topologyTarget(), { transfer_scope: scope, transfer_evidence_refs: [] });
    assert.throws(() => validateRewardProbeManifest(bad));
    bad.transfer_evidence_refs = ['evidence.transfer.v1'];
    assert.equal(validateRewardProbeManifest(bad).valid, true);
  }
});

test('artifact-backed methods require exact probe artifact digest while model-native may omit it', () => {
  const bad = manifest();
  bad.probe_artifact_digest = null;
  assert.throws(() => validateRewardProbeManifest(bad));
  const native = manifest(runtimeTarget(), {
    measurement_method: 'model-native-signal', probe_artifact_ref: null, probe_artifact_digest: null,
    method_ref: 'method.provider-native.v1'
  });
  assert.equal(validateRewardProbeManifest(native).valid, true);
});

test('other-reviewed requires method and evidence provenance', () => {
  const item = manifest();
  item.measurement_method = 'other-reviewed';
  assert.equal(validateRewardProbeManifest(item).valid, true);
  for (const field of ['method_ref', 'evidence_ref', 'evidence_digest']) {
    const bad = clone(item);
    bad[field] = null;
    assert.throws(() => validateRewardProbeManifest(bad));
  }
});

test('unknown raw-content fields, secret markers, chronology errors, and effect widening fail closed', () => {
  const mutations = [
    x => { x.prompt = 'secret'; }, x => { x.chain_of_thought = 'secret'; }, x => { x.hidden_state = [1, 2]; },
    x => { x.token = 'secret'; }, x => { x.contains_secret_material = true; }, x => { x.authority_effect = 'grant'; },
    x => { x.network_effect = 'egress'; }, x => { x.credential_visibility = 'read'; }, x => { x.runtime_activation = true; },
    x => { x.routing_effect = 'route'; }, x => { x.promotion_effect = 'promote'; },
    x => { x.recorded_at = '2026-09-05T18:00:00.000Z'; }
  ];
  for (const mutate of mutations) {
    const item = manifest(); mutate(item); assert.throws(() => validateRewardProbeManifest(item));
  }
});

test('target identity and digest drift fails closed', () => {
  const t = topology();
  const good = manifest(topologyTarget(t));
  assert.equal(resolveRewardProbeManifest(good, { kind: 'topology-node', topology: t, node_id: 'node.reward.base' }).valid, true);
  for (const mutate of [x => { x.target.target_digest = B; }, x => { x.target.node_id = 'node.other'; }, x => { x.target.model_id = 'model.other'; }]) {
    const bad = clone(good); mutate(bad);
    assert.throws(() => resolveRewardProbeManifest(bad, { kind: 'topology-node', topology: t, node_id: 'node.reward.base' }));
  }
});

test('validation and resolution preserve frozen caller inputs', () => {
  const t = deepFreeze(topology());
  const item = deepFreeze(manifest(topologyTarget(t)));
  const before = JSON.stringify({ t, item });
  validateRewardProbeManifest(item);
  resolveRewardProbeManifest(item, { kind: 'topology-node', topology: t, node_id: 'node.reward.base' });
  assert.equal(JSON.stringify({ t, item }), before);
});
