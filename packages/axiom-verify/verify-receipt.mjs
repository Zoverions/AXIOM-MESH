import { digestObject, VerifyError } from './canonical.mjs';
import { loadPublicKey, verifyObjectSignature } from './crypto.mjs';
import {
  isKnownReceiptSchema,
  MACHINE_INTENT_RECEIPT_SCHEMA,
  MACHINE_INTENT_RECEIPT_STATEMENT_SCHEMA
} from './schemas.mjs';
import { buildVerificationReport } from './report.mjs';

const DIGEST = /^[a-f0-9]{64}$/;

/**
 * Verify a machine-receipt-like artifact with caller-supplied public key material.
 * Standalone offline path — no Gateway/Hypervisor client behavior.
 */
export function verifyMachineReceiptLike(artifact, options = {}) {
  let parsed;
  if (typeof artifact === 'string') {
    try {
      parsed = JSON.parse(artifact);
    } catch {
      return failClosed('invalid_json', 'Artifact is not valid JSON', null);
    }
  } else {
    try {
      parsed = structuredClone(artifact);
    } catch {
      return failClosed(
        'non_cloneable',
        'Artifact could not be cloned for verification (non-cloneable input)',
        null
      );
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return failClosed('invalid_shape', 'Machine receipt-like artifact must be a plain object', null);
  }

  const schema = parsed.schema;
  if (typeof schema !== 'string' || !schema.length) {
    return failClosed(
      'missing_schema',
      'Artifact is missing a schema id; Verify fails closed without a recognized schema',
      null
    );
  }

  if (!isKnownReceiptSchema(schema)) {
    return failClosed(
      'unknown_schema',
      `Unknown schema id '${schema}'. Verify fails closed for unrecognized schemas in this experimental MVP scaffold.`,
      schema
    );
  }

  if (schema === MACHINE_INTENT_RECEIPT_SCHEMA) {
    return verifyMachineIntentReceipt(parsed, options);
  }

  return failClosed(
    'unhandled_known_schema',
    `Schema '${schema}' is listed but has no verifier in this scaffold`,
    schema
  );
}

function verifyMachineIntentReceipt(receipt, { publicKeyPem } = {}) {
  if (!publicKeyPem) {
    return failClosed(
      'missing_public_key',
      'Public key material is required to verify a machine receipt',
      MACHINE_INTENT_RECEIPT_SCHEMA
    );
  }

  if (receipt.statement?.schema !== MACHINE_INTENT_RECEIPT_STATEMENT_SCHEMA) {
    return failClosed(
      'invalid_statement_schema',
      `Statement schema must be '${MACHINE_INTENT_RECEIPT_STATEMENT_SCHEMA}'`,
      MACHINE_INTENT_RECEIPT_SCHEMA
    );
  }

  if (!DIGEST.test(receipt.receipt_digest ?? '')) {
    return failClosed(
      'invalid_receipt_digest',
      'Machine intent receipt digest is missing or not a 64-character hex SHA-256',
      MACHINE_INTENT_RECEIPT_SCHEMA
    );
  }

  const { receipt_digest: claimedDigest, ...envelope } = receipt;
  let computedDigest;
  try {
    computedDigest = digestObject(envelope);
  } catch (error) {
    return failClosed(
      'canonicalization_failed',
      `Receipt bytes could not be canonicalized: ${error.message}`,
      MACHINE_INTENT_RECEIPT_SCHEMA
    );
  }

  if (computedDigest !== claimedDigest) {
    return failClosed(
      'digest_mismatch',
      'Altered or substituted receipt bytes: receipt_digest does not match the envelope (schema + statement + attestation)',
      MACHINE_INTENT_RECEIPT_SCHEMA,
      { receipt_digest: claimedDigest }
    );
  }

  if (!receipt.attestation || typeof receipt.attestation !== 'object') {
    return failClosed(
      'missing_attestation',
      'Receipt is missing an attestation block',
      MACHINE_INTENT_RECEIPT_SCHEMA,
      { receipt_digest: claimedDigest }
    );
  }

  let publicKey;
  try {
    publicKey = loadPublicKey(publicKeyPem);
  } catch {
    return failClosed(
      'invalid_public_key',
      'Public key material could not be parsed as an SPKI PEM key',
      MACHINE_INTENT_RECEIPT_SCHEMA,
      { receipt_digest: claimedDigest }
    );
  }

  const signatureOk = verifyObjectSignature(receipt.statement, receipt.attestation, publicKey);
  if (!signatureOk) {
    return failClosed(
      'signature_invalid',
      'Ed25519 attestation does not verify under the supplied public key (bad signature, wrong key, or altered statement)',
      MACHINE_INTENT_RECEIPT_SCHEMA,
      {
        receipt_digest: claimedDigest,
        intent_id: receipt.statement?.intent?.intent_id ?? null
      }
    );
  }

  const okResult = {
    ok: true,
    code: 'pass',
    schema: MACHINE_INTENT_RECEIPT_SCHEMA,
    receipt_digest: claimedDigest,
    intent_id: receipt.statement?.intent?.intent_id ?? null,
    status: receipt.statement?.intent?.status ?? null,
    reason: null
  };
  return { ...okResult, report: buildVerificationReport(okResult) };
}

function failClosed(code, reason, schema, extra = {}) {
  const result = {
    ok: false,
    code,
    schema,
    reason,
    receipt_digest: extra.receipt_digest ?? null,
    intent_id: extra.intent_id ?? null
  };
  return { ...result, report: buildVerificationReport(result) };
}

export { VerifyError };