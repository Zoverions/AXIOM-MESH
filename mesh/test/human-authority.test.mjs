import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AUTHORITY_FACTS_SCHEMA,
  HUMAN_AUTHORITY_CONTRACT_ID,
  loadHumanAuthorityContract,
  resolveHumanAuthority,
  validateAuthorityGrant,
  validateRelationshipClaim
} from '../src/authority/human-authority.mjs';

const EVIDENCE = 'a'.repeat(64);
const GRANT_EVIDENCE = 'b'.repeat(64);
const JURISDICTION = 'c'.repeat(64);
const CONFLICT_EVIDENCE = 'd'.repeat(64);
const AS_OF = '2026-08-11T06:00:00.000Z';

function relationship(overrides = {}) {
  return {
    schema: 'axiom-human-relationship-claim.v1',
    claim_id: 'relationship_guardian_child_1',
    subject_id: 'learner.child.1',
    holder_id: 'adult.guardian.1',
    relationship_type: 'legal-guardian',
    issuer_id: 'authority.attestor.1',
    assurance: 'A3',
    evidence_digest: EVIDENCE,
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
    evidence_digest: GRANT_EVIDENCE,
    jurisdiction_context_digest: JURISDICTION,
    effective_from: '2026-01-01T00:00:00.000Z',
    effective_until: '2027-01-01T00:00:00.000Z',
    revocable: true,
    delegable: false,
    status: 'active',
    ...overrides
  };
}

function conflict(overrides = {}) {
  return {
    schema: 'axiom-human-authority-conflict.v1',
    conflict_id: 'conflict_guardian_education_1',
    subject_id: 'learner.child.1',
    grant_ids: ['authority_guardian_child_education_1'],
    evidence_digest: CONFLICT_EVIDENCE,
    jurisdiction_context_digest: JURISDICTION,
    effective_from: '2026-08-01T00:00:00.000Z',
    effective_until: null,
    status: 'unresolved',
    ...overrides
  };
}

function request(overrides = {}) {
  return {
    holderType: 'human',
    subjectId: 'learner.child.1',
    holderId: 'adult.guardian.1',
    grantId: 'authority_guardian_child_education_1',
    controller: 'capsule:axiom.education',
    purpose: 'learning-progress-recording',
    action: 'education.learner.event.append',
    dataScopes: ['learning-progress:write'],
    relationshipClaims: [relationship()],
    authorityGrants: [grant()],
    conflicts: [],
    asOf: AS_OF,
    ...overrides
  };
}

test('machine-readable human authority contract preserves non-authority invariants', async () => {
  const contract = await loadHumanAuthorityContract();
  assert.equal(contract.contract_id, HUMAN_AUTHORITY_CONTRACT_ID);
  assert.equal(contract.status, 'foundation-not-runtime-enabled');
  assert.equal(contract.authority_grant.delegable_v1, false);
  assert.equal(contract.resolution.exact_grant_id_required, true);
  assert.equal(contract.resolution.unresolved_conflict_for_grant_denies, true);
  assert.ok(contract.core_invariants.includes('relationship-is-not-authority'));
  assert.ok(contract.core_invariants.includes('authority-is-not-consent'));
});

test('relationship claims cannot contain authority fields', () => {
  assert.throws(
    () => validateRelationshipClaim(relationship({
      actions: ['education.learner.event.append']
    })),
    /may not contain authority field: actions/
  );
  assert.throws(
    () => validateRelationshipClaim(relationship({
      data_scopes: ['learning-progress:write']
    })),
    /may not contain authority field: data_scopes/
  );
});

test('relationship alone never authorizes a delegated action', () => {
  const result = resolveHumanAuthority(request({ authorityGrants: [] }));
  assert.deepEqual(result, {
    allow: false,
    code: 'authority_grant_unavailable',
    reason: 'The requested authority grant is unavailable.'
  });
});

test('one exact active grant resolves bounded guardian education authority', () => {
  const result = resolveHumanAuthority(request());
  assert.equal(result.allow, true);
  assert.equal(result.facts.schema, AUTHORITY_FACTS_SCHEMA);
  assert.equal(result.facts.subject_id, 'learner.child.1');
  assert.equal(result.facts.holder_id, 'adult.guardian.1');
  assert.equal(result.facts.grant_id, 'authority_guardian_child_education_1');
  assert.equal(result.facts.relationship_claim_id, 'relationship_guardian_child_1');
  assert.equal(result.facts.controller, 'capsule:axiom.education');
  assert.equal(result.facts.action, 'education.learner.event.append');
  assert.deepEqual(result.facts.data_scopes, ['learning-progress:write']);
  assert.match(result.authority_digest, /^[a-f0-9]{64}$/);
  assert.ok(result.non_claims.includes('authority-grant-does-not-create-consent'));
  assert.ok(result.non_claims.includes('runtime-action-still-requires-policy-and-consent'));
});

test('a generic parent or guardian role is irrelevant without the exact grant', () => {
  const withInventedRole = {
    ...request(),
    holderRoles: ['parent', 'guardian', 'admin'],
    grantId: 'authority_missing'
  };
  const result = resolveHumanAuthority(withInventedRole);
  assert.equal(result.allow, false);
  assert.equal(result.code, 'authority_grant_unavailable');
});

test('cross-child and cross-holder substitution fail closed', () => {
  const wrongChild = resolveHumanAuthority(request({ subjectId: 'learner.child.2' }));
  assert.equal(wrongChild.allow, false);
  assert.equal(wrongChild.code, 'authority_grant_subject_mismatch');

  const wrongAdult = resolveHumanAuthority(request({ holderId: 'adult.guardian.2' }));
  assert.equal(wrongAdult.allow, false);
  assert.equal(wrongAdult.code, 'authority_grant_subject_mismatch');
});

test('revoked, superseded, expired, and low-assurance grants fail closed', () => {
  for (const candidate of [
    grant({ status: 'revoked' }),
    grant({ status: 'superseded' }),
    grant({ effective_until: '2026-08-11T05:59:59.000Z' }),
    grant({ assurance: 'A1' })
  ]) {
    const result = resolveHumanAuthority(request({ authorityGrants: [candidate] }));
    assert.equal(result.allow, false);
    assert.equal(result.code, 'authority_grant_inactive');
  }
});

test('revoked, expired, and low-assurance relationship invalidates an otherwise active grant', () => {
  for (const candidate of [
    relationship({ status: 'revoked' }),
    relationship({ effective_until: '2026-08-11T05:59:59.000Z' }),
    relationship({ assurance: 'A1' })
  ]) {
    const result = resolveHumanAuthority(request({ relationshipClaims: [candidate] }));
    assert.equal(result.allow, false);
    assert.equal(result.code, 'authority_relationship_inactive');
  }
});

test('relationship and grant must bind the same subject, holder, and jurisdiction context', () => {
  const holderMismatch = resolveHumanAuthority(request({
    relationshipClaims: [relationship({ holder_id: 'adult.other' })]
  }));
  assert.equal(holderMismatch.allow, false);
  assert.equal(holderMismatch.code, 'authority_relationship_mismatch');

  const jurisdictionMismatch = resolveHumanAuthority(request({
    relationshipClaims: [relationship({ jurisdiction_context_digest: 'e'.repeat(64) })]
  }));
  assert.equal(jurisdictionMismatch.allow, false);
  assert.equal(jurisdictionMismatch.code, 'authority_relationship_mismatch');
});

test('controller, purpose, action, and data scopes cannot exceed the selected grant', () => {
  const cases = [
    ['authority_controller_denied', { controller: 'capsule:axiom.health' }],
    ['authority_purpose_denied', { purpose: 'personalized-local-tutoring' }],
    ['authority_action_denied', { action: 'education.portfolio.export' }],
    ['authority_data_scope_denied', {
      dataScopes: ['learning-progress:read', 'learning-progress:write']
    }]
  ];
  for (const [code, override] of cases) {
    const result = resolveHumanAuthority(request(override));
    assert.equal(result.allow, false);
    assert.equal(result.code, code);
  }
});

test('requested scopes cannot be assembled by unioning multiple partial grants', () => {
  const selected = grant({
    grant_id: 'authority_partial_selected',
    data_scopes: ['learning-progress:write']
  });
  const other = grant({
    grant_id: 'authority_partial_other',
    data_scopes: ['portfolio:export']
  });
  const result = resolveHumanAuthority(request({
    grantId: 'authority_partial_selected',
    authorityGrants: [selected, other],
    dataScopes: ['learning-progress:write', 'portfolio:export']
  }));
  assert.equal(result.allow, false);
  assert.equal(result.code, 'authority_data_scope_denied');
});

test('unresolved conflict on the exact grant denies while resolved conflict does not', () => {
  const blocked = resolveHumanAuthority(request({ conflicts: [conflict()] }));
  assert.equal(blocked.allow, false);
  assert.equal(blocked.code, 'authority_conflict_unresolved');

  const resolved = resolveHumanAuthority(request({
    conflicts: [conflict({ status: 'resolved' })]
  }));
  assert.equal(resolved.allow, true);
});

test('machine holders and transitive delegation are explicitly outside v1', () => {
  const machine = resolveHumanAuthority(request({ holderType: 'agent' }));
  assert.equal(machine.allow, false);
  assert.equal(machine.code, 'authority_holder_type_unavailable');

  assert.throws(
    () => validateAuthorityGrant(grant({ delegable: true })),
    /does not permit transitive delegation/
  );
});

test('callers cannot lower delegated authority assurance below A2', () => {
  assert.throws(
    () => resolveHumanAuthority(request({ minimumAssurance: 'A1' })),
    /cannot be lower than A2/
  );
});
