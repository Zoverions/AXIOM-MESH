import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import {
  AuthenticatedSemanticMemoryGridStore
} from '../src/grid/semantic-memory-authenticated-ingestion.mjs';

async function fixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-semantic-ingestion-guard-'));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const store = new AuthenticatedSemanticMemoryGridStore({
    path: join(dataDir, 'grid.sqlite'),
    dataDir,
    identity,
    protector
  });
  t.after(async () => {
    store.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  return store;
}

test('authenticated ingestion store rejects a bare memory.put append', async t => {
  const store = await fixture(t);
  const owner = 'owner.alice';
  const kind = 'note';
  const content = { text: 'No provenance bypass.' };
  const metadata = {};
  const contentDigest = digestObject({ owner, kind, content, metadata });
  const objectId = `memory_${contentDigest}`;

  assert.throws(
    () => store.appendEvents({
      traceId: 'trace.bare.memory.put',
      actor: owner,
      events: [{
        kind: 'memory.put',
        subject: objectId,
        payload: {
          object_id: objectId,
          owner,
          kind,
          content,
          metadata,
          content_digest: contentDigest
        }
      }]
    }),
    /rejects bare memory\.put append/
  );
  assert.equal(store.listMemory(owner, owner).objects.length, 0);
  assert.equal(
    store.getStatus().authenticated_semantic_memory_ingestion.generic_memory_put_append,
    false
  );
});
