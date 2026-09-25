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
