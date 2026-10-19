import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  COLLECTION_PAGE_MAX,
  collectionPage,
  decodeCollectionCursor,
  encodeCollectionCursor
} from '../src/lib/collection-page.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { GridStore } from '../src/grid/store.mjs';

const ME = 'person:pager';

async function fixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-collection-paging-'));
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
  // Inserts a row, filling required columns this test does not care about.
  const insert = (table, id, values, protectedJson = {}) => {
    const columns = store.db.prepare(`PRAGMA table_info(${table})`).all();
    const row = {};
    for (const column of columns) {
      if (Object.hasOwn(values, column.name)) row[column.name] = values[column.name];
      else if (Object.hasOwn(protectedJson, column.name)) {
        row[column.name] = store.protectJson(table, column.name, id, protectedJson[column.name]);
      } else if (column.notnull) row[column.name] = column.type === 'INTEGER' ? 0 : 'x';
    }
    const names = Object.keys(row);
    store.db.prepare(
      `INSERT INTO ${table}(${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`
    ).run(...names.map(name => row[name]));
  };
  return { store, insert };
}

// The Grid routes' paging: fetch limit + 1, cut, describe the next page.
function pageAll(collection, fetch, key, limit) {
  const items = [];
  let cursor = null;
  for (let pages = 0; pages < 1_000; pages += 1) {
    const after = decodeCollectionCursor(collection, cursor);
    const page = collectionPage(fetch(limit + 1, after), { collection, limit, key });
    items.push(...page.items);
    if (!page.page.has_more) return items;
    cursor = page.page.next_cursor;
  }
  throw new Error('paging did not terminate');
}

const stamp = index => new Date(Date.UTC(2026, 0, 1, 0, 0, Math.floor(index / 3))).toISOString();

test('previously unbounded collections page completely, in order, ties included (S-10)', async t => {
  const { store, insert } = await fixture(t);
  const count = 130;
  for (let index = 0; index < count; index += 1) {
    // Three items share each timestamp, so the identifier must break ties.
    const at = stamp(index);
    const n = String(index).padStart(4, '0');
    insert('consents', `consent_${n}`, {
      consent_id: `consent_${n}`, subject: ME, controller: 'person:other', status: 'active',
      created_at: at, expires_at: '2999-01-01T00:00:00.000Z'
    }, { scopes_json: ['memory:read'] });
    insert('governance_appeals', `appeal_${n}`, {
      appeal_id: `appeal_${n}`, appellant: ME, status: 'open', created_at: at
    }, { grounds_json: { n } });
    insert('imports', `import_${n}`, {
      import_id: `import_${n}`, principal: ME, status: 'staged', staged_at: at
    }, { manifest_json: {}, diff_json: {} });
    insert('storage_offers', `offer_${n}`, {
      offer_id: `offer_${n}`, owner: ME, status: 'active', created_at: at,
      expires_at: '2999-01-01T00:00:00.000Z'
    }, { regions_json: [], signature_json: {} });
    const digest = n.padStart(64, 'b');
    insert('sync_bundles', digest, {
      bundle_digest: digest, owner: ME, received_at: at
    }, { result_json: { accepted: 1 } });
  }

  const collections = [
    ['consents', (limit, after) => store.pageConsents(ME, { limit, after }), item => [item.created_at, item.consent_id]],
    ['appeals', (limit, after) => store.listGovernanceAppeals(ME, { limit, after }), item => [item.created_at, item.appeal_id]],
    ['imports', (limit, after) => store.listImports(ME, { limit, after }), item => [item.staged_at, item.import_id]],
    ['storage_offers', (limit, after) => store.listStorageOffers(ME, { limit, after }), item => [item.created_at, item.offer_id]],
    ['sync_bundles', (limit, after) => store.listCausalSyncBundles(ME, { limit, after }), item => [item.received_at, item.bundle_digest]]
  ];
  for (const [collection, fetch, key] of collections) {
    for (const limit of [1, 7, COLLECTION_PAGE_MAX]) {
      const items = pageAll(collection, fetch, key, limit);
      const keys = items.map(key);
      assert.equal(new Set(keys.map(pair => pair[1])).size, count, `${collection} @${limit}: each once`);
      assert.equal(items.length, count, `${collection} @${limit}: none skipped`);
      const sorted = [...keys].sort((a, b) => (b[0].localeCompare(a[0]) || b[1].localeCompare(a[1])));
      assert.deepEqual(keys, sorted, `${collection} @${limit}: newest first, identifier breaks ties`);
    }
    // A first page is bounded and says more exist.
    const first = collectionPage(fetch(COLLECTION_PAGE_MAX + 1, null), {
      collection, limit: COLLECTION_PAGE_MAX, key
    });
    assert.equal(first.items.length, COLLECTION_PAGE_MAX);
    assert.equal(first.page.has_more, true);
  }

  // Consent enforcement still reads every receipt, unpaged.
  assert.equal(store.listConsents(ME).length, count);
});

test('an item written during a pass is never returned twice', async t => {
  const { store, insert } = await fixture(t);
  const add = (n, at) => insert('governance_appeals', `appeal_${n}`, {
    appeal_id: `appeal_${n}`, appellant: ME, status: 'open', created_at: at
  }, { grounds_json: {} });
  for (let index = 0; index < 20; index += 1) add(String(index).padStart(4, '0'), stamp(index * 3));
  const key = item => [item.created_at, item.appeal_id];
  const fetch = (limit, after) => store.listGovernanceAppeals(ME, { limit, after });

  const first = collectionPage(fetch(6, null), { collection: 'appeals', limit: 5, key });
  add('late', '2030-01-01T00:00:00.000Z'); // newest: behind a newest-first cursor
  const seen = [...first.items];
  let cursor = first.page.next_cursor;
  while (cursor) {
    const page = collectionPage(fetch(6, decodeCollectionCursor('appeals', cursor)), {
      collection: 'appeals', limit: 5, key
    });
    seen.push(...page.items);
    cursor = page.page.next_cursor;
  }
  const ids = seen.map(item => item.appeal_id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.length, 20);
  assert.equal(ids.includes('appeal_late'), false, 'written behind the cursor: next pass');
});

test('collection cursors are canonical, bound to one collection, and bounded', () => {
  const cursor = encodeCollectionCursor('appeals', '2026-01-01T00:00:00.000Z', 'appeal_0001');
  assert.deepEqual(decodeCollectionCursor('appeals', cursor), {
    sort: '2026-01-01T00:00:00.000Z',
    id: 'appeal_0001'
  });
  assert.equal(decodeCollectionCursor('appeals', null), null);
  assert.throws(() => decodeCollectionCursor('consents', cursor), /consents cursor is invalid/);
  for (const bad of [
    `${cursor}=`,
    'not a cursor',
    'x'.repeat(600),
    Buffer.from(JSON.stringify(['appeals', '2026', 'appeal_1', 'extra'])).toString('base64url'),
    Buffer.from(JSON.stringify(['appeals', "2026' OR 1=1", 'appeal_1'])).toString('base64url'),
    Buffer.from(JSON.stringify(['appeals', '2026', '../x'])).toString('base64url'),
    Buffer.from(JSON.stringify(['appeals', 2026, 'appeal_1'])).toString('base64url')
  ]) {
    assert.throws(() => decodeCollectionCursor('appeals', bad), /cursor is invalid/, bad);
  }
  const page = collectionPage([1, 2, 3], {
    collection: 'appeals',
    limit: 2,
    key: n => ['2026', `appeal_${n}`]
  });
  assert.deepEqual(page.items, [1, 2]);
  assert.equal(page.page.has_more, true);
  assert.deepEqual(decodeCollectionCursor('appeals', page.page.next_cursor), { sort: '2026', id: 'appeal_2' });
  assert.equal(collectionPage([1, 2], { collection: 'appeals', limit: 2, key: n => ['2026', `a${n}`] }).page.next_cursor, null);
});
