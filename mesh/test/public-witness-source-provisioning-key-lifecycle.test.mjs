import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import {
  PUBLIC_WITNESS_SERVICE_KEY_ROLES,
  createPublicWitnessServiceKeyCredential,
  createPublicWitnessServiceKeyRevocation
} from '../src/lib/public-witness-service-key-lifecycle.mjs';
import {
  assertPublicWitnessSourceProvisioningCommandEffectAllowed,
  createPublicWitnessSourceProvisioningCommandWithKeyLifecycle,
  verifyPublicWitnessSourceProvisioningCommandWithKeyLifecycle
} from '../src/lib/public-witness-source-provisioning-key-lifecycle.mjs';
import { createPublicWitnessSourceAdmission } from '../src/lib/public-witness-transfer.mjs';

function keys() {
  const pair = generateKeyPairSync('ed25519');
  return {
    privateKey: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
  };
}

function admission(source, epoch = 1, previous = null) {
  return createPublicWitnessSourceAdmission({
    domainId: 'axiom.social.public.v1',
    sourceId: 'lifecycle-source',
    sourcePublicKey: source.publicKey,
    sourceEpoch: epoch,
    validFrom: '2026-08-17T22:00:00.000Z',
    expiresAt: '2026-08-18T00:00:00.000Z',
    ...(previous === null ? {} : { previousAdmissionDigest: previous })
  });
}

function operatorCredential({ root, operational, epoch = 1, activatedAt, predecessor = null, kind = 'initial', disposition = null }) {
  return createPublicWitnessServiceKeyCredential({
    domainId: 'axiom.social.public.v1',
    role: PUBLIC_WITNESS_SERVICE_KEY_ROLES.OPERATOR,
    principalId: 'operator-a',
    roleRootPrivateKey: root.privateKey,
    operationalPublicKey: operational.publicKey,
    keyEpoch: epoch,
    activatedAt,
    transitionKind: kind,
    predecessorCredential: predecessor,
    predecessorDisposition: disposition
  });
}

test('credentialed operator command binds exact current operational key and verifies through root trust', () => {
  const root = keys();
  const operator = keys();
  const source = keys();
  const credential = operatorCredential({
    root,
    operational: operator,
    activatedAt: '2026-08-17T22:00:00.000Z'
  });
  const command = createPublicWitnessSourceProvisioningCommandWithKeyLifecycle({
    sourceAdmission: admission(source),
    operatorId: 'operator-a',
    operatorPrivateKey: operator.privateKey,
    operatorCredentialPath: [credential],
    trustedOperatorRoleRootPublicKey: root.publicKey,
    commandId: 'credentialed-command',
    authorizedAt: '2026-08-17T22:01:00.000Z',
    expiresAt: '2026-08-17T22:10:00.000Z'
  });
  const verified = verifyPublicWitnessSourceProvisioningCommandWithKeyLifecycle(command, {
    operatorCredentialPath: [credential],
    trustedOperatorRoleRootPublicKey: root.publicKey,
    expectedDomainId: 'axiom.social.public.v1',
    expectedOperatorId: 'operator-a',
    now: Date.parse('2026-08-17T22:02:00.000Z')
  });
  assert.equal(verified.operator_credential_digest, credential.credential_digest);
  assert.equal(verified.operator_key_epoch, 1);
});

test('rotated operator can create new commands while stale key cannot authorize after successor activation', () => {
  const root = keys();
  const firstKey = keys();
  const secondKey = keys();
  const source = keys();
  const first = operatorCredential({
    root,
    operational: firstKey,
    activatedAt: '2026-08-17T22:00:00.000Z'
  });
  const second = operatorCredential({
    root,
    operational: secondKey,
    epoch: 2,
    activatedAt: '2026-08-17T22:10:00.000Z',
    predecessor: first,
    kind: 'rotation',
    disposition: 'retired'
  });
  const path = [first, second];
  const current = createPublicWitnessSourceProvisioningCommandWithKeyLifecycle({
    sourceAdmission: admission(source),
    operatorId: 'operator-a',
    operatorPrivateKey: secondKey.privateKey,
    operatorCredentialPath: path,
    trustedOperatorRoleRootPublicKey: root.publicKey,
    commandId: 'rotated-current',
    authorizedAt: '2026-08-17T22:11:00.000Z',
    expiresAt: '2026-08-17T22:20:00.000Z'
  });
  assert.equal(verifyPublicWitnessSourceProvisioningCommandWithKeyLifecycle(current, {
    operatorCredentialPath: path,
    trustedOperatorRoleRootPublicKey: root.publicKey,
    expectedDomainId: 'axiom.social.public.v1',
    expectedOperatorId: 'operator-a',
    now: Date.parse('2026-08-17T22:12:00.000Z')
  }).operator_key_epoch, 2);
  assert.throws(() => createPublicWitnessSourceProvisioningCommandWithKeyLifecycle({
    sourceAdmission: admission(source),
    operatorId: 'operator-a',
    operatorPrivateKey: firstKey.privateKey,
    operatorCredentialPath: path,
    trustedOperatorRoleRootPublicKey: root.publicKey,
    commandId: 'stale-command',
    authorizedAt: '2026-08-17T22:11:00.000Z',
    expiresAt: '2026-08-17T22:15:00.000Z'
  }), /stale after successor activation/);
});

test('routine rotation preserves an already-issued bounded command until its own expiry', () => {
  const root = keys();
  const firstKey = keys();
  const secondKey = keys();
  const source = keys();
  const first = operatorCredential({
    root,
    operational: firstKey,
    activatedAt: '2026-08-17T22:00:00.000Z'
  });
  const command = createPublicWitnessSourceProvisioningCommandWithKeyLifecycle({
    sourceAdmission: admission(source),
    operatorId: 'operator-a',
    operatorPrivateKey: firstKey.privateKey,
    operatorCredentialPath: [first],
    trustedOperatorRoleRootPublicKey: root.publicKey,
    commandId: 'pre-rotation-command',
    authorizedAt: '2026-08-17T22:05:00.000Z',
    expiresAt: '2026-08-17T22:20:00.000Z'
  });
  const second = operatorCredential({
    root,
    operational: secondKey,
    epoch: 2,
    activatedAt: '2026-08-17T22:10:00.000Z',
    predecessor: first,
    kind: 'rotation',
    disposition: 'retired'
  });
  const effect = assertPublicWitnessSourceProvisioningCommandEffectAllowed(command, {
    operatorCredentialPath: [first, second],
    trustedOperatorRoleRootPublicKey: root.publicKey,
    expectedDomainId: 'axiom.social.public.v1',
    expectedOperatorId: 'operator-a',
    effectAt: '2026-08-17T22:11:00.000Z'
  });
  assert.equal(effect.valid, true);
  assert.equal(effect.routine_rotation_preserves_existing_bounded_command, true);
});

test('revocation or compromise recovery contracts future effects from an earlier command', () => {
  const root = keys();
  const firstKey = keys();
  const recoveredKey = keys();
  const source = keys();
  const first = operatorCredential({
    root,
    operational: firstKey,
    activatedAt: '2026-08-17T22:00:00.000Z'
  });
  const command = createPublicWitnessSourceProvisioningCommandWithKeyLifecycle({
    sourceAdmission: admission(source),
    operatorId: 'operator-a',
    operatorPrivateKey: firstKey.privateKey,
    operatorCredentialPath: [first],
    trustedOperatorRoleRootPublicKey: root.publicKey,
    commandId: 'pre-compromise-command',
    authorizedAt: '2026-08-17T22:02:00.000Z',
    expiresAt: '2026-08-17T22:15:00.000Z'
  });
  const revocation = createPublicWitnessServiceKeyRevocation(first, {
    trustedRoleRootPublicKey: root.publicKey,
    roleRootPrivateKey: root.privateKey,
    effectiveAt: '2026-08-17T22:06:00.000Z',
    reasonCode: 'compromised'
  });
  assert.throws(() => assertPublicWitnessSourceProvisioningCommandEffectAllowed(command, {
    operatorCredentialPath: [first],
    operatorRevocations: [revocation],
    trustedOperatorRoleRootPublicKey: root.publicKey,
    expectedDomainId: 'axiom.social.public.v1',
    expectedOperatorId: 'operator-a',
    effectAt: '2026-08-17T22:07:00.000Z'
  }), /revoked for new effects/);

  const recovered = operatorCredential({
    root,
    operational: recoveredKey,
    epoch: 2,
    activatedAt: '2026-08-17T22:08:00.000Z',
    predecessor: first,
    kind: 'recovery',
    disposition: 'compromised'
  });
  assert.throws(() => assertPublicWitnessSourceProvisioningCommandEffectAllowed(command, {
    operatorCredentialPath: [first, recovered],
    trustedOperatorRoleRootPublicKey: root.publicKey,
    expectedDomainId: 'axiom.social.public.v1',
    expectedOperatorId: 'operator-a',
    effectAt: '2026-08-17T22:09:00.000Z'
  }), /revoked or compromised for new effects/);
});

test('operator role cannot be substituted with provisioner credential or unrelated role root', () => {
  const operatorRoot = keys();
  const provisionerRoot = keys();
  const provisionerKey = keys();
  const source = keys();
  const provisionerCredential = createPublicWitnessServiceKeyCredential({
    domainId: 'axiom.social.public.v1',
    role: PUBLIC_WITNESS_SERVICE_KEY_ROLES.PROVISIONER,
    principalId: 'operator-a',
    roleRootPrivateKey: provisionerRoot.privateKey,
    operationalPublicKey: provisionerKey.publicKey,
    keyEpoch: 1,
    activatedAt: '2026-08-17T22:00:00.000Z'
  });
  assert.throws(() => createPublicWitnessSourceProvisioningCommandWithKeyLifecycle({
    sourceAdmission: admission(source),
    operatorId: 'operator-a',
    operatorPrivateKey: provisionerKey.privateKey,
    operatorCredentialPath: [provisionerCredential],
    trustedOperatorRoleRootPublicKey: provisionerRoot.publicKey,
    commandId: 'wrong-role-command',
    authorizedAt: '2026-08-17T22:01:00.000Z',
    expiresAt: '2026-08-17T22:05:00.000Z'
  }), /different role/);
  assert.notEqual(operatorRoot.publicKey, provisionerRoot.publicKey);
});
