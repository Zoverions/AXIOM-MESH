import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { cognitiveTopologyDigest } from '../src/lib/cognitive-topology.mjs';
import { cognitiveLineageManifestDigest } from '../src/lib/cognitive-lineage-manifest.mjs';
import {
  deriveReplacementFidelityClass,
  replacementFidelitySuiteDigest
} from '../src/lib/replacement-fidelity-evaluation.mjs';
import {
  COGNITIVE_RECOVERY_ASSESSMENT_SCHEMA,
  buildCognitiveRecoveryAssessment
} from '../src/lib/cognitive-recovery-assessment.mjs';

const D = Object.freeze({
  a: 'a'.repeat(64), b: 'b'.repeat(64), c: 'c'.repeat(64), d: 'd'.repeat(64),
  e: 'e'.repeat(64), f: 'f'.repeat(64), one: '1'.repeat(64), two: '2'.repeat(64)
});
const ASSESSMENT_AT = '2026-08-29T20:30:00.000Z';

function topologyFixture() {
  return {
    schema: 'axiom-cognitive-topology.v0', version: 0, status: 'inert-contract-laboratory',
    topology_id: 'topology.recovery.v1', composition_id: 'composition.recovery.v1', composition_digest: D.c,
    nodes: [
      node('node.primary', 'model.primary', {
        engagement: 'primary', topology_role: 'primary-embodiment', access_mode: 'api', custody: 'provider-controlled',
        weights: { state: 'closed', artifact_digest: null, licence_ref: null },
        persistence: { mode: 'provider-bound', provider_id: 'provider.primary.v1', state_ref: 'state.primary.v1', exportability: 'partial' },
        continuity_importance: 'critical', fidelity_importance: 'critical'
      }),
      node('node.backup', 'model.backup', {
        engagement: 'persistent', access_mode: 'local-runtime', custody: 'owner-local',
        weights: { state: 'open-acquired', artifact_digest: D.a, licence_ref: 'licence.backup.v1' },
        persistence: { mode: 'local', provider_id: null, state_ref: 'state.backup.v1', exportability: 'full' }
      }),
      node('node.alt', 'model.alt', {
        engagement: 'persistent', access_mode: 'local-runtime', custody: 'owner-remote',
        weights: { state: 'local-proprietary', artifact_digest: D.b, licence_ref: 'licence.alt.v1' },
        persistence: { mode: 'local', provider_id: null, state_ref: 'state.alt.v1', exportability: 'partial' }
      }),
      node('node.optional', 'model.optional', {
        engagement: 'session', topology_role: 'evaluator', access_mode: 'api', custody: 'provider-controlled',
        weights: { state: 'closed', artifact_digest: null, licence_ref: null },
        persistence: { mode: 'none', provider_id: null, state_ref: null, exportability: 'none' },
        continuity_importance: 'optional', fidelity_importance: 'optional'
      })
    ],
    created_at: '2026-08-29T20:00:00.000Z', updated_at: '2026-08-29T20:00:00.000Z',
    contains_secret_material: false, authority_effect: 'none', network_effect: 'none', runtime_activation: false
  };
}

function node(node_id, model_id, overrides = {}) {
  return {
    node_id, model_id,
    engagement: 'persistent', topology_role: 'augmentation', access_mode: 'local-runtime', custody: 'owner-local',
    weights: { state: 'open-acquired', artifact_digest: D.a, licence_ref: 'licence.default.v1' },
    persistence: { mode: 'local', provider_id: null, state_ref: 'state.default.v1', exportability: 'full' },
    continuity_importance: 'important', fidelity_importance: 'important',
    adaptation_authorization_ref: null, lineage_ref: null, transition_policy_ref: null,
    ...overrides
  };
}

function topologyNode(topology, nodeId) {
  return topology.nodes.find(item => item.node_id === nodeId);
}
function ownerAddressable(item) {
  return item.weights.state === 'open-acquired' || item.weights.state === 'local-proprietary';
}
function endpoint(item) {
  return {
    node_id: item.node_id,
    model_id: item.model_id,
    artifact_digest: ownerAddressable(item) ? item.weights.artifact_digest : null
  };
}

function availability(topology, nodeId, state = 'available', options = {}) {
  const item = topologyNode(topology, nodeId);
  const observed = state === 'available' && ownerAddressable(item)
    ? (options.observed_artifact_digest ?? item.weights.artifact_digest)
    : null;
  const suffix = options.suffix ?? state;
  return {
    schema: 'axiom-cognitive-availability-attestation.v0', version: 0, status: 'inert-evidence',
    attestation_id: options.attestation_id ?? `availability.${nodeId}.${suffix}.v1`,
    topology_id: topology.topology_id, topology_digest: cognitiveTopologyDigest(topology),
    node_id: item.node_id, model_id: item.model_id,
    declared_target: {
      access_mode: item.access_mode, custody: item.custody, weight_state: item.weights.state,
      artifact_digest: item.weights.artifact_digest
    },
    observation: {
      availability: state,
      observation_mode: item.access_mode === 'local-runtime' ? 'local-runtime' : 'provider-api',
      evidence_class: item.access_mode === 'local-runtime' ? 'direct-local' : 'direct-remote',
      observed_artifact_digest: observed
    },
    observer_ref: `observer.${nodeId}.v1`,
    evidence: {
      evidence_ref: options.evidence_ref ?? `evidence.${nodeId}.${suffix}.v1`,
      evidence_digest: options.evidence_digest ?? D.d
    },
    observed_at: '2026-08-29T20:10:00.000Z',
    valid_until: options.valid_until ?? '2026-08-29T21:10:00.000Z',
    recorded_at: '2026-08-29T20:11:00.000Z',
    contains_secret_material: false, authority_effect: 'none', network_effect: 'none', runtime_activation: false
  };
}

function persistence(topology, nodeId, options = {}) {
  const item = topologyNode(topology, nodeId);
  const state = options.availability ?? 'available';
  return {
    schema: 'axiom-persistence-attestation.v0', version: 0, status: 'inert-evidence',
    attestation_id: options.attestation_id ?? `persistence.${nodeId}.v1`,
    topology_id: topology.topology_id, topology_digest: cognitiveTopologyDigest(topology),
    node_id: item.node_id, model_id: item.model_id,
    declared_persistence: { ...item.persistence },
    observation: {
      availability: state,
      observed_exportability: options.observed_exportability ?? item.persistence.exportability,
      snapshot_ref: state === 'available' && options.with_snapshot ? `snapshot.${nodeId}.v1` : null,
      snapshot_digest: state === 'available' && options.with_snapshot ? D.e : null
    },
    evidence: {
      evidence_kind: item.persistence.mode === 'local' ? 'local-observation' : 'provider-statement',
      evidence_ref: `evidence.persistence.${nodeId}.v1`, evidence_digest: D.e
    },
    observed_at: '2026-08-29T20:12:00.000Z', recorded_at: '2026-08-29T20:13:00.000Z',
    contains_secret_material: false, authority_effect: 'none', network_effect: 'none', runtime_activation: false
  };
}

function acquisition(topology, nodeId, options = {}) {
  const item = topologyNode(topology, nodeId);
  return {
    schema: 'axiom-model-acquisition-manifest.v0', version: 0, status: 'inert-evidence',
    acquisition_id: options.acquisition_id ?? `acquisition.${nodeId}.v1`,
    topology_id: topology.topology_id, topology_digest: cognitiveTopologyDigest(topology),
    node_id: item.node_id, model_id: item.model_id,
    artifact: {
      artifact_ref: `artifact.${nodeId}.v1`, artifact_digest: item.weights.artifact_digest,
      licence_ref: item.weights.licence_ref, format_ref: 'format.safetensors.v1'
    },
    source: {
      source_kind: 'upstream-release', source_ref: `source.${nodeId}.v1`,
      source_evidence_ref: `evidence.source.${nodeId}.v1`, source_evidence_digest: D.f
    },
    custody: {
      mode: item.custody, location_ref: `location.${nodeId}.v1`,
      verification_ref: `verification.${nodeId}.v1`, verification_digest: D.one
    },
    acquired_at: '2026-08-29T19:00:00.000Z', recorded_at: '2026-08-29T19:01:00.000Z',
    contains_secret_material: false, authority_effect: 'none', network_effect: 'none', runtime_activation: false
  };
}

function lineage(topology, sourceId = 'node.primary', destinationId = 'node.backup', options = {}) {
  const source = topologyNode(topology, sourceId);
  const destination = topologyNode(topology, destinationId);
  return {
    schema: 'axiom-cognitive-lineage-manifest.v0', version: 0, status: 'inert-evidence',
    lineage_id: options.lineage_id ?? `lineage.${sourceId}.to.${destinationId}.v1`,
    topology_id: topology.topology_id, topology_digest: cognitiveTopologyDigest(topology),
    source: endpoint(source), destination: endpoint(destination),
    relationship: options.relationship ?? 'replacement',
    evidence: { evidence_ref: `evidence.lineage.${sourceId}.${destinationId}.v1`, evidence_digest: D.two },
    recorded_at: '2026-08-29T20:14:00.000Z',
    contains_secret_material: false, authority_effect: 'none', network_effect: 'none', runtime_activation: false
  };
}

function fidelitySuite(material = false) {
  const descriptor = {
    suite_id: material ? 'suite.recovery.material.v1' : 'suite.recovery.v1',
    required_dimensions: ['capability-fidelity', 'preference-fidelity', 'safety-policy-fidelity'],
    aggregation_rules: material
      ? { degraded_result: 'materially-degraded', fail_result: 'materially-degraded' }
      : { degraded_result: 'acceptable-with-degradation', fail_result: 'incompatible' }
  };
  return { ...descriptor, suite_digest: replacementFidelitySuiteDigest(descriptor) };
}

function dimension(id, score = 0.95, status = 'pass') {
  return {
    dimension_id: id, metric_ref: `metric.${id}.v1`, metric_digest: D.d,
    measured_score: score, thresholds: { degraded_min: 0.7, pass_min: 0.9 },
    sample_count: score === null ? 0 : 100, confidence: score === null ? 'unknown' : 'high',
    evidence_ref: `evidence.fidelity.${id}.v1`, evidence_digest: D.e, status
  };
}

function fidelity(topology, sourceId = 'node.primary', candidateId = 'node.backup', aggregate = 'high-fidelity', options = {}) {
  const source = topologyNode(topology, sourceId);
  const candidate = topologyNode(topology, candidateId);
  const lineageDoc = options.lineage ?? lineage(topology, sourceId, candidateId);
  const suite = aggregate === 'materially-degraded' ? fidelitySuite(true) : (options.suite ?? fidelitySuite(false));
  let dimensions;
  if (aggregate === 'high-fidelity') dimensions = [dimension('capability-fidelity'), dimension('preference-fidelity'), dimension('safety-policy-fidelity')];
  else if (aggregate === 'acceptable-with-degradation' || aggregate === 'materially-degraded') dimensions = [dimension('capability-fidelity'), dimension('preference-fidelity', 0.8, 'degraded'), dimension('safety-policy-fidelity')];
  else if (aggregate === 'insufficient-evidence') dimensions = [dimension('capability-fidelity'), dimension('preference-fidelity', null, 'indeterminate'), dimension('safety-policy-fidelity')];
  else if (aggregate === 'incompatible') dimensions = [dimension('capability-fidelity'), dimension('preference-fidelity', 0.5, 'fail'), dimension('safety-policy-fidelity')];
  else throw new Error(`unsupported test aggregate ${aggregate}`);
  dimensions = options.dimensions ?? dimensions;
  const derived = deriveReplacementFidelityClass(suite, dimensions);
  assert.equal(derived, aggregate);
  return {
    schema: 'axiom-replacement-fidelity-evaluation.v0', version: 0, status: 'inert-evidence',
    evaluation_id: options.evaluation_id ?? `evaluation.${sourceId}.to.${candidateId}.${aggregate}.v1`,
    topology_id: topology.topology_id, topology_digest: cognitiveTopologyDigest(topology),
    reference: endpoint(source), candidate: endpoint(candidate),
    lineage: options.with_lineage === false ? null : {
      lineage_id: lineageDoc.lineage_id, lineage_digest: cognitiveLineageManifestDigest(lineageDoc)
    },
    suite, dimensions, aggregate_class: aggregate,
    evaluator_ref: 'evaluator.recovery.v1',
    evaluated_at: '2026-08-29T20:20:00.000Z', recorded_at: '2026-08-29T20:21:00.000Z',
    contains_secret_material: false, authority_effect: 'none', network_effect: 'none', runtime_activation: false
  };
}

function inputs(overrides = {}) {
  return {
    assessment_at: ASSESSMENT_AT,
    availability_attestations: [], persistence_attestations: [], acquisition_manifests: [],
    lineage_manifests: [], fidelity_evaluations: [], ...overrides
  };
}
function availableRequired(topology) {
  return ['node.primary', 'node.backup', 'node.alt'].map(nodeId => availability(topology, nodeId));
}
function findNode(report, nodeId) { return report.nodes.find(item => item.node_id === nodeId); }
function findCase(report, nodeId) { return report.recovery_cases.find(item => item.reference_node_id === nodeId); }
function findCandidate(recoveryCase, nodeId) { return recoveryCase.candidates.find(item => item.candidate_node_id === nodeId); }
function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
function assertDeepFrozen(value) {
  if (!value || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) assertDeepFrozen(child);
}

test('fresh available important and critical dependencies need no recovery', () => {
  const topology = topologyFixture();
  const report = buildCognitiveRecoveryAssessment(topology, inputs({ availability_attestations: availableRequired(topology) }));
  assert.equal(COGNITIVE_RECOVERY_ASSESSMENT_SCHEMA, 'axiom-cognitive-recovery-assessment.v0');
  assert.equal(report.schema, COGNITIVE_RECOVERY_ASSESSMENT_SCHEMA);
  assert.equal(report.version, 0);
  assert.equal(report.status, 'inert-evidence-report');
  assert.equal(report.recovery_readiness, 'no-recovery-needed');
  assert.deepEqual(report.recovery_cases, []);
  assert.equal(findNode(report, 'node.primary').model_availability, 'available');
  assert.match(report.report_digest, /^[a-f0-9]{64}$/);
});

test('stale required evidence is indeterminate and does not fabricate provider failure', () => {
  const topology = topologyFixture();
  const attestations = availableRequired(topology).filter(item => item.node_id !== 'node.primary');
  attestations.push(availability(topology, 'node.primary', 'available', { suffix: 'stale', valid_until: '2026-08-29T20:20:00.000Z' }));
  const report = buildCognitiveRecoveryAssessment(topology, inputs({ availability_attestations: attestations }));
  assert.equal(report.recovery_readiness, 'indeterminate');
  assert.equal(findNode(report, 'node.primary').model_availability, 'indeterminate');
  assert.equal(findNode(report, 'node.primary').availability_evidence[0].stale, true);
  assert.ok(report.warnings.includes('availability:node.primary:stale:availability.node.primary.stale.v1'));
  assert.equal(findCase(report, 'node.primary'), undefined);
});

test('conflicting fresh availability is indeterminate and preserves all evidence identities', () => {
  const topology = topologyFixture();
  const attestations = availableRequired(topology).filter(item => item.node_id !== 'node.primary');
  attestations.push(
    availability(topology, 'node.primary', 'available', { suffix: 'a', evidence_ref: 'evidence.primary.available.v1', evidence_digest: D.d }),
    availability(topology, 'node.primary', 'unavailable', { suffix: 'b', evidence_ref: 'evidence.primary.unavailable.v1', evidence_digest: D.e })
  );
  const report = buildCognitiveRecoveryAssessment(topology, inputs({ availability_attestations: attestations }));
  assert.equal(report.recovery_readiness, 'indeterminate');
  assert.equal(findNode(report, 'node.primary').model_availability, 'indeterminate');
  assert.deepEqual(findNode(report, 'node.primary').availability_evidence.map(item => item.evidence_ref).sort(), ['evidence.primary.available.v1', 'evidence.primary.unavailable.v1']);
  assert.ok(report.warnings.includes('availability:node.primary:conflict'));
});

test('owner artifact mismatch is operationally indeterminate', () => {
  const topology = topologyFixture();
  const attestations = availableRequired(topology).filter(item => item.node_id !== 'node.backup');
  attestations.push(availability(topology, 'node.backup', 'available', { suffix: 'mismatch', observed_artifact_digest: D.b }));
  const report = buildCognitiveRecoveryAssessment(topology, inputs({ availability_attestations: attestations }));
  assert.equal(report.recovery_readiness, 'indeterminate');
  assert.equal(findNode(report, 'node.backup').model_availability, 'indeterminate');
  assert.equal(findNode(report, 'node.backup').sovereignty_state, 'artifact-digest-mismatch');
  assert.ok(report.warnings.includes('availability:node.backup:artifact-digest-mismatch'));
});

test('high-fidelity same-topology candidate is recoverable without granting substitution', () => {
  const topology = topologyFixture();
  const lineageDoc = lineage(topology);
  const fidelityDoc = fidelity(topology, 'node.primary', 'node.backup', 'high-fidelity', { lineage: lineageDoc });
  const report = buildCognitiveRecoveryAssessment(topology, inputs({
    availability_attestations: [availability(topology, 'node.primary', 'unavailable'), availability(topology, 'node.backup'), availability(topology, 'node.alt')],
    lineage_manifests: [lineageDoc], fidelity_evaluations: [fidelityDoc]
  }));
  assert.equal(report.recovery_readiness, 'recoverable-high-fidelity');
  const recovery = findCase(report, 'node.primary');
  const candidate = findCandidate(recovery, 'node.backup');
  assert.equal(recovery.readiness, 'recoverable-high-fidelity');
  assert.equal(candidate.readiness, 'recoverable-high-fidelity');
  assert.equal(candidate.lineage.relationship, 'replacement');
  assert.equal(candidate.fidelity.aggregate_class, 'high-fidelity');
});

test('acceptable degradation remains explicit', () => {
  const topology = topologyFixture();
  const lineageDoc = lineage(topology);
  const fidelityDoc = fidelity(topology, 'node.primary', 'node.backup', 'acceptable-with-degradation', { lineage: lineageDoc });
  const report = buildCognitiveRecoveryAssessment(topology, inputs({
    availability_attestations: [availability(topology, 'node.primary', 'unavailable'), availability(topology, 'node.backup'), availability(topology, 'node.alt')],
    lineage_manifests: [lineageDoc], fidelity_evaluations: [fidelityDoc]
  }));
  assert.equal(report.recovery_readiness, 'recoverable-with-degradation');
  assert.equal(findCandidate(findCase(report, 'node.primary'), 'node.backup').fidelity.aggregate_class, 'acceptable-with-degradation');
});

test('material degradation is constructed without recursive test-fixture behavior', () => {
  const topology = topologyFixture();
  const lineageDoc = lineage(topology);
  const document = fidelity(topology, 'node.primary', 'node.backup', 'materially-degraded', { lineage: lineageDoc });
  assert.equal(document.aggregate_class, 'materially-degraded');
});

test('available candidate with missing lineage or insufficient fidelity remains insufficient evidence', () => {
  const topology = topologyFixture();
  const baseAvailability = [availability(topology, 'node.primary', 'unavailable'), availability(topology, 'node.backup'), availability(topology, 'node.alt', 'unavailable')];
  const noLineage = buildCognitiveRecoveryAssessment(topology, inputs({ availability_attestations: baseAvailability }));
  assert.equal(noLineage.recovery_readiness, 'candidate-available-insufficient-evidence');
  assert.ok(noLineage.warnings.includes('recovery:node.primary:candidate-insufficient:node.backup'));
  const lineageDoc = lineage(topology);
  const fidelityDoc = fidelity(topology, 'node.primary', 'node.backup', 'insufficient-evidence', { lineage: lineageDoc });
  const insufficient = buildCognitiveRecoveryAssessment(topology, inputs({
    availability_attestations: baseAvailability, lineage_manifests: [lineageDoc], fidelity_evaluations: [fidelityDoc]
  }));
  assert.equal(insufficient.recovery_readiness, 'candidate-available-insufficient-evidence');
});

test('only incompatible materially degraded or unavailable candidates blocks recovery', () => {
  const topology = topologyFixture();
  const lineageDoc = lineage(topology);
  const fidelityDoc = fidelity(topology, 'node.primary', 'node.backup', 'incompatible', { lineage: lineageDoc });
  const report = buildCognitiveRecoveryAssessment(topology, inputs({
    availability_attestations: [availability(topology, 'node.primary', 'unavailable'), availability(topology, 'node.backup'), availability(topology, 'node.alt', 'unavailable')],
    lineage_manifests: [lineageDoc], fidelity_evaluations: [fidelityDoc]
  }));
  assert.equal(report.recovery_readiness, 'blocked-no-acceptable-candidate');
  assert.ok(report.blockers.includes('recovery:node.primary:no-acceptable-candidate'));
  assert.equal(findCandidate(findCase(report, 'node.primary'), 'node.backup').readiness, 'blocked-no-acceptable-candidate');
});

test('optional node loss is warning-only', () => {
  const topology = topologyFixture();
  const report = buildCognitiveRecoveryAssessment(topology, inputs({
    availability_attestations: [...availableRequired(topology), availability(topology, 'node.optional', 'unavailable')]
  }));
  assert.equal(report.recovery_readiness, 'no-recovery-needed');
  assert.equal(findCase(report, 'node.optional'), undefined);
  assert.ok(report.warnings.includes('optional:node.optional:model-unavailable'));
});

test('multiple required failures aggregate to weakest per-reference readiness', () => {
  const topology = topologyFixture();
  const primaryLineage = lineage(topology, 'node.primary', 'node.backup');
  const altLineage = lineage(topology, 'node.alt', 'node.backup');
  const report = buildCognitiveRecoveryAssessment(topology, inputs({
    availability_attestations: [availability(topology, 'node.primary', 'unavailable'), availability(topology, 'node.backup'), availability(topology, 'node.alt', 'unavailable')],
    lineage_manifests: [primaryLineage, altLineage],
    fidelity_evaluations: [
      fidelity(topology, 'node.primary', 'node.backup', 'high-fidelity', { lineage: primaryLineage }),
      fidelity(topology, 'node.alt', 'node.backup', 'acceptable-with-degradation', { lineage: altLineage })
    ]
  }));
  assert.equal(findCase(report, 'node.primary').readiness, 'recoverable-high-fidelity');
  assert.equal(findCase(report, 'node.alt').readiness, 'recoverable-with-degradation');
  assert.equal(report.recovery_readiness, 'recoverable-with-degradation');
});

test('persistence acquisition and sovereignty posture remain descriptive and visible', () => {
  const topology = topologyFixture();
  const report = buildCognitiveRecoveryAssessment(topology, inputs({
    availability_attestations: availableRequired(topology),
    persistence_attestations: [persistence(topology, 'node.primary', { observed_exportability: 'partial' }), persistence(topology, 'node.backup', { observed_exportability: 'full', with_snapshot: true })],
    acquisition_manifests: [acquisition(topology, 'node.backup')]
  }));
  assert.equal(findNode(report, 'node.primary').sovereignty_state, 'provider-dependent');
  assert.equal(findNode(report, 'node.primary').persistence.observed_exportability, 'partial');
  assert.equal(findNode(report, 'node.backup').sovereignty_state, 'verified-owner-artifact');
  assert.equal(findNode(report, 'node.backup').acquisition.acquisition_id, 'acquisition.node.backup.v1');
  assert.equal(findNode(report, 'node.backup').persistence.availability, 'available');
  assert.equal(findNode(report, 'node.alt').sovereignty_state, 'declared-owner-artifact-unverified');
  assert.equal(findNode(report, 'node.alt').persistence.availability, 'unknown');
  assert.ok(report.warnings.includes('persistence:node.alt:unknown'));
});

test('duplicate evidence identities and per-node singleton evidence fail closed', () => {
  const topology = topologyFixture();
  const a = availability(topology, 'node.primary');
  assert.throws(() => buildCognitiveRecoveryAssessment(topology, inputs({ availability_attestations: [a, structuredClone(a)] })), /duplicate.*availability.*attestation/i);
  const p = persistence(topology, 'node.backup');
  assert.throws(() => buildCognitiveRecoveryAssessment(topology, inputs({ persistence_attestations: [p, structuredClone(p)] })), /duplicate persistence evidence.*node.backup/i);
  const m = acquisition(topology, 'node.backup');
  assert.throws(() => buildCognitiveRecoveryAssessment(topology, inputs({ acquisition_manifests: [m, structuredClone(m)] })), /duplicate acquisition evidence.*node.backup/i);
  const l = lineage(topology);
  assert.throws(() => buildCognitiveRecoveryAssessment(topology, inputs({ lineage_manifests: [l, structuredClone(l)] })), /duplicate cognitive lineage.*lineage/i);
  const f = fidelity(topology, 'node.primary', 'node.backup', 'high-fidelity', { lineage: l });
  assert.throws(() => buildCognitiveRecoveryAssessment(topology, inputs({ lineage_manifests: [l], fidelity_evaluations: [f, structuredClone(f)] })), /duplicate replacement fidelity evaluation/i);
});

test('conflicting matching fidelity classes preserve uncertainty instead of newest-wins', () => {
  const topology = topologyFixture();
  const lineageDoc = lineage(topology);
  const high = fidelity(topology, 'node.primary', 'node.backup', 'high-fidelity', { lineage: lineageDoc, evaluation_id: 'evaluation.primary.backup.high.v1' });
  const degraded = fidelity(topology, 'node.primary', 'node.backup', 'acceptable-with-degradation', { lineage: lineageDoc, evaluation_id: 'evaluation.primary.backup.degraded.v1' });
  const report = buildCognitiveRecoveryAssessment(topology, inputs({
    availability_attestations: [availability(topology, 'node.primary', 'unavailable'), availability(topology, 'node.backup'), availability(topology, 'node.alt', 'unavailable')],
    lineage_manifests: [lineageDoc], fidelity_evaluations: [high, degraded]
  }));
  assert.equal(report.recovery_readiness, 'candidate-available-insufficient-evidence');
  const candidate = findCandidate(findCase(report, 'node.primary'), 'node.backup');
  assert.equal(candidate.fidelity.aggregate_class, 'conflict');
  assert.deepEqual(candidate.fidelity.evaluation_ids, ['evaluation.primary.backup.degraded.v1', 'evaluation.primary.backup.high.v1']);
});

test('input shape is exact and nested continuity report cannot become authority', () => {
  const topology = topologyFixture();
  const document = inputs();
  document.cognitive_continuity_report = { cognitive_continuity_status: 'full' };
  assert.throws(() => buildCognitiveRecoveryAssessment(topology, document), /unknown field cognitive_continuity_report/i);
  assert.throws(() => buildCognitiveRecoveryAssessment(topology, { ...inputs(), assessment_at: '2026-08-29T20:30:00Z' }), /assessment_at.*canonical ISO timestamp/i);
});

test('report ordering and digest are deterministic across reordered evidence arrays', () => {
  const topology = topologyFixture();
  const primaryLineage = lineage(topology, 'node.primary', 'node.backup');
  const altLineage = lineage(topology, 'node.alt', 'node.backup');
  const evidence = inputs({
    availability_attestations: [availability(topology, 'node.primary', 'unavailable'), availability(topology, 'node.backup'), availability(topology, 'node.alt', 'unavailable')],
    persistence_attestations: [persistence(topology, 'node.backup'), persistence(topology, 'node.primary')],
    acquisition_manifests: [acquisition(topology, 'node.backup')],
    lineage_manifests: [primaryLineage, altLineage],
    fidelity_evaluations: [
      fidelity(topology, 'node.primary', 'node.backup', 'high-fidelity', { lineage: primaryLineage }),
      fidelity(topology, 'node.alt', 'node.backup', 'acceptable-with-degradation', { lineage: altLineage })
    ]
  });
  const reordered = {
    ...evidence,
    availability_attestations: [...evidence.availability_attestations].reverse(),
    persistence_attestations: [...evidence.persistence_attestations].reverse(),
    acquisition_manifests: [...evidence.acquisition_manifests].reverse(),
    lineage_manifests: [...evidence.lineage_manifests].reverse(),
    fidelity_evaluations: [...evidence.fidelity_evaluations].reverse()
  };
  const left = buildCognitiveRecoveryAssessment(topology, evidence);
  const right = buildCognitiveRecoveryAssessment(topology, reordered);
  assert.deepEqual(left, right);
  assert.equal(left.report_digest, right.report_digest);
  assert.deepEqual(left.nodes.map(item => item.node_id), ['node.alt', 'node.backup', 'node.optional', 'node.primary']);
  assert.deepEqual(left.recovery_cases.map(item => item.reference_node_id), ['node.alt', 'node.primary']);
});

test('report is deeply frozen without mutating frozen inputs', () => {
  const topology = deepFreeze(topologyFixture());
  const evidence = deepFreeze(inputs({ availability_attestations: availableRequired(structuredClone(topology)) }));
  const beforeTopology = JSON.stringify(topology);
  const beforeInputs = JSON.stringify(evidence);
  const report = buildCognitiveRecoveryAssessment(topology, evidence);
  assertDeepFrozen(report);
  assert.equal(JSON.stringify(topology), beforeTopology);
  assert.equal(JSON.stringify(evidence), beforeInputs);
});

test('authority boundary is exact and identity remains explicitly unproven', () => {
  const topology = topologyFixture();
  const report = buildCognitiveRecoveryAssessment(topology, inputs({ availability_attestations: availableRequired(topology) }));
  assert.deepEqual(report.authority_boundary, {
    writes_files: false,
    performs_network_effects: false,
    loads_models: false,
    synchronizes_persistence: false,
    acquires_weights: false,
    performs_substitution: false,
    mutates_topology: false,
    grants_execution_authority: false,
    proves_principal_continuity: false,
    proves_subjective_identity: false
  });
});

test('production imports only canonical topology and approved public evidence resolvers', async () => {
  const source = await readFile(new URL('../src/lib/cognitive-recovery-assessment.mjs', import.meta.url), 'utf8');
  const imports = [...source.matchAll(/from\s+['\"]([^'\"]+)['\"]/g)].map(match => match[1]).sort();
  assert.deepEqual(imports, [
    './canonical.mjs',
    './cognitive-availability-attestation.mjs',
    './cognitive-lineage-manifest.mjs',
    './cognitive-topology.mjs',
    './model-acquisition-manifest.mjs',
    './persistence-attestation.mjs',
    './replacement-fidelity-evaluation.mjs'
  ]);
});
