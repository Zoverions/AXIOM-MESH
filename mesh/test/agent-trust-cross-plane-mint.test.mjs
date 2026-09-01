import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import {
  createMachineIdentityCoreCredential
} from '../src/lib/agent-trust-machine-identity-core.mjs';
import {
  createCrossPlaneOperationalMintReceipt,
  crossPlaneMintKeyId,
  verifyCrossPlaneOperationalMintReceipt
} from '../src/lib/agent-trust-cross-plane-mint.mjs';

function keys() {
  return generateKeyPairSync('ed25519');
}

function identityCore({ issuer, operational } = {}) {
  return createMachineIdentityCoreCredential({
    principalId: 'agent.cross-plane.1',
    principalType: 'agent',
    issuerId: 'identity.cross-plane.1',
    issuerPrivateKey: issuer.privateKey,
    operationalPublicKey: operational.publicKey,
    keyEpoch: 1,
    issuedAt: '2026-09-01T16:00:00.000Z',
    validFrom: '2026-09-01T16:00:00.000Z',
    expiresAt: '2026-10-01T16:00:00.000Z'
  });
}

function authority(overrides = {}) {
  return {
    principal_id: 'agent.cross-plane.1',
    authority_head_digest: 'a'.repeat(64),
    authority_digest: 'b'.repeat(64),
    authority_source_key_id: 'c'.repeat(64),
    authority_sequence: 7,
    authority_evaluated_at: '2026-09-01T16:05:00.000Z',
    authority_verification_digest: 'd'.repeat(64),
    ...overrides
  };
}

function mintFixture(overrides = {}) {
  const issuer = keys();
  const operational = keys();
  const minter = keys();
  const core = identityCore({ issuer, operational });
  return {
    issuer,
    operational,
    minter,
    core,
    input: {
      mintId: 'mint.cross-plane.1',
      mintKind: 'runtime-binding',
      artifactDigest: 'e'.repeat(64),
      identityCoreCredential: core,
      trustedIdentityIssuerPublicKey: issuer.publicKey,
      verifiedAuthorityCurrentness: authority(),
      expectedLatestAuthorityHeadDigest: 'a'.repeat(64),
      runtimeEvidenceDigest: 'f'.repeat(64),
      relationshipEvidenceDigest: '1'.repeat(64),
      mintSignerId: 'minter.cross-plane.1',
      mintSignerPrivateKey: minter.privateKey,
      mintedAt: '2026-09-01T16:06:00.000Z',
      ...overrides
    }
  };
}

test('operational mint binds exact stable identity, authority-currentness head, runtime evidence, and relationship evidence without granting authority', () => {
  const f = mintFixture();
  const receipt = createCrossPlaneOperationalMintReceipt(f.input);
  const verified = verifyCrossPlaneOperationalMintReceipt(receipt, {
    trustedMintSignerPublicKey: f.minter.publicKey,
    expectedMintSignerId: 'minter.cross-plane.1',
    expectedPrincipalId: 'agent.cross-plane.1'
  });

  assert.equal(
    verified.statement.identity_core_credential_digest,
    f.core.credential_digest
  );
  assert.equal(verified.statement.identity_core_key_epoch, 1);
  assert.equal(
    verified.statement.identity_operational_key_id,
    f.core.statement.operational_key_id
  );
  assert.equal(verified.statement.authority_head_digest, 'a'.repeat(64));
  assert.equal(verified.statement.authority_digest, 'b'.repeat(64));
  assert.equal(verified.statement.authority_source_key_id, 'c'.repeat(64));
  assert.equal(verified.statement.authority_sequence, 7);
  assert.equal(
    verified.statement.authority_verification_digest,
    'd'.repeat(64)
  );
  assert.equal(verified.statement.runtime_evidence_digest, 'f'.repeat(64));
  assert.equal(verified.statement.relationship_evidence_digest, '1'.repeat(64));
  assert.equal(verified.statement.artifact_digest, 'e'.repeat(64));
  assert.equal(verified.statement.mint_signer_key_id, crossPlaneMintKeyId(f.minter.publicKey));
  assert.equal(verified.statement.authority_source_verification_external, true);
  assert.equal(verified.statement.effect_admission_authorized, false);
  assert.equal(verified.statement.current_authority_claimed, false);
  assert.equal(verified.statement.authority_effect, 'none');
  assert.equal(verified.statement.delegation_effect, 'none');
});

test('mint fails closed when a still-valid historical authority head is not the independently retained latest head', () => {
  const f = mintFixture({
    verifiedAuthorityCurrentness: authority({
      authority_head_digest: '2'.repeat(64),
      authority_sequence: 6,
      authority_evaluated_at: '2026-09-01T16:04:00.000Z'
    }),
    expectedLatestAuthorityHeadDigest: '3'.repeat(64)
  });

  assert.throws(
    () => createCrossPlaneOperationalMintReceipt(f.input),
    /authority head is not the retained latest head/
  );
});

test('mint rejects cross-principal authority substitution and requires runtime evidence for a runtime binding', () => {
  const mismatched = mintFixture({
    verifiedAuthorityCurrentness: authority({ principal_id: 'agent.other.1' })
  });
  assert.throws(
    () => createCrossPlaneOperationalMintReceipt(mismatched.input),
    /authority principal does not match stable identity core/
  );

  const missingRuntime = mintFixture({ runtimeEvidenceDigest: null });
  assert.throws(
    () => createCrossPlaneOperationalMintReceipt(missingRuntime.input),
    /runtime-binding mint requires runtime evidence/
  );
});

test('historical mint remains verifiable after authority changes but does not become present authorization', () => {
  const f = mintFixture();
  const receipt = createCrossPlaneOperationalMintReceipt(f.input);

  // A later authority head may differ; historical verification intentionally
  // does not reinterpret the old mint as current permission.
  const laterAuthorityHead = '9'.repeat(64);
  assert.notEqual(laterAuthorityHead, receipt.statement.authority_head_digest);

  const verified = verifyCrossPlaneOperationalMintReceipt(receipt, {
    trustedMintSignerPublicKey: f.minter.publicKey,
    expectedPrincipalId: 'agent.cross-plane.1'
  });
  assert.equal(verified.receipt_digest, receipt.receipt_digest);
  assert.equal(verified.statement.current_authority_claimed, false);
  assert.equal(verified.statement.effect_admission_authorized, false);
});

test('cross-plane mint receipt rejects signer substitution and statement tamper', () => {
  const f = mintFixture();
  const receipt = createCrossPlaneOperationalMintReceipt(f.input);

  assert.throws(
    () => verifyCrossPlaneOperationalMintReceipt(receipt, {
      trustedMintSignerPublicKey: keys().publicKey
    }),
    /mint signer key substitution/
  );

  const tampered = structuredClone(receipt);
  tampered.statement.authority_digest = '0'.repeat(64);
  assert.throws(
    () => verifyCrossPlaneOperationalMintReceipt(tampered, {
      trustedMintSignerPublicKey: f.minter.publicKey
    }),
    /statement digest mismatch/
  );
});
