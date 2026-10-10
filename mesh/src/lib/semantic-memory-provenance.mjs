import { ValidationError, assertContractNode, digestObject } from './canonical.mjs';
import { intentRequestDigest } from './intent-binding.mjs';

export const SEMANTIC_MEMORY_PROVENANCE_SCHEMA = 'axiom-semantic-memory-provenance.v1';
export const SEMANTIC_MEMORY_REVIEW_INPUT_SCHEMA = 'axiom-semantic-memory-review-input.v1';
export const SEMANTIC_MEMORY_REVIEW_ACTION = 'memory.semantic.review';
export const SEMANTIC_MEMORY_REVIEW_PURPOSE = 'govern-semantic-memory';

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
const REVIEW_DECISIONS = new Set([
  'approve-memory',
  'approve-instruction',
  'quarantine',
  'reject'
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
  'review_request_digest',
  'reviewed_from_provenance_digest',
  'review_decision',
  'parent_object_id',
  'parent_content_digest',
  'parent_provenance_digest',
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
  } else {
    if (!originArtifactDigest) {
      throw new ValidationError('Non-owner memory requires origin_artifact_digest');
    }
    if (originClass === 'local-model-generated' && !originRuntimeId) {
      throw new ValidationError('Local-model-generated memory requires origin_runtime_id');
    }
    if (originClass === 'remote-agent' && !originPrincipal) {
      throw new ValidationError('Remote-agent memory requires origin_principal');
    }
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
  const reviewRequestDigest = optionalDigest(
    source.review_request_digest,
    'review_request_digest'
  );
  const reviewedFromProvenanceDigest = optionalDigest(
    source.reviewed_from_provenance_digest,
    'reviewed_from_provenance_digest'
  );
  const reviewDecision = source.review_decision === undefined
    ? undefined
    : requiredEnum(source.review_decision, REVIEW_DECISIONS, 'review_decision');

  const reviewEvidenceValues = [
    reviewActor,
    reviewRequestDigest,
    reviewedFromProvenanceDigest,
    reviewDecision
  ];
  const reviewEvidenceCount = reviewEvidenceValues.filter(value => value !== undefined).length;
  if (reviewEvidenceCount !== 0 && reviewEvidenceCount !== reviewEvidenceValues.length) {
    throw new ValidationError('Semantic memory review evidence must be complete');
  }
  if (reviewActor !== undefined && reviewActor !== owner) {
    throw new ValidationError('Memory review actor must equal owner');
  }
  if (reviewState === 'unreviewed' && reviewEvidenceCount !== 0) {
    throw new ValidationError('Unreviewed memory cannot contain review evidence');
  }

  const implicitOwnerReview = originClass === 'owner-authored'
    && semanticClass !== 'instruction-candidate'
    && authorityTier === 'owner-memory'
    && reviewState === 'owner-reviewed';
  if (reviewState !== 'unreviewed' && !implicitOwnerReview && reviewEvidenceCount === 0) {
    throw new ValidationError('Semantic memory reviewed state requires explicit owner review evidence');
  }

  if (reviewEvidenceCount !== 0) {
    const expectedReviewRequestDigest = semanticMemoryReviewRequestDigestFromState({
      owner,
      object_id: objectId,
      content_digest: contentDigest,
      current_provenance_digest: reviewedFromProvenanceDigest,
      decision: reviewDecision
    });
    if (reviewRequestDigest !== expectedReviewRequestDigest) {
      throw new ValidationError('Semantic memory review request digest does not match review evidence');
    }
    assertReviewOutcome({
      semanticClass,
      authorityTier,
      reviewState,
      reviewDecision
    });
  }

  if (
    originClass !== 'owner-authored'
    && authorityTier !== 'untrusted-data'
    && reviewEvidenceCount === 0
  ) {
    throw new ValidationError('External memory cannot self-promote authority');
  }
  if (authorityTier === 'owner-approved-instruction') {
    if (semanticClass !== 'instruction-candidate') {
      throw new ValidationError('Instruction authority requires instruction-candidate semantic class');
    }
    if (
      reviewState !== 'owner-reviewed'
      || reviewActor !== owner
      || reviewDecision !== 'approve-instruction'
    ) {
      throw new ValidationError('Instruction authority requires explicit owner instruction review evidence');
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
  const parentProvenanceDigest = optionalDigest(
    source.parent_provenance_digest,
    'parent_provenance_digest'
  );
  const parentValues = [parentObjectId, parentContentDigest, parentProvenanceDigest];
  const parentValueCount = parentValues.filter(value => value !== undefined).length;
  if (parentValueCount !== 0 && parentValueCount !== parentValues.length) {
    throw new ValidationError('Derived-memory parent provenance must be supplied as a complete tuple');
  }
  if (originClass === 'system-derived' && parentValueCount === 0) {
    throw new ValidationError('System-derived memory requires parent provenance');
  }
  if (originClass !== 'system-derived' && parentValueCount !== 0) {
    throw new ValidationError('Only system-derived memory may carry parent provenance');
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
    ...(reviewRequestDigest ? { review_request_digest: reviewRequestDigest } : {}),
    ...(reviewedFromProvenanceDigest
      ? { reviewed_from_provenance_digest: reviewedFromProvenanceDigest }
      : {}),
    ...(reviewDecision ? { review_decision: reviewDecision } : {}),
    ...(parentObjectId ? { parent_object_id: parentObjectId } : {}),
    ...(parentContentDigest ? { parent_content_digest: parentContentDigest } : {}),
    ...(parentProvenanceDigest ? { parent_provenance_digest: parentProvenanceDigest } : {}),
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

// Review evidence binds reviewed_from_provenance_digest (the provenance digest
// of the record as it was when the owner reviewed it), but that digest is only
// a claim unless it is recomputed from the reviewed record's own fields
// (#1937). ownerReviewSemanticMemory keeps every non-review field of the
// reviewed-from record and changes only authority_tier, review_state and the
// four review evidence fields, so the pre-review record is the reviewed record
// without its review evidence, with the pre-review tier and state. That tier
// and state are not recorded; they can only be one of the evidence-free
// states normalizeSemanticMemoryProvenance accepts, so each candidate is
// normalized with the same function, and the claimed digest must equal one of
// those normalized provenance digests (the exact digest
// ownerReviewSemanticMemory recorded). A record reviewed from an
// already-reviewed record (a re-review) cannot be recomputed this way, because
// the earlier review evidence is not carried, and fails closed.
const PRE_REVIEW_AUTHORITY_TIERS = Object.freeze([
  'untrusted-data',
  'owner-memory',
  'owner-approved-instruction'
]);
const PRE_REVIEW_STATES = Object.freeze([
  'unreviewed',
  'owner-reviewed',
  'quarantined',
  'rejected'
]);

function preReviewProvenanceDigest(normalized) {
  const {
    review_actor: _actor,
    review_request_digest: _request,
    reviewed_from_provenance_digest: claimed,
    review_decision: _decision,
    provenance_digest: _digest,
    ...fields
  } = normalized;
  for (let tier = 0; tier < PRE_REVIEW_AUTHORITY_TIERS.length; tier += 1) {
    for (let state = 0; state < PRE_REVIEW_STATES.length; state += 1) {
      let candidate;
      try {
        candidate = normalizeSemanticMemoryProvenance({
          ...fields,
          authority_tier: PRE_REVIEW_AUTHORITY_TIERS[tier],
          review_state: PRE_REVIEW_STATES[state]
        });
      } catch (error) {
        if (error instanceof ValidationError) continue;
        throw error;
      }
      if (candidate.provenance_digest === claimed) return claimed;
    }
  }
  return undefined;
}

/**
 * Recomputes the pre-review provenance digest of an explicitly reviewed
 * semantic memory record from its own fields and requires it to equal the
 * recorded reviewed_from_provenance_digest (#1937). Throws ValidationError on
 * a record without explicit review evidence or on a mismatch, for example a
 * changed origin_class, origin_principal, origin_runtime_id,
 * origin_artifact_digest, semantic_class, ingestion_intent_id or
 * request_digest after review.
 */
export function verifySemanticMemoryReviewedFromProvenance(record) {
  const normalized = normalizeSemanticMemoryProvenance(record);
  if (typeof normalized.reviewed_from_provenance_digest !== 'string') {
    throw new ValidationError('Semantic memory record has no explicit owner review evidence');
  }
  if (preReviewProvenanceDigest(normalized) === undefined) {
    throw new ValidationError(
      'Semantic memory reviewed_from_provenance_digest does not match the record\'s own pre-review provenance'
    );
  }
  return Object.freeze({
    object_id: normalized.object_id,
    reviewed_from_provenance_digest: normalized.reviewed_from_provenance_digest,
    pre_review_provenance_verified: true
  });
}

export function semanticMemoryReviewIntent(record, decision) {
  const normalized = normalizeSemanticMemoryProvenance(record);
  return semanticMemoryReviewIntentFromState({
    owner: normalized.owner,
    object_id: normalized.object_id,
    content_digest: normalized.content_digest,
    current_provenance_digest: normalized.provenance_digest,
    decision
  });
}

export function semanticMemoryReviewRequestDigest(record, decision) {
  return intentRequestDigest(semanticMemoryReviewIntent(record, decision));
}

export function ownerReviewSemanticMemory(record, {
  actor_id,
  review_request_digest,
  decision
} = {}) {
  const normalized = normalizeSemanticMemoryProvenance(record);
  const actorId = requiredId(actor_id, 'review actor_id');
  if (actorId !== normalized.owner) {
    throw new ValidationError('Only the memory owner can apply this review transition');
  }
  const suppliedRequestDigest = requiredDigest(
    review_request_digest,
    'review_request_digest'
  );
  const expectedRequestDigest = semanticMemoryReviewRequestDigest(normalized, decision);
  if (suppliedRequestDigest !== expectedRequestDigest) {
    throw new ValidationError('Semantic memory review request digest does not match the exact transition');
  }

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
    review_request_digest: suppliedRequestDigest,
    reviewed_from_provenance_digest: normalized.provenance_digest,
    review_decision: decision
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
    origin_artifact_digest: normalized.provenance_digest,
    semantic_class,
    authority_tier: 'untrusted-data',
    review_state: 'unreviewed',
    parent_object_id: normalized.object_id,
    parent_content_digest: normalized.content_digest,
    parent_provenance_digest: normalized.provenance_digest,
    ...(ingestion_intent_id ? { ingestion_intent_id } : {}),
    ...(request_digest ? { request_digest } : {}),
    may_affect_authority: false
  });
}

export function evaluateSemanticMemoryUse(record, usage, {
  verified_review_request_digest
} = {}) {
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
    const structurallyEligible = normalized.semantic_class === 'instruction-candidate'
      && normalized.authority_tier === 'owner-approved-instruction'
      && normalized.review_state === 'owner-reviewed'
      && normalized.review_actor === normalized.owner
      && normalized.review_decision === 'approve-instruction'
      && typeof normalized.review_request_digest === 'string';
    if (!structurallyEligible) {
      return { allow: false, code: 'semantic_memory_instruction_denied' };
    }
    if (verified_review_request_digest === undefined) {
      return { allow: false, code: 'semantic_memory_review_evidence_unverified' };
    }
    const verifiedDigest = requiredDigest(
      verified_review_request_digest,
      'verified_review_request_digest'
    );
    if (verifiedDigest !== normalized.review_request_digest) {
      return { allow: false, code: 'semantic_memory_review_evidence_mismatch' };
    }
    // The verified request digest binds only the claimed pre-review digest;
    // the record's own origin must reproduce it (#1937).
    if (preReviewProvenanceDigest(normalized) === undefined) {
      return { allow: false, code: 'semantic_memory_review_provenance_mismatch' };
    }
    return {
      allow: true,
      code: 'semantic_memory_instruction_allowed',
      provenance_digest: normalized.provenance_digest,
      review_request_digest: normalized.review_request_digest
    };
  }
  if (usage === 'authority-mutation') {
    return { allow: false, code: 'semantic_memory_cannot_mutate_authority' };
  }
  throw new ValidationError('Semantic memory usage is unsupported');
}

function semanticMemoryReviewIntentFromState({
  owner,
  object_id,
  content_digest,
  current_provenance_digest,
  decision
}) {
  const reviewDecision = requiredEnum(
    decision,
    REVIEW_DECISIONS,
    'semantic memory review decision'
  );
  return Object.freeze({
    principal: Object.freeze({ type: 'human', id: requiredId(owner, 'review owner') }),
    action: SEMANTIC_MEMORY_REVIEW_ACTION,
    input: Object.freeze({
      schema: SEMANTIC_MEMORY_REVIEW_INPUT_SCHEMA,
      object_id: requiredId(object_id, 'review object_id'),
      content_digest: requiredDigest(content_digest, 'review content_digest'),
      current_provenance_digest: requiredDigest(
        current_provenance_digest,
        'review current_provenance_digest'
      ),
      decision: reviewDecision
    }),
    purpose: SEMANTIC_MEMORY_REVIEW_PURPOSE,
    data_scopes: Object.freeze([`memory.semantic:${object_id}`])
  });
}

function semanticMemoryReviewRequestDigestFromState(state) {
  return intentRequestDigest(semanticMemoryReviewIntentFromState(state));
}

function assertReviewOutcome({
  semanticClass,
  authorityTier,
  reviewState,
  reviewDecision
}) {
  if (reviewDecision === 'approve-memory') {
    if (authorityTier !== 'owner-memory' || reviewState !== 'owner-reviewed') {
      throw new ValidationError('Approve-memory review evidence does not match the resulting state');
    }
    return;
  }
  if (reviewDecision === 'approve-instruction') {
    if (
      semanticClass !== 'instruction-candidate'
      || authorityTier !== 'owner-approved-instruction'
      || reviewState !== 'owner-reviewed'
    ) {
      throw new ValidationError('Approve-instruction review evidence does not match the resulting state');
    }
    return;
  }
  if (reviewDecision === 'quarantine') {
    if (authorityTier !== 'untrusted-data' || reviewState !== 'quarantined') {
      throw new ValidationError('Quarantine review evidence does not match the resulting state');
    }
    return;
  }
  if (reviewDecision === 'reject') {
    if (authorityTier !== 'untrusted-data' || reviewState !== 'rejected') {
      throw new ValidationError('Reject review evidence does not match the resulting state');
    }
  }
}

function plainObject(value, label) {
  // A Proxy, a non-plain prototype or an accessor property is rejected from
  // its descriptors before any read, so no trap or getter runs (#1918). It
  // runs first because Array.isArray throws on a revoked Proxy.
  if (value !== null && typeof value === 'object') assertContractNode(value, label);
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
