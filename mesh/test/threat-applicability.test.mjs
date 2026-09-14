import assert from 'node:assert/strict';
import test from 'node:test';
import { contractDigest } from '../src/lib/threat-intelligence-contracts.mjs';
import { normalizeOfflineThreatSource } from '../src/lib/threat-observation-normalizer.mjs';
import {
  evaluateThreatApplicability,
  verifyBuildFacts
} from '../src/lib/threat-applicability.mjs';

const NOW = '2026-09-10T20:00:00.000Z';
const REVIEW = '2026-10-10T20:01:00.000Z';

function withFactDigest(raw) {
  return { ...raw, fact_digest: contractDigest(raw, 'fact_digest') };
}

function buildFacts(overrides = {}) {
  return withFactDigest({
    schema: 'axiom-threat-build-facts.v0',
    source_revision: 'fixture-main',
    supported_runtime: 'node-clean-room-kernel',
    boundaries: ['future_provider_adapter', 'gateway', 'grid', 'host_relay', 'hypervisor', 'sandbox'],
    implemented_protocols: ['tls13_internal', 'unix_domain_gateway'],
    absent_capabilities: ['arbitrary_remote_execution', 'browser_automation', 'live_threat_feed'],
    active_controls: ['constrained_machine_principal', 'deny_egress', 'exact_destination_binding', 'one_use_approval'],
    dependencies: [],
    ...overrides
  });
}

function observation(boundary, claimClass = 'behavioral_anomaly') {
  return normalizeOfflineThreatSource({
    source_class: 'vendor_security_report',
    source_identity_or_locator: `fixture:${boundary}`,
    source_version_or_published_at: 'v1',
    retrieved_at: NOW,
    source_text: `A synthetic report references ${boundary}.`,
    claims: [{
      observation_id: `obs:${boundary}:1`,
      claim_class: claimClass,
      summary: `Threat references ${boundary}.`,
      indicators: [boundary],
      affected_technology_or_boundary: [boundary],
      reported_preconditions: [`${boundary} is present`],
      reported_effects: ['synthetic effect']
    }]
  }).observations[0];
}

function evaluate(obs, facts = buildFacts()) {
  return evaluateThreatApplicability({
    observation: obs,
    buildFacts: facts,
    hypothesisId: `hyp:${obs.observation_id}`,
    createdAt: '2026-09-10T20:01:00.000Z',
    reviewAt: REVIEW
  });
}

test('unsupported external capability maps to not_applicable rather than vulnerable', () => {
  const hypothesis = evaluate(observation('browser_automation', 'browser_remote_execution'));
  assert.equal(hypothesis.applicability_state, 'not_applicable');
  assert.equal(hypothesis.confirmation_basis, 'deterministic_build_fact_mapping');
  assert.deepEqual(hypothesis.observation_ids.length, 1);
});

test('matching boundary is plausible and unknown boundary remains unassessed', () => {
  assert.equal(evaluate(observation('gateway')).applicability_state, 'plausible');
  assert.equal(evaluate(observation('unknown_surface')).applicability_state, 'unassessed');
});

test('named controls are recorded but cannot create confirmed blocked state', () => {
  const hypothesis = evaluate(observation('gateway'));
  assert.equal(hypothesis.applicability_state, 'plausible');
  assert.notEqual(hypothesis.applicability_state, 'current_build_blocked');
  assert.ok(hypothesis.precondition_mapping.some(item => item.includes('deny_egress')));
  assert.ok(hypothesis.precondition_mapping.some(item => item.includes('one_use_approval')));
});

test('vendor confidence cannot create current_build_vulnerable', () => {
  const obs = normalizeOfflineThreatSource({
    source_class: 'vendor_security_report',
    source_identity_or_locator: 'fixture:vendor-high-confidence',
    source_version_or_published_at: 'v1',
    retrieved_at: NOW,
    source_text: 'Synthetic vendor statement.',
    claims: [{
      observation_id: 'obs:vendor:high-confidence',
      claim_class: 'credential_exfiltration_attempt',
      summary: 'Synthetic high-confidence vendor claim.',
      indicators: ['provider_credential'],
      affected_technology_or_boundary: ['future_provider_adapter'],
      reported_preconditions: ['provider adapter exists'],
      reported_effects: ['credential disclosure'],
      source_confidence: 'high_confidence'
    }]
  }).observations[0];
  assert.equal(evaluate(obs).applicability_state, 'plausible');
  assert.notEqual(evaluate(obs).applicability_state, 'current_build_vulnerable');
});

test('build facts are closed, digest-bound, unique, sorted, and bounded', () => {
  const verified = verifyBuildFacts(buildFacts({ boundaries: ['sandbox', 'gateway'] }));
  assert.deepEqual(verified.boundaries, ['gateway', 'sandbox']);

  const unknown = { ...buildFacts(), extra: true };
  assert.throws(() => verifyBuildFacts(unknown), /unsupported field/);

  const mismatch = { ...buildFacts(), fact_digest: `sha256:${'0'.repeat(64)}` };
  assert.throws(() => verifyBuildFacts(mismatch), /digest mismatch/);

  const duplicateRaw = {
    schema: 'axiom-threat-build-facts.v0',
    source_revision: 'fixture-main',
    supported_runtime: 'node-clean-room-kernel',
    boundaries: ['gateway', 'gateway'],
    implemented_protocols: [],
    absent_capabilities: [],
    active_controls: [],
    dependencies: []
  };
  assert.throws(() => verifyBuildFacts(withFactDigest(duplicateRaw)), /unique/);

  const oversized = Array.from({ length: 257 }, (_, index) => `boundary_${index}`);
  const oversizedRaw = {
    schema: 'axiom-threat-build-facts.v0',
    source_revision: 'fixture-main',
    supported_runtime: 'node-clean-room-kernel',
    boundaries: oversized,
    implemented_protocols: [],
    absent_capabilities: [],
    active_controls: [],
    dependencies: []
  };
  assert.throws(() => verifyBuildFacts(withFactDigest(oversizedRaw)), /256/);
});

test('hypothesis binds the observation digest and named AXIOM boundary', () => {
  const obs = observation('gateway');
  const hypothesis = evaluate(obs);
  assert.deepEqual(hypothesis.observation_ids, [obs.observation_digest]);
  assert.ok(hypothesis.axiom_boundary_or_component.includes('gateway'));
  assert.match(hypothesis.hypothesis_digest, /^sha256:[0-9a-f]{64}$/);
});
