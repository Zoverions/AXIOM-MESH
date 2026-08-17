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
import { validatePublicWitnessSourceAdmission } from './public-witness-transfer.mjs';

export const PUBLIC_WITNESS_SOURCE_PROVISIONING_SCHEMA = 'axiom-public-witness-source-provisioning.v1';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const DEFAULT_MAX_LIFETIME_SECONDS = 15 * 60;
const HARD_MAX_LIFETIME_SECONDS = 60 * 60;

const COMMAND_KEYS = new Set([
  'schema',
  'statement',
  'statement_digest',
  'source_admission',
  'operator_signature',
  'command_digest'
]);
const STATEMENT_KEYS = new Set([
  'domain_id',
  'operator_id',
  'operator_key_id',
  'command_id',
  'source_id',
  'source_key_id',
  'source_epoch',
  'source_admission_digest',
  'previous_admission_digest',
  'authorized_at',
  'expires_at',
  'receiver_action',
  'local_operator_authorization_claimed',
  'remote_self_provisioning_allowed',
  'source_trust_effect',
  'persona_root_trust_effect',
  'social_authority_effect',
  'capability_promotion_effect',
  'finality_claimed',
  'authority_effect',
  'network_effect'
]);

function exactKeys(raw, allowed, label) {
  const value = assertPlainObject(raw, label);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ValidationError(`${label} contains unsupported field ${key}`);
  }
  return value;
}

function identifier(value, label) {
  return assertString(value, label, { min: 1, max: 192, pattern: IDENTIFIER });
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

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new ValidationError(`${label} must be a positive safe integer`);
  }
  return value;
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

function publicKeyId(value, label) {
  const key = parsePublicKey(value, label);
  return sha256(key.export({ type: 'spki', format: 'pem' }).toString());
}

function normalizeStatement(raw) {
  const value = exactKeys(raw, STATEMENT_KEYS, 'public witness source provisioning statement');
  const sourceEpoch = positiveInteger(value.source_epoch, 'public witness source provisioning source_epoch');
  const previous = nullableDigest(value.previous_admission_digest, 'public witness source provisioning previous_admission_digest');
  if ((sourceEpoch === 1) !== (previous === null)) {
    throw new ValidationError('public witness source provisioning epoch 1 requires null predecessor and later epochs require one');
  }
  const authorizedAt = canonicalTimestamp(value.authorized_at, 'public witness source provisioning authorized_at');
  const expiresAt = canonicalTimestamp(value.expires_at, 'public witness source provisioning expires_at');
  const lifetimeMs = Date.parse(expiresAt) - Date.parse(authorizedAt);
  if (lifetimeMs <= 0 || lifetimeMs > HARD_MAX_LIFETIME_SECONDS * 1000) {
    throw new ValidationError('public witness source provisioning authorization lifetime is invalid');
  }
  if (
    value.receiver_action !== 'admit-exact-source-epoch'
    || value.local_operator_authorization_claimed !== true
    || value.remote_self_provisioning_allowed !== false
    || value.source_trust_effect !== 'authorize-exact-local-source-admission'
    || value.persona_root_trust_effect !== 'none'
    || value.social_authority_effect !== 'none'
    || value.capability_promotion_effect !== 'none'
    || value.finality_claimed !== false
    || value.authority_effect !== 'w2c2-source-admission-only'
    || value.network_effect !== 'none'
  ) {
    throw new ValidationError('public witness source provisioning statement contains an invalid authority or non-claim boundary');
  }
  return Object.freeze({
    domain_id: identifier(value.domain_id, 'public witness source provisioning domain_id'),
    operator_id: identifier(value.operator_id, 'public witness source provisioning operator_id'),
    operator_key_id: digest(value.operator_key_id, 'public witness source provisioning operator_key_id'),
    command_id: identifier(value.command_id, 'public witness source provisioning command_id'),
    source_id: identifier(value.source_id, 'public witness source provisioning source_id'),
    source_key_id: digest(value.source_key_id, 'public witness source provisioning source_key_id'),
    source_epoch: sourceEpoch,
    source_admission_digest: digest(value.source_admission_digest, 'public witness source provisioning source_admission_digest'),
    previous_admission_digest: previous,
    authorized_at: authorizedAt,
    expires_at: expiresAt,
    receiver_action: 'admit-exact-source-epoch',
    local_operator_authorization_claimed: true,
    remote_self_provisioning_allowed: false,
    source_trust_effect: 'authorize-exact-local-source-admission',
    persona_root_trust_effect: 'none',
    social_authority_effect: 'none',
    capability_promotion_effect: 'none',
    finality_claimed: false,
    authority_effect: 'w2c2-source-admission-only',
    network_effect: 'none'
  });
}

function commandDigestBody(command) {
  return Object.freeze({
    schema: command.schema,
    statement: command.statement,
    statement_digest: command.statement_digest,
    source_admission: command.source_admission,
    operator_signature: command.operator_signature
  });
}

function assertAdmissionBinding(statement, admission) {
  if (
    admission.domain_id !== statement.domain_id
    || admission.source_id !== statement.source_id
    || admission.source_key_id !== statement.source_key_id
    || admission.source_epoch !== statement.source_epoch
    || admission.admission_digest !== statement.source_admission_digest
  ) {
    throw new ValidationError('public witness source provisioning statement does not bind the exact source admission');
  }
  if (statement.authorized_at < admission.valid_from || statement.authorized_at >= admission.expires_at) {
    throw new ValidationError('public witness source provisioning authorization is outside source-admission validity');
  }
  if (statement.expires_at > admission.expires_at) {
    throw new ValidationError('public witness source provisioning authorization cannot outlive source admission validity');
  }
}

export function createPublicWitnessSourceProvisioningCommand({
  sourceAdmission,
  operatorId,
  operatorPrivateKey,
  commandId,
  previousAdmissionDigest = null,
  authorizedAt,
  expiresAt = null,
  maxLifetimeSeconds = DEFAULT_MAX_LIFETIME_SECONDS
} = {}) {
  const admission = validatePublicWitnessSourceAdmission(sourceAdmission);
  if (!Number.isSafeInteger(maxLifetimeSeconds) || maxLifetimeSeconds < 1 || maxLifetimeSeconds > HARD_MAX_LIFETIME_SECONDS) {
    throw new ValidationError(`public witness source provisioning maxLifetimeSeconds must be 1-${HARD_MAX_LIFETIME_SECONDS}`);
  }
  const privateKey = parsePrivateKey(operatorPrivateKey, 'public witness source provisioning operator private key');
  const publicKey = createPublicKey(privateKey);
  const authorized = canonicalTimestamp(authorizedAt, 'public witness source provisioning authorizedAt');
  const expires = expiresAt === null
    ? new Date(Date.parse(authorized) + maxLifetimeSeconds * 1000).toISOString()
    : canonicalTimestamp(expiresAt, 'public witness source provisioning expiresAt');
  const configuredLifetimeMs = Date.parse(expires) - Date.parse(authorized);
  if (configuredLifetimeMs <= 0 || configuredLifetimeMs > maxLifetimeSeconds * 1000) {
    throw new ValidationError('public witness source provisioning authorization exceeds configured lifetime ceiling');
  }
  const statement = normalizeStatement({
    domain_id: admission.domain_id,
    operator_id: operatorId,
    operator_key_id: publicKeyId(publicKey, 'public witness source provisioning operator public key'),
    command_id: commandId,
    source_id: admission.source_id,
    source_key_id: admission.source_key_id,
    source_epoch: admission.source_epoch,
    source_admission_digest: admission.admission_digest,
    previous_admission_digest: previousAdmissionDigest,
    authorized_at: authorized,
    expires_at: expires,
    receiver_action: 'admit-exact-source-epoch',
    local_operator_authorization_claimed: true,
    remote_self_provisioning_allowed: false,
    source_trust_effect: 'authorize-exact-local-source-admission',
    persona_root_trust_effect: 'none',
    social_authority_effect: 'none',
    capability_promotion_effect: 'none',
    finality_claimed: false,
    authority_effect: 'w2c2-source-admission-only',
    network_effect: 'none'
  });
  assertAdmissionBinding(statement, admission);
  const statementDigest = digestObject(statement);
  const signature = sign(null, Buffer.from(canonicalJson(statement)), privateKey).toString('base64url');
  const body = Object.freeze({
    schema: PUBLIC_WITNESS_SOURCE_PROVISIONING_SCHEMA,
    statement,
    statement_digest: statementDigest,
    source_admission: admission,
    operator_signature: signature
  });
  const command = Object.freeze({ ...body, command_digest: digestObject(body) });
  if (admission.source_epoch === 1 && previousAdmissionDigest !== null) {
    throw new ValidationError('public witness source provisioning genesis cannot name a previous admission');
  }
  if (admission.source_epoch > 1) {
    digest(previousAdmissionDigest, 'public witness source provisioning previousAdmissionDigest');
  }
  return command;
}

export function verifyPublicWitnessSourceProvisioningCommand(raw, {
  trustedOperatorPublicKey,
  expectedDomainId,
  expectedOperatorId,
  now = Date.now()
} = {}) {
  const value = exactKeys(raw, COMMAND_KEYS, 'public witness source provisioning command');
  if (value.schema !== PUBLIC_WITNESS_SOURCE_PROVISIONING_SCHEMA) {
    throw new ValidationError('public witness source provisioning schema is unsupported');
  }
  const statement = normalizeStatement(value.statement);
  const admission = validatePublicWitnessSourceAdmission(value.source_admission);
  assertAdmissionBinding(statement, admission);
  const statementDigest = digest(value.statement_digest, 'public witness source provisioning statement_digest');
  if (statementDigest !== digestObject(statement)) {
    throw new ValidationError('public witness source provisioning statement digest mismatch');
  }
  const operatorPublicKey = parsePublicKey(trustedOperatorPublicKey, 'public witness source provisioning trusted operator public key');
  if (statement.operator_key_id !== publicKeyId(operatorPublicKey, 'public witness source provisioning trusted operator public key')) {
    throw new ValidationError('public witness source provisioning operator key substitution');
  }
  const signature = assertString(value.operator_signature, 'public witness source provisioning operator_signature', {
    min: 32,
    max: 256,
    pattern: BASE64URL
  });
  if (!verify(null, Buffer.from(canonicalJson(statement)), operatorPublicKey, Buffer.from(signature, 'base64url'))) {
    throw new ValidationError('public witness source provisioning operator signature is invalid');
  }
  const expectedCommandDigest = digestObject(commandDigestBody({
    schema: PUBLIC_WITNESS_SOURCE_PROVISIONING_SCHEMA,
    statement,
    statement_digest: statementDigest,
    source_admission: admission,
    operator_signature: signature
  }));
  if (digest(value.command_digest, 'public witness source provisioning command_digest') !== expectedCommandDigest) {
    throw new ValidationError('public witness source provisioning command digest mismatch');
  }
  if (expectedDomainId !== undefined && statement.domain_id !== expectedDomainId) {
    throw new ValidationError('public witness source provisioning command belongs to a different domain');
  }
  if (expectedOperatorId !== undefined && statement.operator_id !== expectedOperatorId) {
    throw new ValidationError('public witness source provisioning command belongs to a different operator');
  }
  if (!Number.isFinite(now)) throw new ValidationError('public witness source provisioning verifier now must be finite milliseconds');
  const nowIso = new Date(now).toISOString();
  if (nowIso < statement.authorized_at) {
    throw new ValidationError('public witness source provisioning command is not authorized yet');
  }
  if (nowIso >= statement.expires_at) {
    throw new ValidationError('public witness source provisioning command is expired');
  }
  return Object.freeze({
    schema: PUBLIC_WITNESS_SOURCE_PROVISIONING_SCHEMA,
    statement,
    statement_digest: statementDigest,
    source_admission: admission,
    operator_signature: signature,
    command_digest: expectedCommandDigest
  });
}
