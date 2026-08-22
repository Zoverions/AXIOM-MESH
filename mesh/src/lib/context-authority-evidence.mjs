import { createPublicKey } from 'node:crypto';
import {
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject,
  ValidationError
} from './canonical.mjs';
import { verifyObjectSignature } from './identity.mjs';
import { compileContextCapsule } from './context-broker-compiler.mjs';

export const CONTEXT_AUTHORITY_EVIDENCE_V1_SCHEMA =
  'axiom-context-authority-evidence.v1';

export const CONTEXT_AUTHORITY_EVIDENCE_TYPES = Object.freeze([
  'context-disclosure-policy-decision',
  'vault-access-lease',
  'vault-access-receipt',
  'vault-lease-revocation-check'
]);

const EVIDENCE_TYPE_SET = new Set(CONTEXT_AUTHORITY_EVIDENCE_TYPES);
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const DATE_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const DEFAULT_MAX_EVIDENCE_LIFETIME_SECONDS = 3600;

const ENVELOPE_FIELDS = Object.freeze([
  'schema',
  'evidence_id',
  'evidence_type',
  'issuer_principal_ref',
  'issued_at',
  'expires_at',
  'nonce',
  'payload_sha256',
  'payload',
  'attestation'
]);

const ATTESTATION_FIELDS = Object.freeze([
  'algorithm',
  'key_id',
  'digest',
  'signature'
]);

const TRUST_PIN_FIELDS = Object.freeze([
  'issuer_principal_ref',
  'key_id',
  'public_key_pem',
  'allowed_evidence_types'
]);

export function verifyContextAuthorityEvidence(
  envelope,
  {
    trustPins,
    expectedEvidenceType,
    now = Date.now(),
    maxEvidenceLifetimeSeconds = DEFAULT_MAX_EVIDENCE_LIFETIME_SECONDS
  } = {}
) {
  assertSafeNow(now);
  assertPositiveLifetimeLimit(maxEvidenceLifetimeSeconds);
  const pins = normalizeTrustPins(trustPins);
  const normalized = normalizeEnvelope(envelope);

  if (
    expectedEvidenceType !== undefined
    && normalized.evidence_type !== expectedEvidenceType
  ) {
    throw new ValidationError(
      `Context authority evidence type mismatch: expected ${expectedEvidenceType}, received ${normalized.evidence_type}`
    );
  }

  const pin = pins.get(normalized.issuer_principal_ref);
  if (!pin) {
    throw new ValidationError(
      `Context authority evidence issuer is not locally trusted: ${normalized.issuer_principal_ref}`
    );
  }
  if (!pin.allowed_evidence_types.includes(normalized.evidence_type)) {
    throw new ValidationError(
      `Context authority evidence issuer is not trusted for type ${normalized.evidence_type}`
    );
  }
  if (normalized.attestation.key_id !== pin.key_id) {
    throw new ValidationError('Context authority evidence signing key does not match the local pin');
  }

  const issuedAtMs = parseDateTime(normalized.issued_at, 'evidence.issued_at');
  const expiresAtMs = parseDateTime(normalized.expires_at, 'evidence.expires_at');
  if (expiresAtMs <= issuedAtMs) {
    throw new ValidationError('Context authority evidence expiry must follow issuance');
  }
  if (issuedAtMs > now || expiresAtMs <= now) {
    throw new ValidationError('Context authority evidence is not currently valid');
  }
  if (
    expiresAtMs - issuedAtMs
    > maxEvidenceLifetimeSeconds * 1000
  ) {
    throw new ValidationError('Context authority evidence lifetime exceeds the local safety limit');
  }

  let actualPayloadSha256;
  try {
    actualPayloadSha256 = digestObject(normalized.payload);
  } catch {
    throw new ValidationError('Context authority evidence payload is not canonical JSON');
  }
  if (actualPayloadSha256 !== normalized.payload_sha256) {
    throw new ValidationError('Context authority evidence payload digest does not match');
  }

  let publicKey;
  try {
    publicKey = createPublicKey(pin.public_key_pem);
  } catch {
    throw new ValidationError('Context authority evidence trust pin contains an invalid public key');
  }
  if (publicKey.asymmetricKeyType !== 'ed25519') {
    throw new ValidationError('Context authority evidence trust pin must use an Ed25519 public key');
  }

  const unsigned = unsignedEnvelope(normalized);
  let signatureValid = false;
  try {
    signatureValid = verifyObjectSignature(unsigned, normalized.attestation, publicKey);
  } catch {
    signatureValid = false;
  }
  if (!signatureValid) {
    throw new ValidationError('Context authority evidence signature is invalid');
  }

  return deepFreeze({
    valid: true,
    evidence_id: normalized.evidence_id,
    evidence_type: normalized.evidence_type,
    issuer_principal_ref: normalized.issuer_principal_ref,
    key_id: normalized.attestation.key_id,
    nonce: normalized.nonce,
    issued_at: normalized.issued_at,
    expires_at: normalized.expires_at,
    payload_sha256: normalized.payload_sha256,
    envelope_sha256: digestObject(normalized),
    payload: normalized.payload,
    authenticates_payload: true,
    grants_vault_access: false,
    grants_execution_authority: false
  });
}

export function verifyContextAuthorityEvidenceBundle({
  policyDecisionEvidence,
  leaseEvidence,
  accessReceiptEvidence,
  revocationCheckEvidence,
  trustPins,
  now = Date.now(),
  maxEvidenceLifetimeSeconds = DEFAULT_MAX_EVIDENCE_LIFETIME_SECONDS
} = {}) {
  const collections = [
    ['context-disclosure-policy-decision', [policyDecisionEvidence]],
    ['vault-access-lease', requireArray(leaseEvidence, 'leaseEvidence')],
    ['vault-access-receipt', requireArray(accessReceiptEvidence, 'accessReceiptEvidence')],
    [
      'vault-lease-revocation-check',
      requireArray(revocationCheckEvidence, 'revocationCheckEvidence')
    ]
  ];

  if (!policyDecisionEvidence) {
    throw new ValidationError('Signed context disclosure policy evidence is required');
  }

  const verified = [];
  for (const [expectedEvidenceType, envelopes] of collections) {
    for (const envelope of envelopes) {
      verified.push(verifyContextAuthorityEvidence(envelope, {
        trustPins,
        expectedEvidenceType,
        now,
        maxEvidenceLifetimeSeconds
      }));
    }
  }

  assertUniqueEvidenceIdentity(verified);

  const byType = type => verified.filter(item => item.evidence_type === type);
  return deepFreeze({
    valid: true,
    policy_decision: byType('context-disclosure-policy-decision')[0],
    leases: byType('vault-access-lease'),
    access_receipts: byType('vault-access-receipt'),
    revocation_checks: byType('vault-lease-revocation-check'),
    evidence_ids: verified.map(item => item.evidence_id).sort(),
    evidence_bundle_sha256: digestObject(
      verified
        .map(item => ({
          evidence_id: item.evidence_id,
          evidence_type: item.evidence_type,
          issuer_principal_ref: item.issuer_principal_ref,
          envelope_sha256: item.envelope_sha256
        }))
        .sort((left, right) => left.evidence_id.localeCompare(right.evidence_id))
    ),
    signatures_verified: true,
    key_pins_verified: true,
    grants_vault_access: false,
    grants_execution_authority: false
  });
}

export function compileContextCapsuleFromSignedEvidence({
  request,
  policyDecisionEvidence,
  leaseEvidence,
  accessReceiptEvidence,
  revocationCheckEvidence,
  trustPins,
  claims,
  brokerPrincipalRef,
  capsuleId,
  issuedAt,
  localProvenanceReceiptRefs = [],
  minimumNecessaryPolicyRef,
  grantRef,
  now,
  maxEvidenceLifetimeSeconds = DEFAULT_MAX_EVIDENCE_LIFETIME_SECONDS
} = {}) {
  const referenceTime = now ?? Date.parse(String(issuedAt));
  if (!Number.isFinite(referenceTime)) {
    throw new ValidationError('Signed-evidence compilation requires a valid reference time');
  }

  const evidence = verifyContextAuthorityEvidenceBundle({
    policyDecisionEvidence,
    leaseEvidence,
    accessReceiptEvidence,
    revocationCheckEvidence,
    trustPins,
    now: referenceTime,
    maxEvidenceLifetimeSeconds
  });

  const compilation = compileContextCapsule({
    request,
    leases: evidence.leases.map(item => item.payload),
    claims,
    accessReceipts: evidence.access_receipts.map(item => item.payload),
    revocationChecks: evidence.revocation_checks.map(item => item.payload),
    policyDecision: evidence.policy_decision.payload,
    brokerPrincipalRef,
    capsuleId,
    issuedAt,
    localProvenanceReceiptRefs,
    minimumNecessaryPolicyRef,
    grantRef
  });

  return deepFreeze({
    ...compilation,
    authority_evidence_verified: true,
    authority_evidence_bundle_sha256: evidence.evidence_bundle_sha256,
    authority_evidence_ids: evidence.evidence_ids,
    authority_evidence_signatures_verified: true,
    authority_evidence_key_pins_verified: true,
    evidence_verifier_issues_authority: false,
    evidence_verifier_reads_vaults: false,
    evidence_verifier_issues_leases: false,
    evidence_verifier_commits_receipts: false,
    evidence_verifier_delivers_capsule: false,
    grants_vault_access: false,
    grants_execution_authority: false
  });
}

function normalizeEnvelope(envelope) {
  const value = cloneCanonical(envelope, 'Context authority evidence');
  assertExactKeys(value, ENVELOPE_FIELDS, 'Context authority evidence');
  if (value.schema !== CONTEXT_AUTHORITY_EVIDENCE_V1_SCHEMA) {
    throw new ValidationError('Context authority evidence schema is invalid');
  }
  assertId(value.evidence_id, 'evidence.evidence_id');
  if (!EVIDENCE_TYPE_SET.has(value.evidence_type)) {
    throw new ValidationError('Context authority evidence type is invalid');
  }
  assertId(value.issuer_principal_ref, 'evidence.issuer_principal_ref');
  assertDateTime(value.issued_at, 'evidence.issued_at');
  assertDateTime(value.expires_at, 'evidence.expires_at');
  assertId(value.nonce, 'evidence.nonce');
  assertSha256(value.payload_sha256, 'evidence.payload_sha256');
  assertPlainObject(value.payload, 'evidence.payload');

  const attestation = assertPlainObject(value.attestation, 'evidence.attestation');
  assertExactKeys(attestation, ATTESTATION_FIELDS, 'Context authority evidence attestation');
  if (attestation.algorithm !== 'Ed25519') {
    throw new ValidationError('Context authority evidence attestation algorithm must be Ed25519');
  }
  assertString(attestation.key_id, 'evidence.attestation.key_id', { min: 1, max: 160 });
  assertSha256(attestation.digest, 'evidence.attestation.digest');
  assertString(attestation.signature, 'evidence.attestation.signature', { min: 1, max: 1024 });
  if (!BASE64URL_PATTERN.test(attestation.signature)) {
    throw new ValidationError('Context authority evidence signature must be base64url');
  }
  return value;
}

function normalizeTrustPins(trustPins) {
  if (!Array.isArray(trustPins) || trustPins.length < 1 || trustPins.length > 64) {
    throw new ValidationError('Context authority evidence requires 1-64 local trust pins');
  }
  const pins = new Map();
  for (let index = 0; index < trustPins.length; index += 1) {
    const pin = cloneCanonical(trustPins[index], `trustPins[${index}]`);
    assertExactKeys(pin, TRUST_PIN_FIELDS, `trustPins[${index}]`);
    assertId(pin.issuer_principal_ref, `trustPins[${index}].issuer_principal_ref`);
    assertString(pin.key_id, `trustPins[${index}].key_id`, { min: 1, max: 160 });
    assertString(pin.public_key_pem, `trustPins[${index}].public_key_pem`, {
      min: 64,
      max: 8192
    });
    if (
      !Array.isArray(pin.allowed_evidence_types)
      || pin.allowed_evidence_types.length < 1
      || pin.allowed_evidence_types.length > CONTEXT_AUTHORITY_EVIDENCE_TYPES.length
    ) {
      throw new ValidationError(
        `trustPins[${index}].allowed_evidence_types must be a non-empty bounded array`
      );
    }
    const uniqueTypes = new Set();
    for (const type of pin.allowed_evidence_types) {
      if (!EVIDENCE_TYPE_SET.has(type)) {
        throw new ValidationError(`trustPins[${index}] contains an unknown evidence type`);
      }
      if (uniqueTypes.has(type)) {
        throw new ValidationError(`trustPins[${index}] contains a duplicate evidence type`);
      }
      uniqueTypes.add(type);
    }
    pin.allowed_evidence_types.sort();
    if (pins.has(pin.issuer_principal_ref)) {
      throw new ValidationError('Context authority evidence trust pins contain a duplicate issuer');
    }
    pins.set(pin.issuer_principal_ref, pin);
  }
  return pins;
}

function assertUniqueEvidenceIdentity(verified) {
  const ids = new Set();
  const nonces = new Set();
  for (const item of verified) {
    if (ids.has(item.evidence_id)) {
      throw new ValidationError('Signed context authority evidence bundle contains a duplicate evidence_id');
    }
    ids.add(item.evidence_id);
    const nonceKey = `${item.issuer_principal_ref}:${item.nonce}`;
    if (nonces.has(nonceKey)) {
      throw new ValidationError('Signed context authority evidence bundle contains a duplicate issuer nonce');
    }
    nonces.add(nonceKey);
  }
}

function unsignedEnvelope(envelope) {
  return {
    schema: envelope.schema,
    evidence_id: envelope.evidence_id,
    evidence_type: envelope.evidence_type,
    issuer_principal_ref: envelope.issuer_principal_ref,
    issued_at: envelope.issued_at,
    expires_at: envelope.expires_at,
    nonce: envelope.nonce,
    payload_sha256: envelope.payload_sha256,
    payload: envelope.payload
  };
}

function requireArray(value, name) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 128) {
    throw new ValidationError(`${name} must contain 1-128 signed evidence envelopes`);
  }
  return value;
}

function assertSafeNow(now) {
  if (!Number.isSafeInteger(now) || now < 0) {
    throw new ValidationError('Context authority evidence verification time is invalid');
  }
}

function assertPositiveLifetimeLimit(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 86400) {
    throw new ValidationError('Context authority evidence lifetime limit must be 1-86400 seconds');
  }
}

function parseDateTime(value, name) {
  assertDateTime(value, name);
  return Date.parse(value);
}

function assertDateTime(value, name) {
  assertString(value, name, { min: 20, max: 40 });
  if (!DATE_TIME_PATTERN.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new ValidationError(`${name} must be an RFC3339 date-time`);
  }
}

function assertId(value, name) {
  assertString(value, name, { min: 1, max: 160 });
  if (!ID_PATTERN.test(value)) throw new ValidationError(`${name} has an invalid identifier`);
}

function assertSha256(value, name) {
  assertString(value, name, { min: 64, max: 64 });
  if (!SHA256_PATTERN.test(value)) throw new ValidationError(`${name} must be a lowercase sha256`);
}

function assertExactKeys(value, allowedFields, name) {
  assertPlainObject(value, name);
  const allowed = new Set(allowedFields);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ValidationError(`${name} contains unknown field ${key}`);
  }
  for (const key of allowedFields) {
    if (!Object.hasOwn(value, key)) throw new ValidationError(`${name} is missing required field ${key}`);
  }
}

function cloneCanonical(value, name) {
  try {
    return JSON.parse(canonicalJson(value));
  } catch {
    throw new ValidationError(`${name} must be canonical JSON data`);
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
