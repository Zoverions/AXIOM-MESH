import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { GridStore } from '../src/grid/store.mjs';
import { SYNC_PAGE_BYTE_BUDGET, encodeSyncCursor } from '../src/grid/_store-core.mjs';

const OWNER = 'person:paging';

async function fixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-sync-paging-'));
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
  const bundle = 'b'.repeat(64);
  store.db.prepare(`
    INSERT INTO sync_bundles(bundle_digest, owner, source_node_id, update_count, result_json, received_at)
    VALUES (?, ?, 'node:paging', 0, ?, '2026-09-25T00:00:00.000Z')
  `).run(bundle, OWNER, store.protectJson('sync_bundles', 'result_json', bundle, {}));
  let counter = 0;
  // Inserts current heads directly: this tests paging, not bundle admission.
  const put = (namespace, recordId, values) => {
    for (const value of values) {
      counter += 1;
      const id = `update-${String(counter).padStart(6, '0')}`;
      store.db.prepare(`
        INSERT INTO sync_updates(
          update_id, bundle_digest, owner, node_id, namespace, record_id,
          operation, value_digest, value_json, vector_json, resolves_json,
          occurred_at, received_at, author_counter, public_key_digest,
          signature_json, status
        ) VALUES (?, ?, ?, 'node:paging', ?, ?, 'put', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'head')
      `).run(
        id, bundle, OWNER, namespace, recordId, 'd'.repeat(64),
        store.protectJson('sync_updates', 'value_json', id, value),
        store.protectJson('sync_updates', 'vector_json', id, { 'node:paging': counter }),
        store.protectJson('sync_updates', 'resolves_json', id, []),
        '2026-09-25T00:00:00.000Z', '2026-09-25T00:00:00.000Z', counter, 'k'.repeat(64),
        store.protectJson('sync_updates', 'signature_json', id, 'sig')
      );
      store.db.prepare(`
        INSERT INTO sync_heads(owner, namespace, record_id, update_id) VALUES (?, ?, ?, ?)
      `).run(OWNER, namespace, recordId, id);
    }
  };
  return { store, put };
}

function pageThrough(store, options) {
  const records = [];
  let cursor;
  for (let pages = 0; pages < 10_000; pages += 1) {
    const page = store.listCausalSync(OWNER, { ...options, cursor });
    records.push(...page.records);
    if (!page.page.has_more) {
      assert.equal(page.page.next_cursor, null);
      return records;
    }
    cursor = page.page.next_cursor;
  }
  throw new Error('paging did not terminate');
}

test('sync state pages by record: every record once, every head of each record together (S-10)', async t => {
  const { store, put } = await fixture(t);
  const conflicted = new Set();
  for (let index = 0; index < 250; index += 1) {
    const recordId = `record:${String(index).padStart(4, '0')}`;
    // Every 7th record has two concurrent heads, so many straddle page ends.
    const heads = index % 7 === 3 ? [{ n: index, side: 'a' }, { n: index, side: 'b' }] : [{ n: index }];
    if (heads.length > 1) conflicted.add(recordId);
    put(index % 2 ? 'notes' : 'tasks', recordId, heads);
  }

  for (const limit of [1, 7, 100, 200]) {
    const records = pageThrough(store, { limit });
    const keys = records.map(record => `${record.namespace}/${record.record_id}`);
    assert.equal(new Set(keys).size, 250, `limit ${limit}: no duplicates`);
    assert.equal(records.length, 250, `limit ${limit}: nothing skipped`);
    assert.deepEqual(keys, [...keys].sort(), `limit ${limit}: stable (namespace, record_id) order`);
    for (const record of records) {
      const expected = conflicted.has(record.record_id) ? 2 : 1;
      assert.equal(record.heads.length, expected, `${record.record_id} keeps all its heads`);
      assert.equal(record.status, expected === 2 ? 'conflict' : 'active');
    }
  }

  const first = store.listCausalSync(OWNER, { limit: 7 });
  assert.equal(first.records.length, 7);
  assert.equal(first.page.has_more, true);
  assert.equal(first.truncated, true);
  assert.equal(first.conflicts, first.records.filter(record => record.heads.length > 1).length);

  // Filters page the same way.
  assert.equal(pageThrough(store, { namespace: 'notes', limit: 9 }).length, 125);
  const one = store.listCausalSync(OWNER, { recordId: 'record:0003' });
  assert.equal(one.records.length, 1);
  assert.equal(one.records[0].heads.length, 2);
  assert.equal(one.page.has_more, false);
});

test('a sync page stops at its byte budget, whatever the record limit', async t => {
  const { store, put } = await fixture(t);
  const large = 'x'.repeat(200_000);
  for (let index = 0; index < 12; index += 1) put('files', `blob:${index}`, [{ large }]);

  const page = store.listCausalSync(OWNER, { limit: 200 });
  assert.ok(page.records.length >= 1 && page.records.length < 12);
  assert.equal(page.page.has_more, true);
  assert.ok(Buffer.byteLength(JSON.stringify(page.records)) <= SYNC_PAGE_BYTE_BUDGET);
  assert.ok(Buffer.byteLength(JSON.stringify(page)) < 1_048_576, 'under the internal response ceiling');
  assert.equal(pageThrough(store, { limit: 200 }).length, 12);
});

test('records written while paging appear once if ahead of the cursor, never twice', async t => {
  const { store, put } = await fixture(t);
  for (let index = 0; index < 20; index += 1) put('notes', `record:${String(index * 10).padStart(4, '0')}`, [{ index }]);

  const first = store.listCausalSync(OWNER, { limit: 5 });
  put('notes', 'record:0001', [{ late: 'behind the cursor' }]);
  put('notes', 'record:0999', [{ late: 'ahead of the cursor' }]);
  const rest = [];
  let cursor = first.page.next_cursor;
  while (cursor) {
    const page = store.listCausalSync(OWNER, { limit: 5, cursor });
    rest.push(...page.records);
    cursor = page.page.next_cursor;
  }
  const ids = [...first.records, ...rest].map(record => record.record_id);
  assert.equal(new Set(ids).size, ids.length, 'no duplicates');
  assert.ok(ids.includes('record:0999'), 'a record ahead of the cursor is seen');
  assert.ok(!ids.includes('record:0001'), 'a record behind the cursor waits for the next pass');
  assert.equal(ids.length, 21);
});

test('tampered or foreign sync cursors are refused', async t => {
  const { store, put } = await fixture(t);
  put('notes', 'record:a', [{ a: 1 }]);
  const valid = encodeSyncCursor({ namespace: 'notes', record_id: 'record:a' });
  assert.equal(store.listCausalSync(OWNER, { cursor: valid }).records.length, 0);
  for (const cursor of [
    'not base64!',
    Buffer.from('{"namespace":"notes"}').toString('base64url'),
    Buffer.from(JSON.stringify(['Notes', 'record:a'])).toString('base64url'),
    Buffer.from(JSON.stringify(['notes', '../etc'])).toString('base64url'),
    `${valid}=`,
    'x'.repeat(600)
  ]) {
    assert.throws(() => store.listCausalSync(OWNER, { cursor }), /cursor is invalid/, cursor);
  }
  assert.throws(() => store.listCausalSync(OWNER, { limit: 201 }), /limit/);
});
