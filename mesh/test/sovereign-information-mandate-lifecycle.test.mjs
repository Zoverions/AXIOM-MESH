import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { SovereignInformationGridStore } from '../src/grid/sovereign-information-store.mjs';
import { DELEGATED_GATE_MANDATE_SCHEMA } from '../src/domain/delegated-gate-mandate.mjs';

function mandate() {
  return {
    schema: DELEGATED_GATE_MANDATE_SCHEMA,
    mandate_id: 'mandate:clinical-routine',
    grantor: 'principal:patient',
    delegate: 'agent:personal',
    domains: ['health'],
    actions: ['disclosure.projection'],
    purposes: ['routine-care'],
    data_classes: ['restricted'],
    destinations: ['institution:clinic'],
    resource_ceilings: { max_records: 2, max_value_minor: 0 },
    assurance_ceiling: 'high-assurance',
    allowed_gate_decisions: ['minimum-disclosure'],
    escalation_conditions: ['novel-purpose'],
    credential_rules: { allow_opaque_handle: true, allow_raw_secret: false },
    retention_constraints: ['no-new-retention'],
    starts_at: '2026-09-03T12:00:00.000Z',
    expires_at: '2026-09-03T13:00:00.000Z',
    revocation: { revoked: false, revoked_at: null, reason: null },
    delegation: { mode: 'none' },
    receipt_required: true
  };
}

function verifier() {
  return {
    allowed: true,
    authority_ref: 'policy:mandate-owner-authority',
    verifier_ref: 'verifier:local-policy'
  };
}

async function fixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-siea-mandate-'));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const path = join(dataDir, 'grid.sqlite');
  let store = new SovereignInformationGridStore({ path, dataDir, identity, protector, mutationVerifier: verifier });
  t.after(async () => {
    try { store.close(); } catch {}
    await rm(dataDir, { recursive: true, force: true });
  });
  return {
    get store() { return store; },
    restart() {
      store.close();
      store = new SovereignInformationGridStore({ path, dataDir, identity, protector, mutationVerifier: verifier });
      return store;
    }
  };
}

test('mandate effective state changes from active to expired without rewriting history', async t => {
  const f = await fixture(t);
  f.store.recordDelegatedGateMandate({ actor: 'principal:patient', traceId: 'trace:mandate-record', mandate: mandate() });
  assert.equal(f.store.getDelegatedGateMandateEffectiveState('mandate:clinical-routine', {
    now: '2026-09-03T12:30:00.000Z'
  }).status, 'active');
  assert.equal(f.store.getDelegatedGateMandateEffectiveState('mandate:clinical-routine', {
    now: '2026-09-03T13:00:00.000Z'
  }).status, 'expired');
  const events = f.store.listEvents({ after: 0, limit: 100 }).filter(event => event.kind.startsWith('siea.'));
  assert.equal(events.length, 1);
});

test('revocation is a signed append-only transition and survives restart', async t => {
  const f = await fixture(t);
  f.store.recordDelegatedGateMandate({ actor: 'principal:patient', traceId: 'trace:mandate-record', mandate: mandate() });
  const receipt = f.store.revokeDelegatedGateMandate({
    actor: 'principal:patient',
    traceId: 'trace:mandate-revoke',
    mandateId: 'mandate:clinical-routine',
    revokedAt: '2026-09-03T12:20:00.000Z',
    reason: 'owner-revoked'
  });
  assert.equal(receipt.kind, 'siea.delegated-mandate.revoked');
  assert.ok(receipt.event_hash);
  assert.ok(receipt.signature);
  assert.equal(f.store.getDelegatedGateMandateEffectiveState('mandate:clinical-routine', {
    now: '2026-09-03T12:21:00.000Z'
  }).status, 'revoked');

  f.restart();
  const state = f.store.getDelegatedGateMandateEffectiveState('mandate:clinical-routine', {
    now: '2026-09-03T12:30:00.000Z'
  });
  assert.equal(state.status, 'revoked');
  assert.equal(state.mandate.revocation.reason, 'owner-revoked');
  assert.equal(f.store.verifyChain().valid, true);
});

test('a revoked mandate cannot be silently reactivated and exact duplicate revocation is idempotent', async t => {
  const f = await fixture(t);
  f.store.recordDelegatedGateMandate({ actor: 'principal:patient', traceId: 'trace:mandate-record', mandate: mandate() });
  const first = f.store.revokeDelegatedGateMandate({
    actor: 'principal:patient', traceId: 'trace:mandate-revoke', mandateId: 'mandate:clinical-routine',
    revokedAt: '2026-09-03T12:20:00.000Z', reason: 'owner-revoked'
  });
  const duplicate = f.store.revokeDelegatedGateMandate({
    actor: 'principal:patient', traceId: 'trace:mandate-revoke-duplicate', mandateId: 'mandate:clinical-routine',
    revokedAt: '2026-09-03T12:20:00.000Z', reason: 'owner-revoked'
  });
  assert.equal(duplicate.event_hash, first.event_hash);
  assert.equal(f.store.listEvents({ after: 0, limit: 100 }).filter(event => event.kind === 'siea.delegated-mandate.revoked').length, 1);

  assert.throws(() => f.store.recordDelegatedGateMandate({
    actor: 'principal:patient', traceId: 'trace:mandate-reactivate', mandate: mandate()
  }), /already exists|state conflict/i);

  assert.throws(() => f.store.revokeDelegatedGateMandate({
    actor: 'principal:patient', traceId: 'trace:mandate-revoke-conflict', mandateId: 'mandate:clinical-routine',
    revokedAt: '2026-09-03T12:21:00.000Z', reason: 'different-reason'
  }), /conflict|already revoked/i);
});
