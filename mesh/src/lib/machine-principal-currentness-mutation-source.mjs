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
import {
  MACHINE_PRINCIPAL_CURRENTNESS_SCHEMA
} from './machine-principal-currentness.mjs';
import {
  createMachinePrincipalCurrentnessCheckpoint,
  validateMachinePrincipalCurrentnessCheckpointTransition,
  verifyMachinePrincipalCurrentnessCheckpoint
} from './machine-principal-currentness-checkpoint.mjs';
import {
  machineCurrentnessControllerKeyId
} from './machine-currentness-controller-key-lifecycle.mjs';

export const MACHINE_PRINCIPAL_CURRENTNESS_MUTATION_COMMAND_SCHEMA =
  'axiom-machine-principal-currentness-mutation-command.v1';
export const MACHINE_PRINCIPAL_CURRENTNESS_MUTATION_HEAD_SCHEMA =
  'axiom-machine-principal-currentness-mutation-head.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const PRINCIPAL_TYPES = new Set(['agent', 'service']);
const MUTATION_KINDS = new Set([
  'authority-update',
  'narrow',
  'revoke',
  'compromise',
  'expire'
]);
const TERMINAL_STATUSES = new Set(['revoked', 'compromised', 'expired']);

const COMMAND_KEYS = new Set([
  'schema',
  'statement',
  'statement_digest',
  'mutation_signature',
  'command_digest'
]);
const STATEMENT_KEYS = new Set([
  'command_id',
  'mutation_authority_id',
  'mutation_authority_key_id',
  'principal_id',
  'principal_type',
  'predecessor_checkpoint_digest',
  'expected_successor_sequence',
  'mutation_kind',
  'resulting_authority_digest',
  'issued_at',
  'effective_at',
  'expires_at',
  'lifecycle_mutation_effect',
  'authority_relation_verified',
  'authority_effect',
  'execution_authority_granted',
  'delegation_effect',
  'capability_promotion_effect',
  'global_currentness_claimed'
]);

const COMMAND_NONCLAIMS = Object.freeze({
  lifecycle_mutation_effect: 'currentness-transition-only',
  authority_relation_verified: false,
  authority_effect: 'none',
  execution_authority_granted: false,
  delegation_effect: 'none',
  capability_promotion_effect: 'none',
  global_currentness_claimed: false
});

const RESULT_NONCLAIMS = Object.freeze({
  lifecycle_mutation_effect: 'currentness-transition-only',
  authority_relation_verified: false,
  execution_authority_granted: false,
  authority_effect: 'none',
  delegation_effect: 'none',
  capability_promotion_effect: 'none',
  retention_claimed: false,
  global_currentness_claimed: false
});

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${label} must be an object`);
  }
  return value;
}

function rejectUnknownKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new ValidationError(`${label} contains unsupported field: ${key}`);
    }
  }
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

function requireId(value, label) {
  return requireString(value, label, { max: 192, pattern: ID });
}

function requireDigest(value, label) {
  return requireString(value, label, { max: 64, pattern: DIGEST });
}

function requireTimestamp(value, label) {
  const text = requireString(value, label, { max: 64 });
  const parsed = new Date(text);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== text) {
    throw new ValidationError(`${label} is invalid`);
  }
  return text;
}

function timestampValue(value) {
  return new Date(value).valueOf();
}

function requireSuccessorSequence(value) {
  if (!Number.isSafeInteger(value) || value < 2) {
    throw new ValidationError('Machine principal currentness mutation expected successor sequence is invalid');
  }
  return value;
}

function parsePrivateKey(value, label) {
  try {
    const key = value?.type === 'private' ? value : createPrivateKey(value);
    if (key.type !== 'private' || key.asymmetricKeyType !== 'ed25519') {
      throw new ValidationError(`${label} must be Ed25519`);
    }
    return key;
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError(`${label} is invalid`);
  }
}

function parsePublicKey(value, label) {
  try {
    const key = value?.type === 'public' ? value : createPublicKey(value);
    if (key.type !== 'public' || key.asymmetricKeyType !== 'ed25519') {
      throw new ValidationError(`${label} must be Ed25519`);
    }
    return key;
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError(`${label} is invalid`);
  }
}

function canonicalPublicKey(value, label) {
  return parsePublicKey(value, label)
    .export({ type: 'spki', format: 'pem' })
    .toString();
}

export function machinePrincipalCurrentnessMutationAuthorityKeyId(
  value,
  label = 'Machine principal currentness mutation authority public key'
) {
  return sha256(canonicalPublicKey(value, label));
}

function normalizeCommandStatement(raw) {
  const value = requireObject(raw, 'Machine principal currentness mutation command statement');
  rejectUnknownKeys(
    value,
    STATEMENT_KEYS,
    'Machine principal currentness mutation command statement'
  );

  const principalType = requireString(
    value.principal_type,
    'Machine principal currentness mutation principal_type',
    { max: 16 }
  );
  if (!PRINCIPAL_TYPES.has(principalType)) {
    throw new ValidationError('Machine principal currentness mutation principal_type is invalid');
  }
  const mutationKind = requireString(
    value.mutation_kind,
    'Machine principal currentness mutation kind',
    { max: 32 }
  );
  if (!MUTATION_KINDS.has(mutationKind)) {
    throw new ValidationError('Machine principal currentness mutation kind is unsupported');
  }

  const issuedAt = requireTimestamp(
    value.issued_at,
    'Machine principal currentness mutation issued_at'
  );
  const effectiveAt = requireTimestamp(
    value.effective_at,
    'Machine principal currentness mutation effective_at'
  );
  const expiresAt = requireTimestamp(
    value.expires_at,
    'Machine principal currentness mutation expires_at'
  );
  if (timestampValue(effectiveAt) < timestampValue(issuedAt)) {
    throw new ValidationError(
      'Machine principal currentness mutation effective_at cannot precede issued_at'
    );
  }
  if (timestampValue(expiresAt) <= timestampValue(issuedAt)) {
    throw new ValidationError(
      'Machine principal currentness mutation expires_at must follow issued_at'
    );
  }
  if (timestampValue(effectiveAt) >= timestampValue(expiresAt)) {
    throw new ValidationError(
      'Machine principal currentness mutation effective_at must precede expires_at'
    );
  }

  const semantics = Object.fromEntries(
    Object.keys(COMMAND_NONCLAIMS).map(key => [key, value[key]])
  );
  if (canonicalJson(semantics) !== canonicalJson(COMMAND_NONCLAIMS)) {
    throw new ValidationError(
      'Machine principal currentness mutation command widens its lifecycle-only authority boundary'
    );
  }

  return Object.freeze({
    command_id: requireId(value.command_id, 'Machine principal currentness mutation command_id'),
    mutation_authority_id: requireId(
      value.mutation_authority_id,
      'Machine principal currentness mutation authority id'
    ),
    mutation_authority_key_id: requireDigest(
      value.mutation_authority_key_id,
      'Machine principal currentness mutation authority key id'
    ),
    principal_id: requireId(
      value.principal_id,
      'Machine principal currentness mutation principal_id'
    ),
    principal_type: principalType,
    predecessor_checkpoint_digest: requireDigest(
      value.predecessor_checkpoint_digest,
      'Machine principal currentness mutation predecessor checkpoint digest'
    ),
    expected_successor_sequence: requireSuccessorSequence(value.expected_successor_sequence),
    mutation_kind: mutationKind,
    resulting_authority_digest: requireDigest(
      value.resulting_authority_digest,
      'Machine principal currentness mutation resulting authority digest'
    ),
    issued_at: issuedAt,
    effective_at: effectiveAt,
    expires_at: expiresAt,
    ...COMMAND_NONCLAIMS
  });
}

export function createMachinePrincipalCurrentnessMutationCommand({
  commandId,
  mutationAuthorityId,
  mutationAuthorityPrivateKey,
  principalId,
  principalType,
  predecessorCheckpointDigest,
  expectedSuccessorSequence,
  mutationKind,
  resultingAuthorityDigest,
  issuedAt,
  effectiveAt,
  expiresAt
} = {}) {
  const signingPrivate = parsePrivateKey(
    mutationAuthorityPrivateKey,
    'Machine principal currentness mutation authority private key'
  );
  const signingPublic = createPublicKey(signingPrivate);
  const statement = normalizeCommandStatement({
    command_id: commandId,
    mutation_authority_id: mutationAuthorityId,
    mutation_authority_key_id:
      machinePrincipalCurrentnessMutationAuthorityKeyId(signingPublic),
    principal_id: principalId,
    principal_type: principalType,
    predecessor_checkpoint_digest: predecessorCheckpointDigest,
    expected_successor_sequence: expectedSuccessorSequence,
    mutation_kind: mutationKind,
    resulting_authority_digest: resultingAuthorityDigest,
    issued_at: issuedAt,
    effective_at: effectiveAt,
    expires_at: expiresAt,
    ...COMMAND_NONCLAIMS
  });
  const statementDigest = digestObject(statement);
  const signable = Object.freeze({
    schema: MACHINE_PRINCIPAL_CURRENTNESS_MUTATION_COMMAND_SCHEMA,
    statement,
    statement_digest: statementDigest
  });
  const mutationSignature = signBytes(
    null,
    Buffer.from(canonicalJson(signable)),
    signingPrivate
  ).toString('base64url');
  const signed = Object.freeze({
    ...signable,
    mutation_signature: mutationSignature
  });
  return Object.freeze({
    ...signed,
    command_digest: digestObject(signed)
  });
}

export function verifyMachinePrincipalCurrentnessMutationCommand(raw, {
  trustedMutationAuthorityPublicKey,
  expectedPrincipalId,
  expectedPrincipalType
} = {}) {
  const command = requireObject(raw, 'Machine principal currentness mutation command');
  rejectUnknownKeys(command, COMMAND_KEYS, 'Machine principal currentness mutation command');
  if (command.schema !== MACHINE_PRINCIPAL_CURRENTNESS_MUTATION_COMMAND_SCHEMA) {
    throw new ValidationError('Machine principal currentness mutation command schema is unsupported');
  }

  const trustedPublic = parsePublicKey(
    trustedMutationAuthorityPublicKey,
    'Machine principal currentness trusted mutation authority public key'
  );
  const statement = normalizeCommandStatement(command.statement);
  if (
    statement.mutation_authority_key_id
    !== machinePrincipalCurrentnessMutationAuthorityKeyId(trustedPublic)
  ) {
    throw new ValidationError('Machine principal currentness mutation authority key substitution rejected');
  }

  const statementDigest = digestObject(statement);
  if (command.statement_digest !== statementDigest) {
    throw new ValidationError('Machine principal currentness mutation statement digest mismatch');
  }
  const signable = {
    schema: MACHINE_PRINCIPAL_CURRENTNESS_MUTATION_COMMAND_SCHEMA,
    statement,
    statement_digest: statementDigest
  };
  const signature = requireString(
    command.mutation_signature,
    'Machine principal currentness mutation signature',
    { max: 1024, pattern: BASE64URL }
  );
  let valid = false;
  try {
    valid = verifyBytes(
      null,
      Buffer.from(canonicalJson(signable)),
      trustedPublic,
      Buffer.from(signature, 'base64url')
    );
  } catch {
    valid = false;
  }
  if (!valid) {
    throw new ValidationError('Machine principal currentness mutation signature verification failed');
  }

  const signed = {
    ...signable,
    mutation_signature: signature
  };
  const commandDigest = digestObject(signed);
  if (command.command_digest !== commandDigest) {
    throw new ValidationError('Machine principal currentness mutation command digest mismatch');
  }
  if (expectedPrincipalId !== undefined && statement.principal_id !== expectedPrincipalId) {
    throw new ValidationError('Machine principal currentness mutation principal mismatch');
  }
  if (expectedPrincipalType !== undefined && statement.principal_type !== expectedPrincipalType) {
    throw new ValidationError('Machine principal currentness mutation principal type mismatch');
  }

  return Object.freeze({
    schema: MACHINE_PRINCIPAL_CURRENTNESS_MUTATION_COMMAND_SCHEMA,
    statement,
    statement_digest: statementDigest,
    mutation_signature: signature,
    command_digest: commandDigest
  });
}

function transitionFor(retained, command) {
  const priorStatus = retained.statement.status;
  const priorAuthorityDigest = retained.statement.authority_digest;
  const kind = command.statement.mutation_kind;
  const resultingAuthorityDigest = command.statement.resulting_authority_digest;

  if (TERMINAL_STATUSES.has(priorStatus)) {
    throw new ValidationError(
      'Machine principal currentness terminal lifecycle state cannot be reactivated or relabelled'
    );
  }

  if (kind === 'authority-update') {
    if (priorStatus !== 'active') {
      throw new ValidationError(
        'Machine principal currentness authority-update requires active retained state'
      );
    }
    if (resultingAuthorityDigest === priorAuthorityDigest) {
      throw new ValidationError(
        'Machine principal currentness authority-update must change authority digest'
      );
    }
    return Object.freeze({ status: 'active', authority_digest: resultingAuthorityDigest });
  }

  if (kind === 'narrow') {
    if (!['active', 'narrowed'].includes(priorStatus)) {
      throw new ValidationError(
        'Machine principal currentness narrow mutation requires active or narrowed retained state'
      );
    }
    if (resultingAuthorityDigest === priorAuthorityDigest) {
      throw new ValidationError(
        'Machine principal currentness narrow mutation must change authority digest'
      );
    }
    return Object.freeze({ status: 'narrowed', authority_digest: resultingAuthorityDigest });
  }

  if (!['active', 'narrowed'].includes(priorStatus)) {
    throw new ValidationError(
      `Machine principal currentness ${kind} mutation requires active or narrowed retained state`
    );
  }
  if (resultingAuthorityDigest !== priorAuthorityDigest) {
    throw new ValidationError(
      `Machine principal currentness ${kind} mutation must preserve authority digest`
    );
  }
  const terminalStatus = kind === 'revoke'
    ? 'revoked'
    : kind === 'compromise'
      ? 'compromised'
      : 'expired';
  return Object.freeze({ status: terminalStatus, authority_digest: priorAuthorityDigest });
}

function mutationSourceHeadDigest({ retained, command, transition }) {
  return digestObject({
    schema: MACHINE_PRINCIPAL_CURRENTNESS_MUTATION_HEAD_SCHEMA,
    predecessor_checkpoint_digest: retained.checkpoint_digest,
    predecessor_source_head_digest: retained.statement.source_head_digest,
    mutation_command_digest: command.command_digest,
    principal_id: retained.statement.principal_id,
    principal_type: retained.statement.principal_type,
    authority_digest: transition.authority_digest,
    status: transition.status,
    sequence: command.statement.expected_successor_sequence,
    observed_at: command.statement.effective_at
  });
}

export function applyMachinePrincipalCurrentnessMutation({
  mutationCommand,
  trustedMutationAuthorityPublicKey,
  retainedCheckpoint,
  trustedCurrentnessControllerPublicKey,
  currentnessControllerPrivateKey
} = {}) {
  const retained = verifyMachinePrincipalCurrentnessCheckpoint(retainedCheckpoint, {
    trustedControllerPublicKey: trustedCurrentnessControllerPublicKey
  });
  const command = verifyMachinePrincipalCurrentnessMutationCommand(mutationCommand, {
    trustedMutationAuthorityPublicKey,
    expectedPrincipalId: retained.statement.principal_id,
    expectedPrincipalType: retained.statement.principal_type
  });

  const mutationKeyId = machinePrincipalCurrentnessMutationAuthorityKeyId(
    trustedMutationAuthorityPublicKey
  );
  const controllerKeyId = machineCurrentnessControllerKeyId(
    parsePublicKey(
      trustedCurrentnessControllerPublicKey,
      'Machine principal currentness trusted controller public key'
    )
  );
  if (mutationKeyId === controllerKeyId) {
    throw new ValidationError(
      'Machine principal currentness mutation authority and checkpoint controller keys must be distinct'
    );
  }

  if (command.statement.predecessor_checkpoint_digest !== retained.checkpoint_digest) {
    throw new ValidationError(
      'Machine principal currentness mutation predecessor checkpoint does not match retained head'
    );
  }
  if (command.statement.expected_successor_sequence !== retained.statement.sequence + 1) {
    throw new ValidationError(
      'Machine principal currentness mutation successor sequence must advance retained sequence by one'
    );
  }
  if (
    timestampValue(command.statement.effective_at)
    <= timestampValue(retained.statement.observed_at)
  ) {
    throw new ValidationError(
      'Machine principal currentness mutation effective time must advance chronologically after retained observation'
    );
  }

  const transition = transitionFor(retained, command);
  const sourceHeadDigest = mutationSourceHeadDigest({ retained, command, transition });
  const nextCurrentness = Object.freeze({
    schema: MACHINE_PRINCIPAL_CURRENTNESS_SCHEMA,
    principal_id: retained.statement.principal_id,
    principal_type: retained.statement.principal_type,
    authority_digest: transition.authority_digest,
    status: transition.status,
    sequence: command.statement.expected_successor_sequence,
    observed_at: command.statement.effective_at,
    source_head_digest: sourceHeadDigest,
    predecessor_head_digest: retained.statement.source_head_digest,
    authority_effect: 'none',
    execution_authority_granted: false,
    global_currentness_claimed: false
  });
  const checkpoint = createMachinePrincipalCurrentnessCheckpoint({
    currentness: nextCurrentness,
    controllerPrivateKey: currentnessControllerPrivateKey,
    trustedControllerPublicKey: trustedCurrentnessControllerPublicKey
  });
  validateMachinePrincipalCurrentnessCheckpointTransition(
    retained,
    checkpoint,
    { trustedControllerPublicKey: trustedCurrentnessControllerPublicKey }
  );

  return Object.freeze({
    mutation_command_digest: command.command_digest,
    predecessor_checkpoint_digest: retained.checkpoint_digest,
    resulting_checkpoint_digest: checkpoint.checkpoint_digest,
    resulting_source_head_digest: sourceHeadDigest,
    checkpoint,
    ...RESULT_NONCLAIMS
  });
}
