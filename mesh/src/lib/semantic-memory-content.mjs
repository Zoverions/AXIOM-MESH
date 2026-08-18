import {
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject
} from './canonical.mjs';
import {
  bindSemanticMemoryIngestion,
  semanticMemoryIngestionBaseRecord,
  semanticMemoryIngestionRequestDigest,
  semanticMemoryIngestionResult
} from './semantic-memory-ingestion.mjs';
import { normalizeSemanticMemoryProvenance } from './semantic-memory-provenance.mjs';

export const SEMANTIC_MEMORY_CONTENT_KIND = 'semantic.memory';
export const SEMANTIC_MEMORY_CONTENT_RESULT_SCHEMA =
  'axiom-semantic-memory-content-result.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;

export function semanticMemoryContentAddress({ owner, content, metadata = {} } = {}) {
  const normalizedOwner = assertString(owner, 'semantic memory content owner', {
    min: 1,
    max: 160,
    pattern: ID
  });
  const normalizedContent = structuredClone(
    assertPlainObject(content, 'semantic memory content')
  );
  const normalizedMetadata = structuredClone(
    assertPlainObject(metadata, 'semantic memory metadata')
  );
  const contentDigest = digestObject({
    owner: normalizedOwner,
    kind: SEMANTIC_MEMORY_CONTENT_KIND,
    content: normalizedContent,
    metadata: normalizedMetadata
  });
  return Object.freeze({
    owner: normalizedOwner,
    kind: SEMANTIC_MEMORY_CONTENT_KIND,
    content: Object.freeze(normalizedContent),
    metadata: Object.freeze(normalizedMetadata),
    content_digest: contentDigest,
    object_id: `memory_${contentDigest}`
  });
}

export function prepareSemanticMemoryContentMutation({
  owner,
  content,
  metadata = {},
  provenance
} = {}, binding = {}) {
  const address = semanticMemoryContentAddress({ owner, content, metadata });
  const supplied = normalizeSemanticMemoryProvenance(provenance);
  assertExactContentProvenance(address, supplied);

  const record = bindSemanticMemoryIngestion(supplied, binding);
  assertExactContentProvenance(address, record);

  const mutation = Object.freeze({
    kind: 'memory.put',
    subject: address.object_id,
    payload: Object.freeze({
      object_id: address.object_id,
      owner: address.owner,
      kind: address.kind,
      content: address.content,
      metadata: address.metadata,
      content_digest: address.content_digest,
      semantic_provenance: record
    })
  });

  return Object.freeze({
    mutation,
    output: Object.freeze({
      semantic_memory: semanticMemoryIngestionResult(record),
      semantic_memory_content: semanticMemoryContentResult(record)
    })
  });
}

export function validateSemanticMemoryContentPayload(
  payloadInput,
  { actor, subject, allowExecutionEvidence = true } = {}
) {
  const payload = assertPlainObject(payloadInput, 'semantic memory content payload');
  const allowed = new Set([
    'object_id',
    'owner',
    'kind',
    'content',
    'metadata',
    'content_digest',
    'semantic_provenance',
    ...(allowExecutionEvidence ? ['evidence'] : [])
  ]);
  for (const field of Object.keys(payload)) {
    if (!allowed.has(field)) {
      throw new ValidationError(
        `Unsupported semantic memory content payload field: ${field}`
      );
    }
  }
  if (payload.kind !== SEMANTIC_MEMORY_CONTENT_KIND) {
    throw new ValidationError('Semantic memory content kind is invalid');
  }

  const address = semanticMemoryContentAddress({
    owner: payload.owner,
    content: payload.content,
    metadata: payload.metadata
  });
  if (
    payload.object_id !== address.object_id
    || payload.content_digest !== address.content_digest
  ) {
    throw new ValidationError('Semantic memory content address is invalid');
  }
  if (actor !== undefined && actor !== address.owner) {
    throw new ValidationError('Semantic memory content actor must equal the memory owner');
  }
  if (subject !== undefined && subject !== address.object_id) {
    throw new ValidationError('Semantic memory content event subject must equal object_id');
  }

  const record = normalizeSemanticMemoryProvenance(payload.semantic_provenance);
  assertExactContentProvenance(address, record);
  if (!record.ingestion_intent_id || !record.request_digest) {
    throw new ValidationError(
      'Semantic memory content provenance requires exact ingestion intent binding'
    );
  }
  const base = semanticMemoryIngestionBaseRecord(record);
  if (record.request_digest !== semanticMemoryIngestionRequestDigest(base)) {
    throw new ValidationError('Semantic memory content provenance request binding is invalid');
  }
  if (record.may_affect_authority !== false) {
    throw new ValidationError('Semantic memory content cannot affect AXIOM authority');
  }

  return Object.freeze({
    address,
    record
  });
}

export function semanticMemoryContentResult(recordInput) {
  const record = normalizeSemanticMemoryProvenance(recordInput);
  if (!record.ingestion_intent_id || !record.request_digest) {
    throw new ValidationError(
      'Semantic memory content result requires ingestion-bound provenance'
    );
  }
  return Object.freeze({
    schema: SEMANTIC_MEMORY_CONTENT_RESULT_SCHEMA,
    object_id: record.object_id,
    content_digest: record.content_digest,
    provenance_digest: record.provenance_digest,
    kind: SEMANTIC_MEMORY_CONTENT_KIND,
    persisted_as_memory_object: true,
    content_address_verified: true,
    provenance_bound_atomically: true,
    downstream_effect_authorized: false,
    propagation_authorized: false,
    may_affect_authority: false
  });
}

export function assertSemanticMemoryContentResult(value, recordInput) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError('Semantic memory content completion result must be an object');
  }
  const expected = semanticMemoryContentResult(recordInput);
  if (canonicalJson(value) !== canonicalJson(expected)) {
    throw new ValidationError(
      'Semantic memory content completion result does not match the persisted content/provenance binding'
    );
  }
  return expected;
}

function assertExactContentProvenance(address, record) {
  if (
    record.owner !== address.owner
    || record.object_id !== address.object_id
    || record.content_digest !== address.content_digest
  ) {
    throw new ValidationError(
      'Semantic memory provenance does not match the exact content-addressed memory object'
    );
  }
}
