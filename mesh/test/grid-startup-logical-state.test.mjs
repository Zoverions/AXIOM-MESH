import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { sha256 } from '../src/lib/canonical.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { GridStore } from '../src/grid/store.mjs';
import { logicalMaterializedStateDigest } from '../src/grid-startup-logical-state.mjs';

test('logical state digest is stable across re-encryption of equivalent protected materialization', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-logical-state-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const store = new GridStore({ path: join(dataDir, 'grid.sqlite'), dataDir, identity, protector });
  const intentId = 'intent_logical_digest';
  store.appendEvents({ traceId: 'trace_logical_digest', actor: 'person:logical', events: [{
    kind: 'intent.accepted', subject: intentId, payload: {
      intent_id: intentId, principal: 'person:logical', action: 'system.echo', risk: 'low',
      input_digest: sha256('logical-input'), request_digest: sha256('logical-request')
    }
  }, { kind: 'intent.completed', subject: intentId, payload: { intent_id: intentId, result: { ok: true } } }] });
  const logicalBefore = logicalMaterializedStateDigest(store);
  const storageBefore = store.materializedStateDigest();
  const row = store.db.prepare('SELECT result_json FROM intents WHERE intent_id = ?').get(intentId);
  const value = store.openJson('intents', 'result_json', intentId, row.result_json);
  store.db.prepare('UPDATE intents SET result_json = ? WHERE intent_id = ?').run(
    store.protectJson('intents', 'result_json', intentId, value), intentId
  );
  assert.equal(logicalMaterializedStateDigest(store), logicalBefore);
  assert.notEqual(store.materializedStateDigest(), storageBefore);
  store.close();
});
