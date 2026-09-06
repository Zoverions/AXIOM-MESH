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
  KNOWN_RECEIPT_SCHEMAS,
  KNOWN_STATEMENT_SCHEMAS,
  isKnownReceiptSchema
} from './schemas.mjs';

export { verifyMachineReceiptLike } from './verify-receipt.mjs';

export {
  INTEGRITY_VERSUS_TRUTH,
  VERIFY_STATUS,
  buildVerificationReport,
  assertNoPromotionLanguage
} from './report.mjs';

export { createSignedReceiptFixture } from './fixtures.mjs';
