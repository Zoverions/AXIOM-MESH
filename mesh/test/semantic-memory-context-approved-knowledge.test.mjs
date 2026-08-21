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
import { projectSemanticMemoryContext } from '../src/grid/semantic-memory-context-projection.mjs';
import { verifySemanticMemoryReviewFromGrid } from '../src/grid/semantic-memory-review-evidence.mjs';
import { GridStore } from '../src/grid/store.mjs';

test('Grid-verified approval of ordinary knowledge remains data rather than instruction', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-semantic-knowledge-'));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const store = new GridStore({
    path: join(dataDir, 'grid.sqlite'),
    dataDir,
    identity,
    protector
  });
  t.after(async () => {
    store.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  const base = normalizeSemanticMemoryProvenance({
    object_id: 'memory.reviewed.knowledge',
    owner: 'owner.alice',
    content_digest: sha256('external knowledge'),
    origin_class: 'retrieved-external',
    origin_artifact_digest: sha256('external knowledge receipt'),
    semantic_class: 'knowledge'
  });
  const reviewed = ownerReviewSemanticMemory(base, {
    actor_id: base.owner,
    review_request_digest: semanticMemoryReviewRequestDigest(base, 'approve-memory'),
    decision: 'approve-memory'
  });
  const reviewIntent = recordedSemanticMemoryReviewIntent(reviewed);
  const intentId = 'intent.review.reviewed-knowledge';
  const traceId = 'trace.review.reviewed-knowledge';
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

  const evidence = verifySemanticMemoryReviewFromGrid(store, reviewed);
  const projection = projectSemanticMemoryContext(reviewed, {
    review_evidence: evidence
  });

  assert.equal(projection.context_lane, 'memory-data');
  assert.equal(projection.model_treatment, 'quoted-reference-data');
  assert.equal(projection.instruction_semantics, false);
  assert.equal(projection.source_authority_tier, 'owner-memory');
  assert.equal(projection.may_authorize_tools, false);
  assert.equal(projection.may_modify_axiom_authority, false);
  assert.equal(projection.may_self_persist, false);
  assert.equal(projection.may_retransmit, false);
});
