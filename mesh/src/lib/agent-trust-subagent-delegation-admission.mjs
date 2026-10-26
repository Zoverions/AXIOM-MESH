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
  normalizeAgentAuthorityCeiling,
  verifyAgentAttenuationProof
} from './agent-trust-attenuation-proof.mjs';

export const SUBAGENT_DELEGATION_ADMISSION_SCHEMA = 'axiom-subagent-delegation-admission.v1';

const DIGEST = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

const ADMISSION_KEYS = new Set([
  'schema',
  'statement',
  'statement_digest',
  'admission_signature',
  'admission_digest'
]);

const STATEMENT_KEYS = new Set([
  'delegation_id',
  'delegator_id',
  'delegate_id',
  'admission_authority_id',
  'admission_authority_key_id',
  'attenuation_proof_digest',
  'parent_ceiling_digest',
  'child_ceiling_digest',
  'parent_currentness_digest',
  'parent_currentness_verification_digest',
  'issued_at',
  'expires_at',
  'delegation_effect',
  'execution_authorized',
  'effect_authority',
  'bearer_token',
  'communication_can_delegate',
  'discovery_can_delegate',
  'runtime_attestation_can_delegate',
  'global_currentness_claimed',
  'descendant_effect_requires_recheck'
]);

const SEMANTICS = Object.freeze({
  delegation_effect: 'establish-child-ceiling',
  execution_authorized: false,
  effect_authority: 'none',
  bearer_token: false,
  communication_can_delegate: false,
  discovery_can_delegate: false,
  runtime_attestation_can_delegate: false,
  global_currentness_claimed: false,
  descendant_effect_requires_recheck: true
});

function exactObject(raw, allowed, label) {
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

function canonicalTimestamp(value, label) {
  const text = assertString(value, label, { min: 24, max: 24 });
  const parsed = new Date(text);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== text) {
    throw new ValidationError(`${label} must be a canonical UTC ISO timestamp`);
  }
  return text;
}

function timestampValue(value) {
  return new Date(value).valueOf();
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

export function subagentDelegationAdmissionKeyId(
  value,
  label = 'subagent delegation admission public key'
) {
  return sha256(canonicalPublicKey(value, label));
}

function normalizeStatement(raw) {
  const value = exactObject(raw, STATEMENT_KEYS, 'subagent delegation admission statement');
  const semantics = Object.fromEntries(Object.keys(SEMANTICS).map(key => [key, value[key]]));
  if (canonicalJson(semantics) !== canonicalJson(SEMANTICS)) {
    throw new ValidationError('subagent delegation admission widens its delegation-only boundary');
  }

  const issuedAt = canonicalTimestamp(value.issued_at, 'subagent delegation admission issued_at');
  const expiresAt = canonicalTimestamp(value.expires_at, 'subagent delegation admission expires_at');
  if (timestampValue(expiresAt) <= timestampValue(issuedAt)) {
    throw new ValidationError('subagent delegation admission expiry must follow issuance');
  }

  return Object.freeze({
    delegation_id: identifier(value.delegation_id, 'subagent delegation admission delegation_id'),
    delegator_id: identifier(value.delegator_id, 'subagent delegation admission delegator_id'),
    delegate_id: identifier(value.delegate_id, 'subagent delegation admission delegate_id'),
    admission_authority_id: identifier(
      value.admission_authority_id,
      'subagent delegation admission admission_authority_id'
    ),
    admission_authority_key_id: digest(
      value.admission_authority_key_id,
      'subagent delegation admission admission_authority_key_id'
    ),
    attenuation_proof_digest: digest(
      value.attenuation_proof_digest,
      'subagent delegation admission attenuation_proof_digest'
    ),
    parent_ceiling_digest: digest(
      value.parent_ceiling_digest,
      'subagent delegation admission parent_ceiling_digest'
    ),
    child_ceiling_digest: digest(
      value.child_ceiling_digest,
      'subagent delegation admission child_ceiling_digest'
    ),
    parent_currentness_digest: digest(
      value.parent_currentness_digest,
      'subagent delegation admission parent_currentness_digest'
    ),
    parent_currentness_verification_digest: digest(
      value.parent_currentness_verification_digest,
      'subagent delegation admission parent_currentness_verification_digest'
    ),
    issued_at: issuedAt,
    expires_at: expiresAt,
    ...SEMANTICS
  });
}

function requireLatestParentCurrentness(parentCurrentnessDigest, retainedLatestParentCurrentnessDigest) {
  const current = digest(
    parentCurrentnessDigest,
    'subagent delegation admission parent currentness digest'
  );
  const latest = digest(
    retainedLatestParentCurrentnessDigest,
    'subagent delegation admission retained latest parent currentness digest'
  );
  if (current !== latest) {
    throw new ValidationError('subagent delegation admission requires latest parent currentness');
  }
  return current;
}

function assertAdmissionLifetime(statement, verifiedProof, childAuthority) {
  if (timestampValue(statement.issued_at) < timestampValue(childAuthority.valid_from)) {
    throw new ValidationError('subagent delegation admission starts before child authority');
  }
  if (timestampValue(statement.issued_at) < timestampValue(verifiedProof.statement.issued_at)) {
    throw new ValidationError('subagent delegation admission starts before attenuation proof');
  }
  if (timestampValue(statement.expires_at) > timestampValue(verifiedProof.statement.expires_at)) {
    throw new ValidationError('subagent delegation admission cannot outlive attenuation proof');
  }
  if (timestampValue(statement.expires_at) > timestampValue(childAuthority.expires_at)) {
    throw new ValidationError('subagent delegation admission cannot outlive child authority');
  }
}

export function createSubagentDelegationAdmission({
  delegationId,
  attenuationProof,
  delegatorPublicKey,
  parentAuthority,
  childAuthority,
  expectedDelegatorId,
  expectedDelegateId,
  parentCurrentnessDigest,
  parentCurrentnessVerificationDigest,
  retainedLatestParentCurrentnessDigest,
  admissionAuthorityId,
  admissionAuthorityPrivateKey,
  issuedAt,
  expiresAt
} = {}) {
  const currentnessDigest = requireLatestParentCurrentness(
    parentCurrentnessDigest,
    retainedLatestParentCurrentnessDigest
  );
  const currentnessVerificationDigest = digest(
    parentCurrentnessVerificationDigest,
    'subagent delegation admission parent currentness verification digest'
  );
  const verifiedProof = verifyAgentAttenuationProof(attenuationProof, {
    delegatorPublicKey,
    parentAuthority,
    childAuthority,
    expectedDelegatorId,
    expectedDelegateId,
    expectedParentContextDigest: currentnessDigest
  });
  const child = normalizeAgentAuthorityCeiling(childAuthority);
  const privateKey = parsePrivateKey(
    admissionAuthorityPrivateKey,
    'subagent delegation admission authority private key'
  );
  const authorityPublicKey = createPublicKey(privateKey);

  const statement = normalizeStatement({
    delegation_id: delegationId,
    delegator_id: verifiedProof.statement.delegator_id,
    delegate_id: verifiedProof.statement.delegate_id,
    admission_authority_id: admissionAuthorityId,
    admission_authority_key_id: subagentDelegationAdmissionKeyId(authorityPublicKey),
    attenuation_proof_digest: verifiedProof.proof_digest,
    parent_ceiling_digest: verifiedProof.statement.parent_ceiling_digest,
    child_ceiling_digest: verifiedProof.statement.child_ceiling_digest,
    parent_currentness_digest: currentnessDigest,
    parent_currentness_verification_digest: currentnessVerificationDigest,
    issued_at: issuedAt,
    expires_at: expiresAt,
    ...SEMANTICS
  });
  assertAdmissionLifetime(statement, verifiedProof, child);

  const statementDigest = digestObject(statement);
  const signable = Object.freeze({
    schema: SUBAGENT_DELEGATION_ADMISSION_SCHEMA,
    statement,
    statement_digest: statementDigest
  });
  const admissionSignature = sign(
    null,
    Buffer.from(canonicalJson(signable)),
    privateKey
  ).toString('base64url');
  const signed = Object.freeze({
    ...signable,
    admission_signature: admissionSignature
  });
  return Object.freeze({
    ...signed,
    admission_digest: digestObject(signed)
  });
}

export function verifySubagentDelegationAdmission(raw, {
  admissionAuthorityPublicKey,
  attenuationProof,
  delegatorPublicKey,
  parentAuthority,
  childAuthority,
  expectedDelegatorId,
  expectedDelegateId,
  expectedParentCurrentnessDigest,
  retainedLatestParentCurrentnessDigest
} = {}) {
  const value = exactObject(raw, ADMISSION_KEYS, 'subagent delegation admission');
  if (value.schema !== SUBAGENT_DELEGATION_ADMISSION_SCHEMA) {
    throw new ValidationError(
      `subagent delegation admission schema must be ${SUBAGENT_DELEGATION_ADMISSION_SCHEMA}`
    );
  }

  const suppliedStatementDigest = digest(
    value.statement_digest,
    'subagent delegation admission statement_digest'
  );
  if (suppliedStatementDigest !== digestObject(value.statement)) {
    throw new ValidationError('subagent delegation admission statement digest mismatch');
  }
  const statement = normalizeStatement(value.statement);

  const publicKey = parsePublicKey(
    admissionAuthorityPublicKey,
    'subagent delegation admission authority public key'
  );
  if (subagentDelegationAdmissionKeyId(publicKey) !== statement.admission_authority_key_id) {
    throw new ValidationError('subagent delegation admission authority key substitution');
  }
  const signature = assertString(
    value.admission_signature,
    'subagent delegation admission admission_signature',
    { min: 32, max: 1024, pattern: BASE64URL }
  );
  let signatureValid = false;
  try {
    signatureValid = verify(
      null,
      Buffer.from(canonicalJson({
        schema: SUBAGENT_DELEGATION_ADMISSION_SCHEMA,
        statement,
        statement_digest: suppliedStatementDigest
      })),
      publicKey,
      Buffer.from(signature, 'base64url')
    );
  } catch {
    signatureValid = false;
  }
  if (!signatureValid) {
    throw new ValidationError('subagent delegation admission signature is invalid');
  }

  const signed = Object.freeze({
    schema: SUBAGENT_DELEGATION_ADMISSION_SCHEMA,
    statement,
    statement_digest: suppliedStatementDigest,
    admission_signature: signature
  });
  const admissionDigest = digest(
    value.admission_digest,
    'subagent delegation admission admission_digest'
  );
  if (admissionDigest !== digestObject(signed)) {
    throw new ValidationError('subagent delegation admission admission_digest mismatch');
  }

  if (expectedDelegatorId !== undefined && statement.delegator_id !== expectedDelegatorId) {
    throw new ValidationError('subagent delegation admission delegator_id mismatch');
  }
  if (expectedDelegateId !== undefined && statement.delegate_id !== expectedDelegateId) {
    throw new ValidationError('subagent delegation admission delegate_id mismatch');
  }
  if (
    expectedParentCurrentnessDigest !== undefined
    && statement.parent_currentness_digest !== expectedParentCurrentnessDigest
  ) {
    throw new ValidationError('subagent delegation admission parent currentness mismatch');
  }

  requireLatestParentCurrentness(
    statement.parent_currentness_digest,
    retainedLatestParentCurrentnessDigest
  );

  const verifiedProof = verifyAgentAttenuationProof(attenuationProof, {
    delegatorPublicKey,
    parentAuthority,
    childAuthority,
    expectedDelegatorId: statement.delegator_id,
    expectedDelegateId: statement.delegate_id,
    expectedParentContextDigest: statement.parent_currentness_digest
  });
  if (
    verifiedProof.proof_digest !== statement.attenuation_proof_digest
    || verifiedProof.statement.parent_ceiling_digest !== statement.parent_ceiling_digest
    || verifiedProof.statement.child_ceiling_digest !== statement.child_ceiling_digest
  ) {
    throw new ValidationError('subagent delegation admission authority binding mismatch');
  }

  const child = normalizeAgentAuthorityCeiling(childAuthority);
  assertAdmissionLifetime(statement, verifiedProof, child);

  return Object.freeze({
    ...signed,
    admission_digest: admissionDigest,
    attenuation: verifiedProof.attenuation,
    delegation_effect: 'establish-child-ceiling',
    execution_authorized: false
  });
}
