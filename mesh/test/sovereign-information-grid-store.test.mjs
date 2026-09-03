import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { SovereignInformationGridStore } from '../src/grid/sovereign-information-store.mjs';
import { INFORMATION_RIGHTS_SCHEMA } from '../src/domain/information-rights.mjs';
import { EVIDENCE_ASSERTION_SCHEMA, EVIDENCE_LINK_SCHEMA } from '../src/domain/evidence-graph.mjs';

const at = '2026-09-03T12:00:00.000Z';

function rightsEnvelope() {
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
    projection_profiles: [],
    jurisdiction_context: [],
    provenance_refs: [],
    evidence_refs: [],
    state: { retention: 'active', challenge: 'none', supersession: 'current' },
    created_at: at,
    reviewed_at: null
  };
}

function assertion(id, type, proposition) {
  return {
    schema: EVIDENCE_ASSERTION_SCHEMA,
    assertion_id: id,
    type,
    proposition,
    source_ref: 'principal:investigator',
    epistemic_state: type === 'challenge' ? 'disputed' : 'asserted',
    purpose_scope: ['investigation'],
    provenance_refs: ['artifact:source-1'],
    created_at: at
  };
}

function link(id, from_ref, to_ref, relation) {
  return {
    schema: EVIDENCE_LINK_SCHEMA,
    link_id: id,
    from_ref,
    to_ref,
    relation,
    asserted_by: 'principal:investigator',
    created_at: at
  };
}

function mutationVerifier() {
  return {
    allowed: true,
    authority_ref: 'policy:siea-test-write',
    verifier_ref: 'verifier:siea-test'
  };
}

async function fixture(t, { withMutationVerifier = true } = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-siea-store-'));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const path = join(dataDir, 'grid.sqlite');
  let store = new SovereignInformationGridStore({
    path,
    dataDir,
    identity,
    protector,
    mutationVerifier: withMutationVerifier ? mutationVerifier : undefined
  });
  t.after(async () => {
    try { store.close(); } catch {}
    await rm(dataDir, { recursive: true, force: true });
  });
  return {
    path,
    dataDir,
    identity,
    protector,
    get store() { return store; },
    restart() {
      store.close();
      store = new SovereignInformationGridStore({
        path,
        dataDir,
        identity,
        protector,
        mutationVerifier: withMutationVerifier ? mutationVerifier : undefined
      });
      return store;
    }
  };
}

test('sovereign information mutation fails closed without a separate mutation verifier', async t => {
  const { store } = await fixture(t, { withMutationVerifier: false });
  assert.throws(() => store.recordInformationRightsEnvelope({
    actor: 'principal:clinician',
    traceId: 'trace:siea-rights',
    envelope: rightsEnvelope()
  }), /mutation verifier.*unavailable/i);
});

test('rights envelope persists through signed Grid event and encrypted materialized state', async t => {
  const f = await fixture(t);
  const receipt = f.store.recordInformationRightsEnvelope({
    actor: 'principal:clinician',
    traceId: 'trace:siea-rights',
    envelope: rightsEnvelope()
  });
  assert.equal(receipt.kind, 'siea.information-rights.recorded');
  assert.equal(receipt.actor, 'principal:clinician');
  assert.ok(receipt.event_hash);
  assert.ok(receipt.signature);

  const row = f.store.db.prepare('SELECT * FROM siea_objects').get();
  assert.equal(row.object_kind, 'information-rights');
  assert.notEqual(row.object_json.includes('principal:patient'), true);
  assert.notEqual(row.object_json.includes('institution:hospital'), true);
  assert.equal(f.store.verifyChain().valid, true);

  const storageId = row.storage_id;
  f.restart();
  const rebuilt = f.store.db.prepare('SELECT * FROM siea_objects WHERE storage_id = ?').get(storageId);
  assert.equal(rebuilt.object_digest, row.object_digest);
  assert.equal(f.store.verifyChain().valid, true);
});

test('immutable evidence records reject duplicate logical identifiers and preserve contradiction after restart', async t => {
  const f = await fixture(t);
  const hypothesis = assertion('assertion:hypothesis', 'hypothesis', 'Hypothesis A');
  const counter = assertion('assertion:counter', 'counterevidence', 'Evidence conflicts with A');
  f.store.recordEvidenceAssertion({ actor: 'principal:investigator', traceId: 'trace:evidence-1', assertion: hypothesis });
  f.store.recordEvidenceAssertion({ actor: 'principal:investigator', traceId: 'trace:evidence-2', assertion: counter });
  f.store.recordEvidenceLink({
    actor: 'principal:investigator',
    traceId: 'trace:evidence-3',
    link: link('link:counter', 'assertion:counter', 'assertion:hypothesis', 'contradicts')
  });

  assert.throws(() => f.store.recordEvidenceAssertion({
    actor: 'principal:investigator',
    traceId: 'trace:evidence-duplicate',
    assertion: hypothesis
  }), /already exists|state conflict/i);

  f.restart();
  const kinds = f.store.db.prepare('SELECT object_kind FROM siea_objects ORDER BY object_kind').all().map(row => row.object_kind);
  assert.deepEqual(kinds, ['evidence-assertion', 'evidence-assertion', 'evidence-link']);
  const events = f.store.listEvents({ after: 0, limit: 100 }).filter(event => event.kind.startsWith('siea.'));
  assert.ok(events.some(event => event.kind === 'siea.evidence-link.recorded' && event.payload.object.relation === 'contradicts'));
});
