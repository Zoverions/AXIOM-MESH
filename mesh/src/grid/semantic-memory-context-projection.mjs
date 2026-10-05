import { ValidationError } from '../lib/canonical.mjs';
import {
  evaluateSemanticMemoryUse,
  normalizeSemanticMemoryProvenance
} from '../lib/semantic-memory-provenance.mjs';
import { isVerifiedSemanticMemoryReviewEvidence } from './semantic-memory-review-evidence.mjs';

export const SEMANTIC_MEMORY_CONTEXT_PROJECTION_SCHEMA =
  'axiom-semantic-memory-context-projection.v1';

export function projectSemanticMemoryContext(record, {
  review_evidence
} = {}) {
  const normalized = normalizeSemanticMemoryProvenance(record);
  const common = Object.freeze({
    schema: SEMANTIC_MEMORY_CONTEXT_PROJECTION_SCHEMA,
    object_id: normalized.object_id,
    owner: normalized.owner,
    content_digest: normalized.content_digest,
    origin_class: normalized.origin_class,
    semantic_class: normalized.semantic_class,
    provenance_digest: normalized.provenance_digest,
    may_modify_axiom_authority: false,
    may_authorize_tools: false,
    may_self_persist: false,
    may_retransmit: false,
    requires_current_grid_state: true
  });

  const retrieval = evaluateSemanticMemoryUse(normalized, 'ordinary-retrieval');
  if (!retrieval.allow) {
    return Object.freeze({
      ...common,
      include: false,
      context_lane: 'excluded',
      model_treatment: 'omit',
      reason: retrieval.code
    });
  }

  if (normalized.authority_tier === 'owner-approved-instruction') {
    if (review_evidence === undefined) {
      return dataProjection(common, normalized, 'review_evidence_missing');
    }
    if (!isVerifiedSemanticMemoryReviewEvidence(review_evidence)) {
      throw new ValidationError('Semantic memory review evidence is not Grid-verified in this process');
    }
    if (
      review_evidence.owner !== normalized.owner
      || review_evidence.object_id !== normalized.object_id
      || review_evidence.review_decision !== 'approve-instruction'
      || review_evidence.verified_review_request_digest !== normalized.review_request_digest
      || review_evidence.downstream_effect_authorized !== false
    ) {
      throw new ValidationError('Semantic memory review evidence does not match the projected record');
    }

    const instruction = evaluateSemanticMemoryUse(normalized, 'privileged-instruction', {
      verified_review_request_digest: review_evidence.verified_review_request_digest
    });
    if (!instruction.allow) {
      throw new ValidationError('Semantic memory record is not eligible for owner-instruction context');
    }
    return Object.freeze({
      ...common,
      include: true,
      context_lane: 'owner-instruction-memory',
      model_treatment: 'isolated-owner-instruction',
      instruction_semantics: true,
      review_intent_id: review_evidence.intent_id,
      review_trace_id: review_evidence.trace_id,
      verified_review_request_digest: review_evidence.verified_review_request_digest,
      reason: 'grid_verified_owner_instruction'
    });
  }

  if (review_evidence !== undefined) {
    if (!isVerifiedSemanticMemoryReviewEvidence(review_evidence)) {
      throw new ValidationError('Semantic memory review evidence is not Grid-verified in this process');
    }
    if (
      review_evidence.owner !== normalized.owner
      || review_evidence.object_id !== normalized.object_id
      || review_evidence.verified_review_request_digest !== normalized.review_request_digest
    ) {
      throw new ValidationError('Semantic memory review evidence does not match the projected record');
    }
  }
  return dataProjection(common, normalized, 'ordinary_memory_data');
}

function dataProjection(common, record, reason) {
  return Object.freeze({
    ...common,
    include: true,
    context_lane: 'memory-data',
    model_treatment: 'quoted-reference-data',
    instruction_semantics: false,
    source_authority_tier: record.authority_tier,
    reason
  });
}
