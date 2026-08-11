import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compileContextClaimMemoryIntent,
  compileContextClaimTombstoneIntent
} from '../src/lib/context-lifecycle.mjs';

function claim(overrides = {}) {
  return {
    schema: 'axiom-context-claim.v1',
    claim_id: 'claim:lifecycle-priority',
    owner: 'person:context-owner',
    subject: 'project.axiom',
    predicate: 'project.priority',
    value: 'security-first',
    claim_type: 'decision',
    cardinality: 'single',
    confidence_ppm: 1_000_000,
    source: {
      type: 'human',
      ref: 'conversation:lifecycle-1',
      digest: '1'.repeat(64),
      observed_at: '2026-08-11T18:00:00.000Z'
    },
    validity: {
      from: '2026-08-11T18:00:00.000Z',
      until: null
    },
    disclosure: {
      principals: ['person:context-owner'],
      purposes: ['project.execution'],
      scopes: ['context:project']
    },
    sensitivity: 'internal',
    supersedes: [],
    contradicts: [],
    authority_effect: 'none',
    ...overrides
  };
}

test('context lifecycle compiler produces the existing governed memory.put action', () => {
  const compiled = compileContextClaimMemoryIntent(claim(), {
    principalId: 'person:context-owner'
  });

  assert.equal(compiled.action, 'memory.put');
  assert.equal(compiled.input.kind, 'context.claim');
  assert.equal(compiled.input.content.owner, 'person:context-owner');
  assert.equal(compiled.input.metadata.authority_effect, 'none');
  assert.equal(compiled.expected.authority_effect, 'none');
  assert.equal(compiled.expected.object_id, `memory_${compiled.expected.content_digest}`);
});

test('context lifecycle compiler refuses claims for another owner', () => {
  assert.throws(
    () => compileContextClaimMemoryIntent(claim(), {
      principalId: 'person:other'
    }),
    /owner must match the authenticated principal/
  );
});

test('context lifecycle metadata is generated and cannot be caller supplied', () => {
  const first = compileContextClaimMemoryIntent(claim(), {
    principalId: 'person:context-owner'
  });
  const second = compileContextClaimMemoryIntent(claim(), {
    principalId: 'person:context-owner'
  });

  assert.deepEqual(first, second);
  assert.deepEqual(Object.keys(first.input.metadata).sort(), [
    'authority_effect',
    'claim_id',
    'schema',
    'source_digest'
  ]);
});

test('context lifecycle tombstone compiles to the existing owner-governed memory action', () => {
  const objectId = `memory_${'a'.repeat(64)}`;
  const compiled = compileContextClaimTombstoneIntent(objectId, {
    principalId: 'person:context-owner',
    reason: 'superseded by a later verified claim'
  });

  assert.equal(compiled.action, 'memory.tombstone');
  assert.deepEqual(compiled.input, {
    object_id: objectId,
    reason: 'superseded by a later verified claim'
  });
});
