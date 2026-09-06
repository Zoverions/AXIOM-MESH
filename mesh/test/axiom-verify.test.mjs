import assert from 'node:assert/strict';
import test from 'node:test';

import {
  INTEGRITY_VERSUS_TRUTH,
  VERIFY_STATUS,
  createSignedReceiptFixture,
  digestObject,
  verifyMachineReceiptLike
} from '../../packages/axiom-verify/index.mjs';

test('valid machine-receipt-like fixture with matching public key yields PASS', () => {
  const { receipt, publicKeyPem } = createSignedReceiptFixture();
  const result = verifyMachineReceiptLike(receipt, { publicKeyPem });
  assert.equal(result.ok, true);
  assert.equal(result.code, 'pass');
  assert.equal(result.report.verdict, 'PASS');
  assert.equal(result.report.status, VERIFY_STATUS);
  assert.equal(result.report.integrity_versus_truth, INTEGRITY_VERSUS_TRUTH);
  assert.match(result.report.human_summary, /Integrity versus truth/);
  assert.equal(result.report.human_summary.toLowerCase().includes('production-promoted'), false);
  assert.equal(result.report.human_summary.toLowerCase().includes('released product'), false);
});

test('altered receipt bytes yield FAIL with a human-readable reason', () => {
  const { receipt, publicKeyPem } = createSignedReceiptFixture();
  const altered = structuredClone(receipt);
  altered.statement.intent.action = 'system.hash';

  const stale = structuredClone(altered);
  const resultStale = verifyMachineReceiptLike(stale, { publicKeyPem });
  assert.equal(resultStale.ok, false);
  assert.equal(resultStale.code, 'digest_mismatch');
  assert.match(resultStale.reason, /Altered or substituted receipt bytes/i);
  assert.equal(resultStale.report.verdict, 'FAIL');
  assert.match(resultStale.report.human_summary, /Integrity versus truth/);

  const repaired = structuredClone(altered);
  const { receipt_digest: _ignored, ...envelope } = repaired;
  repaired.receipt_digest = digestObject(envelope);
  const resultSig = verifyMachineReceiptLike(repaired, { publicKeyPem });
  assert.equal(resultSig.ok, false);
  assert.equal(resultSig.code, 'signature_invalid');
  assert.match(resultSig.reason, /Ed25519 attestation does not verify/i);
});

test('unknown schema id fails closed with explanation', () => {
  const result = verifyMachineReceiptLike(
    { schema: 'axiom-totally-unknown.v9', payload: { x: 1 } },
    { publicKeyPem: 'unused' }
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, 'unknown_schema');
  assert.match(result.reason, /Unknown schema id 'axiom-totally-unknown\.v9'/);
  assert.match(result.reason, /fails closed/i);
  assert.equal(result.report.verdict, 'FAIL');
  assert.match(result.report.human_summary, /Integrity versus truth/);
  assert.equal(result.report.status, 'experimental-mvp-scaffold');
});

test('schema id containing promotion phrase does not crash report generation', () => {
  const craftedSchema = 'attacker-production-ready-schema.v0';
  let result;
  assert.doesNotThrow(() => {
    result = verifyMachineReceiptLike(
      { schema: craftedSchema, payload: { x: 1 } },
      { publicKeyPem: 'unused' }
    );
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'unknown_schema');
  assert.equal(result.report.verdict, 'FAIL');
  assert.equal(result.report.status, VERIFY_STATUS);
  assert.match(result.report.human_summary, /Integrity versus truth/);
  const lowerSummary = result.report.human_summary.toLowerCase();
  assert.equal(lowerSummary.includes('production-ready'), false);
  assert.equal(lowerSummary.includes('production ready'), false);
  assert.match(result.report.human_summary, /redacted-untrusted-field/);
  assert.equal(String(result.report.artifact_schema).toLowerCase().includes('production-ready'), false);
});

test('non-cloneable artifact fails closed distinctly from invalid JSON', () => {
  const nonCloneable = {
    schema: 'axiom-totally-unknown.v9',
    fn: () => {}
  };
  const cloneResult = verifyMachineReceiptLike(nonCloneable, { publicKeyPem: 'unused' });
  assert.equal(cloneResult.ok, false);
  assert.equal(cloneResult.code, 'non_cloneable');
  assert.match(cloneResult.reason, /non-cloneable/i);
  assert.equal(cloneResult.reason.includes('not valid JSON'), false);

  const jsonResult = verifyMachineReceiptLike('{not-json', { publicKeyPem: 'unused' });
  assert.equal(jsonResult.ok, false);
  assert.equal(jsonResult.code, 'invalid_json');
  assert.match(jsonResult.reason, /not valid JSON/);
});

test('verification report always includes integrity-versus-truth and no promotion language', () => {
  const { receipt, publicKeyPem } = createSignedReceiptFixture();
  const pass = verifyMachineReceiptLike(receipt, { publicKeyPem });
  const fail = verifyMachineReceiptLike({ schema: 'nope.v0' }, { publicKeyPem });
  for (const result of [pass, fail]) {
    assert.equal(result.report.integrity_versus_truth, INTEGRITY_VERSUS_TRUTH);
    assert.match(result.report.human_summary, /Cryptographic integrity is not truth/);
    const lower = result.report.human_summary.toLowerCase();
    assert.equal(lower.includes('production-promoted'), false);
    assert.equal(lower.includes('production ready'), false);
    assert.equal(lower.includes('released product'), false);
    assert.match(result.report.status, /experimental/);
  }
});