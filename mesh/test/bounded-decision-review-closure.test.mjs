import assert from 'node:assert/strict';
import test from 'node:test';

import { boundedDecisionProviderProfileDigest } from '../src/lib/bounded-decision-provider-profile.mjs';
import {
  computeBoundedDecisionQuestionSchemaDigest,
  validateBoundedDecisionQuestionSchema
} from '../src/lib/bounded-decision-question-schema.mjs';
import {
  computeBoundedDecisionObservationDigest,
  normalizeBoundedDecisionProviderResult
} from '../src/lib/bounded-decision-observation.mjs';
import {
  computeBoundedDecisionCalibrationReportDigest,
  resolveBoundedDecisionCalibrationReport
} from '../src/lib/bounded-decision-calibration-report.mjs';
import { interpretBoundedDecisionEvidence } from '../src/lib/bounded-decision-interpretation.mjs';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);
const D = 'd'.repeat(64);
const ZERO = '0'.repeat(64);
const NOW = '2026-09-15T22:00:00.000Z';

function profile(overrides = {}) {
  return {
    schema: 'axiom-bounded-decision-provider-profile.v0',
    version: 0,
    status: 'inert-bounded-decision-metadata',
    profile_id: 'bounded.provider.review-closure.v1',
    catalog_entry_id: 'provider:review-closure',
    catalog_entry_version: '0.1.0',
    catalog_entry_digest: A,
    offering_ref: 'model.review-closure',
    offering_version_or_revision: 'model.review-closure-2026-09-15',
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
    retention_posture_ref: null,
    training_use_posture_ref: null,
    created_at: '2026-09-15T18:00:00.000Z',
    review_at: '2026-10-15T18:00:00.000Z',
    authority_effect: 'none',
    network_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false,
    selection_effect: 'eligibility-only',
    assurance_effect: 'none',
    ...overrides
  };
}

function signQuestion(item) {
  item.schema_digest = computeBoundedDecisionQuestionSchemaDigest(item);
  return item;
}

function binaryQuestion() {
  return signQuestion({
    schema: 'axiom-bounded-decision-question-schema.v0',
    version: 0,
    status: 'inert-bounded-decision-question-schema',
    question_schema_id: 'bounded.question.review-closure.binary.v1',
    question_kind: 'binary-probability',
    instructions: 'Estimate whether the bounded condition is supported.',
    purpose: 'review-closure',
    domain: 'review-closure-domain',
    state_contract_ref: 'state.contract.review-closure.v1',
    known_limitations: [],
    created_at: '2026-09-15T18:10:00.000Z',
    true_meaning: 'The condition is supported.',
    false_meaning: 'The condition is not supported.',
    schema_digest: ZERO
  });
}

function choiceQuestion({ otherPolicy = 'forbidden', includeOther = false } = {}) {
  return signQuestion({
    schema: 'axiom-bounded-decision-question-schema.v0',
    version: 0,
    status: 'inert-bounded-decision-question-schema',
    question_schema_id: 'bounded.question.review-closure.choice.v1',
    question_kind: 'choice',
    instructions: 'Choose the bounded class best supported by the supplied state.',
    purpose: 'review-closure',
    domain: 'review-closure-domain',
    state_contract_ref: 'state.contract.review-closure.v1',
    known_limitations: [],
    created_at: '2026-09-15T18:11:00.000Z',
    options: [
      { option_id: 'a', description: 'First option.' },
      { option_id: includeOther ? 'other' : 'b', description: 'Second option.' }
    ],
    other_option_policy: otherPolicy,
    schema_digest: ZERO
  });
}

function scoreQuestion() {
  return signQuestion({
    schema: 'axiom-bounded-decision-question-schema.v0',
    version: 0,
    status: 'inert-bounded-decision-question-schema',
    question_schema_id: 'bounded.question.review-closure.score.v1',
    question_kind: 'score',
    instructions: 'Score the bounded condition.',
    purpose: 'review-closure',
    domain: 'review-closure-domain',
    state_contract_ref: 'state.contract.review-closure.v1',
    known_limitations: [],
    created_at: '2026-09-15T18:12:00.000Z',
    levels: [
      { level_id: 'low', position: 0, description: 'Low.' },
      { level_id: 'medium', position: 1, description: 'Medium.' },
      { level_id: 'high', position: 2, description: 'High.' }
    ],
    schema_digest: ZERO
  });
}

function providerInput(overrides = {}) {
  return {
    observation_id: 'bounded.observation.review-closure.v1',
    state_digest: B,
    state_classification: 'internal',
    observed_at: '2026-09-15T21:55:00.000Z',
    latency_ms: 10,
    answer: { kind: 'binary-probability', p_true: 0.9 },
    probability_evidence: null,
    provider_confidence: 0.9,
    usage_evidence: {
      input_units: 10,
      output_units: 1,
      compute_class: null,
      provider_report_ref: null
    },
    calibration_report_ref: 'bounded.calibration.review-closure.v1',
    transport_evidence_ref: null,
    ...overrides
  };
}

function observation(p, q, pTrue = 0.9, overrides = {}) {
  return normalizeBoundedDecisionProviderResult(providerInput({
    observation_id: overrides.observation_id ?? 'bounded.observation.review-closure.v1',
    answer: { kind: 'binary-probability', p_true: pTrue },
    calibration_report_ref: overrides.calibration_report_ref === undefined
      ? 'bounded.calibration.review-closure.v1'
      : overrides.calibration_report_ref
  }), p, q);
}

function calibration(p, questions, overrides = {}) {
  const item = {
    schema: 'axiom-bounded-decision-calibration-report.v0',
    version: 0,
    status: 'inert-bounded-decision-calibration',
    calibration_report_id: 'bounded.calibration.review-closure.v1',
    provider_profile_digest: boundedDecisionProviderProfileDigest(p),
    offering_version_or_revision: p.offering_version_or_revision,
    offering_revision_evidence: p.offering_revision_evidence,
    question_schema_family_refs: questions.map(q => ({
      question_schema_id: q.question_schema_id,
      question_schema_digest: q.schema_digest
    })),
    domain: 'review-closure-domain',
    population_description: 'Review closure evaluation population.',
    evaluation_period: {
      from: '2026-09-14T00:00:00.000Z',
      to: '2026-09-15T18:00:00.000Z'
    },
    sample_count: 500,
    outcome_source_refs: [{
      outcome_ref: 'outcome.review-closure.v1',
      outcome_digest: C,
      source_class: 'deterministic-checker'
    }],
    metrics: [{ metric_id: 'calibration-error', value: 0.02 }],
    known_limitations: [],
    distribution_shift_notes: [],
    created_at: '2026-09-15T18:30:00.000Z',
    valid_until: '2026-10-15T18:30:00.000Z',
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
  item.report_digest = computeBoundedDecisionCalibrationReportDigest(item);
  return item;
}

function policy(p, q, overrides = {}) {
  return {
    required_schema_digests: [q.schema_digest],
    maximum_observation_age_ms: 60 * 60 * 1000,
    minimum_calibration_state: 'reviewed',
    minimum_sample_count: 100,
    allowed_provider_profiles: [p.profile_id],
    allowed_revision_evidence: ['provider-versioned'],
    probability_predicates: [{
      kind: 'binary-min-p-true',
      question_schema_digest: q.schema_digest,
      threshold: 0.8
    }],
    disagreement_rule: 'conflict',
    fallback_route: 'deliberative-review',
    ...overrides
  };
}

function interpret(p, q, observations, calibrationReports, itemPolicy = policy(p, q)) {
  return interpretBoundedDecisionEvidence({
    observations,
    calibrationReports,
    providerProfiles: [p],
    questionSchemas: [q],
    policy: itemPolicy,
    now: NOW
  });
}

test('calibration resolution rejects provider digests placed in outcome_ref', () => {
  const p = profile();
  const q = binaryQuestion();
  const c = calibration(p, [q]);
  c.outcome_source_refs[0].outcome_ref = p.catalog_entry_digest;
  c.report_digest = computeBoundedDecisionCalibrationReportDigest(c);
  assert.throws(
    () => resolveBoundedDecisionCalibrationReport(c, p, [q]),
    /independent|provider|outcome|digest/i
  );
});

test('forbidden choice fallback policy rejects explicit other or none options', () => {
  const q = {
    schema: 'axiom-bounded-decision-question-schema.v0',
    version: 0,
    status: 'inert-bounded-decision-question-schema',
    question_schema_id: 'bounded.question.forbidden-fallback.v1',
    question_kind: 'choice',
    instructions: 'Choose one closed option.',
    purpose: 'review-closure',
    domain: 'review-closure-domain',
    state_contract_ref: 'state.contract.review-closure.v1',
    known_limitations: [],
    created_at: '2026-09-15T18:11:00.000Z',
    options: [
      { option_id: 'a', description: 'First option.' },
      { option_id: 'other', description: 'Fallback option.' }
    ],
    other_option_policy: 'forbidden',
    schema_digest: ZERO
  };
  assert.throws(
    () => computeBoundedDecisionQuestionSchemaDigest(q),
    /forbidden|fallback|other_option_policy/i
  );
});

test('choice and score normalization reject oversized distributions before entry validation', () => {
  const p = profile();
  const choice = choiceQuestion();
  assert.throws(
    () => normalizeBoundedDecisionProviderResult({
      ...providerInput({
        answer: { kind: 'choice', selected_option_id: 'a' },
        probability_evidence: [
          { option_id: 'a', probability: 0.5 },
          { option_id: 'b', probability: 0.4 },
          { option_id: 'extra', probability: 0.1 }
        ]
      })
    }, p, choice),
    /cardinality|length|exactly.*declared|declared.*exactly/i
  );

  const score = scoreQuestion();
  assert.throws(
    () => normalizeBoundedDecisionProviderResult({
      ...providerInput({
        observation_id: 'bounded.observation.review-closure.score.v1',
        answer: { kind: 'score', score: 1.5 },
        probability_evidence: [
          { level_id: 'low', position: 0, probability: 0.1 },
          { level_id: 'medium', position: 1, probability: 0.3 },
          { level_id: 'high', position: 2, probability: 0.6 },
          { level_id: 'extra', position: 3, probability: 0 }
        ]
      })
    }, p, score),
    /cardinality|length|exactly.*declared|declared.*exactly/i
  );
});

test('interpretation re-resolves observations against trusted provider and question inputs', () => {
  const p = profile();
  const q = binaryQuestion();
  const o = observation(p, q);
  const forged = structuredClone(o);
  forged.catalog_entry_digest = D;
  forged.observation_digest = computeBoundedDecisionObservationDigest(forged);

  const result = interpret(p, q, [forged], [calibration(p, [q])]);
  assert.equal(result.status, 'invalid-evidence');
  assert.ok(result.reason_codes.includes('observation-invalid'));
});

test('interpretation resolves calibration reports against trusted question-family bindings', () => {
  const p = profile();
  const q = binaryQuestion();
  const o = observation(p, q);
  const c = calibration(p, [q]);
  c.question_schema_family_refs[0].question_schema_id = 'bounded.question.substituted.v1';
  c.report_digest = computeBoundedDecisionCalibrationReportDigest(c);

  const result = interpret(p, q, [o], [c]);
  assert.equal(result.status, 'invalid-evidence');
  assert.ok(result.reason_codes.includes('calibration-invalid'));
});

test('duplicate calibration report ids fail closed instead of first-match selection', () => {
  const p = profile();
  const q = binaryQuestion();
  const o = observation(p, q);
  const c1 = calibration(p, [q]);
  const c2 = calibration(p, [q], { sample_count: 501 });
  c2.report_digest = computeBoundedDecisionCalibrationReportDigest(c2);

  const result = interpret(p, q, [o], [c1, c2]);
  assert.equal(result.status, 'invalid-evidence');
  assert.ok(result.reason_codes.includes('calibration-id-duplicate'));
});

test('calibration currentness rejects future creation and uses end-exclusive expiry', () => {
  const p = profile();
  const q = binaryQuestion();
  const o = observation(p, q);

  const future = calibration(p, [q], {
    created_at: '2026-09-15T22:30:00.000Z',
    valid_until: '2026-10-15T22:30:00.000Z'
  });
  future.report_digest = computeBoundedDecisionCalibrationReportDigest(future);
  let result = interpret(p, q, [o], [future]);
  assert.equal(result.status, 'insufficient-evidence');
  assert.ok(result.reason_codes.includes('calibration-created-in-future'));

  const boundary = calibration(p, [q], { valid_until: NOW });
  boundary.report_digest = computeBoundedDecisionCalibrationReportDigest(boundary);
  result = interpret(p, q, [o], [boundary]);
  assert.equal(result.status, 'insufficient-evidence');
  assert.ok(result.reason_codes.includes('calibration-expired'));
});

test('conflict and require-unanimity disagreement rules have distinct evidence semantics', () => {
  const p = profile();
  const q = binaryQuestion();
  const high = observation(p, q, 0.9, {
    observation_id: 'bounded.observation.review-closure.high.v1',
    calibration_report_ref: null
  });
  const low = observation(p, q, 0.1, {
    observation_id: 'bounded.observation.review-closure.low.v1',
    calibration_report_ref: null
  });

  const base = policy(p, q, {
    minimum_calibration_state: 'none',
    minimum_sample_count: 0
  });
  const conflict = interpret(p, q, [high, low], [], { ...base, disagreement_rule: 'conflict' });
  assert.equal(conflict.status, 'conflicting-evidence');
  assert.ok(conflict.reason_codes.includes('predicate-disagreement'));

  const unanimous = interpret(p, q, [high, low], [], { ...base, disagreement_rule: 'require-unanimity' });
  assert.equal(unanimous.status, 'insufficient-evidence');
  assert.ok(unanimous.reason_codes.includes('predicate-unanimity-required'));
});
