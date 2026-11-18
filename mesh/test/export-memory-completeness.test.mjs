import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { GridStore } from '../src/grid/store.mjs';

const OWNER = 'person:exporter';

async function storeWithMemory(t, count) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-export-memory-'));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const store = new GridStore({
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
  for (let index = 0; index < count; index += 1) {
    const id = `memory_${String(index).padStart(4, '0')}`;
    store.db.prepare(`
      INSERT INTO memory_objects(object_id, owner, kind, content_digest, payload_json, status, created_at)
      VALUES (?, ?, 'note', ?, ?, 'active', ?)
    `).run(
      id, OWNER, 'c'.repeat(64),
      store.protectJson('memory_objects', 'payload_json', id, { index }),
      new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString()
    );
  }
  return store;
}

test('a personal export includes every memory object, not the first API page', async t => {
  const store = await storeWithMemory(t, 150);
  // The API still pages: its first page is 100 objects.
  assert.equal(store.listMemory(OWNER).objects.length, 100);
  assert.equal(store.listMemory(OWNER).truncated, true);

  const records = store.collectExportRecords(OWNER, { types: ['memory'] });
  const exported = records.filter(record => record.type === 'memory_object');
  assert.equal(exported.length, 150);
  assert.equal(new Set(exported.map(record => record.data.object_id)).size, 150);

  // Scoping an export to an object past the first page used to fail as
  // "unknown or unowned".
  const scoped = store.collectExportRecords(OWNER, {
    types: ['memory'],
    object_ids: ['memory_0149']
  });
  assert.deepEqual(
    scoped.filter(record => record.type === 'memory_object').map(record => record.data.object_id),
    ['memory_0149']
  );
});
