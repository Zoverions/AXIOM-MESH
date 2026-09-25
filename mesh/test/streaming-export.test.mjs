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

test('a memory export does not retain every decoded object before its first record', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'axiom-memory-export-probe-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const src = name => JSON.stringify(new URL(`../src/${name}`, import.meta.url).href);
  const script = `
    import { randomBytes } from 'node:crypto';
    import { join } from 'node:path';
    import { ensureMeshIdentity } from ${src('lib/identity.mjs')};
    import { loadDataProtector } from ${src('lib/protector.mjs')};
    import { GridStore } from ${src('grid/store.mjs')};
    const dataDir = ${JSON.stringify(dir)};
    const owner = ${JSON.stringify(OWNER)};
    const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
    const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
    const store = new GridStore({ path: join(dataDir, 'grid.sqlite'), dataDir, identity, protector });
    const insert = store.db.prepare("INSERT INTO memory_objects (object_id, owner, kind, content_digest, payload_json, status, created_at) VALUES (?, ?, 'note', ?, ?, 'active', ?)");
    for (let index = 0; index < 600; index++) {
      const id = 'memory_' + String(index).padStart(4, '0');
      insert.run(id, owner, 'c'.repeat(64), store.protectJson(
        'memory_objects', 'payload_json', id,
        { index, text: randomBytes(16 * 1024).toString('hex') }
      ), '2026-01-01T00:00:00.000Z');
    }
    global.gc();
    const before = process.memoryUsage();
    const records = store.exportRecords(owner, { types: ['memory'] });
    const first = records.next();
    global.gc();
    const during = process.memoryUsage();
    store.close();
    console.log(JSON.stringify({
      first_type: first.value?.type,
      heap_delta: during.heapUsed - before.heapUsed,
      array_buffer_delta: during.arrayBuffers - before.arrayBuffers
    }));
  `;
  const scriptPath = join(dir, 'memory-probe.mjs');
  await writeFile(scriptPath, script);
  const { stdout } = await run(process.execPath, ['--expose-gc', scriptPath], { maxBuffer: 1024 * 1024 });
  const result = JSON.parse(stdout.trim().split('\n').at(-1));
  assert.equal(result.first_type, 'memory_object');
  assert.ok(
    result.heap_delta + result.array_buffer_delta < 8 * 1024 * 1024,
    `first memory record retains ${((result.heap_delta + result.array_buffer_delta) / 1048576).toFixed(1)} MiB`
  );
});

test('an accounting export does not retain every decoded journal before its first record', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'axiom-accounting-export-probe-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const src = name => JSON.stringify(new URL(`../src/${name}`, import.meta.url).href);
  const script = `
    import { randomBytes } from 'node:crypto';
    import { join } from 'node:path';
    import { ensureMeshIdentity } from ${src('lib/identity.mjs')};
    import { loadDataProtector } from ${src('lib/protector.mjs')};
    import { GridStore } from ${src('grid/store.mjs')};
    const dataDir = ${JSON.stringify(dir)};
    const owner = ${JSON.stringify(OWNER)};
    const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
    const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
    const store = new GridStore({ path: join(dataDir, 'grid.sqlite'), dataDir, identity, protector });
    store.db.prepare("INSERT INTO accounting_accounts(account_id, owner, unit, name, status, created_at) VALUES (?, ?, 'credits', 'Balance', 'active', ?)")
      .run('account_0001', owner, '2026-01-01T00:00:00.000Z');
    const insert = store.db.prepare('INSERT INTO accounting_journals(journal_id, owner, unit, reference, memo_json, created_at) VALUES (?, ?, ?, ?, ?, ?)');
    for (let index = 0; index < 600; index++) {
      const id = 'journal_' + String(index).padStart(4, '0');
      insert.run(id, owner, 'credits', 'probe', store.protectJson(
        'accounting_journals', 'memo_json', id,
        { index, text: randomBytes(16 * 1024).toString('hex') }
      ), '2026-01-01T00:00:00.000Z');
    }
    global.gc();
    const before = process.memoryUsage();
    const records = store.exportRecords(owner, { types: ['accounting'] });
    const first = records.next();
    const firstJournal = records.next();
    global.gc();
    const during = process.memoryUsage();
    store.close();
    console.log(JSON.stringify({
      first_type: first.value?.type,
      first_journal_type: firstJournal.value?.type,
      heap_delta: during.heapUsed - before.heapUsed,
      array_buffer_delta: during.arrayBuffers - before.arrayBuffers
    }));
  `;
  const scriptPath = join(dir, 'accounting-probe.mjs');
  await writeFile(scriptPath, script);
  const { stdout } = await run(process.execPath, ['--expose-gc', scriptPath], { maxBuffer: 1024 * 1024 });
  const result = JSON.parse(stdout.trim().split('\n').at(-1));
  assert.equal(result.first_type, 'account');
  assert.equal(result.first_journal_type, 'journal');
  assert.ok(
    result.heap_delta + result.array_buffer_delta < 8 * 1024 * 1024,
    `first accounting record retains ${((result.heap_delta + result.array_buffer_delta) / 1048576).toFixed(1)} MiB`
  );
});

test('streamed accounting export preserves journal entries, metadata and empty journals', async t => {
  const { store } = await openStore(t);
  const createdAt = '2026-01-01T00:00:00.000Z';
  const addAccount = store.db.prepare("INSERT INTO accounting_accounts(account_id, owner, unit, name, status, created_at) VALUES (?, ?, 'credits', ?, 'active', ?)");
  addAccount.run('account_a', OWNER, 'A', createdAt);
  addAccount.run('account_b', OWNER, 'B', createdAt);
  const addJournal = store.db.prepare("INSERT INTO accounting_journals(journal_id, owner, unit, reference, memo_json, created_at) VALUES (?, ?, 'credits', 'review', ?, ?)");
  for (const id of ['journal_a', 'journal_b']) {
    addJournal.run(id, OWNER, store.protectJson('accounting_journals', 'memo_json', id, { id }), createdAt);
  }
  const addEntry = store.db.prepare('INSERT INTO accounting_entries(journal_id, line_no, account_id, amount, metadata_json) VALUES (?, ?, ?, ?, ?)');
  for (const [line, account, amount] of [[0, 'account_a', -5], [1, 'account_b', 5]]) {
    addEntry.run('journal_a', line, account, amount,
      store.protectJson('accounting_entries', 'metadata_json', `journal_a:${line}`, { line }));
  }
  const records = store.collectExportRecords(OWNER, { types: ['accounting'] });
  assert.deepEqual(records.filter(record => record.type === 'account')
    .map(record => record.data.account_id), ['account_a', 'account_b']);
  const journals = records.filter(record => record.type === 'journal').map(record => record.data);
  assert.deepEqual(journals.map(journal => [journal.journal_id, journal.memo_json, journal.entries.length]), [
    ['journal_a', { id: 'journal_a' }, 2],
    ['journal_b', { id: 'journal_b' }, 0]
  ]);
  assert.deepEqual(journals[0].entries.map(entry => [entry.line_no, entry.amount, entry.metadata_json]), [
    [0, -5, { line: 0 }], [1, 5, { line: 1 }]
  ]);
});
