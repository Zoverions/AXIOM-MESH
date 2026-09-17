import assert from 'node:assert/strict';
import test from 'node:test';

import {
  boundedDecisionProviderProfileDigest
} from '../src/lib/bounded-decision-provider-profile.mjs';
import {
  computeBoundedDecisionQuestionSchemaDigest
} from '../src/lib/bounded-decision-question-schema.mjs';
import {
  normalizeBoundedDecisionProviderResult
} from '../src/lib/bounded-decision-observation.mjs';
import {
  computeBoundedDecisionCalibrationReportDigest
} from '../src/lib/bounded-decision-calibration-report.mjs';
import {
  interpretBoundedDecisionEvidence,
  validateBoundedDecisionInterpretationPolicy
} from '../src/lib/bounded-decision-interpretation.mjs';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);
const ZERO = '0'.repeat(64);

function profile(overrides = {}) {
  return {
    schema: 'axiom-bounded-decision-provider-profile.v0',
    version: 0,
    status: 'inert-bounded-decision-metadata',
    profile_id: 'bounded.provider.interpret.v1',
    catalog_entry_id: 'provider:bounded-interpret',
    catalog_entry_version: '0.1.0',
    catalog_entry_digest: A,
    offering_ref: 'model.bounded.interpret',
    offering_version_or_revision: 'model.bounded.interpret-2026-09-15',
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

function binaryQuestion(overrides = {}) {
  const item = {
    schema: 'axiom-bounded-decision-question-schema.v0',
    version: 0,
    status: 'inert-bounded-decision-question-schema',
    question_schema_id: 'bounded.question.interpret.binary.v1',
    question_kind: 'binary-probability',
    instructions: 'Estimate whether the bounded condition is supported.',
    purpose: 'interpretation-evidence',
    domain: 'bounded-interpretation-domain',
    state_contract_ref: 'state.contract.interpretation.v1',
    known_limitations: [],
    created_at: '2026-09-15T18:10:00.000Z',
    true_meaning: 'The bounded condition is supported.',
    false_meaning: 'The bounded condition is not supported.',
    schema_digest: ZERO,
    ...overrides
  };
  item.schema_digest = computeBoundedDecisionQuestionSchemaDigest(item);
  return item;
}

function choiceQuestion() {
  const item = {
    schema: 'axiom-bounded-decision-question-schema.v0',
    version: 0,
    status: 'inert-bounded-decision-question-schema',
    question_schema_id: 'bounded.question.interpret.choice.v1',
    question_kind: 'choice',
    instructions: 'Choose the bounded class best supported by state.',
    purpose: 'interpretation-evidence',
    domain: 'bounded-interpretation-domain',
    state_contract_ref: 'state.contract.interpretation.v1',
    known_limitations: [],
    created_at: '2026-09-15T18:11:00.000Z',
    options: [
      { option_id: 'target', description: 'Target class.' },
      { option_id: 'other', description: 'Fallback.' }
    ],
    other_option_policy: 'required',
    schema_digest: ZERO
  };
  item.schema_digest = computeBoundedDecisionQuestionSchemaDigest(item);
  return item;
}

function scoreQuestion() {
  const item = {
    schema: 'axiom-bounded-decision-question-schema.v0',
    version: 0,
    status: 'inert-bounded-decision-question-schema',
    question_schema_id: 'bounded.question.interpret.score.v1',
    question_kind: 'score',
    instructions: 'Score the bounded condition.',
    purpose: 'interpretation-evidence',
    domain: 'bounded-interpretation-domain',
    state_contract_ref: 'state.contract.interpretation.v1',
    known_limitations: [],
    created_at: '2026-09-15T18:12:00.000Z',
    levels: [
      { level_id: 'low', position: 0, description: 'Low.' },
      { level_id: 'medium', position: 1, description: 'Medium.' },
      { level_id: 'high', position: 2, description: 'High.' }
    ],
    schema_digest: ZERO
  };
  item.schema_digest = computeBoundedDecisionQuestionSchemaDigest(item);
  return item;
}

function observation(p, q, value, overrides = {}) {
  let answer;
  let probability_evidence;
  if (q.question_kind === 'binary-probability') {
    answer = { kind: 'binary-probability', p_true: value };
    probability_evidence = null;
  } else if (q.question_kind === 'choice') {
    answer = { kind: 'choice', selected_option_id: value };
    probability_evidence = value === 'target'
      ? [{ option_id: 'target', probability: 0.9 }, { option_id: 'other', probability: 0.1 }]
      : [{ option_id: 'target', probability: 0.1 }, { option_id: 'other', probability: 0.9 }];
  } else {
    answer = { kind: 'score', score: value };
    const high = value / 2;
    const medium = 0;
    probability_evidence = [
      { level_id: 'low', position: 0, probability: 1 - high },
      { level_id: 'medium', position: 1, probability: medium },
      { level_id: 'high', position: 2, probability: high }
    ];
  }
  return normalizeBoundedDecisionProviderResult({
    observation_id: `bounded.observation.interpret.${overrides.suffix ?? 'one'}.v1`,
    state_digest: B,
    state_classification: 'internal',
    observed_at: overrides.observed_at ?? '2026-09-15T21:55:00.000Z',
    latency_ms: 12,
    answer,
    probability_evidence,
    provider_confidence: 0.91,
    usage_evidence: {
      input_units: 100,
      output_units: 2,
      compute_class: null,
      provider_report_ref: null
    },
    calibration_report_ref: overrides.calibration_report_ref ?? 'bounded.calibration.interpret.v1',
    transport_evidence_ref: 'transport.interpret.v1'
  }, p, q);
}

function calibration(p, questions, overrides = {}) {
  const item = {
    schema: 'axiom-bounded-decision-calibration-report.v0',
    version: 0,
    status: 'inert-bounded-decision-calibration',
    calibration_report_id: 'bounded.calibration.interpret.v1',
    provider_profile_digest: boundedDecisionProviderProfileDigest(p),
    offering_version_or_revision: p.offering_version_or_revision,
    offering_revision_evidence: p.offering_revision_evidence,
    question_schema_family_refs: questions.map(q => ({
      question_schema_id: q.question_schema_id,
      question_schema_digest: q.schema_digest
    })),
    domain: 'bounded-interpretation-domain',
    population_description: 'Reviewed interpretation test population.',
    evaluation_period: {
      from: '2026-09-14T00:00:00.000Z',
      to: '2026-09-15T18:00:00.000Z'
    },
    sample_count: 500,
    outcome_source_refs: [
      {
        outcome_ref: 'outcome.interpretation.v1',
        outcome_digest: C,
        source_class: 'deterministic-checker'
      }
    ],
    metrics: [{ metric_id: 'calibration-error', value: 0.03 }],
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

function policy(q, overrides = {}) {
  return {
    required_schema_digests: [q.schema_digest],
    maximum_observation_age_ms: 60 * 60 * 1000,
    minimum_calibration_state: 'reviewed',
    minimum_sample_count: 100,
    allowed_provider_profiles: ['bounded.provider.interpret.v1'],
    allowed_revision_evidence: ['provider-versioned', 'exact-artifact'],
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

const NOW = '2026-09-15T22:00:00.000Z';

function interpret(observations, calibrationReports, itemPolicy) {
  return interpretBoundedDecisionEvidence({
    observations,
    calibrationReports,
    policy: itemPolicy,
    now: NOW
  });
}

function clone(value) { return structuredClone(value); }

test('accepts fresh calibrated evidence that satisfies explicit probability predicates', () => {
  const p = profile();
  const q = binaryQuestion();
  const o = observation(p, q, 0.9);
  const c = calibration(p, [q]);
  const result = interpret([o], [c], policy(q));

  assert.equal(result.status, 'accepted-evidence');
  assert.deepEqual(result.observation_ids, [o.observation_id]);
  assert.deepEqual(result.calibration_report_ids, [c.calibration_report_id]);
  assert.deepEqual(result.reason_codes, []);
  assert.equal(result.fallback_route, 'deliberative-review');
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.assurance_effect, 'none');
  assert.equal(result.execution_effect, 'none');
  assert.equal(Object.hasOwn(result, 'allow'), false);
  assert.equal(Object.hasOwn(result, 'authorized'), false);
  assert.equal(Object.isFrozen(result), true);
});

test('marks required evidence stale without converting staleness into an authority decision', () => {
  const p = profile();
  const q = binaryQuestion();
  const stale = observation(p, q, 0.9, {
    observed_at: '2026-09-15T20:00:00.000Z'
  });
  const result = interpret([stale], [calibration(p, [q])], policy(q));
  assert.equal(result.status, 'stale-evidence');
  assert.ok(result.reason_codes.includes('observation-stale'));
  assert.equal(result.execution_effect, 'none');
});

test('preserves materially conflicting observations instead of averaging them away', () => {
  const p = profile();
  const q = binaryQuestion();
  const high = observation(p, q, 0.9, { suffix: 'high' });
  const low = observation(p, q, 0.1, { suffix: 'low' });
  const result = interpret([high, low], [calibration(p, [q])], policy(q));
  assert.equal(result.status, 'conflicting-evidence');
  assert.ok(result.reason_codes.includes('predicate-disagreement'));
});

test('requires calibration when policy requests it and accepts none when policy explicitly does not', () => {
  const p = profile();
  const q = binaryQuestion();
  const o = observation(p, q, 0.9, { calibration_report_ref: null });

  const missing = interpret([o], [], policy(q));
  assert.equal(missing.status, 'insufficient-evidence');
  assert.ok(missing.reason_codes.includes('calibration-missing'));

  const noCalibration = interpret([o], [], policy(q, {
    minimum_calibration_state: 'none',
    minimum_sample_count: 0
  }));
  assert.equal(noCalibration.status, 'accepted-evidence');
});

test('invalid observation or calibration self-digests become invalid-evidence rather than exceptions', () => {
  const p = profile();
  const q = binaryQuestion();
  const o = observation(p, q, 0.9);
  const c = calibration(p, [q]);

  const badObservation = clone(o);
  badObservation.latency_ms += 1;
  let result = interpret([badObservation], [c], policy(q));
  assert.equal(result.status, 'invalid-evidence');
  assert.ok(result.reason_codes.includes('observation-invalid'));

  const badCalibration = clone(c);
  badCalibration.sample_count += 1;
  result = interpret([o], [badCalibration], policy(q));
  assert.equal(result.status, 'invalid-evidence');
  assert.ok(result.reason_codes.includes('calibration-invalid'));
});

test('reviewed calibration fails sufficiency when expired rejected undersampled or mismatched', () => {
  const p = profile();
  const q = binaryQuestion();
  const o = observation(p, q, 0.9);

  const cases = [
    [calibration(p, [q], { review_state: 'expired' }), 'calibration-not-reviewed'],
    [calibration(p, [q], { review_state: 'rejected' }), 'calibration-not-reviewed'],
    [calibration(p, [q], { sample_count: 10 }), 'calibration-sample-count'],
    [calibration(p, [q], { valid_until: '2026-09-15T21:59:59.000Z' }), 'calibration-expired']
  ];
  for (const [c, reason] of cases) {
    c.report_digest = computeBoundedDecisionCalibrationReportDigest(c);
    const result = interpret([o], [c], policy(q));
    assert.equal(result.status, 'insufficient-evidence');
    assert.ok(result.reason_codes.includes(reason));
  }

  const wrongProfile = calibration(p, [q]);
  wrongProfile.provider_profile_digest = A;
  wrongProfile.report_digest = computeBoundedDecisionCalibrationReportDigest(wrongProfile);
  let result = interpret([o], [wrongProfile], policy(q));
  assert.equal(result.status, 'insufficient-evidence');
  assert.ok(result.reason_codes.includes('calibration-profile-mismatch'));

  const wrongSchema = calibration(p, [q]);
  wrongSchema.question_schema_family_refs[0].question_schema_digest = A;
  wrongSchema.report_digest = computeBoundedDecisionCalibrationReportDigest(wrongSchema);
  result = interpret([o], [wrongSchema], policy(q));
  assert.equal(result.status, 'insufficient-evidence');
  assert.ok(result.reason_codes.includes('calibration-schema-mismatch'));
});

test('revision policy rejects mutable aliases when reproducible revision evidence is required', () => {
  const p = profile({
    offering_version_or_revision: 'model-latest',
    offering_revision_evidence: 'mutable-alias',
    calibration_claim: 'local-experimental'
  });
  const q = binaryQuestion();
  const o = observation(p, q, 0.9);
  const c = calibration(p, [q], {
    offering_version_or_revision: 'model-latest',
    offering_revision_evidence: 'mutable-alias',
    review_state: 'experimental'
  });
  c.report_digest = computeBoundedDecisionCalibrationReportDigest(c);

  const result = interpret([o], [c], policy(q, {
    minimum_calibration_state: 'experimental',
    allowed_revision_evidence: ['provider-versioned', 'exact-artifact']
  }));
  assert.equal(result.status, 'insufficient-evidence');
  assert.ok(result.reason_codes.includes('revision-evidence-ineligible'));
});

test('supports choice and score predicates as deterministic evidence tests', () => {
  const p = profile();
  const cq = choiceQuestion();
  const sq = scoreQuestion();
  const co = observation(p, cq, 'target', { suffix: 'choice' });
  const so = observation(p, sq, 1.6, { suffix: 'score' });
  const c = calibration(p, [cq, sq]);

  const itemPolicy = {
    required_schema_digests: [cq.schema_digest, sq.schema_digest],
    maximum_observation_age_ms: 60 * 60 * 1000,
    minimum_calibration_state: 'reviewed',
    minimum_sample_count: 100,
    allowed_provider_profiles: [p.profile_id],
    allowed_revision_evidence: ['provider-versioned'],
    probability_predicates: [
      {
        kind: 'choice-min-probability',
        question_schema_digest: cq.schema_digest,
        option_id: 'target',
        threshold: 0.8
      },
      {
        kind: 'score-min',
        question_schema_digest: sq.schema_digest,
        threshold: 1.5
      },
      {
        kind: 'score-max',
        question_schema_digest: sq.schema_digest,
        threshold: 1.8
      }
    ],
    disagreement_rule: 'require-unanimity',
    fallback_route: 'human-review'
  };

  const result = interpret([co, so], [c], itemPolicy);
  assert.equal(result.status, 'accepted-evidence');
  assert.equal(result.fallback_route, 'human-review');
});

test('policy validation is closed and cannot encode authority assurance or arbitrary predicate types', () => {
  const q = binaryQuestion();
  const valid = policy(q);
  assert.equal(validateBoundedDecisionInterpretationPolicy(valid).valid, true);

  for (const mutate of [
    item => { item.allow = true; },
    item => { item.required_assurance = 'A3'; },
    item => { item.probability_predicates[0].kind = 'execute-if-confident'; },
    item => { item.minimum_calibration_state = 'perfect'; },
    item => { item.disagreement_rule = 'average'; },
    item => { item.fallback_route = 'execute'; },
    item => { item.maximum_observation_age_ms = -1; },
    item => { item.allowed_revision_evidence = ['magic']; }
  ]) {
    const changed = clone(valid);
    mutate(changed);
    assert.throws(
      () => validateBoundedDecisionInterpretationPolicy(changed),
      /unknown|assurance|predicate|calibration|disagreement|fallback|age|revision|invalid/i
    );
  }
});
