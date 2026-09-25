import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { GridStore } from '../src/grid/store.mjs';

const OWNER = 'person:owner';
const READER = 'person:reader';

async function fixture(t, objects) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-memory-consent-'));
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
  for (let index = 0; index < objects; index += 1) {
    const id = `memory_${String(index).padStart(4, '0')}`;
    store.db.prepare(`
      INSERT INTO memory_objects(object_id, owner, kind, content_digest, payload_json, status, created_at)
      VALUES (?, ?, 'note', ?, ?, 'active', ?)
    `).run(id, OWNER, 'c'.repeat(64), store.protectJson('memory_objects', 'payload_json', id, { index }),
      new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString());
  }
  const grant = (id, scopes, { status = 'active', expires = '2999-01-01T00:00:00.000Z' } = {}) => {
    store.db.prepare(`
      INSERT INTO consents(consent_id, subject, controller, purpose, scopes_json, expires_at,
                           revocation_handle_hash, status, created_at)
      VALUES (?, ?, ?, 'test', ?, ?, 'h', ?, '2026-01-01T00:00:00.000Z')
    `).run(id, OWNER, READER, store.protectJson('consents', 'scopes_json', id, scopes), expires, status);
  };
  return { store, grant };
}

function countingConsentReads(store) {
  const prepare = store.db.prepare.bind(store.db);
  const counter = { reads: 0 };
  store.db.prepare = sql => {
    if (/FROM consents/.test(sql)) counter.reads += 1;
    return prepare(sql);
  };
  return counter;
}

test('a consented reader sees exactly the granted objects, from one consent read (S-11)', async t => {
  const { store, grant } = await fixture(t, 60);
  grant('consent_one', ['memory:memory_0003:read', 'memory:memory_0042:read']);
  grant('consent_two', ['memory:memory_0010:read']);
  grant('consent_revoked', ['memory:read'], { status: 'revoked' });
  grant('consent_expired', ['memory:memory_0020:read'], { expires: '2000-01-01T00:00:00.000Z' });

  const counter = countingConsentReads(store);
  const graph = store.listMemory(READER, OWNER, { limit: 100 });
  assert.deepEqual(graph.objects.map(object => object.object_id), ['memory_0003', 'memory_0010', 'memory_0042']);
  assert.equal(counter.reads, 1, 'one consent read for 60 objects');

  // Without consent a reader sees nothing; the owner sees everything.
  assert.equal(store.listMemory('person:stranger', OWNER, { limit: 100 }).objects.length, 0);
  assert.equal(store.listMemory(OWNER, OWNER, { limit: 100 }).objects.length, 60);
});

test('a memory:read consent grants every object on the page', async t => {
  const { store, grant } = await fixture(t, 25);
  grant('consent_all', ['memory:read']);
  assert.equal(store.listMemory(READER, OWNER, { limit: 100 }).objects.length, 25);
  assert.equal(store.hasMemoryConsent(OWNER, READER, 'memory_0007'), true);
});

test('accounting loads every journal entry in one read, grouped and ordered (S-11)', async t => {
  const { store } = await fixture(t, 0);
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
    store.db.prepare(`INSERT INTO ${table}(${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`)
      .run(...names.map(name => row[name]));
  };
  insert('accounting_accounts', 'acct_a', { account_id: 'acct_a', owner: OWNER, unit: 'credits' });
  insert('accounting_accounts', 'acct_b', { account_id: 'acct_b', owner: OWNER, unit: 'credits' });
  insert('accounting_accounts', 'acct_x', { account_id: 'acct_x', owner: 'person:other', unit: 'credits' });
  const journals = 30;
  for (let index = 0; index < journals; index += 1) {
    const id = `journal_${String(index).padStart(3, '0')}`;
    insert('accounting_journals', id, {
      journal_id: id, owner: OWNER, created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString()
    }, { memo_json: { index } });
    // Lines inserted out of order: the read must return them by line_no.
    for (const [line, account, amount] of [[2, 'acct_b', -(index + 1)], [1, 'acct_a', index + 1]]) {
      insert('accounting_entries', `${id}:${line}`, { journal_id: id, line_no: line, account_id: account, amount },
        { metadata_json: { line } });
    }
  }
  insert('accounting_journals', 'journal_other', { journal_id: 'journal_other', owner: 'person:other', created_at: '2026-01-01T00:00:00.000Z' }, { memo_json: {} });
  insert('accounting_entries', 'journal_other:1', { journal_id: 'journal_other', line_no: 1, account_id: 'acct_x', amount: 5 }, { metadata_json: {} });

  let entryReads = 0;
  const prepare = store.db.prepare.bind(store.db);
  store.db.prepare = sql => {
    if (/FROM accounting_entries/.test(sql)) entryReads += 1;
    return prepare(sql);
  };
  const accounting = store.listAccounting(OWNER);
  // One read for the entries plus the balances query, whatever the journal count.
  assert.equal(entryReads, 1);
  assert.equal(accounting.journals.length, journals);
  for (const [index, journal] of accounting.journals.entries()) {
    assert.deepEqual(journal.entries.map(entry => [entry.line_no, entry.account_id, entry.amount]),
      [[1, 'acct_a', index + 1], [2, 'acct_b', -(index + 1)]]);
    assert.deepEqual(journal.entries.map(entry => entry.metadata_json), [{ line: 1 }, { line: 2 }]);
  }
  assert.equal(accounting.journals.some(journal => journal.journal_id === 'journal_other'), false);
});
