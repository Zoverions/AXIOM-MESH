import {
  ValidationError,
  assertString,
  digestObject
} from './canonical.mjs';
import { verifyObjectSignature } from './identity.mjs';
import {
  validateDurableAssuranceSourceAdmission
} from './assurance-source-broker.mjs';

export const ASSURANCE_SOURCE_REVOCATION_SCHEMA =
  'axiom-assurance-source-revocation-snapshot.v1';
export const ASSURANCE_SOURCE_REVOCATION_STATEMENT_SCHEMA =
  'axiom-assurance-source-revocation-statement.v1';

const DIGEST = /^[a-f0-9]{64}$/;
const MAX_REVOCATIONS = 100_000;
const MAX_SNAPSHOT_LIFETIME_MS = 24 * 60 * 60 * 1000;

function digest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

function timestamp(value, label) {
  const text = assertString(value, label, { min: 24, max: 24 });
  const parsed = new Date(text);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== text) {
    throw new ValidationError(`${label} must be a canonical UTC ISO timestamp`);
  }
  return text;
}

function digestSet(value, label) {
  if (!Array.isArray(value) || value.length > MAX_REVOCATIONS) {
    throw new ValidationError(`${label} must contain at most ${MAX_REVOCATIONS} items`);
  }
  const normalized = value.map((item, index) => digest(item, `${label}[${index}]`));
  if (new Set(normalized).size !== normalized.length) {
    throw new ValidationError(`${label} must not contain duplicates`);
  }
  return Object.freeze([...normalized].sort());
}

export function buildAssuranceSourceRevocationSnapshot({
  identity,
  sequence,
  issuedAt,
  expiresAt,
  revokedAdmissionDigests = [],
  revokedSourceVerificationDigests = []
} = {}) {
  if (!identity || typeof identity.signObject !== 'function') {
    throw new ValidationError('assurance source revocation snapshot requires a signing identity');
  }
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new ValidationError('assurance source revocation sequence must be a positive integer');
  }
  const issued = timestamp(issuedAt, 'assurance source revocation issuedAt');
  const expires = timestamp(expiresAt, 'assurance source revocation expiresAt');
  const lifetime = new Date(expires).valueOf() - new Date(issued).valueOf();
  if (lifetime <= 0 || lifetime > MAX_SNAPSHOT_LIFETIME_MS) {
    throw new ValidationError(
      'assurance source revocation snapshot lifetime must be positive and at most 24 hours'
    );
  }
  const statement = Object.freeze({
    schema: ASSURANCE_SOURCE_REVOCATION_STATEMENT_SCHEMA,
    sequence,
    issued_at: issued,
    expires_at: expires,
    revoked_admission_digests: digestSet(
      revokedAdmissionDigests,
      'assurance source revoked admission digests'
    ),
    revoked_source_verification_digests: digestSet(
      revokedSourceVerificationDigests,
      'assurance source revoked verification digests'
    ),
    global_currentness_claimed: false,
    authority_effect: 'none',
    execution_effect: 'none'
  });
  const envelope = Object.freeze({
    schema: ASSURANCE_SOURCE_REVOCATION_SCHEMA,
    statement,
    attestation: identity.signObject(statement)
  });
  return Object.freeze({
    ...envelope,
    snapshot_digest: digestObject(envelope)
  });
}

export function validateAssuranceSourceRevocationSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new ValidationError('assurance source revocation snapshot must be an object');
  }
  if (snapshot.schema !== ASSURANCE_SOURCE_REVOCATION_SCHEMA) {
    throw new ValidationError('assurance source revocation snapshot schema is invalid');
  }
  const statement = snapshot.statement;
  if (
    !statement
    || typeof statement !== 'object'
    || Array.isArray(statement)
    || statement.schema !== ASSURANCE_SOURCE_REVOCATION_STATEMENT_SCHEMA
  ) {
    throw new ValidationError('assurance source revocation statement is invalid');
  }
  if (
    statement.global_currentness_claimed !== false
    || statement.authority_effect !== 'none'
    || statement.execution_effect !== 'none'
  ) {
    throw new ValidationError('assurance source revocation activation boundary is invalid');
  }
  if (!Number.isSafeInteger(statement.sequence) || statement.sequence < 1) {
    throw new ValidationError('assurance source revocation sequence is invalid');
  }
  const issued = timestamp(statement.issued_at, 'assurance source revocation issued_at');
  const expires = timestamp(statement.expires_at, 'assurance source revocation expires_at');
  const lifetime = new Date(expires).valueOf() - new Date(issued).valueOf();
  if (lifetime <= 0 || lifetime > MAX_SNAPSHOT_LIFETIME_MS) {
    throw new ValidationError('assurance source revocation lifetime is invalid');
  }
  digestSet(
    statement.revoked_admission_digests,
    'assurance source revoked admission digests'
  );
  digestSet(
    statement.revoked_source_verification_digests,
    'assurance source revoked verification digests'
  );
  digest(snapshot.snapshot_digest, 'assurance source revocation snapshot_digest');
  const { snapshot_digest: _snapshotDigest, ...envelope } = snapshot;
  if (digestObject(envelope) !== snapshot.snapshot_digest) {
    throw new ValidationError('assurance source revocation snapshot_digest mismatch');
  }
  return snapshot;
}

export function verifyAssuranceSourceRevocationSnapshot(
  snapshot,
  gridPublicKey,
  { now } = {}
) {
  validateAssuranceSourceRevocationSnapshot(snapshot);
  if (!gridPublicKey) {
    throw new ValidationError('assurance source revocation requires a trusted Grid public key');
  }
  const evaluatedAt = timestamp(now, 'assurance source revocation verification now');
  if (snapshot.statement.issued_at > evaluatedAt) {
    throw new ValidationError('assurance source revocation snapshot is future-dated');
  }
  if (snapshot.statement.expires_at <= evaluatedAt) {
    throw new ValidationError('assurance source revocation snapshot is expired');
  }
  if (!verifyObjectSignature(snapshot.statement, snapshot.attestation, gridPublicKey)) {
    throw new ValidationError('assurance source revocation signature is invalid');
  }
  return Object.freeze({
    valid: true,
    snapshot_digest: snapshot.snapshot_digest,
    sequence: snapshot.statement.sequence,
    issued_at: snapshot.statement.issued_at,
    expires_at: snapshot.statement.expires_at,
    revoked_admission_digests: snapshot.statement.revoked_admission_digests,
    revoked_source_verification_digests:
      snapshot.statement.revoked_source_verification_digests,
    global_currentness_claimed: false,
    authority_effect: 'none'
  });
}

export function assertDurableAssuranceSourceAdmissionNotRevoked(
  receipt,
  snapshot,
  gridPublicKey,
  { now } = {}
) {
  validateDurableAssuranceSourceAdmission(receipt);
  const verified = verifyAssuranceSourceRevocationSnapshot(
    snapshot,
    gridPublicKey,
    { now }
  );
  if (
    verified.revoked_admission_digests.includes(receipt.statement.admission_digest)
    || verified.revoked_source_verification_digests.includes(
      receipt.statement.source_verification_digest
    )
  ) {
    throw new ValidationError('durable assurance source admission is revoked');
  }
  return Object.freeze({
    valid: true,
    source_verification_digest: receipt.statement.source_verification_digest,
    revocation_snapshot_digest: verified.snapshot_digest,
    revocation_sequence: verified.sequence,
    global_currentness_claimed: false,
    authority_effect: 'none'
  });
}
