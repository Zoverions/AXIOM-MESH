import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { CircleGridStore } from '../src/grid/circle-store.mjs';

async function createStore(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-circle-lifecycle-migration-'));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const store = new CircleGridStore({
    path: join(dataDir, 'grid.sqlite'),
    dataDir,
    identity,
    protector,
    checkpointInterval: 10_000
  });
  t.after(async () => {
    try { store.close(); } catch {}
    await rm(dataDir, { recursive: true, force: true });
  });
  return store;
}

test('lifecycle-head storage preserves Circle persistence v1 and uses a separate migration ledger', async t => {
  const store = await createStore(t);
  const status = store.getStatus();
  assert.equal(status.circle_persistence_schema_version, 1);

  const persistenceRows = store.db.prepare(`
    SELECT version, name, checksum
    FROM circle_persistence_schema_migrations
    ORDER BY version
  `).all();
  assert.equal(persistenceRows.length, 1);
  assert.equal(persistenceRows[0].version, 1);
  assert.equal(persistenceRows[0].name, 'durable-circle-head-projection');
  assert.match(persistenceRows[0].checksum, /^[a-f0-9]{64}$/);

  const lifecycleRows = store.db.prepare(`
    SELECT version, name, checksum
    FROM circle_lifecycle_head_schema_migrations
    ORDER BY version
  `).all();
  assert.equal(lifecycleRows.length, 1);
  assert.equal(lifecycleRows[0].version, 1);
  assert.equal(lifecycleRows[0].name, 'durable-circle-member-lifecycle-head-projection');
  assert.match(lifecycleRows[0].checksum, /^[a-f0-9]{64}$/);

  const columns = store.db.prepare('PRAGMA table_info(circle_member_lifecycle_heads)').all()
    .map(column => column.name);
  assert.deepEqual(columns, [
    'circle_id',
    'membership_id',
    'principal_id',
    'lifecycle_head_digest',
    'membership_lifecycle_digest',
    'credential_lifecycle_digest',
    'event_id',
    'event_seq',
    'updated_at'
  ]);

  const triggers = store.db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'trigger' AND name = 'circle_member_lifecycle_heads_reject_noop'
  `).all();
  assert.equal(triggers.length, 1);
});
