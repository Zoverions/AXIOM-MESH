import assert from 'node:assert/strict';
import test from 'node:test';

import { ValidationError } from '../src/lib/canonical.mjs';
import {
  assertPopulationBoundedIncidentRate,
  bindBehavioralProfileIncidentEvidence,
  validateModelBehaviorIncident
} from '../src/lib/model-behavior-incident.mjs';
import { A, B, C, D, E, F, ZERO, baseIncident } from './model-behavior-incident-fixtures.mjs';

function profileWithDigestEvidence(incidentDigests) {
  const item = {
    schema: 'axiom-behavioral-assurance-profile.v0',
    version: 0,
    status: 'inert-behavioral-assurance-evidence',
    profile_id: 'behavior.profile.synthetic.mbi.bind.v1',
    subject: {
      subject_kind: 'agent-harness',
      subject_id: 'runtime.synthetic.mbi.bind.v1',
      subject_digest: A,
      provider_model_revision: 'fixture-model-mbi-bind',
      binding_strength: 'exact-artifact',
      instruction_policy_digest: B,
      context_memory_policy_digest: C,
      tool_policy_digest: D,
      sampling_configuration_digest: E,
      environment_harness_digest: F
    },
    populations: [{
      population_id: 'population.synthetic.mbi.bind.v1',
      population_digest: A,
      domain: 'synthetic-agent-boundary-evaluation',
      task_family: 'bounded-adversarial-behavior-check',
      consequence_class: 'informational',
      evaluation_period: {
        from: '2026-09-01T00:00:00.000Z',
        to: '2026-09-15T00:00:00.000Z'
      },
      sample_count: 200,
      minimum_sample_count: 100,
      sample_sufficiency: 'sufficient',
      inclusion_criteria: ['synthetic offline evaluation case'],
      exclusion_criteria: ['live provider or third-party effect'],
      verification_sources: [{
        source_id: 'checker.synthetic.mbi.bind.v1',
        source_digest: B,
        source_class: 'deterministic-checker',
        independence_group: 'checker-lineage-mbi'
      }],
      rubric_refs: [{
        rubric_id: 'rubric.synthetic.mbi.bind.v1',
        rubric_digest: C
      }],
      dimensions: [{
        dimension_id: 'privacy-egress-discipline',
        evidence_state: 'accepted-evidence',
        metric_kind: 'rate',
        value: incidentDigests.length / 200,
        sample_count: 200,
        calibration_ref: null,
        calibration_digest: null,
        calibration_state: 'not-applicable'
      }],
      incident_events: [{
        event_class: 'public-upload-egress-workaround',
        count: incidentDigests.length,
        evidence_refs: incidentDigests
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
  // Bind helper is fail-closed on incident digests only; profile digest is opaque here.
  item.profile_digest = A;
  return item;
}

test('composition binds profile evidence_refs digests to exact incident artifacts', () => {
  const incident = baseIncident({
    incident_id: 'mbi.composition.bind.v1',
    behavior_classes: ['public-upload-egress-workaround'],
    evidence_refs: [{
      ref_id: 'evidence.composition.bind.v1',
      digest: D,
      kind: 'checker-output',
      authority_effect: 'none'
    }]
  });
  validateModelBehaviorIncident(incident);
  const profile = profileWithDigestEvidence([incident.incident_digest]);
  const bound = bindBehavioralProfileIncidentEvidence(profile, [incident]);
  assert.equal(bound.valid, true);
  assert.equal(bound.authority_effect, 'none');
  assert.equal(bound.bound_incidents.length, 1);
  assert.equal(bound.bound_incidents[0].incident_id, incident.incident_id);
  assert.equal(bound.bound_incidents[0].evidence_digest, incident.incident_digest);
});

test('composition fails closed on missing or mismatched incident digest', () => {
  const incident = baseIncident({
    incident_id: 'mbi.composition.mismatch.v1',
    evidence_refs: [{
      ref_id: 'evidence.composition.mismatch.v1',
      digest: E,
      kind: 'artifact',
      authority_effect: 'none'
    }]
  });
  const profile = profileWithDigestEvidence([A]);
  assert.throws(
    () => bindBehavioralProfileIncidentEvidence(profile, [incident]),
    /missing incident artifact/i
  );
  assert.throws(
    () => bindBehavioralProfileIncidentEvidence(profile, []),
    /missing incident artifact/i
  );
});

test('opaque non-digest evidence_refs remain unbound placeholders without error', () => {
  const profile = profileWithDigestEvidence(['incident.synthetic.placeholder.1']);
  const bound = bindBehavioralProfileIncidentEvidence(profile, []);
  assert.equal(bound.valid, true);
  assert.equal(bound.bound_incidents.length, 0);
});

test('one population-bounded rate fixture refuses universal prevalence claims', () => {
  const rate = assertPopulationBoundedIncidentRate({
    count: 4,
    population_size: 400,
    population_id: 'population.synthetic.collaboration-widening.v1',
    population_digest: F
  });
  assert.equal(rate.refuses_universal_prevalence, true);
  assert.equal(rate.universal_prevalence_claim, false);
  assert.equal(rate.authority_effect, 'none');
  assert.equal(Object.hasOwn(rate, 'global_probability'), false);
});
