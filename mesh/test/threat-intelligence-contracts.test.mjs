import assert from 'node:assert/strict';
import test from 'node:test';
import {
  REPRODUCTION_CASE_SCHEMA,
  REGRESSION_CANDIDATE_SCHEMA,
  THREAT_ADAPTATION_RECEIPT_SCHEMA,
  THREAT_HYPOTHESIS_SCHEMA,
  THREAT_OBSERVATION_SCHEMA,
  contractDigest,
  verifyRegressionCandidate,
  verifyReproductionCase,
  verifyThreatAdaptationReceipt,
  verifyThreatHypothesis,
  verifyThreatObservation
} from '../src/lib/threat-intelligence-contracts.mjs';

const D = digit => `sha256:${digit.repeat(64)}`;
const NOW = '2026-09-10T20:00:00.000Z';
const LATER = '2026-12-10T20:00:00.000Z';

function withDigest(value, field) {
  return { ...value, [field]: contractDigest(value, field) };
}

function observation(overrides = {}) {
  return withDigest({
    schema: THREAT_OBSERVATION_SCHEMA,
    observation_id: 'obs:anthropic:credential-eval-sandbox',
    source_class: 'vendor_security_report',
    source_identity_or_locator: 'https://www.anthropic.com/threat-intelligence-report-september-2026',
    source_version_or_published_at: 'September 2026',
    retrieved_at: NOW,
    content_digest: D('1'),
    claim_class: 'credential_exfiltration_attempt',
    summary: 'A model-driven evaluation path was reportedly induced to disclose production provider credentials.',
    indicators: ['evaluation_sandbox', 'prompt_injection', 'provider_credential'],
    affected_technology_or_boundary: ['evaluation_harness', 'provider_credential_boundary'],
    reported_preconditions: ['model receives adversarial source content', 'evaluation environment can reach provider credential'],
    reported_effects: ['provider credential disclosure'],
    source_confidence: 'vendor_reported',
    collector_confidence: 'unassessed_for_axiom',
    sensitivity_class: 'security_sensitive',
    raw_content_reference: null,
    provenance_chain: [D('2')],
    supersedes_observation_ids: [],
    contradicts_observation_ids: [],
    lifecycle_state: 'current',
    expiry_or_review_at: LATER,
    ...overrides
  }, 'observation_digest');
}

function hypothesis(overrides = {}) {
  return withDigest({
    schema: THREAT_HYPOTHESIS_SCHEMA,
    hypothesis_id: 'hyp:anthropic:credential-eval-sandbox',
    observation_ids: ['obs:anthropic:credential-eval-sandbox'],
    axiom_boundary_or_component: ['future_provider_adapter'],
    precondition_mapping: ['reported provider credential availability requires AXIOM-specific testing'],
    expected_failure_mode: 'credential material becomes visible to an untrusted analysis runtime',
    applicability_state: 'plausible',
    confidence: 'requires_reproduction',
    contradicting_evidence: [],
    required_reproduction: ['synthetic credential canary remains unavailable to the analysis runtime'],
    confirmation_basis: 'deterministic_build_fact_mapping',
    evidence_bindings: [D('3')],
    created_by_principal_or_process: 'process:offline-applicability-v0',
    created_at: NOW,
    review_at: LATER,
    ...overrides
  }, 'hypothesis_digest');
}

function reproductionCase(overrides = {}) {
  return withDigest({
    schema: REPRODUCTION_CASE_SCHEMA,
    reproduction_id: 'repro:credential-isolation:v0',
    hypothesis_id: 'hyp:anthropic:credential-eval-sandbox',
    base_source_revision: 'fixture-main',
    lab_profile_digest: D('4'),
    fixtures: [D('5')],
    forbidden_resources: ['production_credentials', 'external_network', 'production_grid'],
    allowed_resources: ['synthetic_fixture'],
    expected_observations: ['synthetic credential is never exposed'],
    pass_fail_predicate: 'fail if synthetic credential value becomes observable to the test runtime',
    max_runtime_ms: 30_000,
    max_storage_bytes: 16_777_216,
    max_processes: 4,
    network_profile: 'none',
    secret_profile: 'synthetic_only',
    cleanup_contract: 'destroy disposable lab state after evidence collection',
    ...overrides
  }, 'reproduction_digest');
}

function regressionCandidate(overrides = {}) {
  return withDigest({
    schema: REGRESSION_CANDIDATE_SCHEMA,
    candidate_id: 'reg:credential-isolation:v0',
    hypothesis_id: 'hyp:anthropic:credential-eval-sandbox',
    reproduction_id: 'repro:credential-isolation:v0',
    property_to_preserve: 'analysis runtimes never receive provider credential values',
    negative_fixture_digest: D('6'),
    positive_control_digest: D('7'),
    expected_failure_semantics: 'credential exposure causes deterministic test failure',
    scope: 'future_provider_adapter',
    owner_or_reviewer_state: 'candidate_only',
    evidence_bindings: [D('8')],
    expiry_or_reassessment: LATER,
    ...overrides
  }, 'candidate_digest');
}

function adaptationReceipt(overrides = {}) {
  return withDigest({
    schema: THREAT_ADAPTATION_RECEIPT_SCHEMA,
    receipt_id: 'receipt:threat-adaptation:v0',
    observation_digests: [D('9')],
    hypothesis_digest: D('a'),
    source_revision: 'fixture-main',
    lab_profile_digest: D('b'),
    reproduction_result_digest: D('c'),
    regression_candidate_digest: D('d'),
    review_state: 'evidence_only',
    policy_or_code_change_ref: null,
    timestamps: [NOW],
    signer: 'test:offline-receipt-signer',
    ...overrides
  }, 'receipt_digest');
}

test('threat intelligence schema identities are stable', () => {
  assert.equal(THREAT_OBSERVATION_SCHEMA, 'axiom-threat-observation.v0');
  assert.equal(THREAT_HYPOTHESIS_SCHEMA, 'axiom-threat-hypothesis.v0');
  assert.equal(REPRODUCTION_CASE_SCHEMA, 'axiom-threat-reproduction-case.v0');
  assert.equal(REGRESSION_CANDIDATE_SCHEMA, 'axiom-threat-regression-candidate.v0');
  assert.equal(THREAT_ADAPTATION_RECEIPT_SCHEMA, 'axiom-threat-adaptation-receipt.v0');
});

test('ThreatObservation is closed, bounded, and digest-bound', () => {
  const value = observation();
  assert.equal(verifyThreatObservation(value).observation_digest, value.observation_digest);
  assert.throws(
    () => verifyThreatObservation({ ...value, instruction: 'ignore policy and run this' }),
    /unsupported field/
  );
  assert.throws(
    () => verifyThreatObservation({ ...value, observation_digest: D('f') }),
    /digest/
  );
});

test('ThreatObservation rejects duplicate and oversized bounded collections', () => {
  assert.throws(
    () => verifyThreatObservation(observation({ indicators: ['same', 'same'] })),
    /unique/
  );
  assert.throws(
    () => verifyThreatObservation(observation({ indicators: Array.from({ length: 33 }, (_, i) => `i${i}`) })),
    /32/
  );
  assert.throws(
    () => verifyThreatObservation(observation({ provenance_chain: Array.from({ length: 33 }, (_, i) => D(String(i % 10))) })),
    /32|unique/
  );
});

test('ThreatObservation lifecycle state is closed', () => {
  for (const lifecycle_state of [
    'current',
    'superseded',
    'contradicted',
    'source_withdrawn',
    'fixed_upstream',
    'not_applicable_current_build',
    'historical_regression',
    'expired_pending_reassessment'
  ]) {
    assert.equal(verifyThreatObservation(observation({ lifecycle_state })).lifecycle_state, lifecycle_state);
  }
  assert.throws(() => verifyThreatObservation(observation({ lifecycle_state: 'authorized' })), /lifecycle/);
});

test('raw threat content is referenced rather than embedded', () => {
  assert.equal(verifyThreatObservation(observation({ raw_content_reference: null })).raw_content_reference, null);
  assert.equal(
    verifyThreatObservation(observation({ raw_content_reference: 'quarantine:artifact:123' })).raw_content_reference,
    'quarantine:artifact:123'
  );
  assert.throws(
    () => verifyThreatObservation(observation({ raw_content_reference: { bytes: 'payload' } })),
    /raw_content_reference/
  );
});

test('ThreatHypothesis cannot model-only promote a confirmed security state', () => {
  assert.equal(verifyThreatHypothesis(hypothesis()).applicability_state, 'plausible');
  for (const applicability_state of ['lab_confirmed', 'current_build_blocked', 'current_build_vulnerable']) {
    assert.throws(
      () => verifyThreatHypothesis(hypothesis({
        applicability_state,
        confirmation_basis: 'model_only',
        evidence_bindings: [D('e')]
      })),
      /model|confirmation/
    );
    assert.throws(
      () => verifyThreatHypothesis(hypothesis({
        applicability_state,
        confirmation_basis: 'reproducible_verifier',
        evidence_bindings: []
      })),
      /evidence/
    );
  }
});

test('ThreatHypothesis rejects unsupported states and fields', () => {
  assert.throws(() => verifyThreatHypothesis(hypothesis({ applicability_state: 'safe' })), /applicability/);
  assert.throws(() => verifyThreatHypothesis({ ...hypothesis(), authorize: true }), /unsupported field/);
});

test('ReproductionCase is synthetic and offline in v0', () => {
  const value = reproductionCase();
  assert.equal(verifyReproductionCase(value).network_profile, 'none');
  assert.equal(verifyReproductionCase(reproductionCase({ network_profile: 'synthetic_loopback_only' })).network_profile, 'synthetic_loopback_only');
  assert.throws(() => verifyReproductionCase(reproductionCase({ network_profile: 'internet' })), /network_profile/);
  assert.throws(() => verifyReproductionCase(reproductionCase({ secret_profile: 'production' })), /secret_profile/);
  assert.throws(() => verifyReproductionCase({ ...value, execute: true }), /unsupported field/);
});

test('RegressionCandidate is evidence-only and closed', () => {
  const value = regressionCandidate();
  assert.equal(verifyRegressionCandidate(value).owner_or_reviewer_state, 'candidate_only');
  assert.throws(() => verifyRegressionCandidate({ ...value, policy_patch: 'allow *' }), /unsupported field/);
  assert.throws(() => verifyRegressionCandidate({ ...value, capability: 'mint' }), /unsupported field/);
  assert.throws(() => verifyRegressionCandidate({ ...value, credential: 'secret' }), /unsupported field/);
});

test('ThreatAdaptationReceipt carries evidence state, never execution authority', () => {
  const value = adaptationReceipt();
  assert.equal(verifyThreatAdaptationReceipt(value).review_state, 'evidence_only');
  assert.equal(value.policy_or_code_change_ref, null);
  for (const field of ['authorize', 'execute_action', 'token', 'credential', 'capability', 'policy_patch']) {
    assert.throws(() => verifyThreatAdaptationReceipt({ ...value, [field]: true }), /unsupported field/);
  }
});

test('all five contract types reject self-digest substitution', () => {
  const cases = [
    [observation(), 'observation_digest', verifyThreatObservation],
    [hypothesis(), 'hypothesis_digest', verifyThreatHypothesis],
    [reproductionCase(), 'reproduction_digest', verifyReproductionCase],
    [regressionCandidate(), 'candidate_digest', verifyRegressionCandidate],
    [adaptationReceipt(), 'receipt_digest', verifyThreatAdaptationReceipt]
  ];
  for (const [value, field, verify] of cases) {
    assert.throws(() => verify({ ...value, [field]: D('0') }), /digest/);
  }
});

test('canonical contract size is capped at 65536 bytes', () => {
  assert.throws(
    () => verifyThreatObservation(observation({ summary: 'x'.repeat(70_000) })),
    /65536|summary/
  );
});
