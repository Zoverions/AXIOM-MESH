import {
  createPrivateKey,
  createPublicKey,
  sign,
  verify
} from 'node:crypto';

import {
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject,
  sha256
} from './canonical.mjs';
import {
  verifyMachineIdentityCoreCredential
} from './agent-trust-machine-identity-core.mjs';

export const CROSS_PLANE_OPERATIONAL_MINT_RECEIPT_SCHEMA =
  'axiom-cross-plane-operational-mint-receipt.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const MINT_KINDS = new Set([
  'runtime-binding',
  'delegation',
  'capability',
  'handoff'
]);

const AUTHORITY_KEYS = new Set([
  'principal_id',
  'authority_head_digest',
  'authority_digest',
  'authority_source_key_id',
  'authority_sequence',
  'authority_evaluated_at',
  'authority_verification_digest'
]);

const RECEIPT_KEYS = new Set([
  'schema',
  'statement',
  'statement_digest',
  'mint_signature',
  'receipt_digest'
]);

const STATEMENT_KEYS = new Set([
  'mint_id',
  'mint_kind',
  'artifact_digest',
  'principal_id',
  'identity_core_credential_digest',
  'identity_core_key_epoch',
  'identity_operational_key_id',
  'authority_head_digest',
  'authority_digest',
  'authority_source_key_id',
  'authority_sequence',
  'authority_evaluated_at',
  'authority_verification_digest',
  'retained_latest_authority_head_digest',
  'runtime_evidence_digest',
  'relationship_evidence_digest',
  'mint_signer_id',
  'mint_signer_key_id',
  'minted_at',
  'authority_source_verification_external',
  'current_authority_claimed',
  'effect_admission_authorized',
  'historical_evidence_only',
  'authority_effect',
  'delegation_effect'
]);

function exactKeys(raw, allowed, label) {
  const value = assertPlainObject(raw, label);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new ValidationError(`${label} contains unsupported field ${key}`);
    }
  }
  return value;
}

function identifier(value, label) {
  return assertString(value, label, { min: 1, max: 192, pattern: ID });
}

function digest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

function nullableDigest(value, label) {
  return value === null ? null : digest(value, label);
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new ValidationError(`${label} must be a positive safe integer`);
  }
  return value;
}

function canonicalTimestamp(value, label) {
  const text = assertString(value, label, { min: 24, max: 24 });
  const parsed = new Date(text);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== text) {
    throw new ValidationError(`${label} must be a canonical UTC ISO timestamp`);
  }
  return text;
}

function parsePrivateKey(value, label) {
  let key;
  try {
    key = value && typeof value === 'object' && value.type === 'private'
      ? value
      : createPrivateKey(value);
  } catch {
    throw new ValidationError(`${label} is invalid`);
  }
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new ValidationError(`${label} must be Ed25519`);
  }
  return key;
}

function parsePublicKey(value, label) {
  let key;
  try {
    key = value && typeof value === 'object' && value.type === 'public'
      ? value
      : createPublicKey(value);
  } catch {
    throw new ValidationError(`${label} is invalid`);
  }
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new ValidationError(`${label} must be Ed25519`);
  }
  return key;
}

function canonicalPublicKey(value, label) {
  return parsePublicKey(value, label)
    .export({ type: 'spki', format: 'pem' })
    .toString();
}

export function crossPlaneMintKeyId(value, label = 'cross-plane mint public key') {
  return sha256(canonicalPublicKey(value, label));
}

function normalizeAuthorityCurrentness(raw) {
  const value = exactKeys(
    raw,
    AUTHORITY_KEYS,
    'verified authority currentness projection'
  );
  return Object.freeze({
    principal_id: identifier(
      value.principal_id,
      'verified authority currentness principal_id'
    ),
    authority_head_digest: digest(
      value.authority_head_digest,
      'verified authority currentness authority_head_digest'
    ),
    authority_digest: digest(
      value.authority_digest,
      'verified authority currentness authority_digest'
    ),
    authority_source_key_id: digest(
      value.authority_source_key_id,
      'verified authority currentness authority_source_key_id'
    ),
    authority_sequence: positiveInteger(
      value.authority_sequence,
      'verified authority currentness authority_sequence'
    ),
    authority_evaluated_at: canonicalTimestamp(
      value.authority_evaluated_at,
      'verified authority currentness authority_evaluated_at'
    ),
    authority_verification_digest: digest(
      value.authority_verification_digest,
      'verified authority currentness authority_verification_digest'
    )
  });
}

function normalizeStatement(raw) {
  const value = exactKeys(raw, STATEMENT_KEYS, 'cross-plane operational mint statement');
  const mintKind = assertString(value.mint_kind, 'cross-plane mint_kind', {
    min: 7,
    max: 32,
    pattern: /^[a-z][a-z0-9-]{0,31}$/
  });
  if (!MINT_KINDS.has(mintKind)) {
    throw new ValidationError('cross-plane mint_kind is unsupported');
  }

  const runtimeEvidenceDigest = nullableDigest(
    value.runtime_evidence_digest,
    'cross-plane runtime_evidence_digest'
  );
  if (mintKind === 'runtime-binding' && runtimeEvidenceDigest === null) {
    throw new ValidationError('runtime-binding mint requires runtime evidence');
  }

  if (
    value.authority_source_verification_external !== true
    || value.current_authority_claimed !== false
    || value.effect_admission_authorized !== false
    || value.historical_evidence_only !== true
    || value.authority_effect !== 'none'
    || value.delegation_effect !== 'none'
  ) {
    throw new ValidationError(
      'cross-plane mint receipt widens its historical/non-authorizing boundary'
    );
  }

  return Object.freeze({
    mint_id: identifier(value.mint_id, 'cross-plane mint_id'),
    mint_kind: mintKind,
    artifact_digest: digest(value.artifact_digest, 'cross-plane artifact_digest'),
    principal_id: identifier(value.principal_id, 'cross-plane principal_id'),
    identity_core_credential_digest: digest(
      value.identity_core_credential_digest,
      'cross-plane identity_core_credential_digest'
    ),
    identity_core_key_epoch: positiveInteger(
      value.identity_core_key_epoch,
      'cross-plane identity_core_key_epoch'
    ),
    identity_operational_key_id: digest(
      value.identity_operational_key_id,
      'cross-plane identity_operational_key_id'
    ),
    authority_head_digest: digest(
      value.authority_head_digest,
      'cross-plane authority_head_digest'
    ),
    authority_digest: digest(
      value.authority_digest,
      'cross-plane authority_digest'
    ),
    authority_source_key_id: digest(
      value.authority_source_key_id,
      'cross-plane authority_source_key_id'
    ),
    authority_sequence: positiveInteger(
      value.authority_sequence,
      'cross-plane authority_sequence'
    ),
    authority_evaluated_at: canonicalTimestamp(
      value.authority_evaluated_at,
      'cross-plane authority_evaluated_at'
    ),
    authority_verification_digest: digest(
      value.authority_verification_digest,
      'cross-plane authority_verification_digest'
    ),
    retained_latest_authority_head_digest: digest(
      value.retained_latest_authority_head_digest,
      'cross-plane retained_latest_authority_head_digest'
    ),
    runtime_evidence_digest: runtimeEvidenceDigest,
    relationship_evidence_digest: nullableDigest(
      value.relationship_evidence_digest,
      'cross-plane relationship_evidence_digest'
    ),
    mint_signer_id: identifier(value.mint_signer_id, 'cross-plane mint_signer_id'),
    mint_signer_key_id: digest(
      value.mint_signer_key_id,
      'cross-plane mint_signer_key_id'
    ),
    minted_at: canonicalTimestamp(value.minted_at, 'cross-plane minted_at'),
    authority_source_verification_external: true,
    current_authority_claimed: false,
    effect_admission_authorized: false,
    historical_evidence_only: true,
    authority_effect: 'none',
    delegation_effect: 'none'
  });
}

export function createCrossPlaneOperationalMintReceipt({
  mintId,
  mintKind,
  artifactDigest,
  identityCoreCredential,
  trustedIdentityIssuerPublicKey,
  verifiedAuthorityCurrentness,
  expectedLatestAuthorityHeadDigest,
  runtimeEvidenceDigest = null,
  relationshipEvidenceDigest = null,
  mintSignerId,
  mintSignerPrivateKey,
  mintedAt
} = {}) {
  const mintTime = canonicalTimestamp(mintedAt, 'cross-plane mint mintedAt');
  const identity = verifyMachineIdentityCoreCredential(identityCoreCredential, {
    trustedIssuerPublicKey: trustedIdentityIssuerPublicKey
  });
  if (
    new Date(mintTime).valueOf() < new Date(identity.statement.valid_from).valueOf()
    || new Date(mintTime).valueOf() >= new Date(identity.statement.expires_at).valueOf()
  ) {
    throw new ValidationError('stable identity core is not valid at mint time');
  }

  const authority = normalizeAuthorityCurrentness(verifiedAuthorityCurrentness);
  if (authority.principal_id !== identity.statement.principal_id) {
    throw new ValidationError(
      'authority principal does not match stable identity core'
    );
  }
  const expectedLatest = digest(
    expectedLatestAuthorityHeadDigest,
    'expected latest authority head digest'
  );
  if (authority.authority_head_digest !== expectedLatest) {
    throw new ValidationError(
      'authority head is not the retained latest head'
    );
  }
  if (
    new Date(authority.authority_evaluated_at).valueOf()
    > new Date(mintTime).valueOf()
  ) {
    throw new ValidationError('authority currentness cannot be evaluated after mint time');
  }

  const privateKey = parsePrivateKey(
    mintSignerPrivateKey,
    'cross-plane mint signer private key'
  );
  const mintSignerPublicKey = createPublicKey(privateKey);
  const statement = normalizeStatement({
    mint_id: mintId,
    mint_kind: mintKind,
    artifact_digest: artifactDigest,
    principal_id: identity.statement.principal_id,
    identity_core_credential_digest: identity.credential_digest,
    identity_core_key_epoch: identity.statement.key_epoch,
    identity_operational_key_id: identity.statement.operational_key_id,
    authority_head_digest: authority.authority_head_digest,
    authority_digest: authority.authority_digest,
    authority_source_key_id: authority.authority_source_key_id,
    authority_sequence: authority.authority_sequence,
    authority_evaluated_at: authority.authority_evaluated_at,
    authority_verification_digest: authority.authority_verification_digest,
    retained_latest_authority_head_digest: expectedLatest,
    runtime_evidence_digest: runtimeEvidenceDigest,
    relationship_evidence_digest: relationshipEvidenceDigest,
    mint_signer_id: mintSignerId,
    mint_signer_key_id: crossPlaneMintKeyId(mintSignerPublicKey),
    minted_at: mintTime,
    authority_source_verification_external: true,
    current_authority_claimed: false,
    effect_admission_authorized: false,
    historical_evidence_only: true,
    authority_effect: 'none',
    delegation_effect: 'none'
  });

  const statementDigest = digestObject(statement);
  const signable = Object.freeze({
    schema: CROSS_PLANE_OPERATIONAL_MINT_RECEIPT_SCHEMA,
    statement,
    statement_digest: statementDigest
  });
  const mintSignature = sign(
    null,
    Buffer.from(canonicalJson(signable)),
    privateKey
  ).toString('base64url');
  const signed = Object.freeze({
    ...signable,
    mint_signature: mintSignature
  });
  return Object.freeze({
    ...signed,
    receipt_digest: digestObject(signed)
  });
}

export function verifyCrossPlaneOperationalMintReceipt(raw, {
  trustedMintSignerPublicKey,
  expectedMintSignerId,
  expectedPrincipalId
} = {}) {
  const value = exactKeys(raw, RECEIPT_KEYS, 'cross-plane operational mint receipt');
  if (value.schema !== CROSS_PLANE_OPERATIONAL_MINT_RECEIPT_SCHEMA) {
    throw new ValidationError('cross-plane operational mint receipt schema is unsupported');
  }
  const statement = normalizeStatement(value.statement);
  const statementDigest = digest(
    value.statement_digest,
    'cross-plane operational mint receipt statement_digest'
  );
  if (statementDigest !== digestObject(statement)) {
    throw new ValidationError('cross-plane operational mint receipt statement digest mismatch');
  }

  const trusted = parsePublicKey(
    trustedMintSignerPublicKey,
    'trusted cross-plane mint signer public key'
  );
  if (crossPlaneMintKeyId(trusted) !== statement.mint_signer_key_id) {
    throw new ValidationError('cross-plane mint signer key substitution');
  }

  const signature = assertString(
    value.mint_signature,
    'cross-plane operational mint receipt mint_signature',
    { min: 32, max: 1024, pattern: BASE64URL }
  );
  let valid = false;
  try {
    valid = verify(
      null,
      Buffer.from(canonicalJson({
        schema: CROSS_PLANE_OPERATIONAL_MINT_RECEIPT_SCHEMA,
        statement,
        statement_digest: statementDigest
      })),
      trusted,
      Buffer.from(signature, 'base64url')
    );
  } catch {
    valid = false;
  }
  if (!valid) {
    throw new ValidationError('cross-plane operational mint receipt signature is invalid');
  }

  const signed = Object.freeze({
    schema: CROSS_PLANE_OPERATIONAL_MINT_RECEIPT_SCHEMA,
    statement,
    statement_digest: statementDigest,
    mint_signature: signature
  });
  const receiptDigest = digest(
    value.receipt_digest,
    'cross-plane operational mint receipt receipt_digest'
  );
  if (receiptDigest !== digestObject(signed)) {
    throw new ValidationError('cross-plane operational mint receipt receipt_digest mismatch');
  }
  if (
    expectedMintSignerId !== undefined
    && statement.mint_signer_id !== expectedMintSignerId
  ) {
    throw new ValidationError('cross-plane operational mint receipt mint_signer_id mismatch');
  }
  if (
    expectedPrincipalId !== undefined
    && statement.principal_id !== expectedPrincipalId
  ) {
    throw new ValidationError('cross-plane operational mint receipt principal_id mismatch');
  }

  return Object.freeze({ ...signed, receipt_digest: receiptDigest });
}
