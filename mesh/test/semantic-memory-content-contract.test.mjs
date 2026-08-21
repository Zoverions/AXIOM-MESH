import assert from 'node:assert/strict';
import test from 'node:test';

import { digestObject, sha256 } from '../src/lib/canonical.mjs';
import {
  SEMANTIC_MEMORY_CONTENT_KIND,
  prepareSemanticMemoryContentMutation,
  semanticMemoryContentAddress,
  validateSemanticMemoryContentPayload
} from '../src/lib/semantic-memory-content.mjs';
import { semanticMemoryIngestionRequestDigest } from '../src/lib/semantic-memory-ingestion.mjs';
import { normalizeSemanticMemoryProvenance } from '../src/lib/semantic-memory-provenance.mjs';

function candidate({ text = 'remote semantic content', suffix = '1' } = {}) {
  const owner = 'owner.alice';
  const content = { text };
  const metadata = { source: 'model-alpha', classification: 'candidate' };
  const address = semanticMemoryContentAddress({ owner, content, metadata });
  const provenance = normalizeSemanticMemoryProvenance({
    object_id: address.object_id,
    owner,
    content_digest: address.content_digest,
    origin_class: 'local-model-generated',
    origin_principal: 'provider.model.alpha',
    origin_runtime_id: `runtime.model.${suffix}`,
    origin_artifact_digest: sha256(`provider-receipt:${suffix}:${text}`),
    semantic_class: 'instruction-candidate'
  });
  return { owner, content, metadata, address, provenance };
}

test('semantic memory content address is exactly the existing memory.put address', () => {
  const fixture = candidate();
  const expected = digestObject({
    owner: fixture.owner,
    kind: SEMANTIC_MEMORY_CONTENT_KIND,
    content: fixture.content,
    metadata: fixture.metadata
  });
  assert.equal(fixture.address.content_digest, expected);
  assert.equal(fixture.address.object_id, `memory_${expected}`);
});

test('prepared semantic memory put atomically carries exact ingestion-bound provenance', () => {
  const fixture = candidate();
  const requestDigest = semanticMemoryIngestionRequestDigest(fixture.provenance);
  const prepared = prepareSemanticMemoryContentMutation({
    owner: fixture.owner,
    content: fixture.content,
    metadata: fixture.metadata,
    provenance: fixture.provenance
  }, {
    intent_id: 'intent.semantic.content.1',
    request_digest: requestDigest
  });

  assert.equal(prepared.mutation.kind, 'memory.put');
  assert.equal(prepared.mutation.subject, fixture.address.object_id);
  assert.equal(prepared.mutation.payload.kind, SEMANTIC_MEMORY_CONTENT_KIND);
  assert.equal(prepared.mutation.payload.content_digest, fixture.address.content_digest);
  assert.equal(
    prepared.mutation.payload.semantic_provenance.request_digest,
    requestDigest
  );
  assert.equal(
    prepared.output.semantic_memory_content.provenance_digest,
    prepared.mutation.payload.semantic_provenance.provenance_digest
  );
  assert.equal(prepared.output.semantic_memory_content.provenance_bound_atomically, true);
  assert.equal(prepared.output.semantic_memory_content.downstream_effect_authorized, false);
  assert.equal(prepared.output.semantic_memory_content.propagation_authorized, false);
});

test('content/provenance substitution is rejected rather than silently re-addressed', () => {
  const first = candidate({ text: 'first payload', suffix: 'first' });
  const second = candidate({ text: 'second payload', suffix: 'second' });
  assert.throws(
    () => prepareSemanticMemoryContentMutation({
      owner: first.owner,
      content: first.content,
      metadata: first.metadata,
      provenance: second.provenance
    }, {
      intent_id: 'intent.semantic.content.substitution',
      request_digest: semanticMemoryIngestionRequestDigest(second.provenance)
    }),
    /does not match the exact content-addressed memory object/
  );
});

test('strict semantic content payload rejects hidden fields and actor or subject substitution', () => {
  const fixture = candidate();
  const requestDigest = semanticMemoryIngestionRequestDigest(fixture.provenance);
  const prepared = prepareSemanticMemoryContentMutation({
    owner: fixture.owner,
    content: fixture.content,
    metadata: fixture.metadata,
    provenance: fixture.provenance
  }, {
    intent_id: 'intent.semantic.content.strict',
    request_digest: requestDigest
  });

  assert.throws(
    () => validateSemanticMemoryContentPayload({
      ...prepared.mutation.payload,
      authority_override: true
    }, {
      actor: fixture.owner,
      subject: fixture.address.object_id
    }),
    /Unsupported semantic memory content payload field/
  );
  assert.throws(
    () => validateSemanticMemoryContentPayload(prepared.mutation.payload, {
      actor: 'provider.model.alpha',
      subject: fixture.address.object_id
    }),
    /actor must equal the memory owner/
  );
  assert.throws(
    () => validateSemanticMemoryContentPayload(prepared.mutation.payload, {
      actor: fixture.owner,
      subject: 'memory_wrong'
    }),
    /subject must equal object_id/
  );
});
