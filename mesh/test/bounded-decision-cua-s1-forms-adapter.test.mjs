import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  CUA_S1_FORMS_TARGET_BINDING_SCHEMA,
  normalizeCuaS1FormsFixtureResult,
  validateCuaS1FormsQuestion
} from '../src/lib/bounded-decision-cua-s1-forms-adapter.mjs';
import {
  computeBoundedDecisionQuestionSchemaDigest
} from '../src/lib/bounded-decision-question-schema.mjs';
import {
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
    profile_id: 'bounded.provider.cua.s1.forms.local.v1',
    catalog_entry_id: 'provider:cua-s1-forms-local',
    catalog_entry_version: '0.1.0',
    catalog_entry_digest: A,
    offering_ref: 'cua.s1.forms',
    offering_version_or_revision: `cua-s1-form-v0@sha256:${C}`,
    offering_revision_evidence: 'exact-artifact',
    provider_mode: 'owner-local',
    supported_question_kinds: ['choice'],
    max_questions_per_request: 1,
    max_choice_cardinality: 64,
    max_score_levels: 10,
    type_guarantee: 'adapter-constrained',
    probability_support: 'full-distribution',
    latency_class: 'local-fast',
    calibration_claim: 'local-experimental',
    retention_posture_ref: 'posture.cua-s1.local-retention.v1',
    training_use_posture_ref: 'posture.cua-s1.local-training.v1',
    created_at: '2026-09-18T22:00:00.000Z',
    review_at: '2026-10-18T22:00:00.000Z',
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

function question() {
  return signQuestion({
    schema: 'axiom-bounded-decision-question-schema.v0',
    version: 0,
    status: 'inert-bounded-decision-question-schema',
    question_schema_id: 'bounded.question.cua-s1.forms.element.v1',
    question_kind: 'choice',
    instructions:
      'Choose one bounded form action for this exact element and supplied entity set.',
    purpose: 'bounded-form-element-action-selection',
    domain: 'cua-s1-forms-adapter-test',
    state_contract_ref: 'state.contract.cua-s1.forms.element.v1',
    known_limitations: [
      'Evidence is element-local and cannot authorize execution or form submission.'
    ],
    created_at: '2026-09-18T22:01:00.000Z',
    options: [
      { option_id: 'fill.0', description: 'Fill from supplied entity zero.' },
      { option_id: 'fill.1', description: 'Fill from supplied entity one.' },
      { option_id: 'check', description: 'Check this exact checkbox target.' },
      { option_id: 'click', description: 'Click this exact target.' },
      { option_id: 'skip', description: 'Abstain from acting on this element.' }
    ],
    other_option_policy: 'forbidden',
    schema_digest: ZERO
  });
}

function observationInput(overrides = {}) {
  return {
    observation_id: 'bounded.observation.cua-s1.forms.fixture.v1',
    state_digest: B,
    state_classification: 'confidential',
    observed_at: '2026-09-18T22:02:00.000Z',
    latency_ms: 19,
    calibration_report_ref: null,
    transport_evidence_ref: 'fixture.cua-s1.forms.local.v1',
    ...overrides
  };
}

function result(overrides = {}) {
  return {
    model: `cua-s1-form-v0@sha256:${C}`,
    question_schema_id: 'bounded.question.cua-s1.forms.element.v1',
    state_digest: B,
    snapshot_id: 'snapshot.forms.0001',
    element_token: 'element-token.forms.0007',
    selected_option_index: 0,
    probabilities: [0.72, 0.12, 0.05, 0.03, 0.08],
    ...overrides
  };
}

test('accepts only the canonical CUA-S1-FORMS action alphabet', () => {
  const validated = validateCuaS1FormsQuestion(question());
  assert.equal(validated.valid, true);
  assert.equal(validated.fill_option_count, 2);
  assert.deepEqual(validated.option_ids, [
    'fill.0',
    'fill.1',
    'check',
    'click',
    'skip'
  ]);
  assert.equal(validated.abstention_option_id, 'skip');

  const renamed = question();
  renamed.options[3].option_id = 'submit';
  renamed.schema_digest = computeBoundedDecisionQuestionSchemaDigest(renamed);
  assert.throws(
    () => validateCuaS1FormsQuestion(renamed),
    /fill\.N|check, click, skip|action alphabet/i
  );

  const implicitOther = question();
  implicitOther.other_option_policy = 'allowed';
  implicitOther.schema_digest = computeBoundedDecisionQuestionSchemaDigest(implicitOther);
  assert.throws(
    () => validateCuaS1FormsQuestion(implicitOther),
    /skip abstention|other/i
  );
});

test('normalizes local CUA-S1 form choice into provider-neutral bounded evidence', () => {
  const profile = providerProfile();
  const schema = question();
  const envelope = normalizeCuaS1FormsFixtureResult({
    result: result(),
    observation: observationInput()
  }, profile, schema);

  assert.equal(envelope.observation.answer.kind, 'choice');
  assert.equal(envelope.observation.answer.selected_option_id, 'fill.0');
  assert.deepEqual(envelope.observation.answer.tied_option_ids, []);
  assert.deepEqual(envelope.observation.probability_evidence, [
    { option_id: 'fill.0', probability: 0.72 },
    { option_id: 'fill.1', probability: 0.12 },
    { option_id: 'check', probability: 0.05 },
    { option_id: 'click', probability: 0.03 },
    { option_id: 'skip', probability: 0.08 }
  ]);
  assert.equal(envelope.observation.provider_confidence, 0.72);
  assert.deepEqual(envelope.observation.usage_evidence, {
    input_units: null,
    output_units: 5,
    compute_class: 'cua-s1-forms-local',
    provider_report_ref: null
  });
  assert.equal(
    validateBoundedDecisionObservation(envelope.observation, profile, schema).valid,
    true
  );
});

test('preserves exact snapshot and element identity as inert source binding', () => {
  const envelope = normalizeCuaS1FormsFixtureResult({
    result: result(),
    observation: observationInput()
  }, providerProfile(), question());

  assert.equal(envelope.target_binding.schema, CUA_S1_FORMS_TARGET_BINDING_SCHEMA);
  assert.equal(envelope.target_binding.snapshot_id, 'snapshot.forms.0001');
  assert.equal(envelope.target_binding.element_token, 'element-token.forms.0007');
  assert.equal(envelope.target_binding.state_digest, B);
  assert.equal(
    envelope.target_binding.observation_digest,
    envelope.observation.observation_digest
  );
  assert.match(envelope.target_binding.binding_digest, /^[a-f0-9]{64}$/);
  assert.equal(envelope.target_binding.authority_effect, 'none');
  assert.equal(envelope.target_binding.assurance_effect, 'none');
  assert.equal(envelope.target_binding.runtime_activation, false);
  assert.equal(envelope.target_binding.execution_effect, 'none');
  assert.equal(envelope.target_binding.submit_authorization, false);
});

test('maps CUA-S1 skip to explicit abstention without fabricating an action', () => {
  const envelope = normalizeCuaS1FormsFixtureResult({
    result: result({
      selected_option_index: 4,
      probabilities: [0.03, 0.04, 0.05, 0.08, 0.8]
    }),
    observation: observationInput({
      observation_id: 'bounded.observation.cua-s1.forms.skip.v1'
    })
  }, providerProfile(), question());

  assert.equal(envelope.observation.answer.selected_option_id, 'skip');
  assert.equal(envelope.target_binding.selected_option_id, 'skip');
  assert.equal(envelope.target_binding.abstained, true);
  assert.equal(envelope.target_binding.execution_effect, 'none');
  assert.equal(envelope.target_binding.submit_authorization, false);
});

test('requires owner-local exact-artifact provider binding', () => {
  const schema = question();

  assert.throws(
    () => normalizeCuaS1FormsFixtureResult({
      result: result(),
      observation: observationInput()
    }, providerProfile({ offering_revision_evidence: 'mutable-alias' }), schema),
    /exact-artifact/i
  );

  assert.throws(
    () => normalizeCuaS1FormsFixtureResult({
      result: result(),
      observation: observationInput()
    }, providerProfile({ provider_mode: 'provider-remote' }), schema),
    /owner-local/i
  );

  assert.throws(
    () => normalizeCuaS1FormsFixtureResult({
      result: result({ model: 'cua-s1-form-v0@sha256:' + 'd'.repeat(64) }),
      observation: observationInput()
    }, providerProfile(), schema),
    /model|offering|revision/i
  );
});

test('rejects stale state binding and malformed probability evidence', () => {
  const profile = providerProfile();
  const schema = question();

  assert.throws(
    () => normalizeCuaS1FormsFixtureResult({
      result: result({ state_digest: 'd'.repeat(64) }),
      observation: observationInput()
    }, profile, schema),
    /state digest/i
  );

  assert.throws(
    () => normalizeCuaS1FormsFixtureResult({
      result: result({ probabilities: [0.8, 0.1, 0.1] }),
      observation: observationInput()
    }, profile, schema),
    /option count|distribution/i
  );

  assert.throws(
    () => normalizeCuaS1FormsFixtureResult({
      result: result({
        selected_option_index: 3,
        probabilities: [0.72, 0.12, 0.05, 0.03, 0.08]
      }),
      observation: observationInput()
    }, profile, schema),
    /maximal-probability/i
  );

  assert.throws(
    () => normalizeCuaS1FormsFixtureResult({
      result: result({ probabilities: [0.8, 0.1, 0.05, 0.03, 0.03] }),
      observation: observationInput()
    }, profile, schema),
    /sum to 1|probabilit/i
  );
});

test('execution, submit, raw state and credential smuggling fields fail closed', () => {
  const profile = providerProfile();
  const schema = question();

  for (const field of ['execute', 'submit', 'raw_state', 'api_key']) {
    const value = result();
    value[field] = field === 'execute' || field === 'submit' ? true : 'secret-or-state';
    assert.throws(
      () => normalizeCuaS1FormsFixtureResult({
        result: value,
        observation: observationInput()
      }, profile, schema),
      /unknown field/i
    );
  }

  assert.throws(
    () => normalizeCuaS1FormsFixtureResult({
      result: result(),
      observation: {
        ...observationInput(),
        raw_state: 'document contents',
        api_key: 'secret'
      }
    }, profile, schema),
    /unknown field/i
  );
});

test('adapter source remains network credential SDK and effect free', async () => {
  const source = await readFile(
    new URL('../src/lib/bounded-decision-cua-s1-forms-adapter.mjs', import.meta.url),
    'utf8'
  );
  const imports = source
    .split('\n')
    .filter(line => /^\s*import\b/.test(line))
    .join('\n');

  for (const marker of [
    'node:http',
    'node:https',
    'node:net',
    'node:tls',
    'node:child_process',
    'node:worker_threads',
    '@trycua',
    'cua-driver'
  ]) {
    assert.equal(imports.includes(marker), false, `adapter imports must not contain ${marker}`);
  }

  for (const marker of [
    'fetch(',
    'process.env',
    'CUA_API_KEY',
    'spawn(',
    'exec(',
    'set_value(',
    '.click('
  ]) {
    assert.equal(source.includes(marker), false, `adapter must not contain effect primitive ${marker}`);
  }
});
