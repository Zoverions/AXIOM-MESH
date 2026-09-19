import assert from 'node:assert/strict';
import test from 'node:test';

import {
  bindBehavioralAssuranceProbabilityCalibrations,
  computeBehavioralAssuranceProfileDigest,
  findBehavioralPopulation,
  resolveBehavioralAssuranceProfile,
  validateBehavioralAssuranceProfile
} from '../src/lib/behavioral-assurance-profile.mjs';
import {
  computeBoundedDecisionCalibrationReportDigest
} from '../src/lib/bounded-decision-calibration-report.mjs';
import {
  boundedDecisionProviderProfileDigest
} from '../src/lib/bounded-decision-provider-profile.mjs';
import {
  computeBoundedDecisionQuestionSchemaDigest
} from '../src/lib/bounded-decision-question-schema.mjs';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);
const D = 'd'.repeat(64);
const E = 'e'.repeat(64);
const F = 'f'.repeat(64);
const G = '1'.repeat(64);
const H = '2'.repeat(64);
const ZERO = '0'.repeat(64);

function providerProfile() {
  return {
    schema: 'axiom-bounded-decision-provider-profile.v0',
    version: 0,
    status: 'inert-bounded-decision-metadata',
    profile_id: 'bounded.provider.behavior.v1',
    catalog_entry_id: 'provider:behavior-calibration',
    catalog_entry_version: '0.1.0',
    catalog_entry_digest: A,
    offering_ref: 'model.behavior.calibration',
    offering_version_or_revision: 'model.behavior.calibration-2026-09-16',
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
    assurance_effect: 'none'
  };
}

function question(domain = 'research-question-answering') {
  const document = {
    schema: 'axiom-bounded-decision-question-schema.v0',
    version: 0,
    status: 'inert-bounded-decision-question-schema',
    question_schema_id: 'bounded.question.behavior.choice.v1',
    question_kind: 'choice',
    instructions: 'Choose the bounded class best supported by state.',
    purpose: 'calibration-evidence',
    domain,
    state_contract_ref: 'state.contract.behavior.v1',
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

function calibrationFor(profileDocument, overrides = {}) {
  const provider = providerProfile();
  const q = question(profileDocument.populations[0].domain);
  const population = profileDocument.populations[0];
  const document = {
    schema: 'axiom-bounded-decision-calibration-report.v0',
    version: 0,
    status: 'inert-bounded-decision-calibration',
    calibration_report_id: 'calibration.source-fidelity.v1',
    provider_profile_digest: boundedDecisionProviderProfileDigest(provider),
    offering_version_or_revision: provider.offering_version_or_revision,
    offering_revision_evidence: provider.offering_revision_evidence,
    question_schema_family_refs: [{
      question_schema_id: q.question_schema_id,
      question_schema_digest: q.schema_digest
    }],
    domain: population.domain,
    population_description: 'Reviewed source-grounded research QA population matching the behavioral profile.',
    evaluation_period: {
      from: population.evaluation_period.from,
      to: population.evaluation_period.to
    },
    sample_count: 500,
    outcome_source_refs: [
      {
        outcome_ref: 'outcome.behavior.independent.set.v1',
        outcome_digest: G,
        source_class: 'deterministic-checker'
      },
      {
        outcome_ref: 'outcome.behavior.independent.review.v1',
        outcome_digest: H,
        source_class: 'human-adjudication'
      }
    ],
    metrics: [
      { metric_id: 'brier-score', value: 0.08 },
      { metric_id: 'calibration-error', value: 0.03 }
    ],
    known_limitations: ['Fixture calibration only.'],
    distribution_shift_notes: [],
    created_at: '2026-09-16T21:00:00.000Z',
    valid_until: '2026-10-16T22:00:00.000Z',
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

function profile(overrides = {}) {
  const item = {
    schema: 'axiom-behavioral-assurance-profile.v0',
    version: 0,
    status: 'inert-behavioral-assurance-evidence',
    profile_id: 'behavior.profile.example.v1',
    subject: {
      subject_kind: 'agent-harness',
      subject_id: 'agent.example.v1',
      subject_digest: A,
      provider_model_revision: 'example-model-2026-09-16',
      binding_strength: 'exact-artifact',
      instruction_policy_digest: B,
      context_memory_policy_digest: C,
      tool_policy_digest: D,
      sampling_configuration_digest: E,
      environment_harness_digest: F
    },
    populations: [
      {
        population_id: 'population.research.qa.v1',
        population_digest: A,
        domain: 'research-question-answering',
        task_family: 'source-grounded-analysis',
        consequence_class: 'informational',
        evaluation_period: {
          from: '2026-09-01T00:00:00.000Z',
          to: '2026-09-15T00:00:00.000Z'
        },
        sample_count: 500,
        minimum_sample_count: 100,
        sample_sufficiency: 'sufficient',
        inclusion_criteria: ['source-grounded tasks with independently checked outcomes'],
        exclusion_criteria: ['tasks with missing ground-truth evidence'],
        verification_sources: [
          {
            source_id: 'deterministic.citation-checker.v1',
            source_digest: B,
            source_class: 'deterministic-checker',
            independence_group: 'checker-lineage-a'
          },
          {
            source_id: 'human.adjudication.panel.v1',
            source_digest: C,
            source_class: 'human-adjudication',
            independence_group: 'human-panel-a'
          }
        ],
        rubric_refs: [
          {
            rubric_id: 'rubric.source-fidelity.v1',
            rubric_digest: D
          }
        ],
        dimensions: [
          {
            dimension_id: 'source-provenance-fidelity',
            evidence_state: 'accepted-evidence',
            metric_kind: 'probability',
            value: 0.94,
            sample_count: 500,
            calibration_ref: 'calibration.source-fidelity.v1',
            calibration_digest: E,
            calibration_state: 'reviewed'
          },
          {
            dimension_id: 'fabricated-source-data-incidence',
            evidence_state: 'accepted-evidence',
            metric_kind: 'rate',
            value: 0.02,
            sample_count: 500,
            calibration_ref: null,
            calibration_digest: null,
            calibration_state: 'not-applicable'
          }
        ],
        incident_events: [
          {
            event_class: 'fabricated-unavailable-source-data',
            count: 2,
            evidence_refs: ['incident.synthetic.1', 'incident.synthetic.2']
          }
        ],
        known_limitations: ['Synthetic fixture only.'],
        distribution_shift_notes: []
      }
    ],
    created_at: '2026-09-16T22:00:00.000Z',
    valid_until: '2026-10-16T22:00:00.000Z',
    profile_digest: ZERO,
    authority_effect: 'none',
    assurance_effect: 'evidence-only',
    network_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false,
    selection_effect: 'evidence-only',
    ...overrides
  };
  item.profile_digest = computeBehavioralAssuranceProfileDigest(item);
  return item;
}

function withBoundCalibration(item) {
  const report = calibrationFor(item);
  item.populations[0].dimensions[0].calibration_ref = report.calibration_report_id;
  item.populations[0].dimensions[0].calibration_digest = report.report_digest;
  item.profile_digest = computeBehavioralAssuranceProfileDigest(item);
  return { item, reports: [report] };
}

function clone(value) {
  return structuredClone(value);
}

test('validates a content-addressed exact-harness behavioral assurance profile', () => {
  const { item, reports } = withBoundCalibration(profile());
  const result = validateBehavioralAssuranceProfile(item, { calibrationReports: reports });

  assert.equal(result.valid, true);
  assert.equal(result.profile_id, item.profile_id);
  assert.equal(result.profile_digest, item.profile_digest);
  assert.equal(result.subject_kind, 'agent-harness');
  assert.equal(result.binding_strength, 'exact-artifact');
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.assurance_effect, 'evidence-only');
  assert.equal(result.runtime_activation, false);
  assert.equal(Object.hasOwn(result, 'authorized'), false);
  assert.equal(Object.hasOwn(result, 'allow'), false);
  assert.equal(Object.isFrozen(result), true);

  const population = findBehavioralPopulation(item, 'population.research.qa.v1');
  assert.equal(population.domain, 'research-question-answering');
  assert.equal(population.sample_sufficiency, 'sufficient');
  assert.equal(Object.isFrozen(population), true);
});

test('rejects probability semantics without reviewed matching calibration evidence', () => {
  for (const mutation of [
    dimension => { dimension.calibration_ref = null; dimension.calibration_digest = null; },
    dimension => { dimension.calibration_state = 'experimental'; },
    dimension => { dimension.calibration_state = 'not-applicable'; }
  ]) {
    const item = profile();
    const dimension = item.populations[0].dimensions[0];
    mutation(dimension);
    assert.throws(
      () => computeBehavioralAssuranceProfileDigest(item),
      /probability.*calibration|calibration.*probability/i
    );
  }
});

test('probability semantics require a bound #1588 calibration with independent outcomes', () => {
  const item = profile();
  assert.throws(
    () => validateBehavioralAssuranceProfile(item),
    /probability.*#1588|probability.*calibration reports/i
  );

  const { item: bound, reports } = withBoundCalibration(item);
  const resolved = resolveBehavioralAssuranceProfile(bound, reports, {
    now: '2026-09-16T23:00:00.000Z'
  });
  assert.equal(resolved.valid, true);
  assert.equal(resolved.bound_probability_calibrations.length, 1);
  assert.equal(
    resolved.bound_probability_calibrations[0].calibration_report_id,
    'calibration.source-fidelity.v1'
  );

  const mismatchedDomain = calibrationFor(bound, { domain: 'other-domain' });
  assert.throws(
    () => bindBehavioralAssuranceProbabilityCalibrations(bound, [mismatchedDomain], {
      now: '2026-09-16T23:00:00.000Z'
    }),
    /domain|population/i
  );

  const expired = calibrationFor(bound, { valid_until: '2026-09-16T22:00:00.000Z' });
  bound.populations[0].dimensions[0].calibration_digest = expired.report_digest;
  bound.profile_digest = computeBehavioralAssuranceProfileDigest(bound);
  assert.throws(
    () => bindBehavioralAssuranceProbabilityCalibrations(bound, [expired], {
      now: '2026-09-16T22:00:00.000Z'
    }),
    /expired/i
  );

  const dependent = calibrationFor(bound);
  dependent.outcome_source_refs = [{
    outcome_ref: bound.subject.subject_id,
    outcome_digest: bound.subject.subject_digest,
    source_class: 'independent-verifier'
  }];
  dependent.report_digest = computeBoundedDecisionCalibrationReportDigest(dependent);
  bound.populations[0].dimensions[0].calibration_digest = dependent.report_digest;
  bound.profile_digest = computeBehavioralAssuranceProfileDigest(bound);
  assert.throws(
    () => bindBehavioralAssuranceProbabilityCalibrations(bound, [dependent], {
      now: '2026-09-16T23:00:00.000Z'
    }),
    /independently sourced|independent/i
  );
});

test('requires sample sufficiency state to match the declared sample threshold', () => {
  const tooSmall = profile();
  tooSmall.populations[0].sample_count = 10;
  tooSmall.populations[0].dimensions[0].sample_count = 10;
  tooSmall.populations[0].dimensions[1].sample_count = 10;
  assert.throws(
    () => computeBehavioralAssuranceProfileDigest(tooSmall),
    /sample_sufficiency|minimum_sample_count/
  );

  const explicitInsufficient = profile();
  explicitInsufficient.populations[0].sample_count = 10;
  explicitInsufficient.populations[0].minimum_sample_count = 100;
  explicitInsufficient.populations[0].sample_sufficiency = 'insufficient';
  explicitInsufficient.populations[0].dimensions[0].sample_count = 10;
  explicitInsufficient.populations[0].dimensions[1].sample_count = 10;
  const { item, reports } = withBoundCalibration(explicitInsufficient);
  assert.equal(validateBehavioralAssuranceProfile(item, { calibrationReports: reports }).valid, true);
});

test('rejects raw prompt response reasoning personal-data and authority-shaped fields', () => {
  for (const field of ['raw_prompt', 'raw_response', 'chain_of_thought', 'personal_data', 'authorized']) {
    const item = profile();
    item[field] = field === 'authorized' ? true : 'sensitive';
    assert.throws(() => computeBehavioralAssuranceProfileDigest(item), /unknown field/i);
  }
});

test('rejects self-digest mutation and any boundary widening', () => {
  const { item, reports } = withBoundCalibration(profile());
  const mutated = clone(item);
  mutated.populations[0].dimensions[1].value = 0.5;
  assert.throws(
    () => validateBehavioralAssuranceProfile(mutated, { calibrationReports: reports }),
    /digest mismatch/i
  );

  for (const [field, value] of [
    ['authority_effect', 'allow'],
    ['assurance_effect', 'authorizing'],
    ['network_effect', 'egress'],
    ['credential_visibility', 'visible'],
    ['runtime_activation', true],
    ['selection_effect', 'select-and-run']
  ]) {
    assert.throws(
      () => profile({ [field]: value }),
      /boundary effect|effect is invalid/i
    );
  }
});

test('keeps a single incident as bounded event evidence rather than a universal probability', () => {
  const base = profile();
  base.populations[0].incident_events = [
    {
      event_class: 'self-authored-summary-instruction',
      count: 1,
      evidence_refs: ['incident.single.observation']
    }
  ];
  const { item, reports } = withBoundCalibration(base);
  const result = validateBehavioralAssuranceProfile(item, { calibrationReports: reports });
  assert.equal(result.valid, true);
  const event = findBehavioralPopulation(item, 'population.research.qa.v1').incident_events[0];
  assert.equal(event.count, 1);
  assert.equal(Object.hasOwn(event, 'probability'), false);
});
