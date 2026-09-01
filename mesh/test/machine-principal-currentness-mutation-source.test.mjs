import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import {
  createMachinePrincipalCurrentnessCheckpoint,
  verifyMachinePrincipalCurrentnessCheckpoint
} from '../src/lib/machine-principal-currentness-checkpoint.mjs';
import {
  MACHINE_PRINCIPAL_CURRENTNESS_SCHEMA
} from '../src/lib/machine-principal-currentness.mjs';
import {
  applyMachinePrincipalCurrentnessMutation,
  createMachinePrincipalCurrentnessMutationCommand,
  machinePrincipalCurrentnessMutationAuthorityKeyId,
  verifyMachinePrincipalCurrentnessMutationCommand
} from '../src/lib/machine-principal-currentness-mutation-source.mjs';

const AUTHORITY_A = 'a'.repeat(64);
const AUTHORITY_B = 'b'.repeat(64);
const AUTHORITY_C = 'c'.repeat(64);
const GENESIS_HEAD = 'd'.repeat(64);

function keys() {
  return generateKeyPairSync('ed25519');
}

function currentness({
  authorityDigest = AUTHORITY_A,
  status = 'active',
  sequence = 1,
  observedAt = '2026-09-01T17:00:00.000Z',
  sourceHeadDigest = GENESIS_HEAD,
  predecessorHeadDigest = null
} = {}) {
  return {
    schema: MACHINE_PRINCIPAL_CURRENTNESS_SCHEMA,
    principal_id: 'agent.parent.1',
    principal_type: 'agent',
    authority_digest: authorityDigest,
    status,
    sequence,
    observed_at: observedAt,
    source_head_digest: sourceHeadDigest,
    predecessor_head_digest: predecessorHeadDigest,
    authority_effect: 'none',
    execution_authority_granted: false,
    global_currentness_claimed: false
  };
}

function fixture() {
  const controller = keys();
  const mutationAuthority = keys();
  const genesis = createMachinePrincipalCurrentnessCheckpoint({
    currentness: currentness(),
    controllerPrivateKey: controller.privateKey,
    trustedControllerPublicKey: controller.publicKey
  });
  return { controller, mutationAuthority, genesis };
}

function command(f, overrides = {}) {
  return createMachinePrincipalCurrentnessMutationCommand({
    commandId: 'mutation.currentness.1',
    mutationAuthorityId: 'authority.machine-lifecycle.local',
    mutationAuthorityPrivateKey: f.mutationAuthority.privateKey,
    principalId: 'agent.parent.1',
    principalType: 'agent',
    predecessorCheckpointDigest: f.genesis.checkpoint_digest,
    expectedSuccessorSequence: 2,
    mutationKind: 'authority-update',
    resultingAuthorityDigest: AUTHORITY_B,
    issuedAt: '2026-09-01T17:00:01.000Z',
    effectiveAt: '2026-09-01T17:00:02.000Z',
    expiresAt: '2026-09-01T17:05:00.000Z',
    ...overrides
  });
}

function apply(f, mutationCommand, overrides = {}) {
  return applyMachinePrincipalCurrentnessMutation({
    mutationCommand,
    trustedMutationAuthorityPublicKey: f.mutationAuthority.publicKey,
    retainedCheckpoint: f.genesis,
    trustedCurrentnessControllerPublicKey: f.controller.publicKey,
    currentnessControllerPrivateKey: f.controller.privateKey,
    ...overrides
  });
}

test('separate mutation authority may advance active authority and produce a non-authorizing signed successor checkpoint', () => {
  const f = fixture();
  const mutationCommand = command(f);
  const verifiedCommand = verifyMachinePrincipalCurrentnessMutationCommand(mutationCommand, {
    trustedMutationAuthorityPublicKey: f.mutationAuthority.publicKey,
    expectedPrincipalId: 'agent.parent.1',
    expectedPrincipalType: 'agent'
  });
  assert.equal(
    verifiedCommand.statement.mutation_authority_key_id,
    machinePrincipalCurrentnessMutationAuthorityKeyId(f.mutationAuthority.publicKey)
  );
  assert.equal(verifiedCommand.statement.authority_effect, 'none');
  assert.equal(verifiedCommand.statement.execution_authority_granted, false);
  assert.equal(verifiedCommand.statement.delegation_effect, 'none');
  assert.equal(verifiedCommand.statement.capability_promotion_effect, 'none');
  assert.equal(verifiedCommand.statement.global_currentness_claimed, false);

  const result = apply(f, mutationCommand);
  const successor = verifyMachinePrincipalCurrentnessCheckpoint(result.checkpoint, {
    trustedControllerPublicKey: f.controller.publicKey,
    expectedPrincipalId: 'agent.parent.1',
    expectedPrincipalType: 'agent',
    retainedCheckpoint: f.genesis
  });

  assert.equal(successor.statement.authority_digest, AUTHORITY_B);
  assert.equal(successor.statement.status, 'active');
  assert.equal(successor.statement.sequence, 2);
  assert.equal(successor.statement.observed_at, '2026-09-01T17:00:02.000Z');
  assert.equal(successor.statement.predecessor_head_digest, GENESIS_HEAD);
  assert.notEqual(successor.statement.source_head_digest, GENESIS_HEAD);
  assert.equal(result.mutation_command_digest, mutationCommand.command_digest);
  assert.equal(result.predecessor_checkpoint_digest, f.genesis.checkpoint_digest);
  assert.equal(result.resulting_checkpoint_digest, successor.checkpoint_digest);
  assert.equal(result.lifecycle_mutation_effect, 'currentness-transition-only');
  assert.equal(result.authority_relation_verified, false);
  assert.equal(result.execution_authority_granted, false);
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.delegation_effect, 'none');
  assert.equal(result.capability_promotion_effect, 'none');
  assert.equal(result.retention_claimed, false);
  assert.equal(result.global_currentness_claimed, false);
});

test('narrow mutation forces narrowed lifecycle denial state but does not claim subset semantics for opaque authority digests', () => {
  const f = fixture();
  const mutationCommand = command(f, {
    mutationKind: 'narrow',
    resultingAuthorityDigest: AUTHORITY_B
  });
  const result = apply(f, mutationCommand);
  assert.equal(result.checkpoint.statement.status, 'narrowed');
  assert.equal(result.checkpoint.statement.authority_digest, AUTHORITY_B);
  assert.equal(result.authority_relation_verified, false);
});

test('revoke compromise and expire are terminal lifecycle transitions and preserve the last authority digest', () => {
  for (const [index, mutationKind] of ['revoke', 'compromise', 'expire'].entries()) {
    const f = fixture();
    const mutationCommand = command(f, {
      commandId: `mutation.terminal.${index}`,
      mutationKind,
      resultingAuthorityDigest: AUTHORITY_A
    });
    const result = apply(f, mutationCommand);
    assert.equal(result.checkpoint.statement.status, mutationKind === 'expire' ? 'expired' : mutationKind === 'compromise' ? 'compromised' : 'revoked');
    assert.equal(result.checkpoint.statement.authority_digest, AUTHORITY_A);
  }
});

test('mutation authority and currentness checkpoint controller must be cryptographically distinct roles', () => {
  const f = fixture();
  const controllerSignedCommand = createMachinePrincipalCurrentnessMutationCommand({
    commandId: 'mutation.controller-substitution',
    mutationAuthorityId: 'authority.machine-lifecycle.local',
    mutationAuthorityPrivateKey: f.controller.privateKey,
    principalId: 'agent.parent.1',
    principalType: 'agent',
    predecessorCheckpointDigest: f.genesis.checkpoint_digest,
    expectedSuccessorSequence: 2,
    mutationKind: 'authority-update',
    resultingAuthorityDigest: AUTHORITY_B,
    issuedAt: '2026-09-01T17:00:01.000Z',
    effectiveAt: '2026-09-01T17:00:02.000Z',
    expiresAt: '2026-09-01T17:05:00.000Z'
  });

  assert.throws(
    () => apply(f, controllerSignedCommand),
    /(mutation authority key|signature|substitution)/i
  );

  const sameRole = fixture();
  const sameKeyCommand = createMachinePrincipalCurrentnessMutationCommand({
    commandId: 'mutation.same-key-role',
    mutationAuthorityId: 'authority.machine-lifecycle.local',
    mutationAuthorityPrivateKey: sameRole.controller.privateKey,
    principalId: 'agent.parent.1',
    principalType: 'agent',
    predecessorCheckpointDigest: sameRole.genesis.checkpoint_digest,
    expectedSuccessorSequence: 2,
    mutationKind: 'authority-update',
    resultingAuthorityDigest: AUTHORITY_B,
    issuedAt: '2026-09-01T17:00:01.000Z',
    effectiveAt: '2026-09-01T17:00:02.000Z',
    expiresAt: '2026-09-01T17:05:00.000Z'
  });
  assert.throws(
    () => applyMachinePrincipalCurrentnessMutation({
      mutationCommand: sameKeyCommand,
      trustedMutationAuthorityPublicKey: sameRole.controller.publicKey,
      retainedCheckpoint: sameRole.genesis,
      trustedCurrentnessControllerPublicKey: sameRole.controller.publicKey,
      currentnessControllerPrivateKey: sameRole.controller.privateKey
    }),
    /must be distinct/i
  );
});

test('stale predecessor or replay after head advancement fails closed', () => {
  const f = fixture();
  const firstCommand = command(f);
  const first = apply(f, firstCommand);

  assert.throws(
    () => applyMachinePrincipalCurrentnessMutation({
      mutationCommand: firstCommand,
      trustedMutationAuthorityPublicKey: f.mutationAuthority.publicKey,
      retainedCheckpoint: first.checkpoint,
      trustedCurrentnessControllerPublicKey: f.controller.publicKey,
      currentnessControllerPrivateKey: f.controller.privateKey
    }),
    /(predecessor checkpoint|successor sequence)/i
  );
});

test('expected successor sequence principal identity and effective chronology are bound exactly', () => {
  const f = fixture();
  assert.throws(
    () => apply(f, command(f, { expectedSuccessorSequence: 3 })),
    /successor sequence/i
  );
  assert.throws(
    () => apply(f, command(f, { principalId: 'agent.other.1' })),
    /principal/i
  );
  assert.throws(
    () => apply(f, command(f, { effectiveAt: '2026-09-01T17:00:00.000Z' })),
    /(advance|chronolog)/i
  );
  assert.throws(
    () => command(f, {
      issuedAt: '2026-09-01T17:00:03.000Z',
      effectiveAt: '2026-09-01T17:00:02.000Z'
    }),
    /effective_at/i
  );
  assert.throws(
    () => command(f, {
      effectiveAt: '2026-09-01T17:05:00.000Z',
      expiresAt: '2026-09-01T17:05:00.000Z'
    }),
    /effective_at/i
  );
});

test('authority-update and narrow reject no-op digests while terminal mutations reject authority-digest substitution', () => {
  const f = fixture();
  assert.throws(
    () => apply(f, command(f, { resultingAuthorityDigest: AUTHORITY_A })),
    /must change authority digest/i
  );
  assert.throws(
    () => apply(f, command(f, {
      mutationKind: 'narrow',
      resultingAuthorityDigest: AUTHORITY_A
    })),
    /must change authority digest/i
  );
  assert.throws(
    () => apply(f, command(f, {
      mutationKind: 'revoke',
      resultingAuthorityDigest: AUTHORITY_C
    })),
    /must preserve authority digest/i
  );
});

test('terminal retained lifecycle states cannot be reactivated or relabelled by a later mutation command', () => {
  const f = fixture();
  const revoked = apply(f, command(f, {
    mutationKind: 'revoke',
    resultingAuthorityDigest: AUTHORITY_A
  }));
  const second = createMachinePrincipalCurrentnessMutationCommand({
    commandId: 'mutation.reactivate',
    mutationAuthorityId: 'authority.machine-lifecycle.local',
    mutationAuthorityPrivateKey: f.mutationAuthority.privateKey,
    principalId: 'agent.parent.1',
    principalType: 'agent',
    predecessorCheckpointDigest: revoked.checkpoint.checkpoint_digest,
    expectedSuccessorSequence: 3,
    mutationKind: 'authority-update',
    resultingAuthorityDigest: AUTHORITY_B,
    issuedAt: '2026-09-01T17:00:03.000Z',
    effectiveAt: '2026-09-01T17:00:04.000Z',
    expiresAt: '2026-09-01T17:05:00.000Z'
  });

  assert.throws(
    () => applyMachinePrincipalCurrentnessMutation({
      mutationCommand: second,
      trustedMutationAuthorityPublicKey: f.mutationAuthority.publicKey,
      retainedCheckpoint: revoked.checkpoint,
      trustedCurrentnessControllerPublicKey: f.controller.publicKey,
      currentnessControllerPrivateKey: f.controller.privateKey
    }),
    /terminal/i
  );
});

test('command tamper and mutation-authority key substitution fail before transition production', () => {
  const f = fixture();
  const mutationCommand = command(f);
  const tampered = structuredClone(mutationCommand);
  tampered.statement.resulting_authority_digest = AUTHORITY_C;
  assert.throws(
    () => apply(f, tampered),
    /(statement digest|signature)/i
  );

  const wrongAuthority = keys();
  assert.throws(
    () => applyMachinePrincipalCurrentnessMutation({
      mutationCommand,
      trustedMutationAuthorityPublicKey: wrongAuthority.publicKey,
      retainedCheckpoint: f.genesis,
      trustedCurrentnessControllerPublicKey: f.controller.publicKey,
      currentnessControllerPrivateKey: f.controller.privateKey
    }),
    /(mutation authority key|substitution)/i
  );
});

test('causal source head binds predecessor command and resulting lifecycle state while result remains unretained', () => {
  const f = fixture();
  const first = apply(f, command(f));
  const second = apply(f, command(f, { commandId: 'mutation.currentness.2' }));

  assert.notEqual(first.mutation_command_digest, second.mutation_command_digest);
  assert.notEqual(first.checkpoint.statement.source_head_digest, second.checkpoint.statement.source_head_digest);
  assert.equal(first.retention_claimed, false);
  assert.equal(second.retention_claimed, false);
});
