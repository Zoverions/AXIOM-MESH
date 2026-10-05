import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { cognitiveTopologyDigest } from '../src/lib/cognitive-topology.mjs';
import {
  COGNITIVE_RECOVERY_ASSESSMENT_SCHEMA,
  buildCognitiveRecoveryAssessment
} from '../src/lib/cognitive-recovery-assessment.mjs';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);
const D = 'd'.repeat(64);
const E = 'e'.repeat(64);
const F = 'f'.repeat(64);

function topologyFixture() {
  return {
    schema: 'axiom-cognitive-topology.v0',
    version: 0,
    status: 'inert-contract-laboratory',
    topology_id: 'topology.recovery.v1',
    composition_id: 'composition.recovery.v1',
    composition_digest: D,
    nodes: [
      {
        node_id: 'node.owner.kernel',
        model_id: 'model.owner.kernel',
        engagement: 'persistent',
        topology_role: 'identity-kernel',
        access_mode: 'local-runtime',
        custody: 'owner-local',
        weights: {
          state: 'open-acquired',
          artifact_digest: A,
          licence_ref: 'licence.owner.v1'
        },
        persistence: {
          mode: 'local',
          provider_id: null,
          state_ref: 'state.owner.v1',
          exportability: 'full'
        },
        continuity_importance: 'critical',
        fidelity_importance: 'critical',
        adaptation_authorization_ref: 'authorization.owner.v1',
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
        weights: {
          state: 'closed',
          artifact_digest: null,
          licence_ref: null
        },
        persistence: {
          mode: 'provider-bound',
          provider_id: 'provider.primary',
          state_ref: 'state.provider.primary',
          exportability: 'partial'
        },
        continuity_importance: 'important',
        fidelity_importance: 'important',
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

function availability(topology, nodeId, value = 'available', idSuffix = '1', overrides = {}) {
  const node = topology.nodes.find(item => item.node_id === nodeId);
  const owner = node.custody === 'owner-local';
  return {
    schema: 'axiom-cognitive-availability-attestation.v0',
    version: 0,
    status: 'inert-evidence',
    attestation_id: `availability.${nodeId}.${idSuffix}`,
    topology_id: topology.topology_id,
    topology_digest: cognitiveTopologyDigest(topology),
    node_id: node.node_id,
    model_id: node.model_id,
    observation: {
      availability: value,
      method: owner ? 'local-artifact' : 'provider-api',
      observed_artifact_digest: owner && value === 'available' ? node.weights.artifact_digest : null,
      observed_runtime_ref: owner ? null : 'runtime.provider.primary',
      assurance_class: owner ? 'verified-local' : 'signed'
    },
    observer: {
      observer_kind: owner ? 'local-service' : 'external-verifier',
      observer_ref: owner ? 'observer.local.v1' : 'observer.external.v1',
      observer_principal_ref: owner ? 'principal.local.observer' : 'principal.external.observer'
    },
    evidence: {
      evidence_kind: owner ? 'artifact-verification' : 'external-observation',
      evidence_ref: `evidence.${nodeId}.${idSuffix}`,
      evidence_digest: C,
      verification_ref: `verification.${nodeId}.${idSuffix}`,
      verification_digest: E
    },
    observed_at: '2026-08-30T10:05:00.000Z',
    valid_until: '2026-08-30T11:05:00.000Z',
    recorded_at: '2026-08-30T10:06:00.000Z',
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false,
    ...overrides
  };
}

function acquisition(topology) {
  const node = topology.nodes[0];
  return {
    schema: 'axiom-model-acquisition-manifest.v0',
    version: 0,
    status: 'inert-evidence',
    acquisition_id: 'acquisition.owner.kernel.v1',
    topology_id: topology.topology_id,
    topology_digest: cognitiveTopologyDigest(topology),
    node_id: node.node_id,
    model_id: node.model_id,
    artifact: {
      artifact_ref: 'artifact.owner.kernel.v1',
      artifact_digest: A,
      licence_ref: 'licence.owner.v1',
      format_ref: 'format.safetensors.v1'
    },
    source: {
      source_kind: 'upstream-release',
      source_ref: 'source.owner.kernel.v1',
      source_evidence_ref: 'source.evidence.owner.kernel.v1',
      source_evidence_digest: C
    },
    custody: {
      mode: 'owner-local',
      location_ref: 'location.owner.kernel.v1',
      verification_ref: 'verification.owner.kernel.v1',
      verification_digest: E
    },
    acquired_at: '2026-08-30T09:00:00.000Z',
    recorded_at: '2026-08-30T09:01:00.000Z',
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function persistence(topology, nodeId, value = 'available', idSuffix = '1') {
  const node = topology.nodes.find(item => item.node_id === nodeId);
  return {
    schema: 'axiom-persistence-attestation.v0',
    version: 0,
    status: 'inert-evidence',
    attestation_id: `persistence.${nodeId}.${idSuffix}`,
    topology_id: topology.topology_id,
    topology_digest: cognitiveTopologyDigest(topology),
    node_id: node.node_id,
    model_id: node.model_id,
    declared_persistence: { ...node.persistence },
    observation: {
      availability: value,
      observed_exportability: node.persistence.exportability,
      snapshot_ref: value === 'available' ? `snapshot.${nodeId}.${idSuffix}` : null,
      snapshot_digest: value === 'available' ? F : null
    },
    evidence: {
      evidence_kind: node.custody === 'provider-controlled' ? 'signed-provider-statement' : 'local-observation',
      evidence_ref: `persistence.evidence.${nodeId}.${idSuffix}`,
      evidence_digest: C
    },
    observed_at: '2026-08-30T10:05:00.000Z',
    recorded_at: '2026-08-30T10:06:00.000Z',
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function lineage(topology) {
  return {
    schema: 'axiom-cognitive-lineage-manifest.v0',
    version: 0,
    status: 'inert-evidence',
    lineage_id: 'lineage.owner.recovery.v1',
    topology_id: topology.topology_id,
    topology_digest: cognitiveTopologyDigest(topology),
    reference: {
      node_id: 'node.owner.kernel',
      model_id: 'model.owner.kernel',
      artifact_ref: 'artifact.owner.kernel.v1',
      artifact_digest: A,
      provider_version_ref: null
    },
    candidate: {
      node_id: null,
      model_id: 'model.owner.recovery',
      artifact_ref: 'artifact.owner.recovery.v1',
      artifact_digest: B,
      provider_version_ref: null
    },
    relationship: 'distilled-descendant',
    procedure: {
      procedure_kind: 'distillation',
      procedure_ref: 'procedure.owner.recovery.v1',
      procedure_digest: C,
      adaptation_authorization_ref: 'authorization.owner.v1'
    },
    evidence: {
      assurance_class: 'verified',
      evidence_ref: 'lineage.evidence.owner.recovery.v1',
      evidence_digest: D,
      verification_ref: 'lineage.verification.owner.recovery.v1',
      verification_digest: E
    },
    created_at: '2026-08-30T10:07:00.000Z',
    recorded_at: '2026-08-30T10:08:00.000Z',
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function dimension(name, result = 'pass') {
  return {
    dimension: name,
    result,
    observed_metric_ref: `metric.${name}.v1`,
    observed_metric_digest: C,
    threshold_ref: `threshold.${name}.v1`,
    threshold_digest: D,
    evidence_ref: `fidelity.evidence.${name}.v1`,
    evidence_digest: E
  };
}

function fidelity(topology, aggregate = 'high-fidelity') {
  const dimensions = [
    dimension('capability-fidelity'),
    dimension('preference-fidelity'),
    dimension('behavioral-fidelity')
  ];
  if (aggregate === 'acceptable-with-degradation') dimensions[1].result = 'degraded';
  if (aggregate === 'materially-degraded' || aggregate === 'incompatible') dimensions[0].result = 'fail';
  if (aggregate === 'insufficient-evidence') dimensions[2].result = 'indeterminate';

  return {
    schema: 'axiom-replacement-fidelity-evaluation.v0',
    version: 0,
    status: 'inert-evidence',
    evaluation_id: 'fidelity.owner.recovery.v1',
    topology_id: topology.topology_id,
    topology_digest: cognitiveTopologyDigest(topology),
    reference: {
      node_id: 'node.owner.kernel',
      model_id: 'model.owner.kernel',
      artifact_digest: A
    },
    candidate: {
      model_id: 'model.owner.recovery',
      artifact_digest: B,
      lineage_id: 'lineage.owner.recovery.v1'
    },
    evaluator: {
      evaluator_kind: 'benchmark-runner',
      evaluator_ref: 'evaluator.recovery.v1',
      evaluator_principal_ref: 'principal.evaluator.recovery.v1'
    },
    suite: {
      suite_ref: 'suite.recovery.v1',
      suite_digest: C,
      metric_set_ref: 'metrics.recovery.v1',
      metric_set_digest: D
    },
    dimensions,
    required_dimensions: [
      'capability-fidelity',
      'preference-fidelity',
      'behavioral-fidelity'
    ],
    aggregate_fidelity: aggregate,
    confidence: aggregate === 'insufficient-evidence' ? 0.4 : 0.9,
    evaluated_at: '2026-08-30T10:09:00.000Z',
    recorded_at: '2026-08-30T10:10:00.000Z',
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function completeInputs(topology) {
  return {
    assessed_at: '2026-08-30T10:30:00.000Z',
    availability_attestations: [
      availability(topology, 'node.owner.kernel'),
      availability(topology, 'node.provider.primary')
    ],
    acquisition_manifests: [acquisition(topology)],
    persistence_attestations: [
      persistence(topology, 'node.owner.kernel'),
      persistence(topology, 'node.provider.primary')
    ],
    lineage_manifests: [],
    fidelity_evaluations: []
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

function ownerNode(report) {
  return report.nodes.find(item => item.node_id === 'node.owner.kernel');
}

function failedOwnerInputs(topology, aggregate = null) {
  const inputs = completeInputs(topology);
  inputs.availability_attestations[0] = availability(topology, 'node.owner.kernel', 'unavailable');
  inputs.lineage_manifests = [lineage(topology)];
  if (aggregate !== null) inputs.fidelity_evaluations = [fidelity(topology, aggregate)];
  return inputs;
}

test('fresh complete dependencies report available cognition with no substitution needed', () => {
  const topology = topologyFixture();
  const report = buildCognitiveRecoveryAssessment(topology, completeInputs(topology));

  assert.equal(COGNITIVE_RECOVERY_ASSESSMENT_SCHEMA, 'axiom-cognitive-recovery-assessment.v0');
  assert.equal(report.schema, COGNITIVE_RECOVERY_ASSESSMENT_SCHEMA);
  assert.equal(report.status, 'inert-evidence-report');
  assert.equal(report.cognitive_availability_status, 'available');
  assert.equal(report.cognitive_continuity_status, 'full');
  assert.equal(report.cognitive_fidelity_status, 'full');
  assert.equal(report.cognitive_sovereignty_status, 'mixed');
  assert.equal(report.recovery_readiness_status, 'ready-no-substitution');
  assert.deepEqual(report.blockers, []);
  assert.deepEqual(report.conflicts, []);
  assert.match(report.report_digest, /^[a-f0-9]{64}$/);
});

test('assessed_at is explicit and report construction is independent of wall clock', () => {
  const topology = topologyFixture();
  const inputs = completeInputs(topology);
  const before = buildCognitiveRecoveryAssessment(topology, inputs);
  const realNow = Date.now;
  Date.now = () => Date.parse('2099-01-01T00:00:00.000Z');
  try {
    const after = buildCognitiveRecoveryAssessment(topology, inputs);
    assert.equal(after.assessed_at, inputs.assessed_at);
    assert.equal(after.report_digest, before.report_digest);
  } finally {
    Date.now = realNow;
  }
});

test('evidence recorded after assessed_at fails closed', () => {
  const topology = topologyFixture();
  const cases = [
    inputs => { inputs.availability_attestations[0].recorded_at = '2026-08-30T10:31:00.000Z'; },
    inputs => { inputs.acquisition_manifests[0].recorded_at = '2026-08-30T10:31:00.000Z'; },
    inputs => { inputs.persistence_attestations[0].recorded_at = '2026-08-30T10:31:00.000Z'; }
  ];
  for (const mutate of cases) {
    const inputs = completeInputs(topology);
    mutate(inputs);
    assert.throws(() => buildCognitiveRecoveryAssessment(topology, inputs));
  }

  const recovery = failedOwnerInputs(topology, 'high-fidelity');
  recovery.lineage_manifests[0].recorded_at = '2026-08-30T10:31:00.000Z';
  assert.throws(() => buildCognitiveRecoveryAssessment(topology, recovery));

  const recovery2 = failedOwnerInputs(topology, 'high-fidelity');
  recovery2.fidelity_evaluations[0].recorded_at = '2026-08-30T10:31:00.000Z';
  assert.throws(() => buildCognitiveRecoveryAssessment(topology, recovery2));
});

test('availability evidence past valid_until is stale rather than silently current', () => {
  const topology = topologyFixture();
  const inputs = completeInputs(topology);
  inputs.assessed_at = '2026-08-30T12:00:00.000Z';
  const report = buildCognitiveRecoveryAssessment(topology, inputs);
  assert.equal(report.cognitive_availability_status, 'indeterminate');
  assert.equal(ownerNode(report).model_availability, 'stale');
  assert.ok(report.warnings.some(item => item.code === 'availability-stale'));
});

test('multiple fresh agreeing observations are retained rather than collapsed into hidden latest-wins state', () => {
  const topology = topologyFixture();
  const inputs = completeInputs(topology);
  inputs.availability_attestations.push(
    availability(topology, 'node.owner.kernel', 'available', '2', {
      observed_at: '2026-08-30T10:10:00.000Z',
      recorded_at: '2026-08-30T10:11:00.000Z',
      valid_until: '2026-08-30T11:10:00.000Z'
    })
  );
  const report = buildCognitiveRecoveryAssessment(topology, inputs);
  assert.equal(ownerNode(report).model_availability, 'available');
  assert.deepEqual(ownerNode(report).availability_attestation_ids, [
    'availability.node.owner.kernel.1',
    'availability.node.owner.kernel.2'
  ]);
  assert.deepEqual(report.conflicts, []);
});

test('contradictory fresh available and unavailable evidence produces an explicit conflict with no latest-wins rule', () => {
  const topology = topologyFixture();
  const inputs = completeInputs(topology);
  inputs.availability_attestations.push(
    availability(topology, 'node.owner.kernel', 'unavailable', '2', {
      observed_at: '2026-08-30T10:10:00.000Z',
      recorded_at: '2026-08-30T10:11:00.000Z',
      valid_until: '2026-08-30T11:10:00.000Z'
    })
  );
  const report = buildCognitiveRecoveryAssessment(topology, inputs);
  assert.equal(ownerNode(report).model_availability, 'conflict');
  assert.equal(report.cognitive_availability_status, 'indeterminate');
  assert.deepEqual(report.conflicts, [{
    node_id: 'node.owner.kernel',
    conflict_type: 'availability-conflict',
    attestation_ids: [
      'availability.node.owner.kernel.1',
      'availability.node.owner.kernel.2'
    ],
    observed_values: ['available', 'unavailable']
  }]);
});

test('critical unavailable dependency without candidate evidence has no supported recovery path', () => {
  const topology = topologyFixture();
  const inputs = completeInputs(topology);
  inputs.availability_attestations[0] = availability(topology, 'node.owner.kernel', 'unavailable');
  const report = buildCognitiveRecoveryAssessment(topology, inputs);
  assert.equal(report.cognitive_availability_status, 'blocked');
  assert.equal(report.cognitive_continuity_status, 'blocked');
  assert.equal(report.cognitive_fidelity_status, 'blocked');
  assert.equal(report.recovery_readiness_status, 'no-supported-recovery-path');
  assert.ok(report.blockers.some(item => item.code === 'critical-model-unavailable'));
});

test('valid lineage plus high-fidelity candidate evidence yields readiness evidence but never substitution', () => {
  const topology = topologyFixture();
  const report = buildCognitiveRecoveryAssessment(
    topology,
    failedOwnerInputs(topology, 'high-fidelity')
  );
  assert.equal(report.recovery_readiness_status, 'ready-with-candidate-evidence');
  assert.equal(report.candidates.length, 1);
  assert.equal(report.candidates[0].lineage_id, 'lineage.owner.recovery.v1');
  assert.equal(report.candidates[0].fidelity_evaluation_id, 'fidelity.owner.recovery.v1');
  assert.equal(report.candidates[0].aggregate_fidelity, 'high-fidelity');
  assert.equal(report.candidates[0].candidate_active, false);
  assert.equal(report.authority_boundary.switches_models, false);
  assert.equal(report.authority_boundary.mutates_topology, false);
});

test('candidate evidence with required degradation is recoverable only with degradation', () => {
  const topology = topologyFixture();
  const report = buildCognitiveRecoveryAssessment(
    topology,
    failedOwnerInputs(topology, 'acceptable-with-degradation')
  );
  assert.equal(report.recovery_readiness_status, 'recoverable-with-degradation');
  assert.ok(report.warnings.some(item => item.code === 'candidate-fidelity-degraded'));
});

test('missing or explicitly insufficient required fidelity evidence remains insufficient evidence', () => {
  const topology = topologyFixture();
  const missing = buildCognitiveRecoveryAssessment(topology, failedOwnerInputs(topology));
  assert.equal(missing.recovery_readiness_status, 'insufficient-evidence');

  const explicit = buildCognitiveRecoveryAssessment(
    topology,
    failedOwnerInputs(topology, 'insufficient-evidence')
  );
  assert.equal(explicit.recovery_readiness_status, 'insufficient-evidence');
});

test('owner and provider dependency sovereignty remain distinct and aggregate as mixed', () => {
  const topology = topologyFixture();
  const report = buildCognitiveRecoveryAssessment(topology, completeInputs(topology));
  assert.equal(ownerNode(report).sovereignty_state, 'owner-controlled');
  assert.equal(
    report.nodes.find(item => item.node_id === 'node.provider.primary').sovereignty_state,
    'provider-dependent'
  );
  assert.equal(report.cognitive_sovereignty_status, 'mixed');

  const withoutAcquisition = completeInputs(topology);
  withoutAcquisition.acquisition_manifests = [];
  const unverified = buildCognitiveRecoveryAssessment(topology, withoutAcquisition);
  assert.equal(ownerNode(unverified).sovereignty_state, 'unverified');
  assert.equal(unverified.cognitive_sovereignty_status, 'unverified');
});

test('persistence availability is evaluated independently from model availability', () => {
  const topology = topologyFixture();
  const inputs = completeInputs(topology);
  inputs.persistence_attestations[0] = persistence(topology, 'node.owner.kernel', 'unavailable');
  const report = buildCognitiveRecoveryAssessment(topology, inputs);
  assert.equal(ownerNode(report).model_availability, 'available');
  assert.equal(ownerNode(report).persistence_availability, 'unavailable');
  assert.equal(report.cognitive_continuity_status, 'blocked');
  assert.equal(report.cognitive_fidelity_status, 'blocked');
  assert.ok(report.blockers.some(item => item.code === 'critical-persistence-unavailable'));
});

test('duplicate evidence identities fail closed instead of inflating support', () => {
  const topology = topologyFixture();
  const cases = [
    inputs => { inputs.availability_attestations.push(clone(inputs.availability_attestations[0])); },
    inputs => { inputs.acquisition_manifests.push(clone(inputs.acquisition_manifests[0])); },
    inputs => { inputs.persistence_attestations.push(clone(inputs.persistence_attestations[0])); }
  ];
  for (const mutate of cases) {
    const inputs = completeInputs(topology);
    mutate(inputs);
    assert.throws(() => buildCognitiveRecoveryAssessment(topology, inputs));
  }

  const recovery = failedOwnerInputs(topology, 'high-fidelity');
  recovery.lineage_manifests.push(clone(recovery.lineage_manifests[0]));
  assert.throws(() => buildCognitiveRecoveryAssessment(topology, recovery));

  const recovery2 = failedOwnerInputs(topology, 'high-fidelity');
  recovery2.fidelity_evaluations.push(clone(recovery2.fidelity_evaluations[0]));
  assert.throws(() => buildCognitiveRecoveryAssessment(topology, recovery2));
});

test('report and retained evidence ordering are deterministic across input ordering', () => {
  const topology = topologyFixture();
  const inputs = completeInputs(topology);
  inputs.availability_attestations.push(availability(topology, 'node.owner.kernel', 'available', '2'));
  const first = buildCognitiveRecoveryAssessment(topology, inputs);
  const reordered = clone(inputs);
  for (const key of [
    'availability_attestations',
    'acquisition_manifests',
    'persistence_attestations',
    'lineage_manifests',
    'fidelity_evaluations'
  ]) reordered[key].reverse();
  const second = buildCognitiveRecoveryAssessment(topology, reordered);
  assert.equal(second.report_digest, first.report_digest);
  assert.deepEqual(second.nodes.map(item => item.node_id), [
    'node.owner.kernel',
    'node.provider.primary'
  ]);
  assert.deepEqual(second.nodes, first.nodes);
});

test('builder does not mutate deeply frozen topology or evidence and returns recursively frozen output', () => {
  const topology = deepFreeze(topologyFixture());
  const inputs = deepFreeze(completeInputs(topology));
  const before = JSON.stringify({ topology, inputs });
  const report = buildCognitiveRecoveryAssessment(topology, inputs);
  assert.equal(JSON.stringify({ topology, inputs }), before);
  assert.equal(Object.isFrozen(report), true);
  assert.equal(Object.isFrozen(report.nodes), true);
  assert.equal(Object.isFrozen(report.nodes[0]), true);
  assert.equal(Object.isFrozen(report.authority_boundary), true);
});

test('authority boundary is exact and denies every effect or identity-proof escalation', () => {
  const topology = topologyFixture();
  const report = buildCognitiveRecoveryAssessment(topology, completeInputs(topology));
  assert.deepEqual(report.authority_boundary, {
    writes_files: false,
    performs_network_effects: false,
    loads_models: false,
    switches_models: false,
    synchronizes_persistence: false,
    acquires_weights: false,
    trains_models: false,
    grants_execution_authority: false,
    mutates_topology: false,
    proves_principal_continuity: false,
    proves_subjective_identity: false
  });
});

test('input surface rejects session state, provider-call controls, executor controls, and unknown fields', () => {
  const topology = topologyFixture();
  for (const [field, value] of [
    ['session', { id: 'session.secret' }],
    ['provider_call', { enabled: true }],
    ['executor', { enabled: true }],
    ['credential', 'secret'],
    ['switch_model', true]
  ]) {
    const inputs = completeInputs(topology);
    inputs[field] = value;
    assert.throws(() => buildCognitiveRecoveryAssessment(topology, inputs));
  }
});

test('recovery assessment source is pure and imports only canonical cognitive evidence primitives', async () => {
  const source = await readFile(new URL('../src/lib/cognitive-recovery-assessment.mjs', import.meta.url), 'utf8');
  const imports = [...source.matchAll(/from\s+['"](.+?)['"]/g)].map(match => match[1]).sort();
  assert.deepEqual(imports, [
    './canonical.mjs',
    './cognitive-availability-attestation.mjs',
    './cognitive-lineage-manifest.mjs',
    './cognitive-topology.mjs',
    './model-acquisition-manifest.mjs',
    './persistence-attestation.mjs',
    './replacement-fidelity-evaluation.mjs'
  ]);
  for (const forbidden of [
    'node:fs', 'node:http', 'node:https', 'node:net', 'node:tls', 'node:child_process',
    'gateway', 'hypervisor', 'sandbox', 'grid', 'provider-client', 'credential-broker'
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});
