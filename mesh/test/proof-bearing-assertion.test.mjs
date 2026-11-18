import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validateProofBearingAssertion } from '../src/lib/proof-bearing-assertion.mjs';

const NOW = new Date('2026-09-01T12:20:00.000Z');

function assertion(overrides = {}) {
  return {
    schema: 'axiom-proof-bearing-assertion.v1',
    assertion_id: 'assertion:1',
    statement_type: 'payment_received',
    proof_profile: 'proof:example-v1',
    source_domain: 'payments:external',
    subject_binding: 'subject:alice',
    audience: 'institution:A',
    resource: 'invoice:42',
    purpose: 'settlement-check',
    issued_at: '2026-09-01T12:00:00.000Z',
    expires_at: '2026-09-01T13:00:00.000Z',
    public_inputs_digest: 'a'.repeat(64),
    proof_digest: 'b'.repeat(64),
    verifier: {
      verifier_id: 'verifier:example',
      implementation_digest: 'c'.repeat(64),
      trust_profile: 'trust:open-reviewed',
      independently_reproducible: true
    },
    verification_result: {
      verified: true,
      checked_statement: true,
      checked_subject_binding: true,
      checked_audience: true,
      checked_resource: true,
      checked_expiry: true
    },
    limitations: ['Proves only the exact bounded statement and bindings checked.'],
    ...overrides
  };
}

test('valid proof-bearing assertion becomes verified input but never authority', () => {
  const result = validateProofBearingAssertion(assertion(), { now: NOW });
  assert.equal(result.valid, true);
  assert.equal(result.evidence_effect, 'verified_input_only');
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.external_truth_effect, 'bounded_statement_only');
});

test('expired assertion fails required verification even if proof was otherwise valid', () => {
  const result = validateProofBearingAssertion(assertion({
    expires_at: '2026-09-01T12:10:00.000Z'
  }), { now: NOW });
  assert.equal(result.valid, false);
  assert.equal(result.checks.not_expired, false);
  assert.equal(result.authority_effect, 'none');
});

test('zero-length and inverted proof validity windows fail structurally', () => {
  for (const expires_at of [
    '2026-09-01T12:00:00.000Z',
    '2026-09-01T11:59:59.999Z'
  ]) {
    assert.throws(
      () => validateProofBearingAssertion(assertion({ expires_at }), { now: NOW }),
      /expires_at must follow issued_at/,
      expires_at
    );
  }
});

test('missing audience/resource/subject checks fail closed', () => {
  for (const field of ['checked_subject_binding','checked_audience','checked_resource']) {
    const candidate = assertion();
    candidate.verification_result[field] = false;
    const result = validateProofBearingAssertion(candidate, { now: NOW });
    assert.equal(result.valid, false, field);
    assert.equal(result.authority_effect, 'none');
  }
});

test('negative fixtures forbid semantic widening and proof-to-authority laundering', async () => {
  const fixtures = JSON.parse(await readFile(
    new URL('../../agent-commons/proof-bearing-assertion-negative-fixtures.v1.json', import.meta.url),
    'utf8'
  ));
  assert.equal(fixtures.schema, 'axiom-proof-bearing-assertion-negative-fixtures.v1');
  assert.ok(Array.isArray(fixtures.cases), 'negative fixture cases must be an array');
  assert.ok(fixtures.cases.length >= 6);
  assert.ok(fixtures.cases.every(({ expect }) => expect.authority === 'none'));
  assert.ok(fixtures.cases.some(({ id }) => id === 'proof-of-payment-used-as-proof-of-identity'));
  assert.ok(fixtures.cases.some(({ id }) => id === 'opaque-verifier-high-consequence'));
});
