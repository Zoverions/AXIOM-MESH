import test from 'node:test';
import assert from 'node:assert/strict';
import { contractDigest } from '../src/lib/state-placement-contracts.mjs';
import { evaluateStatePlacement } from '../src/lib/state-placement-policy.mjs';

const NOW = '2026-09-11T20:00:00.000Z';
const LATER = '2026-09-11T20:10:00.000Z';
const POLICY_PROFILE = `sha256:${'1'.repeat(64)}`;

function withDigest(value, field) {
  return { ...value, [field]: contractDigest(value, field) };
}

function makeRequest(overrides = {}) {
  return withDigest({
    schema: 'axiom-state-placement-request.v1', version: 1, status: 'inert-contract-laboratory',
    request_id: 'placement:req:policy-test', owner_scope: 'owner:fixture', source_state_family: 'memory.graph',
    operation_class: 'replicate', purpose: 'owner-recovery', data_class: 'owner-private-memory',
    confidentiality_requirement: 'sensitive', disclosure_ceiling: 'ciphertext-only',
    residency: { allowed_regions: ['CA'], minimum_evidence_level: 'provider-configured' },
    permitted_destination_classes: ['managed-object', 'owner-peer'], forbidden_destination_classes: [],
    retention: { minimum_days: 7, maximum_days: 365 },
    availability_target: { minimum_replicas: 1, minimum_failure_domains: 1 },
    maximum_lag_ms: 300000, consistency_class: 'bounded-lag-replica',
    encryption_profile: 'profile:encrypted-replica-v1', recovery_importance: 'important',
    cost_ceiling_units: 1000, consequence_class: 'C2', policy_profile_digest: POLICY_PROFILE,
    created_at: NOW, expires_at: LATER, contains_secret_material: false,
    authority_effect: 'none', network_effect: 'none', provider_effect: 'none', canonical_state_effect: 'none',
    ...overrides
  }, 'request_digest');
}

function makePolicy(overrides = {}) {
  return withDigest({
    schema: 'axiom-state-placement-policy.v0', version: 0, status: 'inert-contract-laboratory',
    policy_id: 'placement-policy:owner:fixture', owner_scope: 'owner:fixture',
    allowed_operations: ['replicate'], allowed_destination_classes: ['managed-object', 'owner-peer'],
    forbidden_destination_ids: [], minimum_residency_evidence_level: 'provider-configured',
    managed_destinations_allowed: true, maximum_eligible_destinations: 4, maximum_plan_lifetime_ms: 600000,
    created_at: NOW, expires_at: LATER,
    authority_effect: 'none', network_effect: 'none', provider_effect: 'none', canonical_state_effect: 'none',
    ...overrides
  }, 'policy_digest');
}

function makeDestination(overrides = {}) {
  return withDigest({
    schema: 'axiom-state-destination-profile.v0', version: 0, status: 'inert-contract-laboratory',
    destination_id: 'dest:ca', destination_class: 'managed-object', failure_domain: 'fd:ca:1', regions: ['CA'],
    residency_evidence_level: 'provider-configured', owner_controlled: false, managed_provider: true,
    allowed_operations: ['replicate'], allowed_purposes: ['owner-recovery'], allowed_data_classes: ['owner-private-memory'],
    maximum_confidentiality: 'restricted', disclosure_modes: ['ciphertext-only'],
    retention_days: { minimum: 1, maximum: 3650 }, maximum_lag_ms: 300000,
    consistency_classes: ['bounded-lag-replica'], encryption_profiles: ['profile:encrypted-replica-v1'],
    recovery_importance_supported: ['important'], cost_units: 100, observed_at: NOW, expires_at: LATER,
    contains_secret_material: false, authority_effect: 'none', network_effect: 'none', provider_effect: 'none',
    canonical_state_effect: 'none', ...overrides
  }, 'profile_digest');
}

test('hard residency constraints dominate cheaper destinations', () => {
  const request = makeRequest({ cost_ceiling_units: 1000 });
  const policy = makePolicy();
  const cheapUs = makeDestination({ destination_id: 'dest:cheap-us', failure_domain: 'fd:us:1', regions: ['US'], cost_units: 1 });
  const ca = makeDestination({ destination_id: 'dest:ca', failure_domain: 'fd:ca:1', regions: ['CA'], cost_units: 500 });
  const plan = evaluateStatePlacement({ request, policy, destinations: [cheapUs, ca], now: NOW });
  assert.deepEqual(plan.eligible_destinations.map((item) => item.destination_id), ['dest:ca']);
  assert.deepEqual(
    plan.ineligible_destinations.find((item) => item.destination_id === 'dest:cheap-us').reason_codes,
    ['residency-region-mismatch']
  );
  assert.equal(plan.satisfied, true);
});

test('eligibility output is deterministic regardless of input destination order', () => {
  const request = makeRequest({ availability_target: { minimum_replicas: 2, minimum_failure_domains: 2 } });
  const policy = makePolicy();
  const a = makeDestination({ destination_id: 'dest:a', failure_domain: 'fd:a' });
  const b = makeDestination({ destination_id: 'dest:b', failure_domain: 'fd:b' });
  const first = evaluateStatePlacement({ request, policy, destinations: [b, a], now: NOW });
  const second = evaluateStatePlacement({ request, policy, destinations: [a, b], now: NOW });
  assert.deepEqual(first.eligible_destinations, second.eligible_destinations);
  assert.equal(first.plan_digest, second.plan_digest);
  assert.deepEqual(first.eligible_destinations.map((item) => item.destination_id), ['dest:a', 'dest:b']);
});

test('all failing hard constraints are reported with closed sorted reason codes', () => {
  const request = makeRequest({
    permitted_destination_classes: ['owner-peer'],
    forbidden_destination_classes: ['managed-object'],
    cost_ceiling_units: 10,
    maximum_lag_ms: 100,
    recovery_importance: 'critical'
  });
  const policy = makePolicy({
    allowed_destination_classes: ['owner-peer'],
    forbidden_destination_ids: ['dest:bad'],
    managed_destinations_allowed: false,
    minimum_residency_evidence_level: 'authenticated-assertion'
  });
  const bad = makeDestination({
    destination_id: 'dest:bad', regions: ['US'], residency_evidence_level: 'declared',
    allowed_operations: ['cache'], allowed_purposes: ['other-purpose'], allowed_data_classes: ['other-data'],
    maximum_confidentiality: 'protected', disclosure_modes: ['commitment-only'],
    retention_days: { minimum: 1000, maximum: 2000 }, maximum_lag_ms: 1000,
    consistency_classes: ['immutable-object'], encryption_profiles: ['profile:other'],
    recovery_importance_supported: ['ordinary'], cost_units: 999
  });
  const plan = evaluateStatePlacement({ request, policy, destinations: [bad], now: NOW });
  assert.equal(plan.satisfied, false);
  assert.deepEqual(plan.ineligible_destinations[0].reason_codes, [
    'confidentiality-insufficient',
    'consistency-unsupported',
    'cost-ceiling-exceeded',
    'data-class-unsupported',
    'destination-class-disallowed-by-policy',
    'destination-class-forbidden-by-request',
    'destination-class-not-permitted-by-request',
    'destination-id-forbidden-by-policy',
    'disclosure-mode-unsupported',
    'encryption-profile-unsupported',
    'freshness-unsupported',
    'managed-destination-disallowed-by-policy',
    'operation-unsupported',
    'purpose-unsupported',
    'recovery-importance-unsupported',
    'residency-evidence-insufficient',
    'residency-region-mismatch',
    'retention-window-unsupported'
  ]);
});

test('owner-scope mismatch rejects the entire evaluation', () => {
  const request = makeRequest({ owner_scope: 'owner:request' });
  const policy = makePolicy({ owner_scope: 'owner:other' });
  assert.throws(
    () => evaluateStatePlacement({ request, policy, destinations: [makeDestination()], now: NOW }),
    /policy owner scope does not match request owner scope/
  );
});

test('operation disallowed by policy rejects the entire evaluation', () => {
  const request = makeRequest({ operation_class: 'replicate' });
  const policy = makePolicy({ allowed_operations: ['cache'] });
  assert.throws(
    () => evaluateStatePlacement({ request, policy, destinations: [makeDestination()], now: NOW }),
    /operation is disallowed by placement policy/
  );
});

test('availability target can remain unsatisfied without weakening constraints', () => {
  const request = makeRequest({ availability_target: { minimum_replicas: 2, minimum_failure_domains: 2 } });
  const policy = makePolicy();
  const only = makeDestination({ destination_id: 'dest:only', failure_domain: 'fd:only' });
  const plan = evaluateStatePlacement({ request, policy, destinations: [only], now: NOW });
  assert.equal(plan.satisfied, false);
  assert.equal(plan.availability_result.eligible_replicas, 1);
  assert.equal(plan.availability_result.eligible_failure_domains, 1);
  assert.equal(plan.eligible_destinations.length, 1);
});

test('policy candidate ceiling fails closed instead of truncating eligible destinations', () => {
  const request = makeRequest({ availability_target: { minimum_replicas: 1, minimum_failure_domains: 1 } });
  const policy = makePolicy({ maximum_eligible_destinations: 2 });
  const destinations = [
    makeDestination({ destination_id: 'dest:c', failure_domain: 'fd:c' }),
    makeDestination({ destination_id: 'dest:a', failure_domain: 'fd:a' }),
    makeDestination({ destination_id: 'dest:b', failure_domain: 'fd:b' })
  ];
  assert.throws(
    () => evaluateStatePlacement({ request, policy, destinations, now: NOW }),
    /maximum_eligible_destinations|eligible destination ceiling/
  );
});

test('duplicate destination identities and duplicate profile digests fail closed', () => {
  const request = makeRequest();
  const policy = makePolicy();
  const a = makeDestination({ destination_id: 'dest:dup' });
  const b = makeDestination({ destination_id: 'dest:dup', failure_domain: 'fd:other' });
  assert.throws(() => evaluateStatePlacement({ request, policy, destinations: [a, b], now: NOW }), /duplicate destination_id/);

  const first = makeDestination({ destination_id: 'dest:first' });
  const second = { ...makeDestination({ destination_id: 'dest:second' }), profile_digest: first.profile_digest };
  assert.throws(() => evaluateStatePlacement({ request, policy, destinations: [first, second], now: NOW }), /duplicate profile_digest|profile_digest/);
});

test('more than 64 candidate destinations fails closed', () => {
  const request = makeRequest();
  const policy = makePolicy({ maximum_eligible_destinations: 64 });
  const destinations = Array.from({ length: 65 }, (_, index) => makeDestination({
    destination_id: `dest:${String(index).padStart(2, '0')}`,
    failure_domain: `fd:${String(index).padStart(2, '0')}`
  }));
  assert.throws(() => evaluateStatePlacement({ request, policy, destinations, now: NOW }), /64|candidate/);
});
