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

const INCIDENT_CASES = Object.freeze([
  {
    runtimeId: 'runtime.synthetic.credential-boundary.v1',
    eventClass: 'unauthorized-credential-use',
    dimensionId: 'credential-boundary-discipline',
    count: 2,
    sampleCount: 200
  },
  {
    runtimeId: 'runtime.synthetic.public-upload.v1',
    eventClass: 'public-upload-egress-workaround',
    dimensionId: 'privacy-egress-discipline',
    count: 3,
    sampleCount: 300
  },
  {
    runtimeId: 'runtime.synthetic.shared-artifact-state.v1',
    eventClass: 'shared-state-cross-agent-communication',
    dimensionId: 'cross-agent-shared-state-discipline',
    count: 1,
    sampleCount: 250
  },
  {
    runtimeId: 'runtime.synthetic.collaboration-widening.v1',
    eventClass: 'broken-collaboration-channel-widening',
    dimensionId: 'privacy-egress-discipline',
    count: 4,
    sampleCount: 400
  }
]);

function incidentProfile(fixture, index) {
  const digests = [A, B, C, D, E, F];
  const incidentRefs = Array.from(
    { length: fixture.count },
    (_, evidenceIndex) => `incident.synthetic.${index + 1}.${evidenceIndex + 1}`
  );
  const item = {
    schema: 'axiom-behavioral-assurance-profile.v0',
    version: 0,
    status: 'inert-behavioral-assurance-evidence',
    profile_id: `behavior.profile.synthetic.incident.${index + 1}.v1`,
    subject: {
      subject_kind: 'agent-harness',
      subject_id: fixture.runtimeId,
      subject_digest: digests[index % digests.length],
      provider_model_revision: `fixture-model-r${index + 1}`,
      binding_strength: 'exact-artifact',
      instruction_policy_digest: B,
      context_memory_policy_digest: C,
      tool_policy_digest: D,
      sampling_configuration_digest: E,
      environment_harness_digest: digests[(index + 1) % digests.length]
    },
    populations: [{
      population_id: `population.synthetic.incident.${index + 1}.v1`,
      population_digest: digests[(index + 2) % digests.length],
      domain: 'synthetic-agent-boundary-evaluation',
      task_family: 'bounded-adversarial-behavior-check',
      consequence_class: 'informational',
      evaluation_period: {
        from: '2026-09-01T00:00:00.000Z',
        to: '2026-09-15T00:00:00.000Z'
      },
      sample_count: fixture.sampleCount,
      minimum_sample_count: 100,
      sample_sufficiency: 'sufficient',
      inclusion_criteria: ['synthetic offline evaluation case with independently checked outcome'],
      exclusion_criteria: ['live provider or third-party effect'],
      verification_sources: [{
        source_id: `checker.synthetic.boundary.${index + 1}.v1`,
        source_digest: digests[(index + 3) % digests.length],
        source_class: 'deterministic-checker',
        independence_group: `checker-lineage-${index + 1}`
      }],
      rubric_refs: [{
        rubric_id: `rubric.synthetic.boundary.${index + 1}.v1`,
        rubric_digest: digests[(index + 4) % digests.length]
      }],
      dimensions: [{
        dimension_id: fixture.dimensionId,
        evidence_state: 'accepted-evidence',
        metric_kind: 'rate',
        value: fixture.count / fixture.sampleCount,
        sample_count: fixture.sampleCount,
        calibration_ref: null,
        calibration_digest: null,
        calibration_state: 'not-applicable'
      }],
      incident_events: [{
        event_class: fixture.eventClass,
        count: fixture.count,
        evidence_refs: incidentRefs
      }],
      known_limitations: [
        'Synthetic offline fixture only.',
        'Observed incidence is bounded to this named population and is not a universal failure probability.'
      ],
      distribution_shift_notes: []
    }],
    created_at: '2026-09-16T22:00:00.000Z',
    valid_until: '2026-10-16T22:00:00.000Z',
    profile_digest: ZERO,
    authority_effect: 'none',
    assurance_effect: 'evidence-only',
    network_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false,
    selection_effect: 'evidence-only'
  };
  item.profile_digest = computeBehavioralAssuranceProfileDigest(item);
  return item;
}

test('synthetic incident profiles map distinct #1599-style failure patterns without authority', () => {
  const profiles = INCIDENT_CASES.map(incidentProfile);
  assert.ok(profiles.length >= 3);

  for (let index = 0; index < profiles.length; index += 1) {
    const fixture = INCIDENT_CASES[index];
    const profile = profiles[index];
    const validated = validateBehavioralAssuranceProfile(profile);
    const population = findBehavioralPopulation(profile, profile.populations[0].population_id);
    const event = population.incident_events[0];
    const dimension = population.dimensions[0];

    assert.equal(validated.valid, true);
    assert.equal(profile.subject.subject_id, fixture.runtimeId);
    assert.equal(event.event_class, fixture.eventClass);
    assert.equal(event.count, fixture.count);
    assert.equal(event.evidence_refs.length, fixture.count);
    assert.equal(dimension.metric_kind, 'rate');
    assert.equal(dimension.value, fixture.count / fixture.sampleCount);
    assert.equal(Object.hasOwn(event, 'probability'), false);
    assert.equal(validated.authority_effect, 'none');
    assert.equal(validated.assurance_effect, 'evidence-only');
    assert.equal(validated.runtime_activation, false);
    assert.equal(Object.hasOwn(validated, 'allow'), false);
    assert.equal(Object.hasOwn(validated, 'authorized'), false);
  }
});

test('incident rates remain population-bounded observations rather than universal prevalence claims', () => {
  const profile = incidentProfile(INCIDENT_CASES[2], 2);
  const population = findBehavioralPopulation(profile, profile.populations[0].population_id);
  const event = population.incident_events[0];
  const dimension = population.dimensions[0];

  assert.equal(event.count, 1);
  assert.equal(dimension.metric_kind, 'rate');
  assert.equal(dimension.calibration_state, 'not-applicable');
  assert.equal(Object.hasOwn(population, 'global_probability'), false);
  assert.equal(Object.hasOwn(population, 'universal_prevalence'), false);
  assert.ok(population.known_limitations.some(item => /not a universal failure probability/i.test(item)));
});

test('credential, egress, shared-state, and collaboration incidents remain separate behavior classes', () => {
  const observed = new Set(INCIDENT_CASES.map(item => item.eventClass));
  assert.deepEqual(observed, new Set([
    'unauthorized-credential-use',
    'public-upload-egress-workaround',
    'shared-state-cross-agent-communication',
    'broken-collaboration-channel-widening'
  ]));
});
