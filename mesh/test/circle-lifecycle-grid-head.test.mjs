import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { CircleGridStore } from '../src/grid/circle-store.mjs';
import {
  buildCircleMemberLifecycleGridHeadCandidate,
  getCircleLifecycleGridHeadPolicy,
  reconstructCircleMemberLifecycleGridHeadCandidate,
  validateCircleLifecycleGridHeadPolicy
} from '../../packages/axiom-circle-lifecycle-grid-head/index.mjs';
import {
  FIXTURE_CIRCLE_ID,
  FIXTURE_MEMBERSHIP_ID,
  FIXTURE_PRINCIPAL,
  buildLifecycleGridFixtureInput,
  lifecycleCirclePackage,
  lifecycleEvent,
  lifecycleMembership,
  lifecycleMembershipHistory
} from './helpers/circle-lifecycle-grid-fixture.mjs';

async function createStore(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-circle-lifecycle-grid-head-'));
  const grid = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  let store = new CircleGridStore({
    path: join(dataDir, 'grid.sqlite'),
    dataDir,
    identity: grid,
    protector,
    checkpointInterval: 10_000
  });
  t.after(async () => {
    try { store.close(); } catch {}
    await rm(dataDir, { recursive: true, force: true });
  });
  return {
    dataDir,
    grid,
    protector,
    get store() { return store; },
    replaceStore(next) { store = next; }
  };
}

function eventCount(store) {
  return Number(store.db.prepare('SELECT COUNT(*) AS count FROM events').get().count);
}

test('Circle lifecycle Grid-head policy is exact, inert, and non-authorizing', () => {
  const policy = getCircleLifecycleGridHeadPolicy();
  assert.equal(validateCircleLifecycleGridHeadPolicy(policy), true);
  assert.equal(policy.runtime_activation, false);
  assert.equal(policy.requirements.grid_lifecycle_head_compare_and_set, true);
  assert.equal(policy.requirements.non_genesis_head_must_change_lifecycle_state, true);
  assert.equal(policy.requirements.credential_lifecycle_validated_against_retained_acceptance_identity, true);
  assert.equal(policy.requirements.lifecycle_head_record_is_authorization_proof, false);
  assert.equal(policy.requirements.public_grid_route, false);
});

test('candidate binds exact validated membership and credential lifecycle state', async () => {
  const input = await buildLifecycleGridFixtureInput();
  const candidate = buildCircleMemberLifecycleGridHeadCandidate(input);
  const reconstructed = reconstructCircleMemberLifecycleGridHeadCandidate(candidate.event);

  assert.equal(candidate.circle_id, FIXTURE_CIRCLE_ID);
  assert.equal(candidate.membership_id, FIXTURE_MEMBERSHIP_ID);
  assert.equal(candidate.principal_id, FIXTURE_PRINCIPAL);
  assert.equal(candidate.previous_grid_lifecycle_head_digest, null);
  assert.equal(candidate.membership_lifecycle_digest, digestObject(input.membershipLifecycle));
  assert.equal(candidate.credential_lifecycle_digest, digestObject(input.credentialLifecycle));
  assert.equal(candidate.resulting_grid_lifecycle_head_digest, candidate.payload_digest);
  assert.equal(reconstructed.resulting_grid_lifecycle_head_digest, candidate.resulting_grid_lifecycle_head_digest);
  assert.equal(candidate.runtime_authority, false);
  assert.equal(candidate.external_effect_authority, false);
});

test('signed Grid lifecycle head is durable, exact-replay idempotent, and restart reconstructable', async t => {
  const fixture = await createStore(t);
  const input = await buildLifecycleGridFixtureInput();
  const candidate = buildCircleMemberLifecycleGridHeadCandidate(input);

  const [first] = fixture.store.appendEvents({
    traceId: 'circle_lifecycle_grid_genesis',
    actor: FIXTURE_PRINCIPAL,
    events: [candidate.event]
  });
  const countAfterFirst = eventCount(fixture.store);
  const head = fixture.store.getCircleMemberLifecycleHead(FIXTURE_CIRCLE_ID, FIXTURE_MEMBERSHIP_ID);
  assert.equal(head.lifecycle_head_digest, candidate.resulting_grid_lifecycle_head_digest);
  assert.equal(head.event_id, first.event_id);
  assert.equal(head.principal_id, FIXTURE_PRINCIPAL);

  const [replay] = fixture.store.appendEvents({
    traceId: 'circle_lifecycle_grid_replay_other_trace',
    actor: FIXTURE_PRINCIPAL,
    events: [candidate.event]
  });
  assert.equal(replay.event_id, first.event_id);
  assert.equal(eventCount(fixture.store), countAfterFirst);

  fixture.store.close();
  const reopened = new CircleGridStore({
    path: join(fixture.dataDir, 'grid.sqlite'),
    dataDir: fixture.dataDir,
    identity: fixture.grid,
    protector: fixture.protector,
    checkpointInterval: 10_000
  });
  fixture.replaceStore(reopened);
  const rebuilt = reopened.getCircleMemberLifecycleHead(FIXTURE_CIRCLE_ID, FIXTURE_MEMBERSHIP_ID);
  assert.equal(rebuilt.lifecycle_head_digest, candidate.resulting_grid_lifecycle_head_digest);
  assert.equal(rebuilt.event_id, first.event_id);
});

test('role narrowing advances the durable lifecycle head with exact predecessor CAS', async t => {
  const fixture = await createStore(t);
  const genesisInput = await buildLifecycleGridFixtureInput();
  const genesis = buildCircleMemberLifecycleGridHeadCandidate(genesisInput);
  fixture.store.appendEvents({
    traceId: 'circle_lifecycle_grid_seed',
    actor: FIXTURE_PRINCIPAL,
    events: [genesis.event]
  });

  const narrow = lifecycleEvent({
    kind: 'role-narrow',
    at: '2026-08-20T12:20:00.000Z',
    roleIds: []
  });
  const narrowedInput = await buildLifecycleGridFixtureInput({
    circlePackage: lifecycleCirclePackage(lifecycleMembership({ roleIds: [] })),
    membershipLifecycle: lifecycleMembershipHistory([narrow]),
    previousGridLifecycleHeadDigest: genesis.resulting_grid_lifecycle_head_digest
  });
  const narrowed = buildCircleMemberLifecycleGridHeadCandidate(narrowedInput);
  fixture.store.appendEvents({
    traceId: 'circle_lifecycle_grid_narrow',
    actor: FIXTURE_PRINCIPAL,
    events: [narrowed.event]
  });
  const head = fixture.store.getCircleMemberLifecycleHead(FIXTURE_CIRCLE_ID, FIXTURE_MEMBERSHIP_ID);
  assert.equal(head.lifecycle_head_digest, narrowed.resulting_grid_lifecycle_head_digest);
  assert.equal(head.membership_lifecycle_digest, narrowed.membership_lifecycle_digest);
});

test('stale predecessor and no-op head churn fail closed without advancing Grid', async t => {
  const fixture = await createStore(t);
  const genesisInput = await buildLifecycleGridFixtureInput();
  const genesis = buildCircleMemberLifecycleGridHeadCandidate(genesisInput);
  fixture.store.appendEvents({
    traceId: 'circle_lifecycle_grid_seed_stale',
    actor: FIXTURE_PRINCIPAL,
    events: [genesis.event]
  });

  const narrow = lifecycleEvent({
    kind: 'role-narrow',
    at: '2026-08-20T12:20:00.000Z',
    roleIds: []
  });
  const narrowedInput = await buildLifecycleGridFixtureInput({
    circlePackage: lifecycleCirclePackage(lifecycleMembership({ roleIds: [] })),
    membershipLifecycle: lifecycleMembershipHistory([narrow]),
    previousGridLifecycleHeadDigest: genesis.resulting_grid_lifecycle_head_digest
  });
  const narrowed = buildCircleMemberLifecycleGridHeadCandidate(narrowedInput);
  fixture.store.appendEvents({
    traceId: 'circle_lifecycle_grid_narrow_stale',
    actor: FIXTURE_PRINCIPAL,
    events: [narrowed.event]
  });
  const countBeforeFailures = eventCount(fixture.store);

  const suspend = lifecycleEvent({
    kind: 'membership-suspend',
    at: '2026-08-20T12:25:00.000Z',
    previous: narrow
  });
  const staleInput = await buildLifecycleGridFixtureInput({
    circlePackage: lifecycleCirclePackage(lifecycleMembership({
      status: 'suspended',
      statusEffectiveAt: suspend.at,
      roleIds: []
    })),
    membershipLifecycle: lifecycleMembershipHistory([narrow, suspend]),
    previousGridLifecycleHeadDigest: genesis.resulting_grid_lifecycle_head_digest
  });
  const stale = buildCircleMemberLifecycleGridHeadCandidate(staleInput);
  assert.throws(
    () => fixture.store.appendEvents({
      traceId: 'circle_lifecycle_grid_stale',
      actor: FIXTURE_PRINCIPAL,
      events: [stale.event]
    }),
    error => error?.code === 'circle_member_lifecycle_head_conflict'
  );
  assert.equal(eventCount(fixture.store), countBeforeFailures);

  const noopInput = await buildLifecycleGridFixtureInput({
    circlePackage: lifecycleCirclePackage(lifecycleMembership({ roleIds: [] })),
    membershipLifecycle: lifecycleMembershipHistory([narrow]),
    previousGridLifecycleHeadDigest: narrowed.resulting_grid_lifecycle_head_digest
  });
  const noop = buildCircleMemberLifecycleGridHeadCandidate(noopInput);
  assert.throws(
    () => fixture.store.appendEvents({
      traceId: 'circle_lifecycle_grid_noop',
      actor: FIXTURE_PRINCIPAL,
      events: [noop.event]
    }),
    /must change lifecycle state/
  );
  assert.equal(eventCount(fixture.store), countBeforeFailures);
  const head = fixture.store.getCircleMemberLifecycleHead(FIXTURE_CIRCLE_ID, FIXTURE_MEMBERSHIP_ID);
  assert.equal(head.lifecycle_head_digest, narrowed.resulting_grid_lifecycle_head_digest);
});

test('malformed or identity-substituted lifecycle head event fails before Grid mutation', async t => {
  const fixture = await createStore(t);
  const input = await buildLifecycleGridFixtureInput();
  const candidate = buildCircleMemberLifecycleGridHeadCandidate(input);
  const before = eventCount(fixture.store);

  const hidden = structuredClone(candidate.event);
  hidden.payload.runtime_grant = true;
  assert.throws(
    () => fixture.store.appendEvents({
      traceId: 'circle_lifecycle_grid_hidden',
      actor: FIXTURE_PRINCIPAL,
      events: [hidden]
    }),
    /fields are invalid/
  );
  assert.equal(eventCount(fixture.store), before);

  const wrongSubject = { ...candidate.event, subject: 'circle.other' };
  assert.throws(
    () => fixture.store.appendEvents({
      traceId: 'circle_lifecycle_grid_wrong_subject',
      actor: FIXTURE_PRINCIPAL,
      events: [wrongSubject]
    }),
    /event identity is invalid/
  );
  assert.equal(eventCount(fixture.store), before);
});
