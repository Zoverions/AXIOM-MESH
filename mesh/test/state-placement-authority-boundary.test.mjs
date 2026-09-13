import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  contractDigest,
  verifyStatePlacementPlan
} from '../src/lib/state-placement-contracts.mjs';
import { evaluateStatePlacement } from '../src/lib/state-placement-policy.mjs';

const vectors = JSON.parse(await readFile(
  new URL('../fixtures/state-placement/s0-vectors.json', import.meta.url),
  'utf8'
));
const NOW = vectors.now;
const LATER = '2026-09-11T20:10:00.000Z';

function withDigest(value, field) {
  return { ...value, [field]: contractDigest(value, field) };
}

function rawPolicy(overrides = {}) {
  return {
    schema: 'axiom-state-placement-policy.v0', version: 0, status: 'inert-contract-laboratory',
    policy_id: 'placement-policy:vector', owner_scope: 'owner:vector',
    allowed_operations: ['replicate'], allowed_destination_classes: ['managed-object', 'owner-peer'],
    forbidden_destination_ids: [], minimum_residency_evidence_level: 'provider-configured',
    managed_destinations_allowed: true, maximum_eligible_destinations: 64, maximum_plan_lifetime_ms: 600000,
    created_at: NOW, expires_at: LATER,
    authority_effect: 'none', network_effect: 'none', provider_effect: 'none', canonical_state_effect: 'none',
    ...overrides
  };
}

function rawRequest(policyDigest, overrides = {}) {
  return {
    schema: 'axiom-state-placement-request.v1', version: 1, status: 'inert-contract-laboratory',
    request_id: 'placement:req:vector', owner_scope: 'owner:vector', source_state_family: 'memory.graph',
    operation_class: 'replicate', purpose: 'owner-recovery', data_class: 'owner-private-memory',
    confidentiality_requirement: 'sensitive', disclosure_ceiling: 'ciphertext-only',
    residency: { allowed_regions: ['CA'], minimum_evidence_level: 'provider-configured' },
    permitted_destination_classes: ['managed-object', 'owner-peer'], forbidden_destination_classes: [],
    retention: { minimum_days: 7, maximum_days: 365 },
    availability_target: { minimum_replicas: 1, minimum_failure_domains: 1 },
    maximum_lag_ms: 300000, consistency_class: 'bounded-lag-replica',
    encryption_profile: 'profile:encrypted-replica-v1', recovery_importance: 'important',
    cost_ceiling_units: 1000, consequence_class: 'C2', policy_profile_digest: policyDigest,
    created_at: NOW, expires_at: LATER, contains_secret_material: false,
    authority_effect: 'none', network_effect: 'none', provider_effect: 'none', canonical_state_effect: 'none',
    ...overrides
  };
}

function rawDestination(overrides = {}) {
  return {
    schema: 'axiom-state-destination-profile.v0', version: 0, status: 'inert-contract-laboratory',
    destination_id: 'dest:vector', destination_class: 'managed-object', failure_domain: 'fd:vector', regions: ['CA'],
    residency_evidence_level: 'provider-configured', owner_controlled: false, managed_provider: true,
    allowed_operations: ['replicate'], allowed_purposes: ['owner-recovery'], allowed_data_classes: ['owner-private-memory'],
    maximum_confidentiality: 'restricted', disclosure_modes: ['ciphertext-only'],
    retention_days: { minimum: 1, maximum: 3650 }, maximum_lag_ms: 300000,
    consistency_classes: ['bounded-lag-replica'], encryption_profiles: ['profile:encrypted-replica-v1'],
    recovery_importance_supported: ['important'], cost_units: 100,
    observed_at: NOW, expires_at: LATER, contains_secret_material: false,
    authority_effect: 'none', network_effect: 'none', provider_effect: 'none', canonical_state_effect: 'none',
    ...overrides
  };
}

function evaluateFixture(fixture) {
  const policy = withDigest(rawPolicy(fixture.policy), 'policy_digest');
  const request = withDigest(rawRequest(policy.policy_digest, fixture.request), 'request_digest');
  const destinations = fixture.destinations.map((overrides) => withDigest(rawDestination(overrides), 'profile_digest'));
  return evaluateStatePlacement({ request, policy, destinations, now: NOW });
}

for (const fixture of vectors.cases) {
  test(`state placement vector: ${fixture.name}`, () => {
    const result = evaluateFixture(fixture);
    assert.equal(result.satisfied, fixture.expected.satisfied);
    assert.deepEqual(
      result.eligible_destinations.map((item) => item.destination_id),
      fixture.expected.eligible_destination_ids
    );
    assert.deepEqual(
      Object.fromEntries(result.ineligible_destinations.map((item) => [item.destination_id, item.reason_codes])),
      fixture.expected.ineligible
    );
  });
}

test('S0 placement modules have no I/O or authority-path imports', async () => {
  const modules = [
    new URL('../src/lib/state-placement-contracts.mjs', import.meta.url),
    new URL('../src/lib/state-placement-policy.mjs', import.meta.url)
  ];
  const forbidden = [
    'node:http', 'node:https', 'node:net', 'node:tls',
    'node:fs', 'node:fs/promises', 'node:child_process',
    '../gateway', '../hypervisor', '../sandbox', '../grid',
    'provider-supervisor', 'runtime-connector', 'credential'
  ];
  for (const url of modules) {
    const source = await readFile(url, 'utf8');
    for (const dependency of forbidden) {
      assert.equal(source.includes(dependency), false, `${url.pathname} contains forbidden dependency ${dependency}`);
    }
  }
});

test('request must bind the exact policy digest', () => {
  const policy = withDigest(rawPolicy(), 'policy_digest');
  const request = withDigest(rawRequest(`sha256:${'f'.repeat(64)}`), 'request_digest');
  const destination = withDigest(rawDestination(), 'profile_digest');
  assert.throws(() => evaluateStatePlacement({ request, policy, destinations: [destination], now: NOW }), /policy_profile_digest/);
});

test('stale request, policy, and destination profiles fail closed', () => {
  const policy = withDigest(rawPolicy(), 'policy_digest');
  const expiredRequest = withDigest(rawRequest(policy.policy_digest, { expires_at: NOW }), 'request_digest');
  const destination = withDigest(rawDestination(), 'profile_digest');
  assert.throws(() => evaluateStatePlacement({ request: expiredRequest, policy, destinations: [destination], now: NOW }), /time window|lifetime/);

  const expiredPolicy = withDigest(rawPolicy({ expires_at: NOW }), 'policy_digest');
  const requestForExpiredPolicy = withDigest(rawRequest(expiredPolicy.policy_digest), 'request_digest');
  assert.throws(() => evaluateStatePlacement({ request: requestForExpiredPolicy, policy: expiredPolicy, destinations: [destination], now: NOW }), /time window|expires_at/);

  const expiredDestination = withDigest(rawDestination({ expires_at: NOW }), 'profile_digest');
  const validRequest = withDigest(rawRequest(policy.policy_digest), 'request_digest');
  assert.throws(() => evaluateStatePlacement({ request: validRequest, policy, destinations: [expiredDestination], now: NOW }), /time window|expires_at/);
});

test('digest substitution and unknown semantic values fail closed', () => {
  const policy = withDigest(rawPolicy(), 'policy_digest');
  const request = withDigest(rawRequest(policy.policy_digest), 'request_digest');
  const destination = withDigest(rawDestination(), 'profile_digest');

  assert.throws(() => evaluateStatePlacement({ request: { ...request, request_digest: `sha256:${'0'.repeat(64)}` }, policy, destinations: [destination], now: NOW }), /request_digest digest mismatch/);
  assert.throws(() => evaluateStatePlacement({ request, policy: { ...policy, policy_digest: `sha256:${'0'.repeat(64)}` }, destinations: [destination], now: NOW }), /policy_digest digest mismatch/);
  assert.throws(() => evaluateStatePlacement({ request, policy, destinations: [{ ...destination, profile_digest: `sha256:${'0'.repeat(64)}` }], now: NOW }), /profile_digest digest mismatch/);

  const unknownClass = withDigest(rawDestination({ destination_class: 'mystery-store' }), 'profile_digest');
  assert.throws(() => evaluateStatePlacement({ request, policy, destinations: [unknownClass], now: NOW }), /destination_class is invalid/);
  const unknownEvidence = withDigest(rawDestination({ residency_evidence_level: 'marketing-claim' }), 'profile_digest');
  assert.throws(() => evaluateStatePlacement({ request, policy, destinations: [unknownEvidence], now: NOW }), /residency_evidence_level is invalid/);
  const elevated = withDigest(rawDestination({ provider_effect: 'write' }), 'profile_digest');
  assert.throws(() => evaluateStatePlacement({ request, policy, destinations: [elevated], now: NOW }), /effect boundary/);
});

test('tampered plan digest and elevated plan effects fail closed', () => {
  const plan = evaluateFixture(vectors.cases.find((item) => item.name === 'allow_managed_object_ca'));
  assert.throws(() => verifyStatePlacementPlan({ ...plan, plan_digest: `sha256:${'0'.repeat(64)}` }), /plan_digest digest mismatch/);
  const elevated = { ...plan, provider_effect: 'provider-write' };
  elevated.plan_digest = contractDigest(elevated, 'plan_digest');
  assert.throws(() => verifyStatePlacementPlan(elevated), /effect boundary/);
});
