import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { cognitiveCapabilityProfileDigest } from '../src/lib/cognitive-capability-profile.mjs';
import {
  COGNITIVE_CAPABILITY_OBSERVATION_SCHEMA,
  cognitiveCapabilityObservationDigest,
  resolveCognitiveCapabilityObservation,
  validateCognitiveCapabilityObservation
} from '../src/lib/cognitive-capability-observation.mjs';

const DIGEST_A = 'a'.repeat(64);
const DIGEST_B = 'b'.repeat(64);
const DIGEST_C = 'c'.repeat(64);
const DIGEST_D = 'd'.repeat(64);
const DIGEST_E = 'e'.repeat(64);

function validProfile() {
  return {
    schema: 'axiom-cognitive-capability-profile.v0',
    version: 0,
    status: 'inert-routing-metadata-laboratory',
    profile_id: 'cognitive.example.remote.general',
    catalog_entry: {
      entry_id: 'provider:example-api',
      entry_version: '0.1.0',
      entry_digest: DIGEST_E
    },
    integration_class: 'model-provider',
    offering_ref: 'model.example.general',
    capabilities: ['reasoning', 'research', 'summarization'],
    modalities: { input: ['text'], output: ['text'] },
    deployment: { locality: 'provider-remote', access_mode: 'api' },
    data_policy: {
      retention: 'unknown',
      training_use: 'unknown',
      exportability: 'unknown',
      policy_ref: 'policy.example.provider.v1'
    },
    economics: { cost_class: 'medium', latency_class: 'interactive', context_class: 'large' },
    openness: { weight_access: 'closed', artifact_digest: null, license_ref: null },
    assurance: { ceiling: 'self-asserted', evidence_refs: ['evidence.example.provider-review'] },
    created_at: '2026-08-31T12:00:00.000Z',
    updated_at: '2026-08-31T12:00:00.000Z',
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
    observation_id: 'capobs.reasoning.project.v1',
    profile_id: profile.profile_id,
    profile_digest: cognitiveCapabilityProfileDigest(profile),
    capability: 'reasoning',
    context: {
      context_ref: 'context.reasoning.project.v1',
      context_digest: DIGEST_A,
      task_family_ref: 'task-family.reasoning.project.v1',
      task_family_digest: DIGEST_B,
      difficulty_class: 'challenging',
      environment_ref: 'environment.node22.v1',
      environment_digest: DIGEST_C,
      toolset_ref: 'toolset.none.v1',
      toolset_digest: DIGEST_D
    },
    evaluation: {
      suite_ref: 'suite.reasoning.v1',
      suite_digest: DIGEST_A,
      metric_set_ref: 'metrics.reasoning.v1',
      metric_set_digest: DIGEST_B,
      threshold_ref: 'threshold.reasoning.v1',
      threshold_digest: DIGEST_C,
      method_ref: 'method.deterministic.v1',
      method_digest: DIGEST_D
    },
    result: {
      classification: 'pass',
      confidence: 0.9,
      observed_metric_ref: 'metric-result.reasoning.v1',
      observed_metric_digest: DIGEST_A,
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
      evidence_digest: DIGEST_B,
      verification_ref: null,
      verification_digest: null,
      assurance_class: 'declared'
    },
    resource_observations: [
      { resource_class: 'input-tokens', basis: 'observed', amount: 2400, unit: 'tokens', source_ref: 'usage.reasoning.v1' },
      { resource_class: 'energy', basis: 'unknown', amount: null, unit: null, source_ref: null }
    ],
    observed_at: '2026-08-31T12:00:00.000Z',
    valid_until: '2026-09-30T12:00:00.000Z',
    recorded_at: '2026-08-31T12:01:00.000Z',
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
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

test('validates inert empirical capability evidence and produces deterministic digest', () => {
  const profile = validProfile();
  const observation = validObservation(profile);
  const summary = validateCognitiveCapabilityObservation(observation);
  assert.equal(COGNITIVE_CAPABILITY_OBSERVATION_SCHEMA, observation.schema);
  assert.equal(summary.valid, true);
  assert.equal(summary.observation_id, observation.observation_id);
  assert.equal(summary.profile_id, profile.profile_id);
  assert.equal(summary.capability, 'reasoning');
  assert.equal(summary.classification, 'pass');
  assert.equal(summary.resource_observations, 2);
  assert.equal(summary.authority_effect, 'none');
  assert.equal(summary.network_effect, 'none');
  assert.equal(summary.training_effect, 'none');
  assert.equal(summary.spend_effect, 'none');
  assert.equal(summary.runtime_activation, false);
  assert.equal(summary.selection_effect, 'evidence-only');
  assert.equal(summary.observation_digest, cognitiveCapabilityObservationDigest(observation));
  assert.match(summary.observation_digest, /^[a-f0-9]{64}$/);
  assert.equal(Object.isFrozen(summary), true);
});

test('digest is deterministic across object key order', () => {
  const observation = validObservation();
  const reordered = Object.fromEntries(Object.entries(observation).reverse());
  assert.equal(cognitiveCapabilityObservationDigest(observation), cognitiveCapabilityObservationDigest(reordered));
});

test('unknown fields fail closed at top-level and nested boundaries', () => {
  const top = validObservation();
  top.api_key = 'nope';
  assert.throws(() => validateCognitiveCapabilityObservation(top), /unknown field/i);
  const context = validObservation();
  context.context.cookie = 'nope';
  assert.throws(() => validateCognitiveCapabilityObservation(context), /unknown field/i);
  const resource = validObservation();
  resource.resource_observations[0].token = 'nope';
  assert.throws(() => validateCognitiveCapabilityObservation(resource), /unknown field/i);
});

test('invalid lexical values, enums, and confidence fail closed', () => {
  const badCapability = validObservation();
  badCapability.capability = 'magic';
  assert.throws(() => validateCognitiveCapabilityObservation(badCapability), /capability/i);
  const badDigest = validObservation();
  badDigest.context.context_digest = 'ABC';
  assert.throws(() => validateCognitiveCapabilityObservation(badDigest), /digest/i);
  for (const bad of [-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY]) {
    const confidence = validObservation();
    confidence.result.confidence = bad;
    assert.throws(() => validateCognitiveCapabilityObservation(confidence), /confidence/i);
  }
});

test('context and evaluation reference/digest fields are mandatory', () => {
  const missingContext = validObservation();
  delete missingContext.context.environment_digest;
  assert.throws(() => validateCognitiveCapabilityObservation(missingContext), /environment_digest/i);
  const missingEvaluation = validObservation();
  delete missingEvaluation.evaluation.threshold_ref;
  assert.throws(() => validateCognitiveCapabilityObservation(missingEvaluation), /threshold_ref/i);
});

test('failure mode refs are duplicate-free and bounded to 32', () => {
  const duplicate = validObservation();
  duplicate.result.failure_mode_refs = ['failure.timeout', 'failure.timeout'];
  assert.throws(() => validateCognitiveCapabilityObservation(duplicate), /duplicate.*failure/i);
  const tooMany = validObservation();
  tooMany.result.failure_mode_refs = Array.from({ length: 33 }, (_, i) => `failure.${i}`);
  assert.throws(() => validateCognitiveCapabilityObservation(tooMany), /failure_mode_refs/i);
  const empty = validObservation();
  empty.result.classification = 'fail';
  empty.result.failure_mode_refs = [];
  assert.doesNotThrow(() => validateCognitiveCapabilityObservation(empty));
});

test('resource observations preserve amount, unit, and basis without aggregation', () => {
  const tooMany = validObservation();
  tooMany.resource_observations = Array.from({ length: 33 }, (_, i) => ({ resource_class: 'input-tokens', basis: 'observed', amount: i, unit: 'tokens', source_ref: null }));
  assert.throws(() => validateCognitiveCapabilityObservation(tooMany), /resource_observations/i);
  const knownNoAmount = validObservation();
  knownNoAmount.resource_observations[0].amount = null;
  assert.throws(() => validateCognitiveCapabilityObservation(knownNoAmount), /amount/i);
  const knownNoUnit = validObservation();
  knownNoUnit.resource_observations[0].unit = null;
  assert.throws(() => validateCognitiveCapabilityObservation(knownNoUnit), /unit/i);
  const unknownAmount = validObservation();
  unknownAmount.resource_observations[1].amount = 1;
  assert.throws(() => validateCognitiveCapabilityObservation(unknownAmount), /unknown.*amount/i);
  const unknownUnit = validObservation();
  unknownUnit.resource_observations[1].unit = 'millijoules';
  assert.throws(() => validateCognitiveCapabilityObservation(unknownUnit), /unknown.*unit/i);
  const unsafe = validObservation();
  unsafe.resource_observations[0].amount = Number.MAX_SAFE_INTEGER + 1;
  assert.throws(() => validateCognitiveCapabilityObservation(unsafe), /amount/i);
  assert.equal(Object.hasOwn(validObservation(), 'aggregate_score'), false);
});

test('evidence posture requires paired verification and stronger assurance evidence', () => {
  const partial = validObservation();
  partial.evidence.verification_ref = 'verification.run.v1';
  assert.throws(() => validateCognitiveCapabilityObservation(partial), /verification/i);
  for (const assurance of ['signed', 'verified-local', 'corroborated']) {
    const missing = validObservation();
    missing.evidence.assurance_class = assurance;
    assert.throws(() => validateCognitiveCapabilityObservation(missing), /verification/i);
    const valid = validObservation();
    valid.evidence.assurance_class = assurance;
    valid.evidence.verification_ref = `verification.${assurance}.v1`;
    valid.evidence.verification_digest = DIGEST_C;
    assert.doesNotThrow(() => validateCognitiveCapabilityObservation(valid));
  }
});

test('signed evaluation run cannot claim merely declared assurance', () => {
  const observation = validObservation();
  observation.evidence.evidence_kind = 'signed-evaluation-run';
  assert.throws(() => validateCognitiveCapabilityObservation(observation), /signed-evaluation-run.*declared/i);
});

test('timestamps are canonical and cannot move expiry or recording before observation', () => {
  const noncanonical = validObservation();
  noncanonical.observed_at = '2026-08-31 12:00:00Z';
  assert.throws(() => validateCognitiveCapabilityObservation(noncanonical), /observed_at/i);
  const expiry = validObservation();
  expiry.valid_until = '2026-08-31T11:59:59.000Z';
  assert.throws(() => validateCognitiveCapabilityObservation(expiry), /valid_until/i);
  const recorded = validObservation();
  recorded.recorded_at = '2026-08-31T11:59:59.000Z';
  assert.throws(() => validateCognitiveCapabilityObservation(recorded), /recorded_at/i);
});

test('hard authority and activation boundaries fail closed', () => {
  for (const [field, bad] of [
    ['contains_secret_material', true], ['authority_effect', 'grant'], ['network_effect', 'fetch'],
    ['training_effect', 'train'], ['spend_effect', 'charge'], ['runtime_activation', true], ['selection_effect', 'selected']
  ]) {
    const observation = validObservation();
    observation[field] = bad;
    assert.throws(() => validateCognitiveCapabilityObservation(observation), /boundary/i);
  }
});

test('validator does not mutate deeply frozen input', () => {
  const observation = deepFreeze(validObservation());
  assert.doesNotThrow(() => validateCognitiveCapabilityObservation(observation));
});

test('resolver binds exact profile digest and declared capability', () => {
  const profile = validProfile();
  const observation = validObservation(profile);
  const resolved = resolveCognitiveCapabilityObservation(observation, profile);
  assert.equal(resolved.profile_id, profile.profile_id);
  assert.equal(resolved.profile_digest, cognitiveCapabilityProfileDigest(profile));
  assert.equal(resolved.offering_ref, profile.offering_ref);
  assert.equal(resolved.capability, 'reasoning');
  assert.equal(resolved.context.context_ref, observation.context.context_ref);
  assert.equal(resolved.evaluation.suite_ref, observation.evaluation.suite_ref);
  assert.equal(resolved.evidence.evidence_ref, observation.evidence.evidence_ref);
  assert.equal(resolved.selection_effect, 'evidence-only');
  assert.equal(Object.isFrozen(resolved), true);
  assert.equal(Object.isFrozen(resolved.context), true);
  assert.equal(Object.isFrozen(resolved.resource_observations), true);
});

test('resolver rejects profile id, digest, and capability mismatches', () => {
  const profile = validProfile();
  const idMismatch = validObservation(profile);
  idMismatch.profile_id = 'cognitive.other.profile';
  assert.throws(() => resolveCognitiveCapabilityObservation(idMismatch, profile), /profile_id.*does not match/i);
  const digestMismatch = validObservation(profile);
  digestMismatch.profile_digest = DIGEST_A;
  assert.throws(() => resolveCognitiveCapabilityObservation(digestMismatch, profile), /profile_digest.*does not match/i);
  const absent = validObservation(profile);
  absent.capability = 'coding';
  assert.throws(() => resolveCognitiveCapabilityObservation(absent, profile), /capability.*not declared/i);
});

test('production module imports only canonical and cognitive capability profile helpers', async () => {
  const sourceUrl = new URL('../src/lib/cognitive-capability-observation.mjs', import.meta.url);
  const source = await readFile(sourceUrl, 'utf8');
  const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match => match[1]).sort();
  assert.deepEqual(imports, ['./canonical.mjs', './cognitive-capability-profile.mjs']);
});
