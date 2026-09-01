import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import {
  createMachineIdentityCoreCredential,
  machineIdentityCoreKeyId,
  verifyMachineIdentityCoreCredential,
  verifyMachineIdentityCoreCredentialHistory
} from '../src/lib/agent-trust-machine-identity-core.mjs';

function keys() {
  return generateKeyPairSync('ed25519');
}

function genesis({ issuer, operational, overrides = {} } = {}) {
  return createMachineIdentityCoreCredential({
    principalId: 'agent.identity-core.1',
    principalType: 'agent',
    issuerId: 'identity.example.1',
    issuerPrivateKey: issuer.privateKey,
    operationalPublicKey: operational.publicKey,
    keyEpoch: 1,
    issuedAt: '2026-09-01T16:00:00.000Z',
    validFrom: '2026-09-01T16:00:00.000Z',
    expiresAt: '2026-10-01T16:00:00.000Z',
    ...overrides
  });
}

test('stable machine identity core binds lineage and operational key but contains no mutable authority, sponsor, or runtime state', () => {
  const issuer = keys();
  const operational = keys();
  const credential = genesis({ issuer, operational });
  const verified = verifyMachineIdentityCoreCredential(credential, {
    trustedIssuerPublicKey: issuer.publicKey,
    expectedIssuerId: 'identity.example.1',
    expectedPrincipalId: 'agent.identity-core.1'
  });

  assert.equal(verified.statement.principal_id, 'agent.identity-core.1');
  assert.equal(verified.statement.principal_type, 'agent');
  assert.equal(verified.statement.key_epoch, 1);
  assert.equal(
    verified.statement.operational_key_id,
    machineIdentityCoreKeyId(operational.publicKey)
  );
  assert.equal(verified.statement.identity_assurance, 'issuer-key-continuity-only');
  assert.equal(verified.statement.authority_effect, 'none');
  assert.equal(verified.statement.delegation_effect, 'none');
  assert.equal(verified.statement.global_currentness_claimed, false);

  for (const mutableField of [
    'sponsor',
    'principal_definition_digest',
    'principal_authority_digest',
    'runtime_id',
    'runtime_kind',
    'runtime_software_digest'
  ]) {
    assert.equal(
      Object.hasOwn(verified.statement, mutableField),
      false,
      `${mutableField} must not become stable identity essence`
    );
  }
});

test('stable identity core survives operational key rotation without requiring authority, sponsor, or runtime continuity', () => {
  const issuer = keys();
  const operational1 = keys();
  const operational2 = keys();
  const first = genesis({ issuer, operational: operational1 });
  const second = createMachineIdentityCoreCredential({
    principalId: 'agent.identity-core.1',
    principalType: 'agent',
    issuerId: 'identity.example.1',
    issuerPrivateKey: issuer.privateKey,
    operationalPublicKey: operational2.publicKey,
    keyEpoch: 2,
    issuedAt: '2026-09-02T16:00:00.000Z',
    validFrom: '2026-09-02T16:00:00.000Z',
    expiresAt: '2026-10-02T16:00:00.000Z',
    transitionKind: 'rotation',
    predecessorDisposition: 'retired',
    credentialHistory: [first]
  });

  const history = verifyMachineIdentityCoreCredentialHistory([first, second], {
    trustedIssuerPublicKey: issuer.publicKey
  });

  assert.equal(history.length, 2);
  assert.equal(history[0].statement.principal_id, history[1].statement.principal_id);
  assert.equal(history[0].statement.issuer_id, history[1].statement.issuer_id);
  assert.equal(history[1].statement.key_epoch, 2);
  assert.equal(
    history[1].statement.predecessor_credential_digest,
    first.credential_digest
  );
  assert.notEqual(
    history[0].statement.operational_key_id,
    history[1].statement.operational_key_id
  );
});

test('stable identity core history rejects principal substitution, issuer substitution, skipped epochs, and operational key reuse', () => {
  const issuer = keys();
  const wrongIssuer = keys();
  const operational1 = keys();
  const operational2 = keys();
  const first = genesis({ issuer, operational: operational1 });

  const wrongPrincipal = createMachineIdentityCoreCredential({
    principalId: 'agent.identity-core.attacker',
    principalType: 'agent',
    issuerId: 'identity.example.1',
    issuerPrivateKey: issuer.privateKey,
    operationalPublicKey: operational2.publicKey,
    keyEpoch: 2,
    issuedAt: '2026-09-02T16:00:00.000Z',
    validFrom: '2026-09-02T16:00:00.000Z',
    expiresAt: '2026-10-02T16:00:00.000Z',
    transitionKind: 'rotation',
    predecessorDisposition: 'retired',
    predecessorCredentialDigest: first.credential_digest
  });
  assert.throws(
    () => verifyMachineIdentityCoreCredentialHistory([first, wrongPrincipal], {
      trustedIssuerPublicKey: issuer.publicKey
    }),
    /changed stable principal identity/
  );

  assert.throws(
    () => verifyMachineIdentityCoreCredential(first, {
      trustedIssuerPublicKey: wrongIssuer.publicKey
    }),
    /issuer key substitution/
  );

  assert.throws(() => createMachineIdentityCoreCredential({
    principalId: 'agent.identity-core.1',
    principalType: 'agent',
    issuerId: 'identity.example.1',
    issuerPrivateKey: issuer.privateKey,
    operationalPublicKey: operational2.publicKey,
    keyEpoch: 3,
    issuedAt: '2026-09-03T16:00:00.000Z',
    validFrom: '2026-09-03T16:00:00.000Z',
    expiresAt: '2026-10-03T16:00:00.000Z',
    transitionKind: 'rotation',
    predecessorDisposition: 'retired',
    credentialHistory: [first]
  }), /next key epoch/);

  assert.throws(() => createMachineIdentityCoreCredential({
    principalId: 'agent.identity-core.1',
    principalType: 'agent',
    issuerId: 'identity.example.1',
    issuerPrivateKey: issuer.privateKey,
    operationalPublicKey: operational1.publicKey,
    keyEpoch: 2,
    issuedAt: '2026-09-02T16:00:00.000Z',
    validFrom: '2026-09-02T16:00:00.000Z',
    expiresAt: '2026-10-02T16:00:00.000Z',
    transitionKind: 'rotation',
    predecessorDisposition: 'retired',
    credentialHistory: [first]
  }), /must not reuse any prior operational key/);
});

test('stable identity core recovery preserves identity while requiring explicit compromised or revoked predecessor semantics', () => {
  const issuer = keys();
  const first = genesis({ issuer, operational: keys() });

  assert.throws(() => createMachineIdentityCoreCredential({
    principalId: 'agent.identity-core.1',
    principalType: 'agent',
    issuerId: 'identity.example.1',
    issuerPrivateKey: issuer.privateKey,
    operationalPublicKey: keys().publicKey,
    keyEpoch: 2,
    issuedAt: '2026-09-02T16:00:00.000Z',
    validFrom: '2026-09-02T16:00:00.000Z',
    expiresAt: '2026-10-02T16:00:00.000Z',
    transitionKind: 'recovery',
    predecessorDisposition: 'retired',
    credentialHistory: [first]
  }), /recovery requires revoked or compromised predecessor/);

  const recovered = createMachineIdentityCoreCredential({
    principalId: 'agent.identity-core.1',
    principalType: 'agent',
    issuerId: 'identity.example.1',
    issuerPrivateKey: issuer.privateKey,
    operationalPublicKey: keys().publicKey,
    keyEpoch: 2,
    issuedAt: '2026-09-02T16:00:00.000Z',
    validFrom: '2026-09-02T16:00:00.000Z',
    expiresAt: '2026-10-02T16:00:00.000Z',
    transitionKind: 'recovery',
    predecessorDisposition: 'compromised',
    credentialHistory: [first]
  });

  const history = verifyMachineIdentityCoreCredentialHistory([first, recovered], {
    trustedIssuerPublicKey: issuer.publicKey
  });
  assert.equal(history[1].statement.predecessor_disposition, 'compromised');
  assert.equal(history[1].statement.principal_id, history[0].statement.principal_id);
});
