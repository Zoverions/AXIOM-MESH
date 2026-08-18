import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import {
  PUBLIC_WITNESS_SERVICE_KEY_ROLES,
  assertPublicWitnessServiceKeyUsableAt,
  createPublicWitnessServiceKeyCredential,
  createPublicWitnessServiceKeyRevocation,
  publicWitnessServiceKeyId,
  resolvePublicWitnessServiceKeyCredential,
  resolvePublicWitnessServiceKeyRevocation,
  validatePublicWitnessServiceKeyCredentialPath,
  validatePublicWitnessServiceKeyCredentialTransition,
  verifyPublicWitnessServiceKeyCredential,
  verifyPublicWitnessServiceKeyRevocation
} from '../src/lib/public-witness-service-key-lifecycle.mjs';

function keys() {
  const pair = generateKeyPairSync('ed25519');
  return {
    privateKey: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
  };
}

function initial({ root, operational, role, principalId, activatedAt = '2026-08-17T22:00:00.000Z' }) {
  return createPublicWitnessServiceKeyCredential({
    domainId: 'axiom.social.public.v1',
    role,
    principalId,
    roleRootPrivateKey: root.privateKey,
    operationalPublicKey: operational.publicKey,
    keyEpoch: 1,
    activatedAt
  });
}

test('operator credential truthfully delegates only bounded source-admission authorization signing', () => {
  const root = keys();
  const operational = keys();
  const credential = initial({
    root,
    operational,
    role: PUBLIC_WITNESS_SERVICE_KEY_ROLES.OPERATOR,
    principalId: 'operator-a'
  });
  const verified = verifyPublicWitnessServiceKeyCredential(credential, {
    trustedRoleRootPublicKey: root.publicKey,
    expectedDomainId: 'axiom.social.public.v1',
    expectedRole: PUBLIC_WITNESS_SERVICE_KEY_ROLES.OPERATOR,
    expectedPrincipalId: 'operator-a'
  });
  assert.equal(verified.statement.operational_key_id, publicWitnessServiceKeyId(operational.publicKey));
  assert.equal(verified.statement.authority_scope, 'authorize-exact-w2c2-source-admission');
  assert.equal(verified.statement.authority_effect, 'delegate-w2c2-source-admission-authorization-signing');
  assert.equal(verified.statement.network_effect, 'none');
  assert.equal(verified.statement.persona_root_trust_effect, 'none');
  assert.equal(verified.statement.social_authority_effect, 'none');
  assert.equal(verified.statement.capability_promotion_effect, 'none');
  assert.equal(verified.statement.finality_claimed, false);
});

test('routine rotation advances exactly one epoch, changes key, and makes predecessor stale at activation', () => {
  const root = keys();
  const firstKey = keys();
  const secondKey = keys();
  const first = initial({
    root,
    operational: firstKey,
    role: PUBLIC_WITNESS_SERVICE_KEY_ROLES.PROVISIONER,
    principalId: 'provisioner-a'
  });
  const second = createPublicWitnessServiceKeyCredential({
    domainId: 'axiom.social.public.v1',
    role: PUBLIC_WITNESS_SERVICE_KEY_ROLES.PROVISIONER,
    principalId: 'provisioner-a',
    roleRootPrivateKey: root.privateKey,
    operationalPublicKey: secondKey.publicKey,
    keyEpoch: 2,
    activatedAt: '2026-08-17T22:10:00.000Z',
    transitionKind: 'rotation',
    predecessorCredential: first,
    predecessorDisposition: 'retired'
  });
  const transition = validatePublicWitnessServiceKeyCredentialTransition(first, second, {
    trustedRoleRootPublicKey: root.publicKey
  });
  assert.equal(transition.previous_epoch, 1);
  assert.equal(transition.current_epoch, 2);
  assert.equal(transition.predecessor_disposition, 'retired');
  assert.equal(validatePublicWitnessServiceKeyCredentialPath([first, second], {
    trustedRoleRootPublicKey: root.publicKey,
    expectedDomainId: 'axiom.social.public.v1',
    expectedRole: PUBLIC_WITNESS_SERVICE_KEY_ROLES.PROVISIONER,
    expectedPrincipalId: 'provisioner-a'
  }).last_epoch, 2);
  assert.equal(assertPublicWitnessServiceKeyUsableAt(first, {
    trustedRoleRootPublicKey: root.publicKey,
    at: '2026-08-17T22:09:59.999Z',
    successorCredential: second
  }).valid, true);
  assert.throws(() => assertPublicWitnessServiceKeyUsableAt(first, {
    trustedRoleRootPublicKey: root.publicKey,
    at: '2026-08-17T22:10:00.000Z',
    successorCredential: second
  }), /stale after successor activation/);
  assert.equal(assertPublicWitnessServiceKeyUsableAt(second, {
    trustedRoleRootPublicKey: root.publicKey,
    at: '2026-08-17T22:10:00.000Z'
  }).valid, true);
});

test('recovery records compromised predecessor and revocation contracts future key use', () => {
  const root = keys();
  const compromisedKey = keys();
  const recoveredKey = keys();
  const first = initial({
    root,
    operational: compromisedKey,
    role: PUBLIC_WITNESS_SERVICE_KEY_ROLES.OPERATOR,
    principalId: 'operator-a'
  });
  const revocation = createPublicWitnessServiceKeyRevocation(first, {
    trustedRoleRootPublicKey: root.publicKey,
    roleRootPrivateKey: root.privateKey,
    effectiveAt: '2026-08-17T22:05:00.000Z',
    reasonCode: 'suspected-compromise'
  });
  assert.equal(verifyPublicWitnessServiceKeyRevocation(revocation, {
    trustedRoleRootPublicKey: root.publicKey,
    credential: first
  }).statement.authority_effect, 'contract-role-key-authority');
  assert.throws(() => assertPublicWitnessServiceKeyUsableAt(first, {
    trustedRoleRootPublicKey: root.publicKey,
    at: '2026-08-17T22:05:00.000Z',
    revocation
  }), /revoked at requested time/);

  const recovered = createPublicWitnessServiceKeyCredential({
    domainId: 'axiom.social.public.v1',
    role: PUBLIC_WITNESS_SERVICE_KEY_ROLES.OPERATOR,
    principalId: 'operator-a',
    roleRootPrivateKey: root.privateKey,
    operationalPublicKey: recoveredKey.publicKey,
    keyEpoch: 2,
    activatedAt: '2026-08-17T22:06:00.000Z',
    transitionKind: 'recovery',
    predecessorCredential: first,
    predecessorDisposition: 'compromised'
  });
  assert.equal(validatePublicWitnessServiceKeyCredentialTransition(first, recovered, {
    trustedRoleRootPublicKey: root.publicKey
  }).transition_kind, 'recovery');
});

test('role roots, roles, domains, principals, and operational keys are non-substitutable', () => {
  const operatorRoot = keys();
  const provisionerRoot = keys();
  const operational = keys();
  const otherOperational = keys();
  const operator = initial({
    root: operatorRoot,
    operational,
    role: PUBLIC_WITNESS_SERVICE_KEY_ROLES.OPERATOR,
    principalId: 'operator-a'
  });
  assert.throws(() => verifyPublicWitnessServiceKeyCredential(operator, {
    trustedRoleRootPublicKey: provisionerRoot.publicKey
  }), /role-root key substitution/);
  assert.throws(() => verifyPublicWitnessServiceKeyCredential(operator, {
    trustedRoleRootPublicKey: operatorRoot.publicKey,
    expectedRole: PUBLIC_WITNESS_SERVICE_KEY_ROLES.PROVISIONER
  }), /different role/);
  assert.throws(() => verifyPublicWitnessServiceKeyCredential(operator, {
    trustedRoleRootPublicKey: operatorRoot.publicKey,
    expectedDomainId: 'other.domain'
  }), /different domain/);
  assert.throws(() => verifyPublicWitnessServiceKeyCredential(operator, {
    trustedRoleRootPublicKey: operatorRoot.publicKey,
    expectedPrincipalId: 'operator-b'
  }), /different principal/);
  assert.throws(() => createPublicWitnessServiceKeyCredential({
    domainId: 'axiom.social.public.v1',
    role: PUBLIC_WITNESS_SERVICE_KEY_ROLES.OPERATOR,
    principalId: 'operator-a',
    roleRootPrivateKey: operatorRoot.privateKey,
    operationalPublicKey: operational.publicKey,
    keyEpoch: 2,
    activatedAt: '2026-08-17T22:10:00.000Z',
    transitionKind: 'rotation',
    predecessorCredential: operator,
    predecessorDisposition: 'retired'
  }), /must change operational key/);
  const rotated = createPublicWitnessServiceKeyCredential({
    domainId: 'axiom.social.public.v1',
    role: PUBLIC_WITNESS_SERVICE_KEY_ROLES.OPERATOR,
    principalId: 'operator-a',
    roleRootPrivateKey: operatorRoot.privateKey,
    operationalPublicKey: otherOperational.publicKey,
    keyEpoch: 2,
    activatedAt: '2026-08-17T22:10:00.000Z',
    transitionKind: 'rotation',
    predecessorCredential: operator,
    predecessorDisposition: 'retired'
  });
  assert.equal(resolvePublicWitnessServiceKeyCredential([operator, rotated], {
    trustedRoleRootPublicKey: operatorRoot.publicKey,
    operationalKeyId: publicWitnessServiceKeyId(otherOperational.publicKey),
    expectedDomainId: 'axiom.social.public.v1',
    expectedRole: PUBLIC_WITNESS_SERVICE_KEY_ROLES.OPERATOR,
    expectedPrincipalId: 'operator-a'
  }).credential_digest, rotated.credential_digest);
});

test('revocation lookup is exact and duplicate conflicting revocations fail closed', () => {
  const root = keys();
  const operational = keys();
  const credential = initial({
    root,
    operational,
    role: PUBLIC_WITNESS_SERVICE_KEY_ROLES.PROVISIONER,
    principalId: 'provisioner-a'
  });
  const first = createPublicWitnessServiceKeyRevocation(credential, {
    trustedRoleRootPublicKey: root.publicKey,
    roleRootPrivateKey: root.privateKey,
    effectiveAt: '2026-08-17T22:05:00.000Z',
    reasonCode: 'retired-early'
  });
  const same = structuredClone(first);
  assert.equal(resolvePublicWitnessServiceKeyRevocation([first, same], credential, {
    trustedRoleRootPublicKey: root.publicKey
  }).revocation_digest, first.revocation_digest);
  const conflicting = createPublicWitnessServiceKeyRevocation(credential, {
    trustedRoleRootPublicKey: root.publicKey,
    roleRootPrivateKey: root.privateKey,
    effectiveAt: '2026-08-17T22:06:00.000Z',
    reasonCode: 'compromised'
  });
  assert.throws(() => resolvePublicWitnessServiceKeyRevocation([first, conflicting], credential, {
    trustedRoleRootPublicKey: root.publicKey
  }), /conflicting revocations/);
});

test('lifecycle verification states its time and global-currentness non-claims', () => {
  const root = keys();
  const operational = keys();
  const credential = initial({
    root,
    operational,
    role: PUBLIC_WITNESS_SERVICE_KEY_ROLES.PROVISIONER,
    principalId: 'provisioner-a'
  });
  const result = assertPublicWitnessServiceKeyUsableAt(credential, {
    trustedRoleRootPublicKey: root.publicKey,
    at: '2026-08-17T22:01:00.000Z'
  });
  assert.equal(result.wall_clock_signing_time_proved, false);
  assert.equal(result.globally_current_key_state_claimed, false);
  assert.equal(result.network_effect, 'none');
});
