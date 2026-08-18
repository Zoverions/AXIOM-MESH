import {
  ValidationError,
  digestObject
} from './canonical.mjs';

export const SEMANTIC_MEMORY_SOURCE_EVIDENCE_SCHEMA =
  'axiom-semantic-memory-source-evidence.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const SOURCE_CLASSES = new Set([
  'local-model-generated',
  'retrieved-external',
  'imported',
  'remote-agent',
  'remote-social',
  'tool-output'
]);
const SEMANTIC_CLASSES = new Set([
  'knowledge',
  'preference',
  'procedure',
  'instruction-candidate'
]);
const TOP_LEVEL_KEYS = new Set([
  'schema',
  'owner',
  'source_class',
  'source_principal',
  'source_runtime_id',
  'source_artifact_digest',
  'content_payload_digest',
  'semantic_class',
  'evidence_basis',
  'source_identity_verified',
  'artifact_authenticity_verified',
  'non_authorizing',
  'evidence_digest'
]);

export function normalizeSemanticMemorySourceEvidence(value) {
  const source = plainObject(value, 'Semantic memory source evidence');
  rejectUnknownKeys(source, TOP_LEVEL_KEYS);

  if (
    source.schema !== undefined
    && source.schema !== SEMANTIC_MEMORY_SOURCE_EVIDENCE_SCHEMA
  ) {
    throw new ValidationError('Semantic memory source evidence schema is unsupported');
  }

  const owner = requiredId(source.owner, 'owner');
  const sourceClass = requiredEnum(source.source_class, SOURCE_CLASSES, 'source_class');
  const sourcePrincipal = optionalId(source.source_principal, 'source_principal');
  const sourceRuntimeId = optionalId(source.source_runtime_id, 'source_runtime_id');
  const sourceArtifactDigest = requiredDigest(
    source.source_artifact_digest,
    'source_artifact_digest'
  );
  const contentPayloadDigest = requiredDigest(
    source.content_payload_digest,
    'content_payload_digest'
  );
  const semanticClass = requiredEnum(
    source.semantic_class,
    SEMANTIC_CLASSES,
    'semantic_class'
  );

  if (sourceClass === 'local-model-generated' && !sourceRuntimeId) {
    throw new ValidationError(
      'Local-model semantic source evidence requires source_runtime_id'
    );
  }
  if (
    (sourceClass === 'remote-agent'
      || sourceClass === 'remote-social'
      || sourceClass === 'tool-output')
    && !sourcePrincipal
  ) {
    throw new ValidationError(
      `${sourceClass} semantic source evidence requires source_principal`
    );
  }

  if (
    source.evidence_basis !== undefined
    && source.evidence_basis !== 'owner-observed-artifact'
  ) {
    throw new ValidationError(
      'Semantic source evidence basis must remain owner-observed-artifact in v1'
    );
  }
  if (
    source.source_identity_verified !== undefined
    && source.source_identity_verified !== false
  ) {
    throw new ValidationError(
      'Generic semantic source evidence cannot claim verified source identity'
    );
  }
  if (
    source.artifact_authenticity_verified !== undefined
    && source.artifact_authenticity_verified !== false
  ) {
    throw new ValidationError(
      'Generic semantic source evidence cannot claim verified artifact authenticity'
    );
  }
  if (source.non_authorizing !== undefined && source.non_authorizing !== true) {
    throw new ValidationError('Semantic source evidence must remain non-authorizing');
  }

  const normalized = {
    schema: SEMANTIC_MEMORY_SOURCE_EVIDENCE_SCHEMA,
    owner,
    source_class: sourceClass,
    ...(sourcePrincipal ? { source_principal: sourcePrincipal } : {}),
    ...(sourceRuntimeId ? { source_runtime_id: sourceRuntimeId } : {}),
    source_artifact_digest: sourceArtifactDigest,
    content_payload_digest: contentPayloadDigest,
    semantic_class: semanticClass,
    evidence_basis: 'owner-observed-artifact',
    source_identity_verified: false,
    artifact_authenticity_verified: false,
    non_authorizing: true
  };
  const evidenceDigest = digestObject(normalized);

  if (source.evidence_digest !== undefined) {
    const supplied = requiredDigest(source.evidence_digest, 'evidence_digest');
    if (supplied !== evidenceDigest) {
      throw new ValidationError(
        'Semantic memory source evidence digest does not match normalized content'
      );
    }
  }

  return Object.freeze({
    ...normalized,
    evidence_digest: evidenceDigest
  });
}

export function buildObservedSemanticMemorySourceEvidence({
  owner,
  source_class,
  source_principal,
  source_runtime_id,
  source_artifact_digest,
  content,
  semantic_class
}) {
  return normalizeSemanticMemorySourceEvidence({
    owner,
    source_class,
    ...(source_principal ? { source_principal } : {}),
    ...(source_runtime_id ? { source_runtime_id } : {}),
    source_artifact_digest,
    content_payload_digest: digestObject(
      plainObject(content, 'Semantic source content')
    ),
    semantic_class,
    evidence_basis: 'owner-observed-artifact',
    source_identity_verified: false,
    artifact_authenticity_verified: false,
    non_authorizing: true
  });
}

function plainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${label} must be an object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new ValidationError(`${label} must be a plain object`);
  }
  return value;
}

function rejectUnknownKeys(value, allowed) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new ValidationError(`Semantic memory source evidence field is unsupported: ${key}`);
    }
  }
}

function requiredId(value, label) {
  if (typeof value !== 'string' || !ID.test(value)) {
    throw new ValidationError(`${label} must be a bounded identifier`);
  }
  return value;
}

function optionalId(value, label) {
  return value === undefined ? undefined : requiredId(value, label);
}

function requiredDigest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) {
    throw new ValidationError(`${label} must be a lowercase SHA-256 digest`);
  }
  return value;
}

function requiredEnum(value, allowed, label) {
  if (typeof value !== 'string' || !allowed.has(value)) {
    throw new ValidationError(`${label} is invalid`);
  }
  return value;
}
