import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import {
  assertMachineCurrentnessControllerKeyUsableAt,
  createMachineCurrentnessControllerKeyCredential,
  createMachineCurrentnessControllerKeyRevocation,
  machineCurrentnessControllerKeyId,
  validateMachineCurrentnessControllerKeyPath,
  validateMachineCurrentnessControllerKeyTransition,
  verifyMachineCurrentnessControllerKeyCredential,
  verifyMachineCurrentnessControllerKeyRevocation
} from '../src/lib/machine-currentness-controller-key-lifecycle.mjs';

function keys() {
  return generateKeyPairSync('ed25519');
}

function initial(root, operational, activatedAt = '2026-09-01T16:00:00.000Z') {
  return createMachineCurrentnessControllerKeyCredential({
    principalId: 'controller.machine-currentness.1',
    rootPrivateKey: root.privateKey,
    trustedRootPublicKey: root.publicKey,
    operationalPublicKey: operational.publicKey,
    keyEpoch: 1,
    activatedAt
  });
}

test('controller credential authorizes only currentness-evidence signing and never an effect', () => {
  const root = keys();
  const operational = keys();
  const credential = initial(root, operational);
  const verified = verifyMachineCurrentnessControllerKeyCredential(credential, {
    trustedRootPublicKey: root.publicKey,
    expectedDomainId: 'axiom.machine-currentness.v1',
    expectedPrincipalId: 'controller.machine-currentness.1'
  });
  assert.equal(
    verified.statement.authority_scope,
    'sign-machine-principal-currentness-checkpoints'
  );
  assert.equal(
    verified.statement.authority_effect,
    'authorize-currentness-evidence-signing-only'
  );
  assert.equal(verified.statement.execution_authority_granted, false);
  assert.equal(verified.statement.capability_promotion_effect, 'none');
  assert.equal(verified.statement.delegation_effect, 'none');
  assert.equal(verified.statement.identity_effect, 'none');
  assert.equal(verified.statement.global_currentness_claimed, false);
  assert.equal(
    verified.statement.operational_key_id,
    machineCurrentnessControllerKeyId(operational.publicKey)
  );
});

test('routine controller rotation advances one epoch and makes predecessor stale at activation', () => {
  const root = keys();
  const firstKey = keys();
  const secondKey = keys();
  const first = initial(root, firstKey);
  const second = createMachineCurrentnessControllerKeyCredential({
    principalId: 'controller.machine-currentness.1',
    rootPrivateKey: root.privateKey,
    trustedRootPublicKey: root.publicKey,
    operationalPublicKey: secondKey.publicKey,
    keyEpoch: 2,
    activatedAt: '2026-09-01T16:10:00.000Z',
    transitionKind: 'rotation',
    predecessorCredential: first,
    predecessorDisposition: 'retired'
  });

  const transition = validateMachineCurrentnessControllerKeyTransition(first, second, {
    trustedRootPublicKey: root.publicKey
  });
  assert.equal(transition.previous_epoch, 1);
  assert.equal(transition.current_epoch, 2);
  assert.equal(transition.predecessor_disposition, 'retired');
  assert.equal(transition.execution_authority_granted, false);

  assert.equal(validateMachineCurrentnessControllerKeyPath([first, second], {
    trustedRootPublicKey: root.publicKey,
    expectedDomainId: 'axiom.machine-currentness.v1',
    expectedPrincipalId: 'controller.machine-currentness.1'
  }).last_epoch, 2);

  assert.equal(assertMachineCurrentnessControllerKeyUsableAt(first, {
    trustedRootPublicKey: root.publicKey,
    at: '2026-09-01T16:09:59.999Z',
    successorCredential: second
  }).valid, true);

  assert.throws(() => assertMachineCurrentnessControllerKeyUsableAt(first, {
    trustedRootPublicKey: root.publicKey,
    at: '2026-09-01T16:10:00.000Z',
    successorCredential: second
  }), /stale after successor activation/);
});

test('compromise revocation blocks controller key and recovery requires a new operational key', () => {
  const root = keys();
  const compromised = keys();
  const recovered = keys();
  const first = initial(root, compromised);
  const revocation = createMachineCurrentnessControllerKeyRevocation(first, {
    trustedRootPublicKey: root.publicKey,
    rootPrivateKey: root.privateKey,
    effectiveAt: '2026-09-01T16:05:00.000Z',
    reasonCode: 'compromised'
  });

  assert.equal(verifyMachineCurrentnessControllerKeyRevocation(revocation, {
    trustedRootPublicKey: root.publicKey,
    credential: first
  }).statement.execution_authority_granted, false);

  assert.throws(() => assertMachineCurrentnessControllerKeyUsableAt(first, {
    trustedRootPublicKey: root.publicKey,
    at: '2026-09-01T16:05:00.000Z',
    revocation
  }), /revoked at requested time/);

  const second = createMachineCurrentnessControllerKeyCredential({
    principalId: 'controller.machine-currentness.1',
    rootPrivateKey: root.privateKey,
    trustedRootPublicKey: root.publicKey,
    operationalPublicKey: recovered.publicKey,
    keyEpoch: 2,
    activatedAt: '2026-09-01T16:06:00.000Z',
    transitionKind: 'recovery',
    predecessorCredential: first,
    predecessorDisposition: 'compromised'
  });
  assert.equal(validateMachineCurrentnessControllerKeyTransition(first, second, {
    trustedRootPublicKey: root.publicKey
  }).transition_kind, 'recovery');
});

test('root, domain, principal and operational key substitution fail closed', () => {
  const root = keys();
  const otherRoot = keys();
  const operational = keys();
  const credential = initial(root, operational);

  assert.throws(() => verifyMachineCurrentnessControllerKeyCredential(credential, {
    trustedRootPublicKey: otherRoot.publicKey
  }), /root key substitution|signature/);

  assert.throws(() => verifyMachineCurrentnessControllerKeyCredential(credential, {
    trustedRootPublicKey: root.publicKey,
    expectedDomainId: 'other.domain'
  }), /different domain/);

  assert.throws(() => verifyMachineCurrentnessControllerKeyCredential(credential, {
    trustedRootPublicKey: root.publicKey,
    expectedPrincipalId: 'controller.other'
  }), /different principal/);

  assert.throws(() => createMachineCurrentnessControllerKeyCredential({
    principalId: 'controller.machine-currentness.1',
    rootPrivateKey: root.privateKey,
    operationalPublicKey: operational.publicKey,
    keyEpoch: 2,
    activatedAt: '2026-09-01T16:10:00.000Z',
    transitionKind: 'rotation',
    predecessorCredential: credential,
    predecessorDisposition: 'retired'
  }), /must change operational key/);
});

test('controller usage result stays evidence-signing-only and makes no global-currentness claim', () => {
  const root = keys();
  const operational = keys();
  const credential = initial(root, operational);
  const usage = assertMachineCurrentnessControllerKeyUsableAt(credential, {
    trustedRootPublicKey: root.publicKey,
    at: '2026-09-01T16:01:00.000Z'
  });
  assert.equal(usage.currentness_evidence_signing_only, true);
  assert.equal(usage.execution_authority_granted, false);
  assert.equal(usage.global_currentness_claimed, false);
});
