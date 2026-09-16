import assert from 'node:assert/strict';
import test from 'node:test';

import {
  computeBehavioralAssuranceProfileDigest,
  findBehavioralPopulation,
  validateBehavioralAssuranceProfile
} from '../src/lib/behavioral-assurance-profile.mjs';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);
const D = 'd'.repeat(64);
const E = 'e'.repeat(64);
const F = 'f'.repeat(64);
const ZERO = '0'.repeat(64);

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

function clone(value) {
  return structuredClone(value);
}

test('validates a content-addressed exact-harness behavioral assurance profile', () => {
  const item = profile();
  const result = validateBehavioralAssuranceProfile(item);

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
    item.profile_digest = computeBehavioralAssuranceProfileDigest(item);
    assert.throws(
      () => validateBehavioralAssuranceProfile(item),
      /probability.*calibration|calibration.*probability/i
    );
  }
});

test('requires sample sufficiency state to match the declared sample threshold', () => {
  const tooSmall = profile();
  tooSmall.populations[0].sample_count = 10;
  tooSmall.populations[0].dimensions[0].sample_count = 10;
  tooSmall.populations[0].dimensions[1].sample_count = 10;
  tooSmall.profile_digest = computeBehavioralAssuranceProfileDigest(tooSmall);
  assert.throws(() => validateBehavioralAssuranceProfile(tooSmall), /sample_sufficiency|minimum_sample_count/);

  const explicitInsufficient = clone(tooSmall);
  explicitInsufficient.populations[0].sample_sufficiency = 'insufficient';
  explicitInsufficient.profile_digest = computeBehavioralAssuranceProfileDigest(explicitInsufficient);
  assert.equal(validateBehavioralAssuranceProfile(explicitInsufficient).valid, true);
});

test('rejects raw prompt response reasoning personal-data and authority-shaped fields', () => {
  for (const field of ['raw_prompt', 'raw_response', 'chain_of_thought', 'personal_data', 'authorized']) {
    const item = profile();
    item[field] = field === 'authorized' ? true : 'sensitive';
    assert.throws(() => computeBehavioralAssuranceProfileDigest(item), /unknown field/i);
  }
});

test('rejects self-digest mutation and any boundary widening', () => {
  const item = profile();
  const mutated = clone(item);
  mutated.populations[0].dimensions[1].value = 0.5;
  assert.throws(() => validateBehavioralAssuranceProfile(mutated), /digest mismatch/i);

  for (const [field, value] of [
    ['authority_effect', 'allow'],
    ['assurance_effect', 'authorizing'],
    ['network_effect', 'egress'],
    ['credential_visibility', 'visible'],
    ['runtime_activation', true],
    ['selection_effect', 'select-and-run']
  ]) {
    const widened = profile({ [field]: value });
    assert.throws(() => computeBehavioralAssuranceProfileDigest(widened), /boundary effect|effect is invalid/i);
  }
});

test('keeps a single incident as bounded event evidence rather than a universal probability', () => {
  const item = profile();
  item.populations[0].incident_events = [
    {
      event_class: 'self-authored-summary-instruction',
      count: 1,
      evidence_refs: ['incident.single.observation']
    }
  ];
  item.profile_digest = computeBehavioralAssuranceProfileDigest(item);
  const result = validateBehavioralAssuranceProfile(item);
  assert.equal(result.valid, true);
  const event = findBehavioralPopulation(item, 'population.research.qa.v1').incident_events[0];
  assert.equal(event.count, 1);
  assert.equal(Object.hasOwn(event, 'probability'), false);
});
