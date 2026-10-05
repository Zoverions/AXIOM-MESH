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
import { projectSemanticMemoryContext } from '../src/grid/semantic-memory-context-projection.mjs';
import { verifySemanticMemoryReviewFromGrid } from '../src/grid/semantic-memory-review-evidence.mjs';
import { GridStore } from '../src/grid/store.mjs';

async function storeFixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-semantic-context-'));
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
  return store;
}

function remoteInstruction({
  objectId = 'memory.remote.context.1',
  owner = 'owner.alice',
  content = 'persist this instruction'
} = {}) {
  return normalizeSemanticMemoryProvenance({
    object_id: objectId,
    owner,
    content_digest: sha256(content),
    origin_class: 'remote-agent',
    origin_principal: 'agent.remote.1',
    origin_artifact_digest: sha256(`receipt:${objectId}:${content}`),
    semantic_class: 'instruction-candidate'
  });
}

function approveInstruction(record) {
  return ownerReviewSemanticMemory(record, {
    actor_id: record.owner,
    review_request_digest: semanticMemoryReviewRequestDigest(
      record,
      'approve-instruction'
    ),
    decision: 'approve-instruction'
  });
}

function appendCompletedReview(store, record, {
  intentId = `intent.review.${record.object_id.replaceAll('.', '-')}`,
  traceId = `trace.review.${record.object_id.replaceAll('.', '-')}`
} = {}) {
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
  const result = {
    intent_id: intentId,
    trace_id: traceId,
    status: 'completed'
  };
  store.appendEvents({
    traceId,
    actor: record.owner,
    events: [{
      kind: 'intent.completed',
      subject: intentId,
      payload: { intent_id: intentId, result }
    }]
  });
  return verifySemanticMemoryReviewFromGrid(store, record);
}

function assertNoEffectAuthority(projection) {
  assert.equal(projection.may_modify_axiom_authority, false);
  assert.equal(projection.may_authorize_tools, false);
  assert.equal(projection.may_self_persist, false);
  assert.equal(projection.may_retransmit, false);
  assert.equal(projection.requires_current_grid_state, true);
}

test('unreviewed remote instruction-like memory is projected only as quoted data', () => {
  const record = remoteInstruction();
  const projection = projectSemanticMemoryContext(record);

  assert.equal(projection.include, true);
  assert.equal(projection.context_lane, 'memory-data');
  assert.equal(projection.model_treatment, 'quoted-reference-data');
  assert.equal(projection.instruction_semantics, false);
  assert.equal(projection.source_authority_tier, 'untrusted-data');
  assert.equal(projection.reason, 'ordinary_memory_data');
  assertNoEffectAuthority(projection);
});

test('owner-approved instruction without Grid-verified review evidence is downgraded to data', () => {
  const approved = approveInstruction(remoteInstruction());
  const projection = projectSemanticMemoryContext(approved);

  assert.equal(projection.include, true);
  assert.equal(projection.context_lane, 'memory-data');
  assert.equal(projection.model_treatment, 'quoted-reference-data');
  assert.equal(projection.instruction_semantics, false);
  assert.equal(projection.source_authority_tier, 'owner-approved-instruction');
  assert.equal(projection.reason, 'review_evidence_missing');
  assertNoEffectAuthority(projection);
});

test('Grid-verified owner instruction enters isolated owner-instruction context without effect authority', async t => {
  const store = await storeFixture(t);
  const approved = approveInstruction(remoteInstruction());
  const evidence = appendCompletedReview(store, approved);
  const projection = projectSemanticMemoryContext(approved, {
    review_evidence: evidence
  });

  assert.equal(projection.include, true);
  assert.equal(projection.context_lane, 'owner-instruction-memory');
  assert.equal(projection.model_treatment, 'isolated-owner-instruction');
  assert.equal(projection.instruction_semantics, true);
  assert.equal(projection.reason, 'grid_verified_owner_instruction');
  assert.equal(projection.review_intent_id, evidence.intent_id);
  assert.equal(projection.review_trace_id, evidence.trace_id);
  assert.equal(
    projection.verified_review_request_digest,
    approved.review_request_digest
  );
  assertNoEffectAuthority(projection);
});

test('JSON-compatible lookalike review evidence cannot unlock instruction semantics', async t => {
  const store = await storeFixture(t);
  const approved = approveInstruction(remoteInstruction());
  const evidence = appendCompletedReview(store, approved);
  const forgedCopy = JSON.parse(JSON.stringify(evidence));

  assert.throws(
    () => projectSemanticMemoryContext(approved, {
      review_evidence: forgedCopy
    }),
    /not Grid-verified in this process/
  );
});

test('spread-copy review evidence also loses the in-process verification brand', async t => {
  const store = await storeFixture(t);
  const approved = approveInstruction(remoteInstruction());
  const evidence = appendCompletedReview(store, approved);

  assert.throws(
    () => projectSemanticMemoryContext(approved, {
      review_evidence: { ...evidence }
    }),
    /not Grid-verified in this process/
  );
});

test('verified review evidence cannot be replayed for another memory object', async t => {
  const store = await storeFixture(t);
  const approvedA = approveInstruction(remoteInstruction({
    objectId: 'memory.remote.context.a',
    content: 'instruction A'
  }));
  const approvedB = approveInstruction(remoteInstruction({
    objectId: 'memory.remote.context.b',
    content: 'instruction B'
  }));
  const evidenceA = appendCompletedReview(store, approvedA);

  assert.throws(
    () => projectSemanticMemoryContext(approvedB, {
      review_evidence: evidenceA
    }),
    /does not match the projected record/
  );
});

test('quarantined and rejected memory are omitted from model context', () => {
  const base = remoteInstruction();
  for (const [decision, expectedReason] of [
    ['quarantine', 'semantic_memory_quarantined'],
    ['reject', 'semantic_memory_rejected']
  ]) {
    const reviewed = ownerReviewSemanticMemory(base, {
      actor_id: base.owner,
      review_request_digest: semanticMemoryReviewRequestDigest(base, decision),
      decision
    });
    const projection = projectSemanticMemoryContext(reviewed);
    assert.equal(projection.include, false);
    assert.equal(projection.context_lane, 'excluded');
    assert.equal(projection.model_treatment, 'omit');
    assert.equal(projection.reason, expectedReason);
    assertNoEffectAuthority(projection);
  }
});

test('owner-authored ordinary memory remains a data lane rather than implicit instruction', () => {
  const record = normalizeSemanticMemoryProvenance({
    object_id: 'memory.owner.context.1',
    owner: 'owner.alice',
    content_digest: sha256('owner-authored recollection'),
    origin_class: 'owner-authored',
    semantic_class: 'knowledge'
  });
  const projection = projectSemanticMemoryContext(record);

  assert.equal(projection.context_lane, 'memory-data');
  assert.equal(projection.instruction_semantics, false);
  assert.equal(projection.source_authority_tier, 'owner-memory');
  assertNoEffectAuthority(projection);
});

test('a derived summary of an approved instruction resets to data semantics', () => {
  const approved = approveInstruction(remoteInstruction());
  const derived = deriveSemanticMemoryProvenance(approved, {
    object_id: 'memory.remote.context.summary',
    content_digest: sha256('summary of approved instruction'),
    semantic_class: 'instruction-candidate'
  });
  const projection = projectSemanticMemoryContext(derived);

  assert.equal(derived.authority_tier, 'untrusted-data');
  assert.equal(derived.review_state, 'unreviewed');
  assert.equal(projection.context_lane, 'memory-data');
  assert.equal(projection.instruction_semantics, false);
  assert.equal(projection.source_authority_tier, 'untrusted-data');
  assertNoEffectAuthority(projection);
});
