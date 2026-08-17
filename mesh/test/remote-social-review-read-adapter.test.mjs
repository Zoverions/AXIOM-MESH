import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { DataProtector } from '../src/lib/protector.mjs';
import { SocialGridStore } from '../src/grid/social-store.mjs';
import { createRemoteSocialReviewReadAdapter } from '../src/grid/remote-social-review-read-adapter.mjs';
import { buildRemoteSocialReviewProjection } from '../src/grid/remote-social-review-projection.mjs';

async function createStore(t) {
  const root = await mkdtemp(join(tmpdir(), 'axiom-review-adapter-'));
  const dataDir = join(root, 'data');
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = new DataProtector(randomBytes(32));
  const store = new SocialGridStore({
    path: join(dataDir, 'grid.sqlite'),
    dataDir,
    identity,
    protector
  });
  t.after(async () => {
    store.close();
    await rm(root, { recursive: true, force: true });
  });
  return { store, protector };
}

function seal(store, table, column, key, value) {
  return store.protectJson(table, column, key, value);
}

test('accepted SocialGridStore stays remote-schema-free and projects an empty review', async t => {
  const { store } = await createStore(t);
  const adapter = createRemoteSocialReviewReadAdapter(store);
  for (const table of [
    'remote_social_staging',
    'remote_social_admissions',
    'remote_social_observations',
    'remote_social_follows',
    'remote_social_retention_receipts',
    'remote_social_transport_jobs'
  ]) {
    assert.equal(store.db.prepare(`
      SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?
    `).get(table), undefined);
  }
  const review = buildRemoteSocialReviewProjection(adapter, 'principal-empty-review');
  assert.equal(review.stages.length, 0);
  assert.equal(review.admissions.length, 0);
  assert.equal(review.observations.length, 0);
  assert.equal(review.follows.length, 0);
  assert.equal(review.retention_receipts.length, 0);
  assert.equal(review.retention.stage_count, 0);
  assert.equal(review.retention.admission_count, 0);
  assert.equal(review.retention.observation_count, 0);
  assert.equal(review.network_effect, 'none');
});

test('read adapter exposes only the six G5A read methods and no S3 mutation or transport surface', async t => {
  const { store } = await createStore(t);
  const adapter = createRemoteSocialReviewReadAdapter(store);
  assert.deepEqual(Object.keys(adapter).sort(), [
    'getRemoteSocialRetentionAssessment',
    'listRemoteSocialAdmissions',
    'listRemoteSocialFollows',
    'listRemoteSocialObservations',
    'listRemoteSocialRetentionReceipts',
    'listRemoteSocialStages'
  ]);
  for (const method of [
    'stageRemoteSocialPackage',
    'admitRemoteSocialStage',
    'followRemotePersona',
    'unfollowRemotePersona',
    'expireUnadmittedRemoteSocialStage',
    'queueRemoteSocialTransportJob',
    'processRemoteSocialTransportJob',
    'appendEvents'
  ]) {
    assert.equal(typeof adapter[method], 'undefined', `${method} leaked into review adapter`);
  }
});

test('present remote rows are decrypted and owner-scoped without creating a transport schema', async t => {
  const { store } = await createStore(t);
  store.db.exec(`
    CREATE TABLE remote_social_staging (
      stage_id TEXT PRIMARY KEY,
      owner TEXT NOT NULL,
      package_digest TEXT NOT NULL,
      exporter_grid_id TEXT NOT NULL,
      exporter_key_id TEXT NOT NULL,
      trust_label TEXT NOT NULL,
      package_json TEXT NOT NULL,
      import_plan_json TEXT NOT NULL,
      trusted_exporter_json TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    ) STRICT;
  `);
  const digestA = 'a'.repeat(64);
  const digestB = 'b'.repeat(64);
  for (const [owner, suffix, digest] of [
    ['principal-a', 'a', digestA],
    ['principal-b', 'b', digestB]
  ]) {
    const stageId = `stage-${suffix}`;
    const packageValue = {
      schema: 'axiom-social-exchange-package.v1',
      statement: { publications: [] },
      package_digest: digest,
      attestation: { signature: `hidden-${suffix}` }
    };
    const plan = {
      plan_digest: digest,
      status: 'review-only',
      requires_operator_approval: true,
      admitted_objects: {
        persona_projection_digests: [],
        publication_digests: [],
        transition_digests: []
      }
    };
    const exporter = {
      exporter_grid_id: `grid-${suffix}`,
      exporter_key_id: digest,
      public_key: `-----BEGIN PUBLIC KEY-----\nHIDDEN-${suffix}\n-----END PUBLIC KEY-----`
    };
    store.db.prepare(`
      INSERT INTO remote_social_staging(
        stage_id, owner, package_digest, exporter_grid_id, exporter_key_id,
        trust_label, package_json, import_plan_json, trusted_exporter_json,
        status, created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'staged', ?, ?)
    `).run(
      stageId,
      owner,
      digest,
      `grid-${suffix}`,
      digest,
      `manual-${suffix}`,
      seal(store, 'remote_social_staging', 'package_json', stageId, packageValue),
      seal(store, 'remote_social_staging', 'import_plan_json', stageId, plan),
      seal(store, 'remote_social_staging', 'trusted_exporter_json', stageId, exporter),
      '2026-08-17T04:00:00.000Z',
      '2099-08-17T05:00:00.000Z'
    );
  }

  const adapter = createRemoteSocialReviewReadAdapter(store);
  const reviewA = buildRemoteSocialReviewProjection(adapter, 'principal-a');
  const serialized = JSON.stringify(reviewA);
  assert.equal(reviewA.stages.length, 1);
  assert.equal(reviewA.stages[0].stage_id, 'stage-a');
  assert.equal(serialized.includes('stage-b'), false);
  assert.equal(serialized.includes('grid-b'), false);
  assert.equal(serialized.includes('HIDDEN-a'), false);
  assert.equal(serialized.includes('hidden-a'), false);
  assert.equal(store.db.prepare(`
    SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'remote_social_transport_jobs'
  `).get(), undefined);
});
