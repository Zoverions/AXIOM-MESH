import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deriveSemanticMemoryProvenance,
  evaluateSemanticMemoryUse,
  normalizeSemanticMemoryProvenance,
  ownerReviewSemanticMemory
} from '../src/lib/semantic-memory-provenance.mjs';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);
const D = 'd'.repeat(64);

function remoteInstruction(overrides = {}) {
  return {
    object_id: 'memory.remote.1',
    owner: 'owner.alice',
    content_digest: A,
    origin_class: 'remote-agent',
    origin_principal: 'agent.remote.1',
    semantic_class: 'instruction-candidate',
    ...overrides
  };
}

test('owner-authored ordinary memory defaults to owner memory without gaining system authority', () => {
  const record = normalizeSemanticMemoryProvenance({
    object_id: 'memory.owner.1',
    owner: 'owner.alice',
    content_digest: A,
    origin_class: 'owner-authored',
    semantic_class: 'knowledge'
  });

  assert.equal(record.authority_tier, 'owner-memory');
  assert.equal(record.review_state, 'owner-reviewed');
  assert.equal(record.origin_principal, 'owner.alice');
  assert.equal(record.may_affect_authority, false);
  assert.equal(evaluateSemanticMemoryUse(record, 'ordinary-retrieval').allow, true);
  assert.deepEqual(evaluateSemanticMemoryUse(record, 'authority-mutation'), {
    allow: false,
    code: 'semantic_memory_cannot_mutate_authority'
  });
});

test('remote instruction-like content enters as untrusted unreviewed data', () => {
  const record = normalizeSemanticMemoryProvenance(remoteInstruction());
  assert.equal(record.authority_tier, 'untrusted-data');
  assert.equal(record.review_state, 'unreviewed');
  assert.equal(evaluateSemanticMemoryUse(record, 'ordinary-retrieval').allow, true);
  assert.deepEqual(evaluateSemanticMemoryUse(record, 'privileged-instruction'), {
    allow: false,
    code: 'semantic_memory_instruction_denied'
  });
});

test('external memory cannot self-promote instruction authority', () => {
  assert.throws(
    () => normalizeSemanticMemoryProvenance(remoteInstruction({
      authority_tier: 'owner-approved-instruction',
      review_state: 'owner-reviewed'
    })),
    /cannot self-promote authority|requires explicit owner review evidence/
  );
});

test('only the owner can explicitly approve an instruction candidate', () => {
  const record = normalizeSemanticMemoryProvenance(remoteInstruction());
  assert.throws(
    () => ownerReviewSemanticMemory(record, {
      actor_id: 'agent.remote.1',
      review_event_digest: B,
      decision: 'approve-instruction'
    }),
    /Only the memory owner/
  );

  const approved = ownerReviewSemanticMemory(record, {
    actor_id: 'owner.alice',
    review_event_digest: B,
    decision: 'approve-instruction'
  });
  assert.equal(approved.authority_tier, 'owner-approved-instruction');
  assert.equal(approved.review_state, 'owner-reviewed');
  assert.equal(approved.review_actor, 'owner.alice');
  assert.equal(evaluateSemanticMemoryUse(approved, 'privileged-instruction').allow, true);
});

test('ordinary knowledge cannot be promoted directly to instruction authority', () => {
  const record = normalizeSemanticMemoryProvenance({
    object_id: 'memory.remote.knowledge',
    owner: 'owner.alice',
    content_digest: A,
    origin_class: 'retrieved-external',
    origin_artifact_digest: B,
    semantic_class: 'knowledge'
  });
  assert.throws(
    () => ownerReviewSemanticMemory(record, {
      actor_id: 'owner.alice',
      review_event_digest: C,
      decision: 'approve-instruction'
    }),
    /Only instruction-candidate/
  );
});

test('owner review can adopt external content as ordinary owner memory without instruction authority', () => {
  const record = normalizeSemanticMemoryProvenance({
    object_id: 'memory.external.note',
    owner: 'owner.alice',
    content_digest: A,
    origin_class: 'retrieved-external',
    origin_artifact_digest: B,
    semantic_class: 'knowledge'
  });
  const approved = ownerReviewSemanticMemory(record, {
    actor_id: 'owner.alice',
    review_event_digest: C,
    decision: 'approve-memory'
  });
  assert.equal(approved.authority_tier, 'owner-memory');
  assert.equal(approved.review_state, 'owner-reviewed');
  assert.equal(evaluateSemanticMemoryUse(approved, 'ordinary-retrieval').allow, true);
  assert.equal(evaluateSemanticMemoryUse(approved, 'privileged-instruction').allow, false);
});

test('derived summaries retain parent provenance and do not inherit instruction authority', () => {
  const approved = ownerReviewSemanticMemory(
    normalizeSemanticMemoryProvenance(remoteInstruction()),
    {
      actor_id: 'owner.alice',
      review_event_digest: B,
      decision: 'approve-instruction'
    }
  );

  const derived = deriveSemanticMemoryProvenance(approved, {
    object_id: 'memory.summary.1',
    content_digest: C,
    semantic_class: 'instruction-candidate'
  });

  assert.equal(derived.origin_class, 'system-derived');
  assert.equal(derived.origin_artifact_digest, approved.content_digest);
  assert.equal(derived.parent_object_id, approved.object_id);
  assert.equal(derived.parent_content_digest, approved.content_digest);
  assert.equal(derived.authority_tier, 'untrusted-data');
  assert.equal(derived.review_state, 'unreviewed');
  assert.equal(evaluateSemanticMemoryUse(derived, 'privileged-instruction').allow, false);
});

test('quarantine and rejection narrow authority and suppress retrieval', () => {
  const base = normalizeSemanticMemoryProvenance(remoteInstruction());
  const quarantined = ownerReviewSemanticMemory(base, {
    actor_id: 'owner.alice',
    review_event_digest: B,
    decision: 'quarantine'
  });
  assert.deepEqual(evaluateSemanticMemoryUse(quarantined, 'ordinary-retrieval'), {
    allow: false,
    code: 'semantic_memory_quarantined'
  });

  const rejected = ownerReviewSemanticMemory(base, {
    actor_id: 'owner.alice',
    review_event_digest: C,
    decision: 'reject'
  });
  assert.deepEqual(evaluateSemanticMemoryUse(rejected, 'ordinary-retrieval'), {
    allow: false,
    code: 'semantic_memory_rejected'
  });
});

test('local model output requires an explicit runtime binding', () => {
  assert.throws(
    () => normalizeSemanticMemoryProvenance({
      object_id: 'memory.model.1',
      owner: 'owner.alice',
      content_digest: A,
      origin_class: 'local-model-generated',
      semantic_class: 'knowledge'
    }),
    /requires origin_runtime_id/
  );

  const record = normalizeSemanticMemoryProvenance({
    object_id: 'memory.model.1',
    owner: 'owner.alice',
    content_digest: A,
    origin_class: 'local-model-generated',
    origin_runtime_id: 'runtime.provider.1',
    semantic_class: 'knowledge'
  });
  assert.equal(record.authority_tier, 'untrusted-data');
});

test('non-owner sources require source-binding evidence where no principal/runtime binding exists', () => {
  assert.throws(
    () => normalizeSemanticMemoryProvenance({
      object_id: 'memory.web.1',
      owner: 'owner.alice',
      content_digest: A,
      origin_class: 'retrieved-external',
      semantic_class: 'knowledge'
    }),
    /requires origin_artifact_digest/
  );

  const record = normalizeSemanticMemoryProvenance({
    object_id: 'memory.web.1',
    owner: 'owner.alice',
    content_digest: A,
    origin_class: 'retrieved-external',
    origin_artifact_digest: D,
    semantic_class: 'knowledge'
  });
  assert.equal(record.origin_artifact_digest, D);
});

test('unknown classes fields and authority-affecting declarations fail closed', () => {
  assert.throws(
    () => normalizeSemanticMemoryProvenance(remoteInstruction({
      semantic_class: 'system-policy'
    })),
    /semantic_class is invalid/
  );
  assert.throws(
    () => normalizeSemanticMemoryProvenance(remoteInstruction({
      authority_tier: 'root'
    })),
    /authority_tier is invalid/
  );
  assert.throws(
    () => normalizeSemanticMemoryProvenance(remoteInstruction({
      may_affect_authority: true
    })),
    /must remain false/
  );
  assert.throws(
    () => normalizeSemanticMemoryProvenance({
      ...remoteInstruction(),
      unexpected: true
    }),
    /Unsupported semantic memory provenance field/
  );
});

test('provenance digest changes when source or review authority changes', () => {
  const base = normalizeSemanticMemoryProvenance(remoteInstruction());
  const differentSource = normalizeSemanticMemoryProvenance(remoteInstruction({
    origin_principal: 'agent.remote.2'
  }));
  const approved = ownerReviewSemanticMemory(base, {
    actor_id: 'owner.alice',
    review_event_digest: B,
    decision: 'approve-instruction'
  });

  assert.notEqual(base.provenance_digest, differentSource.provenance_digest);
  assert.notEqual(base.provenance_digest, approved.provenance_digest);
});
