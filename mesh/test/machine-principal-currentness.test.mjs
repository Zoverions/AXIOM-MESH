import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MACHINE_PRINCIPAL_CURRENTNESS_SCHEMA,
  MACHINE_PRINCIPAL_EFFECT_CURRENTNESS_EVALUATION_SCHEMA,
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

function state(overrides = {}) {
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

test('current active lifecycle state yields admission-bound non-authorizing evaluation evidence', () => {
  const result = evaluate(state());
  assert.equal(result.allow, true);
  assert.equal(result.code, 'machine_currentness_satisfied');
  assert.equal(result.schema, MACHINE_PRINCIPAL_EFFECT_CURRENTNESS_EVALUATION_SCHEMA);
  assert.equal(result.admission_digest, admission());
  assert.match(result.currentness_evidence_digest, /^[a-f0-9]{64}$/);
  assert.match(result.effect_currentness_evaluation_digest, /^[a-f0-9]{64}$/);
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.execution_authority_granted, false);
  assert.equal(result.global_currentness_claimed, false);
});

test('same lifecycle state binds to different pending admissions only at evaluation time', () => {
  const first = evaluate(state());
  const secondAdmission = admission({ capabilityId: 'cap_fixture_2' });
  const second = evaluate(state(), { expectedAdmissionDigest: secondAdmission });
  assert.equal(first.currentness_evidence_digest, second.currentness_evidence_digest);
  assert.notEqual(first.admission_digest, second.admission_digest);
  assert.notEqual(
    first.effect_currentness_evaluation_digest,
    second.effect_currentness_evaluation_digest
  );
});

test('revoked, compromised, expired, and narrowed authority fail closed', () => {
  for (const status of ['revoked', 'compromised', 'expired', 'narrowed']) {
    const result = evaluate(state({ status }));
    assert.equal(result.allow, false);
    assert.equal(result.code, `machine_currentness_${status}`);
  }
});

test('authority narrowing invalidates an otherwise live old capability digest', () => {
  const result = evaluate(state({ authority_digest: 'f'.repeat(64) }));
  assert.deepEqual(result, {
    allow: false,
    code: 'machine_currentness_authority_changed',
    authority_effect: 'none',
    execution_authority_granted: false,
    global_currentness_claimed: false
  });
});

test('currentness lifecycle state is bound to principal identity but not an individual operation', () => {
  assert.equal(
    evaluate(state({ principal_id: 'agent.other' })).code,
    'machine_currentness_principal_mismatch'
  );
  assert.equal(
    evaluate(state({ principal_type: 'service' })).code,
    'machine_currentness_principal_type_mismatch'
  );
  assert.throws(
    () => normalizeMachinePrincipalCurrentness({
      ...state(),
      admission_digest: admission()
    }),
    /unsupported field/
  );
});

test('stale, future-dated, rollback, and equivocation currentness fail closed', () => {
  assert.equal(
    evaluate(state({ observed_at: '2026-09-01T15:59:58.000Z' })).code,
    'machine_currentness_stale'
  );
  assert.equal(
    evaluate(state({ observed_at: '2026-09-01T16:00:00.100Z' })).code,
    'machine_currentness_stale'
  );
  assert.equal(evaluate(state({ sequence: 6 })).code, 'machine_currentness_rollback');
  assert.equal(
    evaluate(state({ source_head_digest: '1'.repeat(64) })).code,
    'machine_currentness_equivocation'
  );
});

test('genesis and successor predecessor invariants fail closed', () => {
  assert.throws(
    () => normalizeMachinePrincipalCurrentness(state({
      sequence: 1,
      predecessor_head_digest: PREVIOUS
    })),
    /genesis.*predecessor/
  );
  assert.throws(
    () => normalizeMachinePrincipalCurrentness(state({
      sequence: 2,
      predecessor_head_digest: null
    })),
    /non-genesis.*predecessor/
  );
});

test('currentness schema rejects unsupported fields and authority/global-currentness claims', () => {
  assert.throws(
    () => normalizeMachinePrincipalCurrentness(state({ surprise: true })),
    /unsupported field/
  );
  assert.throws(
    () => normalizeMachinePrincipalCurrentness(state({ authority_effect: 'grant' })),
    /non-authorizing/
  );
  assert.throws(
    () => normalizeMachinePrincipalCurrentness(state({ execution_authority_granted: true })),
    /non-authorizing/
  );
  assert.throws(
    () => normalizeMachinePrincipalCurrentness(state({ global_currentness_claimed: true })),
    /global currentness/
  );
});
