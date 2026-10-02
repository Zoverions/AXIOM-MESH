import assert from 'node:assert/strict';
import { createPublicKey, generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import { ValidationError, digestObject } from '../src/lib/canonical.mjs';
import { DELEGATION_ROOT_BINDING_SCHEMA } from '../src/lib/delegation-ledger.mjs';
import {
  createDelegationRootAttestation,
  delegationRootAttestationKeyId
} from '../src/lib/delegation-root-attestation.mjs';
import {
  containerPaths,
  countingProxy,
  label,
  propertyPaths,
  withAccessorAt,
  withProxyAt
} from '../test-support/hostile-plain-data.mjs';

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

async function revokedKeyFixture() {
  const binding = rootBinding();
  const controller = keys();
  const firstKey = keys();
  const {
    createDelegationRootAttestationKeyRevocation,
    verifyDelegationRootAttestationWithKeyLifecycle
  } = await lifecycle();
  const first = await initialCredential({ binding, controller, operational: firstKey });
  const revocation = createDelegationRootAttestationKeyRevocation(first, {
    trustedControllerPublicKey: controller.publicKey,
    controllerPrivateKey: controller.privateKey,
    effectiveAt: '2026-08-28T04:05:00.000Z',
    reasonCode: 'compromised'
  });
  // The compromised key signs after its revocation; the genuinely signed time is 04:30.
  const revokedAttestation = createDelegationRootAttestation({
    root_binding: binding,
    signer_id: binding.root_holder,
    signer_private_key: firstKey.privateKey,
    issued_at: '2026-08-28T04:30:00.000Z'
  });
  const validAttestation = createDelegationRootAttestation({
    root_binding: binding,
    signer_id: binding.root_holder,
    signer_private_key: firstKey.privateKey,
    issued_at: '2026-08-28T04:01:00.000Z'
  });
  const options = {
    trustedControllerPublicKey: controller.publicKey,
    credentials: [first],
    revocations: [revocation],
    expectedRootBindingDigest: binding.binding_digest
  };
  return {
    binding,
    controller,
    firstKey,
    first,
    revocation,
    revokedAttestation,
    validAttestation,
    options,
    verify: (attestation, changes = {}) =>
      verifyDelegationRootAttestationWithKeyLifecycle(attestation, { ...options, ...changes })
  };
}

test('P2: an issued_at getter cannot move a revoked-key attestation before its revocation', async () => {
  const f = await revokedKeyFixture();
  assert.throws(() => f.verify(f.revokedAttestation), /revoked at requested time/i);
  assert.throws(() => f.verify(JSON.parse(JSON.stringify(f.revokedAttestation))), /revoked at requested time/i);
  let reads = 0;
  const statement = { ...f.revokedAttestation.statement };
  Object.defineProperty(statement, 'issued_at', {
    enumerable: true,
    configurable: true,
    get() {
      reads += 1;
      return reads === 1 ? '2026-08-28T04:01:00.000Z' : f.revokedAttestation.statement.issued_at;
    }
  });
  assert.throws(
    () => f.verify({ ...f.revokedAttestation, statement }),
    error => error instanceof ValidationError && /accessor/.test(error.message)
  );
  assert.equal(reads, 0);
});

test('P2: a lying issued_at Proxy cannot bypass key revocation', async () => {
  const f = await revokedKeyFixture();
  const counter = { traps: 0 };
  const statement = countingProxy({ ...f.revokedAttestation.statement }, counter, {
    issued_at: (read, signed) => (read === 1 ? '2026-08-28T04:01:00.000Z' : signed)
  });
  assert.throws(
    () => f.verify({ ...f.revokedAttestation, statement }),
    error => error instanceof ValidationError && /Proxy/.test(error.message)
  );
  assert.equal(counter.traps, 0);
});

test('lifecycle verification rejects a Proxy or accessor anywhere in attestation, credentials or revocations', async () => {
  const f = await revokedKeyFixture();
  assert.equal(f.verify(f.validAttestation).verified, true);
  assert.equal(f.verify(f.validAttestation).issued_at, '2026-08-28T04:01:00.000Z');
  const positions = [
    ['attestation', f.validAttestation, value => f.verify(value)],
    ['credentials', f.options.credentials, value => f.verify(f.validAttestation, { credentials: value })],
    ['revocations', f.options.revocations, value => f.verify(f.validAttestation, { revocations: value })]
  ];
  let checked = 0;
  for (const [name, document, run] of positions) {
    for (const path of containerPaths(document)) {
      const counter = { traps: 0 };
      assert.throws(
        () => run(withProxyAt(document, path, counter)),
        error => error instanceof ValidationError && /Proxy/.test(error.message),
        `${name} Proxy at ${label(path)}`
      );
      assert.equal(counter.traps, 0, `${name} Proxy at ${label(path)} ran a trap`);
      checked += 1;
    }
    for (const path of propertyPaths(document)) {
      const counter = { getters: 0 };
      assert.throws(
        () => run(withAccessorAt(document, path, counter)),
        error => error instanceof ValidationError && /accessor/.test(error.message),
        `${name} accessor at ${label(path)}`
      );
      assert.equal(counter.getters, 0, `${name} accessor at ${label(path)} ran its getter`);
      checked += 1;
    }
  }
  assert.ok(checked > 50, `expected to cover every position, covered ${checked}`);
});

test('lifecycle verification rejects hidden, symbol and non-plain attestation state without a raw TypeError', async () => {
  const f = await revokedKeyFixture();
  const hidden = structuredClone(f.validAttestation);
  Object.defineProperty(hidden.statement, 'issued_at', {
    value: f.validAttestation.statement.issued_at, enumerable: false, configurable: true, writable: true
  });
  const symbolKeyed = structuredClone(f.validAttestation);
  symbolKeyed.statement[Symbol('shadow')] = 'x';
  class Statement {}
  const nonPlain = {
    ...f.validAttestation,
    statement: Object.assign(new Statement(), f.validAttestation.statement)
  };
  const cases = [
    ['hidden', hidden, /non-enumerable/],
    ['symbolKeyed', symbolKeyed, /symbol key/],
    ['nonPlain', nonPlain, /non-plain prototype/]
  ];
  for (const [name, value, reason] of cases) {
    assert.throws(
      () => f.verify(value),
      error => error instanceof ValidationError && /must be plain data/.test(error.message)
        && reason.test(error.message),
      name
    );
  }
  const {
    validateDelegationRootAttestationKeyCredentialPath
  } = await lifecycle();
  const counter = { traps: 0 };
  assert.throws(
    () => validateDelegationRootAttestationKeyCredentialPath(countingProxy([...f.options.credentials], counter), {
      trustedControllerPublicKey: f.options.trustedControllerPublicKey
    }),
    error => error instanceof ValidationError && /Proxy/.test(error.message)
  );
  assert.equal(counter.traps, 0);
});

// A real controller public key whose `type` read runs `mutate`. Options are not
// snapshotted, so this runs caller code after the evidence snapshot is taken.
function mutatingControllerKey(publicKey, mutate) {
  const key = createPublicKey(publicKey.export({ type: 'spki', format: 'pem' }));
  let reads = 0;
  Object.defineProperty(key, 'type', {
    configurable: true,
    get() {
      reads += 1;
      mutate();
      return 'public';
    }
  });
  return { key, reads: () => reads };
}

test('mutating options cannot redirect the signer key lookup to raw input', async () => {
  const f = await revokedKeyFixture();
  const input = structuredClone(f.revokedAttestation);
  const hook = mutatingControllerKey(f.controller.publicKey, () => {
    input.statement.signer_key_id = 'f'.repeat(64);
  });
  assert.throws(() => f.verify(input, { trustedControllerPublicKey: hook.key }), /revoked at requested time/i);
  assert.ok(hook.reads() > 0);
});

test('mutating options cannot move raw issued_at before revocation or into the output', async () => {
  const f = await revokedKeyFixture();
  const input = structuredClone(f.revokedAttestation);
  const hook = mutatingControllerKey(f.controller.publicKey, () => {
    input.statement.issued_at = '2026-08-28T04:01:00.000Z';
  });
  assert.throws(() => f.verify(input, { trustedControllerPublicKey: hook.key }), /revoked at requested time/i);
  assert.ok(hook.reads() > 0);

  const valid = structuredClone(f.validAttestation);
  const outputHook = mutatingControllerKey(f.controller.publicKey, () => {
    valid.statement.issued_at = '2026-08-28T04:00:30.000Z';
  });
  const result = f.verify(valid, { trustedControllerPublicKey: outputHook.key });
  assert.equal(result.verified, true);
  assert.equal(result.issued_at, f.validAttestation.statement.issued_at);
});

test('mutating options cannot swap the raw attestation for another genuinely signed one', async () => {
  const f = await revokedKeyFixture();
  const input = structuredClone(f.revokedAttestation);
  const replacement = structuredClone(f.validAttestation);
  const hook = mutatingControllerKey(f.controller.publicKey, () => {
    Object.assign(input, structuredClone(replacement));
  });
  assert.throws(() => f.verify(input, { trustedControllerPublicKey: hook.key }), /revoked at requested time/i);
  assert.equal(input.statement.issued_at, replacement.statement.issued_at);
});

test('mutating options cannot drop a successor from the raw credential list after path validation', async () => {
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
  const staleAttestation = createDelegationRootAttestation({
    root_binding: binding,
    signer_id: binding.root_holder,
    signer_private_key: firstKey.privateKey,
    issued_at: '2026-08-28T04:30:00.000Z'
  });
  const credentials = [first, second];
  const hook = mutatingControllerKey(controller.publicKey, () => {
    credentials.length = 1;
  });
  assert.throws(() => verifyDelegationRootAttestationWithKeyLifecycle(staleAttestation, {
    trustedControllerPublicKey: hook.key,
    credentials,
    expectedRootBindingDigest: binding.binding_digest
  }), /stale after successor activation/i);
  assert.equal(credentials.length, 1, 'the option hook must have truncated the raw list');
});
