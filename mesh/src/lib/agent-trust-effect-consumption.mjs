import {
  createPrivateKey,
  createPublicKey,
  sign,
  verify
} from 'node:crypto';
import {
  mkdir,
  open,
  readFile,
  realpath
} from 'node:fs/promises';
import {
  isAbsolute,
  join,
  resolve
} from 'node:path';

import {
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject
} from './canonical.mjs';
import {
  machineIdentityKeyId,
  verifyMachineIdentityCredential
} from './agent-trust-machine-identity.mjs';
import { verifyAgentSignedHandoff } from './agent-trust-signed-handoff.mjs';
import { evaluateAgentCurrentnessSetAtEffect } from './agent-trust-currentness-checkpoint.mjs';

export const AGENT_EFFECT_CONSUMPTION_RECORD_SCHEMA = 'axiom-agent-effect-consumption-record.v1';
export const AGENT_EFFECT_CONSUMPTION_ACTION = 'agent.read-system-facts';
export const AGENT_EFFECT_CONSUMPTION_STORE_POLICY = 'hash-derived-exclusive-create-v1';

const DIGEST = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const MAX_RECORD_BYTES = 65_536;

const TOP_KEYS = new Set([
  'schema', 'statement', 'statement_digest', 'store_signature', 'record_digest'
]);
const STATEMENT_KEYS = new Set([
  'consumption_id',
  'handoff_digest',
  'handoff_id',
  'sender_principal_id',
  'sender_credential_digest',
  'executor_principal_id',
  'executor_credential_digest',
  'action',
  'input_digest',
  'effect_at',
  'currentness_set_digest',
  'sender_currentness_checkpoint_digest',
  'executor_currentness_checkpoint_digest',
  'sender_active_credential_digest',
  'executor_active_credential_digest',
  'store_key_id',
  'storage_key',
  'state',
  'consumption_kind',
  'store_policy',
  'storage_scope',
  'consume_before_effect_committed',
  'effect_executed',
  'effect_admission_authorized',
  'resume_after_recovery_allowed',
  'global_currentness_claimed',
  'rollback_detection_scope',
  'media_durability_claimed',
  'production_persistence_claimed',
  'authority_effect',
  'delegation_effect'
]);

const FIXED_SEMANTICS = Object.freeze({
  state: 'consumed',
  consumption_kind: 'one-time-pre-effect-consumption',
  store_policy: AGENT_EFFECT_CONSUMPTION_STORE_POLICY,
  storage_scope: 'caller-selected-root-plus-hash-derived-control-path',
  consume_before_effect_committed: true,
  effect_executed: false,
  effect_admission_authorized: false,
  resume_after_recovery_allowed: false,
  global_currentness_claimed: false,
  rollback_detection_scope: 'retained-record-digest-required',
  media_durability_claimed: false,
  production_persistence_claimed: false,
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

function assertFixedSemantics(value) {
  for (const [key, expected] of Object.entries(FIXED_SEMANTICS)) {
    if (value[key] !== expected) {
      throw new ValidationError(`agent effect consumption ${key} must remain ${String(expected)}`);
    }
  }
}

function storageKeyFor({ handoffDigest, action, inputDigest, executorCredentialDigest }) {
  return digestObject(Object.freeze({
    schema: 'axiom-agent-effect-consumption-storage-key.v1',
    handoff_digest: handoffDigest,
    action,
    input_digest: inputDigest,
    executor_credential_digest: executorCredentialDigest
  }));
}

function normalizeStatement(raw) {
  const value = exactObject(raw, STATEMENT_KEYS, 'agent effect consumption statement');
  assertFixedSemantics(value);
  if (value.action !== AGENT_EFFECT_CONSUMPTION_ACTION) {
    throw new ValidationError(`agent effect consumption action must remain ${AGENT_EFFECT_CONSUMPTION_ACTION}`);
  }
  const statement = Object.freeze({
    consumption_id: identifier(value.consumption_id, 'agent effect consumption consumption_id'),
    handoff_digest: digest(value.handoff_digest, 'agent effect consumption handoff_digest'),
    handoff_id: identifier(value.handoff_id, 'agent effect consumption handoff_id'),
    sender_principal_id: identifier(value.sender_principal_id, 'agent effect consumption sender_principal_id'),
    sender_credential_digest: digest(
      value.sender_credential_digest,
      'agent effect consumption sender_credential_digest'
    ),
    executor_principal_id: identifier(
      value.executor_principal_id,
      'agent effect consumption executor_principal_id'
    ),
    executor_credential_digest: digest(
      value.executor_credential_digest,
      'agent effect consumption executor_credential_digest'
    ),
    action: value.action,
    input_digest: digest(value.input_digest, 'agent effect consumption input_digest'),
    effect_at: canonicalTimestamp(value.effect_at, 'agent effect consumption effect_at'),
    currentness_set_digest: digest(
      value.currentness_set_digest,
      'agent effect consumption currentness_set_digest'
    ),
    sender_currentness_checkpoint_digest: digest(
      value.sender_currentness_checkpoint_digest,
      'agent effect consumption sender_currentness_checkpoint_digest'
    ),
    executor_currentness_checkpoint_digest: digest(
      value.executor_currentness_checkpoint_digest,
      'agent effect consumption executor_currentness_checkpoint_digest'
    ),
    sender_active_credential_digest: digest(
      value.sender_active_credential_digest,
      'agent effect consumption sender_active_credential_digest'
    ),
    executor_active_credential_digest: digest(
      value.executor_active_credential_digest,
      'agent effect consumption executor_active_credential_digest'
    ),
    store_key_id: digest(value.store_key_id, 'agent effect consumption store_key_id'),
    storage_key: digest(value.storage_key, 'agent effect consumption storage_key'),
    ...FIXED_SEMANTICS
  });
  const expectedStorageKey = storageKeyFor({
    handoffDigest: statement.handoff_digest,
    action: statement.action,
    inputDigest: statement.input_digest,
    executorCredentialDigest: statement.executor_credential_digest
  });
  if (statement.storage_key !== expectedStorageKey) {
    throw new ValidationError('agent effect consumption storage_key does not reproduce from bound evidence');
  }
  return statement;
}

function normalizeRecord(raw, trustedStorePublicKey) {
  const value = exactObject(raw, TOP_KEYS, 'agent effect consumption record');
  if (value.schema !== AGENT_EFFECT_CONSUMPTION_RECORD_SCHEMA) {
    throw new ValidationError(
      `agent effect consumption schema must be ${AGENT_EFFECT_CONSUMPTION_RECORD_SCHEMA}`
    );
  }
  const statement = normalizeStatement(value.statement);
  const statementDigest = digest(
    value.statement_digest,
    'agent effect consumption statement_digest'
  );
  if (statementDigest !== digestObject(statement)) {
    throw new ValidationError('agent effect consumption statement digest mismatch');
  }
  const publicKey = parsePublicKey(
    trustedStorePublicKey,
    'agent effect consumption trusted store public key'
  );
  if (statement.store_key_id !== machineIdentityKeyId(publicKey)) {
    throw new ValidationError('agent effect consumption store key substitution');
  }
  const signature = assertString(
    value.store_signature,
    'agent effect consumption store_signature',
    { min: 32, max: 1024, pattern: BASE64URL }
  );
  let valid = false;
  try {
    valid = verify(
      null,
      Buffer.from(canonicalJson({
        schema: AGENT_EFFECT_CONSUMPTION_RECORD_SCHEMA,
        statement,
        statement_digest: statementDigest
      })),
      publicKey,
      Buffer.from(signature, 'base64url')
    );
  } catch {
    valid = false;
  }
  if (!valid) throw new ValidationError('agent effect consumption store signature is invalid');
  const signed = Object.freeze({
    schema: AGENT_EFFECT_CONSUMPTION_RECORD_SCHEMA,
    statement,
    statement_digest: statementDigest,
    store_signature: signature
  });
  const recordDigest = digest(value.record_digest, 'agent effect consumption record_digest');
  if (recordDigest !== digestObject(signed)) {
    throw new ValidationError('agent effect consumption record_digest mismatch');
  }
  return Object.freeze({ ...signed, record_digest: recordDigest });
}

function requireBoundCurrentness(checks, { handoff, executorCredential }) {
  const expected = new Map([
    [handoff.statement.sender_principal_id, handoff.statement.sender_credential_digest],
    [executorCredential.statement.principal_id, executorCredential.credential_digest]
  ]);
  if (expected.size !== 2) {
    throw new ValidationError(
      'agent effect consumption v1 requires distinct sender and executor principals'
    );
  }
  if (checks.checks.length !== 2) {
    throw new ValidationError('agent effect consumption requires exactly sender and executor currentness checks');
  }
  const byPrincipal = new Map(checks.checks.map(item => [item.principal_id, item]));
  for (const [principalId, credentialDigest] of expected) {
    const check = byPrincipal.get(principalId);
    if (!check) {
      throw new ValidationError(`agent effect consumption missing currentness for ${principalId}`);
    }
    if (check.active_credential_digest !== credentialDigest) {
      throw new ValidationError(`agent effect consumption active credential mismatch for ${principalId}`);
    }
    if (check.known_active_under_retained_evidence !== true) {
      throw new ValidationError(`agent effect consumption currentness is not known active for ${principalId}`);
    }
  }
  return Object.freeze({
    sender: byPrincipal.get(handoff.statement.sender_principal_id),
    executor: byPrincipal.get(executorCredential.statement.principal_id)
  });
}

async function canonicalStateRoot(raw) {
  const stateRoot = assertString(raw, 'agent effect consumption stateRoot', { min: 1, max: 4096 });
  if (!isAbsolute(stateRoot)) {
    throw new ValidationError('agent effect consumption stateRoot must be absolute');
  }
  const expected = resolve(stateRoot);
  await mkdir(expected, { recursive: true, mode: 0o700 });
  const actual = await realpath(expected);
  if (actual !== expected) {
    throw new ValidationError('agent effect consumption stateRoot must not traverse symbolic links');
  }
  return expected;
}

async function recordPathFor(stateRoot, storageKey) {
  const bucket = join(stateRoot, 'agent-effect-consumption-v1', storageKey.slice(0, 2));
  await mkdir(bucket, { recursive: true, mode: 0o700 });
  const actualBucket = await realpath(bucket);
  if (actualBucket !== resolve(bucket)) {
    throw new ValidationError('agent effect consumption derived state path must not traverse symbolic links');
  }
  return join(bucket, `${storageKey}.json`);
}

function buildSignedRecord({
  consumptionId,
  handoff,
  executorCredential,
  currentnessSet,
  currentness,
  effectAt,
  storePrivateKey
}) {
  const privateKey = parsePrivateKey(
    storePrivateKey,
    'agent effect consumption store private key'
  );
  const publicKey = createPublicKey(privateKey);
  const storageKey = storageKeyFor({
    handoffDigest: handoff.handoff_digest,
    action: handoff.statement.action,
    inputDigest: handoff.statement.input_digest,
    executorCredentialDigest: executorCredential.credential_digest
  });
  const statement = normalizeStatement({
    consumption_id: consumptionId,
    handoff_digest: handoff.handoff_digest,
    handoff_id: handoff.statement.handoff_id,
    sender_principal_id: handoff.statement.sender_principal_id,
    sender_credential_digest: handoff.statement.sender_credential_digest,
    executor_principal_id: executorCredential.statement.principal_id,
    executor_credential_digest: executorCredential.credential_digest,
    action: handoff.statement.action,
    input_digest: handoff.statement.input_digest,
    effect_at: effectAt,
    currentness_set_digest: digestObject(currentnessSet),
    sender_currentness_checkpoint_digest: currentness.sender.checkpoint_digest,
    executor_currentness_checkpoint_digest: currentness.executor.checkpoint_digest,
    sender_active_credential_digest: currentness.sender.active_credential_digest,
    executor_active_credential_digest: currentness.executor.active_credential_digest,
    store_key_id: machineIdentityKeyId(publicKey),
    storage_key: storageKey,
    ...FIXED_SEMANTICS
  });
  const statementDigest = digestObject(statement);
  const signable = Object.freeze({
    schema: AGENT_EFFECT_CONSUMPTION_RECORD_SCHEMA,
    statement,
    statement_digest: statementDigest
  });
  const signature = sign(
    null,
    Buffer.from(canonicalJson(signable)),
    privateKey
  ).toString('base64url');
  const signed = Object.freeze({
    ...signable,
    store_signature: signature
  });
  return Object.freeze({ ...signed, record_digest: digestObject(signed) });
}

export function verifyAgentEffectConsumptionRecord(raw, {
  trustedStorePublicKey,
  expectedHandoffDigest,
  expectedExecutorCredentialDigest,
  expectedRecordDigest
} = {}) {
  const record = normalizeRecord(raw, trustedStorePublicKey);
  if (
    expectedHandoffDigest !== undefined
    && record.statement.handoff_digest !== expectedHandoffDigest
  ) {
    throw new ValidationError('agent effect consumption handoff digest mismatch');
  }
  if (
    expectedExecutorCredentialDigest !== undefined
    && record.statement.executor_credential_digest !== expectedExecutorCredentialDigest
  ) {
    throw new ValidationError('agent effect consumption executor credential digest mismatch');
  }
  if (expectedRecordDigest !== undefined && record.record_digest !== expectedRecordDigest) {
    throw new ValidationError('agent effect consumption retained record digest mismatch');
  }
  return record;
}

export async function consumeAgentReadSystemFactsHandoff({
  stateRoot,
  consumptionId,
  handoff: rawHandoff,
  handoffEvidence,
  executorIdentityCredential,
  trustedExecutorIssuerPublicKey,
  senderCurrentness,
  executorCurrentness,
  storePrivateKey,
  effectAt,
  maxEvidenceAgeMs = 30_000
} = {}) {
  const handoff = verifyAgentSignedHandoff(rawHandoff, handoffEvidence);
  if (handoff.statement.action !== AGENT_EFFECT_CONSUMPTION_ACTION) {
    throw new ValidationError(
      `agent effect consumption only admits ${AGENT_EFFECT_CONSUMPTION_ACTION}`
    );
  }
  const effectTime = canonicalTimestamp(effectAt, 'agent effect consumption effectAt');
  if (
    new Date(effectTime).valueOf() < new Date(handoff.statement.not_before).valueOf()
    || new Date(effectTime).valueOf() >= new Date(handoff.statement.expires_at).valueOf()
  ) {
    throw new ValidationError('agent effect consumption effectAt is outside handoff window');
  }

  const executorCredential = verifyMachineIdentityCredential(executorIdentityCredential, {
    trustedIssuerPublicKey: trustedExecutorIssuerPublicKey,
    expectedPrincipalId: handoff.statement.intended_executor_id
  });
  if (executorCredential.credential_digest !== handoff.statement.intended_executor_identity_digest) {
    throw new ValidationError(
      'agent effect consumption executor credential does not match handoff intended executor identity'
    );
  }

  const currentnessSet = evaluateAgentCurrentnessSetAtEffect([
    senderCurrentness,
    executorCurrentness
  ], {
    effectAt: effectTime,
    maxEvidenceAgeMs
  });
  const boundCurrentness = requireBoundCurrentness(currentnessSet, {
    handoff,
    executorCredential
  });

  const record = buildSignedRecord({
    consumptionId,
    handoff,
    executorCredential,
    currentnessSet,
    currentness: boundCurrentness,
    effectAt: effectTime,
    storePrivateKey
  });
  const root = await canonicalStateRoot(stateRoot);
  const filePath = await recordPathFor(root, record.statement.storage_key);
  const encoded = `${canonicalJson(record)}\n`;
  if (Buffer.byteLength(encoded, 'utf8') > MAX_RECORD_BYTES) {
    throw new ValidationError('agent effect consumption record exceeds maximum encoded size');
  }

  let handle;
  try {
    handle = await open(filePath, 'wx', 0o600);
  } catch (error) {
    if (error?.code === 'EEXIST') {
      throw new ValidationError(
        'agent effect consumption already exists or is ambiguous; consumed work must not resume'
      );
    }
    throw error;
  }

  try {
    await handle.writeFile(encoded, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }

  let persisted;
  try {
    persisted = JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    throw new ValidationError(
      'agent effect consumption persisted state is unreadable; consumed work must not resume'
    );
  }
  const verified = verifyAgentEffectConsumptionRecord(persisted, {
    trustedStorePublicKey: createPublicKey(parsePrivateKey(
      storePrivateKey,
      'agent effect consumption store private key'
    )),
    expectedHandoffDigest: handoff.handoff_digest,
    expectedExecutorCredentialDigest: executorCredential.credential_digest,
    expectedRecordDigest: record.record_digest
  });

  return Object.freeze({
    valid: true,
    schema: 'axiom-agent-effect-consumption-commit.v1',
    record: verified,
    record_digest: verified.record_digest,
    storage_key: verified.statement.storage_key,
    effect_at: effectTime,
    consume_before_effect_committed: true,
    effect_executed: false,
    effect_admission_authorized: false,
    resume_after_recovery_allowed: false,
    global_currentness_claimed: false,
    authority_effect: 'none',
    delegation_effect: 'none'
  });
}

export async function readAgentEffectConsumptionRecord({
  stateRoot,
  handoffDigest,
  action = AGENT_EFFECT_CONSUMPTION_ACTION,
  inputDigest,
  executorCredentialDigest,
  trustedStorePublicKey,
  expectedRecordDigest
} = {}) {
  const normalizedHandoffDigest = digest(handoffDigest, 'agent effect consumption read handoffDigest');
  const normalizedInputDigest = digest(inputDigest, 'agent effect consumption read inputDigest');
  const normalizedExecutorDigest = digest(
    executorCredentialDigest,
    'agent effect consumption read executorCredentialDigest'
  );
  if (action !== AGENT_EFFECT_CONSUMPTION_ACTION) {
    throw new ValidationError(
      `agent effect consumption read action must remain ${AGENT_EFFECT_CONSUMPTION_ACTION}`
    );
  }
  const storageKey = storageKeyFor({
    handoffDigest: normalizedHandoffDigest,
    action,
    inputDigest: normalizedInputDigest,
    executorCredentialDigest: normalizedExecutorDigest
  });
  const root = await canonicalStateRoot(stateRoot);
  const filePath = await recordPathFor(root, storageKey);
  let raw;
  try {
    raw = JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (expectedRecordDigest !== undefined) {
      throw new ValidationError(
        'agent effect consumption retained record is missing or unreadable; rollback/uncertainty detected'
      );
    }
    throw new ValidationError('agent effect consumption record is missing or unreadable');
  }
  return verifyAgentEffectConsumptionRecord(raw, {
    trustedStorePublicKey,
    expectedHandoffDigest: normalizedHandoffDigest,
    expectedExecutorCredentialDigest: normalizedExecutorDigest,
    expectedRecordDigest
  });
}
