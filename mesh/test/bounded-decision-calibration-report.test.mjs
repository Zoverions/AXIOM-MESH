import assert from 'node:assert/strict';
import test from 'node:test';

import {
  boundedDecisionProviderProfileDigest
} from '../src/lib/bounded-decision-provider-profile.mjs';
import {
  computeBoundedDecisionQuestionSchemaDigest
} from '../src/lib/bounded-decision-question-schema.mjs';
import {
  BOUNDED_DECISION_CALIBRATION_REPORT_SCHEMA,
  boundedDecisionCalibrationReportDigest,
  computeBoundedDecisionCalibrationReportDigest,
  resolveBoundedDecisionCalibrationReport,
  validateBoundedDecisionCalibrationReport
} from '../src/lib/bounded-decision-calibration-report.mjs';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);
const ZERO = '0'.repeat(64);

function providerProfile(overrides = {}) {
  return {
    schema: 'axiom-bounded-decision-provider-profile.v0',
    version: 0,
    status: 'inert-bounded-decision-metadata',
    profile_id: 'bounded.provider.calibration.v1',
    catalog_entry_id: 'provider:bounded-calibration',
    catalog_entry_version: '0.1.0',
    catalog_entry_digest: A,
    offering_ref: 'model.bounded.calibration',
    offering_version_or_revision: 'model.bounded.calibration-2026-09-15',
    offering_revision_evidence: 'provider-versioned',
    provider_mode: 'provider-remote',
    supported_question_kinds: ['choice', 'score', 'binary-probability'],
    max_questions_per_request: 64,
    max_choice_cardinality: 64,
    max_score_levels: 10,
    type_guarantee: 'provider-native-closed-set',
    probability_support: 'full-distribution',
    latency_class: 'interactive',
    calibration_claim: 'local-reviewed',
    retention_posture_ref: 'posture.retention.reviewed.v1',
    training_use_posture_ref: 'posture.training.reviewed.v1',
    created_at: '2026-09-15T20:00:00.000Z',
    review_at: '2026-10-15T20:00:00.000Z',
    authority_effect: 'none',
    network_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false,
    selection_effect: 'eligibility-only',
    assurance_effect: 'none',
    ...overrides
  };
}

function question(id = 'bounded.question.calibration.choice.v1', domain = 'bounded-calibration-domain') {
  const document = {
    schema: 'axiom-bounded-decision-question-schema.v0',
    version: 0,
    status: 'inert-bounded-decision-question-schema',
    question_schema_id: id,
    question_kind: 'choice',
    instructions: 'Choose the bounded class best supported by state.',
    purpose: 'calibration-evidence',
    domain,
    state_contract_ref: 'state.contract.calibration.v1',
    known_limitations: [],
    created_at: '2026-09-15T20:10:00.000Z',
    options: [
      { option_id: 'yes', description: 'Condition supported.' },
      { option_id: 'other', description: 'Condition not established.' }
    ],
    other_option_policy: 'required',
    schema_digest: ZERO
  };
  document.schema_digest = computeBoundedDecisionQuestionSchemaDigest(document);
  return document;
}

function report(profile = providerProfile(), questions = [question()], overrides = {}) {
  const document = {
    schema: 'axiom-bounded-decision-calibration-report.v0',
    version: 0,
    status: 'inert-bounded-decision-calibration',
    calibration_report_id: 'bounded.calibration.report.v1',
    provider_profile_digest: boundedDecisionProviderProfileDigest(profile),
    offering_version_or_revision: profile.offering_version_or_revision,
    offering_revision_evidence: profile.offering_revision_evidence,
    question_schema_family_refs: questions.map(item => ({
      question_schema_id: item.question_schema_id,
      question_schema_digest: item.schema_digest
    })),
    domain: 'bounded-calibration-domain',
    population_description: 'Reviewed synthetic and deterministic evaluation cases representative of the declared domain.',
    evaluation_period: {
      from: '2026-09-14T00:00:00.000Z',
      to: '2026-09-15T19:00:00.000Z'
    },
    sample_count: 200,
    outcome_source_refs: [
      {
        outcome_ref: 'outcome.calibration.set.v1',
        outcome_digest: B,
        source_class: 'deterministic-checker'
      },
      {
        outcome_ref: 'outcome.calibration.review.v1',
        outcome_digest: C,
        source_class: 'human-adjudication'
      }
    ],
    metrics: [
      { metric_id: 'brier-score', value: 0.08 },
      { metric_id: 'calibration-error', value: 0.03 }
    ],
    known_limitations: ['English-only evaluation population.'],
    distribution_shift_notes: [],
    created_at: '2026-09-15T20:30:00.000Z',
    valid_until: '2026-10-15T20:30:00.000Z',
    review_state: 'reviewed',
    report_digest: ZERO,
    authority_effect: 'none',
    assurance_effect: 'none',
    network_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false,
    selection_effect: 'evidence-only',
    ...overrides
  };
  document.report_digest = computeBoundedDecisionCalibrationReportDigest(document);
  return document;
}

function clone(value) { return structuredClone(value); }
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

test('valid calibration report resolves exact provider and question-family evidence without authority', () => {
  const profile = providerProfile();
  const questions = [question()];
  const item = report(profile, questions);

  assert.equal(BOUNDED_DECISION_CALIBRATION_REPORT_SCHEMA, item.schema);
  assert.equal(validateBoundedDecisionCalibrationReport(item).valid, true);
  assert.equal(boundedDecisionCalibrationReportDigest(item), item.report_digest);

  const resolved = resolveBoundedDecisionCalibrationReport(item, profile, questions);
  assert.equal(resolved.valid, true);
  assert.equal(resolved.provider_profile_digest, boundedDecisionProviderProfileDigest(profile));
  assert.equal(resolved.review_state, 'reviewed');
  assert.equal(resolved.sample_count, 200);
  assert.equal(resolved.offering_revision_evidence, 'provider-versioned');
  assert.equal(resolved.authority_effect, 'none');
  assert.equal(resolved.assurance_effect, 'none');
  assert.equal(Object.isFrozen(resolved), true);
});

test('report digest covers material metrics domain population revision and validity semantics', () => {
  const profile = providerProfile();
  const questions = [question()];
  const base = report(profile, questions);
  const baseDigest = base.report_digest;

  for (const mutate of [
    item => { item.metrics[0].value = 0.09; },
    item => { item.domain = 'changed-domain'; },
    item => { item.population_description = 'Different population.'; },
    item => { item.offering_version_or_revision = 'changed-revision'; },
    item => { item.offering_revision_evidence = 'mutable-alias'; },
    item => { item.valid_until = '2026-11-15T20:30:00.000Z'; }
  ]) {
    const changed = clone(base);
    mutate(changed);
    assert.notEqual(computeBoundedDecisionCalibrationReportDigest(changed), baseDigest);
  }
});

test('resolver requires exact provider profile revision and every schema-family reference', () => {
  const profile = providerProfile();
  const q1 = question();
  const q2 = question('bounded.question.calibration.choice.v2');
  const item = report(profile, [q1, q2]);
  assert.equal(resolveBoundedDecisionCalibrationReport(item, profile, [q1, q2]).valid, true);

  const wrongProfile = clone(profile);
  wrongProfile.offering_version_or_revision = 'model.changed';
  assert.throws(
    () => resolveBoundedDecisionCalibrationReport(item, wrongProfile, [q1, q2]),
    /profile|digest|revision|offering/i
  );

  assert.throws(
    () => resolveBoundedDecisionCalibrationReport(item, profile, [q1]),
    /schema|family|missing/i
  );

  const driftedSchema = clone(q2);
  driftedSchema.instructions = 'Changed instructions.';
  driftedSchema.schema_digest = computeBoundedDecisionQuestionSchemaDigest(driftedSchema);
  assert.throws(
    () => resolveBoundedDecisionCalibrationReport(item, profile, [q1, driftedSchema]),
    /schema|digest|family/i
  );
});

test('mutable aliases remain explicit and are never promoted to exact revision evidence', () => {
  const profile = providerProfile({
    offering_version_or_revision: 'model-latest',
    offering_revision_evidence: 'mutable-alias',
    calibration_claim: 'local-experimental'
  });
  const questions = [question()];
  const item = report(profile, questions, {
    offering_version_or_revision: 'model-latest',
    offering_revision_evidence: 'mutable-alias',
    review_state: 'experimental'
  });
  item.report_digest = computeBoundedDecisionCalibrationReportDigest(item);
  const resolved = resolveBoundedDecisionCalibrationReport(item, profile, questions);
  assert.equal(resolved.offering_revision_evidence, 'mutable-alias');
  assert.equal(resolved.review_state, 'experimental');
});

test('chronology sample counts duplicate schema/outcome refs and self-confidence outcome claims fail closed', () => {
  const profile = providerProfile();
  const questions = [question()];
  const base = report(profile, questions);

  const mutations = [
    item => { item.sample_count = 0; },
    item => { item.valid_until = '2026-09-15T20:29:59.000Z'; },
    item => { item.evaluation_period.to = '2026-09-13T23:59:59.000Z'; },
    item => { item.question_schema_family_refs.push({ ...item.question_schema_family_refs[0] }); },
    item => { item.outcome_source_refs.push({ ...item.outcome_source_refs[0] }); },
    item => { item.outcome_source_refs[0].provider_confidence = 0.99; },
    item => { item.provider_confidence = 0.99; }
  ];

  for (const mutate of mutations) {
    const changed = clone(base);
    mutate(changed);
    assert.throws(
      () => computeBoundedDecisionCalibrationReportDigest(changed),
      /sample|valid_until|evaluation|duplicate|unknown field|confidence|outcome|schema/i
    );
  }
});

test('metrics must be unique finite evidence and raw prompt answer or authority fields fail closed', () => {
  const profile = providerProfile();
  const questions = [question()];
  const base = report(profile, questions);

  for (const mutate of [
    item => { item.metrics[0].value = Number.NaN; },
    item => { item.metrics[0].value = Number.POSITIVE_INFINITY; },
    item => { item.metrics.push({ ...item.metrics[0] }); },
    item => { item.prompt = 'raw prompt'; },
    item => { item.answer = 'raw answer'; },
    item => { item.chain_of_thought = 'private'; },
    item => { item.authority_effect = 'grant'; },
    item => { item.assurance_effect = 'A3'; },
    item => { item.network_effect = 'egress'; },
    item => { item.credential_visibility = 'provider'; },
    item => { item.runtime_activation = true; },
    item => { item.selection_effect = 'winner'; }
  ]) {
    const changed = clone(base);
    mutate(changed);
    assert.throws(
      () => computeBoundedDecisionCalibrationReportDigest(changed),
      /finite|duplicate|unknown|boundary|effect|metric/i
    );
  }
});

test('review-state vocabulary and domain binding fail closed', () => {
  const profile = providerProfile();
  const q = question();
  const invalidState = report(profile, [q]);
  invalidState.review_state = 'perfect';
  assert.throws(() => computeBoundedDecisionCalibrationReportDigest(invalidState), /review_state/i);

  const domainMismatch = report(profile, [q], { domain: 'different-domain' });
  domainMismatch.report_digest = computeBoundedDecisionCalibrationReportDigest(domainMismatch);
  assert.throws(
    () => resolveBoundedDecisionCalibrationReport(domainMismatch, profile, [q]),
    /domain/i
  );
});

test('validation and resolution preserve deeply frozen calibration evidence', () => {
  const profile = deepFreeze(providerProfile());
  const questions = deepFreeze([question()]);
  const item = deepFreeze(report(profile, questions));
  const before = JSON.stringify({ profile, questions, item });

  assert.equal(validateBoundedDecisionCalibrationReport(item).valid, true);
  assert.equal(resolveBoundedDecisionCalibrationReport(item, profile, questions).valid, true);
  assert.equal(JSON.stringify({ profile, questions, item }), before);
});
