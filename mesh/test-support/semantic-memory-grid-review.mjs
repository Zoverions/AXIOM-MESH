import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { digestObject } from '../src/lib/canonical.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { intentRequestDigest } from '../src/lib/intent-binding.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { recordedSemanticMemoryReviewIntent } from '../src/lib/semantic-memory-grid-evidence.mjs';
import { verifySemanticMemoryReviewFromGrid } from '../src/grid/semantic-memory-review-evidence.mjs';
import { GridStore } from '../src/grid/store.mjs';

// Test support: the only sanctioned way to obtain semantic-memory review
// evidence is a completed owner review in a real GridStore, read back by
// verifySemanticMemoryReviewFromGrid. These helpers do exactly that, so tests
// that need a genuine grant use genuine evidence (never a digest string).

export async function semanticMemoryGridStore(t, StoreClass = GridStore) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-semantic-review-'));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const store = new StoreClass({ path: join(dataDir, 'grid.sqlite'), dataDir, identity, protector });
  t.after(async () => {
    store.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  return store;
}

let reviewCounter = 0;

export function appendCompletedSemanticMemoryReview(store, record, intentId = `intent.semantic.review.${++reviewCounter}`) {
  const traceId = `trace.${intentId}`;
  const reviewIntent = recordedSemanticMemoryReviewIntent(record);
  store.appendEvents({
    traceId,
    actor: record.owner,
    events: [{
      kind: 'intent.accepted',
      subject: intentId,
      payload: {
        intent_id: intentId,
        principal: record.owner,
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
    actor: record.owner,
    events: [{
      kind: 'intent.completed',
      subject: intentId,
      payload: { intent_id: intentId, result: { intent_id: intentId, trace_id: traceId, status: 'completed' } }
    }]
  });
  return { intentId, traceId };
}

// Genuine Grid evidence for each record (one fresh store, one completed
// review per record), in the order given. The store is closed and removed
// before returning; the evidence objects stay genuine.
export async function semanticMemoryGridReviewEvidence(...records) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-semantic-review-'));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const store = new GridStore({ path: join(dataDir, 'grid.sqlite'), dataDir, identity, protector });
  try {
    return records.map(record => {
      appendCompletedSemanticMemoryReview(store, record);
      return verifySemanticMemoryReviewFromGrid(store, record);
    });
  } finally {
    store.close();
    await rm(dataDir, { recursive: true, force: true });
  }
}
