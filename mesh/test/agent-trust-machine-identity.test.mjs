import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import {
  createMachineIdentityCredential,
  createMachineIdentityRevocation,
  evaluateMachineIdentityCurrentness,
  machineIdentityKeyId,
  verifyMachineIdentityCredential,
  verifyMachineIdentityCredentialHistory,
  verifyMachineIdentityRevocation
} from '../src/lib/agent-trust-machine-identity.mjs';

const humans = new Set(['owner.alice']);

function principal(overrides = {}) {
  return {
    id: 'agent.researcher.1',
    type: 'agent',
    sponsor: 'owner.alice',
    roles: ['researcher'],
    scopes: ['intent:execute'],
    lifetime: 'session',
    expires_at: '2026-09-01T00:00:00.000Z',
    runtime: {
      id: 'runtime.fixture.1',
      kind: 'local-process',
      software_digest: 'a'.repeat(64)
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
  };
}

function keys() {
  return generateKeyPairSync('ed25519');
}

function genesis({ issuer, operational, overrides = {} } = {}) {
  return createMachineIdentityCredential({
    principal: principal(),
    issuerId: 'identity.owner.alice',
    issuerPrivateKey: issuer.privateKey,
    operationalPublicKey: operational.publicKey,
    keyEpoch: 1,
    issuedAt: '2026-08-17T20:00:00.000Z',
    validFrom: '2026-08-17T20:00:00.000Z',
    expiresAt: '2026-08-25T20:00:00.000Z',
    knownHumanPrincipals: humans,
    ...overrides
  });
}

test('portable machine identity credential binds principal definition and issuer key without granting authority', () => {
  const issuer = keys();
  const operational = keys();
  const credential = genesis({ issuer, operational });
  const verified = verifyMachineIdentityCredential(credential, {
    trustedIssuerPublicKey: issuer.publicKey,
    expectedIssuerId: 'identity.owner.alice',
    expectedPrincipalId: 'agent.researcher.1'
  });

  assert.equal(verified.statement.key_epoch, 1);
  assert.equal(verified.statement.operational_key_id, machineIdentityKeyId(operational.publicKey));
  assert.equal(verified.statement.identity_assurance, 'issuer-key-continuity-only');
  assert.equal(verified.statement.authority_effect, 'none');
  assert.equal(verified.statement.delegation_effect, 'none');
  assert.equal(verified.statement.legal_identity_claimed, false);
  assert.equal(verified.statement.personhood_claimed, false);
  assert.equal(verified.statement.reputation_claimed, false);
  assert.equal(verified.statement.truth_claimed, false);
  assert.equal(verified.statement.global_currentness_claimed, false);
  assert.match(verified.statement.principal_definition_digest, /^[a-f0-9]{64}$/);
  assert.match(verified.credential_digest, /^[a-f0-9]{64}$/);
});

test('credential verification rejects issuer substitution and statement tamper', () => {
  const issuer = keys();
  const wrongIssuer = keys();
  const operational = keys();
  const credential = genesis({ issuer, operational });

  assert.throws(
    () => verifyMachineIdentityCredential(credential, { trustedIssuerPublicKey: wrongIssuer.publicKey }),
    /issuer key substitution/
  );

  const tampered = structuredClone(credential);
  tampered.statement.principal_id = 'agent.attacker.1';
  assert.throws(
    () => verifyMachineIdentityCredential(tampered, { trustedIssuerPublicKey: issuer.publicKey }),
    /statement digest mismatch/
  );

  const widened = structuredClone(credential);
  widened.statement.authority_effect = 'execute-anything';
  assert.throws(
    () => verifyMachineIdentityCredential(widened, { trustedIssuerPublicKey: issuer.publicKey }),
    /widens its identity\/non-authority boundary/
  );
});

test('routine rotation preserves historical verification and advances exactly one epoch with a new key', () => {
  const issuer = keys();
  const operational1 = keys();
  const operational2 = keys();
  const first = genesis({ issuer, operational: operational1 });
  const second = createMachineIdentityCredential({
    principal: principal(),
    issuerId: 'identity.owner.alice',
    issuerPrivateKey: issuer.privateKey,
    operationalPublicKey: operational2.publicKey,
    keyEpoch: 2,
    issuedAt: '2026-08-18T20:00:00.000Z',
    validFrom: '2026-08-18T20:00:00.000Z',
    expiresAt: '2026-08-26T20:00:00.000Z',
    transitionKind: 'rotation',
    predecessorDisposition: 'retired',
    credentialHistory: [first],
    knownHumanPrincipals: humans
  });

  const history = verifyMachineIdentityCredentialHistory([first, second], {
    trustedIssuerPublicKey: issuer.publicKey
  });
  assert.equal(history.length, 2);
  assert.equal(history[1].statement.predecessor_credential_digest, first.credential_digest);
  assert.equal(history[1].statement.predecessor_disposition, 'retired');
  assert.equal(history[1].statement.operational_key_id, machineIdentityKeyId(operational2.publicKey));
  assert.equal(verifyMachineIdentityCredential(first, {
    trustedIssuerPublicKey: issuer.publicKey
  }).credential_digest, first.credential_digest);
});

test('successor creation requires complete history and rejects operational key reuse across non-adjacent epochs', () => {
  const issuer = keys();
  const operational1 = keys();
  const operational2 = keys();
  const first = genesis({ issuer, operational: operational1 });
  const second = createMachineIdentityCredential({
    principal: principal(),
    issuerId: 'identity.owner.alice',
    issuerPrivateKey: issuer.privateKey,
    operationalPublicKey: operational2.publicKey,
    keyEpoch: 2,
    issuedAt: '2026-08-18T20:00:00.000Z',
    validFrom: '2026-08-18T20:00:00.000Z',
    expiresAt: '2026-08-26T20:00:00.000Z',
    transitionKind: 'rotation',
    predecessorDisposition: 'retired',
    credentialHistory: [first],
    knownHumanPrincipals: humans
  });

  assert.throws(() => createMachineIdentityCredential({
    principal: principal(),
    issuerId: 'identity.owner.alice',
    issuerPrivateKey: issuer.privateKey,
    operationalPublicKey: operational1.publicKey,
    keyEpoch: 3,
    issuedAt: '2026-08-19T20:00:00.000Z',
    validFrom: '2026-08-19T20:00:00.000Z',
    expiresAt: '2026-08-27T20:00:00.000Z',
    transitionKind: 'rotation',
    predecessorDisposition: 'retired',
    credentialHistory: [first, second],
    knownHumanPrincipals: humans
  }), /must not reuse any prior operational key/);

  assert.throws(() => createMachineIdentityCredential({
    principal: principal(),
    issuerId: 'identity.owner.alice',
    issuerPrivateKey: issuer.privateKey,
    operationalPublicKey: keys().publicKey,
    keyEpoch: 3,
    issuedAt: '2026-08-19T20:00:00.000Z',
    validFrom: '2026-08-19T20:00:00.000Z',
    expiresAt: '2026-08-27T20:00:00.000Z',
    transitionKind: 'rotation',
    predecessorDisposition: 'retired',
    credentialHistory: [second],
    knownHumanPrincipals: humans
  }), /requires complete credential history/);
});

test('recovery requires revoked or compromised predecessor semantics', () => {
  const issuer = keys();
  const first = genesis({ issuer, operational: keys() });

  assert.throws(() => createMachineIdentityCredential({
    principal: principal(),
    issuerId: 'identity.owner.alice',
    issuerPrivateKey: issuer.privateKey,
    operationalPublicKey: keys().publicKey,
    keyEpoch: 2,
    issuedAt: '2026-08-18T20:00:00.000Z',
    validFrom: '2026-08-18T20:00:00.000Z',
    expiresAt: '2026-08-26T20:00:00.000Z',
    transitionKind: 'recovery',
    predecessorDisposition: 'retired',
    credentialHistory: [first],
    knownHumanPrincipals: humans
  }), /recovery requires revoked or compromised predecessor/);

  const recovered = createMachineIdentityCredential({
    principal: principal(),
    issuerId: 'identity.owner.alice',
    issuerPrivateKey: issuer.privateKey,
    operationalPublicKey: keys().publicKey,
    keyEpoch: 2,
    issuedAt: '2026-08-18T20:00:00.000Z',
    validFrom: '2026-08-18T20:00:00.000Z',
    expiresAt: '2026-08-26T20:00:00.000Z',
    transitionKind: 'recovery',
    predecessorDisposition: 'compromised',
    credentialHistory: [first],
    knownHumanPrincipals: humans
  });
  assert.equal(recovered.statement.predecessor_disposition, 'compromised');
});

test('issuer-signed revocation binds exact credential epoch and currentness remains evidence-relative', () => {
  const issuer = keys();
  const first = genesis({ issuer, operational: keys() });
  const revocation = createMachineIdentityRevocation({
    credential: first,
    issuerPrivateKey: issuer.privateKey,
    effectiveAt: '2026-08-18T00:00:00.000Z',
    reasonCode: 'operator-revoked'
  });
  const verifiedRevocation = verifyMachineIdentityRevocation(revocation, {
    trustedIssuerPublicKey: issuer.publicKey,
    expectedIssuerId: 'identity.owner.alice',
    expectedPrincipalId: 'agent.researcher.1'
  });
  assert.equal(verifiedRevocation.statement.credential_digest, first.credential_digest);

  const before = evaluateMachineIdentityCurrentness({
    credentialHistory: [first],
    revocations: [revocation],
    trustedIssuerPublicKey: issuer.publicKey,
    at: '2026-08-17T23:00:00.000Z'
  });
  assert.equal(before.status, 'active');
  assert.equal(before.global_currentness_claimed, false);
  assert.equal(before.evidence_scope, 'supplied-issuer-evidence-only');

  const after = evaluateMachineIdentityCurrentness({
    credentialHistory: [first],
    revocations: [revocation],
    trustedIssuerPublicKey: issuer.publicKey,
    at: '2026-08-18T01:00:00.000Z'
  });
  assert.equal(after.status, 'revoked');
  assert.equal(after.revocation_digest, revocation.revocation_digest);
});

test('currentness selects the newest activated epoch while preserving old credential auditability', () => {
  const issuer = keys();
  const first = genesis({ issuer, operational: keys() });
  const second = createMachineIdentityCredential({
    principal: principal(),
    issuerId: 'identity.owner.alice',
    issuerPrivateKey: issuer.privateKey,
    operationalPublicKey: keys().publicKey,
    keyEpoch: 2,
    issuedAt: '2026-08-18T20:00:00.000Z',
    validFrom: '2026-08-18T20:00:00.000Z',
    expiresAt: '2026-08-26T20:00:00.000Z',
    transitionKind: 'rotation',
    predecessorDisposition: 'retired',
    credentialHistory: [first],
    knownHumanPrincipals: humans
  });
  assert.equal(evaluateMachineIdentityCurrentness({
    credentialHistory: [first, second],
    revocations: [],
    trustedIssuerPublicKey: issuer.publicKey,
    at: '2026-08-18T19:00:00.000Z'
  }).key_epoch, 1);
  assert.equal(evaluateMachineIdentityCurrentness({
    credentialHistory: [first, second],
    revocations: [],
    trustedIssuerPublicKey: issuer.publicKey,
    at: '2026-08-18T21:00:00.000Z'
  }).key_epoch, 2);
  assert.equal(verifyMachineIdentityCredential(first, {
    trustedIssuerPublicKey: issuer.publicKey
  }).credential_digest, first.credential_digest);
});

test('credential lifetime cannot exceed a non-persistent machine principal and unknown fields fail closed', () => {
  const issuer = keys();
  assert.throws(() => genesis({
    issuer,
    operational: keys(),
    overrides: { expiresAt: '2026-09-02T00:00:00.000Z' }
  }), /cannot outlive its machine principal/);

  const credential = genesis({ issuer, operational: keys() });
  const unknown = structuredClone(credential);
  unknown.statement.vendor_reputation = 100;
  assert.throws(
    () => verifyMachineIdentityCredential(unknown, { trustedIssuerPublicKey: issuer.publicKey }),
    /unsupported field vendor_reputation/
  );
});
