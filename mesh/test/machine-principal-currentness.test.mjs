import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MACHINE_PRINCIPAL_CURRENTNESS_SCHEMA,
  evaluateMachinePrincipalCurrentness,
  machinePrincipalAdmissionDigest,
  normalizeMachinePrincipalCurrentness
} from '../src/lib/machine-principal-currentness.mjs';

const AUTHORITY = 'a'.repeat(64);
const INTENT = 'b'.repeat(64);
const PLAN = 'c'.repeat(64);
const HEAD = 'd'.repeat(64);
const PREVIOUS = 'e'.repeat(64);
const NOW = new Date('2026-09-01T16:00:00.000Z');

function admission(overrides = {}) {
  return machinePrincipalAdmissionDigest({
    principalId: 'agent.fixture.1',
    principalType: 'agent',
    authorityDigest: AUTHORITY,
    capabilityId: 'cap_fixture_1',
    intentDigest: INTENT,
    planDigest: PLAN,
    effectDestination: 'local',
    ...overrides
  });
}

function proof(overrides = {}) {
  return {
    schema: MACHINE_PRINCIPAL_CURRENTNESS_SCHEMA,
    principal_id: 'agent.fixture.1',
    principal_type: 'agent',
    authority_digest: AUTHORITY,
    status: 'active',
    sequence: 7,
    observed_at: '2026-09-01T15:59:59.500Z',
    source_head_digest: HEAD,
    predecessor_head_digest: PREVIOUS,
    admission_digest: admission(),
    authority_effect: 'none',
    execution_authority_granted: false,
    global_currentness_claimed: false,
    ...overrides
  };
}

function evaluate(currentness, overrides = {}) {
  return evaluateMachinePrincipalCurrentness({
    currentness,
    expectedPrincipalId: 'agent.fixture.1',
    expectedPrincipalType: 'agent',
    expectedAuthorityDigest: AUTHORITY,
    expectedAdmissionDigest: admission(),
    now: NOW,
    maxAgeMs: 1_000,
    retainedSequence: 7,
    retainedHeadDigest: HEAD,
    ...overrides
  });
}

test('current active authority bound to the exact pending admission is admissible evidence only', () => {
  const result = evaluate(proof());
  assert.equal(result.allow, true);
  assert.equal(result.code, 'machine_currentness_satisfied');
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.execution_authority_granted, false);
  assert.equal(result.global_currentness_claimed, false);
});

test('revoked, compromised, expired, and narrowed authority fail closed', () => {
  for (const status of ['revoked', 'compromised', 'expired', 'narrowed']) {
    const result = evaluate(proof({ status }));
    assert.equal(result.allow, false);
    assert.equal(result.code, `machine_currentness_${status}`);
  }
});

test('authority narrowing invalidates an otherwise live old capability digest', () => {
  const result = evaluate(proof({ authority_digest: 'f'.repeat(64) }));
  assert.deepEqual(result, {
    allow: false,
    code: 'machine_currentness_authority_changed',
    authority_effect: 'none',
    execution_authority_granted: false,
    global_currentness_claimed: false
  });
});

test('currentness evidence is bound to principal type and exact pending admission', () => {
  assert.equal(
    evaluate(proof({ principal_id: 'agent.other' })).code,
    'machine_currentness_principal_mismatch'
  );
  assert.equal(
    evaluate(proof({ principal_type: 'service' })).code,
    'machine_currentness_principal_type_mismatch'
  );
  assert.equal(
    evaluate(proof({ admission_digest: admission({ capabilityId: 'cap_other' }) })).code,
    'machine_currentness_admission_mismatch'
  );
});

test('stale, future-dated, rollback, and equivocation currentness fail closed', () => {
  assert.equal(
    evaluate(proof({ observed_at: '2026-09-01T15:59:58.000Z' })).code,
    'machine_currentness_stale'
  );
  assert.equal(
    evaluate(proof({ observed_at: '2026-09-01T16:00:00.100Z' })).code,
    'machine_currentness_stale'
  );
  assert.equal(evaluate(proof({ sequence: 6 })).code, 'machine_currentness_rollback');
  assert.equal(
    evaluate(proof({ source_head_digest: '1'.repeat(64) })).code,
    'machine_currentness_equivocation'
  );
});

test('currentness schema rejects unsupported fields and authority/global-currentness claims', () => {
  assert.throws(
    () => normalizeMachinePrincipalCurrentness(proof({ surprise: true })),
    /unsupported field/
  );
  assert.throws(
    () => normalizeMachinePrincipalCurrentness(proof({ authority_effect: 'grant' })),
    /non-authorizing/
  );
  assert.throws(
    () => normalizeMachinePrincipalCurrentness(proof({ execution_authority_granted: true })),
    /non-authorizing/
  );
  assert.throws(
    () => normalizeMachinePrincipalCurrentness(proof({ global_currentness_claimed: true })),
    /global currentness/
  );
});
