import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { cognitiveTopologyDigest } from '../src/lib/cognitive-topology.mjs';
import {
  REPLACEMENT_FIDELITY_EVALUATION_SCHEMA,
  SUPPORTED_FIDELITY_DIMENSIONS,
  replacementFidelitySuiteDigest,
  deriveReplacementFidelityClass,
  validateReplacementFidelityEvaluation,
  replacementFidelityEvaluationDigest,
  resolveReplacementFidelityEvaluation
} from '../src/lib/replacement-fidelity-evaluation.mjs';
import {
  cognitiveLineageManifestDigest
} from '../src/lib/cognitive-lineage-manifest.mjs';

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
    topology_id: 'topology.fidelity.v1',
    composition_id: 'composition.fidelity.v1',
    composition_digest: DIGEST_C,
    nodes: [
      {
        node_id: 'node.reference', model_id: 'model.reference', engagement: 'primary',
        topology_role: 'primary-embodiment', access_mode: 'api', custody: 'provider-controlled',
        weights: { state: 'closed', artifact_digest: null, licence_ref: null },
        persistence: { mode: 'provider-bound', provider_id: 'provider.reference.v1', state_ref: 'state.reference.v1', exportability: 'partial' },
        continuity_importance: 'critical', fidelity_importance: 'critical',
        adaptation_authorization_ref: null, lineage_ref: null, transition_policy_ref: null
      },
      {
        node_id: 'node.candidate', model_id: 'model.candidate', engagement: 'persistent',
        topology_role: 'augmentation', access_mode: 'local-runtime', custody: 'owner-local',
        weights: { state: 'open-acquired', artifact_digest: DIGEST_A, licence_ref: 'licence.candidate.v1' },
        persistence: { mode: 'local', provider_id: null, state_ref: 'state.candidate.v1', exportability: 'full' },
        continuity_importance: 'important', fidelity_importance: 'important',
        adaptation_authorization_ref: null, lineage_ref: null, transition_policy_ref: null
      },
      {
        node_id: 'node.alternate', model_id: 'model.alternate', engagement: 'persistent',
        topology_role: 'augmentation', access_mode: 'local-runtime', custody: 'owner-remote',
        weights: { state: 'local-proprietary', artifact_digest: DIGEST_B, licence_ref: 'licence.alternate.v1' },
        persistence: { mode: 'local', provider_id: null, state_ref: 'state.alternate.v1', exportability: 'partial' },
        continuity_importance: 'optional', fidelity_importance: 'important',
        adaptation_authorization_ref: null, lineage_ref: null, transition_policy_ref: null
      }
    ],
    created_at: '2026-08-29T21:00:00.000Z',
    updated_at: '2026-08-29T21:00:00.000Z',
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function suiteFixture(overrides = {}) {
  const descriptor = {
    suite_id: 'suite.personal.recovery.v1',
    required_dimensions: [
      'capability-fidelity',
      'preference-fidelity',
      'safety-policy-fidelity'
    ],
    aggregation_rules: {
      degraded_result: 'acceptable-with-degradation',
      fail_result: 'incompatible'
    },
    ...overrides
  };
  return {
    ...descriptor,
    suite_digest: replacementFidelitySuiteDigest(descriptor)
  };
}

function dimension(dimension_id, score = 0.95, status = 'pass', overrides = {}) {
  return {
    dimension_id,
    metric_ref: `metric.${dimension_id}.v1`,
    metric_digest: DIGEST_D,
    measured_score: score,
    thresholds: { degraded_min: 0.7, pass_min: 0.9 },
    sample_count: 100,
    confidence: 'high',
    evidence_ref: `evidence.${dimension_id}.v1`,
    evidence_digest: DIGEST_E,
    status,
    ...overrides
  };
}

function lineageFixture(topology = topologyFixture(), destination = 'node.candidate') {
  const candidate = topology.nodes.find(node => node.node_id === destination);
  const document = {
    schema: 'axiom-cognitive-lineage-manifest.v0', version: 0, status: 'inert-evidence',
    lineage_id: `lineage.reference.to.${destination}.v1`,
    topology_id: topology.topology_id,
    topology_digest: cognitiveTopologyDigest(topology),
    source: { node_id: 'node.reference', model_id: 'model.reference', artifact_digest: null },
    destination: { node_id: candidate.node_id, model_id: candidate.model_id, artifact_digest: candidate.weights.artifact_digest },
    relationship: 'replacement',
    evidence: { evidence_ref: `evidence.lineage.${destination}.v1`, evidence_digest: DIGEST_F },
    recorded_at: '2026-08-29T21:05:00.000Z',
    contains_secret_material: false, authority_effect: 'none', network_effect: 'none', runtime_activation: false
  };
  return document;
}

function evaluationFixture(topology = topologyFixture(), options = {}) {
  const suite = options.suite ?? suiteFixture();
  const lineage = options.lineage === false ? null : (options.lineage ?? lineageFixture(topology));
  const dimensions = options.dimensions ?? [
    dimension('capability-fidelity'),
    dimension('preference-fidelity'),
    dimension('safety-policy-fidelity')
  ];
  return {
    schema: 'axiom-replacement-fidelity-evaluation.v0',
    version: 0,
    status: 'inert-evidence',
    evaluation_id: 'evaluation.reference.to.candidate.v1',
    topology_id: topology.topology_id,
    topology_digest: cognitiveTopologyDigest(topology),
    reference: { node_id: 'node.reference', model_id: 'model.reference', artifact_digest: null },
    candidate: { node_id: 'node.candidate', model_id: 'model.candidate', artifact_digest: DIGEST_A },
    lineage: lineage ? { lineage_id: lineage.lineage_id, lineage_digest: cognitiveLineageManifestDigest(lineage) } : null,
    suite,
    dimensions,
    aggregate_class: options.aggregate_class ?? deriveReplacementFidelityClass(suite, dimensions),
    evaluator_ref: 'evaluator.recovery.v1',
    evaluated_at: '2026-08-29T21:10:00.000Z',
    recorded_at: '2026-08-29T21:11:00.000Z',
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
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

function expectReject(mutator, pattern) {
  const document = evaluationFixture();
  mutator(document);
  assert.throws(() => validateReplacementFidelityEvaluation(document), pattern);
}

test('supported fidelity dimensions are exact and contain no identity sameness dimension', () => {
  assert.deepEqual(SUPPORTED_FIDELITY_DIMENSIONS, [
    'capability-fidelity',
    'preference-fidelity',
    'behavioral-fidelity',
    'epistemic-fidelity',
    'safety-policy-fidelity',
    'style-personality-fidelity',
    'memory-use-fidelity',
    'relationship-fidelity',
    'robustness-fidelity'
  ]);
});

test('valid topology-bound evaluation validates, resolves, and digests deterministically', () => {
  const topology = topologyFixture();
  const lineage = lineageFixture(topology);
  const document = evaluationFixture(topology, { lineage });
  const validated = validateReplacementFidelityEvaluation(document);
  const resolved = resolveReplacementFidelityEvaluation(document, topology, [lineage]);

  assert.equal(REPLACEMENT_FIDELITY_EVALUATION_SCHEMA, 'axiom-replacement-fidelity-evaluation.v0');
  assert.equal(validated.valid, true);
  assert.equal(resolved.valid, true);
  assert.equal(resolved.aggregate_class, 'high-fidelity');
  assert.equal(resolved.reference.node_id, 'node.reference');
  assert.equal(resolved.candidate.node_id, 'node.candidate');
  assert.equal(resolved.lineage.lineage_id, lineage.lineage_id);
  assert.match(resolved.evaluation_digest, /^[a-f0-9]{64}$/);
  assert.equal(replacementFidelityEvaluationDigest(document), resolved.evaluation_digest);
  assert.equal(resolved.proves_principal_continuity, false);
  assert.equal(resolved.proves_subjective_identity, false);
  assert.equal(resolved.authority_effect, 'none');
});

test('suite digest binds suite id, sorted required dimensions, and aggregation rules', () => {
  const suite = suiteFixture();
  assert.match(suite.suite_digest, /^[a-f0-9]{64}$/);
  const changedId = clone(suite); changedId.suite_id = 'suite.changed.v1';
  assert.notEqual(replacementFidelitySuiteDigest(changedId), suite.suite_digest);
  const changedDimensions = clone(suite); changedDimensions.required_dimensions = ['capability-fidelity'];
  assert.notEqual(replacementFidelitySuiteDigest(changedDimensions), suite.suite_digest);
  const changedRules = clone(suite); changedRules.aggregation_rules.fail_result = 'materially-degraded';
  assert.notEqual(replacementFidelitySuiteDigest(changedRules), suite.suite_digest);
});

test('required dimensions must be sorted, unique, supported, and present', () => {
  expectReject(document => { document.suite.required_dimensions = ['preference-fidelity', 'capability-fidelity']; }, /required_dimensions.*sorted/i);
  expectReject(document => { document.suite.required_dimensions = ['capability-fidelity', 'capability-fidelity']; }, /required_dimensions.*unique/i);
  expectReject(document => { document.suite.required_dimensions = ['identity-sameness']; }, /required_dimensions.*supported/i);
  expectReject(document => { document.dimensions = document.dimensions.filter(item => item.dimension_id !== 'preference-fidelity'); }, /required dimension.*preference-fidelity/i);
});

test('dimension IDs are unique and supported', () => {
  expectReject(document => { document.dimensions.push(clone(document.dimensions[0])); }, /duplicate.*dimension/i);
  expectReject(document => { document.dimensions[0].dimension_id = 'identity-sameness'; }, /dimension_id.*supported/i);
});

test('score thresholds and declared dimension status must agree exactly', () => {
  expectReject(document => { document.dimensions[0].thresholds = { degraded_min: 0.95, pass_min: 0.9 }; }, /threshold/i);
  expectReject(document => { document.dimensions[0].measured_score = 1.01; }, /measured_score/i);
  expectReject(document => { document.dimensions[0].status = 'degraded'; }, /status.*score/i);
  expectReject(document => { document.dimensions[0].measured_score = null; }, /measured_score.*indeterminate/i);
  const indeterminate = evaluationFixture();
  indeterminate.dimensions[0] = dimension('capability-fidelity', null, 'indeterminate', { confidence: 'unknown', sample_count: 0 });
  indeterminate.aggregate_class = deriveReplacementFidelityClass(indeterminate.suite, indeterminate.dimensions);
  assert.doesNotThrow(() => validateReplacementFidelityEvaluation(indeterminate));
});

test('aggregate derivation is weakest required-dimension constraint', () => {
  const suite = suiteFixture();
  const allPass = [dimension('capability-fidelity'), dimension('preference-fidelity'), dimension('safety-policy-fidelity')];
  assert.equal(deriveReplacementFidelityClass(suite, allPass), 'high-fidelity');

  const degraded = clone(allPass);
  degraded[1] = dimension('preference-fidelity', 0.8, 'degraded');
  assert.equal(deriveReplacementFidelityClass(suite, degraded), 'acceptable-with-degradation');

  const indeterminate = clone(allPass);
  indeterminate[1] = dimension('preference-fidelity', null, 'indeterminate', { confidence: 'unknown', sample_count: 0 });
  assert.equal(deriveReplacementFidelityClass(suite, indeterminate), 'insufficient-evidence');

  const failed = clone(allPass);
  failed[1] = dimension('preference-fidelity', 0.5, 'fail');
  assert.equal(deriveReplacementFidelityClass(suite, failed), 'incompatible');

  const materialSuite = suiteFixture({ aggregation_rules: { degraded_result: 'materially-degraded', fail_result: 'materially-degraded' } });
  assert.equal(deriveReplacementFidelityClass(materialSuite, degraded), 'materially-degraded');
});

test('supplied aggregate cannot be stronger or otherwise disagree with derived aggregate', () => {
  const dimensions = [
    dimension('capability-fidelity'),
    dimension('preference-fidelity', 0.8, 'degraded'),
    dimension('safety-policy-fidelity')
  ];
  const document = evaluationFixture(topologyFixture(), { dimensions, aggregate_class: 'high-fidelity' });
  assert.throws(() => validateReplacementFidelityEvaluation(document), /aggregate_class.*derived/i);
});

test('topology reference candidate and artifact binding fail closed', () => {
  const topology = topologyFixture();
  const cases = [
    [document => { document.topology_id = 'topology.other.v1'; }, /topology_id/i],
    [document => { document.topology_digest = DIGEST_B; }, /topology digest/i],
    [document => { document.reference.node_id = 'node.missing'; }, /reference.*node_id/i],
    [document => { document.reference.model_id = 'model.other'; }, /reference.*model_id/i],
    [document => { document.candidate.node_id = 'node.missing'; }, /candidate.*node_id/i],
    [document => { document.candidate.model_id = 'model.other'; }, /candidate.*model_id/i],
    [document => { document.candidate.artifact_digest = DIGEST_B; }, /candidate.*artifact_digest/i],
    [document => { document.reference.artifact_digest = DIGEST_A; }, /reference.*artifact_digest/i]
  ];
  for (const [mutator, pattern] of cases) {
    const document = evaluationFixture(topology);
    mutator(document);
    assert.throws(() => resolveReplacementFidelityEvaluation(document, topology, [lineageFixture(topology)]), pattern);
  }
  const same = evaluationFixture(topology);
  same.candidate = { ...same.reference };
  assert.throws(() => resolveReplacementFidelityEvaluation(same, topology, []), /reference and candidate.*different/i);
});

test('optional lineage must resolve to the exact reference candidate pair', () => {
  const topology = topologyFixture();
  const correct = lineageFixture(topology);
  assert.doesNotThrow(() => resolveReplacementFidelityEvaluation(evaluationFixture(topology, { lineage: correct }), topology, [correct]));

  const alternate = lineageFixture(topology, 'node.alternate');
  const wrongDigest = evaluationFixture(topology, { lineage: correct });
  wrongDigest.lineage.lineage_digest = cognitiveLineageManifestDigest(alternate);
  assert.throws(() => resolveReplacementFidelityEvaluation(wrongDigest, topology, [correct, alternate]), /lineage.*digest/i);

  const missing = evaluationFixture(topology, { lineage: correct });
  assert.throws(() => resolveReplacementFidelityEvaluation(missing, topology, []), /lineage.*not supplied/i);
});

test('evaluator provenance chronology identifiers digests and confidence are strict', () => {
  expectReject(document => { document.evaluator_ref = 'bad ref'; }, /evaluator_ref/i);
  expectReject(document => { document.recorded_at = '2026-08-29T21:09:00.000Z'; }, /recorded_at.*evaluated_at/i);
  expectReject(document => { document.dimensions[0].metric_digest = DIGEST_D.toUpperCase(); }, /metric_digest/i);
  expectReject(document => { document.dimensions[0].confidence = 'certain'; }, /confidence/i);
  expectReject(document => { document.dimensions[0].sample_count = 1000001; }, /sample_count/i);
});

test('identity percentage sameness secrets and activation widening fail closed', () => {
  expectReject(document => { document.identity_percentage = 0.93; }, /unknown field identity_percentage/i);
  expectReject(document => { document.sameness_score = 0.93; }, /unknown field sameness_score/i);
  expectReject(document => { document.provider_token = 'secret'; }, /unknown field provider_token/i);
  expectReject(document => { document.contains_secret_material = true; }, /activation boundary/i);
  expectReject(document => { document.authority_effect = 'replace'; }, /activation boundary/i);
  expectReject(document => { document.network_effect = 'benchmark'; }, /activation boundary/i);
  expectReject(document => { document.runtime_activation = true; }, /activation boundary/i);
});

test('digest is invariant to object key order', () => {
  const document = evaluationFixture();
  const reordered = Object.fromEntries(Object.entries(document).reverse());
  assert.equal(replacementFidelityEvaluationDigest(document), replacementFidelityEvaluationDigest(reordered));
});

test('validator and resolver do not mutate deeply frozen inputs', () => {
  const topology = deepFreeze(topologyFixture());
  const lineage = deepFreeze(lineageFixture(clone(topology)));
  const document = deepFreeze(evaluationFixture(clone(topology), { lineage: clone(lineage) }));
  const before = JSON.stringify(document);
  assert.doesNotThrow(() => validateReplacementFidelityEvaluation(document));
  assert.doesNotThrow(() => resolveReplacementFidelityEvaluation(document, topology, [lineage]));
  assert.equal(JSON.stringify(document), before);
});

test('production module imports only canonical cognitive topology and cognitive lineage', async () => {
  const source = await readFile(new URL('../src/lib/replacement-fidelity-evaluation.mjs', import.meta.url), 'utf8');
  const imports = [...source.matchAll(/from\s+['\"]([^'\"]+)['\"]/g)].map(match => match[1]).sort();
  assert.deepEqual(imports, ['./canonical.mjs', './cognitive-lineage-manifest.mjs', './cognitive-topology.mjs']);
});
