import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SOVEREIGN_INFORMATION_BUNDLE_SCHEMA,
  buildSovereignInformationBundle,
  validateSovereignInformationBundle
} from '../src/lib/sovereign-information-portability.mjs';
import { INFORMATION_RIGHTS_SCHEMA } from '../src/domain/information-rights.mjs';
import { EVIDENCE_ASSERTION_SCHEMA } from '../src/domain/evidence-graph.mjs';

const createdAt = '2026-09-03T12:00:00.000Z';

function rights() {
  return {
    schema: INFORMATION_RIGHTS_SCHEMA,
    object_ref: 'record:portable',
    information_class: 'clinical-note',
    sensitivity_class: 'restricted',
    relationships: {
      subjects: ['principal:patient'], originators: ['principal:clinician'], custodians: ['institution:hospital'], controllers: ['institution:hospital'],
      affected_parties: [], beneficiaries: [], permitted_recipients: [], reviewers: [], auditors: [], decision_users: [], challengers: [],
      disclosure_authorities: ['policy:access'], retention_authorities: ['policy:retain']
    },
    authority_basis: ['policy:access'], allowed_purposes: ['care'], forbidden_purposes: [],
    policy_refs: { access: ['policy:access'], disclosure: ['policy:disclose'], retention: ['policy:retain'], challenge: [], correction: [], export: ['policy:export'], deletion: [] },
    projection_profiles: [], jurisdiction_context: [], provenance_refs: [], evidence_refs: [],
    state: { retention: 'active', challenge: 'none', supersession: 'current' }, created_at: createdAt, reviewed_at: null
  };
}

function assertion() {
  return {
    schema: EVIDENCE_ASSERTION_SCHEMA,
    assertion_id: 'assertion:portable',
    type: 'observation',
    proposition: 'Observed event',
    source_ref: 'principal:observer',
    epistemic_state: 'asserted',
    purpose_scope: ['investigation'],
    provenance_refs: ['artifact:source'],
    created_at: createdAt
  };
}

const records = [
  { storage_id: 'siea_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', object_kind: 'information-rights', object: rights(), lifecycle_status: 'active', provenance_event_refs: ['evt:one'] },
  { storage_id: 'siea_bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', object_kind: 'evidence-assertion', object: assertion(), lifecycle_status: 'active', provenance_event_refs: ['evt:two'] }
];

test('portable bundle is deterministic and preserves relationship/evidence semantics with explicit non-claims', () => {
  const one = buildSovereignInformationBundle({
    exporter: 'principal:patient',
    records,
    created_at: createdAt
  });
  const two = buildSovereignInformationBundle({
    exporter: 'principal:patient',
    records: [...records].reverse(),
    created_at: createdAt
  });
  assert.equal(one.schema, SOVEREIGN_INFORMATION_BUNDLE_SCHEMA);
  assert.equal(one.bundle_digest, two.bundle_digest);
  assert.deepEqual(one.records, two.records);
  assert.deepEqual(one.records[0].object.relationships.subjects, ['principal:patient']);
  assert.equal(one.records[1].object.proposition, 'Observed event');
  assert.ok(one.non_claims.includes('export_does_not_grant_authority'));
  assert.ok(one.non_claims.includes('provenance_does_not_establish_truth'));
  assert.equal(Object.hasOwn(one, 'access_decisions'), false);
  assert.equal(Object.hasOwn(one, 'execution_authority'), false);
});

test('bundle validation rejects tampering, authority transfer fields, and unvalidated object contracts', () => {
  const bundle = buildSovereignInformationBundle({ exporter: 'principal:patient', records, created_at: createdAt });
  assert.throws(() => validateSovereignInformationBundle({ ...bundle, bundle_digest: 'b'.repeat(64) }), /digest/);
  assert.throws(() => validateSovereignInformationBundle({ ...bundle, execution_authority: ['anything'] }), /execution authority|unknown field/);
  const changed = structuredClone(bundle);
  changed.records[0].object.relationships.subjects = ['principal:other'];
  assert.throws(() => validateSovereignInformationBundle(changed), /digest/);
  const invalid = structuredClone(bundle);
  invalid.records[1].object.truth = true;
  delete invalid.bundle_digest;
  assert.throws(() => buildSovereignInformationBundle({ exporter: 'principal:patient', records: invalid.records, created_at: createdAt }), /truth|unknown field/);
});

test('bundle does not accept access decisions as portable authority records', () => {
  assert.throws(() => buildSovereignInformationBundle({
    exporter: 'principal:patient',
    records: [{ storage_id: 'siea_cccccccc-cccc-cccc-cccc-cccccccccccc', object_kind: 'information-access-decision', object: {}, lifecycle_status: 'active', provenance_event_refs: [] }],
    created_at: createdAt
  }), /object kind/);
});
