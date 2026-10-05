import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { cognitiveTopologyDigest } from '../src/lib/cognitive-topology.mjs';
import {
  COGNITIVE_AVAILABILITY_ATTESTATION_SCHEMA,
  cognitiveAvailabilityAttestationDigest,
  resolveCognitiveAvailabilityAttestation,
  validateCognitiveAvailabilityAttestation
} from '../src/lib/cognitive-availability-attestation.mjs';

const DIGEST_A = 'a'.repeat(64);
const DIGEST_B = 'b'.repeat(64);
const DIGEST_C = 'c'.repeat(64);
const DIGEST_D = 'd'.repeat(64);

function topologyFixture() {
  return {
    schema: 'axiom-cognitive-topology.v0',
    version: 0,
    status: 'inert-contract-laboratory',
    topology_id: 'topology.availability.v1',
    composition_id: 'composition.availability.v1',
    composition_digest: DIGEST_D,
    nodes: [
      {
        node_id: 'node.owner.local',
        model_id: 'model.owner.local',
        engagement: 'persistent',
        topology_role: 'identity-kernel',
        access_mode: 'local-runtime',
        custody: 'owner-local',
        weights: { state: 'open-acquired', artifact_digest: DIGEST_A, licence_ref: 'licence.local.v1' },
        persistence: { mode: 'local', provider_id: null, state_ref: 'state.local.v1', exportability: 'full' },
        continuity_importance: 'critical',
        fidelity_importance: 'important',
        adaptation_authorization_ref: null,
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
        persistence: { mode: 'provider-bound', provider_id: 'provider.primary', state_ref: 'state.provider.primary.v1', exportability: 'partial' },
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

function localAttestation(topology = topologyFixture()) {
  return {
    schema: 'axiom-cognitive-availability-attestation.v0',
    version: 0,
    status: 'inert-evidence',
    attestation_id: 'availability.owner.local.v1',
    topology_id: topology.topology_id,
    topology_digest: cognitiveTopologyDigest(topology),
    node_id: 'node.owner.local',
    model_id: 'model.owner.local',
    observation: {
      availability: 'available', method: 'local-artifact', observed_artifact_digest: DIGEST_A,
      observed_runtime_ref: null, assurance_class: 'verified-local'
    },
    observer: { observer_kind: 'local-service', observer_ref: 'observer.local.weights.v1', observer_principal_ref: null },
    evidence: {
      evidence_kind: 'artifact-verification', evidence_ref: 'evidence.local.weights.v1', evidence_digest: DIGEST_B,
      verification_ref: 'verification.local.weights.v1', verification_digest: DIGEST_C
    },
    observed_at: '2026-08-30T10:00:00.000Z',
    valid_until: '2026-08-30T10:05:00.000Z',
    recorded_at: '2026-08-30T10:00:01.000Z',
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function providerAttestation(topology = topologyFixture()) {
  const item = localAttestation(topology);
  item.attestation_id = 'availability.provider.primary.v1';
  item.node_id = 'node.provider.primary';
  item.model_id = 'model.provider.primary';
  item.observation = {
    availability: 'available', method: 'provider-api', observed_artifact_digest: null,
    observed_runtime_ref: 'runtime.provider.primary.v1', assurance_class: 'declared'
  };
  item.observer = { observer_kind: 'provider', observer_ref: 'provider.primary', observer_principal_ref: null };
  item.evidence = {
    evidence_kind: 'provider-statement', evidence_ref: 'evidence.provider.primary.v1', evidence_digest: DIGEST_B,
    verification_ref: null, verification_digest: null
  };
  return item;
}

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

test('valid local and provider observations validate and digest deterministically', () => {
  const topology = topologyFixture();
  const local = localAttestation(topology);
  const provider = providerAttestation(topology);
  assert.equal(COGNITIVE_AVAILABILITY_ATTESTATION_SCHEMA, 'axiom-cognitive-availability-attestation.v0');
  assert.equal(validateCognitiveAvailabilityAttestation(local).valid, true);
  assert.equal(validateCognitiveAvailabilityAttestation(provider).valid, true);
  assert.match(cognitiveAvailabilityAttestationDigest(local), /^[a-f0-9]{64}$/);
  const reordered = Object.fromEntries(Object.entries(local).reverse());
  assert.equal(cognitiveAvailabilityAttestationDigest(local), cognitiveAvailabilityAttestationDigest(reordered));
});

test('resolver binds exact topology, node, model, artifact, and zero-effect facts', () => {
  const topology = topologyFixture();
  const resolved = resolveCognitiveAvailabilityAttestation(localAttestation(topology), topology);
  assert.deepEqual(
    {
      node_id: resolved.node_id,
      model_id: resolved.model_id,
      availability: resolved.availability,
      method: resolved.method,
      assurance_class: resolved.assurance_class,
      observed_artifact_digest: resolved.observed_artifact_digest,
      contains_secret_material: resolved.contains_secret_material,
      authority_effect: resolved.authority_effect,
      network_effect: resolved.network_effect,
      runtime_activation: resolved.runtime_activation
    },
    {
      node_id: 'node.owner.local', model_id: 'model.owner.local', availability: 'available', method: 'local-artifact',
      assurance_class: 'verified-local', observed_artifact_digest: DIGEST_A, contains_secret_material: false,
      authority_effect: 'none', network_effect: 'none', runtime_activation: false
    }
  );
  assert.equal(Object.isFrozen(resolved), true);
});

test('wrong topology, node, model, and artifact facts fail closed', () => {
  const topology = topologyFixture();
  for (const mutate of [
    item => { item.topology_id = 'topology.other'; },
    item => { item.topology_digest = DIGEST_D; },
    item => { item.node_id = 'node.unknown'; },
    item => { item.model_id = 'model.other'; },
    item => { item.observation.observed_artifact_digest = DIGEST_B; }
  ]) {
    const item = localAttestation(topology);
    mutate(item);
    assert.throws(() => resolveCognitiveAvailabilityAttestation(item, topology));
  }
});

test('artifact and observation method rules follow topology posture', () => {
  const topology = topologyFixture();
  const localNoDigest = localAttestation(topology);
  localNoDigest.observation.observed_artifact_digest = null;
  assert.throws(() => resolveCognitiveAvailabilityAttestation(localNoDigest, topology));

  const providerDigest = providerAttestation(topology);
  providerDigest.observation.observed_artifact_digest = DIGEST_A;
  assert.throws(() => resolveCognitiveAvailabilityAttestation(providerDigest, topology));

  const localViaProvider = localAttestation(topology);
  localViaProvider.observation.method = 'provider-api';
  assert.throws(() => resolveCognitiveAvailabilityAttestation(localViaProvider, topology));

  const providerAsArtifact = providerAttestation(topology);
  providerAsArtifact.observation.method = 'local-artifact';
  assert.throws(() => resolveCognitiveAvailabilityAttestation(providerAsArtifact, topology));
});

test('assurance claims require matching verification evidence', () => {
  const topology = topologyFixture();
  const declared = providerAttestation(topology);
  declared.evidence.verification_ref = 'verification.unexpected';
  declared.evidence.verification_digest = DIGEST_C;
  assert.throws(() => validateCognitiveAvailabilityAttestation(declared));

  const verified = localAttestation(topology);
  verified.evidence.verification_ref = null;
  verified.evidence.verification_digest = null;
  assert.throws(() => validateCognitiveAvailabilityAttestation(verified));
});

test('chronology, enums, unknown fields, and effect boundaries fail closed', () => {
  const topology = topologyFixture();
  const mutations = [
    item => { item.observation.availability = 'maybe'; },
    item => { item.observation.assurance_class = 'trusted'; },
    item => { item.observation.method = 'magic'; },
    item => { item.observer.observer_kind = 'mystery'; },
    item => { item.evidence.evidence_kind = 'mystery'; },
    item => { item.recorded_at = '2026-08-30T09:59:59.000Z'; },
    item => { item.valid_until = '2026-08-30T09:59:59.000Z'; },
    item => { item.observed_at = 'not-a-time'; },
    item => { item.evidence.evidence_digest = 'bad'; },
    item => { item.contains_secret_material = true; },
    item => { item.authority_effect = 'grant'; },
    item => { item.network_effect = 'probe'; },
    item => { item.runtime_activation = true; },
    item => { item.token = 'secret'; },
    item => { item.observation.extra = true; }
  ];
  for (const mutate of mutations) {
    const item = localAttestation(topology);
    mutate(item);
    assert.throws(() => validateCognitiveAvailabilityAttestation(item));
  }
});

test('validator rejects prototype-bearing objects and preserves frozen inputs', () => {
  const topology = topologyFixture();
  const prototypeItem = localAttestation(topology);
  prototypeItem.observer = Object.assign(Object.create({ inherited: true }), prototypeItem.observer);
  assert.throws(() => validateCognitiveAvailabilityAttestation(prototypeItem));

  const frozenTopology = deepFreeze(topologyFixture());
  const frozenItem = deepFreeze(localAttestation(frozenTopology));
  const before = JSON.stringify(frozenItem);
  validateCognitiveAvailabilityAttestation(frozenItem);
  resolveCognitiveAvailabilityAttestation(frozenItem, frozenTopology);
  assert.equal(JSON.stringify(frozenItem), before);
});

test('production module imports only canonical and topology primitives', async () => {
  const source = await readFile(new URL('../src/lib/cognitive-availability-attestation.mjs', import.meta.url), 'utf8');
  const imports = [...source.matchAll(/from\s+['\"]([^'\"]+)['\"]/g)].map(match => match[1]).sort();
  assert.deepEqual(imports, ['./canonical.mjs', './cognitive-topology.mjs']);
});
