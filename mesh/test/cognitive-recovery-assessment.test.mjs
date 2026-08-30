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

const DIGEST_A = 'a'.repeat(64);
const DIGEST_B = 'b'.repeat(64);
const DIGEST_C = 'c'.repeat(64);
const DIGEST_D = 'd'.repeat(64);
const DIGEST_E = 'e'.repeat(64);
const DIGEST_F = 'f'.repeat(64);
const DIGEST_1 = '1'.repeat(64);
const DIGEST_2 = '2'.repeat(64);
const ASSESSMENT_AT = '2026-08-29T20:30:00.000Z';

function topologyFixture() {
  return {
    schema: 'axiom-cognitive-topology.v0',
    version: 0,
    status: 'inert-contract-laboratory',
    topology_id: 'topology.recovery.v1',
    composition_id: 'composition.recovery.v1',
    composition_digest: DIGEST_C,
    nodes: [
      {
        node_id: 'node.primary',
        model_id: 'model.primary',
        engagement: 'primary',
        topology_role: 'primary-embodiment',
        access_mode: 'api',
        custody: 'provider-controlled',
        weights: { state: 'closed', artifact_digest: null, licence_ref: null },
        persistence: { mode: 'provider-bound', provider_id: 'provider.primary.v1', state_ref: 'state.primary.v1', exportability: 'partial' },
        continuity_importance: 'critical',
        fidelity_importance: 'critical',
        adaptation_authorization_ref: null,
        lineage_ref: null,
        transition_policy_ref: null
      },
      {
        node_id: 'node.backup',
        model_id: 'model.backup',
        engagement: 'persistent',
        topology_role: 'augmentation',
        access_mode: 'local-runtime',
        custody: 'owner-local',
        weights: { state: 'open-acquired', artifact_digest: DIGEST_A, licence_ref: 'licence.backup.v1' },
        persistence: { mode: 'local', provider_id: null, state_ref: 'state.backup.v1', exportability: 'full' },
        continuity_importance: 'important',
        fidelity_importance: 'important',
        adaptation_authorization_ref: null,
        lineage_ref: null,
        transition_policy_ref: null
      },
      {
        node_id: 'node.alt',
        model_id: 'model.alt',
        engagement: 'persistent',
        topology_role: 'augmentation',
        access_mode: 'local-runtime',
        custody: 'owner-remote',
        weights: { state: 'local-proprietary', artifact_digest: DIGEST_B, licence_ref: 'licence.alt.v1' },
        persistence: { mode: 'local', provider_id: null, state_ref: 'state.alt.v1', exportability: 'partial' },
        continuity_importance: 'important',
        fidelity_importance: 'important',
        adaptation_authorization_ref: null,
        lineage_ref: null,
        transition_policy_ref: null
      },
      {
        node_id: 'node.optional',
        model_id: 'model.optional',
        engagement: 'session',
        topology_role: 'evaluator',
        access_mode: 'api',
        custody: 'provider-controlled',
        weights: { state: 'closed', artifact_digest: null, licence_ref: null },
        persistence: { mode: 'none', provider_id: null, state_ref: null, exportability: 'none' },
        continuity_importance: 'optional',
        fidelity_importance: 'optional',
        adaptation_authorization_ref: null,
        lineage_ref: null,
        transition_policy_ref: null
      }
    ],
    created_at: '2026-08-29T20:00:00.000Z',
    updated_at: '2026-08-29T20:00:00.000Z',
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function nodeFor(topology, nodeId) {
  return topology.nodes.find(node => node.node_id === nodeId);
}

function ownerAddressable(node) {
  return node.weights.state === 'open-acquired' || node.weights.state === 'local-proprietary';
}

function availabilityAttestation(topology, nodeId, availability = 'available', options = {}) {
  const node = nodeFor(topology, nodeId);
  const suffix = options.suffix ?? availability;
  const observedDigest = availability === 'available' && ownerAddressable(node)
    ? (options.observed_artifact_digest ?? node.weights.artifact_digest)
    : null;
  return {
    schema: 'axiom-cognitive-availability-attestation.v0',
    version: 0,
    status: 'inert-evidence',
    attestation_id: options.attestation_id ?? `availability.${nodeId}.${suffix}.v1`,
    topology_id: topology.topology_id,
    topology_digest: cognitiveTopologyDigest(topology),
    node_id: node.node_id,
    model_id: node.model_id,
    declared_target: {
      access_mode: node.access_mode,
      custody: node.custody,
      weight_state: node.weights.state,
      artifact_digest: node.weights.artifact_digest
    },
    observation: {
      availability,
      observation_mode: options.observation_mode ?? (node.access_mode === 'local-runtime' ? 'local-runtime' : 'provider-api'),
      evidence_class: options.evidence_class ?? (node.access_mode === 'local-runtime' ? 'direct-local' : 'direct-remote'),
      observed_artifact_digest: observedDigest
    },
    observer_ref: options.observer_ref ?? `observer.${nodeId}.v1`,
    evidence: {
      evidence_ref: options.evidence_ref ?? `evidence.${nodeId}.${suffix}.v1`,
      evidence_digest: options.evidence_digest ?? DIGEST_D
    },
    observed_at: options.observed_at ?? '2026-08-29T20:10:00.000Z',
    valid_until: options.valid_until ?? '2026-08-29T21:10:00.000Z',
    recorded_at: options.recorded_at ?? '2026-08-29T20:11:00.000Z',
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function persistenceAttestation(topology, nodeId, options = {}) {
  const node = nodeFor(topology, nodeId);
  const available = options.availability ?? 'available';
  return {
    schema: 'axiom-persistence-attestation.v0',
    version: 0,
    status: 'inert-evidence',
    attestation_id: options.attestation_id ?? `persistence.${nodeId}.v1`,
    topology_id: topology.topology_id,
    topology_digest: cognitiveTopologyDigest(topology),
    node_id: node.node_id,
    model_id: node.model_id,
    declared_persistence: { ...node.persistence },
    observation: {
      availability: available,
      observed_exportability: options.observed_exportability ?? node.persistence.exportability,
      snapshot_ref: available === 'available' && options.with_snapshot ? `snapshot.${nodeId}.v1` : null,
      snapshot_digest: available === 'available' && options.with_snapshot ? DIGEST_E : null
    },
    evidence: {
      evidence_kind: options.evidence_kind ?? (node.persistence.mode === 'local' ? 'local-observation' : 'provider-statement'),
      evidence_ref: options.evidence_ref ?? `evidence.persistence.${nodeId}.v1`,
      evidence_digest: options.evidence_digest ?? DIGEST_E
    },
    observed_at: '2026-08-29T20:12:00.000Z',
    recorded_at: '2026-08-29T20:13:00.000Z',
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function acquisitionManifest(topology, nodeId, options = {}) {
  const node = nodeFor(topology, nodeId);
  return {
    schema: 'axiom-model-acquisition-manifest.v0',
    version: 0,
    status: 'inert-evidence',
    acquisition_id: options.acquisition_id ?? `acquisition.${nodeId}.v1`,
    topology_id: topology.topology_id,
    topology_digest: cognitiveTopologyDigest(topology),
    node_id: node.node_id,
    model_id: node.model_id,
    artifact: {
      artifact_ref: `artifact.${nodeId}.v1`,
      artifact_digest: node.weights.artifact_digest,
      licence_ref: node.weights.licence_ref,
      format_ref: 'format.safetensors.v1'
    },
    source: {
      source_kind: 'upstream-release',
      source_ref: `source.${nodeId}.v1`,
      source_evidence_ref: `evidence.source.${nodeId}.v1`,
      source_evidence_digest: DIGEST_F
    },
    custody: {
      mode: node.custody,
      location_ref: `location.${nodeId}.v1`,
      verification_ref: `verification.${nodeId}.v1`,
      verification_digest: DIGEST_1
    },
    acquired_at: '2026-08-29T19:00:00.000Z',
    recorded_at: '2026-08-29T19:01:00.000Z',
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function lineageManifest(topology, sourceId = 'node.primary', destinationId = 'node.backup', options = {}) {
  const source = nodeFor(topology, sourceId);
  const destination = nodeFor(topology, destinationId);
  return {
    schema: 'axiom-cognitive-lineage-manifest.v0',
    version: 0,
    status: 'inert-evidence',
    lineage_id: options.lineage_id ?? `lineage.${sourceId}.to.${destinationId}.v1`,
    topology_id: topology.topology_id,
    topology_digest: cognitiveTopologyDigest(topology),
    source: {
      node_id: source.node_id,
      model_id: source.model_id,
      artifact_digest: ownerAddressable(source) ? source.weights.artifact_digest : null
    },
    destination: {
      node_id: destination.node_id,
      model_id: destination.model_id,
      artifact_digest: ownerAddressable(destination) ? destination.weights.artifact_digest : null
    },
    relationship: options.relationship ?? 'replacement',
    evidence: {
      evidence_ref: options.evidence_ref ?? `evidence.lineage.${sourceId}.${destinationId}.v1`,
      evidence_digest: options.evidence_digest ?? DIGEST_2
    },
    recorded_at: '2026-08-29T20:14:00.000Z',
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function fidelitySuite(options = {}) {
  const descriptor = {
    suite_id: options.suite_id ?? 'suite.recovery.v1',
    required_dimensions: options.required_dimensions ?? [
      'capability-fidelity',
      'preference-fidelity',
      'safety-policy-fidelity'
    ],
    aggregation_rules: options.aggregation_rules ?? {
      degraded_result: 'acceptable-with-degradation',
      fail_result: 'incompatible'
    }
  };
  return { ...descriptor, suite_digest: replacementFidelitySuiteDigest(descriptor) };
}

function fidelityDimension(dimensionId, score = 0.95, status = 'pass') {
  return {
    dimension_id: dimensionId,
    metric_ref: `metric.${dimensionId}.v1`,
    metric_digest: DIGEST_D,
    measured_score: score,
    thresholds: { degraded_min: 0.7, pass_min: 0.9 },
    sample_count: score === null ? 0 : 100,
    confidence: score === null ? 'unknown' : 'high',
    evidence_ref: `evidence.fidelity.${dimensionId}.v1`,
    evidence_digest: DIGEST_E,
    status
  };
}

function fidelityEvaluation(topology, sourceId = 'node.primary', candidateId = 'node.backup', aggregate = 'high-fidelity', options = {}) {
  const source = nodeFor(topology, sourceId);
  const candidate = nodeFor(topology, candidateId);
  const lineage = options.lineage ?? lineageManifest(topology, sourceId, candidateId);
  const suite = options.suite ?? fidelitySuite();
  let dimensions;
  if (aggregate === 'high-fidelity') {
    dimensions = [
      fidelityDimension('capability-fidelity'),
      fidelityDimension('preference-fidelity'),
      fidelityDimension('safety-policy-fidelity')
    ];
  } else if (aggregate === 'acceptable-with-degradation') {
    dimensions = [
      fidelityDimension('capability-fidelity'),
      fidelityDimension('preference-fidelity', 0.8, 'degraded'),
      fidelityDimension('safety-policy-fidelity')
    ];
  } else if (aggregate === 'insufficient-evidence') {
    dimensions = [
      fidelityDimension('capability-fidelity'),
      fidelityDimension('preference-fidelity', null, 'indeterminate'),
      fidelityDimension('safety-policy-fidelity')
    ];
  } else if (aggregate === 'materially-degraded') {
    const materialSuite = fidelitySuite({
      aggregation_rules: { degraded_result: 'materially-degraded', fail_result: 'materially-degraded' }
    });
    dimensions = [
      fidelityDimension('capability-fidelity'),
      fidelityDimension('preference-fidelity', 0.8, 'degraded'),
      fidelityDimension('safety-policy-fidelity')
    ];
    return fidelityEvaluation(topology, sourceId, candidateId, deriveReplacementFidelityClass(materialSuite, dimensions), {
      ...options,
      suite: materialSuite,
      dimensions
    });
  } else if (aggregate === 'incompatible') {
    dimensions = [
      fidelityDimension('capability-fidelity'),
      fidelityDimension('preference-fidelity', 0.5, 'fail'),
      fidelityDimension('safety-policy-fidelity')
    ];
  } else {
    throw new Error(`unsupported test aggregate ${aggregate}`);
  }
  dimensions = options.dimensions ?? dimensions;
  const derived = deriveReplacementFidelityClass(suite, dimensions);
  return {
    schema: 'axiom-replacement-fidelity-evaluation.v0',
    version: 0,
    status: 'inert-evidence',
    evaluation_id: options.evaluation_id ?? `evaluation.${sourceId}.to.${candidateId}.${derived}.v1`,
    topology_id: topology.topology_id,
    topology_digest: cognitiveTopologyDigest(topology),
    reference: {
      node_id: source.node_id,
      model_id: source.model_id,
      artifact_digest: ownerAddressable(source) ? source.weights.artifact_digest : null
    },
    candidate: {
      node_id: candidate.node_id,
      model_id: candidate.model_id,
      artifact_digest: ownerAddressable(candidate) ? candidate.weights.artifact_digest : null
    },
    lineage: options.with_lineage === false ? null : {
      lineage_id: lineage.lineage_id,
      lineage_digest: cognitiveLineageManifestDigest(lineage)
    },
    suite,
    dimensions,
    aggregate_class: derived,
    evaluator_ref: 'evaluator.recovery.v1',
    evaluated_at: '2026-08-29T20:20:00.000Z',
    recorded_at: '2026-08-29T20:21:00.000Z',
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function inputs(overrides = {}) {
  return {
    assessment_at: ASSESSMENT_AT,
    availability_attestations: [],
    persistence_attestations: [],
    acquisition_manifests: [],
    lineage_manifests: [],
    fidelity_evaluations: [],
    ...overrides
  };
}

function availableRequiredEvidence(topology) {
  return ['node.primary', 'node.backup', 'node.alt'].map(nodeId => availabilityAttestation(topology, nodeId));
}

function findNode(report, nodeId) {
  return report.nodes.find(node => node.node_id === nodeId);
}

function findCase(report, nodeId) {
  return report.recovery_cases.find(item => item.reference_node_id === nodeId);
}

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
  const report = buildCognitiveRecoveryAssessment(topology, inputs({
    availability_attestations: availableRequiredEvidence(topology)
  }));

  assert.equal(COGNITIVE_RECOVERY_ASSESSMENT_SCHEMA, 'axiom-cognitive-recovery-assessment.v0');
  assert.equal(report.schema, COGNITIVE_RECOVERY_ASSESSMENT_SCHEMA);
  assert.equal(report.version, 0);
  assert.equal(report.status, 'inert-evidence-report');
  assert.equal(report.recovery_readiness, 'no-recovery-needed');
  assert.deepEqual(report.recovery_cases, []);
  assert.equal(findNode(report, 'node.primary').model_availability, 'available');
  assert.equal(findNode(report, 'node.backup').model_availability, 'available');
  assert.match(report.report_digest, /^[a-f0-9]{64}$/);
});

test('stale last evidence makes required node indeterminate without inventing provider failure', () => {
  const topology = topologyFixture();
  const attestations = availableRequiredEvidence(topology).filter(item => item.node_id !== 'node.primary');
  attestations.push(availabilityAttestation(topology, 'node.primary', 'available', {
    suffix: 'stale',
    valid_until: '2026-08-29T20:20:00.000Z'
  }));
  const report = buildCognitiveRecoveryAssessment(topology, inputs({ availability_attestations: attestations }));

  assert.equal(report.recovery_readiness, 'indeterminate');
  const primary = findNode(report, 'node.primary');
  assert.equal(primary.model_availability, 'indeterminate');
  assert.equal(primary.availability_evidence.length, 1);
  assert.equal(primary.availability_evidence[0].stale, true);
  assert.ok(report.warnings.includes('availability:node.primary:stale:availability.node.primary.stale.v1'));
  assert.equal(findCase(report, 'node.primary'), undefined);
});

test('conflicting fresh availability is indeterminate and surfaces every conflicting evidence identity', () => {
  const topology = topologyFixture();
  const attestations = availableRequiredEvidence(topology).filter(item => item.node_id !== 'node.primary');
  attestations.push(
    availabilityAttestation(topology, 'node.primary', 'available', {
      suffix: 'a', evidence_ref: 'evidence.primary.available.v1', evidence_digest: DIGEST_D
    }),
    availabilityAttestation(topology, 'node.primary', 'unavailable', {
      suffix: 'b', evidence_ref: 'evidence.primary.unavailable.v1', evidence_digest: DIGEST_E
    })
  );
  const report = buildCognitiveRecoveryAssessment(topology, inputs({ availability_attestations: attestations }));

  assert.equal(report.recovery_readiness, 'indeterminate');
  const primary = findNode(report, 'node.primary');
  assert.equal(primary.model_availability, 'indeterminate');
  assert.deepEqual(
    primary.availability_evidence.map(item => item.evidence_ref).sort(),
    ['evidence.primary.available.v1', 'evidence.primary.unavailable.v1']
  );
  assert.ok(report.warnings.includes('availability:node.primary:conflict'));
});

test('owner artifact mismatch is operationally indeterminate and cannot be treated as available', () => {
  const topology = topologyFixture();
  const attestations = availableRequiredEvidence(topology).filter(item => item.node_id !== 'node.backup');
  attestations.push(availabilityAttestation(topology, 'node.backup', 'available', {
    suffix: 'mismatch', observed_artifact_digest: DIGEST_B
  }));
  const report = buildCognitiveRecoveryAssessment(topology, inputs({ availability_attestations: attestations }));

  assert.equal(report.recovery_readiness, 'indeterminate');
  assert.equal(findNode(report, 'node.backup').model_availability, 'indeterminate');
  assert.equal(findNode(report, 'node.backup').sovereignty_state, 'artifact-digest-mismatch');
  assert.ok(report.warnings.includes('availability:node.backup:artifact-digest-mismatch'));
});

test('unavailable primary plus exact available same-topology candidate lineage and high fidelity is recoverable-high-fidelity', () => {
  const topology = topologyFixture();
  const lineage = lineageManifest(topology, 'node.primary', 'node.backup');
  const fidelity = fidelityEvaluation(topology, 'node.primary', 'node.backup', 'high-fidelity', { lineage });
  const report = buildCognitiveRecoveryAssessment(topology, inputs({
    availability_attestations: [
      availabilityAttestation(topology, 'node.primary', 'unavailable'),
      availabilityAttestation(topology, 'node.backup', 'available'),
      availabilityAttestation(topology, 'node.alt', 'unavailable')
    ],
    lineage_manifests: [lineage],
    fidelity_evaluations: [fidelity]
  }));

  assert.equal(report.recovery_readiness, 'recoverable-high-fidelity');
  const recovery = findCase(report, 'node.primary');
  assert.equal(recovery.readiness, 'recoverable-high-fidelity');
  assert.equal(recovery.candidates.length, 1);
  assert.equal(recovery.candidates[0].candidate_node_id, 'node.backup');
  assert.equal(recovery.candidates[0].readiness, 'recoverable-high-fidelity');
  assert.equal(recovery.candidates[0].lineage.relationship, 'replacement');
  assert.equal(recovery.candidates[0].fidelity.aggregate_class, 'high-fidelity');
});

test('acceptable degradation remains explicit and yields recoverable-with-degradation', () => {
  const topology = topologyFixture();
  const lineage = lineageManifest(topology);
  const fidelity = fidelityEvaluation(topology, 'node.primary', 'node.backup', 'acceptable-with-degradation', { lineage });
  const report = buildCognitiveRecoveryAssessment(topology, inputs({
    availability_attestations: [
      availabilityAttestation(topology, 'node.primary', 'unavailable'),
      availabilityAttestation(topology, 'node.backup', 'available'),
      availabilityAttestation(topology, 'node.alt', 'unavailable')
    ],
    lineage_manifests: [lineage],
    fidelity_evaluations: [fidelity]
  }));

  assert.equal(report.recovery_readiness, 'recoverable-with-degradation');
  assert.equal(findCase(report, 'node.primary').candidates[0].fidelity.aggregate_class, 'acceptable-with-degradation');
});

test('available candidate with missing lineage or insufficient evaluation remains candidate-available-insufficient-evidence', () => {
  const topology = topologyFixture();
  const noLineage = buildCognitiveRecoveryAssessment(topology, inputs({
    availability_attestations: [
      availabilityAttestation(topology, 'node.primary', 'unavailable'),
      availabilityAttestation(topology, 'node.backup', 'available'),
      availabilityAttestation(topology, 'node.alt', 'unavailable')
    ]
  }));
  assert.equal(noLineage.recovery_readiness, 'candidate-available-insufficient-evidence');
  assert.ok(noLineage.warnings.includes('recovery:node.primary:candidate-insufficient:node.backup'));

  const lineage = lineageManifest(topology);
  const fidelity = fidelityEvaluation(topology, 'node.primary', 'node.backup', 'insufficient-evidence', { lineage });
  const insufficient = buildCognitiveRecoveryAssessment(topology, inputs({
    availability_attestations: [
      availabilityAttestation(topology, 'node.primary', 'unavailable'),
      availabilityAttestation(topology, 'node.backup', 'available'),
      availabilityAttestation(topology, 'node.alt', 'unavailable')
    ],
    lineage_manifests: [lineage],
    fidelity_evaluations: [fidelity]
  }));
  assert.equal(insufficient.recovery_readiness, 'candidate-available-insufficient-evidence');
});

test('only materially degraded incompatible or unavailable candidates blocks recovery', () => {
  const topology = topologyFixture();
  const backupLineage = lineageManifest(topology, 'node.primary', 'node.backup');
  const backupFidelity = fidelityEvaluation(topology, 'node.primary', 'node.backup', 'incompatible', { lineage: backupLineage });
  const report = buildCognitiveRecoveryAssessment(topology, inputs({
    availability_attestations: [
      availabilityAttestation(topology, 'node.primary', 'unavailable'),
      availabilityAttestation(topology, 'node.backup', 'available'),
      availabilityAttestation(topology, 'node.alt', 'unavailable')
    ],
    lineage_manifests: [backupLineage],
    fidelity_evaluations: [backupFidelity]
  }));

  assert.equal(report.recovery_readiness, 'blocked-no-acceptable-candidate');
  assert.ok(report.blockers.includes('recovery:node.primary:no-acceptable-candidate'));
  assert.equal(findCase(report, 'node.primary').candidates[0].readiness, 'blocked-no-acceptable-candidate');
});

test('optional node loss is warning-only and does not trigger recovery', () => {
  const topology = topologyFixture();
  const report = buildCognitiveRecoveryAssessment(topology, inputs({
    availability_attestations: [
      ...availableRequiredEvidence(topology),
      availabilityAttestation(topology, 'node.optional', 'unavailable')
    ]
  }));

  assert.equal(report.recovery_readiness, 'no-recovery-needed');
  assert.equal(findCase(report, 'node.optional'), undefined);
  assert.ok(report.warnings.includes('optional:node.optional:model-unavailable'));
});

test('multiple required failures aggregate to weakest per-reference supported readiness', () => {
  const topology = topologyFixture();
  const primaryToBackup = lineageManifest(topology, 'node.primary', 'node.backup');
  const altToBackup = lineageManifest(topology, 'node.alt', 'node.backup');
  const primaryFidelity = fidelityEvaluation(topology, 'node.primary', 'node.backup', 'high-fidelity', { lineage: primaryToBackup });
  const altFidelity = fidelityEvaluation(topology, 'node.alt', 'node.backup', 'acceptable-with-degradation', { lineage: altToBackup });
  const report = buildCognitiveRecoveryAssessment(topology, inputs({
    availability_attestations: [
      availabilityAttestation(topology, 'node.primary', 'unavailable'),
      availabilityAttestation(topology, 'node.backup', 'available'),
      availabilityAttestation(topology, 'node.alt', 'unavailable')
    ],
    lineage_manifests: [primaryToBackup, altToBackup],
    fidelity_evaluations: [primaryFidelity, altFidelity]
  }));

  assert.equal(findCase(report, 'node.primary').readiness, 'recoverable-high-fidelity');
  assert.equal(findCase(report, 'node.alt').readiness, 'recoverable-with-degradation');
  assert.equal(report.recovery_readiness, 'recoverable-with-degradation');
});

test('persistence acquisition and sovereignty posture remain visible and deterministic', () => {
  const topology = topologyFixture();
  const report = buildCognitiveRecoveryAssessment(topology, inputs({
    availability_attestations: availableRequiredEvidence(topology),
    persistence_attestations: [
      persistenceAttestation(topology, 'node.primary', { observed_exportability: 'partial' }),
      persistenceAttestation(topology, 'node.backup', { observed_exportability: 'full', with_snapshot: true })
    ],
    acquisition_manifests: [acquisitionManifest(topology, 'node.backup')]
  }));

  const primary = findNode(report, 'node.primary');
  const backup = findNode(report, 'node.backup');
  const alt = findNode(report, 'node.alt');
  assert.equal(primary.sovereignty_state, 'provider-dependent');
  assert.equal(primary.persistence.mode, 'provider-bound');
  assert.equal(primary.persistence.observed_exportability, 'partial');
  assert.equal(backup.sovereignty_state, 'verified-owner-artifact');
  assert.equal(backup.acquisition.acquisition_id, 'acquisition.node.backup.v1');
  assert.equal(backup.persistence.availability, 'available');
  assert.equal(alt.sovereignty_state, 'declared-owner-artifact-unverified');
  assert.equal(alt.persistence.availability, 'unknown');
  assert.ok(report.warnings.includes('persistence:node.alt:unknown'));
});

test('duplicate exact evidence identities and per-node singleton evidence fail closed', () => {
  const topology = topologyFixture();
  const availability = availabilityAttestation(topology, 'node.primary');
  assert.throws(() => buildCognitiveRecoveryAssessment(topology, inputs({
    availability_attestations: [availability, structuredClone(availability)]
  })), /duplicate.*availability.*attestation/i);

  const persistence = persistenceAttestation(topology, 'node.backup');
  assert.throws(() => buildCognitiveRecoveryAssessment(topology, inputs({
    persistence_attestations: [persistence, structuredClone(persistence)]
  })), /duplicate persistence evidence.*node.backup/i);

  const acquisition = acquisitionManifest(topology, 'node.backup');
  assert.throws(() => buildCognitiveRecoveryAssessment(topology, inputs({
    acquisition_manifests: [acquisition, structuredClone(acquisition)]
  })), /duplicate acquisition evidence.*node.backup/i);

  const lineage = lineageManifest(topology);
  assert.throws(() => buildCognitiveRecoveryAssessment(topology, inputs({
    lineage_manifests: [lineage, structuredClone(lineage)]
  })), /duplicate cognitive lineage.*lineage/i);

  const evaluation = fidelityEvaluation(topology, 'node.primary', 'node.backup', 'high-fidelity', { lineage });
  assert.throws(() => buildCognitiveRecoveryAssessment(topology, inputs({
    fidelity_evaluations: [evaluation, structuredClone(evaluation)],
    lineage_manifests: [lineage]
  })), /duplicate replacement fidelity evaluation/i);
});

test('conflicting matching fidelity classes preserve uncertainty instead of newest-wins', () => {
  const topology = topologyFixture();
  const lineage = lineageManifest(topology);
  const high = fidelityEvaluation(topology, 'node.primary', 'node.backup', 'high-fidelity', {
    lineage,
    evaluation_id: 'evaluation.primary.backup.high.v1'
  });
  const degraded = fidelityEvaluation(topology, 'node.primary', 'node.backup', 'acceptable-with-degradation', {
    lineage,
    evaluation_id: 'evaluation.primary.backup.degraded.v1'
  });
  const report = buildCognitiveRecoveryAssessment(topology, inputs({
    availability_attestations: [
      availabilityAttestation(topology, 'node.primary', 'unavailable'),
      availabilityAttestation(topology, 'node.backup', 'available'),
      availabilityAttestation(topology, 'node.alt', 'unavailable')
    ],
    lineage_manifests: [lineage],
    fidelity_evaluations: [high, degraded]
  }));

  assert.equal(report.recovery_readiness, 'candidate-available-insufficient-evidence');
  const candidate = findCase(report, 'node.primary').candidates[0];
  assert.equal(candidate.fidelity.aggregate_class, 'conflict');
  assert.deepEqual(candidate.fidelity.evaluation_ids, [
    'evaluation.primary.backup.degraded.v1',
    'evaluation.primary.backup.high.v1'
  ]);
});

test('input shape is exact and a nested continuity report cannot be accepted as authority', () => {
  const topology = topologyFixture();
  const document = inputs();
  document.cognitive_continuity_report = { cognitive_continuity_status: 'full' };
  assert.throws(() => buildCognitiveRecoveryAssessment(topology, document), /unknown field cognitive_continuity_report/i);
  assert.throws(() => buildCognitiveRecoveryAssessment(topology, { ...inputs(), assessment_at: '2026-08-29T20:30:00Z' }), /assessment_at.*canonical ISO timestamp/i);
});

test('report ordering and digest are deterministic across reordered supplied evidence arrays', () => {
  const topology = topologyFixture();
  const primaryLineage = lineageManifest(topology, 'node.primary', 'node.backup');
  const altLineage = lineageManifest(topology, 'node.alt', 'node.backup');
  const evidence = inputs({
    availability_attestations: [
      availabilityAttestation(topology, 'node.primary', 'unavailable'),
      availabilityAttestation(topology, 'node.backup', 'available'),
      availabilityAttestation(topology, 'node.alt', 'unavailable')
    ],
    persistence_attestations: [persistenceAttestation(topology, 'node.backup'), persistenceAttestation(topology, 'node.primary')],
    acquisition_manifests: [acquisitionManifest(topology, 'node.backup')],
    lineage_manifests: [primaryLineage, altLineage],
    fidelity_evaluations: [
      fidelityEvaluation(topology, 'node.primary', 'node.backup', 'high-fidelity', { lineage: primaryLineage }),
      fidelityEvaluation(topology, 'node.alt', 'node.backup', 'acceptable-with-degradation', { lineage: altLineage })
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
  assert.deepEqual(left.nodes.map(node => node.node_id), ['node.alt', 'node.backup', 'node.optional', 'node.primary']);
  assert.deepEqual(left.recovery_cases.map(item => item.reference_node_id), ['node.alt', 'node.primary']);
});

test('report is deeply frozen and does not mutate deeply frozen inputs', () => {
  const topology = deepFreeze(topologyFixture());
  const evidence = deepFreeze(inputs({
    availability_attestations: availableRequiredEvidence(structuredClone(topology))
  }));
  const beforeTopology = JSON.stringify(topology);
  const beforeInputs = JSON.stringify(evidence);
  const report = buildCognitiveRecoveryAssessment(topology, evidence);

  assertDeepFrozen(report);
  assert.equal(JSON.stringify(topology), beforeTopology);
  assert.equal(JSON.stringify(evidence), beforeInputs);
});

test('authority boundary is exact and principal continuity and subjective identity remain explicitly unproven', () => {
  const topology = topologyFixture();
  const report = buildCognitiveRecoveryAssessment(topology, inputs({
    availability_attestations: availableRequiredEvidence(topology)
  }));
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

test('production import boundary contains only canonical topology and the five approved public evidence resolvers', async () => {
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
