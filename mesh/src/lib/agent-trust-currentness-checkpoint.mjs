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
  digestObject
} from './canonical.mjs';
import {
  evaluateMachineIdentityCurrentness,
  machineIdentityKeyId,
  verifyMachineIdentityCredentialHistory,
  verifyMachineIdentityRevocation
} from './agent-trust-machine-identity.mjs';

export const AGENT_CURRENTNESS_CHECKPOINT_SCHEMA = 'axiom-agent-currentness-checkpoint.v1';
export const AGENT_CURRENTNESS_CHECKPOINT_KIND = 'retained-issuer-evidence-currentness';
export const MAX_EFFECT_CURRENTNESS_AGE_MS = 60_000;

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const STATUSES = new Set(['active', 'revoked', 'expired', 'not-yet-valid']);

const TOP_KEYS = new Set([
  'schema', 'statement', 'statement_digest', 'observer_signature', 'checkpoint_digest'
]);
const STATEMENT_KEYS = new Set([
  'checkpoint_id', 'checkpoint_sequence', 'predecessor_checkpoint_digest',
  'observer_id', 'observer_key_id', 'principal_id', 'issuer_id',
  'evaluated_at', 'credential_history_digest', 'credential_digests',
  'revocation_set_digest', 'revocation_digests',
  'currentness_status', 'current_credential_digest', 'current_key_epoch',
  'current_operational_key_id', 'current_revocation_digest', 'current_reason_code',
  'checkpoint_kind', 'evidence_scope', 'rollback_detection_scope',
  'global_currentness_claimed', 'ancestor_relationship_verified',
  'effect_admission_authorized', 'authority_effect', 'delegation_effect'
]);

const FIXED_SEMANTICS = Object.freeze({
  checkpoint_kind: AGENT_CURRENTNESS_CHECKPOINT_KIND,
  evidence_scope: 'supplied-issuer-evidence-only',
  rollback_detection_scope: 'retained-signed-checkpoint-chain',
  global_currentness_claimed: false,
  ancestor_relationship_verified: false,
  effect_admission_authorized: false,
  authority_effect: 'none',
  delegation_effect: 'none'
});

function exactObject(raw, allowed, label) {
  const value = assertPlainObject(raw, label);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ValidationError(`${label} contains unsupported field ${key}`);
  }
  for (const key of allowed) {
    if (!Object.hasOwn(value, key)) throw new ValidationError(`${label} is missing required field ${key}`);
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

function timestampValue(value) {
  return new Date(value).valueOf();
}

function positiveInteger(value, label, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) {
    throw new ValidationError(`${label} must be a positive safe integer`);
  }
  return value;
}

function nullablePositiveInteger(value, label) {
  if (value === null) return null;
  return positiveInteger(value, label, 256);
}

function canonicalDigestArray(raw, label, { ordered = false, maxItems = 256 } = {}) {
  if (!Array.isArray(raw) || raw.length > maxItems) {
    throw new ValidationError(`${label} must contain at most ${maxItems} digests`);
  }
  const values = raw.map((item, index) => digest(item, `${label}[${index}]`));
  if (new Set(values).size !== values.length) {
    throw new ValidationError(`${label} must not contain duplicates`);
  }
  if (!ordered) {
    const sorted = [...values].sort();
    if (canonicalJson(values) !== canonicalJson(sorted)) {
      throw new ValidationError(`${label} must be sorted`);
    }
  }
  return Object.freeze(values);
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
  if (key.asymmetricKeyType !== 'ed25519') throw new ValidationError(`${label} must be Ed25519`);
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
  if (key.asymmetricKeyType !== 'ed25519') throw new ValidationError(`${label} must be Ed25519`);
  return key;
}

function assertFixedSemantics(raw) {
  for (const [key, expected] of Object.entries(FIXED_SEMANTICS)) {
    if (raw[key] !== expected) {
      throw new ValidationError(`agent currentness checkpoint ${key} must remain ${String(expected)}`);
    }
  }
}

function normalizeEvidence({ credentialHistory, revocations = [], trustedIssuerPublicKey }) {
  const history = verifyMachineIdentityCredentialHistory(credentialHistory, {
    trustedIssuerPublicKey
  });
  if (!Array.isArray(revocations) || revocations.length > 256) {
    throw new ValidationError('agent currentness revocations must contain at most 256 entries');
  }
  const verifiedRevocations = revocations.map(item => verifyMachineIdentityRevocation(item, {
    trustedIssuerPublicKey,
    expectedIssuerId: history[0].statement.issuer_id,
    expectedPrincipalId: history[0].statement.principal_id
  }));
  const knownCredentials = new Map(history.map(item => [item.credential_digest, item]));
  const seenCredentialRevocations = new Set();
  for (const item of verifiedRevocations) {
    const credential = knownCredentials.get(item.statement.credential_digest);
    if (!credential) {
      throw new ValidationError('agent currentness revocation references credential outside supplied history');
    }
    if (
      credential.statement.key_epoch !== item.statement.key_epoch
      || credential.statement.operational_key_id !== item.statement.operational_key_id
    ) {
      throw new ValidationError('agent currentness revocation credential binding mismatch');
    }
    if (seenCredentialRevocations.has(item.statement.credential_digest)) {
      throw new ValidationError('agent currentness v1 permits at most one revocation record per credential');
    }
    seenCredentialRevocations.add(item.statement.credential_digest);
  }
  const canonicalRevocations = [...verifiedRevocations].sort((left, right) => (
    left.revocation_digest.localeCompare(right.revocation_digest)
  ));
  return Object.freeze({
    history,
    revocations: Object.freeze(canonicalRevocations),
    credentialDigests: Object.freeze(history.map(item => item.credential_digest)),
    revocationDigests: Object.freeze(canonicalRevocations.map(item => item.revocation_digest)),
    credentialHistoryDigest: digestObject(history),
    revocationSetDigest: digestObject(canonicalRevocations)
  });
}

function currentnessProjection(currentness) {
  if (!STATUSES.has(currentness.status)) {
    throw new ValidationError('agent currentness status is unsupported');
  }
  return Object.freeze({
    currentness_status: currentness.status,
    current_credential_digest: currentness.credential_digest ?? null,
    current_key_epoch: currentness.key_epoch ?? null,
    current_operational_key_id: currentness.operational_key_id ?? null,
    current_revocation_digest: currentness.revocation_digest ?? null,
    current_reason_code: currentness.reason_code ?? null
  });
}

function normalizeStatement(raw) {
  const value = exactObject(raw, STATEMENT_KEYS, 'agent currentness checkpoint statement');
  assertFixedSemantics(value);
  const sequence = positiveInteger(value.checkpoint_sequence, 'agent currentness checkpoint_sequence', 1_000_000);
  const predecessor = nullableDigest(
    value.predecessor_checkpoint_digest,
    'agent currentness predecessor_checkpoint_digest'
  );
  if (sequence === 1 && predecessor !== null) {
    throw new ValidationError('agent currentness genesis checkpoint cannot name a predecessor');
  }
  if (sequence > 1 && predecessor === null) {
    throw new ValidationError('agent currentness non-genesis checkpoint requires a predecessor');
  }
  const status = assertString(value.currentness_status, 'agent currentness currentness_status', {
    min: 6,
    max: 32
  });
  if (!STATUSES.has(status)) throw new ValidationError('agent currentness status is unsupported');
  const currentCredential = nullableDigest(
    value.current_credential_digest,
    'agent currentness current_credential_digest'
  );
  const currentEpoch = nullablePositiveInteger(value.current_key_epoch, 'agent currentness current_key_epoch');
  const currentOperational = nullableDigest(
    value.current_operational_key_id,
    'agent currentness current_operational_key_id'
  );
  const currentRevocation = nullableDigest(
    value.current_revocation_digest,
    'agent currentness current_revocation_digest'
  );
  const currentReason = value.current_reason_code === null
    ? null
    : assertString(value.current_reason_code, 'agent currentness current_reason_code', {
      min: 1,
      max: 64,
      pattern: /^[a-z][a-z0-9._-]{0,63}$/
    });

  if (status === 'not-yet-valid') {
    if (currentCredential !== null || currentEpoch !== null || currentOperational !== null || currentRevocation !== null || currentReason !== null) {
      throw new ValidationError('not-yet-valid currentness cannot name an active or revoked credential');
    }
  } else {
    if (currentCredential === null || currentEpoch === null) {
      throw new ValidationError('terminal/current credential status requires credential digest and epoch');
    }
    if (status === 'active' && currentOperational === null) {
      throw new ValidationError('active currentness requires an operational key id');
    }
    if (status !== 'active' && currentOperational !== null) {
      throw new ValidationError('non-active currentness cannot claim an active operational key');
    }
    if (status === 'revoked') {
      if (currentRevocation === null || currentReason === null) {
        throw new ValidationError('revoked currentness requires revocation evidence');
      }
    } else if (currentRevocation !== null || currentReason !== null) {
      throw new ValidationError('non-revoked currentness cannot claim revocation evidence');
    }
  }

  return Object.freeze({
    checkpoint_id: identifier(value.checkpoint_id, 'agent currentness checkpoint_id'),
    checkpoint_sequence: sequence,
    predecessor_checkpoint_digest: predecessor,
    observer_id: identifier(value.observer_id, 'agent currentness observer_id'),
    observer_key_id: digest(value.observer_key_id, 'agent currentness observer_key_id'),
    principal_id: identifier(value.principal_id, 'agent currentness principal_id'),
    issuer_id: identifier(value.issuer_id, 'agent currentness issuer_id'),
    evaluated_at: canonicalTimestamp(value.evaluated_at, 'agent currentness evaluated_at'),
    credential_history_digest: digest(
      value.credential_history_digest,
      'agent currentness credential_history_digest'
    ),
    credential_digests: canonicalDigestArray(
      value.credential_digests,
      'agent currentness credential_digests',
      { ordered: true }
    ),
    revocation_set_digest: digest(value.revocation_set_digest, 'agent currentness revocation_set_digest'),
    revocation_digests: canonicalDigestArray(
      value.revocation_digests,
      'agent currentness revocation_digests'
    ),
    currentness_status: status,
    current_credential_digest: currentCredential,
    current_key_epoch: currentEpoch,
    current_operational_key_id: currentOperational,
    current_revocation_digest: currentRevocation,
    current_reason_code: currentReason,
    ...FIXED_SEMANTICS
  });
}

function verifySignatureEnvelope(raw, trustedObserverPublicKey) {
  const value = exactObject(raw, TOP_KEYS, 'agent currentness checkpoint');
  if (value.schema !== AGENT_CURRENTNESS_CHECKPOINT_SCHEMA) {
    throw new ValidationError(`agent currentness checkpoint schema must be ${AGENT_CURRENTNESS_CHECKPOINT_SCHEMA}`);
  }
  const statement = normalizeStatement(value.statement);
  const statementDigest = digest(value.statement_digest, 'agent currentness statement_digest');
  if (statementDigest !== digestObject(statement)) {
    throw new ValidationError('agent currentness statement digest mismatch');
  }
  const publicKey = parsePublicKey(trustedObserverPublicKey, 'agent currentness trusted observer public key');
  if (statement.observer_key_id !== machineIdentityKeyId(publicKey)) {
    throw new ValidationError('agent currentness observer key substitution');
  }
  const signature = assertString(value.observer_signature, 'agent currentness observer_signature', {
    min: 32,
    max: 1024,
    pattern: BASE64URL
  });
  let signatureValid = false;
  try {
    signatureValid = verify(
      null,
      Buffer.from(canonicalJson({
        schema: AGENT_CURRENTNESS_CHECKPOINT_SCHEMA,
        statement,
        statement_digest: statementDigest
      })),
      publicKey,
      Buffer.from(signature, 'base64url')
    );
  } catch {
    signatureValid = false;
  }
  if (!signatureValid) throw new ValidationError('agent currentness observer signature is invalid');
  const signed = Object.freeze({
    schema: AGENT_CURRENTNESS_CHECKPOINT_SCHEMA,
    statement,
    statement_digest: statementDigest,
    observer_signature: signature
  });
  const checkpointDigest = digest(value.checkpoint_digest, 'agent currentness checkpoint_digest');
  if (checkpointDigest !== digestObject(signed)) {
    throw new ValidationError('agent currentness checkpoint digest mismatch');
  }
  return Object.freeze({ ...signed, checkpoint_digest: checkpointDigest });
}

function assertCheckpointProgression(previous, current) {
  if (current.statement.checkpoint_sequence !== previous.statement.checkpoint_sequence + 1) {
    throw new ValidationError('agent currentness checkpoint sequence must advance exactly one');
  }
  if (current.statement.predecessor_checkpoint_digest !== previous.checkpoint_digest) {
    throw new ValidationError('agent currentness predecessor checkpoint digest mismatch');
  }
  if (
    current.statement.observer_id !== previous.statement.observer_id
    || current.statement.observer_key_id !== previous.statement.observer_key_id
    || current.statement.principal_id !== previous.statement.principal_id
    || current.statement.issuer_id !== previous.statement.issuer_id
  ) {
    throw new ValidationError('agent currentness checkpoint chain changed observer or principal identity');
  }
  if (timestampValue(current.statement.evaluated_at) < timestampValue(previous.statement.evaluated_at)) {
    throw new ValidationError('agent currentness checkpoint time moved backward');
  }
  const priorCredentials = previous.statement.credential_digests;
  const nextCredentials = current.statement.credential_digests;
  if (
    nextCredentials.length < priorCredentials.length
    || priorCredentials.some((item, index) => nextCredentials[index] !== item)
  ) {
    throw new ValidationError('agent currentness credential history was truncated or rewritten');
  }
  const nextRevocations = new Set(current.statement.revocation_digests);
  for (const item of previous.statement.revocation_digests) {
    if (!nextRevocations.has(item)) {
      throw new ValidationError('agent currentness revocation evidence was truncated');
    }
  }
}

export function createAgentCurrentnessCheckpoint({
  checkpointId,
  checkpointSequence,
  previousCheckpoint = null,
  credentialHistory,
  revocations = [],
  trustedIssuerPublicKey,
  observerId,
  observerPrivateKey,
  evaluatedAt
} = {}) {
  const evidence = normalizeEvidence({ credentialHistory, revocations, trustedIssuerPublicKey });
  const evaluated = canonicalTimestamp(evaluatedAt, 'agent currentness evaluatedAt');
  const currentness = evaluateMachineIdentityCurrentness({
    credentialHistory: evidence.history,
    revocations: evidence.revocations,
    trustedIssuerPublicKey,
    at: evaluated
  });
  const privateKey = parsePrivateKey(observerPrivateKey, 'agent currentness observer private key');
  const publicKey = createPublicKey(privateKey);
  const sequence = positiveInteger(checkpointSequence, 'agent currentness checkpointSequence', 1_000_000);

  let previous = null;
  if (previousCheckpoint !== null) {
    previous = verifySignatureEnvelope(previousCheckpoint, publicKey);
  }
  if (sequence === 1 && previous !== null) {
    throw new ValidationError('agent currentness genesis checkpoint cannot provide a predecessor');
  }
  if (sequence > 1 && previous === null) {
    throw new ValidationError('agent currentness non-genesis checkpoint requires previousCheckpoint');
  }

  const projected = currentnessProjection(currentness);
  const statement = normalizeStatement({
    checkpoint_id: checkpointId,
    checkpoint_sequence: sequence,
    predecessor_checkpoint_digest: previous?.checkpoint_digest ?? null,
    observer_id: observerId,
    observer_key_id: machineIdentityKeyId(publicKey),
    principal_id: evidence.history[0].statement.principal_id,
    issuer_id: evidence.history[0].statement.issuer_id,
    evaluated_at: evaluated,
    credential_history_digest: evidence.credentialHistoryDigest,
    credential_digests: evidence.credentialDigests,
    revocation_set_digest: evidence.revocationSetDigest,
    revocation_digests: evidence.revocationDigests,
    ...projected,
    ...FIXED_SEMANTICS
  });
  const statementDigest = digestObject(statement);
  const signable = Object.freeze({
    schema: AGENT_CURRENTNESS_CHECKPOINT_SCHEMA,
    statement,
    statement_digest: statementDigest
  });
  const observerSignature = sign(
    null,
    Buffer.from(canonicalJson(signable)),
    privateKey
  ).toString('base64url');
  const signed = Object.freeze({
    schema: AGENT_CURRENTNESS_CHECKPOINT_SCHEMA,
    statement,
    statement_digest: statementDigest,
    observer_signature: observerSignature
  });
  const checkpoint = Object.freeze({ ...signed, checkpoint_digest: digestObject(signed) });
  if (previous) assertCheckpointProgression(previous, checkpoint);
  return checkpoint;
}

export function verifyAgentCurrentnessCheckpoint(raw, {
  trustedObserverPublicKey,
  credentialHistory,
  revocations = [],
  trustedIssuerPublicKey,
  expectedLatestCheckpointDigest
} = {}) {
  const checkpoint = verifySignatureEnvelope(raw, trustedObserverPublicKey);
  const evidence = normalizeEvidence({ credentialHistory, revocations, trustedIssuerPublicKey });
  if (checkpoint.statement.principal_id !== evidence.history[0].statement.principal_id) {
    throw new ValidationError('agent currentness checkpoint principal does not match supplied issuer evidence');
  }
  if (checkpoint.statement.issuer_id !== evidence.history[0].statement.issuer_id) {
    throw new ValidationError('agent currentness checkpoint issuer does not match supplied issuer evidence');
  }
  if (
    checkpoint.statement.credential_history_digest !== evidence.credentialHistoryDigest
    || canonicalJson(checkpoint.statement.credential_digests) !== canonicalJson(evidence.credentialDigests)
  ) {
    throw new ValidationError('agent currentness checkpoint credential history does not match supplied evidence');
  }
  if (
    checkpoint.statement.revocation_set_digest !== evidence.revocationSetDigest
    || canonicalJson(checkpoint.statement.revocation_digests) !== canonicalJson(evidence.revocationDigests)
  ) {
    throw new ValidationError('agent currentness checkpoint revocation set does not match supplied evidence');
  }
  const currentness = currentnessProjection(evaluateMachineIdentityCurrentness({
    credentialHistory: evidence.history,
    revocations: evidence.revocations,
    trustedIssuerPublicKey,
    at: checkpoint.statement.evaluated_at
  }));
  for (const key of [
    'currentness_status', 'current_credential_digest', 'current_key_epoch',
    'current_operational_key_id', 'current_revocation_digest', 'current_reason_code'
  ]) {
    if (checkpoint.statement[key] !== currentness[key]) {
      throw new ValidationError(`agent currentness checkpoint ${key} does not reproduce from supplied evidence`);
    }
  }
  if (
    expectedLatestCheckpointDigest !== undefined
    && checkpoint.checkpoint_digest !== expectedLatestCheckpointDigest
  ) {
    throw new ValidationError('agent currentness checkpoint is not the expected retained latest head');
  }
  return checkpoint;
}

export function verifyAgentCurrentnessCheckpointChain(rawChain, {
  trustedObserverPublicKey,
  evidenceByCheckpointDigest
} = {}) {
  if (!Array.isArray(rawChain) || rawChain.length < 1 || rawChain.length > 256) {
    throw new ValidationError('agent currentness checkpoint chain must contain 1-256 checkpoints');
  }
  if (!(evidenceByCheckpointDigest instanceof Map)) {
    throw new ValidationError('agent currentness checkpoint chain requires evidenceByCheckpointDigest Map');
  }
  const verified = [];
  for (const raw of rawChain) {
    const signed = verifySignatureEnvelope(raw, trustedObserverPublicKey);
    const evidence = evidenceByCheckpointDigest.get(signed.checkpoint_digest);
    if (!evidence) {
      throw new ValidationError('agent currentness checkpoint chain is missing exact issuer evidence');
    }
    const checkpoint = verifyAgentCurrentnessCheckpoint(signed, {
      trustedObserverPublicKey,
      ...evidence
    });
    if (verified.length) assertCheckpointProgression(verified.at(-1), checkpoint);
    verified.push(checkpoint);
  }
  if (verified[0].statement.checkpoint_sequence !== 1) {
    throw new ValidationError('agent currentness checkpoint chain must start at sequence one');
  }
  return Object.freeze([...verified]);
}

export function evaluateAgentCurrentnessAtEffect({
  checkpoint: rawCheckpoint,
  trustedObserverPublicKey,
  credentialHistory,
  revocations = [],
  trustedIssuerPublicKey,
  expectedLatestCheckpointDigest,
  effectAt,
  maxEvidenceAgeMs = 30_000
} = {}) {
  const retainedLatestHead = digest(
    expectedLatestCheckpointDigest,
    'agent effect currentness expectedLatestCheckpointDigest'
  );
  if (!Number.isSafeInteger(maxEvidenceAgeMs) || maxEvidenceAgeMs < 0 || maxEvidenceAgeMs > MAX_EFFECT_CURRENTNESS_AGE_MS) {
    throw new ValidationError(`agent effect currentness maxEvidenceAgeMs must be 0-${MAX_EFFECT_CURRENTNESS_AGE_MS}`);
  }
  const checkpoint = verifyAgentCurrentnessCheckpoint(rawCheckpoint, {
    trustedObserverPublicKey,
    credentialHistory,
    revocations,
    trustedIssuerPublicKey,
    expectedLatestCheckpointDigest: retainedLatestHead
  });
  const effectTime = canonicalTimestamp(effectAt, 'agent effect currentness effectAt');
  const ageMs = timestampValue(effectTime) - timestampValue(checkpoint.statement.evaluated_at);
  if (ageMs < 0) {
    throw new ValidationError('agent effect currentness checkpoint cannot be evaluated after the effect boundary');
  }
  if (ageMs > maxEvidenceAgeMs) {
    throw new ValidationError('agent effect currentness evidence is too stale for the requested effect boundary');
  }
  const evidence = normalizeEvidence({ credentialHistory, revocations, trustedIssuerPublicKey });
  const atEffect = evaluateMachineIdentityCurrentness({
    credentialHistory: evidence.history,
    revocations: evidence.revocations,
    trustedIssuerPublicKey,
    at: effectTime
  });
  if (atEffect.status !== 'active') {
    throw new ValidationError(`agent effect currentness is ${atEffect.status}; new effect denied`);
  }
  return Object.freeze({
    valid: true,
    schema: 'axiom-agent-effect-currentness-check.v1',
    principal_id: checkpoint.statement.principal_id,
    checkpoint_digest: checkpoint.checkpoint_digest,
    evaluated_at: checkpoint.statement.evaluated_at,
    effect_at: effectTime,
    evidence_age_ms: ageMs,
    max_evidence_age_ms: maxEvidenceAgeMs,
    active_credential_digest: atEffect.credential_digest,
    active_key_epoch: atEffect.key_epoch,
    known_active_under_retained_evidence: true,
    evidence_scope: 'supplied-issuer-evidence-plus-retained-checkpoint-head',
    global_currentness_claimed: false,
    ancestor_relationship_verified: false,
    effect_admission_authorized: false,
    consume_before_effect_observed: false,
    authority_effect: 'none',
    delegation_effect: 'none'
  });
}

export function evaluateAgentCurrentnessSetAtEffect(entries, {
  effectAt,
  maxEvidenceAgeMs = 30_000
} = {}) {
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > 64) {
    throw new ValidationError('agent effect currentness set must contain 1-64 entries');
  }
  const principalIds = new Set();
  const checks = entries.map((entry, index) => {
    const check = evaluateAgentCurrentnessAtEffect({
      ...entry,
      effectAt,
      maxEvidenceAgeMs
    });
    if (principalIds.has(check.principal_id)) {
      throw new ValidationError(`agent effect currentness set repeats principal ${check.principal_id}`);
    }
    principalIds.add(check.principal_id);
    return Object.freeze({ index, ...check });
  });
  return Object.freeze({
    valid: true,
    schema: 'axiom-agent-effect-currentness-set.v1',
    effect_at: canonicalTimestamp(effectAt, 'agent effect currentness set effectAt'),
    principals_checked: checks.length,
    checks: Object.freeze(checks),
    all_known_active_under_retained_evidence: true,
    relationship_between_principals_claimed: false,
    global_currentness_claimed: false,
    effect_admission_authorized: false,
    consume_before_effect_observed: false,
    authority_effect: 'none',
    delegation_effect: 'none'
  });
}
