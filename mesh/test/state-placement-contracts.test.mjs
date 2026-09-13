import test from 'node:test';
import assert from 'node:assert/strict';
import {
  contractDigest,
  verifyStatePlacementRequest,
  verifyStateDestinationProfile,
  verifyStatePlacementPolicy,
  verifyStatePlacementPlan
} from '../src/lib/state-placement-contracts.mjs';

const NOW = '2026-09-11T20:00:00.000Z';
const LATER = '2026-09-11T20:10:00.000Z';
const POLICY_DIGEST = `sha256:${'1'.repeat(64)}`;
const PROFILE_DIGEST = `sha256:${'2'.repeat(64)}`;

function withDigest(value, field) {
  return { ...value, [field]: contractDigest(value, field) };
}

function requestFixture(overrides = {}) {
  return withDigest({
    schema: 'axiom-state-placement-request.v1',
    version: 1,
    status: 'inert-contract-laboratory',
    request_id: 'placement:req:1',
    owner_scope: 'owner:fixture',
    source_state_family: 'memory.graph',
    operation_class: 'replicate',
    purpose: 'owner-recovery',
    data_class: 'owner-private-memory',
    confidentiality_requirement: 'sensitive',
    disclosure_ceiling: 'ciphertext-only',
    residency: {
      allowed_regions: ['CA'],
      minimum_evidence_level: 'provider-configured'
    },
    permitted_destination_classes: ['managed-object', 'owner-peer'],
    forbidden_destination_classes: [],
    retention: { minimum_days: 7, maximum_days: 365 },
    availability_target: { minimum_replicas: 1, minimum_failure_domains: 1 },
    maximum_lag_ms: 300000,
    consistency_class: 'bounded-lag-replica',
    encryption_profile: 'profile:encrypted-replica-v1',
    recovery_importance: 'important',
    cost_ceiling_units: 1000,
    consequence_class: 'C2',
    policy_profile_digest: POLICY_DIGEST,
    created_at: NOW,
    expires_at: LATER,
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    provider_effect: 'none',
    canonical_state_effect: 'none',
    ...overrides
  }, 'request_digest');
}

function destinationFixture(overrides = {}) {
  return withDigest({
    schema: 'axiom-state-destination-profile.v0',
    version: 0,
    status: 'inert-contract-laboratory',
    destination_id: 'destination:managed:ca1',
    destination_class: 'managed-object',
    failure_domain: 'failure-domain:provider-a-ca1',
    regions: ['CA'],
    residency_evidence_level: 'provider-configured',
    owner_controlled: false,
    managed_provider: true,
    allowed_operations: ['replicate'],
    allowed_purposes: ['owner-recovery'],
    allowed_data_classes: ['owner-private-memory'],
    maximum_confidentiality: 'restricted',
    disclosure_modes: ['ciphertext-only'],
    retention_days: { minimum: 1, maximum: 3650 },
    maximum_lag_ms: 300000,
    consistency_classes: ['bounded-lag-replica'],
    encryption_profiles: ['profile:encrypted-replica-v1'],
    recovery_importance_supported: ['important'],
    cost_units: 100,
    observed_at: NOW,
    expires_at: LATER,
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    provider_effect: 'none',
    canonical_state_effect: 'none',
    ...overrides
  }, 'profile_digest');
}

function policyFixture(overrides = {}) {
  return withDigest({
    schema: 'axiom-state-placement-policy.v0',
    version: 0,
    status: 'inert-contract-laboratory',
    policy_id: 'placement-policy:owner:fixture',
    owner_scope: 'owner:fixture',
    allowed_operations: ['replicate'],
    allowed_destination_classes: ['managed-object', 'owner-peer'],
    forbidden_destination_ids: [],
    minimum_residency_evidence_level: 'provider-configured',
    managed_destinations_allowed: true,
    maximum_eligible_destinations: 4,
    maximum_plan_lifetime_ms: 600000,
    created_at: NOW,
    expires_at: LATER,
    authority_effect: 'none',
    network_effect: 'none',
    provider_effect: 'none',
    canonical_state_effect: 'none',
    ...overrides
  }, 'policy_digest');
}

function planFixture(overrides = {}) {
  return withDigest({
    schema: 'axiom-state-placement-plan.v1',
    version: 1,
    status: 'inert-contract-laboratory',
    plan_id: 'placement:plan:1',
    request_id: 'placement:req:1',
    request_digest: `sha256:${'3'.repeat(64)}`,
    policy_id: 'placement-policy:owner:fixture',
    policy_digest: POLICY_DIGEST,
    evaluated_at: NOW,
    expires_at: LATER,
    satisfied: true,
    eligible_destinations: [{
      destination_id: 'destination:managed:ca1',
      destination_class: 'managed-object',
      profile_digest: PROFILE_DIGEST,
      failure_domain: 'failure-domain:provider-a-ca1',
      required_encryption_profile: 'profile:encrypted-replica-v1',
      receipt_required: true
    }],
    ineligible_destinations: [],
    availability_result: {
      required_replicas: 1,
      eligible_replicas: 1,
      required_failure_domains: 1,
      eligible_failure_domains: 1
    },
    authority_effect: 'none',
    network_effect: 'none',
    provider_effect: 'none',
    canonical_state_effect: 'none',
    ...overrides
  }, 'plan_digest');
}

test('placement request is closed, bounded, and self-digesting', () => {
  const value = requestFixture();
  assert.equal(verifyStatePlacementRequest(value, { now: NOW }).request_digest, value.request_digest);
  assert.throws(
    () => verifyStatePlacementRequest({ ...value, provider_token: 'secret' }, { now: NOW }),
    /unknown field|unsupported field/
  );
});

test('destination profile is closed and self-digesting', () => {
  const value = destinationFixture();
  assert.equal(verifyStateDestinationProfile(value, { now: NOW }).profile_digest, value.profile_digest);
  assert.throws(
    () => verifyStateDestinationProfile({ ...value, endpoint: 'https://example.invalid' }, { now: NOW }),
    /unknown field|unsupported field/
  );
});

test('placement policy is closed and self-digesting', () => {
  const value = policyFixture();
  assert.equal(verifyStatePlacementPolicy(value, { now: NOW }).policy_digest, value.policy_digest);
  assert.throws(
    () => verifyStatePlacementPolicy({ ...value, ambient_authority: true }, { now: NOW }),
    /unknown field|unsupported field/
  );
});

test('placement plan is closed, sorted, non-authorizing, and self-digesting', () => {
  const value = planFixture();
  const verified = verifyStatePlacementPlan(value);
  assert.equal(verified.plan_digest, value.plan_digest);
  assert.equal(verified.authority_effect, 'none');
  assert.equal(verified.provider_effect, 'none');
});

test('contract verification rejects malformed digests and unsafe effect elevation', () => {
  const request = requestFixture();
  assert.throws(
    () => verifyStatePlacementRequest({ ...request, request_digest: 'sha256:not-a-digest' }, { now: NOW }),
    /digest/
  );
  const elevated = requestFixture({ authority_effect: 'grant' });
  assert.throws(() => verifyStatePlacementRequest(elevated, { now: NOW }), /effect|boundary|authority/);
});

test('request rejects duplicate regions, invalid enums, invalid lifetimes, and secret material', () => {
  assert.throws(
    () => verifyStatePlacementRequest(requestFixture({
      residency: { allowed_regions: ['CA', 'CA'], minimum_evidence_level: 'provider-configured' }
    }), { now: NOW }),
    /duplicate/
  );
  assert.throws(
    () => verifyStatePlacementRequest(requestFixture({ operation_class: 'teleport' }), { now: NOW }),
    /operation_class|invalid/
  );
  assert.throws(
    () => verifyStatePlacementRequest(requestFixture({ expires_at: NOW }), { now: NOW }),
    /expires_at|lifetime|window/
  );
  assert.throws(
    () => verifyStatePlacementRequest(requestFixture({ expires_at: '2026-09-11T20:16:00.000Z' }), { now: NOW }),
    /900000|15|lifetime|window/
  );
  assert.throws(
    () => verifyStatePlacementRequest(requestFixture({ contains_secret_material: true }), { now: NOW }),
    /secret/
  );
});

test('destination rejects duplicate regions, invalid ownership/provider pairing, and expiry', () => {
  assert.throws(
    () => verifyStateDestinationProfile(destinationFixture({ regions: ['CA', 'CA'] }), { now: NOW }),
    /duplicate/
  );
  assert.throws(
    () => verifyStateDestinationProfile(destinationFixture({ owner_controlled: true, managed_provider: true }), { now: NOW }),
    /managed_provider|owner_controlled/
  );
  assert.throws(
    () => verifyStateDestinationProfile(destinationFixture({ expires_at: NOW }), { now: NOW }),
    /expires_at|expired|window/
  );
});

test('policy rejects invalid bounds and stale policy windows', () => {
  assert.throws(
    () => verifyStatePlacementPolicy(policyFixture({ maximum_eligible_destinations: 65 }), { now: NOW }),
    /64|maximum_eligible_destinations/
  );
  assert.throws(
    () => verifyStatePlacementPolicy(policyFixture({ maximum_plan_lifetime_ms: 900001 }), { now: NOW }),
    /900000|maximum_plan_lifetime_ms/
  );
  assert.throws(
    () => verifyStatePlacementPolicy(policyFixture({ expires_at: NOW }), { now: NOW }),
    /expires_at|expired|window/
  );
});

test('plan rejects unsorted destinations, duplicate reason codes, overlap, and effect elevation', () => {
  const first = planFixture();
  const eligible = first.eligible_destinations[0];
  const other = { ...eligible, destination_id: 'destination:managed:aa0', profile_digest: `sha256:${'4'.repeat(64)}` };
  const unsorted = planFixture({ eligible_destinations: [eligible, other] });
  assert.throws(() => verifyStatePlacementPlan(unsorted), /sorted|destination_id/);

  const duplicateReason = planFixture({
    eligible_destinations: [],
    ineligible_destinations: [{
      destination_id: 'destination:managed:ca1',
      destination_class: 'managed-object',
      profile_digest: PROFILE_DIGEST,
      reason_codes: ['cost-ceiling-exceeded', 'cost-ceiling-exceeded']
    }],
    satisfied: false,
    availability_result: {
      required_replicas: 1,
      eligible_replicas: 0,
      required_failure_domains: 1,
      eligible_failure_domains: 0
    }
  });
  assert.throws(() => verifyStatePlacementPlan(duplicateReason), /duplicate|reason_codes/);

  const overlap = planFixture({
    ineligible_destinations: [{
      destination_id: 'destination:managed:ca1',
      destination_class: 'managed-object',
      profile_digest: PROFILE_DIGEST,
      reason_codes: ['cost-ceiling-exceeded']
    }]
  });
  assert.throws(() => verifyStatePlacementPlan(overlap), /both|overlap/);

  const elevated = planFixture({ provider_effect: 'write' });
  assert.throws(() => verifyStatePlacementPlan(elevated), /effect|boundary|provider/);
});
