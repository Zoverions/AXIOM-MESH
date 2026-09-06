/** Known schema ids for the VERIFY-001 experimental MVP scaffold. Fail closed on anything else. */

export const MACHINE_INTENT_RECEIPT_SCHEMA = 'axiom-machine-intent-receipt.v1';
export const MACHINE_INTENT_RECEIPT_STATEMENT_SCHEMA = 'axiom-machine-intent-receipt-statement.v1';

export const KNOWN_RECEIPT_SCHEMAS = Object.freeze([
  MACHINE_INTENT_RECEIPT_SCHEMA
]);

export const KNOWN_STATEMENT_SCHEMAS = Object.freeze([
  MACHINE_INTENT_RECEIPT_STATEMENT_SCHEMA
]);

export function isKnownReceiptSchema(schemaId) {
  return KNOWN_RECEIPT_SCHEMAS.includes(schemaId);
}
