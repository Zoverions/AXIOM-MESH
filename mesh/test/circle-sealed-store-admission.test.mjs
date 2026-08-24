import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import {
  LifecycleGuardedAcceptedSocialCircleGridStore
} from '../src/grid/accepted-social-circle-store.mjs';
import { CIRCLE_GRID_PERSISTENCE_EVENT_KIND } from '../src/grid/circle-persistence-state.mjs';
import {
  SEALED_CIRCLE_STORE_ADMISSION_SCHEMA,
  SealedAcceptedSocialCircleGridStore,
  getSealedCircleStoreAdmissionPolicy,
  validateSealedCircleStoreAdmissionPolicy
} from '../src/grid/sealed-accepted-social-circle-store.mjs';
import {
  buildCircleMemberLifecycleGridHeadCandidate,
  getCircleLifecycleGridHeadPolicy
} from '../../packages/axiom-circle-lifecycle-grid-head/index.mjs';
import {
  FIXTURE_CIRCLE_ID,
  FIXTURE_MEMBERSHIP_ID,
  FIXTURE_PRINCIPAL,
  buildLifecycleGridFixtureInput
} from './helpers/circle-lifecycle-grid-fixture.mjs';

async function createBaseFixture() {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-circle-sealed-store-'));
  const path = join(dataDir, 'grid.sqlite');
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  return { dataDir, path, identity, protector };
}

function openSealed(fixture) {
  return new SealedAcceptedSocialCircleGridStore({
    path: fixture.path,
    dataDir: fixture.dataDir,
    identity: fixture.identity,
    protector: fixture.protector,
    checkpointInterval: 10_000
  });
}

test('sealed-store policy exposes only the possession-bound Circle persistence entry', () => {
  const policy = getSealedCircleStoreAdmissionPolicy();
  assert.equal(policy.schema, SEALED_CIRCLE_STORE_ADMISSION_SCHEMA);
  assert.equal(validateSealedCircleStoreAdmissionPolicy(policy), true);
  assert.equal(policy.status, 'inert-production-selection-prerequisite');
  assert.equal(policy.runtime_activation, false);
  assert.equal(policy.production_store_selected, false);
  assert.equal(policy.authority_effect, 'none');
  assert.equal(policy.network_effect, 'none');
  assert.equal(policy.requirements.accepted_social_circle_composition_required, true);
  assert.equal(policy.requirements.generic_internal_commit_circle_events_allowed, false);
  assert.equal(policy.requirements.raw_circle_persistence_append_allowed, false);
  assert.equal(policy.requirements.direct_lifecycle_guarded_circle_append_allowed, false);
  assert.equal(policy.requirements.raw_member_lifecycle_append_allowed, false);
  assert.equal(policy.requirements.possession_bound_circle_persistence_commit_available, true);
  assert.equal(policy.requirements.member_lifecycle_authorized_commit_available, false);
});

test('raw Circle persistence, raw lifecycle, and direct guarded append all fail closed', async t => {
  const fixture = await createBaseFixture();
  const store = openSealed(fixture);
  t.after(async () => {
    try { store.close(); } catch {}
    await rm(fixture.dataDir, { recursive: true, force: true });
  });

  assert.throws(
    () => store.appendEvents({
      traceId: 'sealed_raw_circle',
      actor: FIXTURE_PRINCIPAL,
      events: [{ kind: CIRCLE_GRID_PERSISTENCE_EVENT_KIND }]
    }),
    /possession-bound atomic admission is required/
  );

  assert.throws(
    () => store.appendEvents({
      traceId: 'sealed_raw_lifecycle',
      actor: FIXTURE_PRINCIPAL,
      events: [{ kind: getCircleLifecycleGridHeadPolicy().grid_event_kind }]
    }),
    /authorized lifecycle commit path is required/
  );

  assert.throws(
    () => store.appendCirclePersistenceWithLifecycleGuards({}),
    /possession-bound atomic admission is required/
  );

  assert.throws(
    () => store.appendCircleMemberLifecycleEvent({}),
    /authorized lifecycle commit path is required/
  );

  assert.equal(typeof store.commitCirclePersistenceWithPossessionBoundAtomicAdmission, 'function');
  assert.equal(store.getStatus().accepted_social_storage.activation_state, 'accepted-local-storage');
  assert.deepEqual(store.getStatus().sealed_circle_store_admission, getSealedCircleStoreAdmissionPolicy());
});

test('sealed store reconstructs existing Circle lifecycle state read-only without widening Social', async t => {
  const fixture = await createBaseFixture();
  let store = new LifecycleGuardedAcceptedSocialCircleGridStore({
    path: fixture.path,
    dataDir: fixture.dataDir,
    identity: fixture.identity,
    protector: fixture.protector,
    checkpointInterval: 10_000
  });
  t.after(async () => {
    try { store.close(); } catch {}
    await rm(fixture.dataDir, { recursive: true, force: true });
  });

  const input = await buildLifecycleGridFixtureInput();
  const candidate = buildCircleMemberLifecycleGridHeadCandidate(input);
  const [seed] = store.appendEvents({
    traceId: 'sealed_preseed_lifecycle',
    actor: FIXTURE_PRINCIPAL,
    events: [candidate.event]
  });
  store.close();

  store = openSealed(fixture);
  const head = store.getCircleMemberLifecycleHead(FIXTURE_CIRCLE_ID, FIXTURE_MEMBERSHIP_ID);
  assert.equal(head.lifecycle_head_digest, candidate.resulting_grid_lifecycle_head_digest);
  assert.equal(head.event_id, seed.event_id);
  assert.equal(store.getStatus().accepted_social_storage.activation_state, 'accepted-local-storage');
  assert.equal(store.getStatus().remote_social_runtime_store.public_mutation_routes, false);
  assert.equal(store.getStatus().remote_social_runtime_store.network_egress, false);
  assert.equal(store.getStatus().circle_persistence_public_route, false);
  assert.equal(store.getStatus().circle_member_lifecycle_public_route, false);
});
