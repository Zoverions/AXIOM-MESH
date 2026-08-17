import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { DataProtector } from '../src/lib/protector.mjs';
import {
  ACCEPTED_SOCIAL_STORAGE,
  ACCEPTED_SOCIAL_STORAGE_SCHEMA,
  AcceptedSocialGridStore
} from '../src/grid/accepted-social-store.mjs';

async function storeFixture() {
  const root = await mkdtemp(join(tmpdir(), 'axiom-accepted-social-store-'));
  const dataDir = join(root, 'data');
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = new DataProtector(randomBytes(32));
  const path = join(dataDir, 'grid.sqlite');
  const store = new AcceptedSocialGridStore({ path, dataDir, identity, protector });
  return { root, store };
}

test('accepted social storage descriptor activates local schemas without mutation or network authority', () => {
  assert.equal(ACCEPTED_SOCIAL_STORAGE.schema, ACCEPTED_SOCIAL_STORAGE_SCHEMA);
  assert.equal(ACCEPTED_SOCIAL_STORAGE.activation_state, 'accepted-local-storage');
  assert.equal(ACCEPTED_SOCIAL_STORAGE.local_authored_social_storage, true);
  assert.equal(ACCEPTED_SOCIAL_STORAGE.remote_staging_storage, true);
  assert.equal(ACCEPTED_SOCIAL_STORAGE.remote_admission_storage, true);
  assert.equal(ACCEPTED_SOCIAL_STORAGE.remote_following_storage, true);
  assert.equal(ACCEPTED_SOCIAL_STORAGE.remote_retention_storage, true);
  assert.equal(ACCEPTED_SOCIAL_STORAGE.remote_abuse_storage, true);
  assert.equal(ACCEPTED_SOCIAL_STORAGE.remote_review_route, 'owner-scoped-read-only');
  assert.equal(ACCEPTED_SOCIAL_STORAGE.public_mutation_routes, false);
  assert.equal(ACCEPTED_SOCIAL_STORAGE.internal_admission_finalizer, false);
  assert.equal(ACCEPTED_SOCIAL_STORAGE.network_egress, false);
  assert.equal(ACCEPTED_SOCIAL_STORAGE.transport_included, false);
  assert.equal(ACCEPTED_SOCIAL_STORAGE.automatic_admission, false);
  assert.equal(ACCEPTED_SOCIAL_STORAGE.automatic_follow, false);
  assert.equal(ACCEPTED_SOCIAL_STORAGE.automatic_federation, false);
  assert.equal(ACCEPTED_SOCIAL_STORAGE.recommendation_effect, 'none');
  assert.equal(ACCEPTED_SOCIAL_STORAGE.authority_effect, 'none');
});

test('accepted store initializes exact remote review schemas but no transport schema', async t => {
  const setup = await storeFixture();
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });

  const status = setup.store.getStatus();
  assert.deepEqual(status.accepted_social_storage, ACCEPTED_SOCIAL_STORAGE);
  assert.equal(status.remote_social_schema_version, 1);
  assert.equal(status.remote_social_admission_schema_version, 1);
  assert.equal(status.remote_social_following_schema_version, 1);
  assert.equal(status.remote_social_retention_schema_version, 1);
  assert.equal(status.remote_social_abuse_schema_version, 1);
  assert.equal(status.remote_social_runtime_store.activation_state, 'accepted-local-storage');
  assert.equal(status.remote_social_runtime_store.public_routes, true);
  assert.equal(status.remote_social_runtime_store.public_mutation_routes, false);
  assert.equal(status.remote_social_runtime_store.read_only_review_route, true);
  assert.equal(status.remote_social_runtime_store.network_egress, false);
  assert.equal(status.remote_social_runtime_store.transport_included, false);

  const tables = new Set(setup.store.db.prepare(`
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
    'remote_social_quarantines'
  ]) {
    assert.equal(tables.has(name), true, `${name} missing from accepted storage`);
  }
  assert.equal(tables.has('remote_social_transport_jobs'), false);
});

test('accepted store includes no transport methods', async t => {
  const setup = await storeFixture();
  t.after(async () => {
    setup.store.close();
    await rm(setup.root, { recursive: true, force: true });
  });
  for (const method of [
    'queueRemoteSocialTransportJob',
    'processRemoteSocialTransportJob',
    'getRemoteSocialTransportJob',
    'listRemoteSocialTransportJobs'
  ]) {
    assert.equal(typeof setup.store[method], 'undefined', `${method} leaked into accepted store`);
  }
});

test('accepted Grid source selects AcceptedSocialGridStore without a runtime toggle', async () => {
  const source = await readFile(new URL('../src/grid/server.mjs', import.meta.url), 'utf8');
  assert.match(source, /import \{ AcceptedSocialGridStore \} from '\.\/accepted-social-store\.mjs';/);
  assert.match(source, /new AcceptedSocialGridStore\s*\(/);
  assert.equal(source.includes("import { SocialGridStore } from './social-store.mjs';"), false);
  assert.equal(source.includes('RemoteSocialRuntimeCandidateGridStore'), false);
  assert.equal(source.includes('RemoteSocialTransportGridStore'), false);
  assert.equal(source.includes('AXIOM_REMOTE_SOCIAL'), false);
});
