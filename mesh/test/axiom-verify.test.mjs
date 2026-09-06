import assert from 'node:assert/strict';
import test from 'node:test';

import {
  INTEGRITY_VERSUS_TRUTH,
  VERIFY_STATUS,
  createSignedReceiptFixture,
  createContinuityAnchorFixture,
  createExportPackageFixture,
  createChainSegmentFixture,
  digestObject,
  verifyMachineReceiptLike,
  verifyContinuityAnchor,
  verifyExportPackage,
  GENESIS_HASH
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

test('continuity anchor PASS when chain segment matches retained-head rules (exact)', () => {
  const { anchor, publicKeyPem, chainSegment, relation } = createContinuityAnchorFixture();
  assert.equal(relation, 'exact');
  const result = verifyContinuityAnchor(anchor, { publicKeyPem, chainSegment });
  assert.equal(result.ok, true);
  assert.equal(result.code, 'pass');
  assert.equal(result.relation, 'exact');
  assert.equal(result.report.verdict, 'PASS');
  assert.equal(result.report.integrity_versus_truth, INTEGRITY_VERSUS_TRUTH);
  assert.match(result.report.human_summary, /Integrity versus truth/);
  assert.equal(result.report.human_summary.toLowerCase().includes('released product'), false);
  assert.match(result.report.human_summary, /Anchor digest/);
});

test('continuity anchor PASS when segment extends beyond retained head', () => {
  const { anchor, publicKeyPem, chainSegment } = createContinuityAnchorFixture({
    retained_events: 2,
    extend_by: 1
  });
  const result = verifyContinuityAnchor(anchor, { publicKeyPem, chainSegment });
  assert.equal(result.ok, true);
  assert.equal(result.relation, 'extends');
  assert.equal(result.report.verdict, 'PASS');
});

test('continuity anchor FAIL on gap in chain segment with human explanation', () => {
  const { anchor, publicKeyPem, chainSegment } = createContinuityAnchorFixture({
    retained_events: 3
  });
  const gapped = structuredClone(chainSegment);
  // Keep length >= retained seq so truncation does not fire first; skip seq 2.
  gapped[1].seq = 3;
  const result = verifyContinuityAnchor(anchor, { publicKeyPem, chainSegment: gapped });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'sequence_gap');
  assert.match(result.reason, /Gap in chain segment/i);
  assert.match(result.reason, /Human explanation/i);
  assert.equal(result.report.verdict, 'FAIL');
  assert.match(result.report.human_summary, /Integrity versus truth/);
});

test('continuity anchor FAIL on broken hash link with human explanation', () => {
  const { anchor, publicKeyPem, chainSegment } = createContinuityAnchorFixture();
  const broken = structuredClone(chainSegment);
  broken[1].prev_hash = 'f'.repeat(64);
  // Recompute would fail event_hash; keep stale event_hash so link check fails first
  // Actually broken prev_hash fails before event_hash recompute... wait, we check prev_hash first, then recompute envelope which still has broken prev_hash so event_hash will also mismatch.
  // Force prev_hash mismatch while keeping event_hash: the code checks prev_hash !== previous first.
  const result = verifyContinuityAnchor(anchor, { publicKeyPem, chainSegment: broken });
  assert.equal(result.ok, false);
  assert.ok(['broken_link', 'event_hash_mismatch'].includes(result.code));
  assert.match(result.reason, /Broken|event_hash/i);
  assert.match(result.reason, /Human explanation/i);
  assert.equal(result.report.verdict, 'FAIL');
});

test('continuity anchor FAIL on truncation before retained head', () => {
  const { anchor, publicKeyPem, chainSegment } = createContinuityAnchorFixture({
    retained_events: 3
  });
  const truncated = chainSegment.slice(0, 1);
  const result = verifyContinuityAnchor(anchor, { publicKeyPem, chainSegment: truncated });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'continuity_truncation');
  assert.match(result.reason, /ends before the externally retained/i);
  assert.equal(result.report.verdict, 'FAIL');
});

test('continuity anchor FAIL when retained head does not match segment event', () => {
  const { anchor, publicKeyPem } = createContinuityAnchorFixture();
  // Deterministic fixture content would otherwise collide; diverge the subject so heads differ.
  const foreign = createChainSegmentFixture({ eventCount: 2 });
  foreign.events[0].subject = 'intent_foreign_0001';
  foreign.events[0].event_hash = digestObject({
    seq: foreign.events[0].seq,
    event_id: foreign.events[0].event_id,
    trace_id: foreign.events[0].trace_id,
    actor: foreign.events[0].actor,
    kind: foreign.events[0].kind,
    subject: foreign.events[0].subject,
    occurred_at: foreign.events[0].occurred_at,
    payload_digest: foreign.events[0].payload_digest,
    prev_hash: foreign.events[0].prev_hash
  });
  foreign.events[1].prev_hash = foreign.events[0].event_hash;
  foreign.events[1].subject = 'intent_foreign_0002';
  foreign.events[1].event_hash = digestObject({
    seq: foreign.events[1].seq,
    event_id: foreign.events[1].event_id,
    trace_id: foreign.events[1].trace_id,
    actor: foreign.events[1].actor,
    kind: foreign.events[1].kind,
    subject: foreign.events[1].subject,
    occurred_at: foreign.events[1].occurred_at,
    payload_digest: foreign.events[1].payload_digest,
    prev_hash: foreign.events[1].prev_hash
  });
  const result = verifyContinuityAnchor(anchor, {
    publicKeyPem,
    chainSegment: foreign.events
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'continuity_anchor_mismatch');
  assert.match(result.reason, /retained head|retained-head|evidence_head/i);
  assert.equal(result.report.verdict, 'FAIL');
});

test('selective export package PASS when file digests match', () => {
  const { package: pkg, publicKeyPem } = createExportPackageFixture();
  const result = verifyExportPackage(pkg, { publicKeyPem });
  assert.equal(result.ok, true);
  assert.equal(result.code, 'pass');
  assert.equal(result.report.verdict, 'PASS');
  assert.equal(result.report.integrity_versus_truth, INTEGRITY_VERSUS_TRUTH);
  assert.match(result.report.human_summary, /Integrity versus truth/);
  assert.match(result.report.human_summary, /Bundle digest/);
  assert.equal(result.report.human_summary.toLowerCase().includes('production-promoted'), false);
});

test('selective export package FAIL on any file substitution', () => {
  const { package: pkg, publicKeyPem, fileName } = createExportPackageFixture();
  const substituted = {
    manifest: pkg.manifest,
    files: {
      [fileName]: Buffer.from(`${JSON.stringify({ kind: 'verify.fixture', n: 999 })}\n`, 'utf8')
    }
  };
  const result = verifyExportPackage(substituted, { publicKeyPem });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'file_substitution');
  assert.match(result.reason, /File substitution/i);
  assert.match(result.reason, /Human explanation/i);
  assert.equal(result.report.verdict, 'FAIL');
  assert.match(result.report.human_summary, /Integrity versus truth/);
});

test('export / continuity reports sanitize untrusted promotion phrases', () => {
  const crafted = verifyExportPackage(
    {
      manifest: {
        format: 'attacker-production-ready-export.v0',
        files: []
      },
      files: {}
    },
    {}
  );
  assert.equal(crafted.ok, false);
  assert.equal(crafted.report.verdict, 'FAIL');
  assert.match(crafted.report.human_summary, /Integrity versus truth/);
  assert.equal(crafted.report.human_summary.toLowerCase().includes('production-ready'), false);
  assert.match(crafted.report.human_summary, /redacted-untrusted-field/);

  const continuityCrafted = verifyContinuityAnchor(
    { statement: { schema: 'attacker-production-ready-anchor.v0' } },
    { publicKeyPem: 'unused' }
  );
  assert.equal(continuityCrafted.ok, false);
  assert.equal(continuityCrafted.report.human_summary.toLowerCase().includes('production-ready'), false);
  assert.match(continuityCrafted.report.human_summary, /redacted-untrusted-field/);
});

test('genesis constant remains all-zero for retained-head rules', () => {
  assert.equal(GENESIS_HASH, '0'.repeat(64));
});
