import {
  createPrivateKey,
  createPublicKey,
  sign as signBytes,
  verify as verifyBytes
} from 'node:crypto';

import {
  ValidationError,
  canonicalJson,
  digestObject,
  sha256
} from './canonical.mjs';

export const MACHINE_CURRENTNESS_MUTATION_COMMAND_SCHEMA =
  'axiom-machine-currentness-mutation-command.v1';

const DIGEST = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const REASON = /^[a-z][a-z0-9._-]{0,63}$/;
const MUTATION_KINDS = new Set([
  'authority-update',
  'narrow',
  'revoke',
  'compromise',
  'expire'
]);

const EXPECTED_STATUS = Object.freeze({
  'authority-update': 'active',
  narrow: 'narrowed',
  revoke: 'revoked',
  compromise: 'compromised',
  expire: 'expired'
});

const FIXED_NONCLAIMS = Object.freeze({
  authority_effect: 'authorize-machine-currentness-lifecycle-transition-only',
  execution_authority_granted: false,
  delegation_effect: 'none',
  capability_promotion_effect: 'none',
  identity_effect: 'none',
  global_currentness_claimed: false,
  network_effect: 'none'
});

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${label} must be an object`);
  }
  return value;
}

function requireString(value, label, { max = 256, pattern = null } = {}) {
  if (typeof value !== 'string' || value.length < 1 || value.length > max) {
    throw new ValidationError(`${label} is invalid`);
  }
  if (pattern && !pattern.test(value)) {
    throw new ValidationError(`${label} is invalid`);
  }
  return value;
}

function requireDigest(value, label) {
  return requireString(value, label, { max: 64, pattern: DIGEST });
}

function requireTimestamp(value, label) {
  const text = requireString(value, label, { max: 64 });
  const parsed = new Date(text);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== text) {
    throw new ValidationError(`${label} must be a canonical UTC ISO timestamp`);
  }
  return text;
}

function requirePositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new ValidationError(`${label} must be a positive safe integer`);
  }
  return value;
}

function parsePrivateKey(value, label) {
  try {
    const key = value?.type === 'private' ? value : createPrivateKey(value);
    if (key.asymmetricKeyType !== 'ed25519') throw new Error();
    return key;
  } catch {
    throw new ValidationError(`${label} must be Ed25519`);
  }
}

function parsePublicKey(value, label) {
  try {
    const key = value?.type === 'public' ? value : createPublicKey(value);
    if (key.asymmetricKeyType !== 'ed25519') throw new Error();
    return key;
  } catch {
    throw new ValidationError(`${label} must be Ed25519`);
  }
}

function keyId(value) {
  const key = parsePublicKey(value, 'Machine currentness mutation authority public key');
  return sha256(key.export({ type: 'spki', format: 'der' }));
}

function normalizeStatement(raw) {
  const value = requireObject(raw, 'Machine currentness mutation command statement');
  const allowed = new Set([
    'command_id',
    'principal_id',
    'principal_type',
    'predecessor_checkpoint_digest',
    'expected_successor_sequence',
    'mutation_kind',
    'resulting_authority_digest',
    'resulting_status',
    'issued_at',
    'effective_at',
    'expires_at',
    'reason_code',
    'mutation_authority_key_id',
    'authority_effect',
    'execution_authority_granted',
    'delegation_effect',
    'capability_promotion_effect',
    'identity_effect',
    'global_currentness_claimed',
    'network_effect'
  ]);
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) {
      throw new ValidationError(
        `Machine currentness mutation command statement contains unsupported field: ${field}`
      );
    }
  }

  const principalType = requireString(
    value.principal_type,
    'Machine currentness mutation principal type',
    { max: 16 }
  );
  if (!['agent', 'service'].includes(principalType)) {
    throw new ValidationError('Machine currentness mutation principal type is invalid');
  }
  const mutationKind = requireString(
    value.mutation_kind,
    'Machine currentness mutation kind',
    { max: 32 }
  );
  if (!MUTATION_KINDS.has(mutationKind)) {
    throw new ValidationError('Machine currentness mutation kind is unsupported');
  }
  if (value.resulting_status !== EXPECTED_STATUS[mutationKind]) {
    throw new ValidationError(
      'Machine currentness mutation resulting status does not match mutation kind'
    );
  }

  const issuedAt = requireTimestamp(
    value.issued_at,
    'Machine currentness mutation issued_at'
  );
  const effectiveAt = requireTimestamp(
    value.effective_at,
    'Machine currentness mutation effective_at'
  );
  const expiresAt = requireTimestamp(
    value.expires_at,
    'Machine currentness mutation expires_at'
  );
  if (effectiveAt < issuedAt) {
    throw new ValidationError(
      'Machine currentness mutation effective_at cannot precede issued_at'
    );
  }
  if (expiresAt < effectiveAt) {
    throw new ValidationError(
      'Machine currentness mutation expires_at cannot precede effective_at'
    );
  }

  if (
    value.authority_effect !== FIXED_NONCLAIMS.authority_effect
    || value.execution_authority_granted !== false
    || value.delegation_effect !== 'none'
    || value.capability_promotion_effect !== 'none'
    || value.identity_effect !== 'none'
    || value.global_currentness_claimed !== false
    || value.network_effect !== 'none'
  ) {
    throw new ValidationError(
      'Machine currentness mutation command widens its lifecycle-only authority boundary'
    );
  }

  return Object.freeze({
    command_id: requireString(value.command_id, 'Machine currentness mutation command id', {
      max: 192,
      pattern: ID
    }),
    principal_id: requireString(value.principal_id, 'Machine currentness mutation principal id', {
      max: 160,
      pattern: ID
    }),
    principal_type: principalType,
    predecessor_checkpoint_digest: requireDigest(
      value.predecessor_checkpoint_digest,
      'Machine currentness mutation predecessor checkpoint digest'
    ),
    expected_successor_sequence: requirePositiveInteger(
      value.expected_successor_sequence,
      'Machine currentness mutation expected successor sequence'
    ),
    mutation_kind: mutationKind,
    resulting_authority_digest: requireDigest(
      value.resulting_authority_digest,
      'Machine currentness mutation resulting authority digest'
    ),
    resulting_status: value.resulting_status,
    issued_at: issuedAt,
    effective_at: effectiveAt,
    expires_at: expiresAt,
    reason_code: requireString(value.reason_code, 'Machine currentness mutation reason code', {
      max: 64,
      pattern: REASON
    }),
    mutation_authority_key_id: requireDigest(
      value.mutation_authority_key_id,
      'Machine currentness mutation authority key id'
    ),
    ...FIXED_NONCLAIMS
  });
}

export function machineCurrentnessMutationAuthorityKeyId(publicKey) {
  return keyId(publicKey);
}

export function createMachineCurrentnessMutationCommand({
  commandId,
  principalId,
  principalType,
  predecessorCheckpointDigest,
  expectedSuccessorSequence,
  mutationKind,
  resultingAuthorityDigest,
  issuedAt,
  effectiveAt,
  expiresAt,
  reasonCode,
  mutationAuthorityPrivateKey,
  trustedMutationAuthorityPublicKey
} = {}) {
  const privateKey = parsePrivateKey(
    mutationAuthorityPrivateKey,
    'Machine currentness mutation authority private key'
  );
  const publicKey = createPublicKey(privateKey);
  const trusted = parsePublicKey(
    trustedMutationAuthorityPublicKey,
    'Trusted machine currentness mutation authority public key'
  );
  if (keyId(publicKey) !== keyId(trusted)) {
    throw new ValidationError(
      'Machine currentness mutation authority key substitution rejected'
    );
  }
  if (!MUTATION_KINDS.has(mutationKind)) {
    throw new ValidationError('Machine currentness mutation kind is unsupported');
  }

  const statement = normalizeStatement({
    command_id: commandId,
    principal_id: principalId,
    principal_type: principalType,
    predecessor_checkpoint_digest: predecessorCheckpointDigest,
    expected_successor_sequence: expectedSuccessorSequence,
    mutation_kind: mutationKind,
    resulting_authority_digest: resultingAuthorityDigest,
    resulting_status: EXPECTED_STATUS[mutationKind],
    issued_at: issuedAt,
    effective_at: effectiveAt,
    expires_at: expiresAt,
    reason_code: reasonCode,
    mutation_authority_key_id: keyId(trusted),
    ...FIXED_NONCLAIMS
  });
  const statementDigest = digestObject(statement);
  const signable = Object.freeze({
    schema: MACHINE_CURRENTNESS_MUTATION_COMMAND_SCHEMA,
    statement,
    statement_digest: statementDigest
  });
  const mutationAuthoritySignature = signBytes(
    null,
    Buffer.from(canonicalJson(signable)),
    privateKey
  ).toString('base64url');
  const signed = Object.freeze({
    ...signable,
    mutation_authority_signature: mutationAuthoritySignature
  });
  return Object.freeze({
    ...signed,
    command_digest: digestObject(signed)
  });
}

export function verifyMachineCurrentnessMutationCommand(raw, {
  trustedMutationAuthorityPublicKey,
  expectedPrincipalId,
  expectedPrincipalType,
  expectedPredecessorCheckpointDigest,
  expectedSuccessorSequence,
  at
} = {}) {
  const command = requireObject(raw, 'Machine currentness mutation command');
  const allowed = new Set([
    'schema',
    'statement',
    'statement_digest',
    'mutation_authority_signature',
    'command_digest'
  ]);
  for (const field of Object.keys(command)) {
    if (!allowed.has(field)) {
      throw new ValidationError(
        `Machine currentness mutation command contains unsupported field: ${field}`
      );
    }
  }
  if (command.schema !== MACHINE_CURRENTNESS_MUTATION_COMMAND_SCHEMA) {
    throw new ValidationError('Machine currentness mutation command schema is unsupported');
  }

  const trusted = parsePublicKey(
    trustedMutationAuthorityPublicKey,
    'Trusted machine currentness mutation authority public key'
  );
  const statement = normalizeStatement(command.statement);
  if (statement.mutation_authority_key_id !== keyId(trusted)) {
    throw new ValidationError('Machine currentness mutation authority key mismatch');
  }
  const statementDigest = digestObject(statement);
  if (command.statement_digest !== statementDigest) {
    throw new ValidationError('Machine currentness mutation command statement digest mismatch');
  }
  const signable = {
    schema: MACHINE_CURRENTNESS_MUTATION_COMMAND_SCHEMA,
    statement,
    statement_digest: statementDigest
  };
  const signature = Buffer.from(
    requireString(
      command.mutation_authority_signature,
      'Machine currentness mutation authority signature',
      { max: 1024 }
    ),
    'base64url'
  );
  if (
    signature.length === 0
    || !verifyBytes(
      null,
      Buffer.from(canonicalJson(signable)),
      trusted,
      signature
    )
  ) {
    throw new ValidationError('Machine currentness mutation authority signature verification failed');
  }
  const signed = {
    ...signable,
    mutation_authority_signature: command.mutation_authority_signature
  };
  const commandDigest = digestObject(signed);
  if (command.command_digest !== commandDigest) {
    throw new ValidationError('Machine currentness mutation command digest mismatch');
  }

  if (
    expectedPrincipalId !== undefined
    && statement.principal_id !== expectedPrincipalId
  ) {
    throw new ValidationError('Machine currentness mutation principal mismatch');
  }
  if (
    expectedPrincipalType !== undefined
    && statement.principal_type !== expectedPrincipalType
  ) {
    throw new ValidationError('Machine currentness mutation principal type mismatch');
  }
  if (
    expectedPredecessorCheckpointDigest !== undefined
    && statement.predecessor_checkpoint_digest
      !== expectedPredecessorCheckpointDigest
  ) {
    throw new ValidationError(
      'Machine currentness mutation predecessor checkpoint mismatch'
    );
  }
  if (
    expectedSuccessorSequence !== undefined
    && statement.expected_successor_sequence !== expectedSuccessorSequence
  ) {
    throw new ValidationError(
      'Machine currentness mutation successor sequence mismatch'
    );
  }

  if (at !== undefined) {
    const useAt = requireTimestamp(at, 'Machine currentness mutation use time');
    if (useAt < statement.effective_at) {
      throw new ValidationError('Machine currentness mutation command is not effective yet');
    }
    if (useAt > statement.expires_at) {
      throw new ValidationError('Machine currentness mutation command is expired');
    }
  }

  return Object.freeze({
    schema: MACHINE_CURRENTNESS_MUTATION_COMMAND_SCHEMA,
    statement,
    statement_digest: statementDigest,
    mutation_authority_signature: command.mutation_authority_signature,
    command_digest: commandDigest
  });
}
