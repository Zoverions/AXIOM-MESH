import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cognitiveCapabilityProfileDigest
} from '../src/lib/cognitive-capability-profile.mjs';
import {
  cognitiveCapabilityObservationDigest
} from '../src/lib/cognitive-capability-observation.mjs';
import {
  COGNITIVE_CAPABILITY_SURFACE_REPORT_SCHEMA,
  cognitiveCapabilitySurfaceReportDigest,
  deriveCognitiveCapabilitySurfaceReport,
  validateCognitiveCapabilitySurfaceReport
} from '../src/lib/cognitive-capability-surface-report.mjs';

const D = Object.freeze({
  a: 'a'.repeat(64),
  b: 'b'.repeat(64),
  c: 'c'.repeat(64),
  d: 'd'.repeat(64),
  e: 'e'.repeat(64),
  f: 'f'.repeat(64)
});

function validProfile() {
  return {
    schema: 'axiom-cognitive-capability-profile.v0',
    version: 0,
    status: 'inert-routing-metadata-laboratory',
    profile_id: 'cognitive.example.remote.general',
    catalog_entry: {
      entry_id: 'provider:example-api',
      entry_version: '0.1.0',
      entry_digest: D.f
    },
    integration_class: 'model-provider',
    offering_ref: 'model.example.general.v1',
    capabilities: ['reasoning', 'coding'],
    modalities: {
      input: ['text'],
      output: ['text']
    },
    deployment: {
      locality: 'provider-remote',
      access_mode: 'api'
    },
    data_policy: {
      retention: 'unknown',
      training_use: 'unknown',
      exportability: 'unknown',
      policy_ref: 'policy.example.provider.v1'
    },
    economics: {
      cost_class: 'medium',
      latency_class: 'interactive',
      context_class: 'large'
    },
    openness: {
      weight_access: 'closed',
      artifact_digest: null,
      license_ref: null
    },
    assurance: {
      ceiling: 'self-asserted',
      evidence_refs: ['evidence.example.provider-review']
    },
    created_at: '2026-09-06T12:00:00.000Z',
    updated_at: '2026-09-06T12:00:00.000Z',
    authority_effect: 'none',
    network_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false,
    selection_effect: 'eligibility-only'
  };
}

function validObservation(profile = validProfile(), overrides = {}) {
  const observation = {
    schema: 'axiom-cognitive-capability-observation.v0',
    version: 0,
    status: 'inert-evidence',
    observation_id: 'capobs.reasoning.surface.v1',
    profile_id: profile.profile_id,
    profile_digest: cognitiveCapabilityProfileDigest(profile),
    capability: 'reasoning',
    context: {
      context_ref: 'context.reasoning.surface.v1',
      context_digest: D.a,
      task_family_ref: 'task-family.reasoning.v1',
      task_family_digest: D.b,
      difficulty_class: 'challenging',
      environment_ref: 'environment.node24.v1',
      environment_digest: D.c,
      toolset_ref: 'toolset.none.v1',
      toolset_digest: D.d
    },
    evaluation: {
      suite_ref: 'suite.reasoning.v1',
      suite_digest: D.a,
      metric_set_ref: 'metrics.reasoning.v1',
      metric_set_digest: D.b,
      threshold_ref: 'threshold.reasoning.v1',
      threshold_digest: D.c,
      method_ref: 'method.deterministic.v1',
      method_digest: D.d
    },
    result: {
      classification: 'pass',
      confidence: 0.9,
      observed_metric_ref: 'metric-result.reasoning.v1',
      observed_metric_digest: D.e,
      failure_mode_refs: []
    },
    evaluator: {
      evaluator_kind: 'synthetic-harness',
      evaluator_ref: 'evaluator.reasoning.harness.v1',
      evaluator_principal_ref: null
    },
    evidence: {
      evidence_kind: 'evaluation-run',
      evidence_ref: 'evidence.reasoning.run.v1',
      evidence_digest: D.f,
      verification_ref: null,
      verification_digest: null,
      assurance_class: 'declared'
    },
    resource_observations: [
      {
        resource_class: 'input-tokens',
        basis: 'observed',
        amount: 2400,
        unit: 'tokens',
        source_ref: 'usage.reasoning.v1'
      },
      {
        resource_class: 'energy',
        basis: 'unknown',
        amount: null,
        unit: null,
        source_ref: null
      }
    ],
    observed_at: '2026-09-06T12:00:00.000Z',
    valid_until: '2026-10-06T12:00:00.000Z',
    recorded_at: '2026-09-06T12:01:00.000Z',
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    training_effect: 'none',
    spend_effect: 'none',
    runtime_activation: false,
    selection_effect: 'evidence-only'
  };
  return Object.assign(observation, overrides);
}

function derive(overrides = {}) {
  const profile = overrides.profile ?? validProfile();
  const observations = overrides.observations ?? [validObservation(profile)];
  return deriveCognitiveCapabilitySurfaceReport({
    report_id: overrides.report_id ?? 'capsurface.example.reasoning.v1',
    profile,
    observations,
    assessment_at: overrides.assessment_at ?? '2026-09-06T13:00:00.000Z',
    recorded_at: overrides.recorded_at ?? '2026-09-06T13:01:00.000Z'
  });
}

function clone(value) {
  return structuredClone(value);
}

function isDeepFrozen(value) {
  if (!value || typeof value !== 'object') return true;
  if (!Object.isFrozen(value)) return false;
  return Object.values(value).every(isDeepFrozen);
}

test('derives an evidence-only surface inventory for one exact profile', () => {
  const profile = validProfile();
  const observation = validObservation(profile);
  const report = derive({ profile, observations: [observation] });

  assert.equal(
    COGNITIVE_CAPABILITY_SURFACE_REPORT_SCHEMA,
    'axiom-cognitive-capability-surface-report.v0'
  );
  assert.equal(report.schema, COGNITIVE_CAPABILITY_SURFACE_REPORT_SCHEMA);
  assert.equal(report.version, 0);
  assert.equal(report.status, 'inert-evidence-report');
  assert.equal(report.profile_id, profile.profile_id);
  assert.equal(report.profile_digest, cognitiveCapabilityProfileDigest(profile));
  assert.equal(report.source_observations.length, 1);
  assert.deepEqual(report.source_observations[0], {
    observation_id: observation.observation_id,
    observation_digest: cognitiveCapabilityObservationDigest(observation),
    capability: 'reasoning',
    freshness: 'current',
    observed_at: observation.observed_at,
    valid_until: observation.valid_until,
    recorded_at: observation.recorded_at
  });
  assert.deepEqual(report.capability_surfaces.map(item => item.capability), ['reasoning', 'coding']);
  assert.ok(Array.isArray(report.capability_surfaces[0].current_cells));
  assert.deepEqual(report.capability_surfaces[1].current_cells, []);
  assert.equal(report.contains_secret_material, false);
  assert.equal(report.authority_effect, 'none');
  assert.equal(report.network_effect, 'none');
  assert.equal(report.training_effect, 'none');
  assert.equal(report.spend_effect, 'none');
  assert.equal(report.runtime_activation, false);
  assert.equal(report.selection_effect, 'evidence-only');

  const summary = validateCognitiveCapabilitySurfaceReport(report);
  assert.equal(summary.valid, true);
  assert.equal(summary.report_id, report.report_id);
  assert.equal(summary.profile_id, profile.profile_id);
  assert.equal(summary.profile_digest, report.profile_digest);
  assert.equal(summary.source_observations, 1);
  assert.equal(summary.authority_effect, 'none');
  assert.equal(summary.selection_effect, 'evidence-only');
  assert.equal(cognitiveCapabilitySurfaceReportDigest(report), cognitiveCapabilitySurfaceReportDigest(clone(report)));
});

test('preserves profile-declared capabilities with no observations', () => {
  const report = derive({ observations: [] });
  assert.deepEqual(report.capability_surfaces.map(item => item.capability), ['reasoning', 'coding']);
  for (const surface of report.capability_surfaces) {
    assert.deepEqual(surface.current_cells, []);
    assert.equal(surface.direct_conflict_cells, 0);
    assert.equal(surface.mixed_conflict_cells, 0);
    assert.equal(surface.variation_present, false);
  }
});

test('classifies future before not-yet-recorded', () => {
  const profile = validProfile();
  const observation = validObservation(profile, {
    observed_at: '2026-09-06T14:00:00.000Z',
    valid_until: '2026-09-06T16:00:00.000Z',
    recorded_at: '2026-09-06T15:00:00.000Z'
  });
  const report = derive({
    profile,
    observations: [observation],
    assessment_at: '2026-09-06T13:00:00.000Z',
    recorded_at: '2026-09-06T13:01:00.000Z'
  });
  assert.equal(report.source_observations[0].freshness, 'future');
});

test('classifies not-yet-recorded before stale', () => {
  const profile = validProfile();
  const observation = validObservation(profile, {
    observed_at: '2026-09-06T10:00:00.000Z',
    valid_until: '2026-09-06T11:00:00.000Z',
    recorded_at: '2026-09-06T13:00:00.000Z'
  });
  const report = derive({
    profile,
    observations: [observation],
    assessment_at: '2026-09-06T12:00:00.000Z',
    recorded_at: '2026-09-06T12:01:00.000Z'
  });
  assert.equal(report.source_observations[0].freshness, 'not-yet-recorded');
});

test('classifies expired evidence as stale', () => {
  const profile = validProfile();
  const observation = validObservation(profile, {
    observed_at: '2026-09-06T10:00:00.000Z',
    valid_until: '2026-09-06T11:00:00.000Z',
    recorded_at: '2026-09-06T10:01:00.000Z'
  });
  const report = derive({
    profile,
    observations: [observation],
    assessment_at: '2026-09-06T12:00:00.000Z',
    recorded_at: '2026-09-06T12:01:00.000Z'
  });
  assert.equal(report.source_observations[0].freshness, 'stale');
});

test('fails closed when report recorded_at precedes assessment_at', () => {
  assert.throws(
    () => derive({
      assessment_at: '2026-09-06T13:00:00.000Z',
      recorded_at: '2026-09-06T12:59:59.999Z'
    }),
    /recorded_at.*assessment_at/i
  );
});

test('rejects malformed or non-canonical report timestamps', () => {
  assert.throws(
    () => derive({ assessment_at: '2026-09-06T13:00:00Z' }),
    /canonical ISO timestamp/i
  );
  assert.throws(
    () => derive({ recorded_at: 'not-a-time' }),
    /canonical ISO timestamp/i
  );
});

test('fails closed on observation profile_id substitution', () => {
  const profile = validProfile();
  const observation = validObservation(profile, { profile_id: 'cognitive.other.profile' });
  assert.throws(
    () => derive({ profile, observations: [observation] }),
    /profile_id does not match/i
  );
});

test('fails closed on observation profile_digest substitution', () => {
  const profile = validProfile();
  const observation = validObservation(profile, { profile_digest: D.a });
  assert.throws(
    () => derive({ profile, observations: [observation] }),
    /profile_digest does not match/i
  );
});

test('fails closed when an observation capability is not declared by the profile', () => {
  const profile = validProfile();
  const observation = validObservation(profile, { capability: 'vision' });
  assert.throws(
    () => derive({ profile, observations: [observation] }),
    /capability is not declared/i
  );
});

test('rejects duplicate observation ids even when the documents differ', () => {
  const profile = validProfile();
  const first = validObservation(profile);
  const second = validObservation(profile);
  second.result.confidence = 0.8;
  assert.notEqual(cognitiveCapabilityObservationDigest(first), cognitiveCapabilityObservationDigest(second));
  assert.throws(
    () => derive({ profile, observations: [first, second] }),
    /duplicate observation_id/i
  );
});

test('rejects duplicate canonical observation documents', () => {
  const profile = validProfile();
  const observation = validObservation(profile);
  assert.throws(
    () => derive({ profile, observations: [observation, clone(observation)] }),
    /duplicate (observation digest|observation_id)/i
  );
});

test('bounds the source observation set at 256 artifacts', () => {
  const profile = validProfile();
  const observations = Array.from({ length: 257 }, (_, index) => validObservation(profile, {
    observation_id: `capobs.reasoning.surface.${index}`
  }));
  assert.throws(
    () => derive({ profile, observations }),
    /at most 256|0-256/i
  );
});

test('does not allow source evidence to widen authority boundaries', () => {
  const profile = validProfile();
  const observation = validObservation(profile, { authority_effect: 'grant' });
  assert.throws(
    () => derive({ profile, observations: [observation] }),
    /authority boundary is invalid/i
  );
});

test('does not mutate profile or observation inputs and deeply freezes the report', () => {
  const profile = validProfile();
  const observation = validObservation(profile);
  const beforeProfile = JSON.stringify(profile);
  const beforeObservation = JSON.stringify(observation);
  const report = derive({ profile, observations: [observation] });

  assert.equal(JSON.stringify(profile), beforeProfile);
  assert.equal(JSON.stringify(observation), beforeObservation);
  assert.equal(isDeepFrozen(report), true);
  assert.throws(() => {
    report.source_observations.push({});
  }, TypeError);
});

test('validator rejects widened report authority and unknown top-level fields', () => {
  const report = clone(derive());
  report.authority_effect = 'grant';
  assert.throws(
    () => validateCognitiveCapabilitySurfaceReport(report),
    /authority boundary is invalid/i
  );

  const reportWithUnknown = clone(derive());
  reportWithUnknown.universal_score = 99;
  assert.throws(
    () => validateCognitiveCapabilitySurfaceReport(reportWithUnknown),
    /unknown field/i
  );
});

test('source inventory is deterministic under observation input permutation', () => {
  const profile = validProfile();
  const first = validObservation(profile, { observation_id: 'capobs.reasoning.surface.b' });
  const second = validObservation(profile, { observation_id: 'capobs.reasoning.surface.a' });
  const forward = derive({ profile, observations: [first, second] });
  const reverse = derive({ profile, observations: [second, first] });

  assert.deepEqual(forward.source_observations, reverse.source_observations);
  assert.equal(cognitiveCapabilitySurfaceReportDigest(forward), cognitiveCapabilitySurfaceReportDigest(reverse));
});
