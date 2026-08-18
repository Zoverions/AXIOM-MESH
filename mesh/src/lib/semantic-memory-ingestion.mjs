import {
  ValidationError,
  assertString,
  canonicalJson,
  digestObject
} from './canonical.mjs';
import { intentRequestDigest } from './intent-binding.mjs';
import { normalizeSemanticMemoryProvenance } from './semantic-memory-provenance.mjs';

export const SEMANTIC_MEMORY_INGESTION_ACTION = 'memory.semantic.ingest';
export const SEMANTIC_MEMORY_INGESTION_PURPOSE = 'persist-semantic-memory';
export const SEMANTIC_MEMORY_INGESTION_INPUT_SCHEMA =
  'axiom-semantic-memory-ingestion-input.v1';
export const SEMANTIC_MEMORY_INGESTION_RESULT_SCHEMA =
  'axiom-semantic-memory-ingestion-result.v1';
export const SEMANTIC_MEMORY_INGESTION_MUTATION_KIND =
  'memory.semantic.provenance.recorded';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;

export function semanticMemoryIngestionIntent(recordInput) {
  const base = semanticMemoryIngestionBaseRecord(recordInput);
  const input = Object.freeze({
    schema: SEMANTIC_MEMORY_INGESTION_INPUT_SCHEMA,
    object_id: base.object_id,
    content_digest: base.content_digest,
    base_provenance_digest: base.provenance_digest,
    origin_class: base.origin_class,
    ...(base.origin_principal ? { origin_principal: base.origin_principal } : {}),
    ...(base.origin_runtime_id ? { origin_runtime_id: base.origin_runtime_id } : {}),
    ...(base.origin_artifact_digest
      ? { origin_artifact_digest: base.origin_artifact_digest }
      : {}),
    semantic_class: base.semantic_class,
    initial_authority_tier: base.authority_tier,
    initial_review_state: base.review_state,
    source_provenance_required: base.origin_class !== 'owner-authored',
    downstream_effect_authorized: false,
    propagation_authorized: false,
    may_affect_authority: false
  });
  return Object.freeze({
    principal: Object.freeze({ type: 'human', id: base.owner }),
    action: SEMANTIC_MEMORY_INGESTION_ACTION,
    input,
    purpose: SEMANTIC_MEMORY_INGESTION_PURPOSE,
    data_scopes: Object.freeze([`memory.semantic:${base.object_id}`])
  });
}

export function semanticMemoryIngestionRequestDigest(recordInput) {
  return intentRequestDigest(semanticMemoryIngestionIntent(recordInput));
}

export function bindSemanticMemoryIngestion(recordInput, {
  intent_id,
  request_digest
} = {}) {
  const base = semanticMemoryIngestionBaseRecord(recordInput);
  const intentId = requiredId(intent_id, 'semantic memory ingestion intent_id');
  const suppliedRequestDigest = requiredDigest(
    request_digest,
    'semantic memory ingestion request_digest'
  );
  const expectedRequestDigest = semanticMemoryIngestionRequestDigest(base);
  if (suppliedRequestDigest !== expectedRequestDigest) {
    throw new ValidationError(
      'Semantic memory ingestion request digest does not match the exact source record'
    );
  }
  const { provenance_digest: _ignored, ...unaddressed } = base;
  return normalizeSemanticMemoryProvenance({
    ...unaddressed,
    ingestion_intent_id: intentId,
    request_digest: suppliedRequestDigest,
    may_affect_authority: false
  });
}

export function semanticMemoryIngestionResult(recordInput) {
  const record = normalizeSemanticMemoryProvenance(recordInput);
  if (!record.ingestion_intent_id || !record.request_digest) {
    throw new ValidationError(
      'Semantic memory ingestion result requires an ingestion-bound provenance record'
    );
  }
  const expectedRequestDigest = semanticMemoryIngestionRequestDigest(record);
  if (record.request_digest !== expectedRequestDigest) {
    throw new ValidationError('Semantic memory ingestion record request binding is invalid');
  }
  return Object.freeze({
    schema: SEMANTIC_MEMORY_INGESTION_RESULT_SCHEMA,
    object_id: record.object_id,
    content_digest: record.content_digest,
    provenance_digest: record.provenance_digest,
    origin_class: record.origin_class,
    semantic_class: record.semantic_class,
    authority_tier: record.authority_tier,
    review_state: record.review_state,
    persisted_as_semantic_state: true,
    downstream_effect_authorized: false,
    propagation_authorized: false,
    may_affect_authority: false
  });
}

export function prepareSemanticMemoryIngestionMutation(recordInput, binding) {
  const record = bindSemanticMemoryIngestion(recordInput, binding);
  return Object.freeze({
    mutation: Object.freeze({
      kind: SEMANTIC_MEMORY_INGESTION_MUTATION_KIND,
      subject: record.object_id,
      payload: Object.freeze({ record })
    }),
    output: Object.freeze({
      semantic_memory: semanticMemoryIngestionResult(record)
    })
  });
}

export function semanticMemoryIngestionBaseRecord(recordInput) {
  const normalized = normalizeSemanticMemoryProvenance(recordInput);
  if (
    normalized.review_request_digest
    || normalized.reviewed_from_provenance_digest
    || normalized.review_decision
    || normalized.review_actor
  ) {
    throw new ValidationError(
      'Fresh semantic memory ingestion cannot carry an explicit review transition'
    );
  }

  const {
    provenance_digest: _provenanceDigest,
    ingestion_intent_id: _ingestionIntentId,
    request_digest: _requestDigest,
    ...baseFields
  } = normalized;
  const base = normalizeSemanticMemoryProvenance(baseFields);

  if (
    base.origin_class !== 'owner-authored'
    && (base.authority_tier !== 'untrusted-data' || base.review_state !== 'unreviewed')
  ) {
    throw new ValidationError(
      'External or model semantic memory must enter ingestion as untrusted unreviewed data'
    );
  }
  if (
    base.semantic_class === 'instruction-candidate'
    && base.authority_tier !== 'untrusted-data'
  ) {
    throw new ValidationError(
      'Instruction-candidate memory cannot enter ingestion with instruction authority'
    );
  }
  return base;
}

export function assertSemanticMemoryIngestionResult(value, recordInput) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError('Semantic memory ingestion result must be an object');
  }
  const expected = semanticMemoryIngestionResult(recordInput);
  if (canonicalJson(value) !== canonicalJson(expected)) {
    throw new ValidationError(
      'Semantic memory ingestion completion result does not match the persisted provenance record'
    );
  }
  return expected;
}

export function semanticMemoryIngestionInputDigest(recordInput) {
  return digestObject(semanticMemoryIngestionIntent(recordInput).input);
}

function requiredId(value, label) {
  return assertString(value, label, { min: 1, max: 160, pattern: ID });
}

function requiredDigest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}
