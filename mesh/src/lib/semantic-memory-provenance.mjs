import { ValidationError, digestObject } from './canonical.mjs';

export const SEMANTIC_MEMORY_PROVENANCE_SCHEMA = 'axiom-semantic-memory-provenance.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const HEX_DIGEST = /^[a-f0-9]{64}$/;
const ORIGINS = new Set([
  'owner-authored',
  'local-model-generated',
  'retrieved-external',
  'imported',
  'remote-agent',
  'remote-social',
  'tool-output',
  'system-derived'
]);
const SEMANTIC_CLASSES = new Set([
  'knowledge',
  'preference',
  'procedure',
  'instruction-candidate'
]);
const AUTHORITY_TIERS = new Set([
  'untrusted-data',
  'owner-memory',
  'owner-approved-instruction'
]);
const REVIEW_STATES = new Set([
  'unreviewed',
  'owner-reviewed',
  'quarantined',
  'rejected'
]);
const TOP_LEVEL_KEYS = new Set([
  'schema',
  'object_id',
  'owner',
  'content_digest',
  'origin_class',
  'origin_principal',
  'origin_runtime_id',
  'origin_artifact_digest',
  'semantic_class',
  'authority_tier',
  'review_state',
  'review_actor',
  'review_event_digest',
  'parent_object_id',
  'parent_content_digest',
  'ingestion_intent_id',
  'request_digest',
  'may_affect_authority',
  'provenance_digest'
]);

export function normalizeSemanticMemoryProvenance(value) {
  const source = plainObject(value, 'Semantic memory provenance');
  rejectUnknownKeys(source, TOP_LEVEL_KEYS);

  if (
    source.schema !== undefined
    && source.schema !== SEMANTIC_MEMORY_PROVENANCE_SCHEMA
  ) {
    throw new ValidationError('Semantic memory provenance schema is unsupported');
  }

  const objectId = requiredId(source.object_id, 'object_id');
  const owner = requiredId(source.owner, 'owner');
  const contentDigest = requiredDigest(source.content_digest, 'content_digest');
  const originClass = requiredEnum(source.origin_class, ORIGINS, 'origin_class');
  const originPrincipal = optionalId(source.origin_principal, 'origin_principal');
  const originRuntimeId = optionalId(source.origin_runtime_id, 'origin_runtime_id');
  const originArtifactDigest = optionalDigest(
    source.origin_artifact_digest,
    'origin_artifact_digest'
  );
  const semanticClass = requiredEnum(
    source.semantic_class,
    SEMANTIC_CLASSES,
    'semantic_class'
  );

  if (originClass === 'owner-authored') {
    if (originPrincipal !== undefined && originPrincipal !== owner) {
      throw new ValidationError('Owner-authored memory origin must equal owner');
    }
  } else if (originClass === 'local-model-generated') {
    if (!originRuntimeId) {
      throw new ValidationError('Local-model-generated memory requires origin_runtime_id');
    }
  } else if (originClass === 'remote-agent') {
    if (!originPrincipal) {
      throw new ValidationError('Remote-agent memory requires origin_principal');
    }
  } else if (!originArtifactDigest) {
    throw new ValidationError('Non-owner memory requires origin_artifact_digest');
  }

  const defaultAuthority = originClass === 'owner-authored'
    && semanticClass !== 'instruction-candidate'
    ? 'owner-memory'
    : 'untrusted-data';
  const authorityTier = requiredEnum(
    source.authority_tier ?? defaultAuthority,
    AUTHORITY_TIERS,
    'authority_tier'
  );
  const defaultReview = originClass === 'owner-authored'
    && semanticClass !== 'instruction-candidate'
    ? 'owner-reviewed'
    : 'unreviewed';
  const reviewState = requiredEnum(
    source.review_state ?? defaultReview,
    REVIEW_STATES,
    'review_state'
  );
  const reviewActor = optionalId(source.review_actor, 'review_actor');
  const reviewEventDigest = optionalDigest(source.review_event_digest, 'review_event_digest');

  if ((reviewActor === undefined) !== (reviewEventDigest === undefined)) {
    throw new ValidationError('Memory review actor and event digest must be supplied together');
  }
  if (reviewActor !== undefined && reviewActor !== owner) {
    throw new ValidationError('Memory review actor must equal owner');
  }
  if (reviewState === 'unreviewed' && reviewActor !== undefined) {
    throw new ValidationError('Unreviewed memory cannot contain review evidence');
  }
  if (
    originClass !== 'owner-authored'
    && authorityTier !== 'untrusted-data'
    && (reviewState !== 'owner-reviewed' || reviewActor === undefined)
  ) {
    throw new ValidationError('External memory cannot self-promote authority');
  }
  if (authorityTier === 'owner-approved-instruction') {
    if (semanticClass !== 'instruction-candidate') {
      throw new ValidationError('Instruction authority requires instruction-candidate semantic class');
    }
    if (reviewState !== 'owner-reviewed' || reviewActor === undefined) {
      throw new ValidationError('Instruction authority requires explicit owner review evidence');
    }
  }
  if (reviewState === 'quarantined' || reviewState === 'rejected') {
    if (authorityTier !== 'untrusted-data') {
      throw new ValidationError('Quarantined or rejected memory must remain untrusted-data');
    }
  }
  if (source.may_affect_authority !== undefined && source.may_affect_authority !== false) {
    throw new ValidationError('Memory provenance may_affect_authority must remain false');
  }

  const parentObjectId = optionalId(source.parent_object_id, 'parent_object_id');
  const parentContentDigest = optionalDigest(source.parent_content_digest, 'parent_content_digest');
  if ((parentObjectId === undefined) !== (parentContentDigest === undefined)) {
    throw new ValidationError('Derived-memory parent id and content digest must be supplied together');
  }
  if (originClass === 'system-derived' && !parentObjectId) {
    throw new ValidationError('System-derived memory requires parent provenance');
  }

  const normalized = {
    schema: SEMANTIC_MEMORY_PROVENANCE_SCHEMA,
    object_id: objectId,
    owner,
    content_digest: contentDigest,
    origin_class: originClass,
    ...(originClass === 'owner-authored'
      ? { origin_principal: owner }
      : originPrincipal
        ? { origin_principal: originPrincipal }
        : {}),
    ...(originRuntimeId ? { origin_runtime_id: originRuntimeId } : {}),
    ...(originArtifactDigest ? { origin_artifact_digest: originArtifactDigest } : {}),
    semantic_class: semanticClass,
    authority_tier: authorityTier,
    review_state: reviewState,
    ...(reviewActor ? { review_actor: reviewActor } : {}),
    ...(reviewEventDigest ? { review_event_digest: reviewEventDigest } : {}),
    ...(parentObjectId ? { parent_object_id: parentObjectId } : {}),
    ...(parentContentDigest ? { parent_content_digest: parentContentDigest } : {}),
    ...(source.ingestion_intent_id
      ? { ingestion_intent_id: requiredId(source.ingestion_intent_id, 'ingestion_intent_id') }
      : {}),
    ...(source.request_digest
      ? { request_digest: requiredDigest(source.request_digest, 'request_digest') }
      : {}),
    may_affect_authority: false
  };
  const provenanceDigest = digestObject(normalized);

  if (source.provenance_digest !== undefined) {
    const suppliedDigest = requiredDigest(source.provenance_digest, 'provenance_digest');
    if (suppliedDigest !== provenanceDigest) {
      throw new ValidationError('Semantic memory provenance digest does not match normalized content');
    }
  }

  return {
    ...normalized,
    provenance_digest: provenanceDigest
  };
}

export function ownerReviewSemanticMemory(record, {
  actor_id,
  review_event_digest,
  decision
} = {}) {
  const normalized = normalizeSemanticMemoryProvenance(record);
  const actorId = requiredId(actor_id, 'review actor_id');
  if (actorId !== normalized.owner) {
    throw new ValidationError('Only the memory owner can apply this review transition');
  }
  const reviewEventDigest = requiredDigest(review_event_digest, 'review_event_digest');

  let authorityTier;
  let reviewState;
  if (decision === 'approve-memory') {
    authorityTier = 'owner-memory';
    reviewState = 'owner-reviewed';
  } else if (decision === 'approve-instruction') {
    if (normalized.semantic_class !== 'instruction-candidate') {
      throw new ValidationError('Only instruction-candidate memory can be approved as instruction');
    }
    authorityTier = 'owner-approved-instruction';
    reviewState = 'owner-reviewed';
  } else if (decision === 'quarantine') {
    authorityTier = 'untrusted-data';
    reviewState = 'quarantined';
  } else if (decision === 'reject') {
    authorityTier = 'untrusted-data';
    reviewState = 'rejected';
  } else {
    throw new ValidationError('Semantic memory review decision is invalid');
  }

  const { provenance_digest: _ignored, ...base } = normalized;
  return normalizeSemanticMemoryProvenance({
    ...base,
    authority_tier: authorityTier,
    review_state: reviewState,
    review_actor: actorId,
    review_event_digest: reviewEventDigest
  });
}

export function deriveSemanticMemoryProvenance(parent, {
  object_id,
  content_digest,
  semantic_class = 'knowledge',
  ingestion_intent_id,
  request_digest
} = {}) {
  const normalized = normalizeSemanticMemoryProvenance(parent);
  return normalizeSemanticMemoryProvenance({
    object_id,
    owner: normalized.owner,
    content_digest,
    origin_class: 'system-derived',
    origin_principal: normalized.origin_principal ?? normalized.owner,
    origin_runtime_id: normalized.origin_runtime_id,
    origin_artifact_digest: normalized.content_digest,
    semantic_class,
    authority_tier: 'untrusted-data',
    review_state: 'unreviewed',
    parent_object_id: normalized.object_id,
    parent_content_digest: normalized.content_digest,
    ...(ingestion_intent_id ? { ingestion_intent_id } : {}),
    ...(request_digest ? { request_digest } : {}),
    may_affect_authority: false
  });
}

export function evaluateSemanticMemoryUse(record, usage) {
  const normalized = normalizeSemanticMemoryProvenance(record);
  if (normalized.review_state === 'quarantined') {
    return { allow: false, code: 'semantic_memory_quarantined' };
  }
  if (normalized.review_state === 'rejected') {
    return { allow: false, code: 'semantic_memory_rejected' };
  }
  if (usage === 'ordinary-retrieval') {
    return {
      allow: true,
      code: 'semantic_memory_retrieval_allowed',
      authority_tier: normalized.authority_tier,
      provenance_digest: normalized.provenance_digest
    };
  }
  if (usage === 'privileged-instruction') {
    const allow = normalized.semantic_class === 'instruction-candidate'
      && normalized.authority_tier === 'owner-approved-instruction'
      && normalized.review_state === 'owner-reviewed'
      && normalized.review_actor === normalized.owner;
    return {
      allow,
      code: allow
        ? 'semantic_memory_instruction_allowed'
        : 'semantic_memory_instruction_denied',
      ...(allow ? { provenance_digest: normalized.provenance_digest } : {})
    };
  }
  if (usage === 'authority-mutation') {
    return { allow: false, code: 'semantic_memory_cannot_mutate_authority' };
  }
  throw new ValidationError('Semantic memory usage is unsupported');
}

function plainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${label} must be an object`);
  }
  return value;
}

function rejectUnknownKeys(value, allowed) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new ValidationError(`Unsupported semantic memory provenance field: ${key}`);
    }
  }
}

function requiredEnum(value, allowed, label) {
  if (!allowed.has(value)) throw new ValidationError(`${label} is invalid`);
  return value;
}

function requiredId(value, label) {
  if (typeof value !== 'string' || !ID.test(value)) {
    throw new ValidationError(`${label} is invalid`);
  }
  return value;
}

function optionalId(value, label) {
  if (value === undefined || value === null) return undefined;
  return requiredId(value, label);
}

function requiredDigest(value, label) {
  if (typeof value !== 'string' || !HEX_DIGEST.test(value)) {
    throw new ValidationError(`${label} must be a lowercase SHA-256 digest`);
  }
  return value;
}

function optionalDigest(value, label) {
  if (value === undefined || value === null) return undefined;
  return requiredDigest(value, label);
}
