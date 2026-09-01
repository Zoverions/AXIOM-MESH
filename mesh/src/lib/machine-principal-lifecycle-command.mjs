import {
  createPrivateKey,
  createPublicKey,
  sign,
  verify
} from 'node:crypto';

import {
  ValidationError,
  canonicalJson,
  digestObject,
  sha256
} from './canonical.mjs';

export const MACHINE_PRINCIPAL_LIFECYCLE_COMMAND_SCHEMA =
  'axiom-machine-principal-lifecycle-command.v1';

const TRANSITIONS = new Set(['narrowed', 'revoked', 'compromised', 'expired']);
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const MAX_LIFETIME_MS = 15 * 60 * 1000;

const COMMAND_KEYS = new Set([
  'schema',
  'statement',
  'statement_digest',
  'issuer_signature',
  'command_digest'
]);

const STATEMENT_KEYS = new Set([
  'command_id',
  'issuer_principal_ref',
  'issuer_key_id',
  'issued_at',
  'expires_at',
  'nonce',
  'transition',
  'reason_code',
  'policy_version',
  'policy_digest',
  'target',
  'successor_authority_digest',
  'authority_effect',
  'execution_authority_granted',
  'delegation_effect',
  'capability_promotion_effect',
  'sandbox_mutation_allowed',
  'global_currentness_claimed'
]);

const TARGET_KEYS = new Set([
  'principal_id',
  'principal_type',
  'predecessor_sequence',
  'predecessor_checkpoint_digest',
  'predecessor_source_head_digest',
  'predecessor_authority_digest'
]);

const PIN_KEYS = new Set([
  'issuer_principal_ref',
  'key_id',
  'public_key_pem',
  'allowed_transitions'
]);

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${label} must be an object`);
  }
  return value;
}

function exact(value, keys, label) {
  const raw = object(value, label);
  for (const key of Object.keys(raw)) {
    if (!keys.has(key)) throw new ValidationError(`${label} contains unsupported field: ${key}`);
  }
  for (const key of keys) {
    if (!Object.hasOwn(raw, key)) throw new ValidationError(`${label} is missing required field: ${key}`);
  }
  return raw;
}

function string(value, label, { max = 256, pattern = null } = {}) {
  if (typeof value !== 'string' || value.length < 1 || value.length > max) {
    throw new ValidationError(`${label} is invalid`);
  }
  if (pattern && !pattern.test(value)) throw new ValidationError(`${label} is invalid`);
  return value;
}

function identifier(value, label) {
  return string(value, label, { max: 192, pattern: ID });
}

function digest(value, label) {
  return string(value, label, { max: 64, pattern: DIGEST });
}

function timestamp(value, label) {
  const text = string(value, label, { max: 64 });
  const parsed = new Date(text);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== text) {
    throw new ValidationError(`${label} must be a canonical UTC timestamp`);
  }
  return text;
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new ValidationError(`${label} must be a positive safe integer`);
  }
  return value;
}

function privateKey(value, label) {
  try {
    const key = value?.type === 'private' ? value : createPrivateKey(value);
    if (key.type !== 'private' || key.asymmetricKeyType !== 'ed25519') throw new Error();
    return key;
  } catch {
    throw new ValidationError(`${label} must be Ed25519`);
  }
}

function publicKey(value, label) {
  try {
    const key = value?.type === 'public' ? value : createPublicKey(value);
    if (key.type !== 'public' || key.asymmetricKeyType !== 'ed25519') throw new Error();
    return key;
  } catch {
    throw new ValidationError(`${label} must be Ed25519`);
  }
}

function keyId(value) {
  const key = publicKey(value, 'Machine principal lifecycle issuer public key');
  return sha256(key.export({ type: 'spki', format: 'pem' }).toString());
}

function normalizeTarget(raw) {
  const value = exact(raw, TARGET_KEYS, 'Machine principal lifecycle command target');
  const principalType = string(
    value.principal_type,
    'Machine principal lifecycle target principal type',
    { max: 16 }
  );
  if (!['agent', 'service'].includes(principalType)) {
    throw new ValidationError('Machine principal lifecycle target principal type is invalid');
  }
  return Object.freeze({
    principal_id: identifier(value.principal_id, 'Machine principal lifecycle target principal id'),
    principal_type: principalType,
    predecessor_sequence: positiveInteger(
      value.predecessor_sequence,
      'Machine principal lifecycle predecessor sequence'
    ),
    predecessor_checkpoint_digest: digest(
      value.predecessor_checkpoint_digest,
      'Machine principal lifecycle predecessor checkpoint digest'
    ),
    predecessor_source_head_digest: digest(
      value.predecessor_source_head_digest,
      'Machine principal lifecycle predecessor source head digest'
    ),
    predecessor_authority_digest: digest(
      value.predecessor_authority_digest,
      'Machine principal lifecycle predecessor authority digest'
    )
  });
}

function normalizeStatement(raw) {
  const value = exact(raw, STATEMENT_KEYS, 'Machine principal lifecycle command statement');
  const transition = string(value.transition, 'Machine principal lifecycle transition', { max: 32 });
  if (!TRANSITIONS.has(transition)) {
    throw new ValidationError('Machine principal lifecycle transition is invalid');
  }
  if (
    value.authority_effect !== 'machine-principal-lifecycle-only'
    || value.execution_authority_granted !== false
    || value.delegation_effect !== 'none'
    || value.capability_promotion_effect !== 'none'
    || value.sandbox_mutation_allowed !== false
    || value.global_currentness_claimed !== false
  ) {
    throw new ValidationError(
      'Machine principal lifecycle command widens its mutation-only authority boundary'
    );
  }

  const target = normalizeTarget(value.target);
  const successorAuthorityDigest = value.successor_authority_digest === null
    ? null
    : digest(
        value.successor_authority_digest,
        'Machine principal lifecycle successor authority digest'
      );
  if (transition === 'narrowed' && successorAuthorityDigest === null) {
    throw new ValidationError(
      'Machine principal narrowing command requires successor authority digest'
    );
  }
  if (transition !== 'narrowed' && successorAuthorityDigest !== null) {
    throw new ValidationError(
      'Non-narrowing lifecycle command cannot declare successor authority digest'
    );
  }

  return Object.freeze({
    command_id: identifier(value.command_id, 'Machine principal lifecycle command id'),
    issuer_principal_ref: identifier(
      value.issuer_principal_ref,
      'Machine principal lifecycle issuer principal ref'
    ),
    issuer_key_id: digest(value.issuer_key_id, 'Machine principal lifecycle issuer key id'),
    issued_at: timestamp(value.issued_at, 'Machine principal lifecycle issued_at'),
    expires_at: timestamp(value.expires_at, 'Machine principal lifecycle expires_at'),
    nonce: identifier(value.nonce, 'Machine principal lifecycle nonce'),
    transition,
    reason_code: identifier(value.reason_code, 'Machine principal lifecycle reason code'),
    policy_version: string(value.policy_version, 'Machine principal lifecycle policy version', {
      max: 160
    }),
    policy_digest: digest(value.policy_digest, 'Machine principal lifecycle policy digest'),
    target,
    successor_authority_digest: successorAuthorityDigest,
    authority_effect: 'machine-principal-lifecycle-only',
    execution_authority_granted: false,
    delegation_effect: 'none',
    capability_promotion_effect: 'none',
    sandbox_mutation_allowed: false,
    global_currentness_claimed: false
  });
}

function normalizePins(rawPins) {
  if (!Array.isArray(rawPins) || rawPins.length < 1 || rawPins.length > 32) {
    throw new ValidationError('Machine principal lifecycle command requires 1-32 trust pins');
  }
  const pins = new Map();
  for (const raw of rawPins) {
    const value = exact(raw, PIN_KEYS, 'Machine principal lifecycle trust pin');
    const issuer = identifier(
      value.issuer_principal_ref,
      'Machine principal lifecycle trust pin issuer'
    );
    const publicPem = string(
      value.public_key_pem,
      'Machine principal lifecycle trust pin public key',
      { max: 8192 }
    );
    const key = publicKey(publicPem, 'Machine principal lifecycle trust pin public key');
    const expectedKeyId = keyId(key);
    if (digest(value.key_id, 'Machine principal lifecycle trust pin key id') !== expectedKeyId) {
      throw new ValidationError('Machine principal lifecycle trust pin key id mismatch');
    }
    if (
      !Array.isArray(value.allowed_transitions)
      || value.allowed_transitions.length < 1
      || value.allowed_transitions.length > TRANSITIONS.size
    ) {
      throw new ValidationError('Machine principal lifecycle trust pin transitions are invalid');
    }
    const allowed = [...new Set(value.allowed_transitions)];
    if (allowed.length !== value.allowed_transitions.length) {
      throw new ValidationError('Machine principal lifecycle trust pin transitions contain duplicates');
    }
    for (const transition of allowed) {
      if (!TRANSITIONS.has(transition)) {
        throw new ValidationError('Machine principal lifecycle trust pin contains unknown transition');
      }
    }
    if (pins.has(issuer)) {
      throw new ValidationError('Machine principal lifecycle trust pins contain duplicate issuer');
    }
    pins.set(issuer, Object.freeze({
      issuer_principal_ref: issuer,
      key_id: expectedKeyId,
      public_key: key,
      allowed_transitions: Object.freeze([...allowed].sort())
    }));
  }
  return pins;
}

function signable(statement, statementDigest) {
  return Object.freeze({
    schema: MACHINE_PRINCIPAL_LIFECYCLE_COMMAND_SCHEMA,
    statement,
    statement_digest: statementDigest
  });
}

export function createMachinePrincipalLifecycleCommand({
  issuerPrincipalRef,
  issuerPrivateKey,
  commandId,
  issuedAt,
  expiresAt,
  nonce,
  transition,
  reasonCode,
  policyVersion,
  policyDigest,
  target,
  successorAuthorityDigest = null
} = {}) {
  const signingKey = privateKey(
    issuerPrivateKey,
    'Machine principal lifecycle issuer private key'
  );
  const issuerKeyId = keyId(createPublicKey(signingKey));
  const statement = normalizeStatement({
    command_id: commandId,
    issuer_principal_ref: issuerPrincipalRef,
    issuer_key_id: issuerKeyId,
    issued_at: issuedAt,
    expires_at: expiresAt,
    nonce,
    transition,
    reason_code: reasonCode,
    policy_version: policyVersion,
    policy_digest: policyDigest,
    target,
    successor_authority_digest: successorAuthorityDigest,
    authority_effect: 'machine-principal-lifecycle-only',
    execution_authority_granted: false,
    delegation_effect: 'none',
    capability_promotion_effect: 'none',
    sandbox_mutation_allowed: false,
    global_currentness_claimed: false
  });
  const statementDigest = digestObject(statement);
  const body = signable(statement, statementDigest);
  const issuerSignature = sign(
    null,
    Buffer.from(canonicalJson(body)),
    signingKey
  ).toString('base64url');
  const signed = Object.freeze({
    ...body,
    issuer_signature: issuerSignature
  });
  return Object.freeze({
    ...signed,
    command_digest: digestObject(signed)
  });
}

export function verifyMachinePrincipalLifecycleCommand(raw, {
  trustPins,
  expectedPolicyVersion,
  expectedPolicyDigest,
  expectedPrincipalId,
  expectedPrincipalType,
  expectedPredecessorCheckpointDigest,
  expectedPredecessorSourceHeadDigest,
  expectedPredecessorAuthorityDigest,
  expectedPredecessorSequence,
  now = new Date()
} = {}) {
  const value = exact(raw, COMMAND_KEYS, 'Machine principal lifecycle command');
  if (value.schema !== MACHINE_PRINCIPAL_LIFECYCLE_COMMAND_SCHEMA) {
    throw new ValidationError('Machine principal lifecycle command schema is unsupported');
  }
  const statement = normalizeStatement(value.statement);
  const statementDigest = digest(value.statement_digest, 'Machine principal lifecycle statement digest');
  if (statementDigest !== digestObject(statement)) {
    throw new ValidationError('Machine principal lifecycle statement digest mismatch');
  }

  const pins = normalizePins(trustPins);
  const pin = pins.get(statement.issuer_principal_ref);
  if (!pin) {
    throw new ValidationError('Machine principal lifecycle command issuer is not locally trusted');
  }
  if (statement.issuer_key_id !== pin.key_id) {
    throw new ValidationError('Machine principal lifecycle command issuer key does not match local pin');
  }
  if (!pin.allowed_transitions.includes(statement.transition)) {
    throw new ValidationError(
      'Machine principal lifecycle command issuer is not trusted for requested transition'
    );
  }

  const signature = string(value.issuer_signature, 'Machine principal lifecycle issuer signature', {
    max: 1024,
    pattern: BASE64URL
  });
  if (
    !verify(
      null,
      Buffer.from(canonicalJson(signable(statement, statementDigest))),
      pin.public_key,
      Buffer.from(signature, 'base64url')
    )
  ) {
    throw new ValidationError('Machine principal lifecycle command signature is invalid');
  }
  const signed = {
    schema: MACHINE_PRINCIPAL_LIFECYCLE_COMMAND_SCHEMA,
    statement,
    statement_digest: statementDigest,
    issuer_signature: signature
  };
  const commandDigest = digest(value.command_digest, 'Machine principal lifecycle command digest');
  if (commandDigest !== digestObject(signed)) {
    throw new ValidationError('Machine principal lifecycle command digest mismatch');
  }

  const nowDate = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(nowDate.valueOf())) {
    throw new ValidationError('Machine principal lifecycle command verification time is invalid');
  }
  const issuedMs = Date.parse(statement.issued_at);
  const expiresMs = Date.parse(statement.expires_at);
  if (expiresMs <= issuedMs || expiresMs - issuedMs > MAX_LIFETIME_MS) {
    throw new ValidationError('Machine principal lifecycle command lifetime is invalid');
  }
  if (issuedMs > nowDate.valueOf() || expiresMs <= nowDate.valueOf()) {
    throw new ValidationError('Machine principal lifecycle command is not currently valid');
  }

  if (
    expectedPolicyVersion !== undefined
    && statement.policy_version !== expectedPolicyVersion
  ) {
    throw new ValidationError('Machine principal lifecycle command policy version mismatch');
  }
  if (
    expectedPolicyDigest !== undefined
    && statement.policy_digest !== expectedPolicyDigest
  ) {
    throw new ValidationError('Machine principal lifecycle command policy digest mismatch');
  }

  const target = statement.target;
  const bindings = [
    [expectedPrincipalId, target.principal_id, 'principal id'],
    [expectedPrincipalType, target.principal_type, 'principal type'],
    [expectedPredecessorCheckpointDigest, target.predecessor_checkpoint_digest, 'predecessor checkpoint'],
    [expectedPredecessorSourceHeadDigest, target.predecessor_source_head_digest, 'predecessor source head'],
    [expectedPredecessorAuthorityDigest, target.predecessor_authority_digest, 'predecessor authority']
  ];
  for (const [expected, actual, label] of bindings) {
    if (expected !== undefined && expected !== actual) {
      throw new ValidationError(`Machine principal lifecycle command ${label} mismatch`);
    }
  }
  if (
    expectedPredecessorSequence !== undefined
    && target.predecessor_sequence !== expectedPredecessorSequence
  ) {
    throw new ValidationError('Machine principal lifecycle command predecessor sequence mismatch');
  }

  return Object.freeze({
    valid: true,
    command_digest: commandDigest,
    command_id: statement.command_id,
    nonce: statement.nonce,
    issuer_principal_ref: statement.issuer_principal_ref,
    issuer_key_id: statement.issuer_key_id,
    transition: statement.transition,
    reason_code: statement.reason_code,
    policy_version: statement.policy_version,
    policy_digest: statement.policy_digest,
    target,
    successor_authority_digest: statement.successor_authority_digest,
    verified_at: nowDate.toISOString(),
    verifier_applies_lifecycle_transition: false,
    authority_effect: 'machine-principal-lifecycle-only',
    execution_authority_granted: false,
    delegation_effect: 'none',
    capability_promotion_effect: 'none',
    sandbox_mutation_allowed: false,
    global_currentness_claimed: false
  });
}

export function machinePrincipalLifecycleIssuerKeyId(publicKeyValue) {
  return keyId(publicKeyValue);
}
