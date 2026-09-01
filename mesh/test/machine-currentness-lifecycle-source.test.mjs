import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  createMachinePrincipalCurrentnessCheckpoint
} from '../src/lib/machine-principal-currentness-checkpoint.mjs';
import {
  openMachinePrincipalCurrentnessStore
} from '../src/lib/machine-principal-currentness-store.mjs';
import {
  createMachineCurrentnessMutationCommand
} from '../src/lib/machine-currentness-mutation-command.mjs';
import {
  applyMachinePrincipalCurrentnessMutation
} from '../src/lib/machine-currentness-lifecycle-source.mjs';
import {
  evaluateMachineEffectCurrentnessCheckpointPrerequisite
} from '../src/lib/machine-effect-currentness-checkpoint-adapter.mjs';

const AUTHORITY_A = 'a'.repeat(64);
const AUTHORITY_B = 'b'.repeat(64);
const AUTHORITY_C = 'c'.repeat(64);
const HEAD_1 = 'd'.repeat(64);

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'axiom-currentness-mutation-'));
  t.after(async () => rm(dir, { recursive: true, force: true }));

  const mutationAuthority = generateKeyPairSync('ed25519');
  const currentnessController = generateKeyPairSync('ed25519');
  const genesisState = {
    schema: 'axiom-machine-principal-currentness.v1',
    principal_id: 'agent.mutation.fixture',
    principal_type: 'agent',
    authority_digest: AUTHORITY_A,
    status: 'active',
    sequence: 1,
    observed_at: '2026-09-01T18:10:00.000Z',
    source_head_digest: HEAD_1,
    predecessor_head_digest: null,
    authority_effect: 'none',
    execution_authority_granted: false,
    global_currentness_claimed: false
  };
  const genesis = createMachinePrincipalCurrentnessCheckpoint({
    currentness: genesisState,
    controllerPrivateKey: currentnessController.privateKey,
    trustedControllerPublicKey: currentnessController.publicKey
  });
  const store = await openMachinePrincipalCurrentnessStore({
    statePath: join(dir, 'currentness.jsonl'),
    trustedControllerPublicKey: currentnessController.publicKey,
    expectedPrincipalId: 'agent.mutation.fixture',
    expectedPrincipalType: 'agent'
  });
  await store.retain(genesis);
  return {
    mutationAuthority,
    currentnessController,
    genesis,
    store
  };
}

function command(f, {
  commandId = 'mutation.fixture.1',
  mutationKind = 'authority-update',
  resultingAuthorityDigest = AUTHORITY_B,
  predecessorCheckpointDigest = f.store.retainedHead().checkpoint_digest,
  expectedSuccessorSequence = f.store.retainedHead().statement.sequence + 1,
  issuedAt = '2026-09-01T18:10:01.000Z',
  effectiveAt = '2026-09-01T18:10:02.000Z',
  expiresAt = '2026-09-01T18:11:00.000Z',
  reasonCode = 'policy-update',
  signer = f.mutationAuthority
} = {}) {
  return createMachineCurrentnessMutationCommand({
    commandId,
    principalId: 'agent.mutation.fixture',
    principalType: 'agent',
    predecessorCheckpointDigest,
    expectedSuccessorSequence,
    mutationKind,
    resultingAuthorityDigest,
    issuedAt,
    effectiveAt,
    expiresAt,
    reasonCode,
    mutationAuthorityPrivateKey: signer.privateKey,
    trustedMutationAuthorityPublicKey: signer.publicKey
  });
}

function adapter(controller, checkpoint, expectedAuthorityDigest = AUTHORITY_A) {
  return evaluateMachineEffectCurrentnessCheckpointPrerequisite({
    currentnessCheckpoint: checkpoint,
    retainedLatestCheckpoint: checkpoint,
    trustedControllerPublicKey: controller.publicKey,
    expectedPrincipalId: 'agent.mutation.fixture',
    expectedPrincipalType: 'agent',
    expectedAuthorityDigest,
    capabilityId: 'capability.pre-mutation.1',
    intentDigest: 'e'.repeat(64),
    planDigest: 'f'.repeat(64),
    effectDestination: 'local',
    effectAt: '2026-09-01T18:10:03.000Z',
    maxEvidenceAgeMs: 10_000
  });
}

test('authority update mutates retained lifecycle and old capability authority is denied by exact-retained adapter', async t => {
  const f = await fixture(t);
  const mutation = command(f);

  const applied = await applyMachinePrincipalCurrentnessMutation({
    currentnessStore: f.store,
    mutationCommand: mutation,
    trustedMutationAuthorityPublicKey: f.mutationAuthority.publicKey,
    currentnessControllerPrivateKey: f.currentnessController.privateKey,
    trustedCurrentnessControllerPublicKey: f.currentnessController.publicKey,
    at: '2026-09-01T18:10:02.000Z'
  });

  assert.equal(applied.valid, true);
  assert.equal(applied.successor_sequence, 2);
  assert.equal(applied.resulting_authority_digest, AUTHORITY_B);
  assert.equal(applied.resulting_status, 'active');
  assert.equal(
    f.store.retainedHead().checkpoint_digest,
    applied.successor_checkpoint_digest
  );

  const oldAuthorityDecision = adapter(
    f.currentnessController,
    applied.successor_checkpoint,
    AUTHORITY_A
  );
  assert.equal(oldAuthorityDecision.allow, false);
  assert.equal(
    oldAuthorityDecision.code,
    'machine_currentness_authority_changed'
  );
  assert.equal(oldAuthorityDecision.effect_execution_authorized, false);

  const newAuthorityDecision = adapter(
    f.currentnessController,
    applied.successor_checkpoint,
    AUTHORITY_B
  );
  assert.equal(newAuthorityDecision.allow, true);
  assert.equal(newAuthorityDecision.effect_execution_authorized, false);
});

test('revocation becomes retained terminal state and matching historical authority still cannot satisfy effect currentness', async t => {
  const f = await fixture(t);
  const mutation = command(f, {
    mutationKind: 'revoke',
    resultingAuthorityDigest: AUTHORITY_A,
    reasonCode: 'operator-revocation'
  });
  const applied = await applyMachinePrincipalCurrentnessMutation({
    currentnessStore: f.store,
    mutationCommand: mutation,
    trustedMutationAuthorityPublicKey: f.mutationAuthority.publicKey,
    currentnessControllerPrivateKey: f.currentnessController.privateKey,
    trustedCurrentnessControllerPublicKey: f.currentnessController.publicKey,
    at: '2026-09-01T18:10:02.000Z'
  });
  assert.equal(applied.resulting_status, 'revoked');

  const decision = adapter(
    f.currentnessController,
    applied.successor_checkpoint,
    AUTHORITY_A
  );
  assert.equal(decision.allow, false);
  assert.equal(decision.code, 'machine_currentness_revoked');

  const laterCommand = command(f, {
    commandId: 'mutation.fixture.reactivate',
    mutationKind: 'authority-update',
    resultingAuthorityDigest: AUTHORITY_C,
    issuedAt: '2026-09-01T18:10:03.000Z',
    effectiveAt: '2026-09-01T18:10:04.000Z',
    expiresAt: '2026-09-01T18:11:00.000Z'
  });
  await assert.rejects(
    applyMachinePrincipalCurrentnessMutation({
      currentnessStore: f.store,
      mutationCommand: laterCommand,
      trustedMutationAuthorityPublicKey: f.mutationAuthority.publicKey,
      currentnessControllerPrivateKey: f.currentnessController.privateKey,
      trustedCurrentnessControllerPublicKey: f.currentnessController.publicKey,
      at: '2026-09-01T18:10:04.000Z'
    }),
    /terminal lifecycle state cannot be reactivated|terminal/i
  );
});

test('stale mutation command fails closed after retained head advances', async t => {
  const f = await fixture(t);
  const stale = command(f, {
    commandId: 'mutation.fixture.stale'
  });
  const first = command(f, {
    commandId: 'mutation.fixture.first'
  });
  await applyMachinePrincipalCurrentnessMutation({
    currentnessStore: f.store,
    mutationCommand: first,
    trustedMutationAuthorityPublicKey: f.mutationAuthority.publicKey,
    currentnessControllerPrivateKey: f.currentnessController.privateKey,
    trustedCurrentnessControllerPublicKey: f.currentnessController.publicKey,
    at: '2026-09-01T18:10:02.000Z'
  });

  await assert.rejects(
    applyMachinePrincipalCurrentnessMutation({
      currentnessStore: f.store,
      mutationCommand: stale,
      trustedMutationAuthorityPublicKey: f.mutationAuthority.publicKey,
      currentnessControllerPrivateKey: f.currentnessController.privateKey,
      trustedCurrentnessControllerPublicKey: f.currentnessController.publicKey,
      at: '2026-09-01T18:10:03.000Z'
    }),
    /predecessor checkpoint mismatch|successor sequence mismatch/i
  );
});

test('currentness controller key cannot substitute for mutation authority', async t => {
  const f = await fixture(t);
  const unauthorized = command(f, {
    signer: f.currentnessController
  });

  await assert.rejects(
    applyMachinePrincipalCurrentnessMutation({
      currentnessStore: f.store,
      mutationCommand: unauthorized,
      trustedMutationAuthorityPublicKey: f.mutationAuthority.publicKey,
      currentnessControllerPrivateKey: f.currentnessController.privateKey,
      trustedCurrentnessControllerPublicKey: f.currentnessController.publicKey,
      at: '2026-09-01T18:10:02.000Z'
    }),
    /mutation authority key mismatch|signature verification|authority key/i
  );
});

test('narrow mutation must actually change authority and resulting source head causally changes with command digest', async t => {
  const f = await fixture(t);
  const invalid = command(f, {
    mutationKind: 'narrow',
    resultingAuthorityDigest: AUTHORITY_A,
    reasonCode: 'no-op-narrow'
  });
  await assert.rejects(
    applyMachinePrincipalCurrentnessMutation({
      currentnessStore: f.store,
      mutationCommand: invalid,
      trustedMutationAuthorityPublicKey: f.mutationAuthority.publicKey,
      currentnessControllerPrivateKey: f.currentnessController.privateKey,
      trustedCurrentnessControllerPublicKey: f.currentnessController.publicKey,
      at: '2026-09-01T18:10:02.000Z'
    }),
    /narrow mutation must change the authority digest/
  );

  const valid = command(f, {
    mutationKind: 'narrow',
    resultingAuthorityDigest: AUTHORITY_B,
    reasonCode: 'reduce-scope'
  });
  const applied = await applyMachinePrincipalCurrentnessMutation({
    currentnessStore: f.store,
    mutationCommand: valid,
    trustedMutationAuthorityPublicKey: f.mutationAuthority.publicKey,
    currentnessControllerPrivateKey: f.currentnessController.privateKey,
    trustedCurrentnessControllerPublicKey: f.currentnessController.publicKey,
    at: '2026-09-01T18:10:02.000Z'
  });
  assert.equal(applied.resulting_status, 'narrowed');
  assert.notEqual(
    applied.successor_source_head_digest,
    f.genesis.statement.source_head_digest
  );
  assert.equal(applied.authority_effect, 'none');
  assert.equal(applied.execution_authority_granted, false);
  assert.equal(applied.delegation_effect, 'none');
});

test('mutation effective time, command validity, predecessor and successor sequence all fail closed', async t => {
  const f = await fixture(t);

  const beforePriorObservation = command(f, {
    issuedAt: '2026-09-01T18:09:58.000Z',
    effectiveAt: '2026-09-01T18:09:59.000Z',
    expiresAt: '2026-09-01T18:11:00.000Z'
  });
  await assert.rejects(
    applyMachinePrincipalCurrentnessMutation({
      currentnessStore: f.store,
      mutationCommand: beforePriorObservation,
      trustedMutationAuthorityPublicKey: f.mutationAuthority.publicKey,
      currentnessControllerPrivateKey: f.currentnessController.privateKey,
      trustedCurrentnessControllerPublicKey: f.currentnessController.publicKey,
      at: '2026-09-01T18:10:00.000Z'
    }),
    /effective time must advance after retained observation/
  );

  const wrongSequence = command(f, {
    expectedSuccessorSequence: 3
  });
  await assert.rejects(
    applyMachinePrincipalCurrentnessMutation({
      currentnessStore: f.store,
      mutationCommand: wrongSequence,
      trustedMutationAuthorityPublicKey: f.mutationAuthority.publicKey,
      currentnessControllerPrivateKey: f.currentnessController.privateKey,
      trustedCurrentnessControllerPublicKey: f.currentnessController.publicKey,
      at: '2026-09-01T18:10:02.000Z'
    }),
    /successor sequence mismatch/
  );

  const expired = command(f, {
    expiresAt: '2026-09-01T18:10:02.000Z'
  });
  await assert.rejects(
    applyMachinePrincipalCurrentnessMutation({
      currentnessStore: f.store,
      mutationCommand: expired,
      trustedMutationAuthorityPublicKey: f.mutationAuthority.publicKey,
      currentnessControllerPrivateKey: f.currentnessController.privateKey,
      trustedCurrentnessControllerPublicKey: f.currentnessController.publicKey,
      at: '2026-09-01T18:10:02.001Z'
    }),
    /expired/
  );
});


test('narrowed state cannot reactivate through authority-update', async t => {
  const f = await fixture(t);
  const narrow = command(f, {
    commandId: 'mutation.fixture.narrow-first',
    mutationKind: 'narrow',
    resultingAuthorityDigest: AUTHORITY_B,
    reasonCode: 'reduce-scope'
  });
  await applyMachinePrincipalCurrentnessMutation({
    currentnessStore: f.store,
    mutationCommand: narrow,
    trustedMutationAuthorityPublicKey: f.mutationAuthority.publicKey,
    currentnessControllerPrivateKey: f.currentnessController.privateKey,
    trustedCurrentnessControllerPublicKey: f.currentnessController.publicKey,
    at: '2026-09-01T18:10:02.000Z'
  });

  const reactivate = command(f, {
    commandId: 'mutation.fixture.reactivate-from-narrow',
    mutationKind: 'authority-update',
    resultingAuthorityDigest: AUTHORITY_C,
    issuedAt: '2026-09-01T18:10:03.000Z',
    effectiveAt: '2026-09-01T18:10:04.000Z',
    expiresAt: '2026-09-01T18:11:00.000Z',
    reasonCode: 'attempt-reactivation'
  });
  await assert.rejects(
    applyMachinePrincipalCurrentnessMutation({
      currentnessStore: f.store,
      mutationCommand: reactivate,
      trustedMutationAuthorityPublicKey: f.mutationAuthority.publicKey,
      currentnessControllerPrivateKey: f.currentnessController.privateKey,
      trustedCurrentnessControllerPublicKey: f.currentnessController.publicKey,
      at: '2026-09-01T18:10:04.000Z'
    }),
    /authority-update is permitted only from active to active/
  );
});


test('terminal revoke compromise and expire preserve the last authority digest', async t => {
  for (const mutationKind of ['revoke', 'compromise', 'expire']) {
    await t.test(mutationKind, async st => {
      const f = await fixture(st);
      const mutation = command(f, {
        commandId: `mutation.fixture.terminal-${mutationKind}`,
        mutationKind,
        resultingAuthorityDigest: AUTHORITY_B,
        reasonCode: 'terminal-transition'
      });
      await assert.rejects(
        applyMachinePrincipalCurrentnessMutation({
          currentnessStore: f.store,
          mutationCommand: mutation,
          trustedMutationAuthorityPublicKey: f.mutationAuthority.publicKey,
          currentnessControllerPrivateKey: f.currentnessController.privateKey,
          trustedCurrentnessControllerPublicKey: f.currentnessController.publicKey,
          at: '2026-09-01T18:10:02.000Z'
        }),
        /must preserve the last authority digest/
      );
    });
  }
});

test('mutation authority and checkpoint controller must remain cryptographically distinct roles', async t => {
  const f = await fixture(t);
  const sameKeyMutation = createMachineCurrentnessMutationCommand({
    commandId: 'mutation.fixture.same-key-role',
    principalId: 'agent.mutation.fixture',
    principalType: 'agent',
    predecessorCheckpointDigest: f.store.retainedHead().checkpoint_digest,
    expectedSuccessorSequence: 2,
    mutationKind: 'authority-update',
    resultingAuthorityDigest: AUTHORITY_B,
    issuedAt: '2026-09-01T18:10:01.000Z',
    effectiveAt: '2026-09-01T18:10:02.000Z',
    expiresAt: '2026-09-01T18:11:00.000Z',
    reasonCode: 'same-key-role',
    mutationAuthorityPrivateKey: f.currentnessController.privateKey,
    trustedMutationAuthorityPublicKey: f.currentnessController.publicKey
  });

  await assert.rejects(
    applyMachinePrincipalCurrentnessMutation({
      currentnessStore: f.store,
      mutationCommand: sameKeyMutation,
      trustedMutationAuthorityPublicKey: f.currentnessController.publicKey,
      currentnessControllerPrivateKey: f.currentnessController.privateKey,
      trustedCurrentnessControllerPublicKey: f.currentnessController.publicKey,
      at: '2026-09-01T18:10:02.000Z'
    }),
    /must be distinct/
  );
});
