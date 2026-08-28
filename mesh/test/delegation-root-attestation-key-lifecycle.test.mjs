import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import { DELEGATION_ROOT_BINDING_SCHEMA } from '../src/lib/delegation-ledger.mjs';
import {
  createDelegationRootAttestation,
  delegationRootAttestationKeyId
} from '../src/lib/delegation-root-attestation.mjs';

const ACTIVATED = '2026-08-28T04:00:00.000Z';
const ROTATED = '2026-08-28T04:10:00.000Z';

function keys() {
  return generateKeyPairSync('ed25519');
}

function rootBinding({ holder = 'owner.alice', authorityDigest = 'a'.repeat(64) } = {}) {
  const core = {
    schema: DELEGATION_ROOT_BINDING_SCHEMA,
    root_holder: holder,
    root_authority_digest: authorityDigest,
    execution_authority_granted: false,
    authority_effect: 'none'
  };
  return { ...core, binding_digest: digestObject(core) };
}

async function lifecycle() {
  try {
    return await import('../src/lib/delegation-root-attestation-key-lifecycle.mjs');
  } catch (error) {
    assert.fail(`delegation root attestation key lifecycle module must exist: ${error.message}`);
  }
}

async function initialCredential({ binding, controller, operational, activatedAt = ACTIVATED }) {
  const {
    createDelegationRootAttestationKeyCredential
  } = await lifecycle();
  return createDelegationRootAttestationKeyCredential({
    rootBinding: binding,
    controllerPrivateKey: controller.privateKey,
    operationalPublicKey: operational.publicKey,
    keyEpoch: 1,
    activatedAt
  });
}

test('controller credentials authorize only evidence signing for the exact bound root', async () => {
  const binding = rootBinding();
  const controller = keys();
  const operational = keys();
  const {
    DELEGATION_ROOT_ATTESTATION_KEY_CREDENTIAL_SCHEMA,
    delegationRootAttestationOperationalKeyId,
    verifyDelegationRootAttestationKeyCredential
  } = await lifecycle();
  const credential = await initialCredential({ binding, controller, operational });
  const verified = verifyDelegationRootAttestationKeyCredential(credential, {
    trustedControllerPublicKey: controller.publicKey,
    expectedRootBindingDigest: binding.binding_digest,
    expectedRootAuthorityDigest: binding.root_authority_digest,
    expectedRootHolder: binding.root_holder
  });

  assert.equal(credential.schema, DELEGATION_ROOT_ATTESTATION_KEY_CREDENTIAL_SCHEMA);
  assert.equal(verified.statement.root_binding_digest, binding.binding_digest);
  assert.equal(verified.statement.root_authority_digest, binding.root_authority_digest);
  assert.equal(verified.statement.root_holder, binding.root_holder);
  assert.equal(
    verified.statement.operational_key_id,
    delegationRootAttestationOperationalKeyId(operational.publicKey)
  );
  assert.equal(verified.statement.key_epoch, 1);
  assert.equal(verified.statement.transition_kind, 'initial');
  assert.equal(verified.statement.attestation_scope, 'delegation-root-binding');
  assert.equal(verified.statement.attestation_effect, 'authorize-evidence-signing-only');
  assert.equal(verified.statement.authority_effect, 'none');
  assert.equal(verified.statement.delegation_effect, 'none');
  assert.equal(verified.statement.execution_authority_granted, false);
  assert.equal(verified.statement.capability_promotion_effect, 'none');
  assert.equal(verified.statement.global_currentness_claimed, false);
  assert.equal(verified.statement.network_effect, 'none');
});

test('routine rotation advances exactly one epoch, chains predecessor, and retires old key', async () => {
  const binding = rootBinding();
  const controller = keys();
  const firstKey = keys();
  const secondKey = keys();
  const {
    createDelegationRootAttestationKeyCredential,
    validateDelegationRootAttestationKeyCredentialPath,
    validateDelegationRootAttestationKeyCredentialTransition,
    assertDelegationRootAttestationKeyUsableAt
  } = await lifecycle();
  const first = await initialCredential({ binding, controller, operational: firstKey });
  const second = createDelegationRootAttestationKeyCredential({
    rootBinding: binding,
    controllerPrivateKey: controller.privateKey,
    operationalPublicKey: secondKey.publicKey,
    keyEpoch: 2,
    activatedAt: ROTATED,
    transitionKind: 'rotation',
    predecessorCredential: first,
    predecessorDisposition: 'retired'
  });

  const transition = validateDelegationRootAttestationKeyCredentialTransition(first, second, {
    trustedControllerPublicKey: controller.publicKey
  });
  assert.equal(transition.previous_epoch, 1);
  assert.equal(transition.current_epoch, 2);
  assert.equal(transition.predecessor_disposition, 'retired');
  assert.equal(validateDelegationRootAttestationKeyCredentialPath([first, second], {
    trustedControllerPublicKey: controller.publicKey,
    expectedRootBindingDigest: binding.binding_digest
  }).last_epoch, 2);
  assert.equal(assertDelegationRootAttestationKeyUsableAt(first, {
    trustedControllerPublicKey: controller.publicKey,
    at: '2026-08-28T04:09:59.999Z',
    successorCredential: second
  }).valid, true);
  assert.throws(() => assertDelegationRootAttestationKeyUsableAt(first, {
    trustedControllerPublicKey: controller.publicKey,
    at: ROTATED,
    successorCredential: second
  }), /stale after successor activation/i);
});

test('recovery requires a revoked or compromised predecessor and changes operational key', async () => {
  const binding = rootBinding();
  const controller = keys();
  const firstKey = keys();
  const recoveredKey = keys();
  const {
    createDelegationRootAttestationKeyCredential,
    validateDelegationRootAttestationKeyCredentialTransition
  } = await lifecycle();
  const first = await initialCredential({ binding, controller, operational: firstKey });

  assert.throws(() => createDelegationRootAttestationKeyCredential({
    rootBinding: binding,
    controllerPrivateKey: controller.privateKey,
    operationalPublicKey: recoveredKey.publicKey,
    keyEpoch: 2,
    activatedAt: '2026-08-28T04:06:00.000Z',
    transitionKind: 'recovery',
    predecessorCredential: first,
    predecessorDisposition: 'retired'
  }), /recovery.*revoked|recovery.*compromised/i);

  const recovered = createDelegationRootAttestationKeyCredential({
    rootBinding: binding,
    controllerPrivateKey: controller.privateKey,
    operationalPublicKey: recoveredKey.publicKey,
    keyEpoch: 2,
    activatedAt: '2026-08-28T04:06:00.000Z',
    transitionKind: 'recovery',
    predecessorCredential: first,
    predecessorDisposition: 'compromised'
  });
  assert.equal(validateDelegationRootAttestationKeyCredentialTransition(first, recovered, {
    trustedControllerPublicKey: controller.publicKey
  }).transition_kind, 'recovery');
});

test('credential paths fail closed on truncation, epoch gaps, key reuse, and cross-root replay', async () => {
  const binding = rootBinding();
  const otherBinding = rootBinding({ holder: 'owner.bob', authorityDigest: 'b'.repeat(64) });
  const controller = keys();
  const firstKey = keys();
  const secondKey = keys();
  const {
    createDelegationRootAttestationKeyCredential,
    validateDelegationRootAttestationKeyCredentialPath,
    verifyDelegationRootAttestationKeyCredential
  } = await lifecycle();
  const first = await initialCredential({ binding, controller, operational: firstKey });
  const second = createDelegationRootAttestationKeyCredential({
    rootBinding: binding,
    controllerPrivateKey: controller.privateKey,
    operationalPublicKey: secondKey.publicKey,
    keyEpoch: 2,
    activatedAt: ROTATED,
    transitionKind: 'rotation',
    predecessorCredential: first,
    predecessorDisposition: 'retired'
  });

  assert.throws(() => validateDelegationRootAttestationKeyCredentialPath([second], {
    trustedControllerPublicKey: controller.publicKey
  }), /begin at epoch 1|truncat/i);
  assert.throws(() => createDelegationRootAttestationKeyCredential({
    rootBinding: binding,
    controllerPrivateKey: controller.privateKey,
    operationalPublicKey: keys().publicKey,
    keyEpoch: 3,
    activatedAt: '2026-08-28T04:20:00.000Z',
    transitionKind: 'rotation',
    predecessorCredential: first,
    predecessorDisposition: 'retired'
  }), /advance by one|epoch/i);
  assert.throws(() => createDelegationRootAttestationKeyCredential({
    rootBinding: binding,
    controllerPrivateKey: controller.privateKey,
    operationalPublicKey: firstKey.publicKey,
    keyEpoch: 2,
    activatedAt: ROTATED,
    transitionKind: 'rotation',
    predecessorCredential: first,
    predecessorDisposition: 'retired'
  }), /change operational key|reuses/i);
  assert.throws(() => verifyDelegationRootAttestationKeyCredential(first, {
    trustedControllerPublicKey: controller.publicKey,
    expectedRootBindingDigest: otherBinding.binding_digest
  }), /different root binding|root binding.*mismatch/i);
});

test('controller-signed revocation binds exact credential and contracts use from effective time', async () => {
  const binding = rootBinding();
  const controller = keys();
  const operational = keys();
  const {
    createDelegationRootAttestationKeyRevocation,
    verifyDelegationRootAttestationKeyRevocation,
    assertDelegationRootAttestationKeyUsableAt
  } = await lifecycle();
  const credential = await initialCredential({ binding, controller, operational });

  assert.throws(() => createDelegationRootAttestationKeyRevocation(credential, {
    trustedControllerPublicKey: controller.publicKey,
    controllerPrivateKey: controller.privateKey,
    effectiveAt: '2026-08-28T03:59:59.999Z',
    reasonCode: 'compromised'
  }), /cannot predate.*activation/i);

  const revocation = createDelegationRootAttestationKeyRevocation(credential, {
    trustedControllerPublicKey: controller.publicKey,
    controllerPrivateKey: controller.privateKey,
    effectiveAt: '2026-08-28T04:05:00.000Z',
    reasonCode: 'compromised'
  });
  const verified = verifyDelegationRootAttestationKeyRevocation(revocation, {
    trustedControllerPublicKey: controller.publicKey,
    credential
  });
  assert.equal(verified.statement.credential_digest, credential.credential_digest);
  assert.equal(verified.statement.operational_key_id, credential.statement.operational_key_id);
  assert.equal(verified.statement.authority_effect, 'none');
  assert.equal(verified.statement.attestation_effect, 'revoke-evidence-signing-key');
  assert.throws(() => assertDelegationRootAttestationKeyUsableAt(credential, {
    trustedControllerPublicKey: controller.publicKey,
    at: '2026-08-28T04:05:00.000Z',
    revocation
  }), /revoked at requested time/i);
});

test('historical verification accepts an attestation only while its credentialed signer key was usable', async () => {
  const binding = rootBinding();
  const controller = keys();
  const firstKey = keys();
  const secondKey = keys();
  const {
    createDelegationRootAttestationKeyCredential,
    verifyDelegationRootAttestationWithKeyLifecycle
  } = await lifecycle();
  const first = await initialCredential({ binding, controller, operational: firstKey });
  const second = createDelegationRootAttestationKeyCredential({
    rootBinding: binding,
    controllerPrivateKey: controller.privateKey,
    operationalPublicKey: secondKey.publicKey,
    keyEpoch: 2,
    activatedAt: ROTATED,
    transitionKind: 'rotation',
    predecessorCredential: first,
    predecessorDisposition: 'retired'
  });
  const attestation = createDelegationRootAttestation({
    root_binding: binding,
    signer_id: binding.root_holder,
    signer_private_key: firstKey.privateKey,
    issued_at: '2026-08-28T04:05:00.000Z'
  });
  const verified = verifyDelegationRootAttestationWithKeyLifecycle(attestation, {
    trustedControllerPublicKey: controller.publicKey,
    credentials: [first, second],
    expectedRootBindingDigest: binding.binding_digest,
    expectedRootAuthorityDigest: binding.root_authority_digest,
    expectedRootHolder: binding.root_holder
  });
  assert.equal(verified.verified, true);
  assert.equal(verified.signer_key_id, delegationRootAttestationKeyId(firstKey.publicKey));
  assert.equal(verified.signer_key_epoch, 1);
  assert.equal(verified.execution_authority_granted, false);
  assert.equal(verified.authority_effect, 'none');
  assert.equal(verified.delegation_effect, 'none');
  assert.equal(verified.wall_clock_signing_time_proved, false);
  assert.equal(verified.globally_current_key_state_claimed, false);
});

test('historical verification rejects retired or revoked signer keys at the attested issuance time', async () => {
  const binding = rootBinding();
  const controller = keys();
  const firstKey = keys();
  const secondKey = keys();
  const {
    createDelegationRootAttestationKeyCredential,
    createDelegationRootAttestationKeyRevocation,
    verifyDelegationRootAttestationWithKeyLifecycle
  } = await lifecycle();
  const first = await initialCredential({ binding, controller, operational: firstKey });
  const second = createDelegationRootAttestationKeyCredential({
    rootBinding: binding,
    controllerPrivateKey: controller.privateKey,
    operationalPublicKey: secondKey.publicKey,
    keyEpoch: 2,
    activatedAt: ROTATED,
    transitionKind: 'rotation',
    predecessorCredential: first,
    predecessorDisposition: 'retired'
  });
  const staleAttestation = createDelegationRootAttestation({
    root_binding: binding,
    signer_id: binding.root_holder,
    signer_private_key: firstKey.privateKey,
    issued_at: ROTATED
  });
  assert.throws(() => verifyDelegationRootAttestationWithKeyLifecycle(staleAttestation, {
    trustedControllerPublicKey: controller.publicKey,
    credentials: [first, second],
    expectedRootBindingDigest: binding.binding_digest
  }), /stale after successor activation/i);

  const revocation = createDelegationRootAttestationKeyRevocation(first, {
    trustedControllerPublicKey: controller.publicKey,
    controllerPrivateKey: controller.privateKey,
    effectiveAt: '2026-08-28T04:05:00.000Z',
    reasonCode: 'compromised'
  });
  const revokedAttestation = createDelegationRootAttestation({
    root_binding: binding,
    signer_id: binding.root_holder,
    signer_private_key: firstKey.privateKey,
    issued_at: '2026-08-28T04:05:00.000Z'
  });
  assert.throws(() => verifyDelegationRootAttestationWithKeyLifecycle(revokedAttestation, {
    trustedControllerPublicKey: controller.publicKey,
    credentials: [first],
    revocations: [revocation],
    expectedRootBindingDigest: binding.binding_digest
  }), /revoked at requested time/i);
});
