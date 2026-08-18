import { ValidationError, assertPlainObject, assertString } from './canonical.mjs';

export const SEMANTIC_ORIGIN_METADATA_KEY = 'axiom_semantic_origin';
export const SEMANTIC_SOURCE_EVIDENCE_METADATA_KEY =
  'axiom_semantic_source_evidence_digest';

const DIGEST = /^[a-f0-9]{64}$/;
const ORIGIN_MODE = /^(owner-authored|sourced)$/;

export function normalizeSemanticMemoryOriginMetadata(metadataInput) {
  const metadata = assertPlainObject(metadataInput, 'semantic memory metadata');
  const originMode = assertString(
    metadata[SEMANTIC_ORIGIN_METADATA_KEY],
    `memory.put metadata.${SEMANTIC_ORIGIN_METADATA_KEY}`,
    { max: 32, pattern: ORIGIN_MODE }
  );
  const sourceEvidenceDigest = metadata[SEMANTIC_SOURCE_EVIDENCE_METADATA_KEY] === undefined
    ? undefined
    : assertString(
        metadata[SEMANTIC_SOURCE_EVIDENCE_METADATA_KEY],
        `memory.put metadata.${SEMANTIC_SOURCE_EVIDENCE_METADATA_KEY}`,
        { min: 64, max: 64, pattern: DIGEST }
      );

  if (originMode === 'sourced' && !sourceEvidenceDigest) {
    throw new ValidationError('Sourced semantic memory requires retained source evidence');
  }
  if (originMode === 'owner-authored' && sourceEvidenceDigest) {
    throw new ValidationError('Owner-authored semantic memory cannot carry sourced evidence');
  }

  return Object.freeze({
    origin_mode: originMode,
    ...(sourceEvidenceDigest ? { source_evidence_digest: sourceEvidenceDigest } : {})
  });
}
