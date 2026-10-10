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
  return withOwnFieldReads(read => normalizeProvenanceWith(value, read));
}

function normalizeProvenanceWith(value, read) {
  const source = plainObject(value, 'Semantic memory provenance');
  rejectUnknownKeys(source, TOP_LEVEL_KEYS);

  if (
    read(source, 'schema') !== undefined
    && read(source, 'schema') !== SEMANTIC_MEMORY_PROVENANCE_SCHEMA
  ) {
    throw new ValidationError('Semantic memory provenance schema is unsupported');
  }

  const objectId = requiredId(read(source, 'object_id'), 'object_id');
  const owner = requiredId(read(source, 'owner'), 'owner');
  const contentDigest = requiredDigest(read(source, 'content_digest'), 'content_digest');
  const originClass = requiredEnum(read(source, 'origin_class'), ORIGINS, 'origin_class');
  const originPrincipal = optionalId(read(source, 'origin_principal'), 'origin_principal');
  const originRuntimeId = optionalId(read(source, 'origin_runtime_id'), 'origin_runtime_id');
  const originArtifactDigest = optionalDigest(
    read(source, 'origin_artifact_digest'),
    'origin_artifact_digest'
  );
  const semanticClass = requiredEnum(
    read(source, 'semantic_class'),
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
    read(source, 'authority_tier') ?? defaultAuthority,
    AUTHORITY_TIERS,
    'authority_tier'
  );
  const defaultReview = originClass === 'owner-authored'
    && semanticClass !== 'instruction-candidate'
    ? 'owner-reviewed'
    : 'unreviewed';
  const reviewState = requiredEnum(
    read(source, 'review_state') ?? defaultReview,
    REVIEW_STATES,
    'review_state'
  );
  const reviewActor = optionalId(read(source, 'review_actor'), 'review_actor');
  const reviewRequestDigest = optionalDigest(
    read(source, 'review_request_digest'),
    'review_request_digest'
  );
  const reviewedFromProvenanceDigest = optionalDigest(
    read(source, 'reviewed_from_provenance_digest'),
    'reviewed_from_provenance_digest'
  );
  const reviewDecision = read(source, 'review_decision') === undefined
    ? undefined
    : requiredEnum(read(source, 'review_decision'), REVIEW_DECISIONS, 'review_decision');

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
  if (read(source, 'may_affect_authority') !== undefined && read(source, 'may_affect_authority') !== false) {
    throw new ValidationError('Memory provenance may_affect_authority must remain false');
  }

  const parentObjectId = optionalId(read(source, 'parent_object_id'), 'parent_object_id');
  const parentContentDigest = optionalDigest(read(source, 'parent_content_digest'), 'parent_content_digest');
  const parentProvenanceDigest = optionalDigest(
    read(source, 'parent_provenance_digest'),
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
    ...(read(source, 'ingestion_intent_id')
      ? { ingestion_intent_id: requiredId(read(source, 'ingestion_intent_id'), 'ingestion_intent_id') }
      : {}),
    ...(read(source, 'request_digest')
      ? { request_digest: requiredDigest(read(source, 'request_digest'), 'request_digest') }
      : {}),
    may_affect_authority: false
  };
  const provenanceDigest = digestObject(normalized);

  if (read(source, 'provenance_digest') !== undefined) {
    const suppliedDigest = requiredDigest(read(source, 'provenance_digest'), 'provenance_digest');
    if (suppliedDigest !== provenanceDigest) {
      throw new ValidationError('Semantic memory provenance digest does not match normalized content');
    }
  }

  return {
    ...normalized,
    provenance_digest: provenanceDigest
  };
}

export function semanticMemoryReviewIntent(record, decision) {
  return withOwnFieldReads(read => reviewIntentWith(record, decision, read));
}

function reviewIntentWith(record, decision, read) {
  const normalized = normalizeProvenanceWith(record, read);
  return semanticMemoryReviewIntentFromState({
    owner: normalized.owner,
    object_id: normalized.object_id,
    content_digest: normalized.content_digest,
    current_provenance_digest: normalized.provenance_digest,
    decision
  });
}

export function semanticMemoryReviewRequestDigest(record, decision) {
  return withOwnFieldReads(read => reviewRequestDigestWith(record, decision, read));
}

function reviewRequestDigestWith(record, decision, read) {
  return intentRequestDigest(reviewIntentWith(record, decision, read));
}

export function ownerReviewSemanticMemory(record, {
  actor_id: _actorId,
  review_request_digest: _reviewRequestDigest,
  decision: _decision
} = {}) {
  // The destructuring above is kept only so null/non-coercible options throw
  // exactly the TypeError main throws; fields are re-read own-property only.
  const options = optionsArgument(arguments[1]);
  return withOwnFieldReads(read => ownerReviewWith(
    record,
    read(options, 'actor_id'),
    read(options, 'review_request_digest'),
    read(options, 'decision'),
    read
  ));
}

function ownerReviewWith(record, actor_id, review_request_digest, decision, read) {
  const normalized = normalizeProvenanceWith(record, read);
  const actorId = requiredId(actor_id, 'review actor_id');
  if (actorId !== normalized.owner) {
    throw new ValidationError('Only the memory owner can apply this review transition');
  }
  const suppliedRequestDigest = requiredDigest(
    review_request_digest,
    'review_request_digest'
  );
  const expectedRequestDigest = reviewRequestDigestWith(normalized, decision, read);
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
  return normalizeProvenanceWith({
    ...base,
    authority_tier: authorityTier,
    review_state: reviewState,
    review_actor: actorId,
    review_request_digest: suppliedRequestDigest,
    reviewed_from_provenance_digest: normalized.provenance_digest,
    review_decision: decision
  }, read);
}

export function deriveSemanticMemoryProvenance(parent, {
  object_id: _objectId,
  content_digest: _contentDigest,
  semantic_class: _semanticClass = 'knowledge',
  ingestion_intent_id: _ingestionIntentId,
  request_digest: _requestDigest
} = {}) {
  // Destructuring kept for main's exact TypeError on null options; fields are
  // re-read own-property only.
  const options = optionsArgument(arguments[1]);
  return withOwnFieldReads(read => deriveProvenanceWith(parent, options, read));
}

function deriveProvenanceWith(parent, options, read) {
  const object_id = read(options, 'object_id');
  const content_digest = read(options, 'content_digest');
  const suppliedSemanticClass = read(options, 'semantic_class');
  const semantic_class = suppliedSemanticClass === undefined ? 'knowledge' : suppliedSemanticClass;
  const ingestion_intent_id = read(options, 'ingestion_intent_id');
  const request_digest = read(options, 'request_digest');
  const normalized = normalizeProvenanceWith(parent, read);
  return normalizeProvenanceWith({
    object_id,
    owner: normalized.owner,
    content_digest,
    origin_class: 'system-derived',
    origin_principal: read(normalized, 'origin_principal') ?? normalized.owner,
    origin_runtime_id: read(normalized, 'origin_runtime_id'),
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
  }, read);
}

export function evaluateSemanticMemoryUse(record, usage, {
  verified_review_request_digest: _verifiedReviewRequestDigest
} = {}) {
  // Destructuring kept for main's exact TypeError on null options; the field is
  // re-read own-property only.
  const options = optionsArgument(arguments[2]);
  return withOwnFieldReads(read => evaluateUseWith(
    record,
    usage,
    read(options, 'verified_review_request_digest'),
    read
  ));
}

function evaluateUseWith(record, usage, verified_review_request_digest, read) {
  const normalized = normalizeProvenanceWith(record, read);
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
      && read(normalized, 'review_actor') === normalized.owner
      && read(normalized, 'review_decision') === 'approve-instruction'
      && typeof read(normalized, 'review_request_digest') === 'string';
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
    if (verifiedDigest !== read(normalized, 'review_request_digest')) {
      return { allow: false, code: 'semantic_memory_review_evidence_mismatch' };
    }
    return {
      allow: true,
      code: 'semantic_memory_instruction_allowed',
      provenance_digest: normalized.provenance_digest,
      review_request_digest: read(normalized, 'review_request_digest')
    };
  }
  if (usage === 'authority-mutation') {
    return { allow: false, code: 'semantic_memory_cannot_mutate_authority' };
  }
  throw new ValidationError('Semantic memory usage is unsupported');
}

// Own-property field reads (#1918). A caller-supplied field that is visible
// only through the prototype chain (at any depth, e.g. Object.prototype
// pollution) reads as absent, so inherited data can never supply review
// evidence, authority, a verified digest or a clock. Deny dominance: whenever
// any inherited field was visible, the same computation is re-run with main's
// ordinary (inherited) reads; a deny from that run, whether thrown or returned
// as { allow: false }, is what the caller gets. Inherited data may therefore
// only add denies, never remove them.
// NOTE: private copy; consolidate with the private own() in
// semantic-memory-grid-evidence.mjs (#1936) into one canonical helper in
// canonical.mjs (tracked separately; not consolidated here).
function withOwnFieldReads(run) {
  let inheritedVisible = false;
  const ownRead = (target, key) => {
    if (target === null || target === undefined) return undefined;
    if (Object.hasOwn(target, key)) return target[key];
    if (key in Object(target)) inheritedVisible = true;
    return undefined;
  };
  let result;
  let ownError;
  let ownThrew = false;
  try {
    result = run(ownRead);
  } catch (error) {
    ownThrew = true;
    ownError = error;
  }
  if (inheritedVisible) {
    const inheritedResult = run(inheritedRead);
    if (isReturnedDeny(inheritedResult)) return inheritedResult;
  }
  if (ownThrew) throw ownError;
  return result;
}

function isReturnedDeny(value) {
  return value !== null
    && typeof value === 'object'
    && Object.hasOwn(value, 'allow')
    && value.allow === false;
}

/**
 * Internal to the semantic-memory modules (used by semantic-memory-lifecycle):
 * runs `run` under the own-read / deny-dominance discipline above. `run`
 * receives a reader whose `read(target, key)` and provenance cores must be
 * used for every caller-supplied read, so both passes see one consistent mode.
 * Not a verify or validate entry point; callers should use the public
 * functions.
 */
export function withSemanticMemoryOwnReads(run) {
  return withOwnFieldReads(read => run(Object.freeze({
    read,
    normalize: value => normalizeProvenanceWith(value, read),
    evaluateUse: (record, usage, verifiedReviewRequestDigest) => evaluateUseWith(
      record,
      usage,
      verifiedReviewRequestDigest,
      read
    )
  })));
}

function inheritedRead(target, key) {
  return target === null || target === undefined ? undefined : target[key];
}

function optionsArgument(value) {
  return value === undefined ? {} : value;
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
