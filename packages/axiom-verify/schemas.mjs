/** Known schema ids for the VERIFY-001 experimental MVP scaffold. Fail closed on anything else. */

export const MACHINE_INTENT_RECEIPT_SCHEMA = 'axiom-machine-intent-receipt.v1';
export const MACHINE_INTENT_RECEIPT_STATEMENT_SCHEMA = 'axiom-machine-intent-receipt-statement.v1';
export const GRID_CONTINUITY_ANCHOR_SCHEMA = 'axiom-grid-continuity-anchor.v1';
export const CLAIM_BUILD_CONTEXT_SCHEMA = 'axiom-claim-build-context.v1';
export const GRID_CONTINUITY_MODE = 'externally-retained-signed-grid-head';
export const EXPORT_PACKAGE_FORMAT = 'axiom-export.v1';
export const EXPORT_CONTINUITY_MODE = 'signed-transparency-log-head';
export const EVIDENCE_BUNDLE_ARTIFACT = 'axiom-export-evidence-bundle.v1';

export const KNOWN_RECEIPT_SCHEMAS = Object.freeze([
  MACHINE_INTENT_RECEIPT_SCHEMA
]);

export const KNOWN_STATEMENT_SCHEMAS = Object.freeze([
  MACHINE_INTENT_RECEIPT_STATEMENT_SCHEMA
]);

export const KNOWN_CONTINUITY_SCHEMAS = Object.freeze([
  GRID_CONTINUITY_ANCHOR_SCHEMA
]);

export function isKnownReceiptSchema(schemaId) {
  return KNOWN_RECEIPT_SCHEMAS.includes(schemaId);
}

export function isKnownContinuitySchema(schemaId) {
  return KNOWN_CONTINUITY_SCHEMAS.includes(schemaId);
}
