import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { AcceptedSocialGridStore } from '../src/grid/accepted-social-store.mjs';
import {
  ACCEPTED_SOCIAL_CIRCLE_COMPOSITION_SCHEMA,
  LifecycleGuardedAcceptedSocialCircleGridStore,
  getAcceptedSocialCircleCompositionPolicy,
  validateAcceptedSocialCircleCompositionPolicy
} from '../src/grid/accepted-social-circle-store.mjs';
import {
  buildCircleMemberLifecycleGridHeadCandidate
} from '../../packages/axiom-circle-lifecycle-grid-head/index.mjs';
import {
  FIXTURE_CIRCLE_ID,
  FIXTURE_MEMBERSHIP_ID,
  FIXTURE_PRINCIPAL,
  buildLifecycleGridFixtureInput
} from './helpers/circle-lifecycle-grid-fixture.mjs';

async function createFixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-accepted-social-circle-'));
  const path = join(dataDir, 'grid.sqlite');
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  let store = new LifecycleGuardedAcceptedSocialCircleGridStore({
    path,
    dataDir,
    identity,
    protector,
    checkpointInterval: 10_000
  });

  t.after(async () => {
    try { store.close(); } catch {}
    await rm(dataDir, { recursive: true, force: true });
  });

  return {
    dataDir,
    path,
    identity,
    protector,
    get store() { return store; },
    replaceStore(next) { store = next; }
  };
}

test('composition policy preserves accepted Social while keeping Circle runtime inert', () => {
  const policy = getAcceptedSocialCircleCompositionPolicy();
  assert.equal(policy.schema, ACCEPTED_SOCIAL_CIRCLE_COMPOSITION_SCHEMA);
  assert.equal(validateAcceptedSocialCircleCompositionPolicy(policy), true);
  assert.equal(policy.status, 'inert-store-composition-candidate');
  assert.equal(policy.runtime_activation, false);
  assert.equal(policy.production_store_selected, false);
  assert.equal(policy.authority_effect, 'none');
  assert.equal(policy.network_effect, 'none');
  assert.equal(policy.requirements.single_grid_store_instance, true);
  assert.equal(policy.requirements.single_sqlite_database, true);
  assert.equal(policy.requirements.accepted_social_storage_preserved, true);
  assert.equal(policy.requirements.accepted_remote_review_preserved, true);
  assert.equal(policy.requirements.circle_persistence_projection_preserved, true);
  assert.equal(policy.requirements.circle_member_lifecycle_projection_preserved, true);
  assert.equal(policy.requirements.lifecycle_guarded_circle_append_available, true);
  assert.equal(policy.requirements.public_circle_route, false);
  assert.equal(policy.requirements.gateway_circle_route, false);
  assert.equal(policy.requirements.hypervisor_circle_action, false);
  assert.equal(policy.requirements.social_mutation_surface_changed, false);
  assert.equal(policy.requirements.network_egress_changed, false);
});

test('one store initializes accepted Social and Circle projections in the same Grid database', async t => {
  const fixture = await createFixture(t);
  const store = fixture.store;

  assert.equal(store instanceof AcceptedSocialGridStore, true);
  const status = store.getStatus();
  assert.equal(status.accepted_social_storage.activation_state, 'accepted-local-storage');
  assert.equal(status.remote_social_runtime_store.public_routes, true);
  assert.equal(status.remote_social_runtime_store.public_mutation_routes, false);
  assert.equal(status.remote_social_runtime_store.network_egress, false);
  assert.equal(status.circle_persistence_schema_version, 1);
  assert.equal(status.circle_persistence_internal_projection, true);
  assert.equal(status.circle_member_lifecycle_internal_projection, true);
  assert.equal(status.circle_persistence_public_route, false);
  assert.equal(status.circle_member_lifecycle_public_route, false);
  assert.equal(status.circle_persistence_runtime_authority, false);
  assert.equal(status.circle_member_lifecycle_runtime_authority, false);
  assert.deepEqual(
    status.accepted_social_circle_composition,
    getAcceptedSocialCircleCompositionPolicy()
  );
  assert.equal(typeof store.appendCirclePersistenceWithLifecycleGuards, 'function');

  const tables = new Set(store.db.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table'
  `).all().map(row => row.name));

  for (const name of [
    'remote_social_staging',
    'remote_social_admissions',
    'remote_social_observations',
    'remote_social_follows',
    'remote_social_retention_receipts',
    'remote_social_abuse_preferences',
    'remote_social_reports',
    'remote_social_quarantines',
    'circle_persistence_heads',
    'circle_member_lifecycle_heads'
  ]) {
    assert.equal(tables.has(name), true, `${name} missing from composed Grid store`);
  }
  assert.equal(tables.has('remote_social_transport_jobs'), false);
});

test('Circle lifecycle head persists and reconstructs without losing accepted Social storage', async t => {
  const fixture = await createFixture(t);
  const input = await buildLifecycleGridFixtureInput();
  const candidate = buildCircleMemberLifecycleGridHeadCandidate(input);

  const [first] = fixture.store.appendEvents({
    traceId: 'accepted_social_circle_lifecycle_seed',
    actor: FIXTURE_PRINCIPAL,
    events: [candidate.event]
  });
  const head = fixture.store.getCircleMemberLifecycleHead(
    FIXTURE_CIRCLE_ID,
    FIXTURE_MEMBERSHIP_ID
  );
  assert.equal(head.lifecycle_head_digest, candidate.resulting_grid_lifecycle_head_digest);
  assert.equal(head.event_id, first.event_id);
  assert.equal(head.principal_id, FIXTURE_PRINCIPAL);
  assert.equal(fixture.store.getStatus().accepted_social_storage.activation_state, 'accepted-local-storage');

  fixture.store.close();
  const reopened = new LifecycleGuardedAcceptedSocialCircleGridStore({
    path: fixture.path,
    dataDir: fixture.dataDir,
    identity: fixture.identity,
    protector: fixture.protector,
    checkpointInterval: 10_000
  });
  fixture.replaceStore(reopened);

  const rebuilt = reopened.getCircleMemberLifecycleHead(
    FIXTURE_CIRCLE_ID,
    FIXTURE_MEMBERSHIP_ID
  );
  assert.equal(rebuilt.lifecycle_head_digest, candidate.resulting_grid_lifecycle_head_digest);
  assert.equal(rebuilt.event_id, first.event_id);
  assert.equal(reopened.getStatus().accepted_social_storage.activation_state, 'accepted-local-storage');
  assert.equal(reopened.getStatus().remote_social_runtime_store.public_mutation_routes, false);
});
