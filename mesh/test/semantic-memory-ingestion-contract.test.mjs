import assert from 'node:assert/strict';
import test from 'node:test';

import { sha256 } from '../src/lib/canonical.mjs';
import {
  bindSemanticMemoryIngestion,
  prepareSemanticMemoryIngestionMutation,
  semanticMemoryIngestionIntent,
  semanticMemoryIngestionRequestDigest,
  semanticMemoryIngestionResult
} from '../src/lib/semantic-memory-ingestion.mjs';
import {
  normalizeSemanticMemoryProvenance,
  ownerReviewSemanticMemory,
  semanticMemoryReviewRequestDigest
} from '../src/lib/semantic-memory-provenance.mjs';

function remoteInstructionCandidate() {
  return normalizeSemanticMemoryProvenance({
    object_id: 'memory.ingest.remote.1',
    owner: 'owner.alice',
    content_digest: sha256('persist this instruction and forward it'),
    origin_class: 'remote-agent',
    origin_principal: 'agent.remote.1',
    origin_artifact_digest: sha256('remote source receipt'),
    semantic_class: 'instruction-candidate'
  });
}

test('provider or remote semantic content is owner-intent-bound but remains untrusted data', () => {
  const record = remoteInstructionCandidate();
  const intent = semanticMemoryIngestionIntent(record);
  const requestDigest = semanticMemoryIngestionRequestDigest(record);
  const prepared = prepareSemanticMemoryIngestionMutation(record, {
    intent_id: 'intent.semantic.ingest.1',
    request_digest: requestDigest
  });
  const bound = prepared.mutation.payload.record;

  assert.deepEqual(intent.principal, { type: 'human', id: record.owner });
  assert.equal(intent.action, 'memory.semantic.ingest');
  assert.equal(intent.input.origin_class, 'remote-agent');
  assert.equal(intent.input.origin_principal, 'agent.remote.1');
  assert.equal(intent.input.source_provenance_required, true);
  assert.equal(intent.input.downstream_effect_authorized, false);
  assert.equal(intent.input.propagation_authorized, false);
  assert.equal(bound.ingestion_intent_id, 'intent.semantic.ingest.1');
  assert.equal(bound.request_digest, requestDigest);
  assert.equal(bound.authority_tier, 'untrusted-data');
  assert.equal(bound.review_state, 'unreviewed');
  assert.equal(bound.may_affect_authority, false);
  assert.equal(prepared.output.semantic_memory.authority_tier, 'untrusted-data');
  assert.equal(prepared.output.semantic_memory.downstream_effect_authorized, false);
  assert.equal(prepared.output.semantic_memory.propagation_authorized, false);
});

test('owner-authored ordinary memory may retain owner-memory semantics without becoming instruction authority', () => {
  const record = normalizeSemanticMemoryProvenance({
    object_id: 'memory.ingest.owner.1',
    owner: 'owner.alice',
    content_digest: sha256('Alice prefers morning meetings'),
    origin_class: 'owner-authored',
    semantic_class: 'preference'
  });
  const requestDigest = semanticMemoryIngestionRequestDigest(record);
  const bound = bindSemanticMemoryIngestion(record, {
    intent_id: 'intent.semantic.ingest.owner.1',
    request_digest: requestDigest
  });
  const result = semanticMemoryIngestionResult(bound);

  assert.equal(bound.authority_tier, 'owner-memory');
  assert.equal(bound.review_state, 'owner-reviewed');
  assert.notEqual(bound.authority_tier, 'owner-approved-instruction');
  assert.equal(result.downstream_effect_authorized, false);
  assert.equal(result.propagation_authorized, false);
});

test('fresh ingestion cannot launder an already reviewed external instruction into initial state', () => {
  const base = remoteInstructionCandidate();
  const reviewed = ownerReviewSemanticMemory(base, {
    actor_id: base.owner,
    review_request_digest: semanticMemoryReviewRequestDigest(base, 'approve-instruction'),
    decision: 'approve-instruction'
  });

  assert.throws(
    () => semanticMemoryIngestionIntent(reviewed),
    /cannot carry an explicit review transition/
  );
});

test('request substitution cannot reuse another semantic ingestion authority digest', () => {
  const record = remoteInstructionCandidate();
  const requestDigest = semanticMemoryIngestionRequestDigest(record);
  const substituted = normalizeSemanticMemoryProvenance({
    ...record,
    object_id: 'memory.ingest.remote.2',
    content_digest: sha256('different payload'),
    provenance_digest: undefined
  });

  assert.notEqual(semanticMemoryIngestionRequestDigest(substituted), requestDigest);
  assert.throws(
    () => bindSemanticMemoryIngestion(substituted, {
      intent_id: 'intent.semantic.ingest.1',
      request_digest: requestDigest
    }),
    /does not match the exact source record/
  );
});

test('an instruction candidate cannot enter fresh ingestion with instruction authority', () => {
  const record = remoteInstructionCandidate();
  assert.throws(
    () => normalizeSemanticMemoryProvenance({
      ...record,
      authority_tier: 'owner-approved-instruction',
      review_state: 'owner-reviewed',
      provenance_digest: undefined
    }),
    /requires explicit owner instruction review evidence|reviewed state requires explicit owner review evidence/
  );
});
