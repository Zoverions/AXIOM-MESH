import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { SovereignInformationGridStore } from '../src/grid/sovereign-information-store.mjs';
import { INFORMATION_RIGHTS_SCHEMA } from '../src/domain/information-rights.mjs';
import { EVIDENCE_ASSERTION_SCHEMA, EVIDENCE_LINK_SCHEMA } from '../src/domain/evidence-graph.mjs';
import { DELEGATED_GATE_MANDATE_SCHEMA } from '../src/domain/delegated-gate-mandate.mjs';

const at = '2026-09-03T12:00:00.000Z';
function verifier() { return { allowed: true, authority_ref: 'policy:test', verifier_ref: 'verifier:test' }; }

function rights() {
  return {
    schema: INFORMATION_RIGHTS_SCHEMA, object_ref: 'record:secret', information_class: 'clinical-note', sensitivity_class: 'restricted',
    relationships: { subjects: ['principal:patient-secret'], originators: ['principal:clinician-secret'], custodians: ['institution:hospital-secret'], controllers: ['institution:hospital-secret'], affected_parties: [], beneficiaries: [], permitted_recipients: [], reviewers: [], auditors: [], decision_users: [], challengers: [], disclosure_authorities: ['policy:access'], retention_authorities: ['policy:retain'] },
    authority_basis: ['policy:access'], allowed_purposes: ['care'], forbidden_purposes: [],
    policy_refs: { access: ['policy:access'], disclosure: ['policy:disclose'], retention: ['policy:retain'], challenge: [], correction: [], export: [], deletion: [] },
    projection_profiles: [], jurisdiction_context: [], provenance_refs: [], evidence_refs: [], state: { retention: 'active', challenge: 'none', supersession: 'current' }, created_at: at, reviewed_at: null
  };
}
function assertion(id, type, proposition) { return { schema: EVIDENCE_ASSERTION_SCHEMA, assertion_id: id, type, proposition, source_ref: 'principal:observer', epistemic_state: 'asserted', purpose_scope: ['investigation'], provenance_refs: ['artifact:source'], created_at: at }; }
function link() { return { schema: EVIDENCE_LINK_SCHEMA, link_id: 'link:contradiction', from_ref: 'assertion:counter', to_ref: 'assertion:hypothesis', relation: 'contradicts', asserted_by: 'principal:observer', created_at: at }; }
function mandate() { return { schema: DELEGATED_GATE_MANDATE_SCHEMA, mandate_id: 'mandate:adversarial', grantor: 'principal:user', delegate: 'agent:personal', domains: ['health'], actions: ['disclosure.projection'], purposes: ['care'], data_classes: ['restricted'], destinations: ['institution:clinic'], resource_ceilings: { max_records: 1, max_value_minor: 0 }, assurance_ceiling: 'enhanced', allowed_gate_decisions: ['minimum-disclosure'], escalation_conditions: ['novel-purpose'], credential_rules: { allow_opaque_handle: true, allow_raw_secret: false }, retention_constraints: ['no-new-retention'], starts_at: '2026-09-03T12:00:00.000Z', expires_at: '2026-09-04T12:00:00.000Z', revocation: { revoked: false, revoked_at: null, reason: null }, delegation: { mode: 'none' }, receipt_required: true }; }

async function fixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-siea-adversarial-'));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const path = join(dataDir, 'grid.sqlite');
  let store = new SovereignInformationGridStore({ path, dataDir, identity, protector, mutationVerifier: verifier });
  t.after(async () => { try { store.close(); } catch {} await rm(dataDir, { recursive: true, force: true }); });
  return { path, dataDir, identity, protector, get store() { return store; }, restart() { store.close(); store = new SovereignInformationGridStore({ path, dataDir, identity, protector, mutationVerifier: verifier }); return store; } };
}

test('SIEA object bodies and relationship principals are not stored in plaintext materialized columns', async t => {
  const f = await fixture(t);
  f.store.recordInformationRightsEnvelope({ actor: 'principal:clinician-secret', traceId: 'trace:secret', envelope: rights() });
  const row = f.store.db.prepare('SELECT * FROM siea_objects').get();
  assert.equal(row.object_json.includes('principal:patient-secret'), false);
  assert.equal(row.object_json.includes('institution:hospital-secret'), false);
  const columns = f.store.db.prepare('PRAGMA table_info(siea_objects)').all().map(item => item.name);
  for (const forbidden of ['subject','controller','owner','principal','requester','object_ref']) assert.equal(columns.includes(forbidden), false);
  const bytes = await readFile(f.path);
  assert.equal(bytes.includes(Buffer.from('principal:patient-secret')), false);
});

test('contradictory evidence and revocation state survive restart rebuild', async t => {
  const f = await fixture(t);
  f.store.recordEvidenceAssertion({ actor: 'principal:observer', traceId: 'trace:h', assertion: assertion('assertion:hypothesis', 'hypothesis', 'Hypothesis A') });
  f.store.recordEvidenceAssertion({ actor: 'principal:observer', traceId: 'trace:c', assertion: assertion('assertion:counter', 'counterevidence', 'Evidence against A') });
  f.store.recordEvidenceLink({ actor: 'principal:observer', traceId: 'trace:l', link: link() });
  f.store.recordDelegatedGateMandate({ actor: 'principal:user', traceId: 'trace:m', mandate: mandate() });
  f.store.revokeDelegatedGateMandate({ actor: 'principal:user', traceId: 'trace:r', mandateId: 'mandate:adversarial', revokedAt: '2026-09-03T12:10:00.000Z', reason: 'owner-revoked' });
  f.restart();
  const contradiction = f.store.listEvents({ after: 0, limit: 100 }).find(event => event.kind === 'siea.evidence-link.recorded');
  assert.equal(contradiction.payload.object.relation, 'contradicts');
  assert.equal(f.store.getDelegatedGateMandateEffectiveState('mandate:adversarial', { now: '2026-09-03T12:20:00.000Z' }).status, 'revoked');
});

test('tampering with protected SIEA event payload prevents trusted restart', async t => {
  const f = await fixture(t);
  f.store.recordInformationRightsEnvelope({ actor: 'principal:clinician-secret', traceId: 'trace:tamper', envelope: rights() });
  const event = f.store.db.prepare("SELECT event_id, payload_json FROM events WHERE kind = 'siea.information-rights.recorded'").get();
  f.store.db.prepare('UPDATE events SET payload_json = ? WHERE event_id = ?').run(`${event.payload_json}x`, event.event_id);
  f.store.close();
  assert.throws(() => new SovereignInformationGridStore({ path: f.path, dataDir: f.dataDir, identity: f.identity, protector: f.protector, mutationVerifier: verifier }), /evidence chain|decrypt|payload/i);
});
