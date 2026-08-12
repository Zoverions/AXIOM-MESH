import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { GridStore } from '../src/grid/store.mjs';
import { requireOwnedMemoryReference } from '../src/grid/memory-reference.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { executeBuiltin } from '../src/sandbox/executor.mjs';

async function storeFixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-memory-ref-'));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const store = new GridStore({
    path: join(dataDir, 'grid.sqlite'),
    dataDir,
    identity,
    protector,
  });
  t.after(async () => {
    store.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  return store;
}

function memoryPut(owner) {
  return executeBuiltin({
    tool: 'builtin.validate-mutation',
    intent: {
      action: 'memory.put',
      principal: { id: owner },
      input: {
        kind: 'education.workflow-event',
        content: {
          artifact_ref: 'governed:artifact:001',
          private_learner_content: 'must-not-be-returned-by-reference-lookup',
        },
        metadata: {
          workflow_payload_digest: 'a'.repeat(64),
        },
      },
    },
  });
}

function appendMutation(store, owner, traceId, mutation) {
  store.appendEvents({
    traceId,
    actor: owner,
    events: [mutation],
  });
}

test('memory reference lookup returns active metadata without protected payload', async t => {
  const store = await storeFixture(t);
  const owner = 'human:learner-001';
  const put = memoryPut(owner);
  appendMutation(store, owner, 'trace:memory-ref:put', put.mutation);

  const reference = requireOwnedMemoryReference(store, {
    object_id: put.output.object_id,
    owner,
  });

  assert.deepEqual(Object.keys(reference).sort(), [
    'content_digest',
    'created_at',
    'kind',
    'object_id',
    'owner',
    'status',
  ]);
  assert.equal(reference.object_id, put.output.object_id);
  assert.equal(reference.owner, owner);
  assert.equal(reference.kind, 'education.workflow-event');
  assert.equal(reference.content_digest, put.output.content_digest);
  assert.equal(reference.status, 'active');
  assert.equal(JSON.stringify(reference).includes('private_learner_content'), false);
  assert.equal(JSON.stringify(reference).includes('workflow_payload_digest'), false);
});

test('memory reference lookup rejects cross-owner substitution', async t => {
  const store = await storeFixture(t);
  const owner = 'human:learner-001';
  const put = memoryPut(owner);
  appendMutation(store, owner, 'trace:memory-ref:owner', put.mutation);

  assert.throws(
    () => requireOwnedMemoryReference(store, {
      object_id: put.output.object_id,
      owner: 'human:learner-002',
    }),
    /Owned active memory reference was not found/,
  );
});

test('memory reference lookup rejects tombstoned objects', async t => {
  const store = await storeFixture(t);
  const owner = 'human:learner-001';
  const put = memoryPut(owner);
  appendMutation(store, owner, 'trace:memory-ref:put-tombstone', put.mutation);

  const tombstone = executeBuiltin({
    tool: 'builtin.validate-mutation',
    intent: {
      action: 'memory.tombstone',
      principal: { id: owner },
      input: {
        object_id: put.output.object_id,
        reason: 'fixture cleanup',
      },
    },
  });
  appendMutation(store, owner, 'trace:memory-ref:tombstone', tombstone.mutation);

  assert.throws(
    () => requireOwnedMemoryReference(store, {
      object_id: put.output.object_id,
      owner,
    }),
    /Owned active memory reference was not found/,
  );
});
