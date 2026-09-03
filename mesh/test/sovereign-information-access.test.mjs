import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { SovereignInformationGridStore } from '../src/grid/sovereign-information-store.mjs';
import { INFORMATION_RIGHTS_SCHEMA } from '../src/domain/information-rights.mjs';
import { INFORMATION_ACCESS_DECISION_SCHEMA } from '../src/domain/information-access-decision.mjs';

const now = '2026-09-03T12:05:00.000Z';

function envelope(ref, subject) {
  return {
    schema: INFORMATION_RIGHTS_SCHEMA,
    object_ref: ref,
    information_class: 'clinical-note',
    sensitivity_class: 'restricted',
    relationships: {
      subjects: [subject],
      originators: ['principal:clinician'],
      custodians: ['institution:hospital'],
      controllers: ['institution:hospital'],
      affected_parties: [], beneficiaries: [], permitted_recipients: [], reviewers: [], auditors: [], decision_users: [], challengers: [],
      disclosure_authorities: ['policy:access'], retention_authorities: ['policy:retain']
    },
    authority_basis: ['policy:access'],
    allowed_purposes: ['care'],
    forbidden_purposes: [],
    policy_refs: { access: ['policy:access'], disclosure: ['policy:disclose'], retention: ['policy:retain'], challenge: [], correction: [], export: ['policy:export'], deletion: [] },
    projection_profiles: [], jurisdiction_context: [], provenance_refs: [], evidence_refs: [],
    state: { retention: 'active', challenge: 'none', supersession: 'current' },
    created_at: '2026-09-03T12:00:00.000Z', reviewed_at: null
  };
}

function mutationVerifier() {
  return { allowed: true, authority_ref: 'policy:test-write', verifier_ref: 'verifier:test-write' };
}

function accessVerifier(decision) {
  return { valid: decision.verifier_ref === 'verifier:trusted-policy' };
}

function accessDecision({ requester, object_ref, object_digest, right = 'inspect-full-content', purpose = 'care', verifier_ref = 'verifier:trusted-policy' }) {
  return {
    schema: INFORMATION_ACCESS_DECISION_SCHEMA,
    decision_id: `access-decision:${object_digest.slice(0, 12)}:${right}`,
    requester,
    object_ref,
    purpose,
    right,
    decision: 'allow',
    authority_ref: 'policy:access',
    object_digest,
    issued_at: '2026-09-03T12:00:00.000Z',
    expires_at: '2026-09-03T12:10:00.000Z',
    verifier_ref,
    verifier_version: '1.0.0',
    reason_codes: ['exact-policy-match']
  };
}

async function fixture(t, { withAccessVerifier = true } = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-siea-access-'));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const path = join(dataDir, 'grid.sqlite');
  const store = new SovereignInformationGridStore({
    path, dataDir, identity, protector,
    mutationVerifier,
    informationAccessDecisionVerifier: withAccessVerifier ? accessVerifier : undefined
  });
  t.after(async () => {
    try { store.close(); } catch {}
    await rm(dataDir, { recursive: true, force: true });
  });
  return store;
}

function record(store, ref, subject) {
  const receipt = store.recordInformationRightsEnvelope({
    actor: 'principal:clinician',
    traceId: `trace:${ref.replaceAll(':', '-')}`,
    envelope: envelope(ref, subject)
  });
  return { object_digest: receipt.payload.object_digest };
}

test('read fails closed when the independent access-decision verifier is unavailable', async t => {
  const store = await fixture(t, { withAccessVerifier: false });
  const row = record(store, 'record:one', 'principal:patient');
  const decision = accessDecision({ requester: 'principal:patient', object_ref: 'record:one', object_digest: row.object_digest });
  assert.throws(() => store.readSovereignInformationObject({
    requester: 'principal:patient', objectRef: 'record:one', purpose: 'care', right: 'inspect-full-content', decision, now
  }), /access-decision verifier.*unavailable/i);
});

test('being the subject does not grant read access without an exact verified decision', async t => {
  const store = await fixture(t);
  record(store, 'record:subject-only', 'principal:patient');
  assert.throws(() => store.readSovereignInformationObject({
    requester: 'principal:patient', objectRef: 'record:subject-only', purpose: 'care', right: 'inspect-full-content', decision: null, now
  }), /object unavailable|access decision/i);
});

test('exact verified full-content decision returns the target and metadata-only decision withholds relationships', async t => {
  const store = await fixture(t);
  const row = record(store, 'record:full', 'principal:patient');
  const full = accessDecision({ requester: 'principal:patient', object_ref: 'record:full', object_digest: row.object_digest });
  const value = store.readSovereignInformationObject({
    requester: 'principal:patient', objectRef: 'record:full', purpose: 'care', right: 'inspect-full-content', decision: full, now
  });
  assert.equal(value.object.object_ref, 'record:full');
  assert.deepEqual(value.object.relationships.subjects, ['principal:patient']);

  const metadata = accessDecision({ requester: 'principal:patient', object_ref: 'record:full', object_digest: row.object_digest, right: 'inspect-metadata' });
  const projected = store.readSovereignInformationObject({
    requester: 'principal:patient', objectRef: 'record:full', purpose: 'care', right: 'inspect-metadata', decision: metadata, now
  });
  assert.equal(Object.hasOwn(projected, 'object'), false);
  assert.equal(Object.hasOwn(projected, 'relationships'), false);
  assert.equal(projected.object_kind, 'information-rights');
  assert.equal(projected.object_digest, row.object_digest);
});

test('wrong requester, purpose, right, digest, or verifier authenticity fails closed', async t => {
  const store = await fixture(t);
  const row = record(store, 'record:bound', 'principal:patient');
  const base = accessDecision({ requester: 'principal:patient', object_ref: 'record:bound', object_digest: row.object_digest });
  const cases = [
    { request: { requester: 'principal:other' }, decision: base },
    { request: { purpose: 'research' }, decision: base },
    { request: { right: 'inspect-metadata' }, decision: base },
    { request: {}, decision: { ...base, object_digest: 'b'.repeat(64) } },
    { request: {}, decision: { ...base, verifier_ref: 'verifier:untrusted' } }
  ];
  for (const item of cases) {
    assert.throws(() => store.readSovereignInformationObject({
      requester: item.request.requester ?? 'principal:patient',
      objectRef: 'record:bound',
      purpose: item.request.purpose ?? 'care',
      right: item.request.right ?? 'inspect-full-content',
      decision: item.decision,
      now
    }), /object unavailable|access decision|verification/i);
  }
});

test('authorized list reveals only objects backed by supplied valid decisions and truncates only authorized results', async t => {
  const store = await fixture(t);
  const one = record(store, 'record:list-one', 'principal:patient');
  record(store, 'record:hidden', 'principal:patient');
  const three = record(store, 'record:list-three', 'principal:patient');
  const decisions = [
    accessDecision({ requester: 'principal:patient', object_ref: 'record:list-one', object_digest: one.object_digest, right: 'inspect-metadata' }),
    accessDecision({ requester: 'principal:patient', object_ref: 'record:list-three', object_digest: three.object_digest, right: 'inspect-metadata' })
  ];
  const result = store.listAuthorizedSovereignInformation({
    requester: 'principal:patient', purpose: 'care', right: 'inspect-metadata', decisions, now, limit: 1
  });
  assert.equal(result.items.length, 1);
  assert.equal(result.truncated, true);
  assert.equal(Object.hasOwn(result, 'hidden_count'), false);
  assert.equal(Object.hasOwn(result, 'total_objects'), false);

  const all = store.listAuthorizedSovereignInformation({
    requester: 'principal:patient', purpose: 'care', right: 'inspect-metadata', decisions, now, limit: 10
  });
  assert.equal(all.items.length, 2);
  assert.equal(all.truncated, false);
  assert.equal(all.items.some(item => item.object_ref === 'record:hidden'), false);
});
