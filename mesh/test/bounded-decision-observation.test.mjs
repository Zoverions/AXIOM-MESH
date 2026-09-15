import assert from 'node:assert/strict';
import test from 'node:test';

import {
  boundedDecisionProviderProfileDigest
} from '../src/lib/bounded-decision-provider-profile.mjs';
import {
  computeBoundedDecisionQuestionSchemaDigest
} from '../src/lib/bounded-decision-question-schema.mjs';
import {
  BOUNDED_DECISION_OBSERVATION_SCHEMA,
  boundedDecisionObservationDigest,
  computeBoundedDecisionObservationDigest,
  createBoundedDecisionFailureReceipt,
  normalizeBoundedDecisionProviderResult,
  validateBoundedDecisionObservation
} from '../src/lib/bounded-decision-observation.mjs';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);
const ZERO = '0'.repeat(64);

function providerProfile(overrides = {}) {
  return {
    schema: 'axiom-bounded-decision-provider-profile.v0',
    version: 0,
    status: 'inert-bounded-decision-metadata',
    profile_id: 'bounded.provider.observation.v1',
    catalog_entry_id: 'provider:bounded-observation',
    catalog_entry_version: '0.1.0',
    catalog_entry_digest: A,
    offering_ref: 'model.bounded.observation',
    offering_version_or_revision: 'model.bounded.observation-2026-09-15',
    offering_revision_evidence: 'provider-versioned',
    provider_mode: 'provider-remote',
    supported_question_kinds: ['choice', 'score', 'binary-probability'],
    max_questions_per_request: 64,
    max_choice_cardinality: 64,
    max_score_levels: 10,
    type_guarantee: 'provider-native-closed-set',
    probability_support: 'full-distribution',
    latency_class: 'interactive',
    calibration_claim: 'local-experimental',
    retention_posture_ref: 'posture.retention.reviewed.v1',
    training_use_posture_ref: 'posture.training.reviewed.v1',
    created_at: '2026-09-15T21:00:00.000Z',
    review_at: '2026-10-15T21:00:00.000Z',
    authority_effect: 'none',
    network_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false,
    selection_effect: 'eligibility-only',
    assurance_effect: 'none',
    ...overrides
  };
}

function signQuestion(document) {
  document.schema_digest = computeBoundedDecisionQuestionSchemaDigest(document);
  return document;
}

function choiceQuestion(options = [
  { option_id: 'a', description: 'First bounded option.' },
  { option_id: 'b', description: 'Second bounded option.' },
  { option_id: 'other', description: 'Explicit fallback option.' }
]) {
  return signQuestion({
    schema: 'axiom-bounded-decision-question-schema.v0',
    version: 0,
    status: 'inert-bounded-decision-question-schema',
    question_schema_id: 'bounded.question.observation.choice.v1',
    question_kind: 'choice',
    instructions: 'Choose the option best supported by the supplied state.',
    purpose: 'bounded-choice-evidence',
    domain: 'bounded-observation-test',
    state_contract_ref: 'state.contract.observation.v1',
    known_limitations: [],
    created_at: '2026-09-15T22:00:00.000Z',
    options,
    other_option_policy: 'required',
    schema_digest: ZERO
  });
}

function scoreQuestion() {
  return signQuestion({
    schema: 'axiom-bounded-decision-question-schema.v0',
    version: 0,
    status: 'inert-bounded-decision-question-schema',
    question_schema_id: 'bounded.question.observation.score.v1',
    question_kind: 'score',
    instructions: 'Score the bounded condition.',
    purpose: 'bounded-score-evidence',
    domain: 'bounded-observation-test',
    state_contract_ref: 'state.contract.observation.v1',
    known_limitations: [],
    created_at: '2026-09-15T22:01:00.000Z',
    levels: [
      { level_id: 'low', position: 0, description: 'Low.' },
      { level_id: 'medium', position: 1, description: 'Medium.' },
      { level_id: 'high', position: 2, description: 'High.' }
    ],
    schema_digest: ZERO
  });
}

function binaryQuestion() {
  return signQuestion({
    schema: 'axiom-bounded-decision-question-schema.v0',
    version: 0,
    status: 'inert-bounded-decision-question-schema',
    question_schema_id: 'bounded.question.observation.binary.v1',
    question_kind: 'binary-probability',
    instructions: 'Estimate whether the bounded condition is true.',
    purpose: 'bounded-binary-evidence',
    domain: 'bounded-observation-test',
    state_contract_ref: 'state.contract.observation.v1',
    known_limitations: [],
    created_at: '2026-09-15T22:02:00.000Z',
    true_meaning: 'The bounded condition is supported.',
    false_meaning: 'The bounded condition is not supported.',
    schema_digest: ZERO
  });
}

function commonInput(overrides = {}) {
  return {
    observation_id: 'bounded.observation.example.v1',
    state_digest: B,
    state_classification: 'confidential',
    observed_at: '2026-09-15T22:05:00.000Z',
    latency_ms: 18,
    provider_confidence: 0.87,
    usage_evidence: {
      input_units: 120,
      output_units: 3,
      compute_class: null,
      provider_report_ref: 'usage.provider.example.v1'
    },
    calibration_report_ref: null,
    transport_evidence_ref: 'transport.provider.example.v1',
    ...overrides
  };
}

function clone(value) { return structuredClone(value); }

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

test('normalizes Choice distributions and binds exact provider schema and state evidence', () => {
  const profile = providerProfile();
  const question = choiceQuestion();
  const observation = normalizeBoundedDecisionProviderResult({
    ...commonInput(),
    answer: { kind: 'choice', selected_option_id: 'a' },
    probability_evidence: [
      { option_id: 'b', probability: 0.2 },
      { option_id: 'other', probability: 0.1 },
      { option_id: 'a', probability: 0.7 }
    ]
  }, profile, question);

  assert.equal(BOUNDED_DECISION_OBSERVATION_SCHEMA, observation.schema);
  assert.equal(observation.answer.kind, 'choice');
  assert.equal(observation.answer.selected_option_id, 'a');
  assert.deepEqual(observation.answer.tied_option_ids, []);
  assert.deepEqual(observation.probability_evidence.map(item => item.option_id), ['a', 'b', 'other']);
  assert.equal(observation.provider_profile_digest, boundedDecisionProviderProfileDigest(profile));
  assert.equal(observation.question_schema_digest, question.schema_digest);
  assert.equal(observation.catalog_entry_digest, profile.catalog_entry_digest);
  assert.equal(observation.state_digest, B);
  assert.equal(Object.hasOwn(observation, 'state'), false);
  assert.equal(observation.authority_effect, 'none');
  assert.equal(observation.assurance_effect, 'none');
  assert.equal(validateBoundedDecisionObservation(observation, profile, question).valid, true);
  assert.equal(boundedDecisionObservationDigest(observation, profile, question), observation.observation_digest);
});

test('normalizes exact Choice ties explicitly and deterministically', () => {
  const question = choiceQuestion();
  const observation = normalizeBoundedDecisionProviderResult({
    ...commonInput({ observation_id: 'bounded.observation.tie.v1' }),
    answer: { kind: 'choice', selected_option_id: 'b' },
    probability_evidence: [
      { option_id: 'other', probability: 0 },
      { option_id: 'b', probability: 0.5 },
      { option_id: 'a', probability: 0.5 }
    ]
  }, providerProfile(), question);

  assert.equal(observation.answer.selected_option_id, 'a');
  assert.deepEqual(observation.answer.tied_option_ids, ['a', 'b']);
});

test('Choice distributions reject missing unknown duplicate invalid and non-normalized probabilities', () => {
  const profile = providerProfile();
  const question = choiceQuestion();
  const base = {
    ...commonInput(),
    answer: { kind: 'choice', selected_option_id: 'a' },
    probability_evidence: [
      { option_id: 'a', probability: 0.7 },
      { option_id: 'b', probability: 0.2 },
      { option_id: 'other', probability: 0.1 }
    ]
  };

  const mutations = [
    input => { input.probability_evidence.pop(); },
    input => { input.probability_evidence[0].option_id = 'unknown'; },
    input => { input.probability_evidence[1].option_id = 'a'; },
    input => { input.probability_evidence[0].probability = -0.1; },
    input => { input.probability_evidence[0].probability = Number.NaN; },
    input => { input.probability_evidence[0].probability = 0.6; }
  ];

  for (const mutate of mutations) {
    const input = clone(base);
    mutate(input);
    assert.throws(
      () => normalizeBoundedDecisionProviderResult(input, profile, question),
      /probability|distribution|option|missing|duplicate|sum/i
    );
  }
});

test('normalizes Score distributions and rejects a mismatched weighted mean', () => {
  const profile = providerProfile();
  const question = scoreQuestion();
  const input = {
    ...commonInput({ observation_id: 'bounded.observation.score.v1' }),
    answer: { kind: 'score', score: 1.5 },
    probability_evidence: [
      { level_id: 'high', position: 2, probability: 0.6 },
      { level_id: 'low', position: 0, probability: 0.1 },
      { level_id: 'medium', position: 1, probability: 0.3 }
    ]
  };
  const observation = normalizeBoundedDecisionProviderResult(input, profile, question);
  assert.equal(observation.answer.score, 1.5);
  assert.deepEqual(observation.probability_evidence.map(item => item.level_id), ['low', 'medium', 'high']);

  const wrong = clone(input);
  wrong.answer.score = 1.4;
  assert.throws(
    () => normalizeBoundedDecisionProviderResult(wrong, profile, question),
    /weighted|score/i
  );
});

test('normalizes binary probability by deriving p_false and rejects contradictory p_false input', () => {
  const profile = providerProfile({ probability_support: 'binary-probability-only' });
  const question = binaryQuestion();
  const observation = normalizeBoundedDecisionProviderResult({
    ...commonInput({ observation_id: 'bounded.observation.binary.v1', provider_confidence: null }),
    answer: { kind: 'binary-probability', p_true: 0.73 },
    probability_evidence: null
  }, profile, question);

  assert.equal(observation.answer.p_true, 0.73);
  assert.deepEqual(observation.probability_evidence, [
    { value: false, probability: 0.27 },
    { value: true, probability: 0.73 }
  ]);

  const contradictory = {
    ...commonInput({ observation_id: 'bounded.observation.binary.bad.v1' }),
    answer: { kind: 'binary-probability', p_true: 0.73, p_false: 0.4 },
    probability_evidence: null
  };
  assert.throws(
    () => normalizeBoundedDecisionProviderResult(contradictory, profile, question),
    /unknown field|p_false/i
  );
});

test('observation validation rejects binding drift raw state confidence misuse and widened boundaries', () => {
  const profile = providerProfile();
  const question = choiceQuestion();
  const observation = normalizeBoundedDecisionProviderResult({
    ...commonInput(),
    answer: { kind: 'choice', selected_option_id: 'a' },
    probability_evidence: [
      { option_id: 'a', probability: 0.7 },
      { option_id: 'b', probability: 0.2 },
      { option_id: 'other', probability: 0.1 }
    ]
  }, profile, question);

  for (const mutate of [
    item => { item.provider_profile_digest = C; },
    item => { item.catalog_entry_digest = C; },
    item => { item.offering_ref = 'model.other'; },
    item => { item.offering_revision_evidence = 'exact-artifact'; },
    item => { item.question_schema_digest = C; },
    item => { item.provider_confidence = 1.1; },
    item => { item.state = { raw: 'forbidden' }; },
    item => { item.required_assurance = 'A1'; },
    item => { item.achieved_assurance = 'A3'; },
    item => { item.authority_effect = 'grant'; },
    item => { item.assurance_effect = 'A3'; },
    item => { item.network_effect = 'egress'; },
    item => { item.credential_visibility = 'provider'; },
    item => { item.runtime_activation = true; },
    item => { item.selection_effect = 'winner'; }
  ]) {
    const changed = clone(observation);
    mutate(changed);
    assert.throws(
      () => validateBoundedDecisionObservation(changed, profile, question),
      /unknown|digest|offering|revision|confidence|boundary|effect|assurance|catalog|profile/i
    );
  }
});

test('usage accounting is bounded and raw/credential material is rejected', () => {
  const profile = providerProfile();
  const question = choiceQuestion();
  const validInput = {
    ...commonInput(),
    answer: { kind: 'choice', selected_option_id: 'a' },
    probability_evidence: [
      { option_id: 'a', probability: 0.7 },
      { option_id: 'b', probability: 0.2 },
      { option_id: 'other', probability: 0.1 }
    ]
  };

  for (const mutate of [
    input => { input.usage_evidence.input_units = -1; },
    input => { input.usage_evidence.output_units = Number.MAX_SAFE_INTEGER; },
    input => { input.usage_evidence.api_key = 'secret'; },
    input => { input.raw_state = 'secret state'; },
    input => { input.credential = 'secret'; }
  ]) {
    const changed = clone(validInput);
    mutate(changed);
    assert.throws(
      () => normalizeBoundedDecisionProviderResult(changed, profile, question),
      /usage|unknown|state|credential|unit/i
    );
  }
});

test('observation self-digest is deterministic and detects material tampering', () => {
  const profile = providerProfile();
  const question = choiceQuestion();
  const observation = normalizeBoundedDecisionProviderResult({
    ...commonInput(),
    answer: { kind: 'choice', selected_option_id: 'a' },
    probability_evidence: [
      { option_id: 'a', probability: 0.7 },
      { option_id: 'b', probability: 0.2 },
      { option_id: 'other', probability: 0.1 }
    ]
  }, profile, question);

  assert.equal(computeBoundedDecisionObservationDigest(observation), observation.observation_digest);
  const changed = clone(observation);
  changed.latency_ms += 1;
  assert.notEqual(computeBoundedDecisionObservationDigest(changed), observation.observation_digest);
  assert.throws(
    () => validateBoundedDecisionObservation(changed, profile, question),
    /digest mismatch/i
  );
});

test('failure receipts are explicit non-semantic evidence and never fabricate an answer', () => {
  for (const failureClass of [
    'provider-unavailable',
    'transport-integrity-failure',
    'schema-invalid',
    'distribution-invalid'
  ]) {
    const receipt = createBoundedDecisionFailureReceipt({
      failure_id: `bounded.failure.${failureClass}`,
      failure_class: failureClass,
      provider_profile_id: 'bounded.provider.observation.v1',
      provider_profile_digest: A,
      question_schema_id: 'bounded.question.observation.choice.v1',
      question_schema_digest: B,
      state_digest: C,
      observed_at: '2026-09-15T22:10:00.000Z',
      detail_ref: null
    });
    assert.equal(receipt.failure_class, failureClass);
    assert.equal(receipt.semantic_answer, null);
    assert.equal(Object.hasOwn(receipt, 'answer'), false);
    assert.equal(receipt.authority_effect, 'none');
    assert.equal(receipt.assurance_effect, 'none');
    assert.equal(Object.isFrozen(receipt), true);
  }
});

test('normalization and validation preserve deeply frozen upstream evidence', () => {
  const profile = deepFreeze(providerProfile());
  const question = deepFreeze(choiceQuestion());
  const input = deepFreeze({
    ...commonInput(),
    answer: { kind: 'choice', selected_option_id: 'a' },
    probability_evidence: [
      { option_id: 'a', probability: 0.7 },
      { option_id: 'b', probability: 0.2 },
      { option_id: 'other', probability: 0.1 }
    ]
  });
  const before = JSON.stringify({ profile, question, input });
  const observation = normalizeBoundedDecisionProviderResult(input, profile, question);
  assert.equal(validateBoundedDecisionObservation(observation, profile, question).valid, true);
  assert.equal(JSON.stringify({ profile, question, input }), before);
});
