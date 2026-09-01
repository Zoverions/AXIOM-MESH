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

export const MACHINE_AUTHORITY_CURRENTNESS_CHECKPOINT_SCHEMA =
  'axiom-machine-authority-currentness-checkpoint.v1';
export const MAX_MACHINE_AUTHORITY_CURRENTNESS_AGE_MS = 60_000;

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const REASON = /^[a-z][a-z0-9._-]{0,63}$/;
const STATUSES = new Set(['active', 'revoked']);

const TOP_KEYS = new Set([
  'schema',
  'statement',
  'statement_digest',
  'authority_source_signature',
  'checkpoint_digest'
]);
const STATEMENT_KEYS = new Set([
  'checkpoint_id',
  'checkpoint_sequence',
  'predecessor_checkpoint_digest',
  'authority_source_id',
  'authority_source_key_id',
  'principal_id',
  'evaluated_at',
  'status',
  'current_authority_digest',
  'reason_code',
  'evidence_scope',
  'identity_currentness_claimed',
  'authorization_policy_evaluated',
  'global_currentness_claimed',
  'effect_admission_authorized',
  'authority_effect',
  'delegation_effect'
]);

const FIXED_SEMANTICS = Object.freeze({
  evidence_scope: 'caller-trusted-signed-authority-head-only',
  identity_currentness_claimed: false,
  authorization_policy_evaluated: false,
  global_currentness_claimed: false,
  effect_admission_authorized: false,
  authority_effect: 'none',
  delegation_effect: 'none'
});

function exactObject(raw, allowed, label) {
  const value = assertPlainObject(raw, label);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new ValidationError(`${label} contains unsupported field ${key}`);
    }
  }
  for (const key of allowed) {
    if (!Object.hasOwn(value, key)) {
      throw new ValidationError(`${label} is missing required field ${key}`);
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

function canonicalTimestamp(value, label) {
  const text = assertString(value, label, { min: 24, max: 24 });
  const parsed = new Date(text);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== text) {
    throw new ValidationError(`${label} must be a canonical UTC ISO timestamp`);
  }
  return text;
}

function positiveInteger(value, label, max = 1_000_000) {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) {
    throw new ValidationError(`${label} must be a positive safe integer`);
  }
  return value;
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

function authoritySourceKeyId(value) {
  const publicKey = parsePublicKey(value, 'machine authority currentness source public key');
  const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  return sha256(pem);
}

function assertFixedSemantics(value) {
  for (const [key, expected] of Object.entries(FIXED_SEMANTICS)) {
    if (value[key] !== expected) {
      throw new ValidationError(
        `machine authority currentness ${key} must remain ${String(expected)}`
      );
    }
  }
}

function normalizeStatement(raw) {
  const value = exactObject(
    raw,
    STATEMENT_KEYS,
    'machine authority currentness checkpoint statement'
  );
  assertFixedSemantics(value);
  const sequence = positiveInteger(
    value.checkpoint_sequence,
    'machine authority currentness checkpoint_sequence'
  );
  const predecessor = nullableDigest(
    value.predecessor_checkpoint_digest,
    'machine authority currentness predecessor_checkpoint_digest'
  );
  if (sequence === 1 && predecessor !== null) {
    throw new ValidationError(
      'machine authority currentness genesis checkpoint cannot name a predecessor'
    );
  }
  if (sequence > 1 && predecessor === null) {
    throw new ValidationError(
      'machine authority currentness non-genesis checkpoint requires a predecessor'
    );
  }

  const status = assertString(value.status, 'machine authority currentness status', {
    min: 6,
    max: 16
  });
  if (!STATUSES.has(status)) {
    throw new ValidationError('machine authority currentness status is unsupported');
  }
  const currentAuthorityDigest = nullableDigest(
    value.current_authority_digest,
    'machine authority currentness current_authority_digest'
  );
  const reasonCode = value.reason_code === null
    ? null
    : assertString(value.reason_code, 'machine authority currentness reason_code', {
      min: 1,
      max: 64,
      pattern: REASON
    });
  if (status === 'active') {
    if (currentAuthorityDigest === null || reasonCode !== null) {
      throw new ValidationError(
        'active machine authority currentness requires a digest and no revocation reason'
      );
    }
  } else if (currentAuthorityDigest !== null || reasonCode === null) {
    throw new ValidationError(
      'revoked machine authority currentness requires no digest and an explicit reason'
    );
  }

  return Object.freeze({
    checkpoint_id: identifier(
      value.checkpoint_id,
      'machine authority currentness checkpoint_id'
    ),
    checkpoint_sequence: sequence,
    predecessor_checkpoint_digest: predecessor,
    authority_source_id: identifier(
      value.authority_source_id,
      'machine authority currentness authority_source_id'
    ),
    authority_source_key_id: digest(
      value.authority_source_key_id,
      'machine authority currentness authority_source_key_id'
    ),
    principal_id: identifier(
      value.principal_id,
      'machine authority currentness principal_id'
    ),
    evaluated_at: canonicalTimestamp(
      value.evaluated_at,
      'machine authority currentness evaluated_at'
    ),
    status,
    current_authority_digest: currentAuthorityDigest,
    reason_code: reasonCode,
    ...FIXED_SEMANTICS
  });
}

function verifySignatureEnvelope(raw, trustedAuthoritySourcePublicKey) {
  const value = exactObject(raw, TOP_KEYS, 'machine authority currentness checkpoint');
  if (value.schema !== MACHINE_AUTHORITY_CURRENTNESS_CHECKPOINT_SCHEMA) {
    throw new ValidationError(
      `machine authority currentness checkpoint schema must be ${MACHINE_AUTHORITY_CURRENTNESS_CHECKPOINT_SCHEMA}`
    );
  }
  const statement = normalizeStatement(value.statement);
  const statementDigest = digest(
    value.statement_digest,
    'machine authority currentness statement_digest'
  );
  if (statementDigest !== digestObject(statement)) {
    throw new ValidationError('machine authority currentness statement digest mismatch');
  }
  const publicKey = parsePublicKey(
    trustedAuthoritySourcePublicKey,
    'machine authority currentness trusted source public key'
  );
  if (statement.authority_source_key_id !== authoritySourceKeyId(publicKey)) {
    throw new ValidationError('machine authority currentness source key substitution');
  }
  const signature = assertString(
    value.authority_source_signature,
    'machine authority currentness authority_source_signature',
    { min: 32, max: 1024, pattern: BASE64URL }
  );
  let signatureValid = false;
  try {
    signatureValid = verify(
      null,
      Buffer.from(canonicalJson({
        schema: MACHINE_AUTHORITY_CURRENTNESS_CHECKPOINT_SCHEMA,
        statement,
        statement_digest: statementDigest
      })),
      publicKey,
      Buffer.from(signature, 'base64url')
    );
  } catch {
    signatureValid = false;
  }
  if (!signatureValid) {
    throw new ValidationError('machine authority currentness source signature is invalid');
  }
  const signed = Object.freeze({
    schema: MACHINE_AUTHORITY_CURRENTNESS_CHECKPOINT_SCHEMA,
    statement,
    statement_digest: statementDigest,
    authority_source_signature: signature
  });
  const checkpointDigest = digest(
    value.checkpoint_digest,
    'machine authority currentness checkpoint_digest'
  );
  if (checkpointDigest !== digestObject(signed)) {
    throw new ValidationError('machine authority currentness checkpoint digest mismatch');
  }
  return Object.freeze({ ...signed, checkpoint_digest: checkpointDigest });
}

function assertCheckpointProgression(previous, current) {
  if (current.statement.checkpoint_sequence !== previous.statement.checkpoint_sequence + 1) {
    throw new ValidationError(
      'machine authority currentness checkpoint sequence must advance exactly one'
    );
  }
  if (current.statement.predecessor_checkpoint_digest !== previous.checkpoint_digest) {
    throw new ValidationError(
      'machine authority currentness predecessor checkpoint digest mismatch'
    );
  }
  if (
    current.statement.authority_source_id !== previous.statement.authority_source_id
    || current.statement.authority_source_key_id !== previous.statement.authority_source_key_id
    || current.statement.principal_id !== previous.statement.principal_id
  ) {
    throw new ValidationError(
      'machine authority currentness chain changed source or principal identity'
    );
  }
  if (
    timestampValue(current.statement.evaluated_at)
    < timestampValue(previous.statement.evaluated_at)
  ) {
    throw new ValidationError('machine authority currentness checkpoint time moved backward');
  }
}

export function createMachineAuthorityCurrentnessCheckpoint({
  checkpointId,
  checkpointSequence,
  previousCheckpoint = null,
  authoritySourceId,
  authoritySourcePrivateKey,
  principalId,
  currentAuthorityDigest,
  reasonCode = null,
  evaluatedAt
} = {}) {
  const privateKey = parsePrivateKey(
    authoritySourcePrivateKey,
    'machine authority currentness source private key'
  );
  const publicKey = createPublicKey(privateKey);
  const sequence = positiveInteger(
    checkpointSequence,
    'machine authority currentness checkpointSequence'
  );
  let previous = null;
  if (previousCheckpoint !== null) {
    previous = verifySignatureEnvelope(previousCheckpoint, publicKey);
  }
  if (sequence === 1 && previous !== null) {
    throw new ValidationError(
      'machine authority currentness genesis checkpoint cannot provide a predecessor'
    );
  }
  if (sequence > 1 && previous === null) {
    throw new ValidationError(
      'machine authority currentness non-genesis checkpoint requires previousCheckpoint'
    );
  }

  const status = currentAuthorityDigest === null ? 'revoked' : 'active';
  const statement = normalizeStatement({
    checkpoint_id: checkpointId,
    checkpoint_sequence: sequence,
    predecessor_checkpoint_digest: previous?.checkpoint_digest ?? null,
    authority_source_id: authoritySourceId,
    authority_source_key_id: authoritySourceKeyId(publicKey),
    principal_id: principalId,
    evaluated_at: evaluatedAt,
    status,
    current_authority_digest: currentAuthorityDigest,
    reason_code: reasonCode,
    ...FIXED_SEMANTICS
  });
  const statementDigest = digestObject(statement);
  const signable = Object.freeze({
    schema: MACHINE_AUTHORITY_CURRENTNESS_CHECKPOINT_SCHEMA,
    statement,
    statement_digest: statementDigest
  });
  const authoritySourceSignature = sign(
    null,
    Buffer.from(canonicalJson(signable)),
    privateKey
  ).toString('base64url');
  const signed = Object.freeze({
    ...signable,
    authority_source_signature: authoritySourceSignature
  });
  const checkpoint = Object.freeze({
    ...signed,
    checkpoint_digest: digestObject(signed)
  });
  if (previous) assertCheckpointProgression(previous, checkpoint);
  return checkpoint;
}

export function verifyMachineAuthorityCurrentnessCheckpoint(raw, {
  trustedAuthoritySourcePublicKey,
  expectedLatestCheckpointDigest
} = {}) {
  const checkpoint = verifySignatureEnvelope(raw, trustedAuthoritySourcePublicKey);
  if (
    expectedLatestCheckpointDigest !== undefined
    && checkpoint.checkpoint_digest !== digest(
      expectedLatestCheckpointDigest,
      'machine authority currentness expectedLatestCheckpointDigest'
    )
  ) {
    throw new ValidationError(
      'machine authority currentness checkpoint is not the expected retained latest authority head'
    );
  }
  return checkpoint;
}

export function verifyMachineAuthorityCurrentnessCheckpointChain(rawChain, {
  trustedAuthoritySourcePublicKey
} = {}) {
  if (!Array.isArray(rawChain) || rawChain.length < 1 || rawChain.length > 256) {
    throw new ValidationError(
      'machine authority currentness checkpoint chain must contain 1-256 checkpoints'
    );
  }
  const verified = [];
  for (const raw of rawChain) {
    const checkpoint = verifySignatureEnvelope(raw, trustedAuthoritySourcePublicKey);
    if (verified.length) assertCheckpointProgression(verified.at(-1), checkpoint);
    verified.push(checkpoint);
  }
  if (verified[0].statement.checkpoint_sequence !== 1) {
    throw new ValidationError(
      'machine authority currentness checkpoint chain must start at sequence one'
    );
  }
  return Object.freeze([...verified]);
}

export function evaluateMachineAuthorityCurrentnessAtEffect({
  checkpoint: rawCheckpoint,
  trustedAuthoritySourcePublicKey,
  expectedLatestCheckpointDigest,
  effectAt,
  maxEvidenceAgeMs = 30_000
} = {}) {
  if (
    !Number.isSafeInteger(maxEvidenceAgeMs)
    || maxEvidenceAgeMs < 0
    || maxEvidenceAgeMs > MAX_MACHINE_AUTHORITY_CURRENTNESS_AGE_MS
  ) {
    throw new ValidationError(
      `machine authority currentness maxEvidenceAgeMs must be 0-${MAX_MACHINE_AUTHORITY_CURRENTNESS_AGE_MS}`
    );
  }
  const checkpoint = verifyMachineAuthorityCurrentnessCheckpoint(rawCheckpoint, {
    trustedAuthoritySourcePublicKey,
    expectedLatestCheckpointDigest
  });
  const effectTime = canonicalTimestamp(
    effectAt,
    'machine authority currentness effectAt'
  );
  const ageMs = timestampValue(effectTime) - timestampValue(checkpoint.statement.evaluated_at);
  if (ageMs < 0) {
    throw new ValidationError(
      'machine authority currentness checkpoint cannot be evaluated after the effect boundary'
    );
  }
  if (ageMs > maxEvidenceAgeMs) {
    throw new ValidationError(
      'machine authority currentness evidence is too stale for the requested effect boundary'
    );
  }
  if (checkpoint.statement.status !== 'active') {
    throw new ValidationError(
      'machine authority currentness authority is revoked; new effect denied'
    );
  }
  return Object.freeze({
    valid: true,
    schema: 'axiom-machine-authority-currentness-check.v1',
    principal_id: checkpoint.statement.principal_id,
    checkpoint_digest: checkpoint.checkpoint_digest,
    authority_source_id: checkpoint.statement.authority_source_id,
    authority_source_key_id: checkpoint.statement.authority_source_key_id,
    evaluated_at: checkpoint.statement.evaluated_at,
    effect_at: effectTime,
    evidence_age_ms: ageMs,
    max_evidence_age_ms: maxEvidenceAgeMs,
    current_authority_digest: checkpoint.statement.current_authority_digest,
    known_current_under_signed_authority_head: true,
    ...FIXED_SEMANTICS
  });
}
