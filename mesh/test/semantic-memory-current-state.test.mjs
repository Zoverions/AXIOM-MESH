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
  deriveSemanticMemoryProvenance,
  normalizeSemanticMemoryProvenance,
  ownerReviewSemanticMemory,
  semanticMemoryReviewRequestDigest
} from '../src/lib/semantic-memory-provenance.mjs';
import { recordedSemanticMemoryReviewIntent } from '../src/lib/semantic-memory-grid-evidence.mjs';
import { projectCurrentSemanticMemoryContext } from '../src/grid/semantic-memory-current-context.mjs';
import {
  SEMANTIC_MEMORY_STATE_EVENT,
  SemanticMemoryStateGridStore
} from '../src/grid/semantic-memory-state-store.mjs';

let sequence = 0;

async function storeFixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-semantic-current-'));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const store = new SemanticMemoryStateGridStore({
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

function remoteInstruction({
  objectId = 'memory.current.remote.1',
  content = 'remote instruction candidate'
} = {}) {
  return normalizeSemanticMemoryProvenance({
    object_id: objectId,
    owner: 'owner.alice',
    content_digest: sha256(content),
    origin_class: 'remote-agent',
    origin_principal: 'agent.remote.1',
    origin_artifact_digest: sha256(`receipt:${objectId}:${content}`),
    semantic_class: 'instruction-candidate'
  });
}

function trace(prefix) {
  sequence += 1;
  return `${prefix}.${sequence}`;
}

function recordState(store, record) {
  return store.recordSemanticMemoryProvenance({
    traceId: trace('trace.semantic.state'),
    actor: record.owner,
    record
  });
}

function review(record, decision) {
  return ownerReviewSemanticMemory(record, {
    actor_id: record.owner,
    review_request_digest: semanticMemoryReviewRequestDigest(record, decision),
    decision
  });
}

function appendCompletedReviewIntent(store, reviewedRecord) {
  const reviewIntent = recordedSemanticMemoryReviewIntent(reviewedRecord);
  const intentId = trace('intent.semantic.review');
  const traceId = trace('trace.semantic.review');
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
  const result = { intent_id: intentId, trace_id: traceId, status: 'completed' };
  store.appendEvents({
    traceId,
    actor: reviewedRecord.owner,
    events: [{
      kind: 'intent.completed',
      subject: intentId,
      payload: { intent_id: intentId, result }
    }]
  });
  return { intentId, traceId };
}

function authorizeAndRecordReview(store, current, decision) {
  const reviewed = review(current, decision);
  appendCompletedReviewIntent(store, reviewed);
  recordState(store, reviewed);
  return reviewed;
}

test('unreviewed semantic state is signed, protected, current, and projects only as data', async t => {
  const store = await storeFixture(t);
  const base = remoteInstruction();
  recordState(store, base);

  const current = store.getCurrentSemanticMemoryProvenance(base.owner, base.object_id);
  assert.equal(current.provenance_digest, base.provenance_digest);
  assert.equal(current.authority_tier, 'untrusted-data');

  const row = store.db.prepare(`
    SELECT record_json, source_event_id, source_seq
    FROM semantic_memory_provenance_state WHERE object_id = ?
  `).get(base.object_id);
  assert.equal(store.protector.isProtected(row.record_json), true);
  assert.equal(typeof row.source_event_id, 'string');
  assert.equal(Number.isSafeInteger(row.source_seq), true);

  const projection = projectCurrentSemanticMemoryContext(store, base);
  assert.equal(projection.current_grid_state_verified, true);
  assert.equal(projection.requires_current_grid_state, false);
  assert.equal(projection.context_lane, 'memory-data');
  assert.equal(projection.instruction_semantics, false);
  assert.equal(projection.downstream_effect_authorized, false);
});

test('reviewed instruction becomes instruction-eligible only after predecessor, completed review, and state recording', async t => {
  const store = await storeFixture(t);
  const base = remoteInstruction();
  recordState(store, base);
  const approved = review(base, 'approve-instruction');

  assert.throws(
    () => recordState(store, approved),
    error => error?.code === 'semantic_memory_review_evidence_not_found'
  );

  appendCompletedReviewIntent(store, approved);
  recordState(store, approved);
  const projection = projectCurrentSemanticMemoryContext(store, approved);
  assert.equal(projection.context_lane, 'owner-instruction-memory');
  assert.equal(projection.instruction_semantics, true);
  assert.equal(projection.current_grid_state_verified, true);
  assert.equal(projection.downstream_effect_authorized, false);
  assert.equal(projection.may_authorize_tools, false);
  assert.equal(projection.may_self_persist, false);
  assert.equal(projection.may_retransmit, false);
});

test('stale approved snapshot stops qualifying immediately after later quarantine', async t => {
  const store = await storeFixture(t);
  const base = remoteInstruction();
  recordState(store, base);
  const approved = authorizeAndRecordReview(store, base, 'approve-instruction');
  assert.equal(
    projectCurrentSemanticMemoryContext(store, approved).context_lane,
    'owner-instruction-memory'
  );

  const quarantined = authorizeAndRecordReview(store, approved, 'quarantine');
  assert.throws(
    () => projectCurrentSemanticMemoryContext(store, approved),
    error => error?.code === 'semantic_memory_state_stale'
  );

  const currentProjection = projectCurrentSemanticMemoryContext(store, quarantined);
  assert.equal(currentProjection.include, false);
  assert.equal(currentProjection.context_lane, 'excluded');
  assert.equal(currentProjection.reason, 'semantic_memory_quarantined');
});

test('a reviewed state cannot be introduced without its exact predecessor', async t => {
  const store = await storeFixture(t);
  const base = remoteInstruction();
  const approved = review(base, 'approve-instruction');
  appendCompletedReviewIntent(store, approved);

  assert.throws(
    () => recordState(store, approved),
    /requires its exact predecessor/
  );
});

test('review branch replay loses to the actual current predecessor', async t => {
  const store = await storeFixture(t);
  const base = remoteInstruction();
  recordState(store, base);

  const instructionBranch = review(base, 'approve-instruction');
  appendCompletedReviewIntent(store, instructionBranch);
  const memoryBranch = authorizeAndRecordReview(store, base, 'approve-memory');
  assert.equal(memoryBranch.authority_tier, 'owner-memory');

  assert.throws(
    () => recordState(store, instructionBranch),
    error => error?.code === 'semantic_memory_state_predecessor_mismatch'
  );
});

test('existing object content and origin cannot be rewritten outside a review transition', async t => {
  const store = await storeFixture(t);
  const base = remoteInstruction();
  recordState(store, base);
  const replacement = remoteInstruction({
    objectId: base.object_id,
    content: 'different content under same object id'
  });

  assert.throws(
    () => recordState(store, replacement),
    /may change only through an explicit review transition/
  );
});

test('derived child and grandchild are invalidated when an ancestor provenance changes', async t => {
  const store = await storeFixture(t);
  const parent = remoteInstruction({ objectId: 'memory.current.parent' });
  recordState(store, parent);

  const child = deriveSemanticMemoryProvenance(parent, {
    object_id: 'memory.current.child',
    content_digest: sha256('child summary'),
    semantic_class: 'knowledge'
  });
  recordState(store, child);
  const grandchild = deriveSemanticMemoryProvenance(child, {
    object_id: 'memory.current.grandchild',
    content_digest: sha256('grandchild summary'),
    semantic_class: 'knowledge'
  });
  recordState(store, grandchild);

  assert.equal(projectCurrentSemanticMemoryContext(store, child).context_lane, 'memory-data');
  assert.equal(projectCurrentSemanticMemoryContext(store, grandchild).context_lane, 'memory-data');

  authorizeAndRecordReview(store, parent, 'quarantine');

  assert.throws(
    () => projectCurrentSemanticMemoryContext(store, child),
    error => error?.code === 'semantic_memory_parent_state_stale'
  );
  assert.throws(
    () => projectCurrentSemanticMemoryContext(store, grandchild),
    error => error?.code === 'semantic_memory_parent_state_stale'
  );
});

test('new derivation from a stale parent snapshot is rejected at record time', async t => {
  const store = await storeFixture(t);
  const parent = remoteInstruction({ objectId: 'memory.current.stale-parent' });
  recordState(store, parent);
  authorizeAndRecordReview(store, parent, 'quarantine');

  const staleChild = deriveSemanticMemoryProvenance(parent, {
    object_id: 'memory.current.stale-child',
    content_digest: sha256('stale child'),
    semantic_class: 'knowledge'
  });
  assert.throws(
    () => recordState(store, staleChild),
    error => error?.code === 'semantic_memory_parent_state_stale'
  );
});

test('materialized state tampering is detected against the signed source event', async t => {
  const store = await storeFixture(t);
  const base = remoteInstruction();
  recordState(store, base);
  store.db.prepare(`
    UPDATE semantic_memory_provenance_state
    SET provenance_digest = ? WHERE object_id = ?
  `).run('0'.repeat(64), base.object_id);

  assert.throws(
    () => store.getCurrentSemanticMemoryProvenance(base.owner, base.object_id),
    /materialized current state is inconsistent/
  );
});

test('signed event-chain corruption prevents current-state evidence issuance', async t => {
  const store = await storeFixture(t);
  const base = remoteInstruction();
  recordState(store, base);
  store.db.prepare('UPDATE events SET event_hash = ? WHERE seq = 1').run('0'.repeat(64));

  assert.throws(
    () => store.verifySemanticMemoryCurrentState(base),
    error => error?.code === 'integrity_verification_failed'
  );
});

test('semantic materialized current state rebuilds from signed events', async t => {
  const store = await storeFixture(t);
  const base = remoteInstruction();
  recordState(store, base);
  const approved = authorizeAndRecordReview(store, base, 'approve-instruction');

  store.db.exec('DELETE FROM semantic_memory_provenance_state');
  store.rebuildSemanticMemoryState();

  const current = store.getCurrentSemanticMemoryProvenance(
    approved.owner,
    approved.object_id
  );
  assert.equal(current.provenance_digest, approved.provenance_digest);
  assert.equal(current.authority_tier, 'owner-approved-instruction');
});

test('state event actor and subject are bound to the semantic owner/object', async t => {
  const store = await storeFixture(t);
  const base = remoteInstruction();

  assert.throws(
    () => store.appendEvents({
      traceId: trace('trace.bad.actor'),
      actor: 'owner.mallory',
      events: [{
        kind: SEMANTIC_MEMORY_STATE_EVENT,
        subject: base.object_id,
        payload: { record: base }
      }]
    }),
    /actor must equal record owner/
  );

  assert.throws(
    () => store.appendEvents({
      traceId: trace('trace.bad.subject'),
      actor: base.owner,
      events: [{
        kind: SEMANTIC_MEMORY_STATE_EVENT,
        subject: 'memory.other',
        payload: { record: base }
      }]
    }),
    /subject must equal record object_id/
  );
});

test('one append cannot smuggle two transitions for the same semantic object', async t => {
  const store = await storeFixture(t);
  const base = remoteInstruction();
  assert.throws(
    () => store.appendEvents({
      traceId: trace('trace.double.state'),
      actor: base.owner,
      events: [
        {
          kind: SEMANTIC_MEMORY_STATE_EVENT,
          subject: base.object_id,
          payload: { record: base }
        },
        {
          kind: SEMANTIC_MEMORY_STATE_EVENT,
          subject: base.object_id,
          payload: { record: base }
        }
      ]
    }),
    /at most one semantic memory state event per object/
  );
});
