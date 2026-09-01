import {
  ValidationError,
  assertString,
  digestObject
} from './canonical.mjs';
import { verifyObjectSignature } from './identity.mjs';
import {
  evaluateEntityAssurance
} from './entity-assurance.mjs';
import {
  validateMeasurementSourceEnvelopes
} from './measurement-source-envelope.mjs';

export const ASSURANCE_SOURCE_ADMISSION_SCHEMA = 'axiom-assurance-source-admission.v1';
export const ASSURANCE_SOURCE_ADMISSION_RECEIPT_SCHEMA =
  'axiom-assurance-source-admission-receipt.v1';
export const ASSURANCE_SOURCE_ADMISSION_STATEMENT_SCHEMA =
  'axiom-assurance-source-admission-statement.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const LIVE_ADMISSIONS = new WeakSet();
const MAX_DURABLE_ADMISSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

function id(value, label) {
  return assertString(value, label, { min: 1, max: 192, pattern: ID });
}

function digest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

function makeAdmission(body) {
  const admission = Object.freeze({
    ...body,
    admission_digest: digestObject(body)
  });
  LIVE_ADMISSIONS.add(admission);
  return admission;
}

export function admitEntityAssuranceSource({
  sourceId,
  policy,
  evidence,
  subjectId,
  now
} = {}) {
  const source = id(sourceId, 'assurance source broker sourceId');
  const decision = evaluateEntityAssurance({
    policy,
    evidence,
    subjectId,
    now
  });
  if (decision.satisfied !== true || decision.decision !== 'satisfied') {
    throw new ValidationError(
      'assurance source broker cannot admit an unsatisfied entity-assurance decision'
    );
  }
  const body = Object.freeze({
    schema: ASSURANCE_SOURCE_ADMISSION_SCHEMA,
    source_id: source,
    source_class: 'entity-assurance',
    source_verification_digest: digest(
      decision.decision_digest,
      'assurance source broker entity decision digest'
    ),
    upstream_schema: decision.schema,
    upstream_subject_id: decision.subject_id,
    upstream_policy_digest: decision.policy_digest,
    truth_established: false,
    authority_effect: 'none'
  });
  return makeAdmission(body);
}

export function admitMeasurementSourcePackage({
  sourceId,
  pathFabricDocument,
  evidencePackage,
  sourcePackage,
  verificationOptions
} = {}) {
  const source = id(sourceId, 'assurance source broker sourceId');
  const verification = validateMeasurementSourceEnvelopes(
    pathFabricDocument,
    evidencePackage,
    sourcePackage,
    verificationOptions
  );
  if (
    verification.valid !== true
    || verification.source_signatures_verified !== true
    || verification.source_coverage_complete !== true
    || verification.authority_effect !== 'none'
    || verification.runtime_activation !== false
  ) {
    throw new ValidationError(
      'assurance source broker measurement verification did not satisfy admission requirements'
    );
  }
  const body = Object.freeze({
    schema: ASSURANCE_SOURCE_ADMISSION_SCHEMA,
    source_id: source,
    source_class: 'measurement',
    source_verification_digest: digest(
      verification.source_verification_digest,
      'assurance source broker measurement verification digest'
    ),
    upstream_schema: verification.schema,
    upstream_policy_digest: verification.source_verification_policy_digest,
    truth_established: verification.truth_established === true,
    authority_effect: 'none'
  });
  return makeAdmission(body);
}

export function collectBrokerVerifiedSourceBindings(admissions) {
  if (!Array.isArray(admissions) || admissions.length < 1 || admissions.length > 4096) {
    throw new ValidationError(
      'assurance source broker admissions must contain 1-4096 items'
    );
  }
  const result = new Map();
  for (const admission of admissions) {
    if (!admission || typeof admission !== 'object' || !LIVE_ADMISSIONS.has(admission)) {
      throw new ValidationError(
        'assurance source broker accepts only live admissions produced by this broker'
      );
    }
    if (admission.schema !== ASSURANCE_SOURCE_ADMISSION_SCHEMA) {
      throw new ValidationError('assurance source broker admission schema is invalid');
    }
    const verificationDigest = digest(
      admission.source_verification_digest,
      'assurance source broker admission verification digest'
    );
    const existing = result.get(verificationDigest);
    const binding = Object.freeze({
      source_id: admission.source_id,
      source_class: admission.source_class
    });
    if (
      existing
      && (
        existing.source_id !== binding.source_id
        || existing.source_class !== binding.source_class
      )
    ) {
      throw new ValidationError(
        'assurance source broker verification digest maps to conflicting source bindings'
      );
    }
    result.set(verificationDigest, binding);
  }
  return result;
}


function canonicalTimestamp(value, label) {
  const text = assertString(value, label, { min: 24, max: 24 });
  const parsed = new Date(text);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== text) {
    throw new ValidationError(`${label} must be a canonical UTC ISO timestamp`);
  }
  return text;
}

export function buildDurableAssuranceSourceAdmission(
  liveAdmission,
  {
    identity,
    issuedAt,
    expiresAt
  } = {}
) {
  if (!liveAdmission || typeof liveAdmission !== 'object' || !LIVE_ADMISSIONS.has(liveAdmission)) {
    throw new ValidationError(
      'durable assurance source admission requires a live broker admission'
    );
  }
  if (!identity || typeof identity.signObject !== 'function') {
    throw new ValidationError(
      'durable assurance source admission requires a signing identity'
    );
  }
  const issued = canonicalTimestamp(
    issuedAt,
    'durable assurance source admission issuedAt'
  );
  const expires = canonicalTimestamp(
    expiresAt,
    'durable assurance source admission expiresAt'
  );
  const issuedMs = new Date(issued).valueOf();
  const expiresMs = new Date(expires).valueOf();
  if (expiresMs <= issuedMs) {
    throw new ValidationError(
      'durable assurance source admission expiresAt must follow issuedAt'
    );
  }
  if (expiresMs - issuedMs > MAX_DURABLE_ADMISSION_LIFETIME_MS) {
    throw new ValidationError(
      'durable assurance source admission lifetime exceeds seven days'
    );
  }

  const statement = Object.freeze({
    schema: ASSURANCE_SOURCE_ADMISSION_STATEMENT_SCHEMA,
    source_id: liveAdmission.source_id,
    source_class: liveAdmission.source_class,
    source_verification_digest: liveAdmission.source_verification_digest,
    upstream_schema: liveAdmission.upstream_schema,
    upstream_policy_digest: liveAdmission.upstream_policy_digest,
    ...(liveAdmission.upstream_subject_id
      ? { upstream_subject_id: liveAdmission.upstream_subject_id }
      : {}),
    admission_digest: liveAdmission.admission_digest,
    issued_at: issued,
    expires_at: expires,
    truth_established: false,
    authority_effect: 'none',
    execution_effect: 'none'
  });

  const envelope = Object.freeze({
    schema: ASSURANCE_SOURCE_ADMISSION_RECEIPT_SCHEMA,
    statement,
    attestation: identity.signObject(statement)
  });
  return Object.freeze({
    ...envelope,
    receipt_digest: digestObject(envelope)
  });
}

export function validateDurableAssuranceSourceAdmission(receipt) {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
    throw new ValidationError('durable assurance source admission must be an object');
  }
  if (receipt.schema !== ASSURANCE_SOURCE_ADMISSION_RECEIPT_SCHEMA) {
    throw new ValidationError('durable assurance source admission schema is invalid');
  }
  const statement = receipt.statement;
  if (
    !statement
    || typeof statement !== 'object'
    || Array.isArray(statement)
    || statement.schema !== ASSURANCE_SOURCE_ADMISSION_STATEMENT_SCHEMA
  ) {
    throw new ValidationError('durable assurance source admission statement is invalid');
  }
  if (
    statement.truth_established !== false
    || statement.authority_effect !== 'none'
    || statement.execution_effect !== 'none'
  ) {
    throw new ValidationError(
      'durable assurance source admission activation boundary is invalid'
    );
  }
  id(statement.source_id, 'durable assurance source admission source_id');
  if (!['measurement', 'entity-assurance'].includes(statement.source_class)) {
    throw new ValidationError(
      'durable assurance source admission source_class is unsupported'
    );
  }
  digest(
    statement.source_verification_digest,
    'durable assurance source admission source_verification_digest'
  );
  digest(statement.upstream_policy_digest, 'durable assurance source admission upstream_policy_digest');
  digest(statement.admission_digest, 'durable assurance source admission admission_digest');
  id(statement.upstream_schema, 'durable assurance source admission upstream_schema');
  if (statement.upstream_subject_id !== undefined) {
    id(statement.upstream_subject_id, 'durable assurance source admission upstream_subject_id');
  }
  const issued = canonicalTimestamp(
    statement.issued_at,
    'durable assurance source admission issued_at'
  );
  const expires = canonicalTimestamp(
    statement.expires_at,
    'durable assurance source admission expires_at'
  );
  const lifetime = new Date(expires).valueOf() - new Date(issued).valueOf();
  if (lifetime <= 0 || lifetime > MAX_DURABLE_ADMISSION_LIFETIME_MS) {
    throw new ValidationError('durable assurance source admission lifetime is invalid');
  }
  digest(receipt.receipt_digest, 'durable assurance source admission receipt_digest');
  const { receipt_digest: _receiptDigest, ...envelope } = receipt;
  if (digestObject(envelope) !== receipt.receipt_digest) {
    throw new ValidationError(
      'durable assurance source admission receipt_digest mismatch'
    );
  }
  return receipt;
}

export function verifyDurableAssuranceSourceAdmission(
  receipt,
  gridPublicKey,
  { now } = {}
) {
  validateDurableAssuranceSourceAdmission(receipt);
  if (!gridPublicKey) {
    throw new ValidationError(
      'durable assurance source admission requires a trusted Grid public key'
    );
  }
  const evaluatedAt = canonicalTimestamp(
    now,
    'durable assurance source admission verification now'
  );
  if (receipt.statement.issued_at > evaluatedAt) {
    throw new ValidationError(
      'durable assurance source admission is future-dated'
    );
  }
  if (receipt.statement.expires_at <= evaluatedAt) {
    throw new ValidationError(
      'durable assurance source admission is expired'
    );
  }
  const valid = verifyObjectSignature(
    receipt.statement,
    receipt.attestation,
    gridPublicKey
  );
  if (!valid) {
    throw new ValidationError(
      'durable assurance source admission signature is invalid'
    );
  }
  return Object.freeze({
    valid: true,
    receipt_digest: receipt.receipt_digest,
    source_id: receipt.statement.source_id,
    source_class: receipt.statement.source_class,
    source_verification_digest: receipt.statement.source_verification_digest,
    expires_at: receipt.statement.expires_at,
    truth_established: false,
    authority_effect: 'none'
  });
}
