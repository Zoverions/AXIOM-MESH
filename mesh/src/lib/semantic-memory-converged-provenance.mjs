import {
  ValidationError,
  assertPlainObject,
  canonicalJson,
  digestObject
} from './canonical.mjs';
import {
  normalizeSemanticMemoryOriginMetadata
} from './semantic-memory-origin-mode.mjs';
import {
  normalizeSemanticMemoryProvenance
} from './semantic-memory-provenance.mjs';
import {
  normalizeSemanticMemorySourceEvidence
} from './semantic-memory-source-evidence.mjs';

const SOURCE_TO_PROVENANCE_ORIGIN = Object.freeze({
  'remote-agent': 'remote-agent',
  'local-model-generated': 'local-model-generated',
  imported: 'imported',
  'external-tool': 'tool-output'
});

export function deriveConvergedSemanticMemoryProvenance({
  owner,
  intent_id,
  request_digest,
  memory,
  source_evidence
}) {
  const nativeMemory = assertPlainObject(memory, 'converged native semantic memory');
  const payload = assertPlainObject(nativeMemory.payload, 'converged semantic memory payload');
  const metadata = assertPlainObject(payload.metadata, 'converged semantic memory metadata');
  const origin = normalizeSemanticMemoryOriginMetadata(metadata);

  if (origin.origin_mode === 'owner-authored') {
    if (source_evidence !== undefined) {
      throw new ValidationError('Owner-authored semantic memory cannot consume source evidence');
    }
    return normalizeSemanticMemoryProvenance({
      object_id: payload.object_id,
      owner,
      content_digest: payload.content_digest,
      origin_class: 'owner-authored',
      origin_principal: owner,
      origin_artifact_digest: digestObject(
        assertPlainObject(payload.evidence, 'semantic memory execution evidence').execution
      ),
      semantic_class: nativeMemory.semantic_class,
      ingestion_intent_id: intent_id,
      request_digest,
      may_affect_authority: false
    });
  }

  const evidence = normalizeSemanticMemorySourceEvidence(source_evidence);
  if (evidence.owner !== owner) {
    throw new ValidationError('Semantic source evidence owner does not match memory owner');
  }
  if (evidence.evidence_digest !== origin.source_evidence_digest) {
    throw new ValidationError('Semantic source evidence digest does not match accepted memory metadata');
  }
  if (evidence.content_payload_digest !== digestObject(payload.content)) {
    throw new ValidationError('Semantic source evidence content digest does not match memory content');
  }
  if (evidence.semantic_class !== nativeMemory.semantic_class) {
    throw new ValidationError('Semantic source evidence class does not match memory semantic class');
  }
  const provenanceOrigin = SOURCE_TO_PROVENANCE_ORIGIN[evidence.source_class];
  if (!provenanceOrigin) {
    throw new ValidationError('Semantic source class has no supported provenance mapping');
  }

  return normalizeSemanticMemoryProvenance({
    object_id: payload.object_id,
    owner,
    content_digest: payload.content_digest,
    origin_class: provenanceOrigin,
    ...(evidence.source_principal
      ? { origin_principal: evidence.source_principal }
      : {}),
    ...(evidence.source_runtime_id
      ? { origin_runtime_id: evidence.source_runtime_id }
      : {}),
    origin_artifact_digest: evidence.evidence_digest,
    semantic_class: nativeMemory.semantic_class,
    ingestion_intent_id: intent_id,
    request_digest,
    may_affect_authority: false
  });
}

export function assertConvergedSemanticMemoryProvenance(expectedInput, actualInput) {
  const expected = normalizeSemanticMemoryProvenance(expectedInput);
  const actual = normalizeSemanticMemoryProvenance(actualInput);
  if (canonicalJson(expected) !== canonicalJson(actual)) {
    throw new ValidationError(
      'Persisted semantic provenance does not match the exact native/source evidence derivation'
    );
  }
  return actual;
}
