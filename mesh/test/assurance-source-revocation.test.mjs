import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import {
  ENTITY_ASSURANCE_EVIDENCE_SCHEMA,
  ENTITY_ASSURANCE_POLICY_SCHEMA
} from '../src/lib/entity-assurance.mjs';
import { MeshIdentity } from '../src/lib/identity.mjs';
import {
  admitEntityAssuranceSource,
  buildDurableAssuranceSourceAdmission
} from '../src/lib/assurance-source-broker.mjs';
import {
  assertDurableAssuranceSourceAdmissionNotRevoked,
  buildAssuranceSourceRevocationSnapshot,
  verifyAssuranceSourceRevocationSnapshot
} from '../src/lib/assurance-source-revocation.mjs';

const NOW = '2026-09-01T12:00:00.000Z';

function signingIdentity(service = 'grid') {
  const pair = generateKeyPairSync('ed25519');
  return {
    identity: new MeshIdentity(
      service,
      pair.privateKey.export({ type: 'pkcs8', format: 'pem' }),
      pair.publicKey.export({ type: 'spki', format: 'pem' })
    ),
    publicKey: pair.publicKey
  };
}

function policy() {
  return {
    schema: ENTITY_ASSURANCE_POLICY_SCHEMA,
    policy_id: 'policy.revocation.entity',
    identity_requirement: 'none',
    requirements: [{
      dimension: 'reputation',
      minimum_strength: 'moderate',
      accepted_evidence_classes: ['independently_verified']
    }],
    authority_effect: 'none',
    delegation_effect: 'none'
  };
}

function evidence() {
  return {
    schema: ENTITY_ASSURANCE_EVIDENCE_SCHEMA,
    evidence_id: 'evidence.revocation.reputation',
    subject_id: 'agent.revocation',
    dimension: 'reputation',
    result: 'pass',
    strength: 'strong',
    evidence_class: 'independently_verified',
    basis_digest: 'a'.repeat(64),
    issuer_id: 'issuer.revocation',
    binding_scope: 'pseudonymous',
    observed_at: '2026-09-01T11:00:00.000Z',
    expires_at: '2026-09-02T11:00:00.000Z',
    non_authorizing: true
  };
}

function durable(identity) {
  const admission = admitEntityAssuranceSource({
    sourceId: 'source.revocation',
    policy: policy(),
    evidence: [evidence()],
    subjectId: 'agent.revocation',
    now: NOW
  });
  return buildDurableAssuranceSourceAdmission(admission, {
    identity,
    issuedAt: NOW,
    expiresAt: '2026-09-02T12:00:00.000Z'
  });
}

test('signed revocation snapshot can invalidate a durable admission before expiry', () => {
  const { identity, publicKey } = signingIdentity();
  const receipt = durable(identity);
  const snapshot = buildAssuranceSourceRevocationSnapshot({
    identity,
    sequence: 4,
    issuedAt: '2026-09-01T13:00:00.000Z',
    expiresAt: '2026-09-02T13:00:00.000Z',
    revokedAdmissionDigests: [receipt.statement.admission_digest]
  });

  assert.throws(
    () => assertDurableAssuranceSourceAdmissionNotRevoked(
      receipt,
      snapshot,
      publicKey,
      { now: '2026-09-01T14:00:00.000Z' }
    ),
    /is revoked/
  );
});

test('revocation can target the upstream source verification digest', () => {
  const { identity, publicKey } = signingIdentity();
  const receipt = durable(identity);
  const snapshot = buildAssuranceSourceRevocationSnapshot({
    identity,
    sequence: 5,
    issuedAt: '2026-09-01T13:00:00.000Z',
    expiresAt: '2026-09-02T13:00:00.000Z',
    revokedSourceVerificationDigests: [
      receipt.statement.source_verification_digest
    ]
  });

  assert.throws(
    () => assertDurableAssuranceSourceAdmissionNotRevoked(
      receipt,
      snapshot,
      publicKey,
      { now: '2026-09-01T14:00:00.000Z' }
    ),
    /is revoked/
  );
});

test('non-revoked admission can bind to a verified snapshot without claiming global currentness', () => {
  const { identity, publicKey } = signingIdentity();
  const receipt = durable(identity);
  const snapshot = buildAssuranceSourceRevocationSnapshot({
    identity,
    sequence: 6,
    issuedAt: '2026-09-01T13:00:00.000Z',
    expiresAt: '2026-09-02T13:00:00.000Z'
  });

  const result = assertDurableAssuranceSourceAdmissionNotRevoked(
    receipt,
    snapshot,
    publicKey,
    { now: '2026-09-01T14:00:00.000Z' }
  );
  assert.equal(result.valid, true);
  assert.equal(result.global_currentness_claimed, false);
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.revocation_sequence, 6);
});

test('revocation snapshots reject wrong keys, tampering, future state, and expiry', () => {
  const trusted = signingIdentity();
  const wrong = signingIdentity('other-grid');
  const snapshot = buildAssuranceSourceRevocationSnapshot({
    identity: trusted.identity,
    sequence: 7,
    issuedAt: '2026-09-01T13:00:00.000Z',
    expiresAt: '2026-09-02T13:00:00.000Z'
  });

  assert.throws(
    () => verifyAssuranceSourceRevocationSnapshot(
      snapshot,
      wrong.publicKey,
      { now: '2026-09-01T14:00:00.000Z' }
    ),
    /signature is invalid/
  );
  assert.throws(
    () => verifyAssuranceSourceRevocationSnapshot(
      snapshot,
      trusted.publicKey,
      { now: '2026-09-01T12:59:59.000Z' }
    ),
    /future-dated/
  );
  assert.throws(
    () => verifyAssuranceSourceRevocationSnapshot(
      snapshot,
      trusted.publicKey,
      { now: '2026-09-02T13:00:00.000Z' }
    ),
    /expired/
  );

  const tampered = JSON.parse(JSON.stringify(snapshot));
  tampered.statement.sequence = 8;
  assert.throws(
    () => verifyAssuranceSourceRevocationSnapshot(
      tampered,
      trusted.publicKey,
      { now: '2026-09-01T14:00:00.000Z' }
    ),
    /snapshot_digest mismatch|signature is invalid/
  );
});

test('revocation snapshot explicitly refuses a global-currentness claim', () => {
  const { identity, publicKey } = signingIdentity();
  const snapshot = buildAssuranceSourceRevocationSnapshot({
    identity,
    sequence: 9,
    issuedAt: '2026-09-01T13:00:00.000Z',
    expiresAt: '2026-09-02T13:00:00.000Z'
  });
  const verified = verifyAssuranceSourceRevocationSnapshot(
    snapshot,
    publicKey,
    { now: '2026-09-01T14:00:00.000Z' }
  );
  assert.equal(verified.global_currentness_claimed, false);
});
