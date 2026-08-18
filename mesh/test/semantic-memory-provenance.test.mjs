import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SEMANTIC_MEMORY_REVIEW_ACTION,
  SEMANTIC_MEMORY_REVIEW_INPUT_SCHEMA,
  SEMANTIC_MEMORY_REVIEW_PURPOSE,
  deriveSemanticMemoryProvenance,
  evaluateSemanticMemoryUse,
  normalizeSemanticMemoryProvenance,
  ownerReviewSemanticMemory,
  semanticMemoryReviewIntent,
  semanticMemoryReviewRequestDigest
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
    origin_artifact_digest: B,
    semantic_class: 'instruction-candidate',
    ...overrides
  };
}

function reviewArgs(record, decision, actorId = 'owner.alice') {
  return {
    actor_id: actorId,
    review_request_digest: semanticMemoryReviewRequestDigest(record, decision),
    decision
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

test('remote instruction-like content enters as source-bound untrusted unreviewed data', () => {
  const record = normalizeSemanticMemoryProvenance(remoteInstruction());
  assert.equal(record.authority_tier, 'untrusted-data');
  assert.equal(record.review_state, 'unreviewed');
  assert.equal(record.origin_artifact_digest, B);
  assert.equal(evaluateSemanticMemoryUse(record, 'ordinary-retrieval').allow, true);
  assert.deepEqual(evaluateSemanticMemoryUse(record, 'privileged-instruction'), {
    allow: false,
    code: 'semantic_memory_instruction_denied'
  });
});

test('semantic memory review request binds exact object provenance and decision', () => {
  const record = normalizeSemanticMemoryProvenance(remoteInstruction());
  const intent = semanticMemoryReviewIntent(record, 'approve-instruction');
  assert.deepEqual(intent.principal, { type: 'human', id: 'owner.alice' });
  assert.equal(intent.action, SEMANTIC_MEMORY_REVIEW_ACTION);
  assert.equal(intent.purpose, SEMANTIC_MEMORY_REVIEW_PURPOSE);
  assert.equal(intent.input.schema, SEMANTIC_MEMORY_REVIEW_INPUT_SCHEMA);
  assert.equal(intent.input.object_id, record.object_id);
  assert.equal(intent.input.content_digest, record.content_digest);
  assert.equal(intent.input.current_provenance_digest, record.provenance_digest);
  assert.equal(intent.input.decision, 'approve-instruction');
  assert.deepEqual(intent.data_scopes, [`memory.semantic:${record.object_id}`]);

  const approveDigest = semanticMemoryReviewRequestDigest(record, 'approve-instruction');
  const quarantineDigest = semanticMemoryReviewRequestDigest(record, 'quarantine');
  assert.notEqual(approveDigest, quarantineDigest);

  const differentSource = normalizeSemanticMemoryProvenance(remoteInstruction({
    origin_principal: 'agent.remote.2'
  }));
  assert.notEqual(
    approveDigest,
    semanticMemoryReviewRequestDigest(differentSource, 'approve-instruction')
  );
});

test('external memory cannot self-promote instruction authority', () => {
  assert.throws(
    () => normalizeSemanticMemoryProvenance(remoteInstruction({
      authority_tier: 'owner-approved-instruction',
      review_state: 'owner-reviewed'
    })),
    /requires explicit owner review evidence|cannot self-promote authority/
  );
});

test('only the owner can explicitly approve an instruction candidate', () => {
  const record = normalizeSemanticMemoryProvenance(remoteInstruction());
  assert.throws(
    () => ownerReviewSemanticMemory(
      record,
      reviewArgs(record, 'approve-instruction', 'agent.remote.1')
    ),
    /Only the memory owner/
  );

  const approved = ownerReviewSemanticMemory(
    record,
    reviewArgs(record, 'approve-instruction')
  );
  assert.equal(approved.authority_tier, 'owner-approved-instruction');
  assert.equal(approved.review_state, 'owner-reviewed');
  assert.equal(approved.review_actor, 'owner.alice');
  assert.equal(approved.review_decision, 'approve-instruction');
  assert.equal(approved.reviewed_from_provenance_digest, record.provenance_digest);
  assert.equal(
    approved.review_request_digest,
    semanticMemoryReviewRequestDigest(record, 'approve-instruction')
  );
  assert.deepEqual(evaluateSemanticMemoryUse(approved, 'privileged-instruction'), {
    allow: false,
    code: 'semantic_memory_review_evidence_unverified'
  });
  assert.equal(
    evaluateSemanticMemoryUse(approved, 'privileged-instruction', {
      verified_review_request_digest: approved.review_request_digest
    }).allow,
    true
  );
  assert.deepEqual(
    evaluateSemanticMemoryUse(approved, 'privileged-instruction', {
      verified_review_request_digest: D
    }),
    { allow: false, code: 'semantic_memory_review_evidence_mismatch' }
  );
});

test('review request substitution fails closed', () => {
  const record = normalizeSemanticMemoryProvenance(remoteInstruction());
  assert.throws(
    () => ownerReviewSemanticMemory(record, {
      actor_id: 'owner.alice',
      review_request_digest: C,
      decision: 'approve-instruction'
    }),
    /review request digest does not match the exact transition/
  );

  assert.throws(
    () => ownerReviewSemanticMemory(record, {
      actor_id: 'owner.alice',
      review_request_digest: semanticMemoryReviewRequestDigest(record, 'quarantine'),
      decision: 'approve-instruction'
    }),
    /review request digest does not match the exact transition/
  );
});

test('persisted review evidence is self-consistent and chained to the prior provenance state', () => {
  const base = normalizeSemanticMemoryProvenance(remoteInstruction());
  const approved = ownerReviewSemanticMemory(base, reviewArgs(base, 'approve-instruction'));
  assert.deepEqual(normalizeSemanticMemoryProvenance(approved), approved);

  const { provenance_digest: _ignored, ...tamperedPrior } = approved;
  assert.throws(
    () => normalizeSemanticMemoryProvenance({
      ...tamperedPrior,
      reviewed_from_provenance_digest: D
    }),
    /review request digest does not match review evidence/
  );

  const quarantined = ownerReviewSemanticMemory(base, reviewArgs(base, 'quarantine'));
  const { provenance_digest: _ignored2, ...tamperedOutcome } = quarantined;
  assert.throws(
    () => normalizeSemanticMemoryProvenance({
      ...tamperedOutcome,
      authority_tier: 'owner-approved-instruction',
      review_state: 'owner-reviewed'
    }),
    /Quarantine review evidence does not match the resulting state/
  );
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
    () => ownerReviewSemanticMemory(record, reviewArgs(record, 'approve-instruction')),
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
  const approved = ownerReviewSemanticMemory(record, reviewArgs(record, 'approve-memory'));
  assert.equal(approved.authority_tier, 'owner-memory');
  assert.equal(approved.review_state, 'owner-reviewed');
  assert.equal(approved.reviewed_from_provenance_digest, record.provenance_digest);
  assert.equal(evaluateSemanticMemoryUse(approved, 'ordinary-retrieval').allow, true);
  assert.equal(evaluateSemanticMemoryUse(approved, 'privileged-instruction').allow, false);
});

test('derived summaries retain exact parent provenance and do not inherit instruction authority', () => {
  const source = normalizeSemanticMemoryProvenance(remoteInstruction());
  const approved = ownerReviewSemanticMemory(
    source,
    reviewArgs(source, 'approve-instruction')
  );

  const derived = deriveSemanticMemoryProvenance(approved, {
    object_id: 'memory.summary.1',
    content_digest: C,
    semantic_class: 'instruction-candidate'
  });

  assert.equal(derived.origin_class, 'system-derived');
  assert.equal(derived.origin_artifact_digest, approved.provenance_digest);
  assert.equal(derived.parent_object_id, approved.object_id);
  assert.equal(derived.parent_content_digest, approved.content_digest);
  assert.equal(derived.parent_provenance_digest, approved.provenance_digest);
  assert.equal(derived.authority_tier, 'untrusted-data');
  assert.equal(derived.review_state, 'unreviewed');
  assert.equal(evaluateSemanticMemoryUse(derived, 'privileged-instruction').allow, false);
});

test('partial or non-derived parent provenance fails closed', () => {
  assert.throws(
    () => normalizeSemanticMemoryProvenance({
      ...remoteInstruction(),
      parent_object_id: 'memory.parent.1'
    }),
    /parent provenance must be supplied as a complete tuple/
  );

  assert.throws(
    () => normalizeSemanticMemoryProvenance({
      ...remoteInstruction(),
      parent_object_id: 'memory.parent.1',
      parent_content_digest: C,
      parent_provenance_digest: D
    }),
    /Only system-derived memory may carry parent provenance/
  );
});

test('quarantine and rejection narrow authority and suppress retrieval', () => {
  const base = normalizeSemanticMemoryProvenance(remoteInstruction());
  const quarantined = ownerReviewSemanticMemory(base, reviewArgs(base, 'quarantine'));
  assert.deepEqual(evaluateSemanticMemoryUse(quarantined, 'ordinary-retrieval'), {
    allow: false,
    code: 'semantic_memory_quarantined'
  });

  const rejected = ownerReviewSemanticMemory(base, reviewArgs(base, 'reject'));
  assert.deepEqual(evaluateSemanticMemoryUse(rejected, 'ordinary-retrieval'), {
    allow: false,
    code: 'semantic_memory_rejected'
  });
});

test('local model output requires both runtime binding and source receipt digest', () => {
  assert.throws(
    () => normalizeSemanticMemoryProvenance({
      object_id: 'memory.model.1',
      owner: 'owner.alice',
      content_digest: A,
      origin_class: 'local-model-generated',
      origin_artifact_digest: B,
      semantic_class: 'knowledge'
    }),
    /requires origin_runtime_id/
  );

  assert.throws(
    () => normalizeSemanticMemoryProvenance({
      object_id: 'memory.model.1',
      owner: 'owner.alice',
      content_digest: A,
      origin_class: 'local-model-generated',
      origin_runtime_id: 'runtime.provider.1',
      semantic_class: 'knowledge'
    }),
    /requires origin_artifact_digest/
  );

  const record = normalizeSemanticMemoryProvenance({
    object_id: 'memory.model.1',
    owner: 'owner.alice',
    content_digest: A,
    origin_class: 'local-model-generated',
    origin_runtime_id: 'runtime.provider.1',
    origin_artifact_digest: B,
    semantic_class: 'knowledge'
  });
  assert.equal(record.authority_tier, 'untrusted-data');
  assert.equal(record.origin_artifact_digest, B);
});

test('all non-owner origins require source-binding artifact or receipt evidence', () => {
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

  assert.throws(
    () => normalizeSemanticMemoryProvenance({
      ...remoteInstruction(),
      origin_artifact_digest: undefined
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
  const approved = ownerReviewSemanticMemory(base, reviewArgs(base, 'approve-instruction'));

  assert.notEqual(base.provenance_digest, differentSource.provenance_digest);
  assert.notEqual(base.provenance_digest, approved.provenance_digest);
});

test('normalized provenance can be revalidated but a substituted provenance digest fails closed', () => {
  const record = normalizeSemanticMemoryProvenance(remoteInstruction());
  assert.deepEqual(normalizeSemanticMemoryProvenance(record), record);
  assert.throws(
    () => normalizeSemanticMemoryProvenance({
      ...record,
      provenance_digest: D
    }),
    /provenance digest does not match normalized content/
  );
});
