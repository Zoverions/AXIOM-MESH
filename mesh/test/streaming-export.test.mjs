import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import { canonicalJson } from '../src/lib/canonical.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { GridStore } from '../src/grid/store.mjs';

// Streaming export generation (scalability audit S-12): a plaintext bundle
// is written record by record, byte-identical to the joined serialization.

const run = promisify(execFile);
const OWNER = 'person:exporter';

async function openStore(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-streaming-export-'));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const store = new GridStore({ path: join(dataDir, 'grid.sqlite'), dataDir, identity, protector, checkpointInterval: 10_000 });
  t.after(async () => {
    try { store.close(); } catch {}
    await rm(dataDir, { recursive: true, force: true });
  });
  return { store, dataDir };
}

function requestExport(store, exportId, scope) {
  store.appendEvents({
    traceId: `trace_${exportId}`,
    actor: OWNER,
    events: [{ kind: 'export.requested', subject: exportId, payload: { export_id: exportId, principal: OWNER, scope } }]
  });
}

function echo(store, count, padding = 64) {
  for (let batch = 0; batch < count; batch += 32) {
    store.appendEvents({
      traceId: `trace_echo_${batch}`,
      actor: OWNER,
      events: Array.from({ length: Math.min(32, count - batch) }, (_, index) => ({
        kind: 'system.echoed',
        subject: `echo_${batch + index}`,
        payload: { n: batch + index, padding: 'x'.repeat(padding) }
      }))
    });
  }
}

const joined = records => Buffer.from(records.length ? `${records.map(record => canonicalJson(record)).join('\n')}\n` : '');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

test('a streamed export bundle is byte-identical to the joined serialization', async t => {
  const { store, dataDir } = await openStore(t);
  // Enough records to span several write batches.
  echo(store, 900, 200);
  const scope = { types: ['identity', 'events', 'votes'] };
  const expected = joined(store.collectExportRecords(OWNER, scope));
  assert.ok(expected.length > 3 * 64 * 1024);
  requestExport(store, 'export_stream_001', scope);
  const manifest = await store.createExport('export_stream_001', 'trace_stream_001');
  const bundle = await readFile(join(dataDir, 'exports', 'export_stream_001', 'bundle.jsonl'));
  // The request event itself is exported too, so compare against a fresh read.
  const recorded = joined(store.collectExportRecords(OWNER, scope).filter(record => (
    record.type !== 'event' || record.data.kind !== 'export.completed'
  )));
  assert.deepEqual(bundle, recorded);
  assert.equal(manifest.files[0].bytes, bundle.length);
  assert.equal(manifest.files[0].sha256, digest(bundle));
  assert.equal(manifest.record_count, bundle.toString('utf8').split('\n').length - 1);
  assert.deepEqual((await readdir(join(dataDir, 'exports', 'export_stream_001'))).sort(), ['bundle.jsonl', 'manifest.json']);

  // No records is an empty file, as before.
  requestExport(store, 'export_stream_empty', { types: ['votes'] });
  const empty = await store.createExport('export_stream_empty', 'trace_stream_empty');
  assert.equal(empty.record_count, 0);
  assert.equal(empty.files[0].bytes, 0);
  assert.equal(empty.files[0].sha256, digest(Buffer.alloc(0)));
});

test('an export whose scope fails part-way leaves no bundle and stays pending', async t => {
  const { store, dataDir } = await openStore(t);
  echo(store, 200);
  const scope = { types: ['events', 'memory'], object_ids: ['memory_missing'] };
  // Preflight walks the records and refuses the scope before it is committed.
  assert.throws(
    () => store.preflightExportRequest(OWNER, {
      kind: 'export.requested', subject: 'export_bad', payload: { export_id: 'export_bad', principal: OWNER, scope }
    }),
    error => error.code === 'export_scope_forbidden'
  );
  // Committed anyway, generation fails after events were already written.
  requestExport(store, 'export_bad', scope);
  await assert.rejects(store.createExport('export_bad', 'trace_bad'), error => error.code === 'export_scope_forbidden');
  assert.deepEqual(await readdir(join(dataDir, 'exports', 'export_bad')), [], 'no bundle or temporary file is left');
  assert.equal(store.getExport('export_bad', OWNER).status, 'pending');
});

test('export generation holds bounded memory, whatever the export size', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'axiom-streaming-export-probe-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const src = name => JSON.stringify(new URL(`../src/${name}`, import.meta.url).href);
  const script = `
    import { join } from 'node:path';
    import { ensureMeshIdentity } from ${src('lib/identity.mjs')};
    import { loadDataProtector } from ${src('lib/protector.mjs')};
    import { GridStore } from ${src('grid/store.mjs')};
    const dataDir = ${JSON.stringify(dir)};
    const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
    const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
    const store = new GridStore({ path: join(dataDir, 'grid.sqlite'), dataDir, identity, protector, checkpointInterval: 100000 });
    const padding = 'x'.repeat(32 * 1024);
    for (let batch = 0; batch < 24; batch += 1) {
      store.appendEvents({ traceId: 'trace_' + batch, actor: ${JSON.stringify(OWNER)}, events: Array.from({ length: 32 }, (_, index) => ({
        kind: 'system.echoed', subject: 'echo_' + batch + '_' + index, payload: { padding }
      })) });
    }
    store.appendEvents({ traceId: 'trace_export', actor: ${JSON.stringify(OWNER)}, events: [{ kind: 'export.requested', subject: 'export_big',
      payload: { export_id: 'export_big', principal: ${JSON.stringify(OWNER)}, scope: { types: ['events'] } } }] });
    global.gc();
    const base = process.memoryUsage();
    let peak = 0;
    // Generation is synchronous, so sample live memory from inside it.
    const sample = () => {
      global.gc();
      const now = process.memoryUsage();
      peak = Math.max(peak, (now.arrayBuffers - base.arrayBuffers) + (now.heapUsed - base.heapUsed));
    };
    let rows = 0;
    const decode = store.decodeEventRow.bind(store);
    store.decodeEventRow = row => { if (++rows % 32 === 0) sample(); return decode(row); };
    const manifest = await store.createExport('export_big', 'trace_export_big');
    sample();
    store.close();
    console.log(JSON.stringify({ peak, bytes: manifest.files[0].bytes, sampled: rows }));
  `;
  const scriptPath = join(dir, 'probe.mjs');
  await writeFile(scriptPath, script);
  const { stdout } = await run(process.execPath, ['--expose-gc', scriptPath], { maxBuffer: 1024 * 1024 });
  const { peak, bytes, sampled } = JSON.parse(stdout.trim().split('\n').at(-1));
  assert.ok(sampled >= 768);
  assert.ok(bytes > 24 * 1024 * 1024, `export is ${bytes} bytes`);
  // A ~25 MiB export is generated within a small fixed allowance.
  assert.ok(peak < 8 * 1024 * 1024, `peak additional memory ${(peak / 1048576).toFixed(1)} MiB`);
});

// Memory and accounting rows written directly, so a test controls every edge
// case: inactive rows, another owner's rows, edges to inactive or foreign
// objects, and entries spread over journals.
function seedMemoryAndAccounting(store, { objects = 12, payloadBytes = 64 } = {}) {
  const at = index => new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString();
  const insertObject = store.db.prepare(`
    INSERT INTO memory_objects(object_id, owner, kind, content_digest, payload_json, status, created_at)
    VALUES (?, ?, 'note', ?, ?, ?, ?)
  `);
  for (let index = 0; index < objects; index += 1) {
    const id = `memory_${String(index).padStart(5, '0')}`;
    const owner = index % 7 === 3 ? 'person:someone-else' : OWNER;
    const status = index % 5 === 4 ? 'tombstoned' : 'active';
    insertObject.run(id, owner, 'c'.repeat(64),
      store.protectJson('memory_objects', 'payload_json', id, { index, text: 'x'.repeat(payloadBytes) }), status, at(index));
  }
  const insertEdge = store.db.prepare(`
    INSERT INTO memory_edges(edge_id, owner, from_id, to_id, relation, metadata_json, status, created_at)
    VALUES (?, ?, ?, ?, 'relates', ?, ?, ?)
  `);
  for (let index = 1; index < objects; index += 1) {
    const id = `edge_${String(index).padStart(5, '0')}`;
    insertEdge.run(id, OWNER, `memory_${String(index - 1).padStart(5, '0')}`, `memory_${String(index).padStart(5, '0')}`,
      store.protectJson('memory_edges', 'metadata_json', id, { index }), index % 11 === 10 ? 'removed' : 'active', at(index));
  }
  store.db.prepare(`
    INSERT INTO accounting_accounts(account_id, owner, unit, name, status, created_at) VALUES (?, ?, 'hours', ?, 'active', ?)
  `).run('account_a', OWNER, 'A', at(0));
  store.db.prepare(`
    INSERT INTO accounting_accounts(account_id, owner, unit, name, status, created_at) VALUES (?, ?, 'hours', ?, 'active', ?)
  `).run('account_b', OWNER, 'B', at(1));
  const insertJournal = store.db.prepare(`
    INSERT INTO accounting_journals(journal_id, owner, unit, reference, memo_json, created_at) VALUES (?, ?, 'hours', ?, ?, ?)
  `);
  const insertEntry = store.db.prepare(`
    INSERT INTO accounting_entries(journal_id, line_no, account_id, amount, metadata_json) VALUES (?, ?, ?, ?, ?)
  `);
  for (let index = 0; index < Math.ceil(objects / 2); index += 1) {
    const id = `journal_${String(index).padStart(5, '0')}`;
    insertJournal.run(id, OWNER, `ref-${index}`, store.protectJson('accounting_journals', 'memo_json', id, { index }),
      // Two journals share each timestamp, so the tie on journal_id matters.
      at(Math.floor(index / 2)));
    // Journals carry 0 to 3 entries.
    for (let line = 0; line < index % 4; line += 1) {
      insertEntry.run(id, line, line % 2 ? 'account_b' : 'account_a', line % 2 ? -1 : 1,
        store.protectJson('accounting_entries', 'metadata_json', `${id}:${line}`, { line }));
    }
  }
}

// The export before streaming: the owner's whole memory graph and every
// journal, loaded at once, then filtered.
function wholeSetRecords(store, scope) {
  const since = scope.since ?? '0000-01-01T00:00:00.000Z';
  const until = scope.until ?? '9999-12-31T23:59:59.999Z';
  const ids = new Set(scope.object_ids ?? []);
  const inRange = item => item.created_at >= since && item.created_at <= until;
  const rows = store.db.prepare(`
    SELECT * FROM memory_objects WHERE owner = ? AND status = 'active' ORDER BY created_at, object_id
  `).all(OWNER);
  const graph = store.memoryGraph(OWNER, OWNER, rows, false);
  const objects = ids.size ? graph.objects.filter(object => ids.has(object.object_id)) : graph.objects;
  const records = [];
  for (const object of objects) if (inRange(object)) records.push({ type: 'memory_object', data: object });
  for (const edge of graph.edges) {
    if ((!ids.size || (ids.has(edge.from_id) && ids.has(edge.to_id))) && inRange(edge)) records.push({ type: 'memory_edge', data: edge });
  }
  const accounting = store.listAccounting(OWNER);
  for (const account of accounting.accounts) if (inRange(account)) records.push({ type: 'account', data: account });
  for (const journal of accounting.journals) if (inRange(journal)) records.push({ type: 'journal', data: journal });
  return records;
}

test('streamed memory and accounting records equal the whole-set export', async t => {
  const { store } = await openStore(t);
  seedMemoryAndAccounting(store, { objects: 60 });
  const owned = store.db.prepare(`SELECT object_id FROM memory_objects WHERE owner = ? AND status = 'active' ORDER BY object_id`).all(OWNER);
  const scopes = [
    {},
    { since: '2026-01-01T00:00:10.000Z', until: '2026-01-01T00:00:40.000Z' },
    { object_ids: owned.slice(2, 9).map(row => row.object_id) }
  ];
  for (const scope of scopes) {
    const streamed = store.collectExportRecords(OWNER, { types: ['memory', 'accounting'], ...scope });
    assert.deepEqual(canonicalJson(streamed), canonicalJson(wholeSetRecords(store, scope)), JSON.stringify(scope));
  }
  const all = store.collectExportRecords(OWNER, { types: ['memory', 'accounting'] });
  assert.ok(all.some(record => record.type === 'memory_edge'));
  assert.ok(all.some(record => record.type === 'journal' && record.data.entries.length === 3));
  assert.ok(all.some(record => record.type === 'journal' && record.data.entries.length === 0));
  // A scope naming an inactive or another owner's object is refused, before
  // any memory record.
  for (const id of ['memory_00004', 'memory_00003', 'memory_missing']) {
    const records = store.exportRecords(OWNER, { types: ['memory'], object_ids: [id] });
    assert.throws(() => records.next(), error => error.code === 'export_scope_forbidden', id);
  }
});

test('memory and accounting export memory does not grow with the record count', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'axiom-streaming-export-graph-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const src = name => JSON.stringify(new URL(`../src/${name}`, import.meta.url).href);
  const probe = async objects => {
    const workDir = join(dir, `n${objects}`);
    const script = `
      import { randomBytes } from 'node:crypto';
      import { mkdir } from 'node:fs/promises';
      import { join } from 'node:path';
      import { ensureMeshIdentity } from ${src('lib/identity.mjs')};
      import { loadDataProtector } from ${src('lib/protector.mjs')};
      import { GridStore } from ${src('grid/store.mjs')};
      const dataDir = ${JSON.stringify(workDir)};
      await mkdir(dataDir, { recursive: true });
      const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
      const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
      const store = new GridStore({ path: join(dataDir, 'grid.sqlite'), dataDir, identity, protector, checkpointInterval: 100000 });
      const owner = ${JSON.stringify(OWNER)};
      const at = index => new Date(Date.UTC(2026, 0, 1) + index * 1000).toISOString();
      store.db.exec('BEGIN');
      const object = store.db.prepare("INSERT INTO memory_objects(object_id, owner, kind, content_digest, payload_json, status, created_at) VALUES (?, ?, 'note', ?, ?, 'active', ?)");
      const edge = store.db.prepare("INSERT INTO memory_edges(edge_id, owner, from_id, to_id, relation, metadata_json, status, created_at) VALUES (?, ?, ?, ?, 'relates', ?, 'active', ?)");
      store.db.prepare("INSERT INTO accounting_accounts(account_id, owner, unit, name, status, created_at) VALUES ('account_a', ?, 'hours', 'A', 'active', ?)").run(owner, at(0));
      const journal = store.db.prepare("INSERT INTO accounting_journals(journal_id, owner, unit, reference, memo_json, created_at) VALUES (?, ?, 'hours', 'r', ?, ?)");
      const entry = store.db.prepare("INSERT INTO accounting_entries(journal_id, line_no, account_id, amount, metadata_json) VALUES (?, ?, 'account_a', 0, ?)");
      for (let index = 0; index < ${objects}; index += 1) {
        const id = 'memory_' + index;
        // 16 KiB of text per object, as in the review's reproduction.
        object.run(id, owner, 'c'.repeat(64), store.protectJson('memory_objects', 'payload_json', id, { text: randomBytes(8192).toString('hex') }), at(index));
        if (index) edge.run('edge_' + index, owner, 'memory_' + (index - 1), id, store.protectJson('memory_edges', 'metadata_json', 'edge_' + index, { pad: 'e'.repeat(2048) }), at(index));
        const journalId = 'journal_' + index;
        journal.run(journalId, owner, store.protectJson('accounting_journals', 'memo_json', journalId, { pad: 'j'.repeat(2048) }), at(index));
        for (let line = 0; line < 4; line += 1) entry.run(journalId, line, store.protectJson('accounting_entries', 'metadata_json', journalId + ':' + line, { pad: 'm'.repeat(1024) }));
      }
      store.db.exec('COMMIT');
      global.gc();
      const base = process.memoryUsage();
      let peak = 0;
      const sample = () => {
        global.gc();
        const now = process.memoryUsage();
        peak = Math.max(peak, (now.arrayBuffers - base.arrayBuffers) + (now.heapUsed - base.heapUsed));
      };
      let count = 0;
      for (const record of store.exportRecords(owner, { types: ['memory', 'accounting'] })) {
        if (++count % 64 === 1) sample();
      }
      sample();
      store.close();
      console.log(JSON.stringify({ peak, count }));
    `;
    const scriptPath = join(dir, `probe-${objects}.mjs`);
    await writeFile(scriptPath, script);
    const { stdout } = await run(process.execPath, ['--expose-gc', scriptPath], { maxBuffer: 1024 * 1024 });
    return JSON.parse(stdout.trim().split('\n').at(-1));
  };
  const small = await probe(300);
  const large = await probe(1200);
  t.diagnostic(`peak live memory: ${(small.peak / 1048576).toFixed(2)} MiB at 300 objects, ${(large.peak / 1048576).toFixed(2)} MiB at 1,200`);
  // Objects, edges, one account and journals.
  assert.equal(large.count, 1200 + 1199 + 1 + 1200);
  // About 20 MiB of memory text in the larger export; the first record used
  // to hold all of it.
  assert.ok(large.peak < 8 * 1024 * 1024, `peak ${(large.peak / 1048576).toFixed(1)} MiB for 1,200 objects`);
  assert.ok(large.peak < small.peak + 2 * 1024 * 1024,
    `peak grew from ${(small.peak / 1048576).toFixed(1)} to ${(large.peak / 1048576).toFixed(1)} MiB with 4x the records`);
});
