import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { sha256 } from '../src/lib/canonical.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import {
  prepareSemanticMemoryContentMutation,
  semanticMemoryContentAddress
} from '../src/lib/semantic-memory-content.mjs';
import {
  semanticMemoryIngestionInputDigest,
  semanticMemoryIngestionRequestDigest
} from '../src/lib/semantic-memory-ingestion.mjs';
import {
  deriveSemanticMemoryProvenance,
  normalizeSemanticMemoryProvenance
} from '../src/lib/semantic-memory-provenance.mjs';
import { SemanticMemoryContentGridStore } from '../src/grid/semantic-memory-content-store.mjs';

let sequence = 0;

function nextId(prefix) {
  sequence += 1;
  return `${prefix}.${sequence}`;
}

async function fixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-semantic-lineage-life-'));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const path = join(dataDir, 'grid.sqlite');
  const store = new SemanticMemoryContentGridStore({
    path,
    dataDir,
    identity,
    protector
  });
  t.after(async () => {
    try {
      store.close();
    } catch {
      // The test closes the first store before restart.
    }
    await rm(dataDir, { recursive: true, force: true });
  });
  return { store, dataDir, identity, protector, path };
}

function initialParent() {
  const owner = 'owner.alice';
  const content = { text: 'remote parent semantic payload' };
  const metadata = { source: 'agent.remote.parent' };
  const address = semanticMemoryContentAddress({ owner, content, metadata });
  const provenance = normalizeSemanticMemoryProvenance({
    object_id: address.object_id,
    owner,
    content_digest: address.content_digest,
    origin_class: 'remote-agent',
    origin_principal: 'agent.remote.parent',
    origin_artifact_digest: sha256('remote-parent-source-receipt'),
    semantic_class: 'knowledge'
  });
  return { owner, content, metadata, provenance };
}

function derivedChild(parent) {
  const owner = parent.owner;
  const content = { text: 'derived summary of parent semantic payload' };
  const metadata = { derivation: 'summary-v1' };
  const address = semanticMemoryContentAddress({ owner, content, metadata });
  const provenance = deriveSemanticMemoryProvenance(parent, {
    object_id: address.object_id,
    content_digest: address.content_digest,
    semantic_class: 'knowledge'
  });
  return { owner, content, metadata, provenance };
}

function persist(store, memory) {
  const intentId = nextId('intent.semantic.lineage');
  const traceId = nextId('trace.semantic.lineage');
  const requestDigest = semanticMemoryIngestionRequestDigest(memory.provenance);
  const invocationDigest = sha256(`invocation:${intentId}`);
  const policyDigest = sha256(`policy:${intentId}`);

  store.appendEvents({
    traceId,
    actor: memory.owner,
    events: [{
      kind: 'intent.accepted',
      subject: intentId,
      payload: {
        intent_id: intentId,
        principal: memory.owner,
        principal_type: 'human',
        action: 'memory.semantic.ingest',
        risk: 'low',
        input_digest: semanticMemoryIngestionInputDigest(memory.provenance),
        request_digest: requestDigest,
        policy_version: 'semantic-lineage-lifecycle-lab',
        policy_digest: policyDigest,
        invocation: { schema: 'test-invocation-envelope' },
        invocation_digest: invocationDigest
      }
    }]
  });

  const prepared = prepareSemanticMemoryContentMutation(memory, {
    intent_id: intentId,
    request_digest: requestDigest
  });
  store.appendEvents({
    traceId,
    actor: memory.owner,
    events: [
      prepared.mutation,
      {
        kind: 'intent.completed',
        subject: intentId,
        payload: {
          intent_id: intentId,
          result: {
            ...structuredClone(prepared.output),
            intent_id: intentId,
            trace_id: traceId,
            status: 'completed',
            evidence: {
              plan_digest: sha256(`plan:${intentId}`),
              invocation_digest: invocationDigest,
              execution_digest: sha256(`execution:${intentId}`),
              policy_digest: policyDigest
            }
          }
        }
      }
    ]
  });
  return prepared.mutation.payload.semantic_provenance;
}

test('tombstoned ancestor blocks live derived use but not historical signed-event replay', async t => {
  const { store, dataDir, identity, protector, path } = await fixture(t);
  const parent = persist(store, initialParent());
  const child = persist(store, derivedChild(parent));

  assert.equal(store.verifySemanticMemoryCurrentState(child).object_id, child.object_id);

  store.appendEvents({
    traceId: nextId('trace.semantic.parent-tombstone'),
    actor: parent.owner,
    events: [{
      kind: 'memory.tombstoned',
      subject: parent.object_id,
      payload: { object_id: parent.object_id, owner: parent.owner }
    }]
  });

  assert.throws(
    () => store.verifySemanticMemoryCurrentState(parent),
    error => error?.code === 'semantic_memory_content_inactive'
  );
  assert.throws(
    () => store.verifySemanticMemoryCurrentState(child),
    error => error?.code === 'semantic_memory_content_inactive'
  );

  assert.doesNotThrow(() => store.rebuildSemanticMemoryState());
  assert.throws(
    () => store.verifySemanticMemoryCurrentState(child),
    error => error?.code === 'semantic_memory_content_inactive'
  );

  store.close();
  const reopened = new SemanticMemoryContentGridStore({
    path,
    dataDir,
    identity,
    protector
  });
  try {
    assert.equal(reopened.verifySemanticMemoryContentHistory().valid, true);
    assert.throws(
      () => reopened.verifySemanticMemoryCurrentState(child),
      error => error?.code === 'semantic_memory_content_inactive'
    );
  } finally {
    reopened.close();
  }
});
