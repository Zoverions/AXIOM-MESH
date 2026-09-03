import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REPUTATION_QUERY_SCHEMA,
  validateReputationQuery
} from '../src/domain/reputation-query.mjs';

function fixture(overrides = {}) {
  return {
    schema: REPUTATION_QUERY_SCHEMA,
    query_id: 'repq:security-review-1',
    requester: 'principal:verifier',
    subject_ref: 'principal:subject',
    domain: 'software-security',
    purpose: 'vendor-security-review',
    criterion_ref: 'criterion:verified-findings-v1',
    evidence_window: {
      starts_at: '2026-08-01T00:00:00.000Z',
      ends_at: '2026-09-03T00:00:00.000Z'
    },
    minimum_review_state: 'integrity-verified',
    requested_presentation: 'criterion-only',
    max_claim_ttl_seconds: 3600,
    verifier_policy_ref: 'policy:vendor-security-v1',
    created_at: '2026-09-03T00:00:00.000Z',
    expires_at: '2026-09-03T01:00:00.000Z',
    ...overrides
  };
}

test('validates an exact-purpose domain-specific reputation query', () => {
  const query = validateReputationQuery(fixture());
  assert.equal(query.subject_ref, 'principal:subject');
  assert.equal(query.domain, 'software-security');
  assert.equal(query.purpose, 'vendor-security-review');
  assert.equal(query.criterion_ref, 'criterion:verified-findings-v1');
});

test('rejects universal score and ranking surfaces', () => {
  for (const [key, value] of [
    ['score', 97],
    ['rank', 1],
    ['percentile', 99],
    ['global_reputation', 'high']
  ]) {
    assert.throws(
      () => validateReputationQuery({ ...fixture(), [key]: value }),
      /unsupported fields/
    );
  }
});

test('orders query lifetime and evidence window', () => {
  assert.throws(
    () => validateReputationQuery(fixture({
      expires_at: '2026-09-02T23:59:59.000Z'
    })),
    /expires_at must follow created_at/
  );
  assert.throws(
    () => validateReputationQuery(fixture({
      evidence_window: {
        starts_at: '2026-09-03T00:00:00.000Z',
        ends_at: '2026-08-01T00:00:00.000Z'
      }
    })),
    /evidence_window.ends_at must follow evidence_window.starts_at/
  );
});

test('rejects unsupported review floors, presentation levels, and claim TTLs', () => {
  assert.throws(
    () => validateReputationQuery(fixture({ minimum_review_state: 'known' })),
    /minimum_review_state/
  );
  assert.throws(
    () => validateReputationQuery(fixture({ requested_presentation: 'full-history' })),
    /requested_presentation/
  );
  assert.throws(
    () => validateReputationQuery(fixture({ max_claim_ttl_seconds: 0 })),
    /max_claim_ttl_seconds/
  );
  assert.throws(
    () => validateReputationQuery(fixture({ max_claim_ttl_seconds: 2_592_001 })),
    /max_claim_ttl_seconds/
  );
});
