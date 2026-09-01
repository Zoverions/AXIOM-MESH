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
  MACHINE_PRINCIPAL_CURRENTNESS_SCHEMA,
  normalizeMachinePrincipalCurrentness
} from './machine-principal-currentness.mjs';
import {
  assertMachineCurrentnessControllerKeyUsableAt,
  machineCurrentnessControllerKeyId,
  verifyMachineCurrentnessControllerKeyCredential
} from './machine-currentness-controller-key-lifecycle.mjs';

export const MACHINE_PRINCIPAL_CURRENTNESS_CHECKPOINT_SCHEMA =
  'axiom-machine-principal-currentness-checkpoint.v1';

const CHECKPOINT_KEYS = new Set([
  'schema',
  'statement',
  'statement_digest',
  'controller_signature',
  'checkpoint_digest'
]);

function rejectUnknownKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ValidationError(`${label} contains unsupported field: ${key}`);
  }
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${label} must be an object`);
  }
  return value;
}

function publicKey(value, label) {
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

function privateKey(value, label) {
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

function keyId(key) {
  return sha256(key.export({ type: 'spki', format: 'der' }));
}

function checkpointStatement(currentness, controllerKeyId) {
  const normalized = normalizeMachinePrincipalCurrentness(currentness);
  return Object.freeze({
    schema: MACHINE_PRINCIPAL_CURRENTNESS_SCHEMA,
    ...normalized,
    controller_key_id: controllerKeyId
  });
}

export function createMachinePrincipalCurrentnessCheckpoint({
  currentness,
  controllerPrivateKey,
  trustedControllerPublicKey
} = {}) {
  const trustedPublic = publicKey(
    trustedControllerPublicKey,
    'Machine principal currentness trusted controller public key'
  );
  const signingPrivate = privateKey(
    controllerPrivateKey,
    'Machine principal currentness controller private key'
  );
  const signingPublic = createPublicKey(signingPrivate);
  if (keyId(signingPublic) !== keyId(trustedPublic)) {
    throw new ValidationError(
      'Machine principal currentness controller substitution rejected'
    );
  }

  const statement = checkpointStatement(currentness, keyId(trustedPublic));
  const statementDigest = digestObject(statement);
  const signable = Object.freeze({
    schema: MACHINE_PRINCIPAL_CURRENTNESS_CHECKPOINT_SCHEMA,
    statement,
    statement_digest: statementDigest
  });
  const controllerSignature = signBytes(
    null,
    Buffer.from(canonicalJson(signable)),
    signingPrivate
  ).toString('base64url');
  const signed = Object.freeze({
    ...signable,
    controller_signature: controllerSignature
  });
  return Object.freeze({
    ...signed,
    checkpoint_digest: digestObject(signed)
  });
}

export function verifyMachinePrincipalCurrentnessCheckpoint(raw, {
  trustedControllerPublicKey,
  expectedPrincipalId,
  expectedPrincipalType,
  retainedCheckpoint = null
} = {}) {
  const checkpoint = requireObject(raw, 'Machine principal currentness checkpoint');
  rejectUnknownKeys(
    checkpoint,
    CHECKPOINT_KEYS,
    'Machine principal currentness checkpoint'
  );
  if (checkpoint.schema !== MACHINE_PRINCIPAL_CURRENTNESS_CHECKPOINT_SCHEMA) {
    throw new ValidationError('Machine principal currentness checkpoint schema is unsupported');
  }

  const trustedPublic = publicKey(
    trustedControllerPublicKey,
    'Machine principal currentness trusted controller public key'
  );
  const statement = requireObject(
    checkpoint.statement,
    'Machine principal currentness checkpoint statement'
  );
  const { controller_key_id: controllerKeyId, ...rawCurrentness } = statement;
  const currentness = normalizeMachinePrincipalCurrentness(rawCurrentness);
  if (controllerKeyId !== keyId(trustedPublic)) {
    throw new ValidationError('Machine principal currentness controller key mismatch');
  }

  const normalizedStatement = checkpointStatement(currentness, controllerKeyId);
  const statementDigest = digestObject(normalizedStatement);
  if (checkpoint.statement_digest !== statementDigest) {
    throw new ValidationError('Machine principal currentness statement digest mismatch');
  }
  const signable = {
    schema: MACHINE_PRINCIPAL_CURRENTNESS_CHECKPOINT_SCHEMA,
    statement: normalizedStatement,
    statement_digest: statementDigest
  };
  let signature;
  try {
    signature = Buffer.from(checkpoint.controller_signature, 'base64url');
  } catch {
    throw new ValidationError('Machine principal currentness controller signature is invalid');
  }
  if (
    signature.length === 0
    || !verifyBytes(
      null,
      Buffer.from(canonicalJson(signable)),
      trustedPublic,
      signature
    )
  ) {
    throw new ValidationError('Machine principal currentness controller signature verification failed');
  }
  const signed = {
    ...signable,
    controller_signature: checkpoint.controller_signature
  };
  const checkpointDigest = digestObject(signed);
  if (checkpoint.checkpoint_digest !== checkpointDigest) {
    throw new ValidationError('Machine principal currentness checkpoint digest mismatch');
  }

  if (
    expectedPrincipalId !== undefined
    && currentness.principal_id !== expectedPrincipalId
  ) {
    throw new ValidationError('Machine principal currentness checkpoint principal mismatch');
  }
  if (
    expectedPrincipalType !== undefined
    && currentness.principal_type !== expectedPrincipalType
  ) {
    throw new ValidationError('Machine principal currentness checkpoint principal type mismatch');
  }

  const verified = Object.freeze({
    schema: MACHINE_PRINCIPAL_CURRENTNESS_CHECKPOINT_SCHEMA,
    statement: normalizedStatement,
    statement_digest: statementDigest,
    controller_signature: checkpoint.controller_signature,
    checkpoint_digest: checkpointDigest
  });

  if (retainedCheckpoint !== null) {
    const retained = verifyMachinePrincipalCurrentnessCheckpoint(retainedCheckpoint, {
      trustedControllerPublicKey,
      expectedPrincipalId: currentness.principal_id,
      expectedPrincipalType: currentness.principal_type
    });
    assertProgressRelativeToRetained(retained, verified);
  }

  return verified;
}

export function validateMachinePrincipalCurrentnessCheckpointTransition(
  previousRaw,
  currentRaw,
  { trustedControllerPublicKey } = {}
) {
  const previous = verifyMachinePrincipalCurrentnessCheckpoint(previousRaw, {
    trustedControllerPublicKey
  });
  const current = verifyMachinePrincipalCurrentnessCheckpoint(currentRaw, {
    trustedControllerPublicKey,
    expectedPrincipalId: previous.statement.principal_id,
    expectedPrincipalType: previous.statement.principal_type
  });
  if (current.statement.sequence !== previous.statement.sequence + 1) {
    throw new ValidationError(
      'Machine principal currentness checkpoint sequence must advance by one'
    );
  }
  if (current.statement.predecessor_head_digest !== previous.statement.source_head_digest) {
    throw new ValidationError(
      'Machine principal currentness predecessor head digest mismatch'
    );
  }
  if (
    Date.parse(current.statement.observed_at)
    <= Date.parse(previous.statement.observed_at)
  ) {
    throw new ValidationError(
      'Machine principal currentness observed_at must advance chronologically'
    );
  }
  return Object.freeze({
    valid: true,
    previous_sequence: previous.statement.sequence,
    current_sequence: current.statement.sequence,
    previous_head_digest: previous.statement.source_head_digest,
    current_head_digest: current.statement.source_head_digest,
    authority_effect: 'none',
    execution_authority_granted: false,
    global_currentness_claimed: false
  });
}

function assertProgressRelativeToRetained(retained, current) {
  if (current.statement.sequence < retained.statement.sequence) {
    throw new ValidationError(
      'Machine principal currentness rollback detected relative to retained checkpoint'
    );
  }
  if (
    current.statement.sequence === retained.statement.sequence
    && current.checkpoint_digest !== retained.checkpoint_digest
  ) {
    throw new ValidationError(
      'Machine principal currentness equivocation detected at retained sequence'
    );
  }
}


export function verifyMachinePrincipalCurrentnessCheckpointWithControllerLifecycle(raw, {
  controllerCredential,
  trustedControllerRootPublicKey,
  successorControllerCredential = null,
  controllerRevocation = null,
  expectedControllerDomainId = 'axiom.machine-currentness.v1',
  expectedControllerPrincipalId,
  expectedPrincipalId,
  expectedPrincipalType,
  retainedCheckpoint = null
} = {}) {
  const credential = verifyMachineCurrentnessControllerKeyCredential(controllerCredential, {
    trustedRootPublicKey: trustedControllerRootPublicKey,
    expectedDomainId: expectedControllerDomainId,
    expectedPrincipalId: expectedControllerPrincipalId
  });
  const claimedControllerKeyId = raw?.statement?.controller_key_id;
  if (
    typeof claimedControllerKeyId !== 'string'
    || claimedControllerKeyId !== credential.statement.operational_key_id
  ) {
    throw new ValidationError(
      'Machine principal currentness checkpoint controller credential does not match signed controller key'
    );
  }
  const observedAt = raw?.statement?.observed_at;
  const usable = assertMachineCurrentnessControllerKeyUsableAt(controllerCredential, {
    trustedRootPublicKey: trustedControllerRootPublicKey,
    at: observedAt,
    successorCredential: successorControllerCredential,
    revocation: controllerRevocation,
    expectedDomainId: expectedControllerDomainId,
    expectedPrincipalId: expectedControllerPrincipalId
  });
  if (machineCurrentnessControllerKeyId(usable.operational_public_key) !== claimedControllerKeyId) {
    throw new ValidationError(
      'Machine principal currentness controller lifecycle resolved a different operational key'
    );
  }
  const checkpoint = verifyMachinePrincipalCurrentnessCheckpoint(raw, {
    trustedControllerPublicKey: usable.operational_public_key,
    expectedPrincipalId,
    expectedPrincipalType,
    retainedCheckpoint
  });
  return Object.freeze({
    checkpoint,
    controller_credential_digest: credential.credential_digest,
    controller_key_epoch: credential.statement.key_epoch,
    controller_operational_key_id: credential.statement.operational_key_id,
    controller_lifecycle_checked_at: checkpoint.statement.observed_at,
    controller_wall_clock_signing_time_proved: false,
    execution_authority_granted: false,
    authority_effect: 'none',
    capability_promotion_effect: 'none',
    global_currentness_claimed: false
  });
}
