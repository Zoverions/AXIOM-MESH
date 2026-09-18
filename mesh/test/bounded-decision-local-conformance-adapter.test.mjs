import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BOUNDED_DECISION_LOCAL_ADAPTER_TYPESAFE_SYSTEM_ONE_V060,
  normalizeBoundedDecisionLocalConformanceFixture
} from '../src/lib/bounded-decision-local-conformance-adapter.mjs';
import {
  computeBoundedDecisionQuestionSchemaDigest
} from '../src/lib/bounded-decision-question-schema.mjs';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const ZERO = '0'.repeat(64);

function profile(overrides = {}) {
  return {
    schema: 'axiom-bounded-decision-provider-profile.v0',
    version: 0,
    status: 'inert-bounded-decision-metadata',
    profile_id: 'bounded.provider.typesafe.fixture.v1',
    catalog_entry_id: 'provider:typesafe-fixture',
    catalog_entry_version: '0.1.0',
    catalog_entry_digest: A,
    offering_ref: 'typesafe.jev',
    offering_version_or_revision: 'jev-latest',
    offering_revision_evidence: 'mutable-alias',
    provider_mode: 'provider-remote',
    supported_question_kinds: ['choice', 'score', 'binary-probability'],
    max_questions_per_request: 64,
    max_choice_cardinality: 64,
    max_score_levels: 10,
    type_guarantee: 'provider-native-closed-set',
    probability_support: 'full-distribution',
    latency_class: 'interactive',
    calibration_claim: 'local-experimental',
    retention_posture_ref: null,
    training_use_posture_ref: null,
    created_at: '2026-09-16T12:00:00.000Z',
    review_at: '2026-10-16T12:00:00.000Z',
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
    instructions: 'Choose the bounded class best supported by the supplied state.',
    purpose: 'local-conformance',
    domain: 'bounded-typesafe-fixture',
    state_contract_ref: 'state.contract.typesafe.fixture.v1',
    known_limitations: [],
    created_at: '2026-09-16T12:05:00.000Z',
    options: [
      { option_id: 'target', description: 'Target class.' },
      { option_id: 'other', description: 'Explicit fallback class.' }
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
    instructions: 'Score the bounded condition.',
    purpose: 'local-conformance',
    domain: 'bounded-typesafe-fixture',
    state_contract_ref: 'state.contract.typesafe.fixture.v1',
    known_limitations: [],
    created_at: '2026-09-16T12:06:00.000Z',
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
    question_schema_id: 'bounded.question.typesafe.binary.v1',
    question_kind: 'binary-probability',
    instructions: 'Estimate whether the bounded condition is supported.',
    purpose: 'local-conformance',
    domain: 'bounded-typesafe-fixture',
    state_contract_ref: 'state.contract.typesafe.fixture.v1',
    known_limitations: [],
    created_at: '2026-09-16T12:07:00.000Z',
    true_meaning: 'The bounded condition is supported.',
    false_meaning: 'The bounded condition is not supported.',
    schema_digest: ZERO
  });
}

function observationContext(overrides = {}) {
  return {
    observation_id: 'bounded.observation.typesafe.fixture.v1',
    state_digest: B,
    state_classification: 'internal',
    observed_at: '2026-09-16T12:10:00.000Z',
    latency_ms: 7,
    calibration_report_ref: null,
    transport_evidence_ref: null,
    ...overrides
  };
}

function choicePayload(overrides = {}) {
  return {
    model: 'jev-latest',
    answers: {
      decision: {
        type: 'choice',
        choice: 'target',
        confidence: 0.82,
        probabilities: {
          target: 0.82,
          other: 0.18
        }
      }
    },
    usage: {
      input_tokens: 120,
      output_tokens: 4
    },
    ...overrides
  };
}

function scorePayload(overrides = {}) {
  return {
    model: 'jev-latest',
    answers: {
      decision: {
        type: 'score',
        score: 1.5,
        confidence: 0.61,
        legend: {
          0: 'Low.',
          1: 'Medium.',
          2: 'High.'
        },
        probabilities: {
          0: 0.1,
          1: 0.3,
          2: 0.6
        }
      }
    },
    usage: {
      input_tokens: 88,
      output_tokens: 5
    },
    ...overrides
  };
}

function noulPayload(overrides = {}) {
  return {
    model: 'jev-latest',
    answers: {
      decision: {
        type: 'noul',
        noul: 0.87
      }
    },
    usage: {
      input_tokens: 64,
      output_tokens: 1
    },
    ...overrides
  };
}

function adapt(provider_payload, question_schema, overrides = {}) {
  return normalizeBoundedDecisionLocalConformanceFixture({
    adapter_kind: BOUNDED_DECISION_LOCAL_ADAPTER_TYPESAFE_SYSTEM_ONE_V060,
    provider_payload,
    question_key: 'decision',
    observation: observationContext(overrides)
  }, profile(), question_schema);
}

function clone(value) { return structuredClone(value); }

test('normalizes TypeSafe 0.6 Choice fixtures through the existing AXIOM observation contract', () => {
  const result = adapt(choicePayload(), choiceQuestion());

  assert.equal(BOUNDED_DECISION_LOCAL_ADAPTER_TYPESAFE_SYSTEM_ONE_V060, 'typesafe-system-one-v0.6.0');
  assert.equal(result.answer.kind, 'choice');
  assert.equal(result.answer.selected_option_id, 'target');
  assert.deepEqual(result.answer.tied_option_ids, []);
  assert.deepEqual(result.probability_evidence, [
    { option_id: 'target', probability: 0.82 },
    { option_id: 'other', probability: 0.18 }
  ]);
  assert.equal(result.provider_confidence, 0.82);
  assert.deepEqual(result.usage_evidence, {
    input_units: 120,
    output_units: 4,
    compute_class: 'typesafe-system-one-v0.6.0-fixture',
    provider_report_ref: null
  });
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.assurance_effect, 'none');
  assert.equal(result.runtime_activation, false);
  assert.equal(Object.isFrozen(result), true);
});

test('preserves TypeSafe 0.6 Score distributions and checks the provider legend against the bound rubric', () => {
  const result = adapt(scorePayload(), scoreQuestion(), {
    observation_id: 'bounded.observation.typesafe.score.v1'
  });

  assert.equal(result.answer.kind, 'score');
  assert.equal(result.answer.score, 1.5);
  assert.equal(result.provider_confidence, 0.61);
  assert.deepEqual(result.probability_evidence, [
    { level_id: 'low', position: 0, probability: 0.1 },
    { level_id: 'medium', position: 1, probability: 0.3 },
    { level_id: 'high', position: 2, probability: 0.6 }
  ]);

  const drifted = scorePayload();
  drifted.answers.decision.legend[1] = 'Changed provider rubric.';
  assert.throws(
    () => adapt(drifted, scoreQuestion()),
    /legend|rubric|criterion|description/i
  );
});

test('maps TypeSafe Noul probability to binary probability evidence without inventing confidence', () => {
  const result = adapt(noulPayload(), binaryQuestion(), {
    observation_id: 'bounded.observation.typesafe.noul.v1'
  });

  assert.equal(result.answer.kind, 'binary-probability');
  assert.equal(result.answer.p_true, 0.87);
  assert.equal(result.provider_confidence, null);
  assert.deepEqual(result.probability_evidence, [
    { value: false, probability: 0.13 },
    { value: true, probability: 0.87 }
  ]);
});

test('fails closed when the returned provider model does not match the bound offering revision', () => {
  const payload = choicePayload({ model: 'jev-different' });
  assert.throws(
    () => adapt(payload, choiceQuestion()),
    /model|offering|revision/i
  );
});

test('rejects unknown adapter kinds, unknown top-level payload fields, missing answers and question-kind drift', () => {
  const base = choicePayload();

  assert.throws(
    () => normalizeBoundedDecisionLocalConformanceFixture({
      adapter_kind: 'unknown-adapter',
      provider_payload: base,
      question_key: 'decision',
      observation: observationContext()
    }, profile(), choiceQuestion()),
    /adapter/i
  );

  const unknown = clone(base);
  unknown.extra = true;
  assert.throws(() => adapt(unknown, choiceQuestion()), /unknown|field|payload/i);

  const missing = clone(base);
  delete missing.answers.decision;
  assert.throws(() => adapt(missing, choiceQuestion()), /answer|question_key|missing/i);

  assert.throws(() => adapt(noulPayload(), choiceQuestion()), /type|kind|choice|noul/i);
});

test('rejects malformed Choice probability evidence before it can become an AXIOM observation', () => {
  const cases = [
    payload => { delete payload.answers.decision.probabilities.other; },
    payload => { payload.answers.decision.probabilities.unknown = 0; },
    payload => { payload.answers.decision.probabilities.target = 0.7; },
    payload => { payload.answers.decision.choice = 'other'; },
    payload => { payload.answers.decision.confidence = 1.1; }
  ];

  for (const mutate of cases) {
    const payload = choicePayload();
    mutate(payload);
    assert.throws(
      () => adapt(payload, choiceQuestion()),
      /probability|distribution|option|choice|confidence|sum|unknown/i
    );
  }
});

test('rejects malformed Score probability evidence and weighted-mean drift', () => {
  const cases = [
    payload => { delete payload.answers.decision.probabilities[1]; },
    payload => { payload.answers.decision.probabilities[3] = 0; },
    payload => { payload.answers.decision.probabilities[2] = 0.5; },
    payload => { payload.answers.decision.score = 1.4; },
    payload => { payload.answers.decision.confidence = Number.NaN; }
  ];

  for (const mutate of cases) {
    const payload = scorePayload();
    mutate(payload);
    assert.throws(
      () => adapt(payload, scoreQuestion()),
      /probability|distribution|score|confidence|sum|weighted|unknown/i
    );
  }
});

test('rejects malformed Noul and usage evidence and preserves frozen caller inputs', () => {
  const invalidNoul = noulPayload();
  invalidNoul.answers.decision.noul = -0.1;
  assert.throws(() => adapt(invalidNoul, binaryQuestion()), /noul|probability/i);

  const invalidUsage = choicePayload();
  invalidUsage.usage.input_tokens = -1;
  assert.throws(() => adapt(invalidUsage, choiceQuestion()), /usage|token|input/i);

  const payload = choicePayload();
  const question = choiceQuestion();
  const p = profile();
  Object.freeze(payload.usage);
  Object.freeze(payload.answers.decision.probabilities);
  Object.freeze(payload.answers.decision);
  Object.freeze(payload.answers);
  Object.freeze(payload);
  Object.freeze(question.options[0]);
  Object.freeze(question.options[1]);
  Object.freeze(question.options);
  Object.freeze(question);
  Object.freeze(p.supported_question_kinds);
  Object.freeze(p);
  const before = JSON.stringify({ payload, question, p });

  const result = normalizeBoundedDecisionLocalConformanceFixture({
    adapter_kind: BOUNDED_DECISION_LOCAL_ADAPTER_TYPESAFE_SYSTEM_ONE_V060,
    provider_payload: payload,
    question_key: 'decision',
    observation: observationContext({ observation_id: 'bounded.observation.typesafe.frozen.v1' })
  }, p, question);

  assert.equal(result.answer.selected_option_id, 'target');
  assert.equal(JSON.stringify({ payload, question, p }), before);
});
