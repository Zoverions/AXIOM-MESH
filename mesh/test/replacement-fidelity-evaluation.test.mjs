import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { cognitiveTopologyDigest } from '../src/lib/cognitive-topology.mjs';
import { cognitiveLineageManifestDigest } from '../src/lib/cognitive-lineage-manifest.mjs';
import {
  REPLACEMENT_FIDELITY_EVALUATION_SCHEMA,
  replacementFidelityEvaluationDigest,
  resolveReplacementFidelityEvaluation,
  validateReplacementFidelityEvaluation
} from '../src/lib/replacement-fidelity-evaluation.mjs';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);
const D = 'd'.repeat(64);
const E = 'e'.repeat(64);

function topologyFixture() {
  return {
    schema: 'axiom-cognitive-topology.v0',
    version: 0,
    status: 'inert-contract-laboratory',
    topology_id: 'topology.fidelity.v1',
    composition_id: 'composition.fidelity.v1',
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

function lineage(topology = topologyFixture(), overrides = {}) {
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
      verification_digest: E
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

function dimension(name, result = 'pass') {
  return {
    dimension: name,
    result,
    observed_metric_ref: `metric.${name}.v1`,
    observed_metric_digest: C,
    threshold_ref: `threshold.${name}.v1`,
    threshold_digest: D,
    evidence_ref: `evidence.${name}.v1`,
    evidence_digest: E
  };
}

function evaluation(topology = topologyFixture(), overrides = {}) {
  return {
    schema: 'axiom-replacement-fidelity-evaluation.v0',
    version: 0,
    status: 'inert-evidence',
    evaluation_id: 'fidelity.base.to.candidate.v1',
    topology_id: topology.topology_id,
    topology_digest: cognitiveTopologyDigest(topology),
    reference: {
      node_id: 'node.owner.base',
      model_id: 'model.owner.base',
      artifact_digest: A
    },
    candidate: {
      model_id: 'model.owner.candidate',
      artifact_digest: B,
      lineage_id: 'lineage.base.to.candidate.v1'
    },
    evaluator: {
      evaluator_kind: 'benchmark-runner',
      evaluator_ref: 'evaluator.local.v1',
      evaluator_principal_ref: 'principal.evaluator.v1'
    },
    suite: {
      suite_ref: 'suite.replacement.v1',
      suite_digest: C,
      metric_set_ref: 'metrics.replacement.v1',
      metric_set_digest: D
    },
    dimensions: [
      dimension('capability-fidelity'),
      dimension('preference-fidelity'),
      dimension('behavioral-fidelity')
    ],
    required_dimensions: [
      'capability-fidelity',
      'preference-fidelity',
      'behavioral-fidelity'
    ],
    aggregate_fidelity: 'high-fidelity',
    confidence: 0.92,
    evaluated_at: '2026-08-30T10:03:00.000Z',
    recorded_at: '2026-08-30T10:04:00.000Z',
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

test('high-fidelity replacement evidence is deterministic and never identity or adoption evidence', () => {
  const topology = topologyFixture();
  const lineageManifest = lineage(topology);
  const item = evaluation(topology);

  assert.equal(REPLACEMENT_FIDELITY_EVALUATION_SCHEMA, 'axiom-replacement-fidelity-evaluation.v0');
  assert.equal(validateReplacementFidelityEvaluation(item).valid, true);
  assert.match(replacementFidelityEvaluationDigest(item), /^[a-f0-9]{64}$/);
  assert.equal(
    replacementFidelityEvaluationDigest(item),
    replacementFidelityEvaluationDigest(Object.fromEntries(Object.entries(item).reverse()))
  );

  const resolved = resolveReplacementFidelityEvaluation(item, topology, lineageManifest);
  assert.equal(resolved.aggregate_fidelity, 'high-fidelity');
  assert.equal(resolved.confidence, 0.92);
  assert.equal(resolved.lineage_verified, true);
  assert.equal(resolved.candidate_active, false);
  assert.equal(resolved.grants_execution_authority, false);
  assert.equal(resolved.proves_principal_continuity, false);
  assert.equal(resolved.proves_subjective_identity, false);
  assert.equal(Object.hasOwn(resolved, 'identity_percentage'), false);
  assert.equal(Object.isFrozen(resolved), true);
});

test('all approved fidelity dimensions and per-dimension results validate', () => {
  const topology = topologyFixture();
  const names = [
    'capability-fidelity', 'preference-fidelity', 'behavioral-fidelity',
    'epistemic-fidelity', 'safety-policy-fidelity', 'style-personality-fidelity',
    'memory-use-fidelity', 'relationship-fidelity', 'robustness-fidelity'
  ];
  const item = evaluation(topology);
  item.dimensions = names.map((name, index) => dimension(name, ['pass', 'degraded', 'fail', 'indeterminate'][index % 4]));
  item.required_dimensions = ['capability-fidelity'];
  item.aggregate_fidelity = 'high-fidelity';
  assert.equal(validateReplacementFidelityEvaluation(item).valid, true);
});

test('required dimensions are unique, present, and aggregate semantics fail closed', () => {
  const topology = topologyFixture();

  const duplicateDimension = evaluation(topology);
  duplicateDimension.dimensions.push(dimension('capability-fidelity'));
  assert.throws(() => validateReplacementFidelityEvaluation(duplicateDimension));

  const duplicateRequired = evaluation(topology);
  duplicateRequired.required_dimensions.push('capability-fidelity');
  assert.throws(() => validateReplacementFidelityEvaluation(duplicateRequired));

  const missingRequired = evaluation(topology);
  missingRequired.required_dimensions.push('epistemic-fidelity');
  assert.throws(() => validateReplacementFidelityEvaluation(missingRequired));

  const degraded = evaluation(topology);
  degraded.dimensions[1].result = 'degraded';
  degraded.aggregate_fidelity = 'acceptable-with-degradation';
  assert.equal(validateReplacementFidelityEvaluation(degraded).valid, true);

  const wrongDegradedAggregate = clone(degraded);
  wrongDegradedAggregate.aggregate_fidelity = 'high-fidelity';
  assert.throws(() => validateReplacementFidelityEvaluation(wrongDegradedAggregate));

  const failed = evaluation(topology);
  failed.dimensions[0].result = 'fail';
  failed.aggregate_fidelity = 'materially-degraded';
  assert.equal(validateReplacementFidelityEvaluation(failed).valid, true);

  const incompatible = clone(failed);
  incompatible.aggregate_fidelity = 'incompatible';
  assert.equal(validateReplacementFidelityEvaluation(incompatible).valid, true);

  const incompatibleWithoutFailure = evaluation(topology);
  incompatibleWithoutFailure.aggregate_fidelity = 'incompatible';
  assert.throws(() => validateReplacementFidelityEvaluation(incompatibleWithoutFailure));

  const insufficient = evaluation(topology);
  insufficient.dimensions[2].result = 'indeterminate';
  insufficient.aggregate_fidelity = 'insufficient-evidence';
  assert.equal(validateReplacementFidelityEvaluation(insufficient).valid, true);
});

test('suite, metric, threshold, and evidence digests are exact and confidence is bounded', () => {
  const topology = topologyFixture();
  for (const mutate of [
    item => { item.suite.suite_digest = 'bad'; },
    item => { item.suite.metric_set_digest = 'bad'; },
    item => { item.dimensions[0].observed_metric_digest = 'bad'; },
    item => { item.dimensions[0].threshold_digest = 'bad'; },
    item => { item.dimensions[0].evidence_digest = 'bad'; },
    item => { item.confidence = -0.01; },
    item => { item.confidence = 1.01; },
    item => { item.confidence = Number.NaN; }
  ]) {
    const item = evaluation(topology);
    mutate(item);
    assert.throws(() => validateReplacementFidelityEvaluation(item));
  }
});

test('reference binds current topology exactly while candidate remains descriptive', () => {
  const topology = topologyFixture();
  const item = evaluation(topology);
  const resolved = resolveReplacementFidelityEvaluation(item, topology, lineage(topology));
  assert.equal(resolved.reference.node_id, 'node.owner.base');
  assert.equal(resolved.reference.model_id, 'model.owner.base');
  assert.equal(resolved.reference.artifact_digest, A);
  assert.equal(resolved.candidate.model_id, 'model.owner.candidate');
  assert.equal(resolved.candidate.artifact_digest, B);
  assert.equal(resolved.candidate_active, false);

  for (const mutate of [
    value => { value.topology_id = 'topology.other'; },
    value => { value.topology_digest = B; },
    value => { value.reference.node_id = 'node.unknown'; },
    value => { value.reference.model_id = 'model.other'; },
    value => { value.reference.artifact_digest = B; }
  ]) {
    const bad = evaluation(topology);
    mutate(bad);
    assert.throws(() => resolveReplacementFidelityEvaluation(bad, topology, lineage(topology)));
  }
});

test('supplied lineage must bind the same topology, reference, candidate, and lineage id', () => {
  const topology = topologyFixture();
  const item = evaluation(topology);
  const validLineage = lineage(topology);
  assert.equal(resolveReplacementFidelityEvaluation(item, topology, validLineage).lineage_verified, true);

  const cases = [
    manifest => { manifest.lineage_id = 'lineage.other'; },
    manifest => { manifest.reference.model_id = 'model.other'; },
    manifest => { manifest.candidate.model_id = 'model.other'; },
    manifest => { manifest.candidate.artifact_digest = C; }
  ];
  for (const mutate of cases) {
    const badLineage = lineage(topology);
    mutate(badLineage);
    assert.throws(() => resolveReplacementFidelityEvaluation(item, topology, badLineage));
  }

  const withoutLineage = resolveReplacementFidelityEvaluation(item, topology, null);
  assert.equal(withoutLineage.lineage_verified, false);
  assert.equal(withoutLineage.candidate_active, false);
});

test('evaluator provenance remains visible but cannot become authority', () => {
  const topology = topologyFixture();
  const resolved = resolveReplacementFidelityEvaluation(evaluation(topology), topology, lineage(topology));
  assert.deepEqual(resolved.evaluator, {
    evaluator_kind: 'benchmark-runner',
    evaluator_ref: 'evaluator.local.v1',
    evaluator_principal_ref: 'principal.evaluator.v1'
  });
  assert.equal(resolved.authority_effect, 'none');
  assert.equal(resolved.network_effect, 'none');
  assert.equal(resolved.runtime_activation, false);
});

test('chronology, identifiers, unknown fields, secret-bearing fields, and effect widening fail closed', () => {
  const topology = topologyFixture();
  for (const mutate of [
    item => { item.recorded_at = '2026-08-30T10:02:00.000Z'; },
    item => { item.evaluated_at = 'not-a-time'; },
    item => { item.evaluation_id = ''; },
    item => { item.dimensions[0].result = 'identity-preserved'; },
    item => { item.required_dimensions[0] = 'identity-fidelity'; },
    item => { item.contains_secret_material = true; },
    item => { item.authority_effect = 'grant'; },
    item => { item.network_effect = 'invoke'; },
    item => { item.runtime_activation = true; },
    item => { item.identity_percentage = 92; },
    item => { item.token = 'secret'; },
    item => { item.evaluator.session_credential = 'secret'; }
  ]) {
    const item = evaluation(topology);
    mutate(item);
    assert.throws(() => validateReplacementFidelityEvaluation(item));
  }
});

test('validator and resolver preserve deeply frozen inputs', () => {
  const topology = deepFreeze(topologyFixture());
  const lineageManifest = deepFreeze(lineage(topology));
  const item = deepFreeze(evaluation(topology));
  const before = JSON.stringify({ topology, lineageManifest, item });
  validateReplacementFidelityEvaluation(item);
  resolveReplacementFidelityEvaluation(item, topology, lineageManifest);
  assert.equal(JSON.stringify({ topology, lineageManifest, item }), before);
});

test('production fidelity module remains pure and imports only canonical cognitive evidence primitives', async () => {
  const source = await readFile(new URL('../src/lib/replacement-fidelity-evaluation.mjs', import.meta.url), 'utf8');
  const imports = [...source.matchAll(/from\s+['"](.+?)['"]/g)].map(match => match[1]).sort();
  assert.deepEqual(imports, [
    './canonical.mjs',
    './cognitive-lineage-manifest.mjs',
    './cognitive-topology.mjs'
  ]);
  for (const forbidden of [
    'node:fs', 'node:http', 'node:https', 'node:net', 'node:tls', 'node:child_process',
    'gateway', 'hypervisor', 'sandbox', 'grid', 'credential', 'provider-client'
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});
