import assert from 'node:assert/strict';
import test from 'node:test';
import {
  authorizeHumanAuthorityAttestation,
  validateHumanAuthorityAttestorProfile
} from '../src/authority/human-authority-attestor.mjs';

const JURISDICTION = 'c'.repeat(64);
const POLICY = 'd'.repeat(64);
const EVIDENCE = 'e'.repeat(64);

function profile(overrides = {}) {
  return {
    schema: 'axiom-human-authority-attestor-profile.v1',
    profile_id: 'attestor_profile_1',
    attestor_id: 'authority.attestor.1',
    attestor_type: 'service',
    artifact_classes: ['authority-conflict', 'authority-grant', 'relationship-claim'],
    relationship_types: ['legal-guardian'],
    authority_sources: ['guardian'],
    jurisdiction_context_digests: [JURISDICTION],
    maximum_assurance: 'A3',
    policy_digest: POLICY,
    evidence_digest: EVIDENCE,
    effective_from: '2026-01-01T00:00:00.000Z',
    effective_until: '2027-01-01T00:00:00.000Z',
    status: 'active',
    ...overrides
  };
}

function relationship(overrides = {}) {
  return {
    schema: 'axiom-human-relationship-claim.v1',
    claim_id: 'relationship_guardian_child_1',
    subject_id: 'learner.child.1',
    holder_id: 'adult.guardian.1',
    relationship_type: 'legal-guardian',
    issuer_id: 'authority.attestor.1',
    assurance: 'A3',
    evidence_digest: 'a'.repeat(64),
    jurisdiction_context_digest: JURISDICTION,
    effective_from: '2026-01-01T00:00:00.000Z',
    effective_until: null,
    status: 'active',
    ...overrides
  };
}

function grant(overrides = {}) {
  return {
    schema: 'axiom-human-authority-grant.v1',
    grant_id: 'authority_guardian_child_education_1',
    subject_id: 'learner.child.1',
    holder_id: 'adult.guardian.1',
    relationship_claim_id: 'relationship_guardian_child_1',
    issuer_id: 'authority.attestor.1',
    authority_source: 'guardian',
    controllers: ['capsule:axiom.education'],
    purposes: ['learning-progress-recording'],
    data_scopes: ['learning-progress:write'],
    actions: ['education.learner.event.append'],
    assurance: 'A3',
    evidence_digest: 'b'.repeat(64),
    jurisdiction_context_digest: JURISDICTION,
    effective_from: '2026-01-01T00:00:00.000Z',
    effective_until: '2027-01-01T00:00:00.000Z',
    revocable: true,
    delegable: false,
    status: 'active',
    ...overrides
  };
}

const principal = { id: 'authority.attestor.1', type: 'service' };
const now = '2026-08-11T10:00:00.000Z';

test('attestor profile is exact, bounded and digestable', () => {
  const value = validateHumanAuthorityAttestorProfile(profile());
  assert.equal(value.profile_id, 'attestor_profile_1');
  assert.equal(value.maximum_assurance, 'A3');
  assert.deepEqual(value.relationship_types, ['legal-guardian']);
  assert.throws(
    () => validateHumanAuthorityAttestorProfile(profile({ relationship_types: ['*'] })),
    /invalid format/
  );
});

test('exact attestor may attest a bounded relationship and grant', () => {
  const rel = authorizeHumanAuthorityAttestation({
    principal,
    profile: profile(),
    artifactClass: 'relationship-claim',
    artifact: relationship(),
    now
  });
  assert.equal(rel.allow, true);
  assert.equal(rel.facts.attestor_id, principal.id);
  assert.equal(rel.facts.artifact_class, 'relationship-claim');

  const auth = authorizeHumanAuthorityAttestation({
    principal,
    profile: profile(),
    artifactClass: 'authority-grant',
    artifact: grant(),
    now
  });
  assert.equal(auth.allow, true);
  assert.equal(auth.facts.assurance, 'A3');
});

test('role labels and mismatched principals cannot substitute for attestor authority', () => {
  const result = authorizeHumanAuthorityAttestation({
    principal: { id: 'adult.guardian.1', type: 'human', roles: ['guardian'] },
    profile: profile(),
    artifactClass: 'relationship-claim',
    artifact: relationship(),
    now
  });
  assert.equal(result.allow, false);
  assert.equal(result.code, 'authority_attestor_unavailable');
});

test('issuer, relationship type, authority source, jurisdiction and assurance are bounded', () => {
  const wrongIssuer = authorizeHumanAuthorityAttestation({
    principal,
    profile: profile(),
    artifactClass: 'relationship-claim',
    artifact: relationship({ issuer_id: 'other.attestor' }),
    now
  });
  assert.equal(wrongIssuer.code, 'authority_attestor_relationship_denied');

  const wrongType = authorizeHumanAuthorityAttestation({
    principal,
    profile: profile(),
    artifactClass: 'relationship-claim',
    artifact: relationship({ relationship_type: 'teacher' }),
    now
  });
  assert.equal(wrongType.code, 'authority_attestor_relationship_denied');

  const wrongSource = authorizeHumanAuthorityAttestation({
    principal,
    profile: profile(),
    artifactClass: 'authority-grant',
    artifact: grant({ authority_source: 'institution' }),
    now
  });
  assert.equal(wrongSource.code, 'authority_attestor_grant_denied');

  const wrongJurisdiction = authorizeHumanAuthorityAttestation({
    principal,
    profile: profile(),
    artifactClass: 'authority-grant',
    artifact: grant({ jurisdiction_context_digest: 'f'.repeat(64) }),
    now
  });
  assert.equal(wrongJurisdiction.code, 'authority_attestor_jurisdiction_denied');

  const overAssurance = authorizeHumanAuthorityAttestation({
    principal,
    profile: profile({ maximum_assurance: 'A2' }),
    artifactClass: 'authority-grant',
    artifact: grant(),
    now
  });
  assert.equal(overAssurance.code, 'authority_attestor_assurance_denied');
});

test('revoked and expired attestor profiles fail closed', () => {
  const revoked = authorizeHumanAuthorityAttestation({
    principal,
    profile: profile({ status: 'revoked' }),
    artifactClass: 'relationship-claim',
    artifact: relationship(),
    now
  });
  assert.equal(revoked.code, 'authority_attestor_unavailable');

  const expired = authorizeHumanAuthorityAttestation({
    principal,
    profile: profile({ effective_until: '2026-08-10T00:00:00.000Z' }),
    artifactClass: 'relationship-claim',
    artifact: relationship(),
    now
  });
  assert.equal(expired.code, 'authority_attestor_unavailable');
});
