import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  canonicalJson,
  digestObject,
  sha256
} from '../src/lib/canonical.mjs';
import { GridStore } from '../src/grid/store.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';

async function fixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-grid-history-expiry-'));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const path = join(dataDir, 'grid.sqlite');
  let store = new GridStore({
    path,
    dataDir,
    identity,
    protector,
    checkpointInterval: 10_000
  });
  t.after(async () => {
    try { store?.close(); } catch {}
    await rm(dataDir, { recursive: true, force: true });
  });
  return {
    dataDir,
    identity,
    protector,
    path,
    get store() { return store; },
    set store(next) { store = next; }
  };
}

function appendSignedHistoricalEvent(store, identity, {
  kind,
  subject,
  payload,
  occurredAt,
  actor = 'person:historical-fixture',
  traceId = 'trace_historical_expiry_fixture'
}) {
  const meta = store.getStatus();
  const seq = meta.last_seq + 1;
  const eventId = `evt_historical_expiry_${seq}`;
  const payloadDigest = digestObject(payload);
  const envelope = {
    seq,
    event_id: eventId,
    trace_id: traceId,
    actor,
    kind,
    subject,
    occurred_at: occurredAt,
    payload_digest: payloadDigest,
    prev_hash: meta.last_hash
  };
  const eventHash = digestObject(envelope);
  const signature = identity.signObject({ event_hash: eventHash });
  const protectedPayload = store.protectJson(
    'events',
    'payload_json',
    eventId,
    payload
  );

  store.db.prepare(`
    INSERT INTO events(
      seq, event_id, trace_id, actor, kind, subject, occurred_at,
      payload_json, payload_digest, prev_hash, event_hash, signature_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    seq,
    eventId,
    traceId,
    actor,
    kind,
    subject,
    occurredAt,
    protectedPayload,
    payloadDigest,
    meta.last_hash,
    eventHash,
    canonicalJson(signature)
  );
  store.db.prepare("UPDATE meta SET value = ? WHERE key = 'last_seq'").run(String(seq));
  store.db.prepare("UPDATE meta SET value = ? WHERE key = 'last_hash'").run(eventHash);
  return { eventId, eventHash };
}

function historicalApproval({
  approvalId = 'approval_historical_expiry_0001',
  expiresAt = '2020-01-01T01:00:00.000Z'
} = {}) {
  return {
    approval_id: approvalId,
    approver: 'person:historical-approver',
    requester: 'person:historical-requester',
    action: 'system.echo',
    request_digest: sha256('historical-approval-request'),
    expires_at: expiresAt
  };
}

function historicalConsent({
  consentId = 'consent_historical_expiry_0001',
  expiresAt = '2020-01-01T01:00:00.000Z'
} = {}) {
  return {
    consent_id: consentId,
    subject: 'person:historical-subject',
    controller: 'person:historical-controller',
    purpose: 'historical replay verification',
    scopes: ['memory:read'],
    expires_at: expiresAt,
    revocation_handle_hash: sha256('historical-consent-revocation-handle')
  };
}

function reopen(state) {
  state.store.close();
  state.store = new GridStore({
    path: state.path,
    dataDir: state.dataDir,
    identity: state.identity,
    protector: state.protector,
    checkpointInterval: 10_000
  });
  return state.store;
}

test('historically valid approval and consent survive replay after present-time expiry', async t => {
  const state = await fixture(t);
  const occurredAt = '2020-01-01T00:00:00.000Z';
  const expiresAt = '2020-01-01T01:00:00.000Z';

  appendSignedHistoricalEvent(state.store, state.identity, {
    kind: 'approval.granted',
    subject: 'approval_historical_expiry_0001',
    payload: historicalApproval({ expiresAt }),
    occurredAt
  });
  appendSignedHistoricalEvent(state.store, state.identity, {
    kind: 'consent.granted',
    subject: 'consent_historical_expiry_0001',
    payload: historicalConsent({ expiresAt }),
    occurredAt
  });

  assert.equal(state.store.verifyFullChain().valid, true);
  const restored = reopen(state);
  assert.equal(restored.verifyFullChain().valid, true);
  assert.equal(
    restored.getApproval('approval_historical_expiry_0001').expires_at,
    expiresAt
  );
  const consents = restored.listConsents('person:historical-subject');
  assert.equal(consents.length, 1);
  assert.equal(consents[0].expires_at, expiresAt);
});

test('historical grants that were expired when recorded still fail closed during replay', async t => {
  const state = await fixture(t);
  const occurredAt = '2020-01-01T01:00:00.000Z';
  const expiresAt = '2020-01-01T01:00:00.000Z';

  appendSignedHistoricalEvent(state.store, state.identity, {
    kind: 'approval.granted',
    subject: 'approval_invalid_at_origin_0001',
    payload: historicalApproval({
      approvalId: 'approval_invalid_at_origin_0001',
      expiresAt
    }),
    occurredAt
  });
  assert.equal(state.store.verifyFullChain().valid, true);
  state.store.close();
  state.store = null;

  assert.throws(() => new GridStore({
    path: state.path,
    dataDir: state.dataDir,
    identity: state.identity,
    protector: state.protector,
    checkpointInterval: 10_000
  }), /Approval expiry must be a future ISO timestamp/);
});

test('live append still evaluates approval and consent expiry against the current clock', async t => {
  const state = await fixture(t);
  const expiredAt = new Date(Date.now() - 60_000).toISOString();

  assert.throws(() => state.store.appendEvents({
    traceId: 'trace_live_expired_approval',
    actor: 'person:historical-approver',
    events: [{
      kind: 'approval.granted',
      subject: 'approval_live_expired_0001',
      payload: historicalApproval({
        approvalId: 'approval_live_expired_0001',
        expiresAt: expiredAt
      })
    }]
  }), /Approval expiry must be a future ISO timestamp/);

  assert.throws(() => state.store.appendEvents({
    traceId: 'trace_live_expired_consent',
    actor: 'person:historical-subject',
    events: [{
      kind: 'consent.granted',
      subject: 'consent_live_expired_0001',
      payload: historicalConsent({
        consentId: 'consent_live_expired_0001',
        expiresAt: expiredAt
      })
    }]
  }), /Consent expiry must be a future ISO timestamp/);
});
