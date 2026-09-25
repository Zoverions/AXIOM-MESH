import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import { normalizeDelegationAuthority } from '../src/lib/delegation-graph.mjs';
import { createDelegationRootAttestation } from '../src/lib/delegation-root-attestation.mjs';
import {
  createPortableDelegationGrant,
  verifyPortableDelegationGrant
} from '../src/lib/delegation-portable-grant.mjs';

const T0 = '2026-08-27T20:00:00.000Z';
const T1 = '2026-08-27T21:00:00.000Z';
const T2 = '2026-08-27T22:00:00.000Z';
const T3 = '2026-08-27T23:00:00.000Z';

function fixture() {
  const signer = generateKeyPairSync('ed25519');
  const root = normalizeDelegationAuthority({
    schema: 'axiom-delegation-authority.v1',
    holder: 'owner.alice',
    actions: ['system.echo'],
    purposes: ['test.conformance'],
    data_scopes: [],
    destinations: ['local'],
    budgets: {
      max_requests_per_minute: 2,
      max_concurrent_requests: 1,
      max_execution_ms: 2000,
      max_request_bytes: 2048,
      max_response_bytes: 2048
    },
    required_assurance: 'A2',
    independent_approval_required: true,
    delegation: { allowed: true, max_depth: 1 },
    expires_at: '2026-08-28T00:00:00.000Z'
  });
  const rootBinding = {
    schema: 'axiom-delegation-root-binding.v1',
    root_holder: root.holder,
    root_authority_digest: root.authority_digest,
    execution_authority_granted: false,
    authority_effect: 'none'
  };
  rootBinding.binding_digest = digestObject(rootBinding);
  const attestation = createDelegationRootAttestation({
    root_binding: rootBinding,
    signer_id: root.holder,
    signer_private_key: signer.privateKey,
    issued_at: T0
  });
  const { authority_digest: _rootDigest, ...rootAuthorityFields } = root;
  const grant = {
    schema: 'axiom-delegation-grant.v1',
    id: 'grant.alice-reader',
    delegator: root.holder,
    delegate: 'agent.reader',
    parent_grant_id: null,
    issued_at: T1,
    authority: {
      ...rootAuthorityFields,
      holder: 'agent.reader',
      actions: ['system.echo'],
      budgets: { ...root.budgets, max_requests_per_minute: 1 },
      delegation: { allowed: false, max_depth: 0 },
      expires_at: T3
    }
  };
  const sign = (changes = {}) => createPortableDelegationGrant({
    root_authority: root,
    root_attestation: attestation,
    grant,
    signer_private_key: signer.privateKey,
    audience_id: 'verifier.example',
    signed_at: T2,
    ...changes
  });
  const verify = (proof, changes = {}) => verifyPortableDelegationGrant(proof, {
    root_authority: root,
    root_attestation: attestation,
    trusted_root_public_key: signer.publicKey,
    expected_root_binding_digest: rootBinding.binding_digest,
    expected_audience_id: 'verifier.example',
    now: T2,
    ...changes
  });
  return { signer, root, rootBinding, attestation, grant, sign, verify };
}

test('pinned one-hop signed provenance verifies without granting runtime or global currentness', () => {
  const f = fixture();
  const proof = f.sign();
  const result = f.verify(proof);
  assert.equal(result.valid, true);
  assert.equal(result.grant.delegate, 'agent.reader');
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.execution_authority_granted, false);
  assert.equal(result.global_currentness_claimed, false);
  assert.equal(result.revocation_currentness_claimed, false);
  assert.equal(result.chain_resolution.execution_authority_granted, false);
});

test('wrong audience, substituted owner key and rewritten delegate are rejected', () => {
  const f = fixture();
  const proof = f.sign();
  assert.throws(() => f.verify(proof, { expected_audience_id: 'verifier.other' }), /audience/i);
  const substitute = generateKeyPairSync('ed25519');
  assert.throws(() => f.verify(proof, { trusted_root_public_key: substitute.publicKey }), /key substitution|signature/i);
  const forged = structuredClone(proof);
  forged.grant.delegate = 'agent.attacker';
  forged.grant.authority.holder = 'agent.attacker';
  assert.throws(() => f.verify(forged), /digest|signature|binding/i);
  const inflated = structuredClone(proof);
  inflated.statement.authority_effect = 'execute';
  assert.throws(() => f.verify(inflated), /cannot claim execution or global currentness/i);
  const brokenSignature = structuredClone(proof);
  brokenSignature.signer_signature = `${proof.signer_signature[0] === 'A' ? 'B' : 'A'}${proof.signer_signature.slice(1)}`;
  const { proof_digest: _proofDigest, ...signed } = brokenSignature;
  brokenSignature.proof_digest = digestObject(signed);
  assert.throws(() => f.verify(brokenSignature), /signature is invalid/i);
  assert.throws(() => f.verify(proof, { expected_root_binding_digest: 'f'.repeat(64) }), /binding/i);
  const { authority_digest: _rootDigest, ...rootFields } = f.root;
  const substitutedRoot = normalizeDelegationAuthority({
    ...rootFields,
    independent_approval_required: false
  });
  assert.throws(() => f.verify(proof, { root_authority: substitutedRoot }), /root authority digest mismatch/i);
});

test('owner signature cannot turn an attenuated grant into wider authority or a child hop', () => {
  const f = fixture();
  assert.throws(() => f.sign({ grant: {
    ...f.grant,
    authority: { ...f.grant.authority, actions: ['system.echo', 'memory.read'] }
  } }), /expands actions/i);
  assert.throws(() => f.sign({ grant: { ...f.grant, parent_grant_id: 'grant.other' } }), /one-hop|parent/i);
});

test('future signing, expiry, and supplied revocation fail closed without implying revocation completeness', () => {
  const f = fixture();
  const proof = f.sign();
  assert.throws(() => f.verify(proof, { now: T1 }), /future|not active/i);
  assert.throws(() => f.verify(proof, { now: '2026-08-28T00:01:00.000Z' }), /expired/i);
  assert.throws(() => f.verify(proof, {
    revocations: [{
      schema: 'axiom-delegation-revocation.v1',
      id: 'revoke.reader',
      grant_id: f.grant.id,
      revoked_by: f.root.holder,
      revoked_at: T2,
      reason: 'local observed revocation'
    }]
  }), /revoked/i);
});
