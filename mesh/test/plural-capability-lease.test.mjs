import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { digestObject } from '../src/lib/canonical.mjs';
import {
  PLURAL_CAPABILITY_LEASE_CANDIDATE_SCHEMA,
  evaluatePluralCapabilityLeaseCandidate
} from '../src/lib/plural-capability-lease.mjs';

const scope = Object.freeze({
  principal_ref: 'principal:training-operator-01',
  capability_ref: 'capability:high-consequence-compute',
  purpose: 'purpose:bounded-training-run',
  resource_ref: 'resource:accelerator-cluster-01',
  effect_class: 'effect:compute-training',
  consequence_ceiling: 4,
  max_uses: 1,
  max_cost_minor_units: 500000
});

const scopeDigest = digestObject(scope);

function approval({
  id,
  approver,
  authorityClass,
  domain,
  evidence = 'a'.repeat(64),
  approvalScopeDigest = scopeDigest,
  issuedAt = '2026-09-18T18:00:00.000Z',
  expiresAt = '2026-09-18T22:00:00.000Z',
  currentness = 'current'
}) {
  return {
    approval_id: id,
    approver_ref: approver,
    authority_class: authorityClass,
    authority_domain: domain,
    evidence_digest: evidence,
    scope_digest: approvalScopeDigest,
    issued_at: issuedAt,
    expires_at: expiresAt,
    currentness
  };
}

function candidate() {
  return {
    schema: PLURAL_CAPABILITY_LEASE_CANDIDATE_SCHEMA,
    candidate_id: 'lease-candidate:training-001',
    evaluation_time: '2026-09-18T19:00:00.000Z',
    lease_window: {
      valid_from: '2026-09-18T19:00:00.000Z',
      expires_at: '2026-09-18T21:00:00.000Z'
    },
    scope: { ...scope },
    policy: {
      threshold: 3,
      required_authority_classes: [
        'class:operator',
        'class:independent-safety',
        'class:governance'
      ],
      min_distinct_authority_domains: 3,
      max_duration_seconds: 10800,
      renewal_requires_fresh_approvals: true,
      lease_can_self_renew: false
    },
    approvals: [
      approval({
        id: 'approval:operator-001',
        approver: 'principal:operator-01',
        authorityClass: 'class:operator',
        domain: 'domain:operator',
        evidence: 'a'.repeat(64)
      }),
      approval({
        id: 'approval:safety-001',
        approver: 'principal:safety-reviewer-01',
        authorityClass: 'class:independent-safety',
        domain: 'domain:safety-lab',
        evidence: 'b'.repeat(64)
      }),
      approval({
        id: 'approval:governance-001',
        approver: 'principal:governance-01',
        authorityClass: 'class:governance',
        domain: 'domain:governance',
        evidence: 'c'.repeat(64)
      })
    ],
    safety: {
      authority_effect: 'none',
      runtime_activation: false,
      capability_registry_change: false,
      requires_effect_admission: true
    }
  };
}

test('current independent threshold approvals produce only an eligible inert candidate', () => {
  const result = evaluatePluralCapabilityLeaseCandidate(candidate());

  assert.equal(result.valid, true);
  assert.equal(result.eligible, true);
  assert.deepEqual(result.reason_codes, []);
  assert.equal(result.counted_approvals, 3);
  assert.equal(result.distinct_authority_domains, 3);
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.runtime_activation, false);
  assert.equal(result.capability_registry_change, false);
  assert.equal(result.requires_effect_admission, true);
});

test('insufficient approval count fails closed', () => {
  const value = candidate();
  value.approvals.pop();

  const result = evaluatePluralCapabilityLeaseCandidate(value);

  assert.equal(result.eligible, false);
  assert.ok(result.reason_codes.includes('approval_threshold_unsatisfied'));
});

test('duplicate approver cannot increase the threshold count', () => {
  const value = candidate();
  value.approvals[2].approver_ref = value.approvals[1].approver_ref;

  assert.throws(
    () => evaluatePluralCapabilityLeaseCandidate(value),
    /approver_ref values must be unique/
  );
});

test('missing required authority class fails closed', () => {
  const value = candidate();
  value.approvals[2].authority_class = 'class:operator';

  const result = evaluatePluralCapabilityLeaseCandidate(value);

  assert.equal(result.eligible, false);
  assert.ok(
    result.reason_codes.includes('required_authority_class_missing:class:governance')
  );
});

test('distinct authority-domain floor prevents same-hierarchy threshold laundering', () => {
  const value = candidate();
  for (const item of value.approvals) item.authority_domain = 'domain:one-hierarchy';

  const result = evaluatePluralCapabilityLeaseCandidate(value);

  assert.equal(result.eligible, false);
  assert.ok(
    result.reason_codes.includes('distinct_authority_domain_floor_unsatisfied')
  );
});

test('approval scope mismatch cannot support the candidate', () => {
  const value = candidate();
  value.approvals[0].scope_digest = 'd'.repeat(64);

  const result = evaluatePluralCapabilityLeaseCandidate(value);

  assert.equal(result.eligible, false);
  assert.ok(result.reason_codes.includes('approval_scope_mismatch'));
  assert.ok(result.reason_codes.includes('approval_threshold_unsatisfied'));
});

test('revoked approval fails closed', () => {
  const value = candidate();
  value.approvals[0].currentness = 'revoked';

  const result = evaluatePluralCapabilityLeaseCandidate(value);

  assert.equal(result.eligible, false);
  assert.ok(result.reason_codes.includes('approval_revoked'));
});

test('unknown approval currentness fails closed', () => {
  const value = candidate();
  value.approvals[0].currentness = 'unknown';

  const result = evaluatePluralCapabilityLeaseCandidate(value);

  assert.equal(result.eligible, false);
  assert.ok(result.reason_codes.includes('approval_currentness_unknown'));
});

test('expired approval fails closed', () => {
  const value = candidate();
  value.approvals[0].expires_at = '2026-09-18T18:59:59.999Z';

  const result = evaluatePluralCapabilityLeaseCandidate(value);

  assert.equal(result.eligible, false);
  assert.ok(result.reason_codes.includes('approval_expired'));
});

test('candidate lease cannot outlive any supporting approval', () => {
  const value = candidate();
  value.approvals[0].expires_at = '2026-09-18T20:00:00.000Z';

  const result = evaluatePluralCapabilityLeaseCandidate(value);

  assert.equal(result.eligible, false);
  assert.ok(result.reason_codes.includes('lease_outlives_supporting_approval'));
});

test('candidate lease duration cannot exceed policy maximum', () => {
  const value = candidate();
  value.policy.max_duration_seconds = 3600;

  const result = evaluatePluralCapabilityLeaseCandidate(value);

  assert.equal(result.eligible, false);
  assert.ok(
    result.reason_codes.includes('lease_duration_exceeds_policy_maximum')
  );
});

test('evaluation outside lease active window fails closed', () => {
  const before = candidate();
  before.evaluation_time = '2026-09-18T18:59:59.999Z';
  let result = evaluatePluralCapabilityLeaseCandidate(before);
  assert.equal(result.eligible, false);
  assert.ok(result.reason_codes.includes('lease_not_yet_active'));

  const after = candidate();
  after.evaluation_time = '2026-09-18T21:00:00.000Z';
  result = evaluatePluralCapabilityLeaseCandidate(after);
  assert.equal(result.eligible, false);
  assert.ok(result.reason_codes.includes('lease_expired'));
});

test('semantic approval reordering produces the same candidate digest', () => {
  const left = candidate();
  const right = candidate();
  right.approvals.reverse();

  const leftResult = evaluatePluralCapabilityLeaseCandidate(left);
  const rightResult = evaluatePluralCapabilityLeaseCandidate(right);

  assert.equal(leftResult.candidate_digest, rightResult.candidate_digest);
});

test('renewal cannot self-authorize or bypass fresh approvals', () => {
  const selfRenew = candidate();
  selfRenew.policy.lease_can_self_renew = true;
  assert.throws(
    () => evaluatePluralCapabilityLeaseCandidate(selfRenew),
    /cannot self-renew/
  );

  const staleRenewal = candidate();
  staleRenewal.policy.renewal_requires_fresh_approvals = false;
  assert.throws(
    () => evaluatePluralCapabilityLeaseCandidate(staleRenewal),
    /renewal requires fresh approvals/
  );
});

test('authority and runtime smuggling fields fail closed', () => {
  const value = candidate();
  value.authorized = true;

  assert.throws(
    () => evaluatePluralCapabilityLeaseCandidate(value),
    /unsupported field authorized/
  );

  const unsafe = candidate();
  unsafe.safety.runtime_activation = true;
  assert.throws(
    () => evaluatePluralCapabilityLeaseCandidate(unsafe),
    /runtime_activation must be false/
  );

  const promoted = candidate();
  promoted.safety.capability_registry_change = true;
  assert.throws(
    () => evaluatePluralCapabilityLeaseCandidate(promoted),
    /capability_registry_change must be false/
  );
});

test('malformed and ambiguous policy inputs are rejected rather than guessed', () => {
  const duplicateClass = candidate();
  duplicateClass.policy.required_authority_classes = [
    'class:operator',
    'class:operator'
  ];
  assert.throws(
    () => evaluatePluralCapabilityLeaseCandidate(duplicateClass),
    /must not contain duplicates/
  );

  const impossibleIndependence = candidate();
  impossibleIndependence.policy.threshold = 2;
  impossibleIndependence.policy.min_distinct_authority_domains = 3;
  assert.throws(
    () => evaluatePluralCapabilityLeaseCandidate(impossibleIndependence),
    /cannot exceed policy.threshold/
  );
});

test('evaluator source has no effect-capable runtime imports', async () => {
  const sourceUrl = new URL(
    '../src/lib/plural-capability-lease.mjs',
    import.meta.url
  );
  const source = await readFile(sourceUrl, 'utf8');

  for (const forbidden of [
    "node:fs",
    "node:net",
    "node:http",
    "node:https",
    "node:child_process",
    "gateway",
    "credentials"
  ]) {
    assert.equal(
      source.includes(forbidden),
      false,
      `evaluator source must not import or reference ${forbidden}`
    );
  }
});
