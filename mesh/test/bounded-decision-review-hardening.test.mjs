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
  computeBoundedDecisionCalibrationReportDigest,
  resolveBoundedDecisionCalibrationReport
} from '../src/lib/bounded-decision-calibration-report.mjs';
import {
  interpretBoundedDecisionEvidence
} from '../src/lib/bounded-decision-interpretation.mjs';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const ZERO = '0'.repeat(64);
const NOW = '2026-09-15T22:00:00.000Z';

function profile() {
  return {
    schema: 'axiom-bounded-decision-provider-profile.v0',
    version: 0,
    status: 'inert-bounded-decision-metadata',
    profile_id: 'bounded.provider.review.v1',
    catalog_entry_id: 'provider:bounded-review',
    catalog_entry_version: '0.1.0',
    catalog_entry_digest: A,
    offering_ref: 'model.bounded.review',
    offering_version_or_revision: 'model.bounded.review-2026-09-15',
    offering_revision_evidence: 'provider-versioned',
    provider_mode: 'provider-remote',
    supported_question_kinds: ['binary-probability'],
    max_questions_per_request: 16,
    max_choice_cardinality: 8,
    max_score_levels: 8,
    type_guarantee: 'provider-native-closed-set',
    probability_support: 'binary-probability-only',
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
    assurance_effect: 'none'
  };
}

function question() {
  const item = {
    schema: 'axiom-bounded-decision-question-schema.v0',
    version: 0,
    status: 'inert-bounded-decision-question-schema',
    question_schema_id: 'bounded.question.review.v1',
    question_kind: 'binary-probability',
    instructions: 'Estimate whether the bounded condition is supported.',
    purpose: 'review-hardening',
    domain: 'review-domain',
    state_contract_ref: 'state.contract.review.v1',
    known_limitations: [],
    created_at: '2026-09-15T18:10:00.000Z',
    true_meaning: 'The condition is supported.',
    false_meaning: 'The condition is not supported.',
    schema_digest: ZERO
  };
  item.schema_digest = computeBoundedDecisionQuestionSchemaDigest(item);
  return item;
}

function observation(p, q) {
  return normalizeBoundedDecisionProviderResult({
    observation_id: 'bounded.observation.review.v1',
    state_digest: B,
    state_classification: 'internal',
    observed_at: '2026-09-15T21:55:00.000Z',
    latency_ms: 10,
    answer: { kind: 'binary-probability', p_true: 0.95 },
    probability_evidence: null,
    provider_confidence: 0.9,
    usage_evidence: {
      input_units: 10,
      output_units: 1,
      compute_class: null,
      provider_report_ref: null
    },
    calibration_report_ref: 'bounded.calibration.review.v1',
    transport_evidence_ref: null
  }, p, q);
}

function calibration(p, q, overrides = {}) {
  const item = {
    schema: 'axiom-bounded-decision-calibration-report.v0',
    version: 0,
    status: 'inert-bounded-decision-calibration',
    calibration_report_id: 'bounded.calibration.review.v1',
    provider_profile_digest: boundedDecisionProviderProfileDigest(p),
    offering_version_or_revision: p.offering_version_or_revision,
    offering_revision_evidence: p.offering_revision_evidence,
    question_schema_family_refs: [{
      question_schema_id: q.question_schema_id,
      question_schema_digest: q.schema_digest
    }],
    domain: q.domain,
    population_description: 'Reviewed hardening evaluation population.',
    evaluation_period: {
      from: '2026-09-14T00:00:00.000Z',
      to: '2026-09-15T18:00:00.000Z'
    },
    sample_count: 100,
    outcome_source_refs: [{
      outcome_ref: 'outcome.review.v1',
      outcome_digest: 'c'.repeat(64),
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

function policy(p, q) {
  return {
    required_schema_digests: [q.schema_digest],
    maximum_observation_age_ms: 60 * 60 * 1000,
    minimum_calibration_state: 'reviewed',
    minimum_sample_count: 50,
    allowed_provider_profiles: [p.profile_id],
    allowed_revision_evidence: ['provider-versioned'],
    probability_predicates: [{
      kind: 'binary-min-p-true',
      question_schema_digest: q.schema_digest,
      threshold: 0.9
    }],
    disagreement_rule: 'conflict',
    fallback_route: 'deliberative-review'
  };
}

test('normalized observations preserve the exact question domain as bounded evidence', () => {
  const p = profile();
  const q = question();
  const item = observation(p, q);
  assert.equal(item.question_domain, q.domain);
});

test('interpretation rejects calibration whose declared domain disagrees with the bound observation domain', () => {
  const p = profile();
  const q = question();
  const o = observation(p, q);
  const c = calibration(p, q, { domain: 'different-domain' });
  c.report_digest = computeBoundedDecisionCalibrationReportDigest(c);

  const result = interpretBoundedDecisionEvidence({
    observations: [o],
    calibrationReports: [c],
    providerProfiles: [p],
    questionSchemas: [q],
    policy: policy(p, q),
    now: NOW
  });
  assert.equal(result.status, 'invalid-evidence');
  assert.ok(result.reason_codes.includes('calibration-invalid'));
});

test('calibration resolution rejects outcome evidence that aliases provider identity or profile digest', () => {
  const p = profile();
  const q = question();

  const identityAlias = calibration(p, q);
  identityAlias.outcome_source_refs[0].outcome_ref = p.profile_id;
  identityAlias.report_digest = computeBoundedDecisionCalibrationReportDigest(identityAlias);
  assert.throws(
    () => resolveBoundedDecisionCalibrationReport(identityAlias, p, [q]),
    /independent|provider|outcome/i
  );

  const digestAlias = calibration(p, q);
  digestAlias.outcome_source_refs[0].outcome_digest = boundedDecisionProviderProfileDigest(p);
  digestAlias.report_digest = computeBoundedDecisionCalibrationReportDigest(digestAlias);
  assert.throws(
    () => resolveBoundedDecisionCalibrationReport(digestAlias, p, [q]),
    /independent|provider|outcome|digest/i
  );
});
