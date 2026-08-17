import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createGatewayClient } from '../../packages/axiom-client/index.mjs';
import { startDevelopmentStack } from '../src/dev.mjs';
import { reserveProductionPortBlock } from '../src/lib/production-host.mjs';

const REMOTE_TABLE_PREFIX = 'remote_social_';
const ACCEPTED_REMOTE_TABLES = Object.freeze([
  'remote_social_abuse_preferences',
  'remote_social_abuse_schema_migrations',
  'remote_social_admission_objects',
  'remote_social_admission_schema_migrations',
  'remote_social_admissions',
  'remote_social_following_schema_migrations',
  'remote_social_follows',
  'remote_social_observations',
  'remote_social_quarantines',
  'remote_social_reports',
  'remote_social_retention_receipts',
  'remote_social_retention_schema_migrations',
  'remote_social_schema_migrations',
  'remote_social_staging'
]);

test('G5B exposes only authenticated owner-scoped read-only remote review', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-remote-review-route-'));
  const lease = await reserveProductionPortBlock('remote social review route test');
  const basePort = lease.base_port;
  const tokenA = `review-a-${'a'.repeat(40)}`;
  const tokenB = `review-b-${'b'.repeat(40)}`;
  let stack;
  t.after(async () => {
    try {
      await stack?.stop();
    } finally {
      await lease.release();
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  stack = await startDevelopmentStack({
    dataDir,
    environment: 'test',
    autoBootstrap: true,
    gatewayPort: basePort,
    hypervisorPort: basePort + 1,
    sandboxPort: basePort + 2,
    gridPort: basePort + 3,
    hypervisorUrl: `http://127.0.0.1:${basePort + 1}`,
    sandboxUrl: `http://127.0.0.1:${basePort + 2}`,
    gridUrl: `http://127.0.0.1:${basePort + 3}`,
    rateLimitCapacity: 1_000,
    rateLimitRefillPerSecond: 1_000,
    apiTokens: {
      [tokenA]: {
        id: 'remote-review-owner-a',
        type: 'human',
        roles: ['administrator'],
        scopes: ['*']
      },
      [tokenB]: {
        id: 'remote-review-owner-b',
        type: 'human',
        roles: ['administrator'],
        scopes: ['*']
      }
    }
  });

  const gateway = `http://127.0.0.1:${basePort}`;
  const grid = stack.services.find(service => service.name === 'grid');
  assert.ok(grid?.store?.db);

  const initialRemoteState = remoteTableState(grid.store.db);
  assert.deepEqual(Object.keys(initialRemoteState), ACCEPTED_REMOTE_TABLES);

  const clientA = createGatewayClient({
    token: tokenA,
    request: (path, options) => fetch(`${gateway}${path}`, options)
  });
  const clientB = createGatewayClient({
    token: tokenB,
    request: (path, options) => fetch(`${gateway}${path}`, options)
  });

  const reviewA = await clientA.call('social_remote_review.get');
  const reviewB = await clientB.call('social_remote_review.get');
  assertReviewBoundary(reviewA, 'remote-review-owner-a');
  assertReviewBoundary(reviewB, 'remote-review-owner-b');
  assert.notEqual(reviewA.owner, reviewB.owner);
  assert.deepEqual(remoteTableState(grid.store.db), initialRemoteState);

  await assert.rejects(
    () => clientA.call('social_remote_review.get', {
      query: { owner: 'remote-review-owner-b' }
    }),
    error => error.code === 'invalid_client_request'
  );

  const rawOverride = await fetch(
    `${gateway}/v1/social/remote-review?owner=remote-review-owner-b`,
    { headers: { authorization: `Bearer ${tokenA}` } }
  );
  assert.equal(rawOverride.status, 400);
  const rawOverrideBody = await rawOverride.json();
  assert.equal(rawOverrideBody.error?.code, 'validation_error');
  assert.deepEqual(remoteTableState(grid.store.db), initialRemoteState);

  const localSocial = await clientA.call('social.get');
  assert.equal(localSocial.schema, 'axiom-local-social-snapshot.v1');
  assert.equal(localSocial.owner, 'remote-review-owner-a');
  assert.equal(localSocial.network_effect, 'none');
  assert.equal('stages' in localSocial, false);
  assert.deepEqual(remoteTableState(grid.store.db), initialRemoteState);
});

function assertReviewBoundary(review, owner) {
  assert.equal(review.schema, 'axiom-remote-social-review.v1');
  assert.equal(review.owner, owner);
  assert.equal(review.activation_scope, 'local-read-only-review');
  assert.deepEqual(review.stages, []);
  assert.deepEqual(review.admissions, []);
  assert.deepEqual(review.observations, []);
  assert.deepEqual(review.follows, []);
  assert.deepEqual(review.retention_receipts, []);
  assert.equal(review.transport_state_included, false);
  assert.equal(review.ranking_state_included, false);
  assert.equal(review.mutation_effect, 'none');
  assert.equal(review.network_effect, 'none');
  assert.equal(review.recommendation_effect, 'none');
  assert.equal(review.authority_effect, 'none');
  assert.equal(review.retention.within_policy, true);
}

function remoteTableState(db) {
  return Object.fromEntries(remoteTables(db).map(name => {
    const quoted = `"${name.replaceAll('"', '""')}"`;
    return [name, db.prepare(`SELECT * FROM ${quoted} ORDER BY rowid`).all()];
  }));
}

function remoteTables(db) {
  return db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name LIKE ?
    ORDER BY name
  `).all(`${REMOTE_TABLE_PREFIX}%`).map(row => row.name);
}
