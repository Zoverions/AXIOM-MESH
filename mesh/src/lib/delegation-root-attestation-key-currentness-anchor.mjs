import {
  createPrivateKey,
  createPublicKey,
  sign as signBytes,
  verify as verifyBytes
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
  validateDelegationRootAttestationKeyCurrentnessCheckpointPath,
  verifyDelegationRootAttestationKeyCurrentnessCheckpoint
} from './delegation-root-attestation-key-currentness-checkpoint.mjs';

export const DELEGATION_ROOT_ATTESTATION_KEY_CURRENTNESS_ANCHOR_SCHEMA =
  'axiom-delegation-root-attestation-key-currentness-anchor.v1';

const DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/;
const ANCHOR_SCOPE = 'delegation-root-attestation-key-currentness-head';
const ROLLBACK_DETECTION_SCOPE = 'relative-to-retained-witness-anchor';

const TOP_LEVEL_KEYS = Object.freeze([
  'schema',
  'statement',
  'statement_digest',
  'witness_signature',
  'anchor_digest'
]);

const STATEMENT_KEYS = Object.freeze([
  'root_binding_digest',
  'root_authority_digest',
  'root_holder',
  'controller_key_id',
  'witness_id',
  'witness_key_id',
  'anchor_sequence',
  'anchored_at',
  'predecessor_anchor_digest',
  'checkpoint_sequence',
  'checkpoint_digest',
  'anchor_scope',
  'rollback_detection_scope',
  'authority_effect',
  'delegation_effect',
  'execution_authority_granted',
  'capability_promotion_effect',
  'network_effect',
  'global_currentness_claimed',
  'wall_clock_anchor_time_proved',
  'witness_independence_proved',
  'external_persistence_proved'
]);

const FIXED_SEMANTICS = Object.freeze({
  anchor_scope: ANCHOR_SCOPE,
  rollback_detection_scope: ROLLBACK_DETECTION_SCOPE,
  authority_effect: 'none',
  delegation_effect: 'none',
  execution_authority_granted: false,
  capability_promotion_effect: 'none',
  network_effect: 'none',
  global_currentness_claimed: false,
  wall_clock_anchor_time_proved: false,
  witness_independence_proved: false,
  external_persistence_proved: false
});

export function createDelegationRootAttestationKeyCurrentnessAnchor({
  checkpoint: rawCheckpoint,
  checkpointPath,
  trustedControllerPublicKey,
  expectedRootBindingDigest,
  expectedRootAuthorityDigest,
  expectedRootHolder,
  witnessId,
  witnessPrivateKey,
  anchorSequence,
  anchoredAt,
  predecessorAnchor = null
} = {}) {
  const pathSummary = validateDelegationRootAttestationKeyCurrentnessCheckpointPath(
    checkpointPath,
    {
      trustedControllerPublicKey,
      expectedRootBindingDigest,
      expectedRootAuthorityDigest,
      expectedRootHolder
    }
  );
  const checkpoint = verifyDelegationRootAttestationKeyCurrentnessCheckpoint(
    rawCheckpoint,
    {
      trustedControllerPublicKey,
      expectedRootBindingDigest,
      expectedRootAuthorityDigest,
      expectedRootHolder
    }
  );
  if (pathSummary.head_checkpoint_digest !== checkpoint.checkpoint_digest) {
    throw new ValidationError(
      'Delegation currentness anchor checkpoint path does not terminate at the anchored checkpoint'
    );
  }

  const witnessIdentifier = assertIdentifier(
    witnessId,
    'delegation currentness anchor witness_id'
  );
  const witnessPrivate = parsePrivateKey(
    witnessPrivateKey,
    'delegation currentness anchor witness private key'
  );
  const witnessPublic = createPublicKey(witnessPrivate);
  const witnessKeyId = keyId(witnessPublic);
  const sequence = positiveInteger(
    anchorSequence,
    'delegation currentness anchor sequence'
  );
  const anchorTime = canonicalTimestamp(
    anchoredAt,
    'delegation currentness anchored_at'
  );
  if (Date.parse(anchorTime) < Date.parse(checkpoint.statement.checkpointed_at)) {
    throw new ValidationError(
      'Delegation currentness anchor time cannot predate its controller checkpoint assertion'
    );
  }

  let predecessor = null;
  if (predecessorAnchor !== null) {
    predecessor = verifyAnchorEnvelope(predecessorAnchor, witnessPublic);
  }
  if (sequence === 1 && predecessor !== null) {
    throw new ValidationError(
      'Delegation currentness anchor sequence 1 cannot provide a predecessor'
    );
  }
  if (sequence > 1 && predecessor === null) {
    throw new ValidationError(
      'Delegation currentness anchor sequence above 1 requires a predecessor anchor'
    );
  }

  const statement = normalizeStatement({
    root_binding_digest: checkpoint.statement.root_binding_digest,
    root_authority_digest: checkpoint.statement.root_authority_digest,
    root_holder: checkpoint.statement.root_holder,
    controller_key_id: checkpoint.statement.controller_key_id,
    witness_id: witnessIdentifier,
    witness_key_id: witnessKeyId,
    anchor_sequence: sequence,
    anchored_at: anchorTime,
    predecessor_anchor_digest: predecessor?.anchor_digest ?? null,
    checkpoint_sequence: checkpoint.statement.checkpoint_sequence,
    checkpoint_digest: checkpoint.checkpoint_digest,
    ...FIXED_SEMANTICS
  });

  if (predecessor) {
    assertAnchorProgression(predecessor, statement, checkpointPath);
  }

  const statementDigest = digestObject(statement);
  const signable = Object.freeze({
    schema: DELEGATION_ROOT_ATTESTATION_KEY_CURRENTNESS_ANCHOR_SCHEMA,
    statement,
    statement_digest: statementDigest
  });
  const witnessSignature = signBytes(
    null,
    Buffer.from(canonicalJson(signable), 'utf8'),
    witnessPrivate
  ).toString('base64url');
  const signed = Object.freeze({
    ...signable,
    witness_signature: witnessSignature
  });
  return Object.freeze({
    ...signed,
    anchor_digest: digestObject(signed)
  });
}

export function verifyDelegationRootAttestationKeyCurrentnessAnchor(raw, {
  trustedWitnessPublicKey,
  trustedControllerPublicKey,
  anchoredCheckpoint: rawCheckpoint,
  expectedRootBindingDigest,
  expectedRootAuthorityDigest,
  expectedRootHolder
} = {}) {
  const anchor = verifyAnchorEnvelope(raw, trustedWitnessPublicKey);
  const checkpoint = verifyDelegationRootAttestationKeyCurrentnessCheckpoint(
    rawCheckpoint,
    {
      trustedControllerPublicKey,
      expectedRootBindingDigest,
      expectedRootAuthorityDigest,
      expectedRootHolder
    }
  );

  if (anchor.statement.checkpoint_sequence !== checkpoint.statement.checkpoint_sequence) {
    throw new ValidationError(
      'Delegation currentness anchored checkpoint sequence does not match witness anchor'
    );
  }
  if (anchor.statement.checkpoint_digest !== checkpoint.checkpoint_digest) {
    throw new ValidationError(
      'Delegation currentness anchored checkpoint digest does not match witness anchor; equivocation rejected'
    );
  }
  if (
    anchor.statement.root_binding_digest !== checkpoint.statement.root_binding_digest
    || anchor.statement.root_authority_digest !== checkpoint.statement.root_authority_digest
    || anchor.statement.root_holder !== checkpoint.statement.root_holder
  ) {
    throw new ValidationError(
      'Delegation currentness witness anchor root binding does not match anchored checkpoint'
    );
  }
  if (anchor.statement.controller_key_id !== checkpoint.statement.controller_key_id) {
    throw new ValidationError(
      'Delegation currentness witness anchor controller key does not match anchored checkpoint'
    );
  }
  if (Date.parse(anchor.statement.anchored_at) < Date.parse(checkpoint.statement.checkpointed_at)) {
    throw new ValidationError(
      'Delegation currentness witness anchor time predates its controller checkpoint assertion'
    );
  }
  assertExpectedRoot(anchor.statement, {
    expectedRootBindingDigest,
    expectedRootAuthorityDigest,
    expectedRootHolder
  });
  return anchor;
}

function assertAnchorProgression(previous, currentStatement, checkpointPath) {
  const previousStatement = previous.statement;
  if (currentStatement.anchor_sequence !== previousStatement.anchor_sequence + 1) {
    throw new ValidationError(
      'Delegation currentness anchor chain must advance exactly one anchor sequence'
    );
  }
  if (currentStatement.predecessor_anchor_digest !== previous.anchor_digest) {
    throw new ValidationError(
      'Delegation currentness anchor predecessor digest mismatch'
    );
  }
  if (Date.parse(currentStatement.anchored_at) < Date.parse(previousStatement.anchored_at)) {
    throw new ValidationError(
      'Delegation currentness anchor time cannot move backward'
    );
  }
  if (
    currentStatement.witness_id !== previousStatement.witness_id
    || currentStatement.witness_key_id !== previousStatement.witness_key_id
  ) {
    throw new ValidationError(
      'Delegation currentness anchor witness identity or witness key changed inside one anchor chain'
    );
  }
  if (
    currentStatement.controller_key_id !== previousStatement.controller_key_id
    || currentStatement.root_binding_digest !== previousStatement.root_binding_digest
    || currentStatement.root_authority_digest !== previousStatement.root_authority_digest
    || currentStatement.root_holder !== previousStatement.root_holder
  ) {
    throw new ValidationError(
      'Delegation currentness anchor chain changed controller or root identity'
    );
  }
  if (currentStatement.checkpoint_sequence < previousStatement.checkpoint_sequence) {
    throw new ValidationError(
      'Delegation currentness anchor rollback rejected: anchored checkpoint sequence moved backward'
    );
  }
  if (
    currentStatement.checkpoint_sequence === previousStatement.checkpoint_sequence
    && currentStatement.checkpoint_digest !== previousStatement.checkpoint_digest
  ) {
    throw new ValidationError(
      'Delegation currentness anchor equivocation rejected: same checkpoint sequence has a different checkpoint digest'
    );
  }

  if (!Array.isArray(checkpointPath)) {
    throw new ValidationError('Delegation currentness anchor requires complete checkpoint path');
  }
  const priorCheckpoint = checkpointPath[previousStatement.checkpoint_sequence - 1];
  if (!priorCheckpoint || priorCheckpoint.checkpoint_digest !== previousStatement.checkpoint_digest) {
    throw new ValidationError(
      'Delegation currentness anchor chain checkpoint path omits or rewrites the previously anchored checkpoint'
    );
  }
}

function verifyAnchorEnvelope(raw, trustedWitnessPublicKey) {
  const anchor = normalizeAnchor(raw);
  const trustedWitness = parsePublicKey(
    trustedWitnessPublicKey,
    'delegation currentness anchor trusted witness public key'
  );
  const trustedWitnessKeyId = keyId(trustedWitness);
  if (trustedWitnessKeyId !== anchor.statement.witness_key_id) {
    throw new ValidationError(
      'Delegation currentness anchor witness key substitution detected; trusted witness key does not match'
    );
  }
  const signable = Object.freeze({
    schema: anchor.schema,
    statement: anchor.statement,
    statement_digest: anchor.statement_digest
  });
  const signature = decodeCanonicalSignature(anchor.witness_signature);
  if (!verifyBytes(
    null,
    Buffer.from(canonicalJson(signable), 'utf8'),
    trustedWitness,
    signature
  )) {
    throw new ValidationError('Delegation currentness anchor witness signature is invalid');
  }
  const signed = Object.freeze({
    ...signable,
    witness_signature: anchor.witness_signature
  });
  if (anchor.anchor_digest !== digestObject(signed)) {
    throw new ValidationError('Delegation currentness anchor digest mismatch');
  }
  return anchor;
}

function normalizeAnchor(raw) {
  assertPlainObject(raw, 'delegation currentness anchor');
  assertExactKeys(raw, 'delegation currentness anchor', TOP_LEVEL_KEYS);
  if (raw.schema !== DELEGATION_ROOT_ATTESTATION_KEY_CURRENTNESS_ANCHOR_SCHEMA) {
    throw new ValidationError('Delegation currentness anchor schema is invalid');
  }
  const statement = normalizeStatement(raw.statement);
  const statementDigest = assertDigest(
    raw.statement_digest,
    'delegation currentness anchor statement_digest'
  );
  if (statementDigest !== digestObject(statement)) {
    throw new ValidationError('Delegation currentness anchor statement digest mismatch');
  }
  const witnessSignature = assertString(
    raw.witness_signature,
    'delegation currentness anchor witness_signature',
    { max: 512, pattern: BASE64URL_PATTERN }
  );
  decodeCanonicalSignature(witnessSignature);
  const anchorDigest = assertDigest(
    raw.anchor_digest,
    'delegation currentness anchor anchor_digest'
  );
  return Object.freeze({
    schema: DELEGATION_ROOT_ATTESTATION_KEY_CURRENTNESS_ANCHOR_SCHEMA,
    statement,
    statement_digest: statementDigest,
    witness_signature: witnessSignature,
    anchor_digest: anchorDigest
  });
}

function normalizeStatement(raw) {
  assertPlainObject(raw, 'delegation currentness anchor statement');
  assertExactKeys(raw, 'delegation currentness anchor statement', STATEMENT_KEYS);
  const statement = {
    root_binding_digest: assertDigest(
      raw.root_binding_digest,
      'delegation currentness anchor root_binding_digest'
    ),
    root_authority_digest: assertDigest(
      raw.root_authority_digest,
      'delegation currentness anchor root_authority_digest'
    ),
    root_holder: assertIdentifier(raw.root_holder, 'delegation currentness anchor root_holder'),
    controller_key_id: assertDigest(
      raw.controller_key_id,
      'delegation currentness anchor controller_key_id'
    ),
    witness_id: assertIdentifier(raw.witness_id, 'delegation currentness anchor witness_id'),
    witness_key_id: assertDigest(
      raw.witness_key_id,
      'delegation currentness anchor witness_key_id'
    ),
    anchor_sequence: positiveInteger(raw.anchor_sequence, 'delegation currentness anchor sequence'),
    anchored_at: canonicalTimestamp(raw.anchored_at, 'delegation currentness anchored_at'),
    predecessor_anchor_digest: raw.predecessor_anchor_digest === null
      ? null
      : assertDigest(
        raw.predecessor_anchor_digest,
        'delegation currentness predecessor_anchor_digest'
      ),
    checkpoint_sequence: positiveInteger(
      raw.checkpoint_sequence,
      'delegation currentness anchored checkpoint sequence'
    ),
    checkpoint_digest: assertDigest(
      raw.checkpoint_digest,
      'delegation currentness anchored checkpoint digest'
    ),
    anchor_scope: raw.anchor_scope,
    rollback_detection_scope: raw.rollback_detection_scope,
    authority_effect: raw.authority_effect,
    delegation_effect: raw.delegation_effect,
    execution_authority_granted: raw.execution_authority_granted,
    capability_promotion_effect: raw.capability_promotion_effect,
    network_effect: raw.network_effect,
    global_currentness_claimed: raw.global_currentness_claimed,
    wall_clock_anchor_time_proved: raw.wall_clock_anchor_time_proved,
    witness_independence_proved: raw.witness_independence_proved,
    external_persistence_proved: raw.external_persistence_proved
  };
  for (const [key, value] of Object.entries(FIXED_SEMANTICS)) {
    if (statement[key] !== value) {
      throw new ValidationError(
        `Delegation currentness anchor widens fixed evidence-only semantics at ${key}`
      );
    }
  }
  if (statement.anchor_sequence === 1 && statement.predecessor_anchor_digest !== null) {
    throw new ValidationError(
      'Delegation currentness anchor genesis sequence cannot name a predecessor'
    );
  }
  if (statement.anchor_sequence > 1 && statement.predecessor_anchor_digest === null) {
    throw new ValidationError(
      'Delegation currentness anchor sequence above 1 requires predecessor digest'
    );
  }
  return Object.freeze(statement);
}

function assertExpectedRoot(statement, {
  expectedRootBindingDigest,
  expectedRootAuthorityDigest,
  expectedRootHolder
}) {
  if (expectedRootBindingDigest !== undefined) {
    const expected = assertDigest(
      expectedRootBindingDigest,
      'delegation currentness anchor expected root binding digest'
    );
    if (statement.root_binding_digest !== expected) {
      throw new ValidationError('Delegation currentness anchor root binding digest mismatch');
    }
  }
  if (expectedRootAuthorityDigest !== undefined) {
    const expected = assertDigest(
      expectedRootAuthorityDigest,
      'delegation currentness anchor expected root authority digest'
    );
    if (statement.root_authority_digest !== expected) {
      throw new ValidationError('Delegation currentness anchor root authority digest mismatch');
    }
  }
  if (expectedRootHolder !== undefined) {
    const expected = assertIdentifier(
      expectedRootHolder,
      'delegation currentness anchor expected root holder'
    );
    if (statement.root_holder !== expected) {
      throw new ValidationError('Delegation currentness anchor root holder mismatch');
    }
  }
}

function parsePrivateKey(value, label) {
  try {
    const key = value?.type === 'private' ? value : createPrivateKey(value);
    if (key.type !== 'private' || key.asymmetricKeyType !== 'ed25519') {
      throw new ValidationError(`${label} must be an Ed25519 private key`);
    }
    return key;
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError(`${label} must be an Ed25519 private key`);
  }
}

function parsePublicKey(value, label) {
  try {
    const key = value?.type === 'public' ? value : createPublicKey(value);
    if (key.type !== 'public' || key.asymmetricKeyType !== 'ed25519') {
      throw new ValidationError(`${label} must be an Ed25519 public key`);
    }
    return key;
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError(`${label} must be an Ed25519 public key`);
  }
}

function keyId(publicKey) {
  return sha256(publicKey.export({ type: 'spki', format: 'pem' }).toString());
}

function decodeCanonicalSignature(value) {
  let bytes;
  try {
    bytes = Buffer.from(value, 'base64url');
  } catch {
    throw new ValidationError('Delegation currentness anchor witness signature is invalid');
  }
  if (bytes.length !== 64 || bytes.toString('base64url') !== value) {
    throw new ValidationError('Delegation currentness anchor witness signature is invalid');
  }
  return bytes;
}

function assertDigest(value, label) {
  return assertString(value, label, { max: 64, pattern: DIGEST_PATTERN });
}

function assertIdentifier(value, label) {
  return assertString(value, label, { max: 192, pattern: IDENTIFIER_PATTERN });
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new ValidationError(`${label} must be a positive safe integer`);
  }
  return value;
}

function canonicalTimestamp(value, label) {
  const text = assertString(value, label, { max: 64 });
  const milliseconds = Date.parse(text);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== text) {
    throw new ValidationError(`${label} must be a canonical UTC timestamp`);
  }
  return text;
}

function assertExactKeys(value, label, expectedKeys) {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new ValidationError(`${label} contains unsupported or missing fields`);
  }
}
