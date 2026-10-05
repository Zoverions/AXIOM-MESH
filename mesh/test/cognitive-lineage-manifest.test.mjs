import assert from 'node:assert/strict';
import test from 'node:test';
import { cognitiveTopologyDigest } from '../src/lib/cognitive-topology.mjs';
import {
  COGNITIVE_LINEAGE_MANIFEST_SCHEMA,
  cognitiveLineageManifestDigest,
  resolveCognitiveLineageManifest,
  validateCognitiveLineageManifest
} from '../src/lib/cognitive-lineage-manifest.mjs';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);
const D = 'd'.repeat(64);

function topologyFixture() {
  return {
    schema: 'axiom-cognitive-topology.v0',
    version: 0,
    status: 'inert-contract-laboratory',
    topology_id: 'topology.lineage.v1',
    composition_id: 'composition.lineage.v1',
    composition_digest: D,
    nodes: [
      {
        node_id: 'node.owner.base',
        model_id: 'model.owner.base',
        engagement: 'persistent',
        topology_role: 'identity-kernel',
        access_mode: 'local-runtime',
        custody: 'owner-local',
        weights: { state: 'open-acquired', artifact_digest: A, licence_ref: 'licence.base.v1' },
        persistence: { mode: 'local', provider_id: null, state_ref: 'state.base.v1', exportability: 'full' },
        continuity_importance: 'critical',
        fidelity_importance: 'important',
        adaptation_authorization_ref: 'authorization.adapt.base.v1',
        lineage_ref: null,
        transition_policy_ref: null
      },
      {
        node_id: 'node.provider.primary',
        model_id: 'model.provider.primary',
        engagement: 'primary',
        topology_role: 'primary-embodiment',
        access_mode: 'api',
        custody: 'provider-controlled',
        weights: { state: 'closed', artifact_digest: null, licence_ref: null },
        persistence: { mode: 'provider-bound', provider_id: 'provider.primary', state_ref: 'state.provider.v1', exportability: 'partial' },
        continuity_importance: 'important',
        fidelity_importance: 'critical',
        adaptation_authorization_ref: null,
        lineage_ref: null,
        transition_policy_ref: null
      }
    ],
    created_at: '2026-08-30T10:00:00.000Z',
    updated_at: '2026-08-30T10:00:00.000Z',
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function manifest(topology = topologyFixture(), overrides = {}) {
  return {
    schema: 'axiom-cognitive-lineage-manifest.v0',
    version: 0,
    status: 'inert-evidence',
    lineage_id: 'lineage.base.to.candidate.v1',
    topology_id: topology.topology_id,
    topology_digest: cognitiveTopologyDigest(topology),
    reference: {
      node_id: 'node.owner.base',
      model_id: 'model.owner.base',
      artifact_ref: 'artifact.base.v1',
      artifact_digest: A,
      provider_version_ref: null
    },
    candidate: {
      node_id: null,
      model_id: 'model.owner.candidate',
      artifact_ref: 'artifact.candidate.v1',
      artifact_digest: B,
      provider_version_ref: null
    },
    relationship: 'distilled-descendant',
    procedure: {
      procedure_kind: 'distillation',
      procedure_ref: 'procedure.distill.v1',
      procedure_digest: C,
      adaptation_authorization_ref: 'authorization.adapt.base.v1'
    },
    evidence: {
      assurance_class: 'verified',
      evidence_ref: 'evidence.lineage.v1',
      evidence_digest: D,
      verification_ref: 'verification.lineage.v1',
      verification_digest: C
    },
    created_at: '2026-08-30T10:01:00.000Z',
    recorded_at: '2026-08-30T10:02:00.000Z',
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false,
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

test('valid descendant lineage is deterministic, inert, and not principal lineage', () => {
  const topology = topologyFixture();
  const item = manifest(topology);
  assert.equal(COGNITIVE_LINEAGE_MANIFEST_SCHEMA, 'axiom-cognitive-lineage-manifest.v0');
  assert.equal(validateCognitiveLineageManifest(item).valid, true);
  assert.match(cognitiveLineageManifestDigest(item), /^[a-f0-9]{64}$/);
  assert.equal(
    cognitiveLineageManifestDigest(item),
    cognitiveLineageManifestDigest(Object.fromEntries(Object.entries(item).reverse()))
  );

  const resolved = resolveCognitiveLineageManifest(item, topology);
  assert.equal(resolved.relationship, 'distilled-descendant');
  assert.equal(resolved.assurance_class, 'verified');
  assert.equal(resolved.active_candidate, false);
  assert.equal(resolved.proves_principal_lineage, false);
  assert.equal(resolved.proves_principal_continuity, false);
  assert.equal(resolved.proves_subjective_identity, false);
  assert.equal(resolved.grants_execution_authority, false);
  assert.equal(resolved.runtime_activation, false);
  assert.equal(Object.isFrozen(resolved), true);
});

test('all approved cognitive relationship classes validate', () => {
  const topology = topologyFixture();
  for (const relationship of [
    'successor', 'replacement', 'fine-tuned-descendant', 'distilled-descendant',
    'quantized-derivative', 'adapter-derived', 'provider-version-successor', 'functionally-unrelated'
  ]) {
    const item = manifest(topology);
    item.relationship = relationship;
    if (['replacement', 'functionally-unrelated'].includes(relationship)) {
      item.procedure = {
        procedure_kind: 'selection', procedure_ref: null, procedure_digest: null, adaptation_authorization_ref: null
      };
    }
    assert.equal(validateCognitiveLineageManifest(item).valid, true, relationship);
  }
});

test('reference binds exact current topology while an external candidate remains descriptive only', () => {
  const topology = topologyFixture();
  const item = manifest(topology);
  const resolved = resolveCognitiveLineageManifest(item, topology);
  assert.equal(resolved.reference.node_id, 'node.owner.base');
  assert.equal(resolved.reference.model_id, 'model.owner.base');
  assert.equal(resolved.reference.artifact_digest, A);
  assert.equal(resolved.candidate.node_id, null);
  assert.equal(resolved.candidate.model_id, 'model.owner.candidate');
  assert.equal(resolved.active_candidate, false);
});

test('candidate may identify a current topology node without the manifest activating it', () => {
  const topology = topologyFixture();
  const item = manifest(topology);
  item.relationship = 'replacement';
  item.candidate = {
    node_id: 'node.provider.primary', model_id: 'model.provider.primary', artifact_ref: null,
    artifact_digest: null, provider_version_ref: 'provider.model.v5'
  };
  item.procedure = {
    procedure_kind: 'selection', procedure_ref: null, procedure_digest: null, adaptation_authorization_ref: null
  };
  const resolved = resolveCognitiveLineageManifest(item, topology);
  assert.equal(resolved.candidate.node_id, 'node.provider.primary');
  assert.equal(resolved.active_candidate, false);
});

test('reference topology, node, model, and artifact mismatches fail closed', () => {
  const topology = topologyFixture();
  for (const mutate of [
    item => { item.topology_id = 'topology.other'; },
    item => { item.topology_digest = A; },
    item => { item.reference.node_id = 'node.unknown'; },
    item => { item.reference.model_id = 'model.other'; },
    item => { item.reference.artifact_digest = B; }
  ]) {
    const item = manifest(topology);
    mutate(item);
    assert.throws(() => resolveCognitiveLineageManifest(item, topology));
  }
});

test('descriptor artifact ref/digest pairs and current candidate facts are exact', () => {
  const topology = topologyFixture();
  const badPair = manifest(topology);
  badPair.candidate.artifact_ref = null;
  assert.throws(() => validateCognitiveLineageManifest(badPair));

  const badCurrentCandidate = manifest(topology);
  badCurrentCandidate.relationship = 'replacement';
  badCurrentCandidate.candidate = {
    node_id: 'node.provider.primary', model_id: 'model.other', artifact_ref: null,
    artifact_digest: null, provider_version_ref: 'provider.model.v5'
  };
  badCurrentCandidate.procedure = {
    procedure_kind: 'selection', procedure_ref: null, procedure_digest: null, adaptation_authorization_ref: null
  };
  assert.throws(() => resolveCognitiveLineageManifest(badCurrentCandidate, topology));
});

test('descendant relationships require procedure evidence while unrelated replacements may omit it', () => {
  const topology = topologyFixture();
  for (const relationship of [
    'successor', 'fine-tuned-descendant', 'distilled-descendant', 'quantized-derivative',
    'adapter-derived', 'provider-version-successor'
  ]) {
    const item = manifest(topology);
    item.relationship = relationship;
    item.procedure.procedure_ref = null;
    item.procedure.procedure_digest = null;
    assert.throws(() => validateCognitiveLineageManifest(item), relationship);
  }

  for (const relationship of ['replacement', 'functionally-unrelated']) {
    const item = manifest(topology);
    item.relationship = relationship;
    item.procedure = {
      procedure_kind: 'selection', procedure_ref: null, procedure_digest: null, adaptation_authorization_ref: null
    };
    assert.equal(validateCognitiveLineageManifest(item).valid, true);
  }
});

test('declared versus verified assurance is explicit', () => {
  const topology = topologyFixture();
  const declared = manifest(topology);
  declared.evidence.assurance_class = 'declared';
  declared.evidence.verification_ref = null;
  declared.evidence.verification_digest = null;
  assert.equal(validateCognitiveLineageManifest(declared).valid, true);

  const declaredWithVerification = clone(declared);
  declaredWithVerification.evidence.verification_ref = 'verification.unexpected';
  declaredWithVerification.evidence.verification_digest = C;
  assert.throws(() => validateCognitiveLineageManifest(declaredWithVerification));

  const verifiedWithoutVerification = manifest(topology);
  verifiedWithoutVerification.evidence.verification_ref = null;
  verifiedWithoutVerification.evidence.verification_digest = null;
  assert.throws(() => validateCognitiveLineageManifest(verifiedWithoutVerification));
});

test('invalid relationships, chronology, unknown fields, and zero-effect violations fail closed', () => {
  const topology = topologyFixture();
  const mutations = [
    item => { item.relationship = 'same-person'; },
    item => { item.recorded_at = '2026-08-30T10:00:00.000Z'; },
    item => { item.created_at = 'not-a-time'; },
    item => { item.procedure.procedure_digest = 'bad'; },
    item => { item.evidence.evidence_digest = 'bad'; },
    item => { item.contains_secret_material = true; },
    item => { item.authority_effect = 'grant'; },
    item => { item.network_effect = 'invoke'; },
    item => { item.runtime_activation = true; },
    item => { item.token = 'secret'; },
    item => { item.reference.extra = true; }
  ];
  for (const mutate of mutations) {
    const item = manifest(topology);
    mutate(item);
    assert.throws(() => validateCognitiveLineageManifest(item));
  }
});

test('validator/resolver preserve deeply frozen inputs', () => {
  const topology = deepFreeze(topologyFixture());
  const item = deepFreeze(manifest(topology));
  const before = JSON.stringify(item);
  validateCognitiveLineageManifest(item);
  resolveCognitiveLineageManifest(item, topology);
  assert.equal(JSON.stringify(item), before);
});
