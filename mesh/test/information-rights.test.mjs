import assert from 'node:assert/strict';
import test from 'node:test';
import {
  INFORMATION_RIGHTS_SCHEMA,
  validateInformationRightsEnvelope
} from '../src/domain/information-rights.mjs';

function fixture() {
  return {
    schema: INFORMATION_RIGHTS_SCHEMA,
    object_ref: 'record:clinical-1',
    information_class: 'clinical-note',
    sensitivity_class: 'restricted',
    relationships: {
      subjects: ['principal:patient'],
      originators: ['principal:clinician'],
      custodians: ['institution:hospital'],
      controllers: ['institution:hospital'],
      affected_parties: [],
      beneficiaries: ['principal:patient'],
      permitted_recipients: ['principal:care-team'],
      reviewers: [],
      auditors: [],
      decision_users: ['principal:clinician'],
      challengers: ['principal:patient'],
      disclosure_authorities: ['policy:health-access-v1'],
      retention_authorities: ['policy:health-retention-v1']
    },
    authority_basis: ['policy:health-access-v1'],
    allowed_purposes: ['care'],
    forbidden_purposes: ['advertising'],
    policy_refs: {
      access: ['policy:health-access-v1'],
      disclosure: ['policy:health-disclosure-v1'],
      retention: ['policy:health-retention-v1'],
      challenge: ['policy:health-challenge-v1'],
      correction: ['policy:health-correction-v1'],
      export: [],
      deletion: []
    },
    projection_profiles: ['projection:clinical-summary-v1'],
    jurisdiction_context: ['jurisdiction:example'],
    provenance_refs: ['evidence:event-1'],
    evidence_refs: [],
    state: { retention: 'active', challenge: 'none', supersession: 'current' },
    created_at: '2026-09-03T12:00:00.000Z',
    reviewed_at: null
  };
}

test('information rights preserve independent subject, author, custody, control, recipient, decision, challenge, and disclosure relationships', () => {
  const value = validateInformationRightsEnvelope(fixture());
  assert.deepEqual(value.relationships.subjects, ['principal:patient']);
  assert.deepEqual(value.relationships.originators, ['principal:clinician']);
  assert.deepEqual(value.relationships.custodians, ['institution:hospital']);
  assert.deepEqual(value.relationships.controllers, ['institution:hospital']);
  assert.deepEqual(value.relationships.permitted_recipients, ['principal:care-team']);
  assert.deepEqual(value.relationships.decision_users, ['principal:clinician']);
  assert.deepEqual(value.relationships.challengers, ['principal:patient']);
  assert.deepEqual(value.relationships.disclosure_authorities, ['policy:health-access-v1']);
});

test('subject status and authorship do not become universal ownership shortcuts', () => {
  assert.throws(() => validateInformationRightsEnvelope({ ...fixture(), owner: 'principal:patient' }), /unknown field owner|owner/);
  const authorOnly = fixture();
  authorOnly.relationships.subjects = [];
  assert.equal(validateInformationRightsEnvelope(authorOnly).relationships.originators[0], 'principal:clinician');
});

test('information rights envelope cannot carry execution authority', () => {
  assert.throws(() => validateInformationRightsEnvelope({ ...fixture(), execution_authority: ['read:anything'] }), /execution authority/);
});
