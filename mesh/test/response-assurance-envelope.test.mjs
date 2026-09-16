import assert from 'node:assert/strict';
import test from 'node:test';

import { computeBehavioralAssuranceProfileDigest } from '../src/lib/behavioral-assurance-profile.mjs';
import {
  computeResponseAssuranceEnvelopeDigest,
  resolveResponseAssuranceEnvelope,
  validateResponseAssuranceEnvelope
} from '../src/lib/response-assurance-envelope.mjs';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);
const D = 'd'.repeat(64);
const E = 'e'.repeat(64);
const F = 'f'.repeat(64);
const ZERO = '0'.repeat(64);

function profile({ bindingStrength = 'exact-artifact', validUntil = '2026-10-16T22:00:00.000Z' } = {}) {
  const item = {
    schema: 'axiom-behavioral-assurance-profile.v0',
    version: 0,
    status: 'inert-behavioral-assurance-evidence',
    profile_id: 'behavior.profile.response-fixture.v1',
    subject: {
      subject_kind: 'agent-harness',
      subject_id: 'agent.response-fixture.v1',
      subject_digest: A,
      provider_model_revision: 'fixture-model-2026-09-16',
      binding_strength: bindingStrength,
      instruction_policy_digest: B,
      context_memory_policy_digest: C,
      tool_policy_digest: D,
      sampling_configuration_digest: E,
      environment_harness_digest: F
    },
    populations: [{
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
      inclusion_criteria: ['independently checked research QA'],
      exclusion_criteria: [],
      verification_sources: [{
        source_id: 'deterministic.source-checker.v1',
        source_digest: B,
        source_class: 'deterministic-checker',
        independence_group: 'checker-a'
      }],
      rubric_refs: [{ rubric_id: 'rubric.source-support.v1', rubric_digest: C }],
      dimensions: [{
        dimension_id: 'source-provenance-fidelity',
        evidence_state: 'accepted-evidence',
        metric_kind: 'probability',
        value: 0.99,
        sample_count: 500,
        calibration_ref: 'calibration.source-support.v1',
        calibration_digest: D,
        calibration_state: 'reviewed'
      }],
      incident_events: [],
      known_limitations: [],
      distribution_shift_notes: []
    }],
    created_at: '2026-09-16T22:00:00.000Z',
    valid_until: validUntil,
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

function envelope(profileDocument, overrides = {}) {
  const item = {
    schema: 'axiom-response-assurance-envelope.v0',
    version: 0,
    status: 'inert-response-assurance-evidence',
    envelope_id: 'response.assurance.fixture.v1',
    response_digest: B,
    task: {
      purpose: 'research-support',
      domain: 'research-question-answering',
      consequence_class: 'informational'
    },
    producer: {
      subject_id: profileDocument.subject.subject_id,
      subject_digest: profileDocument.subject.subject_digest,
      environment_harness_digest: profileDocument.subject.environment_harness_digest
    },
    profile_binding: {
      profile_id: profileDocument.profile_id,
      profile_digest: profileDocument.profile_digest,
      population_id: profileDocument.populations[0].population_id
    },
    deterministic_checks: [{
      check_id: 'source.digest.check.v1',
      check_digest: C,
      result: 'PASS'
    }],
    semantic_observations: [{
      observation_id: 'semantic.source-support.v1',
      observation_digest: D,
      dimension_id: 'source-provenance-fidelity',
      value_kind: 'probability',
      value: 0.93,
      calibration_ref: 'calibration.semantic-source-support.v1',
      calibration_digest: E,
      calibration_state: 'reviewed',
      evidence_state: 'accepted-evidence'
    }],
    verifiers: [{
      verifier_id: 'verifier.alpha.v1',
      verifier_digest: E,
      source_class: 'semantic-verifier',
      independence_group: 'semantic-lineage-a',
      result: 'supports'
    }, {
      verifier_id: 'checker.beta.v1',
      verifier_digest: F,
      source_class: 'deterministic-checker',
      independence_group: 'deterministic-lineage-b',
      result: 'supports'
    }],
    claimed_independent_confirmations: 2,
    surfaced_because: 'research-mode',
    unresolved_unknowns: [],
    observed_at: '2026-09-16T22:30:00.000Z',
    envelope_digest: ZERO,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false,
    selection_effect: 'evidence-only',
    ...overrides
  };
  item.envelope_digest = computeResponseAssuranceEnvelopeDigest(item);
  return item;
}

test('validates and resolves a current matching response assurance envelope', () => {
  const p = profile();
  const item = envelope(p);
  const validated = validateResponseAssuranceEnvelope(item);
  const resolved = resolveResponseAssuranceEnvelope(item, p, { now: '2026-09-16T23:00:00.000Z' });

  assert.equal(validated.valid, true);
  assert.equal(validated.authority_effect, 'none');
  assert.equal(Object.hasOwn(validated, 'authorized'), false);
  assert.equal(resolved.status, 'supported');
  assert.equal(resolved.profile_applicability, 'applicable');
  assert.equal(resolved.deterministic_failure_count, 0);
  assert.equal(resolved.independent_confirmation_count, 2);
  assert.equal(Object.hasOwn(resolved, 'safe_to_execute'), false);
  assert.equal(Object.isFrozen(resolved), true);
});

test('current deterministic failure remains conflicting even with a strong historical profile', () => {
  const p = profile();
  const item = envelope(p);
  item.deterministic_checks[0].result = 'FAIL';
  item.envelope_digest = computeResponseAssuranceEnvelopeDigest(item);

  const resolved = resolveResponseAssuranceEnvelope(item, p, { now: '2026-09-16T23:00:00.000Z' });
  assert.equal(resolved.status, 'conflicting-evidence');
  assert.equal(resolved.deterministic_failure_count, 1);
});

test('marks domain transfer as out of distribution rather than transferring historical probability', () => {
  const p = profile();
  const item = envelope(p);
  item.task.domain = 'medical-diagnosis';
  item.envelope_digest = computeResponseAssuranceEnvelopeDigest(item);

  const resolved = resolveResponseAssuranceEnvelope(item, p, { now: '2026-09-16T23:00:00.000Z' });
  assert.equal(resolved.status, 'out-of-distribution');
  assert.equal(resolved.profile_applicability, 'out-of-distribution');
});

test('marks expired and mutable-alias behavioral profiles stale', () => {
  for (const p of [
    profile({ validUntil: '2026-09-16T22:45:00.000Z' }),
    profile({ bindingStrength: 'mutable-alias' })
  ]) {
    const item = envelope(p);
    const resolved = resolveResponseAssuranceEnvelope(item, p, { now: '2026-09-16T23:00:00.000Z' });
    assert.equal(resolved.status, 'stale-profile');
    assert.equal(resolved.profile_applicability, 'stale');
  }
});

test('rejects profile transfer across a materially different producer harness', () => {
  const p = profile();
  const item = envelope(p);
  item.producer.environment_harness_digest = A;
  item.envelope_digest = computeResponseAssuranceEnvelopeDigest(item);

  const resolved = resolveResponseAssuranceEnvelope(item, p, { now: '2026-09-16T23:00:00.000Z' });
  assert.equal(resolved.status, 'invalid-evidence');
  assert.equal(resolved.profile_applicability, 'incompatible');
});

test('rejects correlated verifiers being counted as independent confirmations', () => {
  const p = profile();
  const item = envelope(p);
  item.verifiers[1].independence_group = item.verifiers[0].independence_group;
  assert.throws(
    () => computeResponseAssuranceEnvelopeDigest(item),
    /independent.*correlat|correlat.*independent|claimed_independent_confirmations/i
  );
});

test('rejects probability-valued current semantic evidence without reviewed calibration', () => {
  const p = profile();
  for (const mutation of [
    observation => { observation.calibration_ref = null; observation.calibration_digest = null; },
    observation => { observation.calibration_state = 'experimental'; }
  ]) {
    const item = envelope(p);
    mutation(item.semantic_observations[0]);
    assert.throws(
      () => computeResponseAssuranceEnvelopeDigest(item),
      /probability.*calibration|calibration.*probability/i
    );
  }
});

test('rejects authority-shaped fields and boundary widening', () => {
  const p = profile();
  const item = envelope(p);
  item.authorized = true;
  assert.throws(() => computeResponseAssuranceEnvelopeDigest(item), /unknown field/i);

  for (const [field, value] of [
    ['authority_effect', 'allow'],
    ['network_effect', 'egress'],
    ['runtime_activation', true],
    ['selection_effect', 'select-and-run']
  ]) {
    assert.throws(
      () => envelope(p, { [field]: value }),
      /boundary effect|effect is invalid/i
    );
  }
});
