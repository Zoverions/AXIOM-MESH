import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { DataProtector } from '../src/lib/protector.mjs';
import { AuthorityGridStore } from '../src/grid/authority-store.mjs';

const EVIDENCE = 'a'.repeat(64);
const GRANT_EVIDENCE = 'b'.repeat(64);
const JURISDICTION = 'c'.repeat(64);
const TRANSITION_EVIDENCE = 'd'.repeat(64);
const CONFLICT_EVIDENCE = 'e'.repeat(64);

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

async function fixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-human-authority-grid-'));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = new DataProtector(Buffer.alloc(32, 7));
  const path = join(dataDir, 'grid.sqlite');
  let store = new AuthorityGridStore({ path, dataDir, identity, protector });
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
      store = new AuthorityGridStore({ path, dataDir, identity, protector });
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

function seedRelationshipAndGrant(store) {
  append(
    store,
    'authority.attestor.1',
    'human.relationship.claimed',
    'relationship_guardian_child_1',
    relationship(),
    'event_relationship_1'
  );
  append(
    store,
    'authority.attestor.1',
    'human.authority.granted',
    'authority_guardian_child_education_1',
    grant(),
    'event_authority_1'
  );
}

function resolve(store) {
  return store.resolveStoredHumanAuthority({
    holderType: 'human',
    subjectId: 'learner.child.1',
    holderId: 'adult.guardian.1',
    grantId: 'authority_guardian_child_education_1',
    controller: 'capsule:axiom.education',
    purpose: 'learning-progress-recording',
    action: 'education.learner.event.append',
    dataScopes: ['learning-progress:write'],
    asOf: '2026-08-11T06:00:00.000Z'
  });
}

test('authority projections keep sensitive grant bodies in encrypted event payloads', async t => {
  const fx = await fixture(t);
  seedRelationshipAndGrant(fx.store);

  const grantColumns = fx.store.db.prepare(
    'PRAGMA table_info(human_authority_grants)'
  ).all().map(column => column.name);
  for (const sensitive of ['controllers_json', 'purposes_json', 'data_scopes_json', 'actions_json']) {
    assert.equal(grantColumns.includes(sensitive), false);
  }

  const raw = fx.store.db.prepare(
    'SELECT payload_json FROM events WHERE event_id = ?'
  ).get('event_authority_1');
  assert.ok(raw);
  assert.equal(raw.payload_json.includes('capsule:axiom.education'), false);
  assert.equal(raw.payload_json.includes('learning-progress:write'), false);
  assert.equal(raw.payload_json.includes('education.learner.event.append'), false);

  const stored = fx.store.listHumanAuthorityGrants('learner.child.1', {
    holderId: 'adult.guardian.1'
  });
  assert.equal(stored.length, 1);
  assert.deepEqual(stored[0].controllers, ['capsule:axiom.education']);
  assert.deepEqual(stored[0].data_scopes, ['learning-progress:write']);
  assert.equal(resolve(fx.store).allow, true);
});

test('materialized authority state rebuilds from encrypted append-only events after restart', async t => {
  const fx = await fixture(t);
  seedRelationshipAndGrant(fx.store);
  assert.equal(resolve(fx.store).allow, true);

  const restarted = fx.restart();
  assert.equal(restarted.listHumanRelationshipClaims('learner.child.1').length, 1);
  assert.equal(restarted.listHumanAuthorityGrants('learner.child.1').length, 1);
  const result = resolve(restarted);
  assert.equal(result.allow, true);
  assert.equal(result.facts.grant_id, 'authority_guardian_child_education_1');
  assert.equal(restarted.verifyChain().valid, true);
});

test('relationship revocation blocks future authority without rewriting the grant', async t => {
  const fx = await fixture(t);
  seedRelationshipAndGrant(fx.store);
  assert.equal(resolve(fx.store).allow, true);

  append(
    fx.store,
    'authority.attestor.1',
    'human.relationship.revoked',
    'relationship_guardian_child_1',
    {
      claim_id: 'relationship_guardian_child_1',
      subject_id: 'learner.child.1',
      evidence_digest: TRANSITION_EVIDENCE
    },
    'event_relationship_revoke_1'
  );

  const relationshipState = fx.store.listHumanRelationshipClaims('learner.child.1')[0];
  const grantState = fx.store.listHumanAuthorityGrants('learner.child.1')[0];
  assert.equal(relationshipState.status, 'revoked');
  assert.equal(grantState.status, 'active');
  const result = resolve(fx.store);
  assert.equal(result.allow, false);
  assert.equal(result.code, 'authority_relationship_inactive');

  assert.throws(
    () => append(
      fx.store,
      'authority.attestor.1',
      'human.relationship.revoked',
      'relationship_guardian_child_1',
      {
        claim_id: 'relationship_guardian_child_1',
        subject_id: 'learner.child.1',
        evidence_digest: TRANSITION_EVIDENCE
      },
      'event_relationship_revoke_2'
    ),
    error => error.code === 'state_conflict'
  );
});

test('authority revocation changes only future resolution and rejects repeated transition', async t => {
  const fx = await fixture(t);
  seedRelationshipAndGrant(fx.store);

  append(
    fx.store,
    'authority.attestor.1',
    'human.authority.revoked',
    'authority_guardian_child_education_1',
    {
      grant_id: 'authority_guardian_child_education_1',
      subject_id: 'learner.child.1',
      evidence_digest: TRANSITION_EVIDENCE
    },
    'event_authority_revoke_1'
  );

  const state = fx.store.listHumanAuthorityGrants('learner.child.1')[0];
  assert.equal(state.status, 'revoked');
  const result = resolve(fx.store);
  assert.equal(result.allow, false);
  assert.equal(result.code, 'authority_grant_inactive');
  assert.throws(
    () => append(
      fx.store,
      'authority.attestor.1',
      'human.authority.revoked',
      'authority_guardian_child_education_1',
      {
        grant_id: 'authority_guardian_child_education_1',
        subject_id: 'learner.child.1',
        evidence_digest: TRANSITION_EVIDENCE
      },
      'event_authority_revoke_2'
    ),
    error => error.code === 'state_conflict'
  );
});

test('unresolved conflict denies the exact grant and resolution restores eligibility', async t => {
  const fx = await fixture(t);
  seedRelationshipAndGrant(fx.store);

  append(
    fx.store,
    'authority.attestor.1',
    'human.authority.conflict.opened',
    'conflict_guardian_education_1',
    conflict(),
    'event_conflict_1'
  );
  let result = resolve(fx.store);
  assert.equal(result.allow, false);
  assert.equal(result.code, 'authority_conflict_unresolved');

  append(
    fx.store,
    'authority.attestor.1',
    'human.authority.conflict.resolved',
    'conflict_guardian_education_1',
    {
      conflict_id: 'conflict_guardian_education_1',
      subject_id: 'learner.child.1',
      evidence_digest: TRANSITION_EVIDENCE
    },
    'event_conflict_resolved_1'
  );
  assert.equal(fx.store.listHumanAuthorityConflicts('learner.child.1')[0].status, 'resolved');
  result = resolve(fx.store);
  assert.equal(result.allow, true);
});

test('supersession requires matching replacement artifacts and preserves both records', async t => {
  const fx = await fixture(t);
  seedRelationshipAndGrant(fx.store);

  append(
    fx.store,
    'authority.attestor.2',
    'human.relationship.claimed',
    'relationship_guardian_child_2',
    relationship({
      claim_id: 'relationship_guardian_child_2',
      issuer_id: 'authority.attestor.2',
      evidence_digest: 'f'.repeat(64)
    }),
    'event_relationship_2'
  );
  append(
    fx.store,
    'authority.attestor.1',
    'human.relationship.superseded',
    'relationship_guardian_child_1',
    {
      claim_id: 'relationship_guardian_child_1',
      subject_id: 'learner.child.1',
      superseded_by_claim_id: 'relationship_guardian_child_2',
      evidence_digest: TRANSITION_EVIDENCE
    },
    'event_relationship_supersede_1'
  );
  const relationships = fx.store.listHumanRelationshipClaims('learner.child.1');
  assert.deepEqual(
    relationships.map(item => [item.claim_id, item.status]),
    [
      ['relationship_guardian_child_1', 'superseded'],
      ['relationship_guardian_child_2', 'active']
    ]
  );

  append(
    fx.store,
    'authority.attestor.2',
    'human.authority.granted',
    'authority_guardian_child_education_2',
    grant({
      grant_id: 'authority_guardian_child_education_2',
      relationship_claim_id: 'relationship_guardian_child_2',
      issuer_id: 'authority.attestor.2',
      evidence_digest: '9'.repeat(64)
    }),
    'event_authority_2'
  );
  append(
    fx.store,
    'authority.attestor.1',
    'human.authority.superseded',
    'authority_guardian_child_education_1',
    {
      grant_id: 'authority_guardian_child_education_1',
      subject_id: 'learner.child.1',
      superseded_by_grant_id: 'authority_guardian_child_education_2',
      evidence_digest: TRANSITION_EVIDENCE
    },
    'event_authority_supersede_1'
  );
  const grants = fx.store.listHumanAuthorityGrants('learner.child.1');
  assert.deepEqual(
    grants.map(item => [item.grant_id, item.status]),
    [
      ['authority_guardian_child_education_1', 'superseded'],
      ['authority_guardian_child_education_2', 'active']
    ]
  );
});

test('grant and conflict creation reject missing or mismatched relationship/grant references', async t => {
  const fx = await fixture(t);
  assert.throws(
    () => append(
      fx.store,
      'authority.attestor.1',
      'human.authority.granted',
      'authority_guardian_child_education_1',
      grant(),
      'event_authority_without_relationship'
    ),
    error => error.code === 'state_conflict'
  );

  append(
    fx.store,
    'authority.attestor.1',
    'human.relationship.claimed',
    'relationship_guardian_child_1',
    relationship(),
    'event_relationship_for_conflict'
  );
  append(
    fx.store,
    'authority.attestor.1',
    'human.authority.granted',
    'authority_guardian_child_education_1',
    grant(),
    'event_authority_for_conflict'
  );
  assert.throws(
    () => append(
      fx.store,
      'authority.attestor.1',
      'human.authority.conflict.opened',
      'conflict_bad_grant',
      conflict({
        conflict_id: 'conflict_bad_grant',
        grant_ids: ['authority_missing']
      }),
      'event_conflict_bad_grant'
    ),
    error => error.code === 'state_conflict'
  );
});
