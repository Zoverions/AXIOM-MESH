import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import { normalizeMachinePrincipalDefinition } from '../src/lib/machine-principal.mjs';
import {
  createMachineAuthorityCurrentnessCheckpoint,
  evaluateMachineAuthorityCurrentnessAtEffect,
  verifyMachineAuthorityCurrentnessCheckpointChain
} from '../src/lib/machine-authority-currentness-checkpoint.mjs';

const HUMANS = new Set(['owner.authority-currentness']);
const T0 = '2026-09-01T14:00:00.000Z';
const T1 = '2026-09-01T14:00:10.000Z';
const T2 = '2026-09-01T14:00:20.000Z';
const T3 = '2026-09-01T14:00:30.000Z';

function principal(overrides = {}) {
  return normalizeMachinePrincipalDefinition({
    id: 'agent.authority-currentness.1',
    type: 'agent',
    sponsor: 'owner.authority-currentness',
    roles: ['researcher'],
    scopes: ['intent:execute'],
    lifetime: 'session',
    expires_at: '2026-10-01T00:00:00.000Z',
    runtime: {
      id: 'runtime.authority-currentness.1',
      kind: 'local-process',
      software_digest: 'b'.repeat(64)
    },
    constraints: {
      actions: ['system.echo'],
      purposes: ['test.conformance'],
      destinations: ['local'],
      budgets: {
        max_requests_per_minute: 10,
        max_concurrent_requests: 1,
        max_execution_ms: 5_000,
        max_request_bytes: 65_536,
        max_response_bytes: 262_144
      },
      delegation: { allowed: false, max_depth: 0 }
    },
    ...overrides
  }, {
    knownHumanPrincipals: HUMANS,
    now: new Date('2026-09-01T13:00:00.000Z')
  });
}

function signer() {
  return generateKeyPairSync('ed25519');
}

test('signed authority-currentness checkpoint exposes one exact active authority digest without granting authorization', () => {
  const root = signer();
  const p = principal();
  const checkpoint = createMachineAuthorityCurrentnessCheckpoint({
    checkpointId: 'machine-authority-currentness.1',
    checkpointSequence: 1,
    authoritySourceId: 'authority-source.test.1',
    authoritySourcePrivateKey: root.privateKey,
    principalId: p.id,
    currentAuthorityDigest: p.authority_digest,
    evaluatedAt: T1
  });

  const current = evaluateMachineAuthorityCurrentnessAtEffect({
    checkpoint,
    trustedAuthoritySourcePublicKey: root.publicKey,
    expectedLatestCheckpointDigest: checkpoint.checkpoint_digest,
    effectAt: T2,
    maxEvidenceAgeMs: 30_000
  });

  assert.equal(current.known_current_under_signed_authority_head, true);
  assert.equal(current.principal_id, p.id);
  assert.equal(current.current_authority_digest, p.authority_digest);
  assert.equal(current.effect_at, T2);
  assert.equal(current.effect_admission_authorized, false);
  assert.equal(current.identity_currentness_claimed, false);
  assert.equal(current.authorization_policy_evaluated, false);
  assert.equal(current.authority_effect, 'none');
});

test('authority-currentness chain permits authority replacement while preserving append-only provenance', () => {
  const root = signer();
  const original = principal();
  const narrowed = principal({ scopes: ['intent:execute:limited'] });
  assert.notEqual(original.authority_digest, narrowed.authority_digest);

  const first = createMachineAuthorityCurrentnessCheckpoint({
    checkpointId: 'machine-authority-currentness.1',
    checkpointSequence: 1,
    authoritySourceId: 'authority-source.test.1',
    authoritySourcePrivateKey: root.privateKey,
    principalId: original.id,
    currentAuthorityDigest: original.authority_digest,
    evaluatedAt: T0
  });
  const second = createMachineAuthorityCurrentnessCheckpoint({
    checkpointId: 'machine-authority-currentness.2',
    checkpointSequence: 2,
    previousCheckpoint: first,
    authoritySourceId: 'authority-source.test.1',
    authoritySourcePrivateKey: root.privateKey,
    principalId: original.id,
    currentAuthorityDigest: narrowed.authority_digest,
    evaluatedAt: T1
  });

  const chain = verifyMachineAuthorityCurrentnessCheckpointChain([first, second], {
    trustedAuthoritySourcePublicKey: root.publicKey
  });
  assert.equal(chain.length, 2);
  assert.equal(chain[1].statement.current_authority_digest, narrowed.authority_digest);

  const current = evaluateMachineAuthorityCurrentnessAtEffect({
    checkpoint: second,
    trustedAuthoritySourcePublicKey: root.publicKey,
    expectedLatestCheckpointDigest: second.checkpoint_digest,
    effectAt: T2
  });
  assert.equal(current.current_authority_digest, narrowed.authority_digest);

  assert.throws(
    () => evaluateMachineAuthorityCurrentnessAtEffect({
      checkpoint: first,
      trustedAuthoritySourcePublicKey: root.publicKey,
      expectedLatestCheckpointDigest: second.checkpoint_digest,
      effectAt: T2
    }),
    /not the expected retained latest authority head/
  );
});

test('authority-currentness revocation is terminal for a new effect at that checkpoint head', () => {
  const root = signer();
  const p = principal();
  const first = createMachineAuthorityCurrentnessCheckpoint({
    checkpointId: 'machine-authority-currentness.1',
    checkpointSequence: 1,
    authoritySourceId: 'authority-source.test.1',
    authoritySourcePrivateKey: root.privateKey,
    principalId: p.id,
    currentAuthorityDigest: p.authority_digest,
    evaluatedAt: T0
  });
  const revoked = createMachineAuthorityCurrentnessCheckpoint({
    checkpointId: 'machine-authority-currentness.2',
    checkpointSequence: 2,
    previousCheckpoint: first,
    authoritySourceId: 'authority-source.test.1',
    authoritySourcePrivateKey: root.privateKey,
    principalId: p.id,
    currentAuthorityDigest: null,
    reasonCode: 'operator-revoked',
    evaluatedAt: T2
  });

  assert.throws(
    () => evaluateMachineAuthorityCurrentnessAtEffect({
      checkpoint: revoked,
      trustedAuthoritySourcePublicKey: root.publicKey,
      expectedLatestCheckpointDigest: revoked.checkpoint_digest,
      effectAt: T3
    }),
    /authority is revoked; new effect denied/
  );
});

test('authority-currentness evidence fails closed when stale', () => {
  const root = signer();
  const p = principal();
  const checkpoint = createMachineAuthorityCurrentnessCheckpoint({
    checkpointId: 'machine-authority-currentness.1',
    checkpointSequence: 1,
    authoritySourceId: 'authority-source.test.1',
    authoritySourcePrivateKey: root.privateKey,
    principalId: p.id,
    currentAuthorityDigest: p.authority_digest,
    evaluatedAt: T0
  });

  assert.throws(
    () => evaluateMachineAuthorityCurrentnessAtEffect({
      checkpoint,
      trustedAuthoritySourcePublicKey: root.publicKey,
      expectedLatestCheckpointDigest: checkpoint.checkpoint_digest,
      effectAt: T3,
      maxEvidenceAgeMs: 5_000
    }),
    /authority currentness evidence is too stale/
  );
});
