import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { sha256 } from '../src/lib/canonical.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { DataProtector } from '../src/lib/protector.mjs';
import { GridStore } from '../src/grid/store.mjs';
import { SocialGridStore } from '../src/grid/social-store.mjs';

const ANCHORS = 'AXIOM_GRID_MATERIALIZATION_ANCHORS';
const FULL = 'AXIOM_GRID_FULL_REBUILD';

function withEnv(t, values) {
  const previous = {};
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

async function fixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-anchor-'));
  const stores = [];
  // Close every store before removing the directory: Windows cannot unlink
  // a SQLite file that is still open.
  t.after(async () => {
    for (const store of stores) {
      if (store.db.isOpen) store.close();
    }
    await rm(dataDir, { recursive: true, force: true });
  });
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = new DataProtector(randomBytes(32));
  const path = join(dataDir, 'grid.sqlite');
  const track = store => {
    stores.push(store);
    return store;
  };
  const open = (overrides = {}) => track(new GridStore({ path, dataDir, identity, protector, ...overrides }));
  return { dataDir, path, identity, protector, open, track };
}

function acceptIntent(store, n) {
  const id = `intent_anchor_${String(n).padStart(4, '0')}`;
  store.appendEvents({
    traceId: `trace_anchor_${String(n).padStart(4, '0')}`,
    actor: 'person:test',
    events: [{
      kind: 'intent.accepted',
      subject: id,
      payload: {
        intent_id: id,
        principal: 'person:test',
        action: 'system.echo',
        risk: 'low',
        input_digest: sha256('{}'),
        request_digest: sha256(`request-${n}`)
      }
    }]
  });
  return id;
}

test('anchors are disabled by default and every start replays the log', async t => {
  withEnv(t, { [ANCHORS]: undefined, [FULL]: undefined });
  const { open } = await fixture(t);
  let store = open();
  acceptIntent(store, 1);
  store.close();

  store = open();
  assert.equal(store.materializationStartup.core, 'replayed:anchors-disabled');
  const anchors = store.db.prepare("SELECT key FROM meta WHERE key LIKE 'materialization_anchor:%'").all();
  assert.deepEqual(anchors, [], 'no anchor is written while the feature is disabled');
});

test('with anchors enabled, a clean restart skips replay and keeps identical state', async t => {
  withEnv(t, { [ANCHORS]: '1', [FULL]: undefined });
  const { open } = await fixture(t);
  let store = open();
  const ids = [1, 2, 3].map(n => acceptIntent(store, n));
  store.close();

  store = open();
  assert.equal(store.materializationStartup.core, 'anchored');
  const anchored = ids.map(id => store.getIntent(id));
  store.close();

  withEnv(t, { [FULL]: '1' });
  store = open();
  assert.equal(store.materializationStartup.core, 'replayed:forced');
  assert.deepEqual(ids.map(id => store.getIntent(id)), anchored, 'anchored state equals a full replay');
});

test('with anchors enabled, an edit made at rest is detected and undone', async t => {
  withEnv(t, { [ANCHORS]: '1', [FULL]: undefined });
  const { open, path } = await fixture(t);
  let store = open();
  const id = acceptIntent(store, 1);
  store.close();

  const raw = new DatabaseSync(path);
  raw.prepare("UPDATE intents SET status = 'tampered' WHERE intent_id = ?").run(id);
  raw.close();

  store = open();
  assert.equal(store.materializationStartup.core, 'replayed:state_digest');
  assert.equal(store.getIntent(id).status, 'accepted');
});

test('with anchors enabled, an edit by another connection during a session is undone', async t => {
  withEnv(t, { [ANCHORS]: '1', [FULL]: undefined });
  const { open, path } = await fixture(t);
  let store = open();
  const id = acceptIntent(store, 1);

  const other = new DatabaseSync(path);
  other.prepare("UPDATE intents SET status = 'tampered' WHERE intent_id = ?").run(id);
  other.close();
  store.close(); // must refuse to vouch for this state

  store = open();
  assert.equal(store.materializationStartup.core, 'replayed:missing');
  assert.equal(store.getIntent(id).status, 'accepted');
});

test('with anchors enabled, a crash after new events forces replay', async t => {
  withEnv(t, { [ANCHORS]: '1', [FULL]: undefined });
  const { open } = await fixture(t);
  let store = open();
  acceptIntent(store, 1);
  store.close();

  store = open();
  const id = acceptIntent(store, 2);
  store.db.close(); // no clean close, so no fresh anchor

  store = open();
  assert.equal(store.materializationStartup.core, 'replayed:stale');
  assert.equal(store.getIntent(id).status, 'accepted');
});

test('with anchors enabled, a forged anchor is rejected', async t => {
  withEnv(t, { [ANCHORS]: '1', [FULL]: undefined });
  const { open, path } = await fixture(t);
  let store = open();
  const id = acceptIntent(store, 1);
  store.close();

  // Tamper with state, then rewrite the anchor's digest to match -- without the Grid key.
  const raw = new DatabaseSync(path);
  raw.prepare("UPDATE intents SET status = 'tampered' WHERE intent_id = ?").run(id);
  const anchor = JSON.parse(raw.prepare("SELECT value FROM meta WHERE key = 'materialization_anchor:core'").get().value);
  anchor.body.state_digest = '0'.repeat(64);
  raw.prepare("UPDATE meta SET value = ? WHERE key = 'materialization_anchor:core'").run(JSON.stringify(anchor));
  raw.close();

  store = open();
  assert.equal(store.materializationStartup.core, 'replayed:signature');
  assert.equal(store.getIntent(id).status, 'accepted');
});

test('protected-column sweep runs once, then startup samples and still rejects a wrong key', async t => {
  withEnv(t, { [ANCHORS]: undefined, [FULL]: undefined });
  const { open } = await fixture(t);
  let store = open();
  acceptIntent(store, 1);
  const marker = store.db.prepare("SELECT value FROM meta WHERE key = 'protected_columns:core'").get();
  assert.ok(marker, 'a completed sweep records its marker');
  store.close();

  assert.throws(() => open({ protector: new DataProtector(randomBytes(32)) }));
});

test('with anchors enabled, each layer is anchored and rejected independently', async t => {
  withEnv(t, { [ANCHORS]: '1', [FULL]: undefined });
  const { path, dataDir, identity, protector, track } = await fixture(t);
  const openSocial = () => track(new SocialGridStore({ path, dataDir, identity, protector }));

  let store = openSocial();
  acceptIntent(store, 1);
  store.close();

  store = openSocial();
  assert.equal(store.materializationStartup.core, 'anchored');
  assert.equal(store.materializationStartup.social, 'anchored');
  store.close();

  // A code change to the social layer: validly signed anchor, outdated fingerprint.
  const raw = new DatabaseSync(path);
  const anchor = JSON.parse(raw.prepare("SELECT value FROM meta WHERE key = 'materialization_anchor:social'").get().value);
  anchor.body.fingerprint = anchor.body.fingerprint.replace(/^social:\d+/u, 'social:0');
  anchor.signature = identity.signObject(anchor.body);
  raw.prepare("UPDATE meta SET value = ? WHERE key = 'materialization_anchor:social'").run(JSON.stringify(anchor));
  raw.close();

  store = openSocial();
  assert.equal(store.materializationStartup.core, 'anchored', 'an unrelated layer is unaffected');
  assert.equal(store.materializationStartup.social, 'replayed:fingerprint');
});
