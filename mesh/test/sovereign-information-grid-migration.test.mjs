import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { GridStore } from '../src/grid/store.mjs';
import { runSovereignInformationMigrations } from '../src/grid/sovereign-information-migrations.mjs';
import { SovereignInformationGridStore } from '../src/grid/sovereign-information-store.mjs';

async function fixture(t, Store = GridStore) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-siea-migration-'));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const path = join(dataDir, 'grid.sqlite');
  const store = new Store({
    path,
    dataDir,
    identity,
    protector,
    mutationVerifier: () => ({
      allowed: true,
      authority_ref: 'policy:test',
      verifier_ref: 'verifier:test'
    })
  });
  t.after(async () => {
    try { store.close(); } catch {}
    await rm(dataDir, { recursive: true, force: true });
  });
  return { store };
}

test('ordinary Grid remains core schema 10 and does not opt into sovereign information state', async t => {
  const { store } = await fixture(t, GridStore);
  assert.equal(store.getStatus().schema_version, 10);
  assert.equal(store.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'siea_objects'").get(), undefined);
  assert.equal(store.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'sovereign_information_schema_migrations'").get(), undefined);
});

test('SIEA store creates metadata-minimized state through a separate layered migration ledger', async t => {
  const { store } = await fixture(t, SovereignInformationGridStore);
  const status = store.getStatus();
  assert.equal(status.schema_version, 10);
  assert.equal(status.sovereign_information_schema_version, 1);
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
  const migration = store.db.prepare(`
    SELECT version, name FROM sovereign_information_schema_migrations WHERE version = 1
  `).get();
  assert.equal(migration.version, 1);
  assert.equal(migration.name, 'sovereign-information-materialized-state');
});

test('SIEA extension migration ledger fails closed on checksum drift', async t => {
  const { store } = await fixture(t, SovereignInformationGridStore);
  store.db.prepare(`
    UPDATE sovereign_information_schema_migrations
    SET checksum = ? WHERE version = 1
  `).run('0'.repeat(64));
  assert.throws(
    () => runSovereignInformationMigrations(store.db),
    /Sovereign information migration 1 does not match the runtime checksum/
  );
});
