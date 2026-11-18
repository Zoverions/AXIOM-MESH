import assert from 'node:assert/strict';
import test from 'node:test';

import { ValidationError } from '../src/lib/canonical.mjs';
import {
  MODEL_BEHAVIOR_DISCLOSURE_TRACKS,
  assertAppendOnlySupersession,
  assertPopulationBoundedIncidentRate,
  computeModelBehaviorIncidentDigest,
  validateModelBehaviorIncident
} from '../src/lib/model-behavior-incident.mjs';
import { A, B, C, D, baseIncident } from './model-behavior-incident-fixtures.mjs';

test('valid incident validates with authority_effect none and stable digest', () => {
  const incident = baseIncident();
  const validated = validateModelBehaviorIncident(incident);
  assert.equal(validated.valid, true);
  assert.equal(validated.authority_effect, 'none');
  assert.equal(validated.assurance_effect, 'evidence-only');
  assert.equal(validated.runtime_activation, false);
  assert.equal(validated.network_effect, 'none');
  assert.equal(validated.credential_visibility, 'none');
  assert.equal(Object.hasOwn(validated, 'allow'), false);
  assert.equal(Object.hasOwn(validated, 'authorized'), false);
  assert.equal(incident.incident_digest, computeModelBehaviorIncidentDigest(incident));
});

test('unknown and not-yet-established remain first-class without forcing certainty', () => {
  const incident = baseIncident({
    incident_id: 'mbi.synthetic.unknowns.v1',
    observed_range: {
      from: 'unknown',
      to: 'not-yet-established',
      state: 'unknown'
    },
    discovery_at: 'not-yet-established',
    subject: {
      model_id: 'unknown',
      model_digest: null,
      runtime_id: 'not-yet-established',
      runtime_digest: null,
      build_id: 'unknown',
      provider_id: 'not-yet-established',
      binding_strength: 'unknown'
    },
    lifecycle_stage: 'not-yet-established',
    environment: {
      task_id: 'unknown',
      isolation: 'not-yet-established',
      notes: 'Identifiers deliberately unknown.'
    },
    behavior_classes: ['unknown'],
    uncertainty: {
      causal_explanation: 'unknown',
      open_questions: ['Cause unknown.', 'Frequency not yet established.']
    },
    mitigation: {
      state: 'unknown',
      summary: 'Mitigation unknown.'
    },
    severity_triage: {
      declared_level: 'unknown',
      priority: 'unknown',
      basis: 'triage-evidence-only',
      is_truth_claim: false
    }
  });
  const validated = validateModelBehaviorIncident(incident);
  assert.equal(validated.valid, true);
  assert.equal(incident.uncertainty.causal_explanation, 'unknown');
  assert.equal(incident.severity_triage.is_truth_claim, false);
});

test('disclosure tracks are semantic only and subordinate to SECURITY.md / IR', () => {
  assert.deepEqual([...MODEL_BEHAVIOR_DISCLOSURE_TRACKS], [
    'ready-for-disclosure',
    'minor-investigation',
    'coordinated-slow-investigation'
  ]);
  for (const track of MODEL_BEHAVIOR_DISCLOSURE_TRACKS) {
    const incident = baseIncident({
      incident_id: `mbi.synthetic.disclosure.${track}.v1`,
      disclosure: {
        track,
        state: 'internal-only',
        subordinate_to_security_md: true,
        subordinate_to_incident_response: true,
        automation: 'none'
      },
      evidence_refs: [{
        ref_id: `evidence.disclosure.${track}.v1`,
        digest: D,
        kind: 'checker-output',
        authority_effect: 'none'
      }]
    });
    const validated = validateModelBehaviorIncident(incident);
    assert.equal(validated.disclosure_track, track);
    assert.equal(incident.disclosure.automation, 'none');
  }
});

test('rejects authority-widening fields and digest mismatch', () => {
  const good = baseIncident();
  assert.throws(
    () => validateModelBehaviorIncident({ ...good, authority_effect: 'grant', incident_digest: good.incident_digest }),
    ValidationError
  );
  assert.throws(
    () => validateModelBehaviorIncident({ ...good, incident_digest: A }),
    /digest mismatch/i
  );
  assert.throws(
    () => validateModelBehaviorIncident({ ...good, allow: true }),
    ValidationError
  );
});

test('rejects embedded secrets in public incident artifacts', () => {
  for (const observed_behavior of [
    'Found api_key=sk-test-should-not-embed',
    'Observed credential AKIA1234567890ABCDEF in public evidence.',
    'Observed credential AIza12345678901234567890123456789012345 in public evidence.',
    'Observed credential sk_live_1234567890abcdef in public evidence.'
  ]) {
    assert.throws(
      () => baseIncident({ observed_behavior }),
      /secret|credential/i
    );
  }
});

test('append-only supersession preserves original observation digest', () => {
  const original = baseIncident({
    incident_id: 'mbi.synthetic.original.v1',
    uncertainty: {
      causal_explanation: 'unknown',
      open_questions: ['Cause unknown at observation time.']
    }
  });
  const update = baseIncident({
    incident_id: 'mbi.synthetic.update.v1',
    observed_behavior: 'Later interpretation updated mitigation status only.',
    mitigation: {
      state: 'planned',
      summary: 'Planned documentation-only mitigation.'
    },
    uncertainty: {
      causal_explanation: 'partial',
      open_questions: ['Remaining open questions after update.']
    },
    lineage: {
      supersedes: [{
        incident_id: original.incident_id,
        incident_digest: original.incident_digest
      }],
      updates: [],
      superseded_by: null
    },
    evidence_refs: [{
      ref_id: 'evidence.synthetic.update.v1',
      digest: B,
      kind: 'artifact',
      authority_effect: 'none'
    }]
  });
  const result = assertAppendOnlySupersession(original, update);
  assert.equal(result.original_preserved, true);
  assert.equal(result.authority_effect, 'none');
  assert.notEqual(original.incident_digest, update.incident_digest);
  // Original bytes remain independently valid after update.
  assert.equal(validateModelBehaviorIncident(original).valid, true);
});

test('population-bounded rate refuses universal prevalence claims', () => {
  const rate = assertPopulationBoundedIncidentRate({
    count: 2,
    population_size: 200,
    population_id: 'population.synthetic.boundary.v1',
    population_digest: A
  });
  assert.equal(rate.rate, 0.01);
  assert.equal(rate.refuses_universal_prevalence, true);
  assert.equal(rate.universal_prevalence_claim, false);
  assert.throws(
    () => assertPopulationBoundedIncidentRate({
      count: 5,
      population_size: 2,
      population_id: 'population.synthetic.boundary.v1',
      population_digest: A
    }),
    ValidationError
  );
});

test('measured scoped frequency requires exact population binding', () => {
  const incident = baseIncident({
    incident_id: 'mbi.synthetic.rate.v1',
    reproduction: {
      status: 'reproduced',
      scoped_frequency: {
        state: 'measured',
        count: 3,
        population_size: 300,
        population_id: 'population.synthetic.public-upload.v1',
        population_digest: A,
        refuses_universal_prevalence: true
      }
    },
    evidence_refs: [{
      ref_id: 'evidence.synthetic.rate.v1',
      digest: D,
      kind: 'checker-output',
      authority_effect: 'none'
    }]
  });
  assert.equal(validateModelBehaviorIncident(incident).valid, true);
  assert.throws(
    () => baseIncident({
      reproduction: {
        scoped_frequency: {
          state: 'measured',
          count: 1,
          population_size: 10,
          population_id: null,
          population_digest: null,
          refuses_universal_prevalence: true
        }
      }
    }),
    ValidationError
  );
});
