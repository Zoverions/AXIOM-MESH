import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { SovereignInformationPortabilityGridStore } from '../src/grid/sovereign-information-portability-store.mjs';
import { INFORMATION_RIGHTS_SCHEMA } from '../src/domain/information-rights.mjs';
import { DELEGATED_GATE_MANDATE_SCHEMA } from '../src/domain/delegated-gate-mandate.mjs';
import { INFORMATION_ACCESS_DECISION_SCHEMA } from '../src/domain/information-access-decision.mjs';
import { buildSovereignInformationBundle } from '../src/lib/sovereign-information-portability.mjs';

const at = '2026-09-03T12:05:00.000Z';

function rights(ref) {
  return {
    schema: INFORMATION_RIGHTS_SCHEMA,
    object_ref: ref,
    information_class: 'private-note', sensitivity_class: 'restricted',
    relationships: {
      subjects: ['principal:user'], originators: ['principal:author'], custodians: ['institution:holder'], controllers: ['institution:holder'],
      affected_parties: [], beneficiaries: [], permitted_recipients: [], reviewers: [], auditors: [], decision_users: [], challengers: [],
      disclosure_authorities: ['policy:access'], retention_authorities: ['policy:retain']
    },
    authority_basis: ['policy:access'], allowed_purposes: ['care'], forbidden_purposes: [],
    policy_refs: { access: ['policy:access'], disclosure: ['policy:disclose'], retention: ['policy:retain'], challenge: [], correction: [], export: ['policy:export'], deletion: [] },
    projection_profiles: [], jurisdiction_context: [], provenance_refs: [], evidence_refs: [],
    state: { retention: 'active', challenge: 'none', supersession: 'current' }, created_at: '2026-09-03T12:00:00.000Z', reviewed_at: null
  };
}

function mandate() {
  return {
    schema: DELEGATED_GATE_MANDATE_SCHEMA,
    mandate_id: 'mandate:foreign', grantor: 'principal:foreign', delegate: 'agent:foreign', domains: ['health'], actions: ['disclosure.projection'], purposes: ['care'],
    data_classes: ['restricted'], destinations: ['institution:foreign'], resource_ceilings: { max_records: 1, max_value_minor: 0 }, assurance_ceiling: 'enhanced',
    allowed_gate_decisions: ['minimum-disclosure'], escalation_conditions: ['novel-purpose'], credential_rules: { allow_opaque_handle: true, allow_raw_secret: false },
    retention_constraints: ['no-new-retention'], starts_at: '2026-09-03T12:00:00.000Z', expires_at: '2026-09-04T12:00:00.000Z',
    revocation: { revoked: false, revoked_at: null, reason: null }, delegation: { mode: 'none' }, receipt_required: true
  };
}

function mutationVerifier() { return { allowed: true, authority_ref: 'policy:test-write', verifier_ref: 'verifier:test-write' }; }
function accessVerifier(decision) { return { valid: decision.verifier_ref === 'verifier:trusted-export' }; }
function importVerifier() { return { allowed: true, authority_ref: 'policy:import-quarantine', verifier_ref: 'verifier:import-policy' }; }

function exportDecision(objectRef, digest) {
  return {
    schema: INFORMATION_ACCESS_DECISION_SCHEMA,
    decision_id: `access-decision:${digest.slice(0, 12)}:export`, requester: 'principal:user', object_ref: objectRef, purpose: 'personal-export', right: 'export', decision: 'allow',
    authority_ref: 'policy:export', object_digest: digest, issued_at: '2026-09-03T12:00:00.000Z', expires_at: '2026-09-03T12:10:00.000Z',
    verifier_ref: 'verifier:trusted-export', verifier_version: '1.0.0', reason_codes: ['explicit-export']
  };
}

async function fixture(t, options = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-siea-portability-store-'));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const path = join(dataDir, 'grid.sqlite');
  const store = new SovereignInformationPortabilityGridStore({
    path, dataDir, identity, protector,
    mutationVerifier,
    informationAccessDecisionVerifier: options.noAccessVerifier ? undefined : accessVerifier,
    importVerifier: options.noImportVerifier ? undefined : importVerifier
  });
  t.after(async () => { try { store.close(); } catch {} await rm(dataDir, { recursive: true, force: true }); });
  return store;
}

function record(store, ref) {
  return store.recordInformationRightsEnvelope({ actor: 'principal:author', traceId: `trace:${ref.replaceAll(':', '-')}`, envelope: rights(ref) });
}

test('export requires one exact verified export decision per returned object and leaks no denied-object count', async t => {
  const store = await fixture(t);
  const visible = record(store, 'record:visible');
  record(store, 'record:hidden');
  const bundle = store.exportSovereignInformation({
    requester: 'principal:user', purpose: 'personal-export', decisions: [exportDecision('record:visible', visible.payload.object_digest)], now: at, createdAt: at
  });
  assert.equal(bundle.records.length, 1);
  assert.equal(bundle.records[0].object.object_ref, 'record:visible');
  assert.equal(Object.hasOwn(bundle, 'hidden_count'), false);
  assert.equal(Object.hasOwn(bundle, 'access_decisions'), false);
});

test('export fails closed without verifier or with an invalid per-object decision', async t => {
  const noVerifier = await fixture(t, { noAccessVerifier: true });
  const receipt = record(noVerifier, 'record:no-verifier');
  assert.throws(() => noVerifier.exportSovereignInformation({
    requester: 'principal:user', purpose: 'personal-export', decisions: [exportDecision('record:no-verifier', receipt.payload.object_digest)], now: at, createdAt: at
  }), /access-decision verifier.*unavailable/i);

  const store = await fixture(t);
  const good = record(store, 'record:wrong-digest');
  const bad = { ...exportDecision('record:wrong-digest', good.payload.object_digest), object_digest: 'b'.repeat(64) };
  assert.throws(() => store.exportSovereignInformation({ requester: 'principal:user', purpose: 'personal-export', decisions: [bad], now: at, createdAt: at }), /object unavailable|access decision/i);
});

test('foreign bundle dry-run is non-authoritative and staging never activates imported mandate', async t => {
  const store = await fixture(t);
  const foreign = buildSovereignInformationBundle({
    exporter: 'principal:foreign', created_at: at,
    records: [{ storage_id: 'siea_ffffffff-ffff-ffff-ffff-ffffffffffff', object_kind: 'delegated-gate-mandate', object: mandate(), lifecycle_status: 'active', provenance_event_refs: ['evt:foreign'] }]
  });
  const dryRun = store.dryRunSovereignInformationImport({ principal: 'principal:user', bundle: foreign });
  assert.equal(dryRun.new, 1);
  assert.equal(dryRun.conflicts, 0);
  assert.equal(dryRun.records[0].disposition, 'non-authoritative-import');
  assert.throws(() => store.getDelegatedGateMandateEffectiveState('mandate:foreign', { now: at }), /not found/i);

  const receipt = store.stageSovereignInformationImport({ actor: 'principal:user', traceId: 'trace:foreign-import', bundle: foreign });
  assert.equal(receipt.kind, 'siea.import.staged');
  const staged = store.listQuarantinedSovereignInformationImports('principal:user');
  assert.equal(staged.length, 1);
  assert.equal(staged[0].records[0].disposition, 'non-authoritative-import');
  assert.throws(() => store.getDelegatedGateMandateEffectiveState('mandate:foreign', { now: at }), /not found/i);
});

test('import rejects access-decision records and fails closed without local import verifier', async t => {
  const store = await fixture(t, { noImportVerifier: true });
  const foreign = buildSovereignInformationBundle({ exporter: 'principal:foreign', created_at: at, records: [] });
  assert.throws(() => store.stageSovereignInformationImport({ actor: 'principal:user', traceId: 'trace:import-no-verifier', bundle: foreign }), /import verifier.*unavailable/i);
});
