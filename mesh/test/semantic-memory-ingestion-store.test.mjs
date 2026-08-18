import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { sha256 } from '../src/lib/canonical.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import {
  prepareSemanticMemoryIngestionMutation,
  semanticMemoryIngestionInputDigest,
  semanticMemoryIngestionRequestDigest
} from '../src/lib/semantic-memory-ingestion.mjs';
import { normalizeSemanticMemoryProvenance } from '../src/lib/semantic-memory-provenance.mjs';
import { SemanticMemoryIngestionGridStore } from '../src/grid/semantic-memory-ingestion-store.mjs';
import { SemanticMemoryStateGridStore } from '../src/grid/semantic-memory-state-store.mjs';

async function storeFixture(t, StoreClass = SemanticMemoryIngestionGridStore) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-semantic-ingestion-'));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const path = join(dataDir, 'grid.sqlite');
  const store = new StoreClass({ path, dataDir, identity, protector });
  t.after(async () => {
    try {
      store.close();
    } catch {
      // A test may deliberately close before reopening.
    }
    await rm(dataDir, { recursive: true, force: true });
  });
  return { store, dataDir, identity, protector, path };
}

function remoteRecord(objectId = 'memory.ingestion.grid.1') {
  return normalizeSemanticMemoryProvenance({
    object_id: objectId,
    owner: 'owner.alice',
    content_digest: sha256(`remote semantic payload:${objectId}`),
    origin_class: 'local-model-generated',
    origin_principal: 'provider.model.alpha',
    origin_runtime_id: 'runtime.model.alpha',
    origin_artifact_digest: sha256(`provider receipt:${objectId}`),
    semantic_class: 'instruction-candidate'
  });
}

function acceptedIntentEvent(record, {
  intentId = 'intent.semantic.ingestion.1',
  invocationDigest = sha256('semantic ingestion invocation'),
  policyDigest = sha256('semantic ingestion policy')
} = {}) {
  return {
    intentId,
    invocationDigest,
    policyDigest,
    requestDigest: semanticMemoryIngestionRequestDigest(record),
    event: {
      kind: 'intent.accepted',
      subject: intentId,
      payload: {
        intent_id: intentId,
        principal: record.owner,
        principal_type: 'human',
        action: 'memory.semantic.ingest',
        risk: 'low',
        input_digest: semanticMemoryIngestionInputDigest(record),
        request_digest: semanticMemoryIngestionRequestDigest(record),
        policy_version: 'semantic-memory-lab',
        policy_digest: policyDigest,
        invocation: { schema: 'test-invocation-envelope' },
        invocation_digest: invocationDigest
      }
    }
  };
}

function preparedCommit(record, accepted, traceId = 'trace.semantic.ingestion.1') {
  const prepared = prepareSemanticMemoryIngestionMutation(record, {
    intent_id: accepted.intentId,
    request_digest: accepted.requestDigest
  });
  return {
    prepared,
    completion: {
      kind: 'intent.completed',
      subject: accepted.intentId,
      payload: {
        intent_id: accepted.intentId,
        result: {
          ...prepared.output,
          intent_id: accepted.intentId,
          trace_id: traceId,
          status: 'completed',
          evidence: {
            plan_digest: sha256('semantic ingestion plan'),
            invocation_digest: accepted.invocationDigest,
            execution_digest: sha256('semantic ingestion execution'),
            policy_digest: accepted.policyDigest
          }
        }
      }
    }
  };
}

function accept(store, record, accepted, traceId = 'trace.semantic.ingestion.1') {
  store.appendEvents({
    traceId,
    actor: record.owner,
    events: [accepted.event]
  });
}

test('fresh semantic memory state requires exact owner intent and adjacent completion in one commit', async t => {
  const { store, dataDir, identity, protector, path } = await storeFixture(t);
  const record = remoteRecord();
  const accepted = acceptedIntentEvent(record);
  const traceId = 'trace.semantic.ingestion.1';
  accept(store, record, accepted, traceId);
  const { prepared, completion } = preparedCommit(record, accepted, traceId);

  store.appendEvents({
    traceId,
    actor: record.owner,
    events: [prepared.mutation, completion]
  });

  const current = store.getCurrentSemanticMemoryProvenance(
    record.owner,
    record.object_id
  );
  assert.equal(current.provenance_digest, prepared.mutation.payload.record.provenance_digest);
  assert.equal(current.ingestion_intent_id, accepted.intentId);
  assert.equal(current.request_digest, accepted.requestDigest);
  assert.equal(current.authority_tier, 'untrusted-data');
  assert.equal(current.review_state, 'unreviewed');

  store.close();
  const reopened = new SemanticMemoryIngestionGridStore({
    path,
    dataDir,
    identity,
    protector
  });
  t.after(() => {
    try {
      reopened.close();
    } catch {
      // Already closed by test cleanup.
    }
  });
  const audit = reopened.verifySemanticMemoryIngestionHistory();
  assert.equal(audit.valid, true);
  assert.equal(audit.initial_objects, 1);
});

test('accepted intent without same-commit completion cannot persist semantic state', async t => {
  const { store } = await storeFixture(t);
  const record = remoteRecord('memory.ingestion.no-completion');
  const accepted = acceptedIntentEvent(record, { intentId: 'intent.semantic.no-completion' });
  accept(store, record, accepted, 'trace.semantic.no-completion');
  const prepared = prepareSemanticMemoryIngestionMutation(record, {
    intent_id: accepted.intentId,
    request_digest: accepted.requestDigest
  });

  assert.throws(
    () => store.appendEvents({
      traceId: 'trace.semantic.no-completion',
      actor: record.owner,
      events: [prepared.mutation]
    }),
    /followed immediately by one matching intent.completed/
  );
  const row = store.db.prepare(`
    SELECT 1 FROM semantic_memory_provenance_state WHERE object_id = ?
  `).get(record.object_id);
  assert.equal(row, undefined);
});

test('denied semantic ingestion intent cannot be converted into a memory write', async t => {
  const { store } = await storeFixture(t);
  const record = remoteRecord('memory.ingestion.denied');
  const accepted = acceptedIntentEvent(record, { intentId: 'intent.semantic.denied' });
  const traceId = 'trace.semantic.denied';
  accept(store, record, accepted, traceId);
  store.appendEvents({
    traceId,
    actor: record.owner,
    events: [{
      kind: 'intent.denied',
      subject: accepted.intentId,
      payload: {
        intent_id: accepted.intentId,
        error: { code: 'policy_denied', message: 'Denied for test' }
      }
    }]
  });
  const { prepared, completion } = preparedCommit(record, accepted, traceId);

  assert.throws(
    () => store.appendEvents({
      traceId,
      actor: record.owner,
      events: [prepared.mutation, completion]
    }),
    error => error?.code === 'semantic_memory_ingestion_intent_unavailable'
  );
});

test('provider identity may describe origin but cannot become the Grid commit actor', async t => {
  const { store } = await storeFixture(t);
  const record = remoteRecord('memory.ingestion.provider-actor');
  const accepted = acceptedIntentEvent(record, { intentId: 'intent.semantic.provider-actor' });
  const traceId = 'trace.semantic.provider-actor';
  accept(store, record, accepted, traceId);
  const { prepared, completion } = preparedCommit(record, accepted, traceId);

  assert.throws(
    () => store.appendEvents({
      traceId,
      actor: 'provider.model.alpha',
      events: [prepared.mutation, completion]
    }),
    /actor must equal the human memory owner/
  );
});

test('completion evidence substitution fails before semantic state append', async t => {
  const { store } = await storeFixture(t);
  const record = remoteRecord('memory.ingestion.evidence-substitution');
  const accepted = acceptedIntentEvent(record, { intentId: 'intent.semantic.evidence-substitution' });
  const traceId = 'trace.semantic.evidence-substitution';
  accept(store, record, accepted, traceId);
  const { prepared, completion } = preparedCommit(record, accepted, traceId);
  completion.payload.result.evidence.invocation_digest = sha256('wrong invocation');

  assert.throws(
    () => store.appendEvents({
      traceId,
      actor: record.owner,
      events: [prepared.mutation, completion]
    }),
    /completion evidence does not match the accepted intent/
  );
});

test('request substitution cannot reuse an accepted semantic ingestion intent', async t => {
  const { store } = await storeFixture(t);
  const original = remoteRecord('memory.ingestion.original');
  const accepted = acceptedIntentEvent(original, { intentId: 'intent.semantic.substitution' });
  const traceId = 'trace.semantic.substitution';
  accept(store, original, accepted, traceId);
  const substituted = remoteRecord('memory.ingestion.substituted');

  assert.throws(
    () => prepareSemanticMemoryIngestionMutation(substituted, {
      intent_id: accepted.intentId,
      request_digest: accepted.requestDigest
    }),
    /does not match the exact source record/
  );
});

test('direct unbound semantic state API is disabled on the ingestion-bound store', async t => {
  const { store } = await storeFixture(t);
  const record = remoteRecord('memory.ingestion.direct');
  assert.throws(
    () => store.recordSemanticMemoryProvenance({
      traceId: 'trace.semantic.direct',
      actor: record.owner,
      record
    }),
    /Direct semantic memory provenance recording is disabled/
  );
});

test('strict ingestion store refuses legacy semantic state whose authenticated ingestion provenance cannot be reconstructed', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-semantic-ingestion-legacy-'));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const path = join(dataDir, 'grid.sqlite');
  t.after(async () => rm(dataDir, { recursive: true, force: true }));

  const legacy = new SemanticMemoryStateGridStore({ path, dataDir, identity, protector });
  const record = remoteRecord('memory.ingestion.legacy-unbound');
  legacy.recordSemanticMemoryProvenance({
    traceId: 'trace.semantic.legacy',
    actor: record.owner,
    record
  });
  legacy.close();

  assert.throws(
    () => new SemanticMemoryIngestionGridStore({ path, dataDir, identity, protector }),
    /ingestion_intent_id/
  );
});
