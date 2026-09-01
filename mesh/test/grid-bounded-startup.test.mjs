import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { canonicalJson, sha256 } from '../src/lib/canonical.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { GridStore } from '../src/grid/store.mjs';

function acceptedEvent(index) {
  return {
    kind: 'intent.accepted',
    subject: `intent_startup_${String(index).padStart(6, '0')}`,
    payload: {
      intent_id: `intent_startup_${String(index).padStart(6, '0')}`,
      principal: 'person:startup',
      action: 'system.echo',
      risk: 'low',
      input_digest: sha256(`startup-input-${index}`),
      request_digest: sha256(`startup-request-${index}`)
    }
  };
}

async function startupFixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-startup-'));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const path = join(dataDir, 'grid.sqlite');
  const open = () => new GridStore({
    path,
    dataDir,
    identity,
    protector,
    checkpointInterval: 10_000,
    materializationAnchor: 'sealed'
  });
  // Edits applied while the Grid is closed. The seal is written on close, so a
  // test that mutated a live store would simply have its mutation sealed in.
  const offline = mutate => {
    const db = new DatabaseSync(path);
    try {
      return mutate(db);
    } finally {
      db.close();
    }
  };
  t.after(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });
  return { dataDir, identity, protector, path, open, offline };
}

function append(store, from, count) {
  for (let index = from; index < from + count; index += 1) {
    store.appendEvents({
      traceId: `trace_startup_${String(index).padStart(10, '0')}`,
      actor: 'person:startup',
      events: [acceptedEvent(index)]
    });
  }
}

test('the supported default re-derives materialized state on every startup', async t => {
  const { path, dataDir, identity, protector } = await startupFixture(t);
  const plain = () => new GridStore({ path, dataDir, identity, protector, checkpointInterval: 10_000 });
  let store = plain();
  append(store, 1, 11);
  assert.equal(store.materializationAnchorMode, 'off');
  store.close();

  store = plain();
  assert.equal(store.materializationStartup.mode, 'full_rebuild');
  assert.equal(store.materializationStartup.replayed_events, 11);
  // The bounded protected-column path applies in both modes.
  assert.equal(store.protectedColumnStartup.mode, 'sampled');
  assert.equal(
    store.db.prepare("SELECT value FROM meta WHERE key = 'materialization_anchor_v1'").get(),
    undefined
  );
  store.close();
});

test('an unknown materialization anchor mode fails closed', async t => {
  const { path, dataDir, identity, protector } = await startupFixture(t);
  assert.throws(
    () => new GridStore({ path, dataDir, identity, protector, materializationAnchor: 'maybe' }),
    /materialization anchor mode must be one of/
  );
});

test('a no-op restart replays no events and samples rather than rescanning protected columns', async t => {
  const { open } = await startupFixture(t);
  let store = open();
  append(store, 1, 25);
  const expectedDigest = store.materializedStateDigest();
  store.close();

  store = open();
  assert.equal(store.materializationStartup.mode, 'anchored');
  assert.equal(store.materializationStartup.replayed_events, 0);
  assert.equal(store.materializationStartup.materialized_through_seq, 25);
  assert.equal(store.protectedColumnStartup.mode, 'sampled');
  assert.equal(store.materializedStateDigest(), expectedDigest);
  assert.equal(store.getIntent('intent_startup_000007').status, 'accepted');
  store.close();
});

test('an anchor that disagrees with the derived tables falls back to a full rebuild', async t => {
  const { open, offline } = await startupFixture(t);
  let store = open();
  append(store, 1, 26);
  const fullDigest = store.materializedStateDigest();
  store.close();

  // Rewind only the sequence. The anchor no longer describes the chain head, so
  // the store must re-derive rather than serve state it cannot account for.
  offline(db => {
    const anchor = JSON.parse(
      db.prepare("SELECT value FROM meta WHERE key = 'materialization_anchor_v1'").get().value
    );
    db.prepare("UPDATE meta SET value = ? WHERE key = 'materialization_anchor_v1'").run(
      canonicalJson({
        ...anchor,
        materialized_through_seq: 20,
        head_hash: db.prepare('SELECT event_hash FROM events WHERE seq = 20').get().event_hash
      })
    );
  });

  store = open();
  assert.equal(store.materializationStartup.mode, 'full_rebuild');
  assert.equal(store.materializedStateDigest(), fullDigest);
  store.close();
});

test('materialized state edited while the Grid is closed is re-derived from the signed chain', async t => {
  const { open, offline } = await startupFixture(t);
  let store = open();
  append(store, 1, 12);
  const expectedDigest = store.materializedStateDigest();
  store.close();

  offline(db => db.prepare("UPDATE intents SET status = 'tampered' WHERE intent_id = ?").run(
    'intent_startup_000004'
  ));

  store = open();
  assert.equal(store.materializationStartup.mode, 'full_rebuild');
  assert.equal(store.materializationStartup.replayed_events, 12);
  assert.equal(store.getIntent('intent_startup_000004').status, 'accepted');
  assert.equal(store.materializedStateDigest(), expectedDigest);
  store.close();
});

test('an interrupted session leaves no seal and the next startup re-derives', async t => {
  const { open, offline } = await startupFixture(t);
  const store = open();
  append(store, 1, 10);
  const expectedDigest = store.materializedStateDigest();
  // A crash: the process never reaches close(), so the anchor cleared by the
  // first append of the session is never resealed.
  const anchorRow = store.db.prepare(
    "SELECT value FROM meta WHERE key = 'materialization_anchor_v1'"
  ).get();
  assert.equal(anchorRow, undefined);
  store.db.close();

  const reopened = open();
  assert.equal(reopened.materializationStartup.mode, 'full_rebuild');
  assert.equal(reopened.materializedStateDigest(), expectedDigest);
  reopened.close();
  offline(db => {
    const sealed = db.prepare(
      "SELECT value FROM meta WHERE key = 'materialization_anchor_v1'"
    ).get();
    assert.ok(sealed, 'a clean close must leave a sealed anchor');
  });
});

test('missing, corrupt, or foreign-build anchors fall back to the full rebuild', async t => {
  for (const mutate of [
    db => db.prepare("DELETE FROM meta WHERE key = 'materialization_anchor_v1'").run(),
    db => db.prepare("UPDATE meta SET value = 'not-json' WHERE key = 'materialization_anchor_v1'").run(),
    db => rewriteAnchor(db, anchor => ({ ...anchor, build_digest: 'a'.repeat(64) })),
    db => rewriteAnchor(db, anchor => ({ ...anchor, materialized_through_seq: 9_999 })),
    db => rewriteAnchor(db, anchor => ({ ...anchor, head_hash: 'b'.repeat(64) })),
    db => rewriteAnchor(db, anchor => ({ ...anchor, materialized_digest: 'c'.repeat(64) })),
    db => rewriteAnchor(db, anchor => ({ ...anchor, schema_version: 1 }))
  ]) {
    const { open, offline } = await startupFixture(t);
    let store = open();
    append(store, 1, 9);
    const expectedDigest = store.materializedStateDigest();
    store.close();
    offline(mutate);

    store = open();
    assert.equal(store.materializationStartup.mode, 'full_rebuild');
    assert.equal(store.materializedStateDigest(), expectedDigest);
    store.close();
  }
});

function rewriteAnchor(db, transform) {
  const anchor = JSON.parse(
    db.prepare("SELECT value FROM meta WHERE key = 'materialization_anchor_v1'").get().value
  );
  db.prepare("UPDATE meta SET value = ? WHERE key = 'materialization_anchor_v1'").run(
    canonicalJson(transform(anchor))
  );
}

test('a full rebuild and an anchored restart produce the identical materialized state', async t => {
  const { open } = await startupFixture(t);
  let store = open();
  append(store, 1, 30);
  const anchoredDigest = store.materializedStateDigest();
  store.close();

  store = open();
  assert.equal(store.materializationStartup.mode, 'anchored');
  const rebuild = store.rebuildMaterializedState();
  assert.equal(rebuild.mode, 'full_rebuild');
  assert.equal(rebuild.replayed_events, 30);
  assert.equal(store.materializedStateDigest(), anchoredDigest);
  store.close();
});

test('the sampled protected-column path still fails closed on a wrong data key', async t => {
  const { path, dataDir, identity, open } = await startupFixture(t);
  let store = open();
  append(store, 1, 5);
  assert.equal(store.protectedColumnStartup.mode, 'migrated');
  store.close();

  store = open();
  assert.equal(store.protectedColumnStartup.mode, 'sampled');
  store.close();

  const otherDir = await mkdtemp(join(tmpdir(), 'axiom-startup-key-'));
  t.after(async () => {
    await rm(otherDir, { recursive: true, force: true });
  });
  const foreignProtector = await loadDataProtector({ dataDir: otherDir, autoBootstrap: true });
  assert.throws(
    () => new GridStore({ path, dataDir, identity, protector: foreignProtector }),
    /Grid evidence chain failed startup verification|decrypt|protected/i
  );
});
