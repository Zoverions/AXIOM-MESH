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
  validateDelegationRootAttestationKeyCredentialPath,
  verifyDelegationRootAttestationKeyRevocation
} from './delegation-root-attestation-key-lifecycle.mjs';

export const DELEGATION_ROOT_ATTESTATION_KEY_CURRENTNESS_CHECKPOINT_SCHEMA =
  'axiom-delegation-root-attestation-key-currentness-checkpoint.v1';

const CHECKPOINT_SCOPE = 'delegation-root-attestation-key-lifecycle';
const CHECKPOINT_EFFECT = 'retainable-currentness-boundary-only';
const MAX_CHECKPOINT_PATH = 128;
const MAX_REVOCATIONS = 128;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/;

const TOP_LEVEL_KEYS = Object.freeze([
  'schema',
  'statement',
  'statement_digest',
  'controller_signature',
  'checkpoint_digest'
]);

const STATEMENT_KEYS = Object.freeze([
  'root_binding_digest',
  'root_authority_digest',
  'root_holder',
  'controller_key_id',
  'checkpoint_sequence',
  'checkpointed_at',
  'predecessor_checkpoint_digest',
  'credential_head_digest',
  'credential_head_epoch',
  'credential_head_operational_key_id',
  'credential_path_digest',
  'revocation_digests',
  'revocation_count',
  'revocation_set_digest',
  'checkpoint_scope',
  'checkpoint_effect',
  'authority_effect',
  'delegation_effect',
  'execution_authority_granted',
  'capability_promotion_effect',
  'network_effect',
  'global_currentness_claimed',
  'wall_clock_checkpoint_time_proved'
]);

const FIXED_SEMANTICS = Object.freeze({
  checkpoint_scope: CHECKPOINT_SCOPE,
  checkpoint_effect: CHECKPOINT_EFFECT,
  authority_effect: 'none',
  delegation_effect: 'none',
  execution_authority_granted: false,
  capability_promotion_effect: 'none',
  network_effect: 'none',
  global_currentness_claimed: false,
  wall_clock_checkpoint_time_proved: false
});

export function createDelegationRootAttestationKeyCurrentnessCheckpoint({
  credentials,
  revocations = [],
  trustedControllerPublicKey,
  controllerPrivateKey,
  checkpointSequence,
  checkpointedAt,
  predecessorCheckpoint = null
} = {}) {
  const snapshot = normalizeLifecycleSnapshot({
    credentials,
    revocations,
    trustedControllerPublicKey
  });
  const controllerPublic = parsePublicKey(
    trustedControllerPublicKey,
    'delegation root attestation currentness trusted controller public key'
  );
  const controllerPrivate = parsePrivateKey(
    controllerPrivateKey,
    'delegation root attestation currentness controller private key'
  );
  const trustedControllerKeyId = keyId(controllerPublic);
  const signingControllerKeyId = keyId(createPublicKey(controllerPrivate));
  if (signingControllerKeyId !== trustedControllerKeyId) {
    throw new ValidationError(
      'Delegation root attestation currentness controller mismatch; controller substitution rejected'
    );
  }
  if (snapshot.controllerKeyId !== trustedControllerKeyId) {
    throw new ValidationError(
      'Delegation root attestation currentness lifecycle controller mismatch'
    );
  }

  const sequence = positiveInteger(
    checkpointSequence,
    'delegation root attestation currentness checkpoint sequence'
  );
  const checkpointTime = canonicalTimestamp(
    checkpointedAt,
    'delegation root attestation currentness checkpointed_at'
  );

  let predecessor = null;
  if (predecessorCheckpoint !== null) {
    predecessor = verifyDelegationRootAttestationKeyCurrentnessCheckpoint(
      predecessorCheckpoint,
      {
        trustedControllerPublicKey: controllerPublic,
        expectedRootBindingDigest: snapshot.rootBindingDigest,
        expectedRootAuthorityDigest: snapshot.rootAuthorityDigest,
        expectedRootHolder: snapshot.rootHolder
      }
    );
  }
  if (sequence === 1 && predecessor !== null) {
    throw new ValidationError(
      'Delegation root attestation currentness checkpoint sequence 1 cannot provide a predecessor'
    );
  }
  if (sequence > 1 && predecessor === null) {
    throw new ValidationError(
      'Delegation root attestation currentness checkpoint sequence above 1 requires a predecessor'
    );
  }

  const statement = normalizeStatement({
    root_binding_digest: snapshot.rootBindingDigest,
    root_authority_digest: snapshot.rootAuthorityDigest,
    root_holder: snapshot.rootHolder,
    controller_key_id: trustedControllerKeyId,
    checkpoint_sequence: sequence,
    checkpointed_at: checkpointTime,
    predecessor_checkpoint_digest: predecessor?.checkpoint_digest ?? null,
    credential_head_digest: snapshot.credentialHead.credential_digest,
    credential_head_epoch: snapshot.credentialHead.statement.key_epoch,
    credential_head_operational_key_id: snapshot.credentialHead.statement.operational_key_id,
    credential_path_digest: snapshot.credentialPathDigest,
    revocation_digests: snapshot.revocationDigests,
    revocation_count: snapshot.revocationDigests.length,
    revocation_set_digest: snapshot.revocationSetDigest,
    ...FIXED_SEMANTICS
  });

  const statementDigest = digestObject(statement);
  const signable = Object.freeze({
    schema: DELEGATION_ROOT_ATTESTATION_KEY_CURRENTNESS_CHECKPOINT_SCHEMA,
    statement,
    statement_digest: statementDigest
  });
  const controllerSignature = signBytes(
    null,
    Buffer.from(canonicalJson(signable)),
    controllerPrivate
  ).toString('base64url');
  const signed = Object.freeze({
    ...signable,
    controller_signature: controllerSignature
  });
  const checkpoint = Object.freeze({
    ...signed,
    checkpoint_digest: digestObject(signed)
  });

  if (predecessor) {
    assertCheckpointProgression(predecessor, checkpoint);
    assertSnapshotExtendsPredecessor(snapshot, predecessor);
  }
  return checkpoint;
}

export function verifyDelegationRootAttestationKeyCurrentnessCheckpoint(raw, {
  trustedControllerPublicKey,
  expectedRootBindingDigest,
  expectedRootAuthorityDigest,
  expectedRootHolder
} = {}) {
  const checkpoint = verifySignatureEnvelope(raw, trustedControllerPublicKey);
  assertExpectedRoot(checkpoint.statement, {
    expectedRootBindingDigest,
    expectedRootAuthorityDigest,
    expectedRootHolder
  });
  return checkpoint;
}

export function validateDelegationRootAttestationKeyCurrentnessCheckpointTransition(
  previousRaw,
  currentRaw,
  { trustedControllerPublicKey } = {}
) {
  const previous = verifySignatureEnvelope(previousRaw, trustedControllerPublicKey);
  const current = verifySignatureEnvelope(currentRaw, trustedControllerPublicKey);
  assertCheckpointProgression(previous, current);
  return Object.freeze({
    valid: true,
    schema: 'axiom-delegation-root-attestation-key-currentness-transition.v1',
    previous_sequence: previous.statement.checkpoint_sequence,
    current_sequence: current.statement.checkpoint_sequence,
    previous_checkpoint_digest: previous.checkpoint_digest,
    current_checkpoint_digest: current.checkpoint_digest,
    previous_credential_head_epoch: previous.statement.credential_head_epoch,
    current_credential_head_epoch: current.statement.credential_head_epoch,
    root_binding_digest: current.statement.root_binding_digest,
    root_authority_digest: current.statement.root_authority_digest,
    root_holder: current.statement.root_holder,
    authority_effect: 'none',
    delegation_effect: 'none',
    execution_authority_granted: false,
    capability_promotion_effect: 'none',
    network_effect: 'none',
    global_currentness_claimed: false
  });
}

export function validateDelegationRootAttestationKeyCurrentnessCheckpointPath(
  rawPath,
  {
    trustedControllerPublicKey,
    expectedRootBindingDigest,
    expectedRootAuthorityDigest,
    expectedRootHolder
  } = {}
) {
  if (!Array.isArray(rawPath) || rawPath.length < 1 || rawPath.length > MAX_CHECKPOINT_PATH) {
    throw new ValidationError(
      `Delegation root attestation currentness checkpoint path must contain 1-${MAX_CHECKPOINT_PATH} checkpoints`
    );
  }
  const verified = rawPath.map(raw => verifyDelegationRootAttestationKeyCurrentnessCheckpoint(raw, {
    trustedControllerPublicKey,
    expectedRootBindingDigest,
    expectedRootAuthorityDigest,
    expectedRootHolder
  }));
  if (verified[0].statement.checkpoint_sequence !== 1) {
    throw new ValidationError(
      'Delegation root attestation currentness checkpoint path must begin at sequence 1; truncated path rejected'
    );
  }
  if (verified[0].statement.predecessor_checkpoint_digest !== null) {
    throw new ValidationError(
      'Delegation root attestation currentness genesis checkpoint cannot name a predecessor'
    );
  }
  for (let index = 1; index < verified.length; index += 1) {
    assertCheckpointProgression(verified[index - 1], verified[index]);
  }
  return Object.freeze({
    valid: true,
    schema: 'axiom-delegation-root-attestation-key-currentness-checkpoint-path.v1',
    first_sequence: verified[0].statement.checkpoint_sequence,
    last_sequence: verified.at(-1).statement.checkpoint_sequence,
    checkpoint_count: verified.length,
    head_checkpoint_digest: verified.at(-1).checkpoint_digest,
    root_binding_digest: verified.at(-1).statement.root_binding_digest,
    root_authority_digest: verified.at(-1).statement.root_authority_digest,
    root_holder: verified.at(-1).statement.root_holder,
    authority_effect: 'none',
    delegation_effect: 'none',
    execution_authority_granted: false,
    capability_promotion_effect: 'none',
    network_effect: 'none',
    global_currentness_claimed: false
  });
}

export function verifyDelegationRootAttestationKeyLifecycleCurrentness({
  checkpoint: rawCheckpoint,
  credentials,
  revocations = [],
  trustedControllerPublicKey,
  retainedCheckpoint: rawRetainedCheckpoint,
  checkpointPath,
  expectedRootBindingDigest,
  expectedRootAuthorityDigest,
  expectedRootHolder
} = {}) {
  const checkpoint = verifyDelegationRootAttestationKeyCurrentnessCheckpoint(rawCheckpoint, {
    trustedControllerPublicKey,
    expectedRootBindingDigest,
    expectedRootAuthorityDigest,
    expectedRootHolder
  });
  const snapshot = normalizeLifecycleSnapshot({
    credentials,
    revocations,
    trustedControllerPublicKey,
    expectedRootBindingDigest: checkpoint.statement.root_binding_digest,
    expectedRootAuthorityDigest: checkpoint.statement.root_authority_digest,
    expectedRootHolder: checkpoint.statement.root_holder
  });
  assertCheckpointMatchesSnapshot(checkpoint, snapshot);

  let retained = null;
  if (rawRetainedCheckpoint !== undefined && rawRetainedCheckpoint !== null) {
    retained = verifyDelegationRootAttestationKeyCurrentnessCheckpoint(rawRetainedCheckpoint, {
      trustedControllerPublicKey,
      expectedRootBindingDigest: checkpoint.statement.root_binding_digest,
      expectedRootAuthorityDigest: checkpoint.statement.root_authority_digest,
      expectedRootHolder: checkpoint.statement.root_holder
    });

    if (checkpoint.statement.checkpoint_sequence < retained.statement.checkpoint_sequence) {
      throw new ValidationError(
        'Delegation root attestation currentness rollback detected: presented checkpoint is older than retained checkpoint'
      );
    }
    if (
      checkpoint.statement.checkpoint_sequence === retained.statement.checkpoint_sequence
      && checkpoint.checkpoint_digest !== retained.checkpoint_digest
    ) {
      throw new ValidationError(
        'Delegation root attestation currentness checkpoint equivocation: same sequence has a different signed checkpoint digest'
      );
    }

    assertSnapshotSatisfiesRetainedCheckpoint(snapshot, retained);

    if (checkpoint.statement.checkpoint_sequence > retained.statement.checkpoint_sequence) {
      if (!Array.isArray(checkpointPath)) {
        throw new ValidationError(
          'Delegation root attestation currentness newer checkpoint requires checkpoint path from retained state'
        );
      }
      const path = validateAndReturnCheckpointPath(checkpointPath, {
        trustedControllerPublicKey,
        expectedRootBindingDigest: checkpoint.statement.root_binding_digest,
        expectedRootAuthorityDigest: checkpoint.statement.root_authority_digest,
        expectedRootHolder: checkpoint.statement.root_holder
      });
      const retainedIndex = path.findIndex(item => item.checkpoint_digest === retained.checkpoint_digest);
      if (retainedIndex < 0) {
        throw new ValidationError(
          'Delegation root attestation currentness checkpoint path omits the retained checkpoint head'
        );
      }
      if (path.at(-1).checkpoint_digest !== checkpoint.checkpoint_digest) {
        throw new ValidationError(
          'Delegation root attestation currentness checkpoint path does not terminate at presented checkpoint'
        );
      }
    }
  }

  return Object.freeze({
    verified: true,
    schema: 'axiom-delegation-root-attestation-key-lifecycle-currentness.v1',
    root_binding_digest: checkpoint.statement.root_binding_digest,
    root_authority_digest: checkpoint.statement.root_authority_digest,
    root_holder: checkpoint.statement.root_holder,
    presented_checkpoint_digest: checkpoint.checkpoint_digest,
    presented_checkpoint_sequence: checkpoint.statement.checkpoint_sequence,
    retained_checkpoint_digest: retained?.checkpoint_digest ?? null,
    retained_checkpoint_sequence: retained?.statement.checkpoint_sequence ?? null,
    retained_checkpoint_satisfied: retained !== null,
    rollback_detected: false,
    tail_withholding_detected_relative_to_retained_checkpoint: false,
    credential_head_digest: snapshot.credentialHead.credential_digest,
    credential_head_epoch: snapshot.credentialHead.statement.key_epoch,
    credential_head_operational_key_id: snapshot.credentialHead.statement.operational_key_id,
    revocation_count: snapshot.revocationDigests.length,
    authority_effect: 'none',
    delegation_effect: 'none',
    execution_authority_granted: false,
    capability_promotion_effect: 'none',
    network_effect: 'none',
    global_currentness_claimed: false,
    global_currentness_proved: false,
    wall_clock_currentness_proved: false
  });
}

function normalizeLifecycleSnapshot({
  credentials,
  revocations = [],
  trustedControllerPublicKey,
  expectedRootBindingDigest,
  expectedRootAuthorityDigest,
  expectedRootHolder
}) {
  const history = validateDelegationRootAttestationKeyCredentialPath(credentials, {
    trustedControllerPublicKey,
    expectedRootBindingDigest,
    expectedRootAuthorityDigest,
    expectedRootHolder
  });
  if (!Array.isArray(history) || history.length < 1) {
    throw new ValidationError('Delegation root attestation currentness requires credential history');
  }
  if (!Array.isArray(revocations) || revocations.length > MAX_REVOCATIONS) {
    throw new ValidationError(
      `Delegation root attestation currentness revocations must contain at most ${MAX_REVOCATIONS} entries`
    );
  }

  const credentialByDigest = new Map(history.map(item => [item.credential_digest, item]));
  const credentialRevocations = new Set();
  const verifiedRevocations = revocations.map(raw => {
    const preliminary = verifyDelegationRootAttestationKeyRevocation(raw, {
      trustedControllerPublicKey
    });
    const credential = credentialByDigest.get(preliminary.statement.credential_digest);
    if (!credential) {
      throw new ValidationError(
        'Delegation root attestation currentness revocation references credential outside supplied path'
      );
    }
    const verified = verifyDelegationRootAttestationKeyRevocation(preliminary, {
      trustedControllerPublicKey,
      credential
    });
    if (credentialRevocations.has(verified.statement.credential_digest)) {
      throw new ValidationError(
        'Delegation root attestation currentness permits at most one revocation per credential'
      );
    }
    credentialRevocations.add(verified.statement.credential_digest);
    return verified;
  });
  const canonicalRevocations = [...verifiedRevocations].sort((left, right) => (
    left.revocation_digest.localeCompare(right.revocation_digest)
  ));
  const head = history.at(-1);
  return Object.freeze({
    history,
    credentialHead: head,
    rootBindingDigest: head.statement.root_binding_digest,
    rootAuthorityDigest: head.statement.root_authority_digest,
    rootHolder: head.statement.root_holder,
    controllerKeyId: head.statement.controller_key_id,
    credentialPathDigest: digestObject(history),
    revocations: Object.freeze(canonicalRevocations),
    revocationDigests: Object.freeze(canonicalRevocations.map(item => item.revocation_digest)),
    revocationSetDigest: digestObject(canonicalRevocations)
  });
}

function assertCheckpointMatchesSnapshot(checkpoint, snapshot) {
  const statement = checkpoint.statement;
  if (
    statement.root_binding_digest !== snapshot.rootBindingDigest
    || statement.root_authority_digest !== snapshot.rootAuthorityDigest
    || statement.root_holder !== snapshot.rootHolder
    || statement.controller_key_id !== snapshot.controllerKeyId
  ) {
    throw new ValidationError(
      'Delegation root attestation currentness checkpoint root or controller does not match supplied lifecycle snapshot'
    );
  }
  if (
    statement.credential_head_digest !== snapshot.credentialHead.credential_digest
    || statement.credential_head_epoch !== snapshot.credentialHead.statement.key_epoch
    || statement.credential_head_operational_key_id !== snapshot.credentialHead.statement.operational_key_id
    || statement.credential_path_digest !== snapshot.credentialPathDigest
  ) {
    throw new ValidationError(
      'Delegation root attestation currentness credential head does not match checkpoint; rollback or credential path mismatch detected'
    );
  }
  if (
    statement.revocation_count !== snapshot.revocationDigests.length
    || statement.revocation_set_digest !== snapshot.revocationSetDigest
    || canonicalJson(statement.revocation_digests) !== canonicalJson(snapshot.revocationDigests)
  ) {
    throw new ValidationError(
      'Delegation root attestation currentness checkpoint revocation set mismatch; revocation omission rejected'
    );
  }
}

function assertSnapshotSatisfiesRetainedCheckpoint(snapshot, retained) {
  const retainedStatement = retained.statement;
  if (snapshot.credentialHead.statement.key_epoch < retainedStatement.credential_head_epoch) {
    throw new ValidationError(
      'Delegation root attestation currentness credential rollback detected relative to retained checkpoint'
    );
  }
  const retainedCredential = snapshot.history.find(item => (
    item.statement.key_epoch === retainedStatement.credential_head_epoch
  ));
  if (
    !retainedCredential
    || retainedCredential.credential_digest !== retainedStatement.credential_head_digest
    || retainedCredential.statement.operational_key_id
      !== retainedStatement.credential_head_operational_key_id
  ) {
    throw new ValidationError(
      'Delegation root attestation currentness credential head checkpoint binding missing or rewritten'
    );
  }
  const currentRevocations = new Set(snapshot.revocationDigests);
  for (const digestValue of retainedStatement.revocation_digests) {
    if (!currentRevocations.has(digestValue)) {
      throw new ValidationError(
        'Delegation root attestation currentness revocation omission relative to retained checkpoint'
      );
    }
  }
}

function assertSnapshotExtendsPredecessor(snapshot, predecessor) {
  const previous = predecessor.statement;
  if (snapshot.credentialHead.statement.key_epoch < previous.credential_head_epoch) {
    throw new ValidationError(
      'Delegation root attestation currentness checkpoint credential head cannot roll back'
    );
  }
  const retainedCredential = snapshot.history.find(item => (
    item.statement.key_epoch === previous.credential_head_epoch
  ));
  if (
    !retainedCredential
    || retainedCredential.credential_digest !== previous.credential_head_digest
    || retainedCredential.statement.operational_key_id !== previous.credential_head_operational_key_id
  ) {
    throw new ValidationError(
      'Delegation root attestation currentness checkpoint credential history rewrote the predecessor head'
    );
  }
  if (
    snapshot.credentialHead.statement.key_epoch === previous.credential_head_epoch
    && snapshot.credentialHead.credential_digest !== previous.credential_head_digest
  ) {
    throw new ValidationError(
      'Delegation root attestation currentness checkpoint same credential epoch changed head digest'
    );
  }
  const currentRevocations = new Set(snapshot.revocationDigests);
  for (const digestValue of previous.revocation_digests) {
    if (!currentRevocations.has(digestValue)) {
      throw new ValidationError(
        'Delegation root attestation currentness retained revocation cannot be removed from successor checkpoint'
      );
    }
  }
}

function assertCheckpointProgression(previous, current) {
  const previousStatement = previous.statement;
  const currentStatement = current.statement;
  if (currentStatement.checkpoint_sequence !== previousStatement.checkpoint_sequence + 1) {
    throw new ValidationError(
      'Delegation root attestation currentness checkpoint sequence must advance by one'
    );
  }
  if (currentStatement.predecessor_checkpoint_digest !== previous.checkpoint_digest) {
    throw new ValidationError(
      'Delegation root attestation currentness predecessor checkpoint digest mismatch'
    );
  }
  if (
    currentStatement.root_binding_digest !== previousStatement.root_binding_digest
    || currentStatement.root_authority_digest !== previousStatement.root_authority_digest
    || currentStatement.root_holder !== previousStatement.root_holder
  ) {
    throw new ValidationError(
      'Delegation root attestation currentness checkpoint belongs to a different root; root mismatch'
    );
  }
  if (currentStatement.controller_key_id !== previousStatement.controller_key_id) {
    throw new ValidationError(
      'Delegation root attestation currentness checkpoint controller mismatch'
    );
  }
  if (Date.parse(currentStatement.checkpointed_at) <= Date.parse(previousStatement.checkpointed_at)) {
    throw new ValidationError(
      'Delegation root attestation currentness checkpoint time must advance chronologically'
    );
  }
  if (currentStatement.credential_head_epoch < previousStatement.credential_head_epoch) {
    throw new ValidationError(
      'Delegation root attestation currentness credential head rollback detected'
    );
  }
  if (
    currentStatement.credential_head_epoch === previousStatement.credential_head_epoch
    && (
      currentStatement.credential_head_digest !== previousStatement.credential_head_digest
      || currentStatement.credential_head_operational_key_id
        !== previousStatement.credential_head_operational_key_id
    )
  ) {
    throw new ValidationError(
      'Delegation root attestation currentness same credential epoch cannot change head'
    );
  }
  const currentRevocations = new Set(currentStatement.revocation_digests);
  for (const digestValue of previousStatement.revocation_digests) {
    if (!currentRevocations.has(digestValue)) {
      throw new ValidationError(
        'Delegation root attestation currentness retained revocation cannot be removed'
      );
    }
  }
}

function validateAndReturnCheckpointPath(rawPath, options) {
  validateDelegationRootAttestationKeyCurrentnessCheckpointPath(rawPath, options);
  return Object.freeze(rawPath.map(raw => verifyDelegationRootAttestationKeyCurrentnessCheckpoint(
    raw,
    options
  )));
}

function verifySignatureEnvelope(raw, trustedControllerPublicKey) {
  assertPlainObject(raw, 'delegation root attestation currentness checkpoint');
  assertExactKeys(raw, 'delegation root attestation currentness checkpoint', TOP_LEVEL_KEYS);
  if (raw.schema !== DELEGATION_ROOT_ATTESTATION_KEY_CURRENTNESS_CHECKPOINT_SCHEMA) {
    throw new ValidationError(
      `Delegation root attestation currentness checkpoint schema must be ${DELEGATION_ROOT_ATTESTATION_KEY_CURRENTNESS_CHECKPOINT_SCHEMA}`
    );
  }
  const statement = normalizeStatement(raw.statement);
  const statementDigest = assertDigest(
    raw.statement_digest,
    'delegation root attestation currentness statement digest'
  );
  if (statementDigest !== digestObject(statement)) {
    throw new ValidationError('Delegation root attestation currentness statement digest mismatch');
  }
  const controllerPublic = parsePublicKey(
    trustedControllerPublicKey,
    'delegation root attestation currentness trusted controller public key'
  );
  if (statement.controller_key_id !== keyId(controllerPublic)) {
    throw new ValidationError(
      'Delegation root attestation currentness controller key substitution'
    );
  }
  const signature = canonicalSignature(
    raw.controller_signature,
    'delegation root attestation currentness controller signature'
  );
  let valid = false;
  try {
    valid = verifyBytes(
      null,
      Buffer.from(canonicalJson({
        schema: DELEGATION_ROOT_ATTESTATION_KEY_CURRENTNESS_CHECKPOINT_SCHEMA,
        statement,
        statement_digest: statementDigest
      })),
      controllerPublic,
      Buffer.from(signature, 'base64url')
    );
  } catch {
    valid = false;
  }
  if (!valid) {
    throw new ValidationError('Delegation root attestation currentness controller signature is invalid');
  }
  const signed = Object.freeze({
    schema: DELEGATION_ROOT_ATTESTATION_KEY_CURRENTNESS_CHECKPOINT_SCHEMA,
    statement,
    statement_digest: statementDigest,
    controller_signature: signature
  });
  const checkpointDigest = assertDigest(
    raw.checkpoint_digest,
    'delegation root attestation currentness checkpoint digest'
  );
  if (checkpointDigest !== digestObject(signed)) {
    throw new ValidationError('Delegation root attestation currentness checkpoint digest mismatch');
  }
  return Object.freeze({ ...signed, checkpoint_digest: checkpointDigest });
}

function normalizeStatement(raw) {
  assertPlainObject(raw, 'delegation root attestation currentness checkpoint statement');
  assertExactKeys(raw, 'delegation root attestation currentness checkpoint statement', STATEMENT_KEYS);
  assertFixedSemantics(raw);
  const sequence = positiveInteger(
    raw.checkpoint_sequence,
    'delegation root attestation currentness checkpoint sequence'
  );
  const predecessor = raw.predecessor_checkpoint_digest === null
    ? null
    : assertDigest(
      raw.predecessor_checkpoint_digest,
      'delegation root attestation currentness predecessor checkpoint digest'
    );
  if (sequence === 1 && predecessor !== null) {
    throw new ValidationError(
      'Delegation root attestation currentness genesis checkpoint cannot name a predecessor'
    );
  }
  if (sequence > 1 && predecessor === null) {
    throw new ValidationError(
      'Delegation root attestation currentness non-genesis checkpoint requires predecessor checkpoint digest'
    );
  }
  const revocationDigests = canonicalDigestArray(
    raw.revocation_digests,
    'delegation root attestation currentness revocation digests'
  );
  const revocationCount = nonnegativeInteger(
    raw.revocation_count,
    'delegation root attestation currentness revocation count',
    MAX_REVOCATIONS
  );
  if (revocationCount !== revocationDigests.length) {
    throw new ValidationError(
      'Delegation root attestation currentness revocation count does not match digest set'
    );
  }
  return Object.freeze({
    root_binding_digest: assertDigest(raw.root_binding_digest, 'root binding digest'),
    root_authority_digest: assertDigest(raw.root_authority_digest, 'root authority digest'),
    root_holder: identifier(raw.root_holder, 'root holder'),
    controller_key_id: assertDigest(raw.controller_key_id, 'controller key id'),
    checkpoint_sequence: sequence,
    checkpointed_at: canonicalTimestamp(
      raw.checkpointed_at,
      'delegation root attestation currentness checkpointed_at'
    ),
    predecessor_checkpoint_digest: predecessor,
    credential_head_digest: assertDigest(raw.credential_head_digest, 'credential head digest'),
    credential_head_epoch: positiveInteger(
      raw.credential_head_epoch,
      'delegation root attestation currentness credential head epoch'
    ),
    credential_head_operational_key_id: assertDigest(
      raw.credential_head_operational_key_id,
      'credential head operational key id'
    ),
    credential_path_digest: assertDigest(raw.credential_path_digest, 'credential path digest'),
    revocation_digests: revocationDigests,
    revocation_count: revocationCount,
    revocation_set_digest: assertDigest(raw.revocation_set_digest, 'revocation set digest'),
    ...FIXED_SEMANTICS
  });
}

function assertFixedSemantics(raw) {
  for (const [key, expected] of Object.entries(FIXED_SEMANTICS)) {
    if (raw[key] !== expected) {
      throw new ValidationError(
        `Delegation root attestation currentness checkpoint ${key} must remain ${String(expected)}`
      );
    }
  }
}

function assertExpectedRoot(statement, {
  expectedRootBindingDigest,
  expectedRootAuthorityDigest,
  expectedRootHolder
}) {
  if (
    expectedRootBindingDigest !== undefined
    && statement.root_binding_digest !== assertDigest(
      expectedRootBindingDigest,
      'expected root binding digest'
    )
  ) {
    throw new ValidationError('Delegation root attestation currentness root binding mismatch');
  }
  if (
    expectedRootAuthorityDigest !== undefined
    && statement.root_authority_digest !== assertDigest(
      expectedRootAuthorityDigest,
      'expected root authority digest'
    )
  ) {
    throw new ValidationError('Delegation root attestation currentness root authority digest mismatch');
  }
  if (
    expectedRootHolder !== undefined
    && statement.root_holder !== identifier(expectedRootHolder, 'expected root holder')
  ) {
    throw new ValidationError('Delegation root attestation currentness root holder mismatch');
  }
}

function canonicalDigestArray(raw, label) {
  if (!Array.isArray(raw) || raw.length > MAX_REVOCATIONS) {
    throw new ValidationError(`${label} must contain at most ${MAX_REVOCATIONS} digests`);
  }
  const values = raw.map((value, index) => assertDigest(value, `${label}[${index}]`));
  if (new Set(values).size !== values.length) {
    throw new ValidationError(`${label} must not contain duplicates`);
  }
  const sorted = [...values].sort();
  if (canonicalJson(values) !== canonicalJson(sorted)) {
    throw new ValidationError(`${label} must be sorted`);
  }
  return Object.freeze(values);
}

function assertExactKeys(raw, label, expectedKeys) {
  const actual = Object.keys(raw).sort();
  const expected = [...expectedKeys].sort();
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    throw new ValidationError(`${label} contains unsupported or missing fields`);
  }
}

function identifier(value, label) {
  return assertString(value, label, {
    min: 1,
    max: 192,
    pattern: IDENTIFIER_PATTERN
  });
}

function assertDigest(value, label) {
  return assertString(value, label, {
    min: 64,
    max: 64,
    pattern: DIGEST_PATTERN
  });
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 1_000_000) {
    throw new ValidationError(`${label} must be a positive safe integer`);
  }
  return value;
}

function nonnegativeInteger(value, label, max) {
  if (!Number.isSafeInteger(value) || value < 0 || value > max) {
    throw new ValidationError(`${label} must be a nonnegative safe integer`);
  }
  return value;
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

function canonicalPublicKeyPem(value) {
  return parsePublicKey(value, 'delegation root attestation currentness public key')
    .export({ type: 'spki', format: 'pem' })
    .toString()
    .trim();
}

function keyId(value) {
  return sha256(canonicalPublicKeyPem(value));
}

function canonicalSignature(value, label) {
  const signature = assertString(value, label, {
    min: 86,
    max: 86,
    pattern: BASE64URL_PATTERN
  });
  const bytes = Buffer.from(signature, 'base64url');
  if (bytes.length !== 64 || bytes.toString('base64url') !== signature) {
    throw new ValidationError(`${label} must be canonical 64-byte base64url Ed25519 signature`);
  }
  return signature;
}
