import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { GridStore } from '../src/grid/store.mjs';

async function fixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-siea-migration-'));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const path = join(dataDir, 'grid.sqlite');
  const store = new GridStore({ path, dataDir, identity, protector });
  t.after(async () => {
    try { store.close(); } catch {}
    await rm(dataDir, { recursive: true, force: true });
  });
  return { store };
}

test('Grid schema migration creates metadata-minimized sovereign information materialized state', async t => {
  const { store } = await fixture(t);
  assert.equal(store.getStatus().schema_version, 11);
  const columns = store.db.prepare('PRAGMA table_info(siea_objects)').all().map(row => row.name);
  assert.deepEqual(columns, [
    'storage_id',
    'object_kind',
    'object_json',
    'object_digest',
    'lifecycle_status',
    'created_at',
    'updated_at'
  ]);
  for (const forbidden of ['subject', 'controller', 'owner', 'principal', 'requester', 'object_ref']) {
    assert.equal(columns.includes(forbidden), false);
  }
  const migration = store.db.prepare('SELECT version, name FROM schema_migrations WHERE version = 11').get();
  assert.deepEqual(migration, { version: 11, name: 'sovereign-information-materialized-state' });
});
