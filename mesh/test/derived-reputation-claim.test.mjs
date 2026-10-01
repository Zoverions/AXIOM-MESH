import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { MeshIdentity } from '../src/lib/identity.mjs';
import {
  DERIVED_REPUTATION_CLAIM_SCHEMA,
  validateDerivedReputationClaim,
  signDerivedReputationClaim,
  verifyDerivedReputationClaimEnvelope
} from '../src/domain/derived-reputation-claim.mjs';

function identity(service = 'reputation-evaluator') {
  const pair = generateKeyPairSync('ed25519');
  return new MeshIdentity(
    service,
    pair.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    pair.publicKey.export({ type: 'spki', format: 'pem' })
  );
}

function claim(overrides = {}) {
  return {
    schema: DERIVED_REPUTATION_CLAIM_SCHEMA,
    claim_id: 'repclaim:1',
    query_id: 'repq:security-review-1',
    subject_ref: 'principal:subject',
    domain: 'software-security',
    purpose: 'vendor-security-review',
    criterion_ref: 'criterion:verified-findings-v1',
    result: 'met',
    reason_codes: [],
    evidence_set_digest: 'a'.repeat(64),
    considered_evidence_refs: ['evidence:a'],
    supporting_evidence_refs: ['evidence:a'],
    contrary_evidence_refs: [],
    challenge_refs: [],
    correction_refs: [],
    access_decision_digests: ['b'.repeat(64)],
    evaluator_ref: 'evaluator:criterion-v1',
    evaluated_at: '2026-09-03T00:10:00.000Z',
    valid_until: '2026-09-03T01:00:00.000Z',
    completeness: 'bounded-selected-evidence',
    authority_effect: 'none',
    reputation_transfer: 'none',
    truth_status: 'attributed-derived-claim',
    ...overrides
  };
}

test('validates a private authority-neutral non-transferable derived claim', () => {
  const value = validateDerivedReputationClaim(claim());
  assert.equal(value.authority_effect, 'none');
  assert.equal(value.reputation_transfer, 'none');
  assert.deepEqual(value.reason_codes, []);

  for (const [key, bad] of [
    ['score', 88],
    ['rank', 1],
    ['percentile', 99],
    ['authority_granted', true]
  ]) {
    assert.throws(
      () => validateDerivedReputationClaim({ ...claim(), [key]: bad }),
      new RegExp(`(?:contains unknown field ${key}|forbidden authority field ${key})`)
    );
  }
  assert.throws(
    () => validateDerivedReputationClaim(claim({ reputation_transfer: 'delegate' })),
    /reputation_transfer/
  );
});

test('accepts stable lowercase underscore reason codes used by contextual evaluation', () => {
  const value = validateDerivedReputationClaim(claim({
    result: 'unresolved',
    reason_codes: ['criterion_completeness_unverified']
  }));
  assert.deepEqual(value.reason_codes, ['criterion_completeness_unverified']);
});

test('requires complete criterion evidence before representing not-met', () => {
  assert.throws(
    () => validateDerivedReputationClaim(claim({ result: 'not-met' })),
    /not-met requires verified-complete-for-criterion/
  );
  assert.equal(
    validateDerivedReputationClaim(claim({
      result: 'not-met',
      completeness: 'verified-complete-for-criterion'
    })).result,
    'not-met'
  );
});

test('requires ordered claim lifetime and bounded explicit reason codes', () => {
  assert.throws(
    () => validateDerivedReputationClaim(claim({
      valid_until: '2026-09-03T00:09:59.000Z'
    })),
    /valid_until must follow evaluated_at/
  );
  assert.throws(
    () => validateDerivedReputationClaim(claim({ reason_codes: ['NOT_CANONICAL'] })),
    /reason_codes/
  );
});

test('signs and verifies claim attribution and rejects tampering', () => {
  const signer = identity();
  const envelope = signDerivedReputationClaim({ claim: claim(), signer });
  const verified = verifyDerivedReputationClaimEnvelope({
    envelope,
    publicKey: signer.publicKey,
    now: '2026-09-03T00:30:00.000Z'
  });
  assert.equal(verified.valid, true);
  assert.equal(verified.claim.claim_id, 'repclaim:1');

  const tampered = structuredClone(envelope);
  tampered.claim.criterion_ref = 'criterion:other-v1';
  assert.throws(
    () => verifyDerivedReputationClaimEnvelope({
      envelope: tampered,
      publicKey: signer.publicKey,
      now: '2026-09-03T00:30:00.000Z'
    }),
    /digest|signature/
  );
});

test('rejects future-evaluated and expired signed claims at verification time', () => {
  const signer = identity();
  const future = signDerivedReputationClaim({
    claim: claim({
      evaluated_at: '2026-09-03T00:40:00.000Z',
      valid_until: '2026-09-03T01:40:00.000Z'
    }),
    signer
  });
  assert.throws(
    () => verifyDerivedReputationClaimEnvelope({
      envelope: future,
      publicKey: signer.publicKey,
      now: '2026-09-03T00:30:00.000Z'
    }),
    /evaluated_at is in the future/
  );

  const expired = signDerivedReputationClaim({ claim: claim(), signer });
  assert.throws(
    () => verifyDerivedReputationClaimEnvelope({
      envelope: expired,
      publicKey: signer.publicKey,
      now: '2026-09-03T01:00:00.000Z'
    }),
    /expired/
  );
});
