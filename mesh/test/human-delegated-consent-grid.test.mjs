import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { DataProtector } from '../src/lib/protector.mjs';
import { buildDelegatedConsentReceipt } from '../src/authority/human-delegated-consent.mjs';
import { DelegatedAuthorityGridStore } from '../src/grid/delegated-authority-store.mjs';

const JURISDICTION = 'c'.repeat(64);
const REVOCATION = 'f'.repeat(64);
const TRANSITION = 'd'.repeat(64);

function relationship() {
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
    status: 'active'
  };
}

function grant() {
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
    status: 'active'
  };
}

async function fixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-delegated-consent-grid-'));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = new DataProtector(Buffer.alloc(32, 11));
  const path = join(dataDir, 'grid.sqlite');
  let store = new DelegatedAuthorityGridStore({ path, dataDir, identity, protector });
  t.after(async () => {
    try {
      store?.close();
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });
  return {
    get store() {
      return store;
    },
    restart() {
      store.close();
      store = new DelegatedAuthorityGridStore({ path, dataDir, identity, protector });
      return store;
    }
  };
}

function append(store, actor, kind, subject, payload, eventId) {
  return store.appendEvents({
    traceId: `trace_${eventId}`,
    actor,
    events: [{ event_id: eventId, kind, subject, payload }]
  })[0];
}

function seedAuthority(store) {
  append(
    store,
    'authority.attestor.1',
    'human.relationship.claimed',
    'relationship_guardian_child_1',
    relationship(),
    'event_relationship_delegated_1'
  );
  append(
    store,
    'authority.attestor.1',
    'human.authority.granted',
    'authority_guardian_child_education_1',
    grant(),
    'event_authority_delegated_1'
  );
}

function currentAuthority(store, asOf = new Date().toISOString()) {
  return store.resolveStoredHumanAuthority({
    holderType: 'human',
    subjectId: 'learner.child.1',
    holderId: 'adult.guardian.1',
    grantId: 'authority_guardian_child_education_1',
    controller: 'capsule:axiom.education',
    purpose: 'learning-progress-recording',
    action: 'education.learner.event.append',
    dataScopes: ['learning-progress:write'],
    asOf
  });
}

function issueReceipt(store, overrides = {}) {
  const grantedAt = new Date().toISOString();
  const result = buildDelegatedConsentReceipt({
    principal: { id: 'adult.guardian.1', type: 'human' },
    authority: currentAuthority(store, grantedAt),
    consentId: overrides.consentId ?? 'delegated_consent_grid_1',
    controller: 'capsule:axiom.education',
    purpose: 'learning-progress-recording',
    action: 'education.learner.event.append',
    dataScopes: ['learning-progress:write'],
    expiresAt: '2026-09-01T00:00:00.000Z',
    revocationHandleHash: REVOCATION,
    now: grantedAt
  });
  assert.equal(result.allow, true);
  return result.receipt;
}

function commitReceipt(store, receipt, eventId = 'event_delegated_consent_1') {
  append(
    store,
    'adult.guardian.1',
    'human.delegated-consent.granted',
    receipt.consent_id,
    receipt,
    eventId
  );
}

function resolveDelegated(store, consentId = 'delegated_consent_grid_1') {
  return store.resolveDelegatedConsentAuthorization({
    consentId,
    subjectId: 'learner.child.1',
    holderId: 'adult.guardian.1',
    controller: 'capsule:axiom.education',
    purpose: 'learning-progress-recording',
    action: 'education.learner.event.append',
    dataScopes: ['learning-progress:write']
  });
}

test('delegated consent projection contains only index metadata while receipt stays protected', async t => {
  const fx = await fixture(t);
  seedAuthority(fx.store);
  const receipt = issueReceipt(fx.store);
  commitReceipt(fx.store, receipt);

  const columns = fx.store.db.prepare('PRAGMA table_info(human_delegated_consents)')
    .all()
    .map(column => column.name);
  for (const sensitive of [
    'authority_digest',
    'relationship_claim_id',
    'controller',
    'purpose',
    'action',
    'data_scopes_json',
    'revocation_handle_hash'
  ]) {
    assert.equal(columns.includes(sensitive), false);
  }
  const raw = fx.store.db.prepare('SELECT payload_json FROM events WHERE event_id = ?')
    .get('event_delegated_consent_1');
  assert.ok(raw);
  assert.equal(raw.payload_json.includes('capsule:axiom.education'), false);
  assert.equal(raw.payload_json.includes('learning-progress:write'), false);

  const stored = fx.store.getDelegatedConsent(receipt.consent_id);
  assert.equal(stored.holder_id, 'adult.guardian.1');
  assert.equal(stored.status, 'active');
  assert.equal(resolveDelegated(fx.store).allow, true);
});

test('delegated consent rebuilds after restart and preserves verified chain state', async t => {
  const fx = await fixture(t);
  seedAuthority(fx.store);
  const receipt = issueReceipt(fx.store);
  commitReceipt(fx.store, receipt);
  assert.equal(resolveDelegated(fx.store).allow, true);

  const restarted = fx.restart();
  assert.equal(restarted.getDelegatedConsent(receipt.consent_id).status, 'active');
  assert.equal(resolveDelegated(restarted).allow, true);
  assert.equal(restarted.verifyChain().valid, true);
});

test('authority revocation blocks use even while delegated consent itself remains active', async t => {
  const fx = await fixture(t);
  seedAuthority(fx.store);
  const receipt = issueReceipt(fx.store);
  commitReceipt(fx.store, receipt);

  append(
    fx.store,
    'authority.attestor.1',
    'human.authority.revoked',
    'authority_guardian_child_education_1',
    {
      grant_id: 'authority_guardian_child_education_1',
      subject_id: 'learner.child.1',
      evidence_digest: TRANSITION
    },
    'event_authority_delegated_revoke_1'
  );

  assert.equal(fx.store.getDelegatedConsent(receipt.consent_id).status, 'active');
  const result = resolveDelegated(fx.store);
  assert.equal(result.allow, false);
  assert.equal(result.code, 'authority_grant_inactive');
});

test('unresolved conflict blocks delegated use and resolution restores it', async t => {
  const fx = await fixture(t);
  seedAuthority(fx.store);
  const receipt = issueReceipt(fx.store);
  commitReceipt(fx.store, receipt);

  append(
    fx.store,
    'authority.attestor.1',
    'human.authority.conflict.opened',
    'conflict_delegated_1',
    {
      schema: 'axiom-human-authority-conflict.v1',
      conflict_id: 'conflict_delegated_1',
      subject_id: 'learner.child.1',
      grant_ids: ['authority_guardian_child_education_1'],
      evidence_digest: 'e'.repeat(64),
      jurisdiction_context_digest: JURISDICTION,
      effective_from: '2026-08-01T00:00:00.000Z',
      effective_until: null,
      status: 'unresolved'
    },
    'event_conflict_delegated_1'
  );
  assert.equal(resolveDelegated(fx.store).code, 'authority_conflict_unresolved');

  append(
    fx.store,
    'authority.attestor.1',
    'human.authority.conflict.resolved',
    'conflict_delegated_1',
    {
      conflict_id: 'conflict_delegated_1',
      subject_id: 'learner.child.1',
      evidence_digest: TRANSITION
    },
    'event_conflict_delegated_resolved_1'
  );
  assert.equal(resolveDelegated(fx.store).allow, true);
});

test('holder can revoke consent even after authority is gone, but wrong actor or handle cannot', async t => {
  const fx = await fixture(t);
  seedAuthority(fx.store);
  const receipt = issueReceipt(fx.store);
  commitReceipt(fx.store, receipt);

  assert.throws(
    () => append(
      fx.store,
      'adult.other',
      'human.delegated-consent.revoked',
      receipt.consent_id,
      {
        consent_id: receipt.consent_id,
        holder_id: 'adult.guardian.1',
        revocation_handle_hash: REVOCATION
      },
      'event_delegated_consent_wrong_actor'
    ),
    /authenticated actor/
  );
  assert.throws(
    () => append(
      fx.store,
      'adult.guardian.1',
      'human.delegated-consent.revoked',
      receipt.consent_id,
      {
        consent_id: receipt.consent_id,
        holder_id: 'adult.guardian.1',
        revocation_handle_hash: '0'.repeat(64)
      },
      'event_delegated_consent_wrong_handle'
    ),
    error => error.code === 'delegated_consent_revocation_mismatch'
  );

  append(
    fx.store,
    'authority.attestor.1',
    'human.authority.revoked',
    'authority_guardian_child_education_1',
    {
      grant_id: 'authority_guardian_child_education_1',
      subject_id: 'learner.child.1',
      evidence_digest: TRANSITION
    },
    'event_authority_delegated_revoke_2'
  );
  append(
    fx.store,
    'adult.guardian.1',
    'human.delegated-consent.revoked',
    receipt.consent_id,
    {
      consent_id: receipt.consent_id,
      holder_id: 'adult.guardian.1',
      revocation_handle_hash: REVOCATION
    },
    'event_delegated_consent_revoke_1'
  );
  assert.equal(fx.store.getDelegatedConsent(receipt.consent_id).status, 'revoked');
  assert.equal(resolveDelegated(fx.store).code, 'authority_grant_inactive');
});

test('grant commit rejects stale receipt, wrong actor and receipt not bound to current authority', async t => {
  const fx = await fixture(t);
  seedAuthority(fx.store);
  const receipt = issueReceipt(fx.store);
  assert.throws(
    () => append(
      fx.store,
      'adult.other',
      'human.delegated-consent.granted',
      receipt.consent_id,
      receipt,
      'event_delegated_consent_wrong_holder'
    ),
    /authenticated actor/
  );
  const tampered = { ...receipt, authority_digest: '0'.repeat(64) };
  assert.throws(
    () => append(
      fx.store,
      'adult.guardian.1',
      'human.delegated-consent.granted',
      tampered.consent_id,
      tampered,
      'event_delegated_consent_wrong_authority'
    ),
    error => error.code === 'delegated_consent_authority_stale'
  );
  const stale = {
    ...receipt,
    consent_id: 'delegated_consent_stale_1',
    granted_at: '2026-08-10T00:00:00.000Z'
  };
  assert.throws(
    () => append(
      fx.store,
      'adult.guardian.1',
      'human.delegated-consent.granted',
      stale.consent_id,
      stale,
      'event_delegated_consent_stale_1'
    ),
    error => error.code === 'delegated_consent_stale_grant'
  );
});
