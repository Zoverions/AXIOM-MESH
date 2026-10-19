import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { GridStore } from '../src/grid/store.mjs';

const BASE_TABLES = [
  'events', 'capsules', 'proposals', 'nodes', 'approvals', 'consents', 'memory_objects',
  'imports', 'governance_appeals', 'storage_offers', 'backups', 'sync_heads',
  'accounting_journals', 'accounting_entries', 'node_schedules', 'sync_bundles'
];
const AFTER = { sort: '2026-01-01T00:00:00.000Z', id: 'x_0001' };

// Runs `call` and returns the query plan of every statement it prepared.
function plansOf(store, call) {
  const prepare = store.db.prepare.bind(store.db);
  const captured = [];
  store.db.prepare = sql => {
    captured.push(sql);
    return prepare(sql);
  };
  try {
    call();
  } finally {
    store.db.prepare = prepare;
  }
  return captured
    .filter(sql => /^\s*(WITH|SELECT)/i.test(sql))
    .map(sql => ({
      sql: sql.replace(/\s+/g, ' ').trim(),
      plan: prepare(`EXPLAIN QUERY PLAN ${sql}`)
        .all(...Array(countParameters(sql)).fill('x'))
        .map(row => row.detail)
    }));
}

function countParameters(sql) {
  return (sql.match(/\?/g) ?? []).length;
}

// A full scan of a base table: `SCAN <table>` without an index. An index
// scan in page order (`SCAN t USING INDEX ...`) stops at the page limit.
// In a paged (LIMIT) statement, a sort of the last ORDER BY term after an
// index seek means the index lacks the identifier tie-break, so every row
// after the cursor is sorted. Merges of already-limited branches report a
// plain `USE TEMP B-TREE FOR ORDER BY`; unpaged whole lists may sort.
function fullScans(plan, sql) {
  const paged = /\bLIMIT\b/i.test(sql);
  return plan.filter(step => (
    BASE_TABLES.some(table => new RegExp(`^SCAN ${table}(?! USING (COVERING )?INDEX)\\b`).test(step))
    || (paged && /USE TEMP B-TREE FOR LAST TERM OF ORDER BY/.test(step))
  ));
}

test('paged Grid queries seek indexes and never scan a whole table (S-11)', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-query-plans-'));
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
  const P = 'person:plans';
  const routes = {
    'events by actor': () => store.listEvents({ actor: P, after: 5, limit: 100 }),
    capsules: after => store.listCapsules({ limit: 101, after }),
    proposals: after => store.listProposals({ limit: 101, after }),
    nodes: after => store.listNodes({ limit: 101, after }),
    approvals: after => store.listApprovals(P, { limit: 101, after }),
    consents: after => store.pageConsents(P, { limit: 101, after }),
    'memory (owner)': after => store.listMemory(P, P, { limit: 100, after }),
    'memory (consented reader)': after => store.listMemory('person:reader', P, { limit: 100, after }),
    imports: after => store.listImports(P, { limit: 101, after }),
    appeals: after => store.listGovernanceAppeals(P, { limit: 101, after }),
    'storage offers': after => store.listStorageOffers(P, { limit: 101, after }),
    backups: after => store.listBackups(P, { limit: 101, after }),
    'accounting journals': after => store.listAccounting(P, { limit: 101, after }),
    'node schedules': after => store.listNodeSchedules(P, { limit: 101, after }),
    'sync bundles': after => store.listCausalSyncBundles(P, { limit: 101, after }),
    // Status reads: the load-bearing schedules, the nodes a page is placed
    // on, and the active schedules a quarantine degrades.
    'schedule load': () => store.loadBearingSchedules(AFTER.sort),
    'placement nodes': () => store.placementNodes([{ placements: [{ node_id: 'node:x' }] }], AFTER.sort),
    'active schedules': () => store.decodedSchedules("WHERE status = 'active'"),
    'sync state': () => store.listCausalSync(P, { limit: 100 })
  };
  for (const [name, call] of Object.entries(routes)) {
    for (const after of [undefined, AFTER]) {
      const statements = plansOf(store, () => call(after));
      assert.ok(statements.length > 0, `${name}: no statement captured`);
      for (const { sql, plan } of statements) {
        if (name === 'proposals' && /FROM proposals/.test(sql)) {
          // The page is chosen from the proposals index before votes are
          // joined; grouping first walks every proposal.
          assert.ok(plan.some(step => step.includes('proposals_page_idx')), `${name}: ${plan.join(' | ')}`);
        }
        assert.deepEqual(
          fullScans(plan, sql),
          [],
          `${name}${after ? ' (with cursor)' : ''} scans a whole table:\n${sql}\n${plan.join('\n')}`
        );
      }
    }
  }
});
