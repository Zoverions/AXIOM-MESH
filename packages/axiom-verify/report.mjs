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

const UNTRUSTED_REDACTION = '[redacted-untrusted-field]';

/**
 * Assert trusted/static report text contains no promotion language.
 * Callers must not pass attacker-controlled strings here.
 */
export function assertNoPromotionLanguage(text) {
  const lower = String(text).toLowerCase();
  for (const phrase of FORBIDDEN_PROMOTION_PHRASES) {
    if (lower.includes(phrase)) {
      throw new Error(`Verification report must not contain promotion language: ${phrase}`);
    }
  }
}

/**
 * Redact forbidden promotion phrases from untrusted values so they never
 * enter the promotion-language check path or human_summary verbatim.
 */
export function sanitizeUntrustedReportField(value) {
  if (value == null) return null;
  let text = String(value);
  for (const phrase of FORBIDDEN_PROMOTION_PHRASES) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(new RegExp(escaped, 'gi'), UNTRUSTED_REDACTION);
  }
  return text;
}

function containsPromotionLanguage(text) {
  const lower = String(text).toLowerCase();
  return FORBIDDEN_PROMOTION_PHRASES.some(phrase => lower.includes(phrase));
}

/**
 * Build a verification report. Untrusted result fields are sanitized before
 * inclusion so crafted schema ids / reasons cannot crash report generation.
 * Always returns a structured report object; never throws on untrusted input.
 */
export function buildVerificationReport(result) {
  const passed = result?.ok === true;
  const safeSchema = sanitizeUntrustedReportField(result?.schema ?? 'unknown');
  const safeDigest = sanitizeUntrustedReportField(
    result?.receipt_digest
      ?? result?.anchor_digest
      ?? result?.bundle_digest
      ?? null
  );
  const safeIntent = sanitizeUntrustedReportField(result?.intent_id);
  const safeAnchorId = sanitizeUntrustedReportField(result?.anchor_id);
  const safeExportId = sanitizeUntrustedReportField(result?.export_id);
  const safeReason = sanitizeUntrustedReportField(result?.reason);
  const safeEvidenceHead = sanitizeUntrustedReportField(result?.evidence_head);
  const safeFileName = sanitizeUntrustedReportField(result?.file_name);

  const digestLabel = result?.anchor_digest != null
    ? 'Anchor digest'
    : result?.bundle_digest != null
      ? 'Bundle digest'
      : 'Receipt digest';

  const trustedFooter = [
    INTEGRITY_VERSUS_TRUTH,
    '',
    'Non-claims: this scaffold does not claim product release status, Mesh production',
    'promotion, TPM/TEE/BFT assurance, Gateway/Hypervisor authority, or that verified',
    'receipts establish external-world truth. Hermes pin remains provisional; SEC-002 pending.'
  ].join('\n');

  // Promotion-language assertion runs only on trusted static copy — never on
  // attacker-controlled schema/reason/intent/digest fields.
  try {
    assertNoPromotionLanguage(`AXIOM Verify report (${VERIFY_STATUS})`);
    assertNoPromotionLanguage(trustedFooter);
    assertNoPromotionLanguage(digestLabel);
  } catch (error) {
    return {
      schema: 'axiom-verify-report.v0',
      status: VERIFY_STATUS,
      ok: false,
      verdict: 'FAIL',
      artifact_schema: result?.schema != null ? safeSchema : null,
      receipt_digest: result?.receipt_digest != null ? safeDigest : null,
      anchor_digest: result?.anchor_digest != null
        ? sanitizeUntrustedReportField(result.anchor_digest)
        : null,
      bundle_digest: result?.bundle_digest != null
        ? sanitizeUntrustedReportField(result.bundle_digest)
        : null,
      intent_id: safeIntent,
      anchor_id: safeAnchorId,
      export_id: safeExportId,
      reason: `Report generation failed closed: ${error.message}`,
      code: 'report_promotion_language',
      integrity_versus_truth: INTEGRITY_VERSUS_TRUTH,
      human_summary: [
        `AXIOM Verify report (${VERIFY_STATUS})`,
        'Result: FAIL',
        `Reason: Report generation failed closed: ${error.message}`,
        '',
        INTEGRITY_VERSUS_TRUTH
      ].join('\n')
    };
  }

  let ok = passed;
  let verdict = passed ? 'PASS' : 'FAIL';
  let reason = safeReason;
  let code = result?.code ?? null;

  // Defense in depth: if a phrase somehow remains after sanitization, fail
  // closed with a structured report instead of throwing.
  const untrustedLines = [
    `Artifact schema: ${safeSchema}`,
    safeDigest ? `${digestLabel}: ${safeDigest}` : null,
    safeIntent ? `Intent id: ${safeIntent}` : null,
    safeAnchorId ? `Anchor id: ${safeAnchorId}` : null,
    safeExportId ? `Export id: ${safeExportId}` : null,
    safeEvidenceHead ? `Evidence head: ${safeEvidenceHead}` : null,
    safeFileName ? `File: ${safeFileName}` : null,
    reason ? `Reason: ${reason}` : null
  ].filter(line => line !== null);

  if (untrustedLines.some(line => containsPromotionLanguage(line))) {
    ok = false;
    verdict = 'FAIL';
    code = 'untrusted_field_promotion_language';
    reason =
      'Untrusted verification fields contained forbidden promotion language and were redacted; report fails closed';
  }

  const human_summary = [
    `AXIOM Verify report (${VERIFY_STATUS})`,
    `Result: ${verdict}`,
    `Artifact schema: ${safeSchema}`,
    safeDigest ? `${digestLabel}: ${safeDigest}` : null,
    safeIntent ? `Intent id: ${safeIntent}` : null,
    safeAnchorId ? `Anchor id: ${safeAnchorId}` : null,
    safeExportId ? `Export id: ${safeExportId}` : null,
    safeEvidenceHead ? `Evidence head: ${safeEvidenceHead}` : null,
    safeFileName ? `File: ${safeFileName}` : null,
    reason ? `Reason: ${reason}` : null,
    '',
    trustedFooter
  ]
    .filter(line => line !== null)
    .join('\n');

  return {
    schema: 'axiom-verify-report.v0',
    status: VERIFY_STATUS,
    ok,
    verdict,
    artifact_schema: result?.schema != null ? safeSchema : null,
    receipt_digest: result?.receipt_digest != null
      ? sanitizeUntrustedReportField(result.receipt_digest)
      : null,
    anchor_digest: result?.anchor_digest != null
      ? sanitizeUntrustedReportField(result.anchor_digest)
      : null,
    bundle_digest: result?.bundle_digest != null
      ? sanitizeUntrustedReportField(result.bundle_digest)
      : null,
    intent_id: safeIntent,
    anchor_id: safeAnchorId,
    export_id: safeExportId,
    reason,
    code,
    integrity_versus_truth: INTEGRITY_VERSUS_TRUTH,
    human_summary
  };
}
