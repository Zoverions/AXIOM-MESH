import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import {
  createMachineIdentityCredential,
  createMachineIdentityRevocation
} from '../src/lib/agent-trust-machine-identity.mjs';
import {
  createMachineHolderPresentation,
  verifyMachineHolderPresentation
} from '../src/lib/machine-holder-presentation.mjs';

const T0 = '2026-09-24T10:00:00.000Z';
const T1 = '2026-09-24T10:01:00.000Z';
const T2 = '2026-09-24T10:02:00.000Z';
const T3 = '2026-09-24T10:03:00.000Z';
const T4 = '2026-09-24T10:04:00.000Z';
const NONCE = 'test-challenge-opaque-001';

function fixture() {
  const issuer = generateKeyPairSync('ed25519');
  const holder = generateKeyPairSync('ed25519');
  const credential = createMachineIdentityCredential({
    principal: {
      id: 'agent.fixture.1',
      type: 'agent',
      sponsor: 'owner.alice',
      roles: ['researcher'],
      scopes: ['intent:execute'],
      lifetime: 'session',
      expires_at: '2026-09-25T10:00:00.000Z',
      runtime: { id: 'runtime.fixture.1', kind: 'local-process', software_digest: 'a'.repeat(64) },
      constraints: {
        actions: ['system.echo'],
        purposes: ['test.conformance'],
        destinations: ['local'],
        budgets: {
          max_requests_per_minute: 10,
          max_concurrent_requests: 1,
          max_execution_ms: 5000,
          max_request_bytes: 65536,
          max_response_bytes: 262144
        },
        delegation: { allowed: false, max_depth: 0 }
      }
    },
    issuerId: 'issuer.fixture',
    issuerPrivateKey: issuer.privateKey,
    operationalPublicKey: holder.publicKey,
    keyEpoch: 1,
    issuedAt: T0,
    validFrom: T0,
    expiresAt: '2026-09-25T10:00:00.000Z',
    knownHumanPrincipals: new Set(['owner.alice'])
  });
  const create = (changes = {}) => createMachineHolderPresentation({
    credential,
    trustedIssuerPublicKey: issuer.publicKey,
    expectedIssuerId: 'issuer.fixture',
    holderPrivateKey: holder.privateKey,
    audienceId: 'verifier.fixture',
    purpose: 'test.conformance',
    nonce: NONCE,
    issuedAt: T1,
    expiresAt: T4,
    ...changes
  });
  const verify = (presentation, changes = {}) => verifyMachineHolderPresentation(presentation, {
    credential,
    trustedIssuerPublicKey: issuer.publicKey,
    expectedIssuerId: 'issuer.fixture',
    expectedPrincipalId: 'agent.fixture.1',
    expectedAudienceId: 'verifier.fixture',
    expectedPurpose: 'test.conformance',
    expectedNonce: NONCE,
    at: T2,
    ...changes
  });
  return { issuer, holder, credential, create, verify };
}

test('issuer-pinned credential and holder key answer one exact challenge without authority', () => {
  const f = fixture();
  const proof = f.create();
  const result = f.verify(proof);
  assert.equal(result.valid, true);
  assert.equal(result.credential_digest, f.credential.credential_digest);
  assert.equal(result.principal_id, 'agent.fixture.1');
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.global_currentness_claimed, false);
  assert.equal(result.revocation_currentness_claimed, false);
  assert.equal(Object.hasOwn(result, 'credential'), false);
  assert.equal(Object.hasOwn(result, 'holder_signature'), false);
});

test('wrong audience, purpose, challenge and same-challenge consumed proof fail closed', () => {
  const f = fixture();
  const proof = f.create();
  assert.throws(() => f.verify(proof, { expectedAudienceId: 'verifier.other' }), /audience/i);
  assert.throws(() => f.verify(proof, { expectedPurpose: 'other.purpose' }), /purpose/i);
  assert.throws(() => f.verify(proof, { expectedNonce: 'different-challenge-001' }), /nonce|challenge/i);
  assert.throws(() => f.verify(proof, { consumedProofDigests: [proof.proof_digest] }), /consumed|replay/i);
  const reissued = f.create({ issuedAt: T2 });
  assert.notEqual(reissued.proof_digest, proof.proof_digest);
  assert.throws(() => f.verify(reissued, {
    at: T3,
    consumedNonceDigests: [f.verify(proof).nonce_digest]
  }), /consumed|replay/i);
});

test('wrong holder or issuer key, altered credential and signature tamper fail closed', () => {
  const f = fixture();
  const wrong = generateKeyPairSync('ed25519');
  assert.throws(() => f.create({ holderPrivateKey: wrong.privateKey }), /holder|operational/i);
  const proof = f.create();
  assert.throws(() => f.verify(proof, { trustedIssuerPublicKey: wrong.publicKey }), /issuer|key/i);
  const changed = structuredClone(f.credential);
  changed.statement.principal_id = 'agent.other';
  assert.throws(() => f.verify(proof, { credential: changed }), /digest|issuer|credential/i);
  const tampered = structuredClone(proof);
  tampered.statement.principal_id = 'agent.other';
  assert.throws(() => f.verify(tampered), /digest|signature|binding/i);
  const badSignature = structuredClone(proof);
  badSignature.holder_signature = `${proof.holder_signature[0] === 'A' ? 'B' : 'A'}${proof.holder_signature.slice(1)}`;
  assert.throws(() => f.verify(badSignature), /signature|digest/i);
});

test('future presentation, expiry and overlong lifetime reject', () => {
  const f = fixture();
  const proof = f.create();
  assert.throws(() => f.verify(proof, { at: T0 }), /future|valid/i);
  assert.throws(() => f.verify(proof, { at: T4 }), /expired/i);
  assert.throws(() => f.create({ expiresAt: '2026-09-24T10:07:00.000Z' }), /lifetime|five minutes/i);
});

test('a supplied issuer-signed revocation rejects the credential without a completeness claim', () => {
  const f = fixture();
  const proof = f.create();
  const revocation = createMachineIdentityRevocation({
    credential: f.credential,
    issuerPrivateKey: f.issuer.privateKey,
    effectiveAt: T2,
    reasonCode: 'synthetic-retirement'
  });
  assert.throws(() => f.verify(proof, { revocations: [revocation] }), /revoked/i);
  assert.equal(f.verify(proof).revocation_currentness_claimed, false);
  assert.throws(() => f.verify(proof, { at: T3, revocations: [revocation] }), /revoked/i);
});
