/**
 * AXIOM Verify — experimental MVP scaffold (VERIFY-001).
 *
 * Standalone, dependency-light offline verifier. Not a released product.
 * Does not act as a Gateway/Hypervisor authority client.
 * Does not claim TPM/TEE/BFT, production promotion, or Hermes pin acceptance.
 */

export {
  canonicalize,
  canonicalJson,
  sha256,
  digestObject,
  VerifyError
} from './canonical.mjs';

export {
  generateEd25519Identity,
  signObject,
  verifyObjectSignature,
  loadPublicKey,
  keyIdFor
} from './crypto.mjs';

export {
  MACHINE_INTENT_RECEIPT_SCHEMA,
  MACHINE_INTENT_RECEIPT_STATEMENT_SCHEMA,
  GRID_CONTINUITY_ANCHOR_SCHEMA,
  CLAIM_BUILD_CONTEXT_SCHEMA,
  GRID_CONTINUITY_MODE,
  EXPORT_PACKAGE_FORMAT,
  EXPORT_CONTINUITY_MODE,
  EVIDENCE_BUNDLE_ARTIFACT,
  KNOWN_RECEIPT_SCHEMAS,
  KNOWN_STATEMENT_SCHEMAS,
  KNOWN_CONTINUITY_SCHEMAS,
  isKnownReceiptSchema,
  isKnownContinuitySchema
} from './schemas.mjs';

export { verifyMachineReceiptLike } from './verify-receipt.mjs';
export {
  verifyContinuityAnchor,
  verifyChainSegmentAgainstRetainedHead,
  GENESIS_HASH
} from './verify-continuity.mjs';
export { verifyExportPackage } from './verify-export.mjs';

export {
  INTEGRITY_VERSUS_TRUTH,
  VERIFY_STATUS,
  buildVerificationReport,
  assertNoPromotionLanguage,
  sanitizeUntrustedReportField
} from './report.mjs';

export {
  createSignedReceiptFixture,
  createChainSegmentFixture,
  createContinuityAnchorFixture,
  createExportPackageFixture
} from './fixtures.mjs';
