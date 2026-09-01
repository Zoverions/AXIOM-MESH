import { ValidationError, digestObject } from './canonical.mjs';
import {
  createMachinePrincipalCurrentnessCheckpoint
} from './machine-principal-currentness-checkpoint.mjs';
import {
  machineCurrentnessMutationAuthorityKeyId,
  verifyMachineCurrentnessMutationCommand
} from './machine-currentness-mutation-command.mjs';
import {
  machineCurrentnessControllerKeyId
} from './machine-currentness-controller-key-lifecycle.mjs';

const TERMINAL_STATUSES = new Set(['revoked', 'compromised', 'expired']);

function requireStore(value) {
  if (
    !value
    || typeof value.retainedHead !== 'function'
    || typeof value.retain !== 'function'
    || typeof value.verifyState !== 'function'
  ) {
    throw new ValidationError(
      'Machine currentness lifecycle source requires a durable retained-head store'
    );
  }
  return value;
}

function transitionAllowed(previous, command) {
  const previousStatus = previous.status;
  const previousAuthorityDigest = previous.authority_digest;
  const kind = command.statement.mutation_kind;
  const nextStatus = command.statement.resulting_status;
  const nextAuthorityDigest = command.statement.resulting_authority_digest;
  if (TERMINAL_STATUSES.has(previousStatus)) {
    throw new ValidationError(
      'Machine currentness terminal lifecycle state cannot be reactivated or mutated in v1'
    );
  }
  if (!['active', 'narrowed'].includes(previousStatus)) {
    throw new ValidationError('Machine currentness retained lifecycle status is unsupported');
  }
  if (kind === 'authority-update') {
    if (previousStatus !== 'active' || nextStatus !== 'active') {
      throw new ValidationError(
        'Machine currentness authority-update is permitted only from active to active'
      );
    }
  }
  if (kind === 'narrow' && nextStatus !== 'narrowed') {
    throw new ValidationError('Machine currentness narrow mutation must result in narrowed status');
  }
  if (kind === 'revoke' && nextStatus !== 'revoked') {
    throw new ValidationError('Machine currentness revoke mutation must result in revoked status');
  }
  if (kind === 'compromise' && nextStatus !== 'compromised') {
    throw new ValidationError('Machine currentness compromise mutation must result in compromised status');
  }
  if (kind === 'expire' && nextStatus !== 'expired') {
    throw new ValidationError('Machine currentness expire mutation must result in expired status');
  }
  if (
    ['revoke', 'compromise', 'expire'].includes(kind)
    && nextAuthorityDigest !== previousAuthorityDigest
  ) {
    throw new ValidationError(
      `Machine currentness ${kind} mutation must preserve the last authority digest`
    );
  }
}

export async function applyMachinePrincipalCurrentnessMutation({
  currentnessStore,
  mutationCommand,
  trustedMutationAuthorityPublicKey,
  currentnessControllerPrivateKey,
  trustedCurrentnessControllerPublicKey,
  at
} = {}) {
  const store = requireStore(currentnessStore);
  await store.verifyState();
  const retained = store.retainedHead();
  if (!retained) {
    throw new ValidationError(
      'Machine currentness mutation requires an existing retained genesis checkpoint'
    );
  }

  const previous = retained.statement;
  const expectedSuccessorSequence = previous.sequence + 1;
  const command = verifyMachineCurrentnessMutationCommand(mutationCommand, {
    trustedMutationAuthorityPublicKey,
    expectedPrincipalId: previous.principal_id,
    expectedPrincipalType: previous.principal_type,
    expectedPredecessorCheckpointDigest: retained.checkpoint_digest,
    expectedSuccessorSequence,
    at
  });

  if (
    machineCurrentnessMutationAuthorityKeyId(trustedMutationAuthorityPublicKey)
    === machineCurrentnessControllerKeyId(trustedCurrentnessControllerPublicKey)
  ) {
    throw new ValidationError(
      'Machine currentness mutation authority and checkpoint controller keys must be distinct'
    );
  }

  transitionAllowed(previous, command);

  if (command.statement.effective_at <= previous.observed_at) {
    throw new ValidationError(
      'Machine currentness mutation effective time must advance after retained observation'
    );
  }
  if (
    command.statement.mutation_kind === 'authority-update'
    && command.statement.resulting_authority_digest === previous.authority_digest
  ) {
    throw new ValidationError(
      'Machine currentness authority-update must change the authority digest'
    );
  }
  if (
    command.statement.mutation_kind === 'narrow'
    && command.statement.resulting_authority_digest === previous.authority_digest
  ) {
    throw new ValidationError(
      'Machine currentness narrow mutation must change the authority digest'
    );
  }

  const sourceHeadDigest = digestObject({
    schema: 'axiom-machine-currentness-source-head.v1',
    predecessor_checkpoint_digest: retained.checkpoint_digest,
    predecessor_source_head_digest: previous.source_head_digest,
    mutation_command_digest: command.command_digest,
    principal_id: previous.principal_id,
    principal_type: previous.principal_type,
    authority_digest: command.statement.resulting_authority_digest,
    status: command.statement.resulting_status,
    sequence: expectedSuccessorSequence,
    observed_at: command.statement.effective_at
  });

  const currentness = Object.freeze({
    schema: 'axiom-machine-principal-currentness.v1',
    principal_id: previous.principal_id,
    principal_type: previous.principal_type,
    authority_digest: command.statement.resulting_authority_digest,
    status: command.statement.resulting_status,
    sequence: expectedSuccessorSequence,
    observed_at: command.statement.effective_at,
    source_head_digest: sourceHeadDigest,
    predecessor_head_digest: previous.source_head_digest,
    authority_effect: 'none',
    execution_authority_granted: false,
    global_currentness_claimed: false
  });

  const checkpoint = createMachinePrincipalCurrentnessCheckpoint({
    currentness,
    controllerPrivateKey: currentnessControllerPrivateKey,
    trustedControllerPublicKey: trustedCurrentnessControllerPublicKey
  });
  const retainedResult = await store.retain(checkpoint);
  if (!['retained', 'already-retained'].includes(retainedResult.status)) {
    throw new ValidationError(
      'Machine currentness mutation successor was not durably retained'
    );
  }

  return Object.freeze({
    valid: true,
    mutation_command_digest: command.command_digest,
    predecessor_checkpoint_digest: retained.checkpoint_digest,
    successor_checkpoint: checkpoint,
    successor_checkpoint_digest: checkpoint.checkpoint_digest,
    successor_source_head_digest: sourceHeadDigest,
    successor_sequence: expectedSuccessorSequence,
    resulting_authority_digest: currentness.authority_digest,
    resulting_status: currentness.status,
    retained_status: retainedResult.status,
    authority_effect: 'none',
    execution_authority_granted: false,
    delegation_effect: 'none',
    capability_promotion_effect: 'none',
    global_currentness_claimed: false
  });
}
