import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  cognitiveCapabilityProfileDigest
} from '../src/lib/cognitive-capability-profile.mjs';
import {
  COGNITIVE_CAPABILITY_OBSERVATION_SCHEMA,
  cognitiveCapabilityObservationDigest,
  resolveCognitiveCapabilityObservation,
  validateCognitiveCapabilityObservation
} from '../src/lib/cognitive-capability-observation.mjs';

const D = Object.freeze({
  a: 'a'.repeat(64),
  b: 'b'.repeat(64),
  c: 'c'.repeat(64),
  d: 'd'.repeat(64),
  e: 'e'.repeat(64),
  f: 'f'.repeat(64)
});

function validProfile() {
  return {
    schema: 'axiom-cognitive-capability-profile.v0',
    version: 0,
    status: 'inert-routing-metadata-laboratory',
    profile_id: 'cognitive.example.remote.general',
    catalog_entry: {
      entry_id: 'provider:example-api',
      entry_version: '0.1.0',
      entry_digest: D.f
    },
    integration_class: 'model-provider',
    offering_ref: 'model.example.general.v1',
    capabilities: ['reasoning', 'coding'],
    modalities: {
      input: ['text'],
      output: ['text']
    },
    deployment: {
      locality: 'provider-remote',
      access_mode: 'api'
    },
    data_policy: {
      retention: 'unknown',
      training_use: 'unknown',
      exportability: 'unknown',
      policy_ref: 'policy.example.provider.v1'
    },
    economics: {
      cost_class: 'medium',
      latency_class: 'interactive',
      context_class: 'large'
    },
    openness: {
      weight_access: 'closed',
      artifact_digest: null,
      license_ref: null
    },
    assurance: {
      ceiling: 'self-asserted',
      evidence_refs: ['evidence.example.provider-review']
    },
    created_at: '2026-09-06T12:00:00.000Z',
    updated_at: '2026-09-06T12:00:00.000Z',
    authority_effect: 'none',
    network_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false,
    selection_effect: 'eligibility-only'
  };
}

function validObservation(profile = validProfile()) {
  return {
    schema: 'axiom-cognitive-capability-observation.v0',
    version: 0,
    status: 'inert-evidence',
    observation_id: 'capobs.reasoning.current-main.v1',
    profile_id: profile.profile_id,
    profile_digest: cognitiveCapabilityProfileDigest(profile),
    capability: 'reasoning',
    context: {
      context_ref: 'context.reasoning.current-main.v1',
      context_digest: D.a,
      task_family_ref: 'task-family.reasoning.v1',
      task_family_digest: D.b,
      difficulty_class: 'challenging',
      environment_ref: 'environment.node24.v1',
      environment_digest: D.c,
      toolset_ref: 'toolset.none.v1',
      toolset_digest: D.d
    },
    evaluation: {
      suite_ref: 'suite.reasoning.v1',
      suite_digest: D.a,
      metric_set_ref: 'metrics.reasoning.v1',
      metric_set_digest: D.b,
      threshold_ref: 'threshold.reasoning.v1',
      threshold_digest: D.c,
      method_ref: 'method.deterministic.v1',
      method_digest: D.d
    },
    result: {
      classification: 'pass',
      confidence: 0.9,
      observed_metric_ref: 'metric-result.reasoning.v1',
      observed_metric_digest: D.e,
      failure_mode_refs: []
    },
    evaluator: {
      evaluator_kind: 'synthetic-harness',
      evaluator_ref: 'evaluator.reasoning.harness.v1',
      evaluator_principal_ref: null
    },
    evidence: {
      evidence_kind: 'evaluation-run',
      evidence_ref: 'evidence.reasoning.run.v1',
      evidence_digest: D.f,
      verification_ref: null,
      verification_digest: null,
      assurance_class: 'declared'
    },
    resource_observations: [
      {
        resource_class: 'input-tokens',
        basis: 'observed',
        amount: 2400,
        unit: 'tokens',
        source_ref: 'usage.reasoning.v1'
      },
      {
        resource_class: 'energy',
        basis: 'unknown',
        amount: null,
        unit: null,
        source_ref: null
      }
    ],
    observed_at: '2026-09-06T12:00:00.000Z',
    valid_until: '2026-10-06T12:00:00.000Z',
    recorded_at: '2026-09-06T12:01:00.000Z',
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    training_effect: 'none',
    spend_effect: 'none',
    runtime_activation: false,
    selection_effect: 'evidence-only'
  };
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function clone(value) {
  return structuredClone(value);
}

test('validates an evidence-only capability observation and produces a deterministic digest', () => {
  const observation = validObservation();
  const summary = validateCognitiveCapabilityObservation(observation);

  assert.equal(COGNITIVE_CAPABILITY_OBSERVATION_SCHEMA, observation.schema);
  assert.equal(summary.valid, true);
  assert.equal(summary.schema, observation.schema);
  assert.equal(summary.observation_id, observation.observation_id);
  assert.equal(summary.profile_id, observation.profile_id);
  assert.equal(summary.capability, 'reasoning');
  assert.equal(summary.classification, 'pass');
  assert.equal(summary.confidence, 0.9);
  assert.equal(summary.resource_observations, 2);
  assert.equal(summary.contains_secret_material, false);
  assert.equal(summary.authority_effect, 'none');
  assert.equal(summary.network_effect, 'none');
  assert.equal(summary.training_effect, 'none');
  assert.equal(summary.spend_effect, 'none');
  assert.equal(summary.runtime_activation, false);
  assert.equal(summary.selection_effect, 'evidence-only');
  assert.match(summary.observation_digest, /^[a-f0-9]{64}$/);
  assert.equal(Object.isFrozen(summary), true);

  const reordered = Object.fromEntries(Object.entries(observation).reverse());
  assert.equal(
    cognitiveCapabilityObservationDigest(observation),
    cognitiveCapabilityObservationDigest(reordered)
  );
});

test('unknown fields and malformed lexical values fail closed', () => {
  const topLevel = validObservation();
  topLevel.api_key = 'forbidden';
  assert.throws(() => validateCognitiveCapabilityObservation(topLevel), /unknown field/i);

  const nested = validObservation();
  nested.context.hidden_prompt = 'forbidden';
  assert.throws(() => validateCognitiveCapabilityObservation(nested), /unknown field/i);

  const badId = validObservation();
  badId.observation_id = ' bad';
  assert.throws(() => validateCognitiveCapabilityObservation(badId), /observation_id/i);

  const badDigest = validObservation();
  badDigest.profile_digest = 'A'.repeat(64);
  assert.throws(() => validateCognitiveCapabilityObservation(badDigest), /profile_digest|digest/i);

  const badUnit = validObservation();
  badUnit.resource_observations[0].unit = 'bad unit';
  assert.throws(() => validateCognitiveCapabilityObservation(badUnit), /unit/i);
});

test('schema status capability difficulty classification evaluator and evidence enums are closed', () => {
  const mutations = [
    ['schema', 'axiom-cognitive-capability-observation.v1'],
    ['version', 1],
    ['status', 'active'],
    ['capability', 'omniscience']
  ];

  for (const [field, value] of mutations) {
    const observation = validObservation();
    observation[field] = value;
    assert.throws(() => validateCognitiveCapabilityObservation(observation), /schema|version|status|capability/i);
  }

  const difficulty = validObservation();
  difficulty.context.difficulty_class = 'legendary';
  assert.throws(() => validateCognitiveCapabilityObservation(difficulty), /difficulty/i);

  const classification = validObservation();
  classification.result.classification = 'excellent';
  assert.throws(() => validateCognitiveCapabilityObservation(classification), /classification/i);

  const evaluator = validObservation();
  evaluator.evaluator.evaluator_kind = 'anonymous-oracle';
  assert.throws(() => validateCognitiveCapabilityObservation(evaluator), /evaluator_kind/i);

  const evidence = validObservation();
  evidence.evidence.evidence_kind = 'marketing-page';
  assert.throws(() => validateCognitiveCapabilityObservation(evidence), /evidence_kind/i);
});

test('context and evaluation identities are mandatory exact reference-digest pairs', () => {
  for (const [objectName, refField, digestField] of [
    ['context', 'context_ref', 'context_digest'],
    ['context', 'task_family_ref', 'task_family_digest'],
    ['context', 'environment_ref', 'environment_digest'],
    ['context', 'toolset_ref', 'toolset_digest'],
    ['evaluation', 'suite_ref', 'suite_digest'],
    ['evaluation', 'metric_set_ref', 'metric_set_digest'],
    ['evaluation', 'threshold_ref', 'threshold_digest'],
    ['evaluation', 'method_ref', 'method_digest']
  ]) {
    const missingRef = validObservation();
    delete missingRef[objectName][refField];
    assert.throws(() => validateCognitiveCapabilityObservation(missingRef), /missing|required|field/i);

    const malformedDigest = validObservation();
    malformedDigest[objectName][digestField] = '0'.repeat(63);
    assert.throws(() => validateCognitiveCapabilityObservation(malformedDigest), /digest/i);
  }
});

test('confidence failure modes and resource bounds are strict', () => {
  for (const confidence of [-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY]) {
    const observation = validObservation();
    observation.result.confidence = confidence;
    assert.throws(() => validateCognitiveCapabilityObservation(observation), /confidence/i);
  }

  const duplicateFailure = validObservation();
  duplicateFailure.result.failure_mode_refs = ['failure.timeout', 'failure.timeout'];
  assert.throws(() => validateCognitiveCapabilityObservation(duplicateFailure), /duplicate/i);

  const tooManyFailures = validObservation();
  tooManyFailures.result.failure_mode_refs = Array.from({ length: 33 }, (_, i) => `failure.${i}`);
  assert.throws(() => validateCognitiveCapabilityObservation(tooManyFailures), /0-32|32/i);

  const tooManyResources = validObservation();
  tooManyResources.resource_observations = Array.from({ length: 33 }, (_, i) => ({
    resource_class: 'other',
    basis: 'observed',
    amount: i,
    unit: 'units',
    source_ref: null
  }));
  assert.throws(() => validateCognitiveCapabilityObservation(tooManyResources), /0-32|32/i);
});

test('resource amount unit and basis semantics fail closed without implicit coercion', () => {
  const negative = validObservation();
  negative.resource_observations[0].amount = -1;
  assert.throws(() => validateCognitiveCapabilityObservation(negative), /amount|safe integer/i);

  const unsafe = validObservation();
  unsafe.resource_observations[0].amount = Number.MAX_SAFE_INTEGER + 1;
  assert.throws(() => validateCognitiveCapabilityObservation(unsafe), /amount|safe integer/i);

  const knownWithoutUnit = validObservation();
  knownWithoutUnit.resource_observations[0].unit = null;
  assert.throws(() => validateCognitiveCapabilityObservation(knownWithoutUnit), /unit/i);

  const unknownWithAmount = validObservation();
  unknownWithAmount.resource_observations[1].amount = 1;
  assert.throws(() => validateCognitiveCapabilityObservation(unknownWithAmount), /unknown.*amount|amount.*null/i);

  const unknownWithUnit = validObservation();
  unknownWithUnit.resource_observations[1].unit = 'millijoules';
  assert.throws(() => validateCognitiveCapabilityObservation(unknownWithUnit), /unknown.*unit|unit.*null/i);
});

test('assurance requires exact verification pairing and signed runs cannot be merely declared', () => {
  const halfPair = validObservation();
  halfPair.evidence.verification_ref = 'verification.local.v1';
  assert.throws(() => validateCognitiveCapabilityObservation(halfPair), /verification.*paired|verification/i);

  for (const assuranceClass of ['signed', 'verified-local', 'corroborated']) {
    const missing = validObservation();
    missing.evidence.assurance_class = assuranceClass;
    assert.throws(() => validateCognitiveCapabilityObservation(missing), /requires verification|verification/i);

    const valid = validObservation();
    valid.evidence.assurance_class = assuranceClass;
    valid.evidence.verification_ref = `verification.${assuranceClass}.v1`;
    valid.evidence.verification_digest = D.a;
    assert.equal(validateCognitiveCapabilityObservation(valid).valid, true);
  }

  const declaredWithVerification = validObservation();
  declaredWithVerification.evidence.verification_ref = 'verification.invalid.v1';
  declaredWithVerification.evidence.verification_digest = D.a;
  assert.throws(() => validateCognitiveCapabilityObservation(declaredWithVerification), /declared.*verification|verification/i);

  const signedDeclared = validObservation();
  signedDeclared.evidence.evidence_kind = 'signed-evaluation-run';
  assert.throws(() => validateCognitiveCapabilityObservation(signedDeclared), /signed-evaluation-run|declared assurance/i);
});

test('freshness chronology uses only explicit canonical timestamps', () => {
  const invalidTimestamp = validObservation();
  invalidTimestamp.observed_at = '2026-09-06T12:00:00Z';
  assert.throws(() => validateCognitiveCapabilityObservation(invalidTimestamp), /canonical ISO|observed_at/i);

  const expiresEarly = validObservation();
  expiresEarly.valid_until = '2026-09-06T11:59:59.000Z';
  assert.throws(() => validateCognitiveCapabilityObservation(expiresEarly), /valid_until/i);

  const recordedEarly = validObservation();
  recordedEarly.recorded_at = '2026-09-06T11:59:59.000Z';
  assert.throws(() => validateCognitiveCapabilityObservation(recordedEarly), /recorded_at/i);
});

test('every authority and effect boundary is mechanically fixed', () => {
  const mutations = [
    ['contains_secret_material', true],
    ['authority_effect', 'grant'],
    ['network_effect', 'outbound'],
    ['training_effect', 'adapt'],
    ['spend_effect', 'charge'],
    ['runtime_activation', true],
    ['selection_effect', 'winner']
  ];

  for (const [field, value] of mutations) {
    const observation = validObservation();
    observation[field] = value;
    assert.throws(() => validateCognitiveCapabilityObservation(observation), /boundary|effect|selection_effect|secret/i);
  }
});

test('resolver binds exact profile id digest and declared capability without mutating inputs', () => {
  const profile = deepFreeze(validProfile());
  const observation = deepFreeze(validObservation(profile));
  const beforeProfile = JSON.stringify(profile);
  const beforeObservation = JSON.stringify(observation);

  const resolved = resolveCognitiveCapabilityObservation(observation, profile);
  assert.equal(resolved.valid, true);
  assert.equal(resolved.profile_id, profile.profile_id);
  assert.equal(resolved.profile_digest, cognitiveCapabilityProfileDigest(profile));
  assert.equal(resolved.offering_ref, profile.offering_ref);
  assert.equal(resolved.capability, 'reasoning');
  assert.deepEqual(resolved.context, observation.context);
  assert.deepEqual(resolved.evaluation, observation.evaluation);
  assert.equal(resolved.authority_effect, 'none');
  assert.equal(resolved.network_effect, 'none');
  assert.equal(resolved.runtime_activation, false);
  assert.equal(resolved.selection_effect, 'evidence-only');
  assert.equal(Object.isFrozen(resolved), true);
  assert.equal(Object.isFrozen(resolved.context), true);
  assert.equal(Object.isFrozen(resolved.resource_observations), true);
  assert.equal(JSON.stringify(profile), beforeProfile);
  assert.equal(JSON.stringify(observation), beforeObservation);
});

test('resolver rejects profile identity digest and capability drift', () => {
  const profile = validProfile();

  const wrongId = validObservation(profile);
  wrongId.profile_id = 'cognitive.other.profile';
  assert.throws(() => resolveCognitiveCapabilityObservation(wrongId, profile), /profile_id/i);

  const wrongDigest = validObservation(profile);
  wrongDigest.profile_digest = D.a;
  assert.throws(() => resolveCognitiveCapabilityObservation(wrongDigest, profile), /profile_digest|digest/i);

  const undeclared = validObservation(profile);
  undeclared.capability = 'vision';
  assert.throws(() => resolveCognitiveCapabilityObservation(undeclared, profile), /not declared|capability/i);
});

test('production module imports only canonical and capability-profile helpers', async () => {
  const source = await readFile(
    new URL('../src/lib/cognitive-capability-observation.mjs', import.meta.url),
    'utf8'
  );
  const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match => match[1]);
  assert.deepEqual(imports.sort(), [
    './canonical.mjs',
    './cognitive-capability-profile.mjs'
  ]);
  assert.doesNotMatch(
    source,
    /node:(?:fs|http|https|net|tls|child_process)|gateway|grid|credential|wallet|provider-invoke/i
  );
});
