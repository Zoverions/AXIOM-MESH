/**
 * Verification report emitter for AXIOM Verify experimental MVP scaffold.
 * Always restates integrity-versus-truth. Never uses production-promotion language.
 */

export const VERIFY_STATUS = 'experimental-mvp-scaffold';

export const INTEGRITY_VERSUS_TRUTH = [
  'Integrity versus truth: a PASS means the supplied bytes, digests, signatures,',
  'and declared scopes match under the verification keys and schemas provided to Verify.',
  'It does not mean the underlying statement about the external world is true,',
  'that the operator was honest beyond the signed bytes, that model output is correct,',
  'or that policy choices were wise. Cryptographic integrity is not truth.'
].join(' ');

const FORBIDDEN_PROMOTION_PHRASES = Object.freeze([
  'production-promoted',
  'production promoted',
  'production-ready',
  'production ready',
  'released product',
  'generally available',
  'ga release',
  'certified for production'
]);

export function assertNoPromotionLanguage(text) {
  const lower = String(text).toLowerCase();
  for (const phrase of FORBIDDEN_PROMOTION_PHRASES) {
    if (lower.includes(phrase)) {
      throw new Error(`Verification report must not contain promotion language: ${phrase}`);
    }
  }
}

export function buildVerificationReport(result) {
  const passed = result?.ok === true;
  const lines = [
    `AXIOM Verify report (${VERIFY_STATUS})`,
    `Result: ${passed ? 'PASS' : 'FAIL'}`,
    `Artifact schema: ${result?.schema ?? 'unknown'}`,
    result?.receipt_digest ? `Receipt digest: ${result.receipt_digest}` : null,
    result?.intent_id ? `Intent id: ${result.intent_id}` : null,
    result?.reason ? `Reason: ${result.reason}` : null,
    '',
    INTEGRITY_VERSUS_TRUTH,
    '',
    'Non-claims: this scaffold does not claim product release status, Mesh production',
    'promotion, TPM/TEE/BFT assurance, Gateway/Hypervisor authority, or that verified',
    'receipts establish external-world truth. Hermes pin remains provisional; SEC-002 pending.'
  ].filter(line => line !== null);

  const human_summary = lines.join('\n');
  assertNoPromotionLanguage(human_summary);

  return {
    schema: 'axiom-verify-report.v0',
    status: VERIFY_STATUS,
    ok: passed,
    verdict: passed ? 'PASS' : 'FAIL',
    artifact_schema: result?.schema ?? null,
    receipt_digest: result?.receipt_digest ?? null,
    intent_id: result?.intent_id ?? null,
    reason: result?.reason ?? null,
    code: result?.code ?? null,
    integrity_versus_truth: INTEGRITY_VERSUS_TRUTH,
    human_summary
  };
}
