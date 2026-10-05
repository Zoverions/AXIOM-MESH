import assert from 'node:assert/strict';
import test from 'node:test';
import {
  INFORMATION_ACCESS_DECISION_SCHEMA,
  assertInformationAccessDecisionBinds,
  validateInformationAccessDecision
} from '../src/domain/information-access-decision.mjs';

const issuedAt = '2026-09-03T12:00:00.000Z';
const expiresAt = '2026-09-03T12:10:00.000Z';
const objectDigest = 'a'.repeat(64);

function decision(overrides = {}) {
  return {
    schema: INFORMATION_ACCESS_DECISION_SCHEMA,
    decision_id: 'access-decision:1',
    requester: 'principal:reader',
    object_ref: 'record:clinical-1',
    purpose: 'care',
    right: 'inspect-full-content',
    decision: 'allow',
    authority_ref: 'policy:health-access-v1',
    object_digest: objectDigest,
    issued_at: issuedAt,
    expires_at: expiresAt,
    verifier_ref: 'verifier:local-policy',
    verifier_version: '1.0.0',
    reason_codes: ['exact-policy-match'],
    ...overrides
  };
}

const expected = {
  requester: 'principal:reader',
  object_ref: 'record:clinical-1',
  purpose: 'care',
  right: 'inspect-full-content',
  object_digest: objectDigest
};

test('access decision validates a bounded allow without carrying execution authority', () => {
  const value = validateInformationAccessDecision(decision());
  assert.equal(value.decision, 'allow');
  assert.equal(Object.hasOwn(value, 'execution_authority'), false);
  assert.equal(Object.hasOwn(value, 'capability_grant'), false);
});

test('access decision rejects unknown fields and execution-authority shortcuts', () => {
  assert.throws(() => validateInformationAccessDecision({ ...decision(), owner: 'principal:reader' }), /unknown field owner/);
  assert.throws(() => validateInformationAccessDecision({ ...decision(), execution_authority: ['read:anything'] }), /execution authority/);
});

test('only exact currently-active allow decisions are consumable', () => {
  const value = assertInformationAccessDecisionBinds(decision(), expected, {
    now: '2026-09-03T12:05:00.000Z'
  });
  assert.equal(value.decision_id, 'access-decision:1');

  for (const [field, value] of [
    ['requester', 'principal:other'],
    ['object_ref', 'record:other'],
    ['purpose', 'research'],
    ['right', 'inspect-metadata'],
    ['object_digest', 'b'.repeat(64)]
  ]) {
    assert.throws(() => assertInformationAccessDecisionBinds(
      decision({ [field]: value }),
      expected,
      { now: '2026-09-03T12:05:00.000Z' }
    ), /does not bind exact request/);
  }

  assert.throws(() => assertInformationAccessDecisionBinds(
    decision({ decision: 'deny' }), expected, { now: '2026-09-03T12:05:00.000Z' }
  ), /does not allow access/);
  assert.throws(() => assertInformationAccessDecisionBinds(
    decision({ decision: 'uncertain' }), expected, { now: '2026-09-03T12:05:00.000Z' }
  ), /does not allow access/);
  assert.throws(() => assertInformationAccessDecisionBinds(
    decision(), expected, { now: '2026-09-03T11:59:59.999Z' }
  ), /not active yet/);
  assert.throws(() => assertInformationAccessDecisionBinds(
    decision(), expected, { now: '2026-09-03T12:10:00.000Z' }
  ), /expired/);
});

test('access decision enforces canonical timestamps, digest, enums, and monotonic lifetime', () => {
  assert.throws(() => validateInformationAccessDecision(decision({ issued_at: '2026-09-03' })), /issued_at/);
  assert.throws(() => validateInformationAccessDecision(decision({ object_digest: 'abc' })), /object_digest/);
  assert.throws(() => validateInformationAccessDecision(decision({ right: 'read-anything' })), /right/);
  assert.throws(() => validateInformationAccessDecision(decision({ decision: 'approved' })), /decision/);
  assert.throws(() => validateInformationAccessDecision(decision({ expires_at: issuedAt })), /expires_at must be after issued_at/);
});
