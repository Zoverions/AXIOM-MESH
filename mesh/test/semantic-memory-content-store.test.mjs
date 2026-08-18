import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { digestObject, sha256 } from '../src/lib/canonical.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { intentRequestDigest } from '../src/lib/intent-binding.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import {
  prepareSemanticMemoryContentMutation,
  semanticMemoryContentAddress
} from '../src/lib/semantic-memory-content.mjs';
import {
  bindSemanticMemoryIngestion,
  semanticMemoryIngestionInputDigest,
  semanticMemoryIngestionRequestDigest
} from '../src/lib/semantic-memory-ingestion.mjs';
import { recordedSemanticMemoryReviewIntent } from '../src/lib/semantic-memory-grid-evidence.mjs';
import {
  normalizeSemanticMemoryProvenance,
  ownerReviewSemanticMemory,
  semanticMemoryReviewRequestDigest
} from '../src/lib/semantic-memory-provenance.mjs';
import { SemanticMemoryContentGridStore } from '../src/grid/semantic-memory-content-store.mjs';
import { SEMANTIC_MEMORY_STATE_EVENT } from '../src/grid/semantic-memory-state-store.mjs';

let counter = 0;

async function storeFixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-semantic-content-'));
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
      // A test may close before a restart check.
    }
    await rm(dataDir, { recursive: true, force: true });
  });
  return { store, dataDir, identity, protector, path };
}

function id(prefix) {
  counter += 1;
  return `${prefix}.${counter}`;
}

function candidate({ text = 'model-generated semantic candidate', suffix = '1' } = {}) {
  const owner = 'owner.alice';
  const content = { text, format: 'plain-text' };
  const metadata = { source: 'provider.model.alpha', retained_for: 'semantic-review' };
  const address = semanticMemoryContentAddress({ owner, content, metadata });
  const provenance = normalizeSemanticMemoryProvenance({
    object_id: address.object_id,
    owner,
    content_digest: address.content_digest,
    origin_class: 'local-model-generated',
    origin_principal: 'provider.model.alpha',
    origin_runtime_id: `runtime.model.${suffix}`,
    origin_artifact_digest: sha256(`provider-receipt:${suffix}:${text}`),
    semantic_class: 'instruction-candidate'
  });
  return { owner, content, metadata, address, provenance };
}

function acceptIngestion(store, fixture, {
  intentId = id('intent.semantic.content'),
  traceId = id('trace.semantic.content'),
  invocationDigest = sha256(`invocation:${intentId}`),
  policyDigest = sha256(`policy:${intentId}`)
} = {}) {
  const requestDigest = semanticMemoryIngestionRequestDigest(fixture.provenance);
  store.appendEvents({
    traceId,
    actor: fixture.owner,
    events: [{
      kind: 'intent.accepted',
      subject: intentId,
      payload: {
        intent_id: intentId,
        principal: fixture.owner,
        principal_type: 'human',
        action: 'memory.semantic.ingest',
        risk: 'low',
        input_digest: semanticMemoryIngestionInputDigest(fixture.provenance),
        request_digest: requestDigest,
        policy_version: 'semantic-content-lab',
        policy_digest: policyDigest,
        invocation: { schema: 'test-invocation-envelope' },
        invocation_digest: invocationDigest
      }
    }]
  });
  return { intentId, traceId, requestDigest, invocationDigest, policyDigest };
}

function prepareCommit(fixture, accepted) {
  const prepared = prepareSemanticMemoryContentMutation({
    owner: fixture.owner,
    content: fixture.content,
    metadata: fixture.metadata,
    provenance: fixture.provenance
  }, {
    intent_id: accepted.intentId,
    request_digest: accepted.requestDigest
  });
  const completion = {
    kind: 'intent.completed',
    subject: accepted.intentId,
    payload: {
      intent_id: accepted.intentId,
      result: {
        ...structuredClone(prepared.output),
        intent_id: accepted.intentId,
        trace_id: accepted.traceId,
        status: 'completed',
        evidence: {
          plan_digest: sha256(`plan:${accepted.intentId}`),
          invocation_digest: accepted.invocationDigest,
          execution_digest: sha256(`execution:${accepted.intentId}`),
          policy_digest: accepted.policyDigest
        }
      }
    }
  };
  return { prepared, completion };
}

function persistCandidate(store, fixture) {
  const accepted = acceptIngestion(store, fixture);
  const { prepared, completion } = prepareCommit(fixture, accepted);
  store.appendEvents({
    traceId: accepted.traceId,
    actor: fixture.owner,
    events: [prepared.mutation, completion]
  });
  return { accepted, prepared };
}

function appendCompletedReviewIntent(store, reviewedRecord) {
  const reviewIntent = recordedSemanticMemoryReviewIntent(reviewedRecord);
  const intentId = id('intent.semantic.review');
  const traceId = id('trace.semantic.review');
  store.appendEvents({
    traceId,
    actor: reviewedRecord.owner,
    events: [{
      kind: 'intent.accepted',
      subject: intentId,
      payload: {
        intent_id: intentId,
        principal: reviewedRecord.owner,
        principal_type: 'human',
        action: reviewIntent.action,
        risk: 'low',
        input_digest: digestObject(reviewIntent.input),
        request_digest: intentRequestDigest(reviewIntent)
      }
    }]
  });
  store.appendEvents({
    traceId,
    actor: reviewedRecord.owner,
    events: [{
      kind: 'intent.completed',
      subject: intentId,
      payload: {
        intent_id: intentId,
        result: { intent_id: intentId, trace_id: traceId, status: 'completed' }
      }
    }]
  });
}

test('one signed semantic memory.put atomically materializes encrypted content and A7 provenance', async t => {
  const { store, dataDir, identity, protector, path } = await storeFixture(t);
  const fixture = candidate();
  const { prepared } = persistCandidate(store, fixture);
  const record = prepared.mutation.payload.semantic_provenance;

  const memoryRow = store.db.prepare(`
    SELECT owner, kind, content_digest, payload_json, status
    FROM memory_objects WHERE object_id = ?
  `).get(record.object_id);
  assert.equal(memoryRow.owner, fixture.owner);
  assert.equal(memoryRow.kind, 'semantic.memory');
  assert.equal(memoryRow.content_digest, record.content_digest);
  assert.equal(memoryRow.status, 'active');
  assert.equal(store.protector.isProtected(memoryRow.payload_json), true);

  const current = store.getCurrentSemanticMemoryProvenance(
    fixture.owner,
    record.object_id
  );
  assert.equal(current.provenance_digest, record.provenance_digest);
  const source = store.db.prepare(`
    SELECT kind FROM events WHERE event_id = ?
  `).get(current.current_state_event_id);
  assert.equal(source.kind, 'memory.put');
  assert.equal(store.verifySemanticMemoryContentHistory().semantic_objects, 1);

  store.close();
  const reopened = new SemanticMemoryContentGridStore({
    path,
    dataDir,
    identity,
    protector
  });
  try {
    const reopenedCurrent = reopened.getCurrentSemanticMemoryProvenance(
      fixture.owner,
      record.object_id
    );
    assert.equal(reopenedCurrent.provenance_digest, record.provenance_digest);
    assert.equal(reopened.verifySemanticMemoryContentHistory().valid, true);
  } finally {
    reopened.close();
  }
});

test('semantic.memory without same-event provenance fails before durable content mutation', async t => {
  const { store } = await storeFixture(t);
  const fixture = candidate({ suffix: 'missing-provenance' });
  assert.throws(
    () => store.appendEvents({
      traceId: id('trace.semantic.missing-provenance'),
      actor: fixture.owner,
      events: [{
        kind: 'memory.put',
        subject: fixture.address.object_id,
        payload: {
          object_id: fixture.address.object_id,
          owner: fixture.owner,
          kind: 'semantic.memory',
          content: fixture.content,
          metadata: fixture.metadata,
          content_digest: fixture.address.content_digest
        }
      }]
    }),
    /requires semantic_provenance/
  );
  assert.equal(
    store.db.prepare('SELECT 1 FROM memory_objects WHERE object_id = ?')
      .get(fixture.address.object_id),
    undefined
  );
});

test('semantic provenance cannot be attached to an ordinary memory.put kind', async t => {
  const { store } = await storeFixture(t);
  const fixture = candidate({ suffix: 'ordinary-launder' });
  const owner = fixture.owner;
  const content = { text: 'ordinary note' };
  const metadata = {};
  const digest = digestObject({ owner, kind: 'note', content, metadata });
  assert.throws(
    () => store.appendEvents({
      traceId: id('trace.semantic.ordinary-launder'),
      actor: owner,
      events: [{
        kind: 'memory.put',
        subject: `memory_${digest}`,
        payload: {
          object_id: `memory_${digest}`,
          owner,
          kind: 'note',
          content,
          metadata,
          content_digest: digest,
          semantic_provenance: fixture.provenance
        }
      }]
    }),
    /kind is invalid|allowed only on semantic.memory/
  );
});

test('provenance-only initial state is rejected even when ingestion request binding is valid', async t => {
  const { store } = await storeFixture(t);
  const fixture = candidate({ suffix: 'provenance-only' });
  const requestDigest = semanticMemoryIngestionRequestDigest(fixture.provenance);
  const bound = bindSemanticMemoryIngestion(fixture.provenance, {
    intent_id: 'intent.semantic.provenance-only',
    request_digest: requestDigest
  });
  assert.throws(
    () => store.appendEvents({
      traceId: id('trace.semantic.provenance-only'),
      actor: fixture.owner,
      events: [{
        kind: SEMANTIC_MEMORY_STATE_EVENT,
        subject: bound.object_id,
        payload: { record: bound }
      }]
    }),
    /Initial semantic memory provenance must be carried by the same signed semantic memory.put/
  );
});

test('pre-existing semantic content cannot acquire provenance after the fact', async t => {
  const { store } = await storeFixture(t);
  const fixture = candidate({ suffix: 'preexisting' });
  store.db.prepare(`
    INSERT INTO memory_objects(
      object_id, owner, kind, content_digest, payload_json, status, created_at
    ) VALUES (?, ?, ?, ?, ?, 'active', ?)
  `).run(
    fixture.address.object_id,
    fixture.owner,
    'semantic.memory',
    fixture.address.content_digest,
    store.protectJson(
      'memory_objects',
      'payload_json',
      fixture.address.object_id,
      { content: fixture.content, metadata: fixture.metadata }
    ),
    new Date().toISOString()
  );
  const accepted = acceptIngestion(store, fixture);
  const { prepared, completion } = prepareCommit(fixture, accepted);

  assert.throws(
    () => store.appendEvents({
      traceId: accepted.traceId,
      actor: fixture.owner,
      events: [prepared.mutation, completion]
    }),
    error => error?.code === 'semantic_memory_content_preexists'
  );
});

test('tampered semantic content completion result rolls back before memory object persistence', async t => {
  const { store } = await storeFixture(t);
  const fixture = candidate({ suffix: 'completion-tamper' });
  const accepted = acceptIngestion(store, fixture);
  const { prepared, completion } = prepareCommit(fixture, accepted);
  completion.payload.result.semantic_memory_content.provenance_digest = sha256('wrong provenance');

  assert.throws(
    () => store.appendEvents({
      traceId: accepted.traceId,
      actor: fixture.owner,
      events: [prepared.mutation, completion]
    }),
    /completion result does not match/
  );
  assert.equal(
    store.db.prepare('SELECT 1 FROM memory_objects WHERE object_id = ?')
      .get(fixture.address.object_id),
    undefined
  );
});

test('tombstoned semantic content immediately stops qualifying as current context', async t => {
  const { store } = await storeFixture(t);
  const fixture = candidate({ suffix: 'tombstone' });
  const { prepared } = persistCandidate(store, fixture);
  const record = prepared.mutation.payload.semantic_provenance;

  store.appendEvents({
    traceId: id('trace.semantic.tombstone'),
    actor: fixture.owner,
    events: [{
      kind: 'memory.tombstoned',
      subject: record.object_id,
      payload: { object_id: record.object_id, owner: fixture.owner }
    }]
  });

  assert.throws(
    () => store.getCurrentSemanticMemoryProvenance(fixture.owner, record.object_id),
    error => error?.code === 'semantic_memory_content_inactive'
  );
  assert.equal(store.verifySemanticMemoryContentHistory().valid, true);
});

test('full materialized rebuild reconstructs both memory bytes and provenance from the same signed event', async t => {
  const { store } = await storeFixture(t);
  const fixture = candidate({ suffix: 'rebuild' });
  const { prepared } = persistCandidate(store, fixture);
  const record = prepared.mutation.payload.semantic_provenance;

  store.rebuildMaterializedState();

  const memoryRow = store.db.prepare(`
    SELECT kind, content_digest, status FROM memory_objects WHERE object_id = ?
  `).get(record.object_id);
  assert.equal(memoryRow.kind, 'semantic.memory');
  assert.equal(memoryRow.content_digest, record.content_digest);
  assert.equal(memoryRow.status, 'active');
  const current = store.getCurrentSemanticMemoryProvenance(
    fixture.owner,
    record.object_id
  );
  assert.equal(current.provenance_digest, record.provenance_digest);
});

test('later owner review can update provenance while remaining bound to the same active memory bytes', async t => {
  const { store } = await storeFixture(t);
  const fixture = candidate({ suffix: 'review' });
  const { prepared } = persistCandidate(store, fixture);
  const current = prepared.mutation.payload.semantic_provenance;
  const reviewed = ownerReviewSemanticMemory(current, {
    actor_id: current.owner,
    review_request_digest: semanticMemoryReviewRequestDigest(
      current,
      'approve-instruction'
    ),
    decision: 'approve-instruction'
  });
  appendCompletedReviewIntent(store, reviewed);
  store.appendEvents({
    traceId: id('trace.semantic.review-state'),
    actor: reviewed.owner,
    events: [{
      kind: SEMANTIC_MEMORY_STATE_EVENT,
      subject: reviewed.object_id,
      payload: { record: reviewed }
    }]
  });

  const latest = store.getCurrentSemanticMemoryProvenance(
    reviewed.owner,
    reviewed.object_id
  );
  assert.equal(latest.provenance_digest, reviewed.provenance_digest);
  assert.equal(latest.authority_tier, 'owner-approved-instruction');
  assert.equal(latest.content_digest, current.content_digest);
  const source = store.db.prepare('SELECT kind FROM events WHERE event_id = ?')
    .get(latest.current_state_event_id);
  assert.equal(source.kind, SEMANTIC_MEMORY_STATE_EVENT);
});
