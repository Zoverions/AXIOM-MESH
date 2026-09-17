import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeTypeSafeSystemOneFixtureResult,
  projectTypeSafeSystemOneQuestion
} from '../src/lib/bounded-decision-typesafe-system-one-adapter.mjs';
import {
  computeBoundedDecisionQuestionSchemaDigest
} from '../src/lib/bounded-decision-question-schema.mjs';
import {
  validateBoundedDecisionObservation
} from '../src/lib/bounded-decision-observation.mjs';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const ZERO = '0'.repeat(64);

function providerProfile(overrides = {}) {
  return {
    schema: 'axiom-bounded-decision-provider-profile.v0',
    version: 0,
    status: 'inert-bounded-decision-metadata',
    profile_id: 'bounded.provider.typesafe.system-one.jev-latest.v1',
    catalog_entry_id: 'provider:typesafe-system-one',
    catalog_entry_version: '0.1.0',
    catalog_entry_digest: A,
    offering_ref: 'typesafe.system-one',
    offering_version_or_revision: 'jev-latest',
    offering_revision_evidence: 'mutable-alias',
    provider_mode: 'provider-remote',
    supported_question_kinds: ['choice', 'score', 'binary-probability'],
    max_questions_per_request: 1,
    max_choice_cardinality: 64,
    max_score_levels: 10,
    type_guarantee: 'provider-native-closed-set',
    probability_support: 'full-distribution',
    latency_class: 'interactive',
    calibration_claim: 'local-experimental',
    retention_posture_ref: 'posture.typesafe.retention.reviewed.v1',
    training_use_posture_ref: 'posture.typesafe.training.reviewed.v1',
    created_at: '2026-09-17T20:40:00.000Z',
    review_at: '2026-10-17T20:40:00.000Z',
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

function choiceQuestion() {
  return signQuestion({
    schema: 'axiom-bounded-decision-question-schema.v0',
    version: 0,
    status: 'inert-bounded-decision-question-schema',
    question_schema_id: 'bounded.question.typesafe.choice.v1',
    question_kind: 'choice',
    instructions: 'Choose the browser action best supported by the transcript and bounded browser state.',
    purpose: 'bounded-browser-action-selection',
    domain: 'system-one-adapter-test',
    state_contract_ref: 'state.contract.browser-actions.v1',
    known_limitations: [],
    created_at: '2026-09-17T20:41:00.000Z',
    options: [
      { option_id: 'back', description: 'Navigate back one history entry.' },
      { option_id: 'forward', description: 'Navigate forward one history entry.' },
      { option_id: 'other', description: 'No declared browser action is sufficiently supported.' }
    ],
    other_option_policy: 'required',
    schema_digest: ZERO
  });
}

function scoreQuestion() {
  return signQuestion({
    schema: 'axiom-bounded-decision-question-schema.v0',
    version: 0,
    status: 'inert-bounded-decision-question-schema',
    question_schema_id: 'bounded.question.typesafe.score.v1',
    question_kind: 'score',
    instructions: 'Score how strongly the bounded state supports escalation.',
    purpose: 'bounded-escalation-scoring',
    domain: 'system-one-adapter-test',
    state_contract_ref: 'state.contract.escalation.v1',
    known_limitations: [],
    created_at: '2026-09-17T20:42:00.000Z',
    levels: [
      { level_id: 'low', position: 0, description: 'Low support for escalation.' },
      { level_id: 'medium', position: 1, description: 'Moderate support for escalation.' },
      { level_id: 'high', position: 2, description: 'High support for escalation.' }
    ],
    schema_digest: ZERO
  });
}

function binaryQuestion() {
  return signQuestion({
    schema: 'axiom-bounded-decision-question-schema.v0',
    version: 0,
    status: 'inert-bounded-decision-question-schema',
    question_schema_id: 'bounded.question.typesafe.binary.v1',
    question_kind: 'binary-probability',
    instructions: 'Estimate whether the utterance is complete enough for a reversible low-consequence action.',
    purpose: 'bounded-utterance-completeness',
    domain: 'system-one-adapter-test',
    state_contract_ref: 'state.contract.partial-utterance.v1',
    known_limitations: [],
    created_at: '2026-09-17T20:43:00.000Z',
    true_meaning: 'The utterance is sufficiently complete for the bounded reversible action.',
    false_meaning: 'The utterance is not sufficiently complete for the bounded reversible action.',
    schema_digest: ZERO
  });
}

function observationInput(overrides = {}) {
  return {
    observation_id: 'bounded.observation.typesafe.fixture.v1',
    state_digest: B,
    state_classification: 'confidential',
    observed_at: '2026-09-17T20:44:00.000Z',
    latency_ms: 287,
    calibration_report_ref: null,
    transport_evidence_ref: 'fixture.typesafe.system-one.v1',
    ...overrides
  };
}

function choiceResult(question = choiceQuestion(), overrides = {}) {
  return {
    model: 'jev-latest',
    answers: {
      [question.question_schema_id]: {
        type: 'choice',
        choice: 'back',
        confidence: 0.91,
        probabilities: {
          back: 0.7,
          forward: 0.2,
          other: 0.1
        }
      }
    },
    usage: {
      input_tokens: 24,
      output_tokens: 5
    },
    ...overrides
  };
}

test('projects AXIOM question identity and criteria into the TypeSafe System One question shape', () => {
  const choice = projectTypeSafeSystemOneQuestion(choiceQuestion());
  assert.deepEqual(choice, {
    name: 'bounded.question.typesafe.choice.v1',
    question: {
      type: 'choice',
      instructions: 'Choose the browser action best supported by the transcript and bounded browser state.',
      criteria: {
        back: 'Navigate back one history entry.',
        forward: 'Navigate forward one history entry.',
        other: 'No declared browser action is sufficiently supported.'
      }
    }
  });

  const score = projectTypeSafeSystemOneQuestion(scoreQuestion());
  assert.deepEqual(score.question, {
    type: 'score',
    instructions: 'Score how strongly the bounded state supports escalation.',
    criteria: [
      'Low support for escalation.',
      'Moderate support for escalation.',
      'High support for escalation.'
    ]
  });

  const binary = projectTypeSafeSystemOneQuestion(binaryQuestion());
  assert.deepEqual(binary.question, {
    type: 'noul',
    instructions: 'Estimate whether the utterance is complete enough for a reversible low-consequence action.',
    criteria: {
      true: 'The utterance is sufficiently complete for the bounded reversible action.',
      false: 'The utterance is not sufficiently complete for the bounded reversible action.'
    }
  });

  assert.equal(Object.isFrozen(choice), true);
  assert.equal(Object.isFrozen(choice.question.criteria), true);
});

test('normalizes a TypeSafe Choice result into the provider-neutral AXIOM observation contract', () => {
  const profile = providerProfile();
  const question = choiceQuestion();
  const observation = normalizeTypeSafeSystemOneFixtureResult({
    result: choiceResult(question),
    observation: observationInput()
  }, profile, question);

  assert.equal(observation.answer.kind, 'choice');
  assert.equal(observation.answer.selected_option_id, 'back');
  assert.deepEqual(observation.answer.tied_option_ids, []);
  assert.deepEqual(observation.probability_evidence, [
    { option_id: 'back', probability: 0.7 },
    { option_id: 'forward', probability: 0.2 },
    { option_id: 'other', probability: 0.1 }
  ]);
  assert.equal(observation.provider_confidence, 0.91);
  assert.deepEqual(observation.usage_evidence, {
    input_units: 24,
    output_units: 5,
    compute_class: 'typesafe-system-one',
    provider_report_ref: null
  });
  assert.equal(observation.transport_evidence_ref, 'fixture.typesafe.system-one.v1');
  assert.equal(observation.authority_effect, 'none');
  assert.equal(observation.assurance_effect, 'none');
  assert.equal(observation.network_effect, 'none');
  assert.equal(validateBoundedDecisionObservation(observation, profile, question).valid, true);
});

test('normalizes a TypeSafe Score result by canonical AXIOM score position', () => {
  const profile = providerProfile();
  const question = scoreQuestion();
  const result = {
    model: 'jev-latest',
    answers: {
      [question.question_schema_id]: {
        type: 'score',
        score: 1.5,
        confidence: 0.84,
        legend: {
          0: 'Low support for escalation.',
          1: 'Moderate support for escalation.',
          2: 'High support for escalation.'
        },
        probabilities: {
          0: 0.1,
          1: 0.3,
          2: 0.6
        }
      }
    },
    usage: { input_tokens: 31, output_tokens: 4 }
  };

  const observation = normalizeTypeSafeSystemOneFixtureResult({
    result,
    observation: observationInput({ observation_id: 'bounded.observation.typesafe.score.v1' })
  }, profile, question);

  assert.equal(observation.answer.kind, 'score');
  assert.equal(observation.answer.score, 1.5);
  assert.equal(observation.provider_confidence, 0.84);
  assert.deepEqual(observation.probability_evidence, [
    { level_id: 'low', position: 0, probability: 0.1 },
    { level_id: 'medium', position: 1, probability: 0.3 },
    { level_id: 'high', position: 2, probability: 0.6 }
  ]);
});

test('normalizes a TypeSafe Noul result as AXIOM binary probability without inventing confidence', () => {
  const profile = providerProfile();
  const question = binaryQuestion();
  const result = {
    model: 'jev-latest',
    answers: {
      [question.question_schema_id]: {
        type: 'noul',
        noul: 0.82
      }
    },
    usage: { input_tokens: 19, output_tokens: 2 }
  };

  const observation = normalizeTypeSafeSystemOneFixtureResult({
    result,
    observation: observationInput({ observation_id: 'bounded.observation.typesafe.binary.v1' })
  }, profile, question);

  assert.deepEqual(observation.answer, {
    kind: 'binary-probability',
    p_true: 0.82
  });
  assert.equal(observation.provider_confidence, null);
  assert.deepEqual(observation.probability_evidence, [
    { value: false, probability: 0.18000000000000005 },
    { value: true, probability: 0.82 }
  ]);
});

test('fails closed when the TypeSafe model identity does not match the bound provider profile', () => {
  const profile = providerProfile();
  const question = choiceQuestion();
  const result = choiceResult(question, { model: 'jev-something-else' });

  assert.throws(
    () => normalizeTypeSafeSystemOneFixtureResult({
      result,
      observation: observationInput()
    }, profile, question),
    /model|offering|revision/i
  );
});

test('fails closed on missing extra or mismatched answer identity and kind', () => {
  const profile = providerProfile();
  const question = choiceQuestion();

  const missing = choiceResult(question, { answers: {} });
  assert.throws(
    () => normalizeTypeSafeSystemOneFixtureResult({ result: missing, observation: observationInput() }, profile, question),
    /answer|question/i
  );

  const extra = choiceResult(question);
  extra.answers.unexpected = structuredClone(extra.answers[question.question_schema_id]);
  assert.throws(
    () => normalizeTypeSafeSystemOneFixtureResult({ result: extra, observation: observationInput() }, profile, question),
    /answer|exactly|question/i
  );

  const wrongKind = choiceResult(question);
  wrongKind.answers[question.question_schema_id] = { type: 'noul', noul: 0.8 };
  assert.throws(
    () => normalizeTypeSafeSystemOneFixtureResult({ result: wrongKind, observation: observationInput() }, profile, question),
    /type|kind|choice/i
  );
});

test('fails closed when Choice labels do not exactly match AXIOM option ids', () => {
  const profile = providerProfile();
  const question = choiceQuestion();
  const unknown = choiceResult(question);
  unknown.answers[question.question_schema_id].probabilities = {
    back: 0.7,
    forward: 0.2,
    renamed_other: 0.1
  };

  assert.throws(
    () => normalizeTypeSafeSystemOneFixtureResult({
      result: unknown,
      observation: observationInput()
    }, profile, question),
    /option|label|probabilit|unknown|missing/i
  );
});

test('fails closed when Score legend or score positions drift from the projected AXIOM rubric', () => {
  const profile = providerProfile();
  const question = scoreQuestion();
  const base = {
    model: 'jev-latest',
    answers: {
      [question.question_schema_id]: {
        type: 'score',
        score: 1.5,
        confidence: 0.84,
        legend: {
          0: 'Low support for escalation.',
          1: 'Moderate support for escalation.',
          2: 'High support for escalation.'
        },
        probabilities: { 0: 0.1, 1: 0.3, 2: 0.6 }
      }
    },
    usage: { input_tokens: 31, output_tokens: 4 }
  };

  const changedLegend = structuredClone(base);
  changedLegend.answers[question.question_schema_id].legend[1] = 'Changed provider rubric.';
  assert.throws(
    () => normalizeTypeSafeSystemOneFixtureResult({
      result: changedLegend,
      observation: observationInput()
    }, profile, question),
    /legend|rubric|level/i
  );

  const changedPositions = structuredClone(base);
  delete changedPositions.answers[question.question_schema_id].probabilities[1];
  changedPositions.answers[question.question_schema_id].probabilities[3] = 0.3;
  assert.throws(
    () => normalizeTypeSafeSystemOneFixtureResult({
      result: changedPositions,
      observation: observationInput()
    }, profile, question),
    /position|score|probabilit|level/i
  );
});

test('rejects malformed TypeSafe usage, confidence, Noul probability and shadow fields', () => {
  const profile = providerProfile();
  const question = choiceQuestion();
  const mutations = [
    result => { result.usage.input_tokens = -1; },
    result => { result.answers[question.question_schema_id].confidence = 1.2; },
    result => { result.shadow = 'not allowed'; },
    result => { result.answers[question.question_schema_id].shadow = 'not allowed'; }
  ];

  for (const mutate of mutations) {
    const result = choiceResult(question);
    mutate(result);
    assert.throws(
      () => normalizeTypeSafeSystemOneFixtureResult({
        result,
        observation: observationInput()
      }, profile, question),
      /usage|token|confidence|unknown|field|probability/i
    );
  }

  const binary = binaryQuestion();
  const invalidNoul = {
    model: 'jev-latest',
    answers: {
      [binary.question_schema_id]: { type: 'noul', noul: Number.NaN }
    },
    usage: { input_tokens: 4, output_tokens: 1 }
  };
  assert.throws(
    () => normalizeTypeSafeSystemOneFixtureResult({
      result: invalidNoul,
      observation: observationInput()
    }, profile, binary),
    /noul|probability|finite/i
  );
});

test('fixture adapter never accepts raw state or provider credentials as observation metadata', () => {
  const profile = providerProfile();
  const question = choiceQuestion();

  assert.throws(
    () => normalizeTypeSafeSystemOneFixtureResult({
      result: choiceResult(question),
      observation: {
        ...observationInput(),
        state: 'raw transcript',
        api_key: 'secret'
      }
    }, profile, question),
    /unknown|state|api|credential|field/i
  );
});
