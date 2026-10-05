import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BOUNDED_DECISION_QUESTION_SCHEMA,
  boundedDecisionQuestionSchemaDigest,
  computeBoundedDecisionQuestionSchemaDigest,
  validateBoundedDecisionQuestionSchema
} from '../src/lib/bounded-decision-question-schema.mjs';

const ZERO_DIGEST = '0'.repeat(64);

function sign(document) {
  document.schema_digest = computeBoundedDecisionQuestionSchemaDigest(document);
  return document;
}

function choiceSchema(overrides = {}) {
  return {
    schema: 'axiom-bounded-decision-question-schema.v0',
    version: 0,
    status: 'inert-bounded-decision-question-schema',
    question_schema_id: 'bounded.question.intent-route.v1',
    question_kind: 'choice',
    instructions: 'Choose the single intent class best supported by the supplied state.',
    purpose: 'intent-routing-evidence',
    domain: 'agent-intent-routing',
    state_contract_ref: 'state.contract.intent-summary.v1',
    known_limitations: ['Ambiguous or novel intents should use the explicit other option.'],
    created_at: '2026-09-15T22:00:00.000Z',
    options: [
      { option_id: 'export-data', description: 'The state requests export of governed data.' },
      { option_id: 'other', description: 'No declared intent class is sufficiently supported.' }
    ],
    other_option_policy: 'required',
    schema_digest: ZERO_DIGEST,
    ...overrides
  };
}

function scoreSchema(overrides = {}) {
  return {
    schema: 'axiom-bounded-decision-question-schema.v0',
    version: 0,
    status: 'inert-bounded-decision-question-schema',
    question_schema_id: 'bounded.question.risk-score.v1',
    question_kind: 'score',
    instructions: 'Estimate the declared risk level supported by the supplied state.',
    purpose: 'risk-evidence',
    domain: 'bounded-risk-assessment',
    state_contract_ref: 'state.contract.risk-summary.v1',
    known_limitations: ['This score is evidence only and does not set AXIOM risk or assurance.'],
    created_at: '2026-09-15T22:01:00.000Z',
    levels: [
      { level_id: 'low', position: 0, description: 'Little evidence of the bounded risk condition.' },
      { level_id: 'medium', position: 1, description: 'Material but incomplete evidence of the bounded risk condition.' },
      { level_id: 'high', position: 2, description: 'Strong evidence of the bounded risk condition.' }
    ],
    schema_digest: ZERO_DIGEST,
    ...overrides
  };
}

function binarySchema(overrides = {}) {
  return {
    schema: 'axiom-bounded-decision-question-schema.v0',
    version: 0,
    status: 'inert-bounded-decision-question-schema',
    question_schema_id: 'bounded.question.sensitive-data.v1',
    question_kind: 'binary-probability',
    instructions: 'Estimate whether the supplied state contains the declared sensitive-data condition.',
    purpose: 'sensitivity-evidence',
    domain: 'bounded-data-classification',
    state_contract_ref: 'state.contract.content-summary.v1',
    known_limitations: [],
    created_at: '2026-09-15T22:02:00.000Z',
    true_meaning: 'The supplied state supports the declared sensitive-data condition.',
    false_meaning: 'The supplied state does not support the declared sensitive-data condition.',
    schema_digest: ZERO_DIGEST,
    ...overrides
  };
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

test('content-addresses and validates an atomic choice schema without authority', () => {
  const document = choiceSchema();
  const expected = computeBoundedDecisionQuestionSchemaDigest(document);
  document.schema_digest = expected;

  const result = validateBoundedDecisionQuestionSchema(document);
  assert.equal(BOUNDED_DECISION_QUESTION_SCHEMA, document.schema);
  assert.equal(result.valid, true);
  assert.equal(result.question_schema_id, document.question_schema_id);
  assert.equal(result.question_kind, 'choice');
  assert.equal(result.schema_digest, expected);
  assert.equal(result.authority_effect, 'none');
  assert.equal(boundedDecisionQuestionSchemaDigest(document), expected);
  assert.equal(Object.isFrozen(result), true);
});

test('question digest changes for material semantics but not top-level key order', () => {
  const original = choiceSchema();
  const expected = computeBoundedDecisionQuestionSchemaDigest(original);
  original.schema_digest = expected;

  const reordered = Object.fromEntries(Object.entries(original).reverse());
  assert.equal(computeBoundedDecisionQuestionSchemaDigest(reordered), expected);

  for (const mutate of [
    item => { item.instructions = 'Different model-facing instructions.'; },
    item => { item.purpose = 'different-purpose'; },
    item => { item.domain = 'different-domain'; },
    item => { item.options[0].description = 'Materially changed option meaning.'; },
    item => { item.other_option_policy = 'allowed'; }
  ]) {
    const changed = structuredClone(original);
    mutate(changed);
    assert.notEqual(computeBoundedDecisionQuestionSchemaDigest(changed), expected);
  }
});

test('choice schemas require a closed unique option space and explicit fallback when required', () => {
  const valid = sign(choiceSchema());
  assert.equal(validateBoundedDecisionQuestionSchema(valid).valid, true);

  const noFallback = choiceSchema({
    options: [
      { option_id: 'export-data', description: 'Export.' },
      { option_id: 'query-data', description: 'Query.' }
    ]
  });
  assert.throws(() => computeBoundedDecisionQuestionSchemaDigest(noFallback), /other|none|fallback/i);

  const duplicate = choiceSchema();
  duplicate.options[1].option_id = duplicate.options[0].option_id;
  assert.throws(() => computeBoundedDecisionQuestionSchemaDigest(duplicate), /duplicate/i);

  const tooFew = choiceSchema({ options: [{ option_id: 'other', description: 'Fallback.' }] });
  assert.throws(() => computeBoundedDecisionQuestionSchemaDigest(tooFew), /2-64|option/i);

  const tooMany = choiceSchema({
    options: Array.from({ length: 65 }, (_, index) => ({
      option_id: index === 64 ? 'other' : `option-${index}`,
      description: `Option ${index}`
    }))
  });
  assert.throws(() => computeBoundedDecisionQuestionSchemaDigest(tooMany), /2-64|option/i);

  const badPolicy = choiceSchema({ other_option_policy: 'invent' });
  assert.throws(() => computeBoundedDecisionQuestionSchemaDigest(badPolicy), /other_option_policy/i);
});

test('score schemas require 2-10 unique ordered levels with exact positions', () => {
  const valid = sign(scoreSchema());
  assert.equal(validateBoundedDecisionQuestionSchema(valid).question_kind, 'score');

  const positionGap = scoreSchema();
  positionGap.levels[1].position = 2;
  assert.throws(() => computeBoundedDecisionQuestionSchemaDigest(positionGap), /position/i);

  const duplicate = scoreSchema();
  duplicate.levels[1].level_id = duplicate.levels[0].level_id;
  assert.throws(() => computeBoundedDecisionQuestionSchemaDigest(duplicate), /duplicate/i);

  const tooFew = scoreSchema({ levels: [scoreSchema().levels[0]] });
  assert.throws(() => computeBoundedDecisionQuestionSchemaDigest(tooFew), /2-10|level/i);

  const tooMany = scoreSchema({
    levels: Array.from({ length: 11 }, (_, position) => ({
      level_id: `level-${position}`,
      position,
      description: `Level ${position}`
    }))
  });
  assert.throws(() => computeBoundedDecisionQuestionSchemaDigest(tooMany), /2-10|level/i);
});

test('binary-probability schemas require distinct explicit true and false semantics', () => {
  const valid = sign(binarySchema());
  assert.equal(validateBoundedDecisionQuestionSchema(valid).question_kind, 'binary-probability');

  const same = binarySchema();
  same.false_meaning = same.true_meaning;
  assert.throws(() => computeBoundedDecisionQuestionSchemaDigest(same), /distinct|meaning/i);

  const empty = binarySchema({ true_meaning: '' });
  assert.throws(() => computeBoundedDecisionQuestionSchemaDigest(empty), /true_meaning/i);
});

test('variant mixing raw authority tool and private-reasoning fields fail closed', () => {
  for (const mutate of [
    item => { item.levels = scoreSchema().levels; },
    item => { item.true_meaning = 'yes'; },
    item => { item.tool = 'system.echo'; },
    item => { item.execute = true; },
    item => { item.authority_effect = 'allow'; },
    item => { item.chain_of_thought = 'private'; },
    item => { item.reasoning = 'private'; }
  ]) {
    const item = choiceSchema();
    mutate(item);
    assert.throws(() => computeBoundedDecisionQuestionSchemaDigest(item), /unknown|field/i);
  }

  const scoreWithOptions = scoreSchema();
  scoreWithOptions.options = choiceSchema().options;
  assert.throws(() => computeBoundedDecisionQuestionSchemaDigest(scoreWithOptions), /unknown|field/i);

  const binaryWithLevels = binarySchema();
  binaryWithLevels.levels = scoreSchema().levels;
  assert.throws(() => computeBoundedDecisionQuestionSchemaDigest(binaryWithLevels), /unknown|field/i);
});

test('schema digest mismatch malformed timestamps and unknown kinds fail closed', () => {
  const document = sign(choiceSchema());
  document.schema_digest = 'f'.repeat(64);
  assert.throws(() => validateBoundedDecisionQuestionSchema(document), /digest mismatch/i);

  const badTime = choiceSchema({ created_at: 'not-a-date' });
  assert.throws(() => computeBoundedDecisionQuestionSchemaDigest(badTime), /created_at/i);

  const badKind = choiceSchema({ question_kind: 'essay' });
  assert.throws(() => computeBoundedDecisionQuestionSchemaDigest(badKind), /question_kind/i);
});

test('validation preserves deeply frozen question schemas', () => {
  const document = choiceSchema();
  document.schema_digest = computeBoundedDecisionQuestionSchemaDigest(document);
  const frozen = deepFreeze(document);
  const before = JSON.stringify(frozen);

  assert.equal(validateBoundedDecisionQuestionSchema(frozen).valid, true);
  assert.equal(JSON.stringify(frozen), before);
});
