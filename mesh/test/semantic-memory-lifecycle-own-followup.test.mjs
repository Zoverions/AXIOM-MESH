import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeSemanticMemoryProvenance } from '../src/lib/semantic-memory-provenance.mjs';
import {
  createSemanticMemoryLifecycle,
  evaluateSemanticMemoryLifecycleUse,
  verifySemanticMemoryLifecycle
} from '../src/lib/semantic-memory-lifecycle.mjs';

// #1918 follow-up to the lifecycle own-reads change: pins two behaviours that
// mutation testing showed were not yet covered.

const C = 'c'.repeat(64);

// A raw (not yet normalized) record: no own provenance_digest and no own
// ingestion_intent_id.
function rawOwner() {
  return {
    object_id: 'memory.owner.lifecycle-followup',
    owner: 'owner.alice',
    content_digest: C,
    origin_class: 'owner-authored',
    semantic_class: 'knowledge'
  };
}

// Built before any pollution.
const lcOwner = createSemanticMemoryLifecycle(rawOwner());

function withPrototypeValue(key, value, fn) {
  assert.equal(Object.hasOwn(Object.prototype, key), false, `Object.prototype.${key} must start absent`);
  try {
    Object.defineProperty(Object.prototype, key, { value, configurable: true, writable: true, enumerable: false });
    return fn();
  } finally {
    delete Object.prototype[key];
    assert.equal(Object.hasOwn(Object.prototype, key), false, `Object.prototype.${key} must be restored`);
  }
}

test('inherited ingestion_intent_id on a raw record: lifecycle verify and evaluate deny (one dominance pass covers the record normalize)', () => {
  // Unpolluted, the raw record verifies against its lifecycle.
  assert.equal(verifySemanticMemoryLifecycle(lcOwner, rawOwner()).lifecycle_digest, lcOwner.lifecycle_digest);
  withPrototypeValue('ingestion_intent_id', 'intent.polluted', () => {
    const record = rawOwner();
    assert.equal(Object.hasOwn(record, 'ingestion_intent_id'), false);
    assert.equal(Object.hasOwn(record, 'provenance_digest'), false);
    // Main's ordinary reads give this record a different provenance digest,
    // so the lifecycle no longer matches; the record normalize must run inside
    // the lifecycle's own dominance pass for that deny to surface.
    assert.throws(
      () => verifySemanticMemoryLifecycle(lcOwner, record),
      { name: 'ValidationError', message: /does not match its exact provenance record/ }
    );
    assert.throws(
      () => evaluateSemanticMemoryLifecycleUse(record, lcOwner, 'ordinary-retrieval'),
      { name: 'ValidationError', message: /does not match its exact provenance record/ }
    );
  });
  assert.equal(verifySemanticMemoryLifecycle(lcOwner, rawOwner()).lifecycle_digest, lcOwner.lifecycle_digest);
  // Sanity: the record itself still normalizes to the lifecycle's digest.
  assert.equal(normalizeSemanticMemoryProvenance(rawOwner()).provenance_digest, lcOwner.provenance_digest);
});

test('an own null retention_mode is not defaulted: create throws like main (parameter-default semantics)', () => {
  assert.throws(
    () => createSemanticMemoryLifecycle(rawOwner(), { retention_mode: null }),
    { name: 'ValidationError', message: 'Semantic memory retention_mode is invalid' }
  );
  // undefined (own or absent) still defaults to owner-controlled.
  assert.deepEqual(createSemanticMemoryLifecycle(rawOwner(), { retention_mode: undefined }), lcOwner);
  assert.deepEqual(createSemanticMemoryLifecycle(rawOwner(), {}), lcOwner);
});
