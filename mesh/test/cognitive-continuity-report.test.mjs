import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { cognitiveTopologyDigest } from '../src/lib/cognitive-topology.mjs';
import {
  COGNITIVE_CONTINUITY_REPORT_SCHEMA,
  buildCognitiveContinuityReport
} from '../src/lib/cognitive-continuity-report.mjs';

const DIGEST_A = 'a'.repeat(64);
const DIGEST_B = 'b'.repeat(64);
const DIGEST_C = 'c'.repeat(64);
const DIGEST_D = 'd'.repeat(64);
const DIGEST_E = 'e'.repeat(64);
const DIGEST_F = 'f'.repeat(64);

function topologyFixture() {
  return {
    schema: 'axiom-cognitive-topology.v0',
    version: 0,
    status: 'inert-contract-laboratory',
    topology_id: 'topology.cognitive.report.v1',
    composition_id: 'composition.cognitive.report.v1',
    composition_digest: DIGEST_C,
    nodes: [
      {
        node_id: 'node.identity.kernel',
        model_id: 'model.identity.kernel',
        engagement: 'persistent',
        topology_role: 'identity-kernel',
        access_mode: 'local-runtime',
        custody: 'owner-local',
        weights: {
          state: 'open-acquired',
          artifact_digest: DIGEST_A,
          licence_ref: 'licence.identity.kernel.v1'
        },
        persistence: {
          mode: 'local',
          provider_id: null,
          state_ref: 'state.identity.kernel.v1',
          exportability: 'full'
        },
        continuity_importance: 'critical',
        fidelity_importance: 'important',
        adaptation_authorization_ref: null,
        lineage_ref: 'lineage.identity.kernel.v1',
        transition_policy_ref: 'policy.identity.kernel.transition.v1'
      },
      {
        node_id: 'node.provider.primary',
        model_id: 'model.provider.primary',
        engagement: 'primary',
        topology_role: 'primary-embodiment',
        access_mode: 'api',
        custody: 'provider-controlled',
        weights: {
          state: 'closed',
          artifact_digest: null,
          licence_ref: null
        },
        persistence: {
          mode: 'provider-bound',
          provider_id: 'provider.primary.memory',
          state_ref: 'state.provider.primary.v1',
          exportability: 'partial'
        },
        continuity_importance: 'important',
        fidelity_importance: 'critical',
        adaptation_authorization_ref: null,
        lineage_ref: null,
        transition_policy_ref: 'policy.provider.primary.transition.v1'
      },
      {
        node_id: 'node.mirrored.augment',
        model_id: 'model.mirrored.augment',
        engagement: 'persistent',
        topology_role: 'augmentation',
        access_mode: 'hybrid',
        custody: 'shared',
        weights: {
          state: 'open-remote',
          artifact_digest: null,
          licence_ref: 'licence.mirrored.augment.v1'
        },
        persistence: {
          mode: 'mirrored',
          provider_id: 'provider.augment.memory',
          state_ref: 'state.mirrored.augment.v1',
          exportability: 'full'
        },
        continuity_importance: 'optional',
        fidelity_importance: 'important',
        adaptation_authorization_ref: null,
        lineage_ref: null,
        transition_policy_ref: null
      },
      {
        node_id: 'node.optional.ephemeral',
        model_id: 'model.optional.ephemeral',
        engagement: 'ephemeral',
        topology_role: 'augmentation',
        access_mode: 'api',
        custody: 'provider-controlled',
        weights: {
          state: 'closed',
          artifact_digest: null,
          licence_ref: null
        },
        persistence: {
          mode: 'none',
          provider_id: null,
          state_ref: null,
          exportability: 'none'
        },
        continuity_importance: 'optional',
        fidelity_importance: 'optional',
        adaptation_authorization_ref: null,
        lineage_ref: null,
        transition_policy_ref: null
      }
    ],
    created_at: '2026-08-29T15:00:00.000Z',
    updated_at: '2026-08-29T15:00:00.000Z',
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function acquisitionManifest(topology = topologyFixture()) {
  return {
    schema: 'axiom-model-acquisition-manifest.v0',
    version: 0,
    status: 'inert-evidence',
    acquisition_id: 'acquisition.identity.kernel.v1',
    topology_id: topology.topology_id,
    topology_digest: cognitiveTopologyDigest(topology),
    node_id: 'node.identity.kernel',
    model_id: 'model.identity.kernel',
    artifact: {
      artifact_ref: 'artifact.identity.kernel.weights.v1',
      artifact_digest: DIGEST_A,
      licence_ref: 'licence.identity.kernel.v1',
      format_ref: 'format.safetensors.v1'
    },
    source: {
      source_kind: 'upstream-release',
      source_ref: 'source.identity.kernel.release.v1',
      source_evidence_ref: 'evidence.identity.kernel.release.v1',
      source_evidence_digest: DIGEST_D
    },
    custody: {
      mode: 'owner-local',
      location_ref: 'location.identity.kernel.local.v1',
      verification_ref: 'verification.identity.kernel.local.v1',
      verification_digest: DIGEST_E
    },
    acquired_at: '2026-08-29T15:05:00.000Z',
    recorded_at: '2026-08-29T15:06:00.000Z',
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function persistenceAttestation(topology, nodeId, overrides = {}) {
  const node = topology.nodes.find(candidate => candidate.node_id === nodeId);
  const availability = overrides.availability ?? 'available';
  const observedExportability = overrides.observed_exportability ?? node.persistence.exportability;
  const canSnapshot = availability === 'available';
  return {
    schema: 'axiom-persistence-attestation.v0',
    version: 0,
    status: 'inert-evidence',
    attestation_id: `attestation.${nodeId}.v1`,
    topology_id: topology.topology_id,
    topology_digest: cognitiveTopologyDigest(topology),
    node_id: node.node_id,
    model_id: node.model_id,
    declared_persistence: { ...node.persistence },
    observation: {
      availability,
      observed_exportability: observedExportability,
      snapshot_ref: canSnapshot ? `snapshot.${nodeId}.v1` : null,
      snapshot_digest: canSnapshot ? DIGEST_F : null
    },
    evidence: {
      evidence_kind: node.persistence.mode === 'local' ? 'local-observation' : 'provider-statement',
      evidence_ref: `evidence.${nodeId}.v1`,
      evidence_digest: DIGEST_B
    },
    observed_at: '2026-08-29T15:10:00.000Z',
    recorded_at: '2026-08-29T15:11:00.000Z',
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function observations(topology = topologyFixture()) {
  return topology.nodes.map(node => ({
    node_id: node.node_id,
    model_id: node.model_id,
    availability: 'available',
    observed_artifact_digest: node.weights.artifact_digest
  }));
}

function fullInputs(topology = topologyFixture()) {
  return {
    model_observations: observations(topology),
    acquisition_manifests: [acquisitionManifest(topology)],
    persistence_attestations: topology.nodes
      .filter(node => node.persistence.mode !== 'none')
      .map(node => persistenceAttestation(topology, node.node_id))
  };
}

function findObservation(inputs, nodeId) {
  return inputs.model_observations.find(item => item.node_id === nodeId);
}

function findPersistence(inputs, nodeId) {
  return inputs.persistence_attestations.find(item => item.node_id === nodeId);
}

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function clone(value) {
  return structuredClone(value);
}

test('all required evidence yields full cognitive continuity/fidelity with mixed sovereignty', () => {
  const topology = topologyFixture();
  const report = buildCognitiveContinuityReport(topology, fullInputs(topology));

  assert.equal(COGNITIVE_CONTINUITY_REPORT_SCHEMA, 'axiom-cognitive-continuity-report.v0');
  assert.equal(report.schema, COGNITIVE_CONTINUITY_REPORT_SCHEMA);
  assert.deepEqual(report.topology, {
    topology_id: topology.topology_id,
    topology_digest: cognitiveTopologyDigest(topology)
  });
  assert.equal(report.cognitive_continuity_status, 'full');
  assert.equal(report.cognitive_fidelity_status, 'full');
  assert.equal(report.sovereignty_status, 'mixed');
  assert.deepEqual(report.blockers, []);
  assert.equal(report.nodes.length, topology.nodes.length);
  assert.deepEqual(report.nodes.map(node => node.node_id), [...report.nodes.map(node => node.node_id)].sort());
  assert.match(report.report_digest, /^[a-f0-9]{64}$/);
  assert.equal(Object.isFrozen(report), true);
  assert.equal(Object.isFrozen(report.nodes), true);
});

test('critical continuity model unavailability blocks cognitive continuity without claiming principal discontinuity', () => {
  const topology = topologyFixture();
  const inputs = fullInputs(topology);
  const observation = findObservation(inputs, 'node.identity.kernel');
  observation.availability = 'unavailable';
  observation.observed_artifact_digest = null;

  const report = buildCognitiveContinuityReport(topology, inputs);
  assert.equal(report.cognitive_continuity_status, 'blocked');
  assert.equal(report.cognitive_fidelity_status, 'degraded');
  assert.ok(report.blockers.includes('continuity:node.identity.kernel:model-unavailable'));
  assert.equal(report.authority_boundary.proves_principal_continuity, false);
  assert.equal(report.authority_boundary.proves_subjective_identity, false);
});

test('important continuity model unavailability degrades rather than blocks', () => {
  const topology = topologyFixture();
  const inputs = fullInputs(topology);
  findObservation(inputs, 'node.provider.primary').availability = 'unavailable';

  const report = buildCognitiveContinuityReport(topology, inputs);
  assert.equal(report.cognitive_continuity_status, 'degraded');
  assert.ok(report.warnings.includes('continuity:node.provider.primary:model-unavailable'));
});

test('critical fidelity model unavailability blocks fidelity independently', () => {
  const topology = topologyFixture();
  const inputs = fullInputs(topology);
  findObservation(inputs, 'node.provider.primary').availability = 'unavailable';

  const report = buildCognitiveContinuityReport(topology, inputs);
  assert.equal(report.cognitive_fidelity_status, 'blocked');
  assert.equal(report.cognitive_continuity_status, 'degraded');
  assert.ok(report.blockers.includes('fidelity:node.provider.primary:model-unavailable'));
});

test('important fidelity model unavailability degrades fidelity', () => {
  const topology = topologyFixture();
  const inputs = fullInputs(topology);
  const observation = findObservation(inputs, 'node.mirrored.augment');
  observation.availability = 'unavailable';

  const report = buildCognitiveContinuityReport(topology, inputs);
  assert.equal(report.cognitive_fidelity_status, 'degraded');
  assert.ok(report.warnings.includes('fidelity:node.mirrored.augment:model-unavailable'));
});

test('optional model loss is visible without aggregate degradation', () => {
  const topology = topologyFixture();
  const inputs = fullInputs(topology);
  findObservation(inputs, 'node.optional.ephemeral').availability = 'unavailable';

  const report = buildCognitiveContinuityReport(topology, inputs);
  assert.equal(report.cognitive_continuity_status, 'full');
  assert.equal(report.cognitive_fidelity_status, 'full');
  assert.ok(report.warnings.includes('optional:node.optional.ephemeral:model-unavailable'));
});

test('unknown important/critical availability degrades instead of silently passing', () => {
  const topology = topologyFixture();
  const inputs = fullInputs(topology);
  const observation = findObservation(inputs, 'node.provider.primary');
  observation.availability = 'unknown';

  const report = buildCognitiveContinuityReport(topology, inputs);
  assert.equal(report.cognitive_continuity_status, 'degraded');
  assert.equal(report.cognitive_fidelity_status, 'degraded');
  assert.ok(report.warnings.includes('continuity:node.provider.primary:model-unknown'));
  assert.ok(report.warnings.includes('fidelity:node.provider.primary:model-unknown'));
});

test('owner-controlled acquired artifact sovereignty requires acquisition evidence and exact observed digest', () => {
  const topology = topologyFixture();

  const verified = buildCognitiveContinuityReport(topology, fullInputs(topology));
  assert.equal(
    verified.nodes.find(node => node.node_id === 'node.identity.kernel').sovereignty_state,
    'verified-owner-artifact'
  );

  const missingEvidence = fullInputs(topology);
  missingEvidence.acquisition_manifests = [];
  const unverified = buildCognitiveContinuityReport(topology, missingEvidence);
  assert.equal(
    unverified.nodes.find(node => node.node_id === 'node.identity.kernel').sovereignty_state,
    'declared-owner-artifact-unverified'
  );
  assert.equal(unverified.sovereignty_status, 'unverified');

  const mismatchedDigest = fullInputs(topology);
  findObservation(mismatchedDigest, 'node.identity.kernel').observed_artifact_digest = DIGEST_B;
  const mismatch = buildCognitiveContinuityReport(topology, mismatchedDigest);
  assert.equal(
    mismatch.nodes.find(node => node.node_id === 'node.identity.kernel').sovereignty_state,
    'artifact-digest-mismatch'
  );
  assert.equal(mismatch.sovereignty_status, 'unverified');
});

test('provider-bound persistence remains explicitly provider-dependent with observed exportability', () => {
  const topology = topologyFixture();
  const report = buildCognitiveContinuityReport(topology, fullInputs(topology));
  const node = report.nodes.find(item => item.node_id === 'node.provider.primary');

  assert.equal(node.sovereignty_state, 'provider-dependent');
  assert.equal(node.persistence_mode, 'provider-bound');
  assert.equal(node.persistence_availability, 'available');
  assert.equal(node.declared_exportability, 'partial');
  assert.equal(node.observed_exportability, 'partial');
});

test('unavailable provider-bound persistence affects continuity and fidelity according to node importance', () => {
  const topology = topologyFixture();
  const inputs = fullInputs(topology);
  const attestation = findPersistence(inputs, 'node.provider.primary');
  attestation.observation.availability = 'unavailable';
  attestation.observation.observed_exportability = 'unknown';
  attestation.observation.snapshot_ref = null;
  attestation.observation.snapshot_digest = null;

  const report = buildCognitiveContinuityReport(topology, inputs);
  assert.equal(report.cognitive_continuity_status, 'degraded');
  assert.equal(report.cognitive_fidelity_status, 'blocked');
  assert.ok(report.warnings.includes('continuity:node.provider.primary:persistence-unavailable'));
  assert.ok(report.blockers.includes('fidelity:node.provider.primary:persistence-unavailable'));
});

test('mirrored persistence remains distinct and retains observed exportability', () => {
  const topology = topologyFixture();
  const report = buildCognitiveContinuityReport(topology, fullInputs(topology));
  const node = report.nodes.find(item => item.node_id === 'node.mirrored.augment');

  assert.equal(node.sovereignty_state, 'mirrored');
  assert.equal(node.persistence_mode, 'mirrored');
  assert.equal(node.persistence_availability, 'available');
  assert.equal(node.observed_exportability, 'full');
});

test('missing persistence evidence is treated as unknown for durable important/critical dependencies', () => {
  const topology = topologyFixture();
  const inputs = fullInputs(topology);
  inputs.persistence_attestations = inputs.persistence_attestations.filter(
    item => item.node_id !== 'node.provider.primary'
  );

  const report = buildCognitiveContinuityReport(topology, inputs);
  assert.equal(report.cognitive_continuity_status, 'degraded');
  assert.equal(report.cognitive_fidelity_status, 'degraded');
  assert.ok(report.warnings.includes('continuity:node.provider.primary:persistence-unknown'));
  assert.ok(report.warnings.includes('fidelity:node.provider.primary:persistence-unknown'));
});

test('duplicate and unknown model observations fail closed', () => {
  const topology = topologyFixture();

  const duplicate = fullInputs(topology);
  duplicate.model_observations.push({ ...duplicate.model_observations[0] });
  assert.throws(() => buildCognitiveContinuityReport(topology, duplicate), /duplicate.*model observation/i);

  const unknown = fullInputs(topology);
  unknown.model_observations.push({
    node_id: 'node.unknown',
    model_id: 'model.unknown',
    availability: 'available',
    observed_artifact_digest: null
  });
  assert.throws(() => buildCognitiveContinuityReport(topology, unknown), /unknown.*node|not declared/i);
});

test('duplicate acquisition or persistence evidence fails closed', () => {
  const topology = topologyFixture();

  const duplicateAcquisition = fullInputs(topology);
  duplicateAcquisition.acquisition_manifests.push(clone(duplicateAcquisition.acquisition_manifests[0]));
  assert.throws(() => buildCognitiveContinuityReport(topology, duplicateAcquisition), /duplicate.*acquisition/i);

  const duplicatePersistence = fullInputs(topology);
  duplicatePersistence.persistence_attestations.push(clone(duplicatePersistence.persistence_attestations[0]));
  assert.throws(() => buildCognitiveContinuityReport(topology, duplicatePersistence), /duplicate.*persistence/i);
});

test('evidence bound to another topology fails closed through public resolvers', () => {
  const topology = topologyFixture();

  const badAcquisition = fullInputs(topology);
  badAcquisition.acquisition_manifests[0].topology_id = 'topology.other';
  assert.throws(() => buildCognitiveContinuityReport(topology, badAcquisition), /topology_id/i);

  const badPersistence = fullInputs(topology);
  badPersistence.persistence_attestations[0].topology_digest = DIGEST_A;
  assert.throws(() => buildCognitiveContinuityReport(topology, badPersistence), /topology digest/i);
});

test('model observations require exact node/model binding and artifact digest semantics', () => {
  const topology = topologyFixture();

  const wrongModel = fullInputs(topology);
  findObservation(wrongModel, 'node.provider.primary').model_id = 'model.other';
  assert.throws(() => buildCognitiveContinuityReport(topology, wrongModel), /model_id|model/i);

  const missingOwnerDigest = fullInputs(topology);
  findObservation(missingOwnerDigest, 'node.identity.kernel').observed_artifact_digest = null;
  assert.throws(() => buildCognitiveContinuityReport(topology, missingOwnerDigest), /observed_artifact_digest/i);

  const impossibleRemoteDigest = fullInputs(topology);
  findObservation(impossibleRemoteDigest, 'node.provider.primary').observed_artifact_digest = DIGEST_B;
  assert.throws(() => buildCognitiveContinuityReport(topology, impossibleRemoteDigest), /observed_artifact_digest/i);
});

test('report digest and node order are deterministic across input ordering', () => {
  const topology = topologyFixture();
  const firstInputs = fullInputs(topology);
  const secondInputs = {
    model_observations: [...firstInputs.model_observations].reverse(),
    acquisition_manifests: [...firstInputs.acquisition_manifests].reverse(),
    persistence_attestations: [...firstInputs.persistence_attestations].reverse()
  };

  const first = buildCognitiveContinuityReport(topology, firstInputs);
  const second = buildCognitiveContinuityReport(topology, secondInputs);
  assert.equal(first.report_digest, second.report_digest);
  assert.deepEqual(first, second);
});

test('builder does not mutate deeply frozen topology or evidence inputs', () => {
  const topology = deepFreeze(topologyFixture());
  const inputs = deepFreeze(fullInputs(topology));
  assert.doesNotThrow(() => buildCognitiveContinuityReport(topology, inputs));
});

test('authority boundary is explicit and zero-effect', () => {
  const topology = topologyFixture();
  const report = buildCognitiveContinuityReport(topology, fullInputs(topology));
  assert.deepEqual(report.authority_boundary, {
    writes_files: false,
    performs_network_effects: false,
    loads_models: false,
    synchronizes_persistence: false,
    acquires_weights: false,
    grants_execution_authority: false,
    proves_principal_continuity: false,
    proves_subjective_identity: false
  });
});

test('production report builder imports only canonical cognitive evidence primitives', async () => {
  const source = await readFile(new URL('../src/lib/cognitive-continuity-report.mjs', import.meta.url), 'utf8');
  const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match => match[1]).sort();
  assert.deepEqual(imports, [
    './canonical.mjs',
    './cognitive-topology.mjs',
    './model-acquisition-manifest.mjs',
    './persistence-attestation.mjs'
  ]);
});
