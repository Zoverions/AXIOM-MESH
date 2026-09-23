import assert from 'node:assert/strict';
import test from 'node:test';

import {
  deriveSemanticMemoryProvenance,
  normalizeSemanticMemoryProvenance,
  ownerReviewSemanticMemory,
  semanticMemoryReviewRequestDigest
} from '../src/lib/semantic-memory-provenance.mjs';
import {
  createSemanticMemoryLifecycle,
  deriveSemanticMemoryLifecycle,
  evaluateSemanticMemoryLifecycleUse,
  verifySemanticMemoryLifecycle
} from '../src/lib/semantic-memory-lifecycle.mjs';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);
const D = 'd'.repeat(64);

function remoteInstruction(overrides = {}) {
  return normalizeSemanticMemoryProvenance({
    object_id: 'memory.remote.lifecycle.1',
    owner: 'owner.alice',
    content_digest: A,
    origin_class: 'remote-agent',
    origin_principal: 'agent.remote.1',
    origin_artifact_digest: B,
    semantic_class: 'instruction-candidate',
    ...overrides
  });
}

function approveInstruction(record) {
  return ownerReviewSemanticMemory(record, {
    actor_id: 'owner.alice',
    review_request_digest: semanticMemoryReviewRequestDigest(record, 'approve-instruction'),
    decision: 'approve-instruction'
  });
}

test('semantic memory lifecycle binds exact provenance and records explicit no-authority inheritance', () => {
  const record = remoteInstruction();
  const lifecycle = createSemanticMemoryLifecycle(record);

  assert.equal(lifecycle.object_id, record.object_id);
  assert.equal(lifecycle.owner, record.owner);
  assert.equal(lifecycle.provenance_digest, record.provenance_digest);
  assert.equal(lifecycle.origin_class, 'remote-agent');
  assert.equal(lifecycle.retention_mode, 'owner-controlled');
  assert.equal(lifecycle.expires_at, null);
  assert.equal(lifecycle.inheritance_policy, 'not-derived');
  assert.equal(lifecycle.parent_provenance_digest, null);
  assert.equal(lifecycle.authority_inheritance, 'none');
  assert.equal(lifecycle.instruction_inheritance, 'none');
  assert.equal(lifecycle.lifecycle_effect, 'none');
  assert.match(lifecycle.lifecycle_digest, /^[a-f0-9]{64}$/);
  assert.deepEqual(verifySemanticMemoryLifecycle(lifecycle, record), lifecycle);
});

test('bounded retention expires ordinary retrieval and privileged instruction use', () => {
  const base = remoteInstruction();
  const approved = approveInstruction(base);
  const lifecycle = createSemanticMemoryLifecycle(approved, {
    retention_mode: 'bounded',
    expires_at: '2026-08-18T05:00:00.000Z'
  });

  assert.equal(evaluateSemanticMemoryLifecycleUse(
    approved,
    lifecycle,
    'ordinary-retrieval',
    { now: new Date('2026-08-18T04:59:59.000Z') }
  ).allow, true);

  assert.deepEqual(evaluateSemanticMemoryLifecycleUse(
    approved,
    lifecycle,
    'ordinary-retrieval',
    { now: new Date('2026-08-18T05:00:00.000Z') }
  ), {
    allow: false,
    code: 'semantic_memory_expired',
    provenance_digest: approved.provenance_digest,
    lifecycle_digest: lifecycle.lifecycle_digest
  });

  assert.equal(evaluateSemanticMemoryLifecycleUse(
    approved,
    lifecycle,
    'privileged-instruction',
    {
      now: new Date('2026-08-18T04:59:59.000Z'),
      verified_review_request_digest: approved.review_request_digest
    }
  ).allow, true);

  assert.equal(evaluateSemanticMemoryLifecycleUse(
    approved,
    lifecycle,
    'privileged-instruction',
    {
      now: new Date('2026-08-18T05:00:00.000Z'),
      verified_review_request_digest: approved.review_request_digest
    }
  ).code, 'semantic_memory_expired');
});

test('retention mode and expiry shape fail closed', () => {
  const record = remoteInstruction();
  assert.throws(
    () => createSemanticMemoryLifecycle(record, {
      retention_mode: 'owner-controlled',
      expires_at: '2026-08-18T05:00:00.000Z'
    }),
    /requires expires_at null/
  );
  assert.throws(
    () => createSemanticMemoryLifecycle(record, {
      retention_mode: 'bounded',
      expires_at: null
    }),
    /canonical UTC ISO timestamp/
  );
  assert.throws(
    () => createSemanticMemoryLifecycle(record, {
      retention_mode: 'forever',
      expires_at: null
    }),
    /retention_mode is invalid/
  );
});

test('lifecycle digest and exact provenance binding reject substitution', () => {
  const record = remoteInstruction();
  const lifecycle = createSemanticMemoryLifecycle(record);

  assert.throws(
    () => verifySemanticMemoryLifecycle({ ...lifecycle, lifecycle_digest: D }, record),
    /lifecycle digest mismatch/
  );

  const different = remoteInstruction({
    object_id: 'memory.remote.lifecycle.2',
    content_digest: C
  });
  assert.throws(
    () => verifySemanticMemoryLifecycle(lifecycle, different),
    /does not match its exact provenance record/
  );
});

test('a provenance-changing owner review requires lifecycle rebinding', () => {
  const base = remoteInstruction();
  const baseLifecycle = createSemanticMemoryLifecycle(base, {
    retention_mode: 'bounded',
    expires_at: '2026-08-18T05:00:00.000Z'
  });
  const approved = approveInstruction(base);

  assert.throws(
    () => verifySemanticMemoryLifecycle(baseLifecycle, approved),
    /does not match its exact provenance record/
  );

  const approvedLifecycle = createSemanticMemoryLifecycle(approved, {
    retention_mode: 'bounded',
    expires_at: '2026-08-18T05:00:00.000Z'
  });
  assert.equal(approvedLifecycle.provenance_digest, approved.provenance_digest);
  assert.notEqual(approvedLifecycle.lifecycle_digest, baseLifecycle.lifecycle_digest);
});

test('derived memory explicitly inherits provenance only and never instruction authority', () => {
  const base = approveInstruction(remoteInstruction());
  const parentLifecycle = createSemanticMemoryLifecycle(base, {
    retention_mode: 'bounded',
    expires_at: '2026-08-18T06:00:00.000Z'
  });
  const derived = deriveSemanticMemoryProvenance(base, {
    object_id: 'memory.derived.lifecycle.1',
    content_digest: C,
    semantic_class: 'instruction-candidate'
  });
  const childLifecycle = deriveSemanticMemoryLifecycle(
    base,
    parentLifecycle,
    derived,
    { expires_at: '2026-08-18T05:30:00.000Z' }
  );

  assert.equal(childLifecycle.retention_mode, 'bounded');
  assert.equal(childLifecycle.expires_at, '2026-08-18T05:30:00.000Z');
  assert.equal(childLifecycle.inheritance_policy, 'provenance-only-no-authority');
  assert.equal(childLifecycle.parent_provenance_digest, base.provenance_digest);
  assert.equal(childLifecycle.authority_inheritance, 'none');
  assert.equal(childLifecycle.instruction_inheritance, 'none');
  assert.equal(derived.authority_tier, 'untrusted-data');
  assert.equal(derived.review_state, 'unreviewed');
  assert.equal(evaluateSemanticMemoryLifecycleUse(
    derived,
    childLifecycle,
    'privileged-instruction',
    { now: new Date('2026-08-18T05:00:00.000Z') }
  ).allow, false);
});

test('derived memory cannot escape or outlive bounded parent retention', () => {
  const parent = remoteInstruction();
  const parentLifecycle = createSemanticMemoryLifecycle(parent, {
    retention_mode: 'bounded',
    expires_at: '2026-08-18T06:00:00.000Z'
  });
  const child = deriveSemanticMemoryProvenance(parent, {
    object_id: 'memory.derived.lifecycle.2',
    content_digest: C
  });

  assert.throws(
    () => deriveSemanticMemoryLifecycle(parent, parentLifecycle, child, {
      retention_mode: 'owner-controlled'
    }),
    /cannot escape bounded parent retention/
  );

  assert.throws(
    () => deriveSemanticMemoryLifecycle(parent, parentLifecycle, child, {
      retention_mode: 'bounded',
      expires_at: '2026-08-18T06:00:01.000Z'
    }),
    /cannot outlive bounded parent retention/
  );

  const inherited = deriveSemanticMemoryLifecycle(parent, parentLifecycle, child);
  assert.equal(inherited.retention_mode, 'bounded');
  assert.equal(inherited.expires_at, parentLifecycle.expires_at);
});

test('lifecycle cannot claim instruction or authority inheritance even with a recomputed digest', () => {
  const record = remoteInstruction();
  const lifecycle = createSemanticMemoryLifecycle(record);

  const authorityElevated = {
    ...lifecycle,
    authority_inheritance: 'inherit-parent'
  };
  assert.throws(
    () => verifySemanticMemoryLifecycle(authorityElevated, record),
    /authority_inheritance must remain none/
  );

  const instructionElevated = {
    ...lifecycle,
    instruction_inheritance: 'inherit-parent'
  };
  assert.throws(
    () => verifySemanticMemoryLifecycle(instructionElevated, record),
    /instruction_inheritance must remain none/
  );
});

test('non-derived memory cannot claim derived inheritance or parent provenance', () => {
  const record = remoteInstruction();
  const lifecycle = createSemanticMemoryLifecycle(record);

  assert.throws(
    () => verifySemanticMemoryLifecycle({
      ...lifecycle,
      inheritance_policy: 'provenance-only-no-authority'
    }, record),
    /inheritance_policy does not match provenance origin/
  );

  assert.throws(
    () => verifySemanticMemoryLifecycle({
      ...lifecycle,
      parent_provenance_digest: D
    }, record),
    /parent provenance binding is invalid/
  );
});

test('unknown lifecycle fields and invalid evaluation clock fail closed', () => {
  const record = remoteInstruction();
  const lifecycle = createSemanticMemoryLifecycle(record);
  assert.throws(
    () => verifySemanticMemoryLifecycle({ ...lifecycle, magic: true }, record),
    /unsupported field magic/
  );
  assert.throws(
    () => evaluateSemanticMemoryLifecycleUse(record, lifecycle, 'ordinary-retrieval', {
      now: 'not-a-date'
    }),
    /evaluation now is invalid/
  );
});
