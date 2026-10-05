import {
  computeModelBehaviorIncidentDigest
} from '../src/lib/model-behavior-incident.mjs';

export const A = 'a'.repeat(64);
export const B = 'b'.repeat(64);
export const C = 'c'.repeat(64);
export const D = 'd'.repeat(64);
export const E = 'e'.repeat(64);
export const F = 'f'.repeat(64);
export const ZERO = '0'.repeat(64);

function merge(base, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return patch === undefined ? base : patch;
  const out = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (
      value
      && typeof value === 'object'
      && !Array.isArray(value)
      && base[key]
      && typeof base[key] === 'object'
      && !Array.isArray(base[key])
    ) {
      out[key] = merge(base[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function baseIncident(overrides = {}) {
  const item = merge({
    schema: 'axiom-model-behavior-incident.v0',
    version: 0,
    status: 'inert-model-behavior-incident-evidence',
    incident_id: 'mbi.synthetic.boundary.v1',
    observed_range: {
      from: '2026-09-10T00:00:00.000Z',
      to: '2026-09-12T00:00:00.000Z',
      state: 'known'
    },
    discovery_at: '2026-09-12T18:00:00.000Z',
    subject: {
      model_id: 'model.synthetic.fixture.v1',
      model_digest: A,
      runtime_id: 'runtime.synthetic.fixture.v1',
      runtime_digest: B,
      build_id: 'build.synthetic.fixture.v1',
      provider_id: 'provider.synthetic.fixture.v1',
      binding_strength: 'exact-artifact'
    },
    lifecycle_stage: 'evaluation',
    environment: {
      task_id: 'task.synthetic.boundary.v1',
      isolation: 'offline-fixture',
      notes: 'Synthetic offline fixture only; no live provider or network effects.'
    },
    expected_boundary: 'Derived summaries remain non-authoritative; credentials and public upload require exact authority.',
    observed_behavior: 'Synthetic observed boundary-pressure behavior for offline contract tests.',
    behavior_classes: ['other-reviewed'],
    consequential_effects: {
      attempted: [],
      completed: [],
      uncertain: []
    },
    third_party_or_data_impact: {
      state: 'none-observed',
      summary: 'No third-party or data impact observed in this offline fixture.'
    },
    detection: {
      mechanism: 'deterministic-checker',
      monitoring_coverage: 'partial',
      notes: 'Offline checker fixture; monitoring coverage is evidence only.'
    },
    evidence_refs: [{
      ref_id: 'evidence.synthetic.transcript.v1',
      digest: C,
      kind: 'transcript',
      authority_effect: 'none'
    }],
    reproduction: {
      status: 'reproduced',
      scoped_frequency: {
        state: 'not-yet-established',
        count: null,
        population_size: null,
        population_id: null,
        population_digest: null,
        refuses_universal_prevalence: true
      }
    },
    severity_triage: {
      declared_level: 'not-yet-established',
      priority: 'not-yet-established',
      basis: 'triage-evidence-only',
      is_truth_claim: false
    },
    uncertainty: {
      causal_explanation: 'not-yet-established',
      open_questions: ['Root cause not yet established.']
    },
    containment: {
      state: 'none',
      summary: 'No containment action; offline evidence only.'
    },
    mitigation: {
      state: 'not-yet-established',
      summary: 'Mitigation not yet established.'
    },
    disclosure: {
      track: 'minor-investigation',
      state: 'internal-only',
      subordinate_to_security_md: true,
      subordinate_to_incident_response: true,
      automation: 'none'
    },
    affected_party_notification: {
      state: 'not-applicable',
      summary: 'No affected party notification required for offline fixture.'
    },
    lineage: {
      supersedes: [],
      updates: [],
      superseded_by: null
    },
    sensitive_evidence_routing: {
      public_artifact_contains_secrets: false,
      routing: 'none',
      private_evidence_ref: null
    },
    created_at: '2026-09-16T22:00:00.000Z',
    incident_digest: ZERO,
    authority_effect: 'none',
    assurance_effect: 'evidence-only',
    network_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false,
    selection_effect: 'evidence-only'
  }, overrides);

  item.incident_digest = computeModelBehaviorIncidentDigest(item);
  return item;
}
