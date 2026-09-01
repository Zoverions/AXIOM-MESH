// RED gate intentionally rerun after #1420 base parser repair; assertions unchanged.
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import {
  createMachinePrincipalCurrentnessCheckpoint
} from '../src/lib/machine-principal-currentness-checkpoint.mjs';
import {
  MACHINE_PRINCIPAL_CURRENTNESS_SCHEMA
} from '../src/lib/machine-principal-currentness.mjs';
import {
  evaluateMachineEffectCurrentnessCheckpointPrerequisite
} from '../src/lib/machine-effect-currentness-checkpoint-adapter.mjs';

const AUTHORITY_A = 'a'.repeat(64);
const AUTHORITY_B = 'b'.repeat(64);
const INTENT = 'c'.repeat(64);
const PLAN = 'd'.repeat(64);
const HEAD_1 = 'e'.repeat(64);
const HEAD_2 = 'f'.repeat(64);

function currentness({
  authorityDigest = AUTHORITY_A,
  status = 'active',
  sequence = 1,
  observedAt = '2026-09-01T17:00:00.000Z',
  sourceHeadDigest = HEAD_1,
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
  const controller = generateKeyPairSync('ed25519');
  const checkpoint = createMachinePrincipalCurrentnessCheckpoint({
    currentness: currentness(),
    controllerPrivateKey: controller.privateKey,
    trustedControllerPublicKey: controller.publicKey
  });
  return { controller, checkpoint };
}

function evaluate({ controller, checkpoint, retained = checkpoint, ...overrides }) {
  return evaluateMachineEffectCurrentnessCheckpointPrerequisite({
    currentnessCheckpoint: checkpoint,
    retainedLatestCheckpoint: retained,
    trustedControllerPublicKey: controller.publicKey,
    expectedPrincipalId: 'agent.parent.1',
    expectedPrincipalType: 'agent',
    expectedAuthorityDigest: AUTHORITY_A,
    capabilityId: 'capability.effect.1',
    intentDigest: INTENT,
    planDigest: PLAN,
    effectDestination: 'local',
    effectAt: '2026-09-01T17:00:05.000Z',
    maxEvidenceAgeMs: 10_000,
    ...overrides
  });
}

test('exact retained signed checkpoint satisfies only the currentness prerequisite for the exact pending effect', () => {
  const f = fixture();
  const result = evaluate(f);

  assert.equal(result.allow, true);
  assert.equal(result.code, 'machine_currentness_satisfied');
  assert.equal(result.currentness_checkpoint_digest, f.checkpoint.checkpoint_digest);
  assert.equal(result.currentness_sequence, 1);
  assert.equal(result.currentness_head_digest, HEAD_1);
  assert.match(result.admission_digest, /^[a-f0-9]{64}$/);
  assert.match(result.effect_currentness_evaluation_digest, /^[a-f0-9]{64}$/);
  assert.match(result.prerequisite_decision_digest, /^[a-f0-9]{64}$/);
  assert.equal(result.effect_execution_authorized, false);
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.delegation_effect, 'none');
  assert.equal(result.capability_promotion_effect, 'none');
  assert.equal(result.global_currentness_claimed, false);
});

test('older still-valid signed checkpoint is rejected when the retained latest head has advanced', () => {
  const f = fixture();
  const newer = createMachinePrincipalCurrentnessCheckpoint({
    currentness: currentness({
      authorityDigest: AUTHORITY_B,
      sequence: 2,
      observedAt: '2026-09-01T17:00:02.000Z',
      sourceHeadDigest: HEAD_2,
      predecessorHeadDigest: HEAD_1
    }),
    controllerPrivateKey: f.controller.privateKey,
    trustedControllerPublicKey: f.controller.publicKey
  });

  assert.throws(
    () => evaluate({ controller: f.controller, checkpoint: f.checkpoint, retained: newer }),
    /exact retained latest checkpoint/i
  );
});

test('newer signed checkpoint is also rejected until it is the independently retained latest head', () => {
  const f = fixture();
  const newer = createMachinePrincipalCurrentnessCheckpoint({
    currentness: currentness({
      sequence: 2,
      observedAt: '2026-09-01T17:00:02.000Z',
      sourceHeadDigest: HEAD_2,
      predecessorHeadDigest: HEAD_1
    }),
    controllerPrivateKey: f.controller.privateKey,
    trustedControllerPublicKey: f.controller.publicKey
  });

  assert.throws(
    () => evaluate({ controller: f.controller, checkpoint: newer, retained: f.checkpoint }),
    /exact retained latest checkpoint/i
  );
});

test('retained authority narrowing or replacement denies an effect authorized under the older digest', () => {
  const controller = generateKeyPairSync('ed25519');
  const checkpoint = createMachinePrincipalCurrentnessCheckpoint({
    currentness: currentness({ authorityDigest: AUTHORITY_B }),
    controllerPrivateKey: controller.privateKey,
    trustedControllerPublicKey: controller.publicKey
  });

  const result = evaluate({ controller, checkpoint });
  assert.equal(result.allow, false);
  assert.equal(result.code, 'machine_currentness_authority_changed');
  assert.equal(result.currentness_checkpoint_digest, checkpoint.checkpoint_digest);
  assert.equal(result.effect_currentness_evaluation_digest, null);
  assert.match(result.prerequisite_decision_digest, /^[a-f0-9]{64}$/);
  assert.equal(result.effect_execution_authorized, false);
});

test('retained revoked lifecycle state denies even when the historical authority digest still matches', () => {
  const controller = generateKeyPairSync('ed25519');
  const checkpoint = createMachinePrincipalCurrentnessCheckpoint({
    currentness: currentness({ status: 'revoked' }),
    controllerPrivateKey: controller.privateKey,
    trustedControllerPublicKey: controller.publicKey
  });

  const result = evaluate({ controller, checkpoint });
  assert.equal(result.allow, false);
  assert.equal(result.code, 'machine_currentness_revoked');
  assert.equal(result.effect_execution_authorized, false);
});

test('retained evidence outside the configured freshness bound denies', () => {
  const f = fixture();
  const result = evaluate({
    ...f,
    effectAt: '2026-09-01T17:00:20.001Z',
    maxEvidenceAgeMs: 10_000
  });
  assert.equal(result.allow, false);
  assert.equal(result.code, 'machine_currentness_stale');
});

test('pending admission binding changes when capability identity changes even against the same lifecycle head', () => {
  const f = fixture();
  const first = evaluate(f);
  const second = evaluate({ ...f, capabilityId: 'capability.effect.2' });

  assert.notEqual(first.admission_digest, second.admission_digest);
  assert.notEqual(first.prerequisite_decision_digest, second.prerequisite_decision_digest);
  assert.equal(first.currentness_checkpoint_digest, second.currentness_checkpoint_digest);
});

test('checkpoint tamper fails cryptographic verification before currentness evaluation', () => {
  const f = fixture();
  const tampered = structuredClone(f.checkpoint);
  tampered.statement.status = 'revoked';

  assert.throws(
    () => evaluate({ controller: f.controller, checkpoint: tampered, retained: tampered }),
    /(statement digest mismatch|signature)/i
  );
});
