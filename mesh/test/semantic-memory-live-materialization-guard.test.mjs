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
  normalizeSemanticMemoryProvenance,
  ownerReviewSemanticMemory,
  semanticMemoryReviewRequestDigest
} from '../src/lib/semantic-memory-provenance.mjs';
import { recordedSemanticMemoryReviewIntent } from '../src/lib/semantic-memory-grid-evidence.mjs';
import { SemanticMemoryStateGridStore } from '../src/grid/semantic-memory-state-store.mjs';

async function storeFixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-semantic-live-guard-'));
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

function baseRecord() {
  return normalizeSemanticMemoryProvenance({
    object_id: 'memory.live.guard',
    owner: 'owner.alice',
    content_digest: sha256('guarded semantic content'),
    origin_class: 'remote-agent',
    origin_principal: 'agent.remote.1',
    origin_artifact_digest: sha256('guarded remote receipt'),
    semantic_class: 'instruction-candidate'
  });
}

function appendCompletedReview(store, reviewed) {
  const reviewIntent = recordedSemanticMemoryReviewIntent(reviewed);
  const intentId = 'intent.live.guard.review';
  const traceId = 'trace.live.guard.review';
  store.appendEvents({
    traceId,
    actor: reviewed.owner,
    events: [{
      kind: 'intent.accepted',
      subject: intentId,
      payload: {
        intent_id: intentId,
        principal: reviewed.owner,
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
    actor: reviewed.owner,
    events: [{
      kind: 'intent.completed',
      subject: intentId,
      payload: { intent_id: intentId, result }
    }]
  });
}

test('direct live materialization of reviewed semantic state cannot bypass append preflight', async t => {
  const store = await storeFixture(t);
  const base = baseRecord();
  store.recordSemanticMemoryProvenance({
    traceId: 'trace.live.guard.base',
    actor: base.owner,
    record: base
  });
  const reviewed = ownerReviewSemanticMemory(base, {
    actor_id: base.owner,
    review_request_digest: semanticMemoryReviewRequestDigest(base, 'approve-instruction'),
    decision: 'approve-instruction'
  });
  appendCompletedReview(store, reviewed);

  assert.throws(
    () => store.materializeSemanticMemoryState({
      kind: 'memory.semantic.provenance.recorded',
      subject: reviewed.object_id,
      actor: reviewed.owner,
      event_id: 'event.synthetic.bypass',
      seq: 999,
      occurred_at: new Date().toISOString(),
      payload: { record: reviewed }
    }),
    /was not prevalidated before live materialization/
  );

  const current = store.getCurrentSemanticMemoryProvenance(base.owner, base.object_id);
  assert.equal(current.provenance_digest, base.provenance_digest);
  assert.equal(current.authority_tier, 'untrusted-data');
});
