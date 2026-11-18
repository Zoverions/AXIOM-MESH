import { ValidationError } from './canonical.mjs';
import {
  SEMANTIC_MEMORY_REVIEW_ACTION,
  SEMANTIC_MEMORY_REVIEW_INPUT_SCHEMA,
  SEMANTIC_MEMORY_REVIEW_PURPOSE,
  normalizeSemanticMemoryProvenance
} from './semantic-memory-provenance.mjs';

export const SEMANTIC_MEMORY_GRID_EVIDENCE_SCHEMA =
  'axiom-semantic-memory-grid-evidence.v1';

// This module derives the exact owner review request a reviewed record claims.
// It grants nothing. The check that Grid rows prove that request completed is
// deliberately not exported from any module: it lives inside
// mesh/src/grid/semantic-memory-review-evidence.mjs and runs only on rows that
// verifySemanticMemoryReviewFromGrid reads from a GridStore itself. Rows built
// from a record alone pass that consistency check, so exporting it would let a
// caller turn a forged record into verified review evidence.

/**
 * The owner review intent a reviewed semantic memory record claims, rebuilt
 * from the record's own review fields. Deny-only: it throws for a record
 * without explicit owner review evidence and never verifies that the review
 * happened. Use verifySemanticMemoryReviewFromGrid(store, record) for that.
 */
export function recordedSemanticMemoryReviewIntent(record) {
  const normalized = normalizeSemanticMemoryProvenance(record);
  requireExplicitReview(normalized);
  return Object.freeze({
    principal: Object.freeze({ type: 'human', id: normalized.owner }),
    action: SEMANTIC_MEMORY_REVIEW_ACTION,
    input: Object.freeze({
      schema: SEMANTIC_MEMORY_REVIEW_INPUT_SCHEMA,
      object_id: normalized.object_id,
      content_digest: normalized.content_digest,
      current_provenance_digest: own(normalized, 'reviewed_from_provenance_digest'),
      decision: own(normalized, 'review_decision')
    }),
    purpose: SEMANTIC_MEMORY_REVIEW_PURPOSE,
    data_scopes: Object.freeze([`memory.semantic:${normalized.object_id}`])
  });
}

// Own data only (#1918): a field that is not an own property of its object,
// such as one inherited from a polluted Object.prototype, reads as absent.
function own(value, key) {
  return value !== null
    && (typeof value === 'object' || typeof value === 'function')
    && Object.hasOwn(value, key)
    ? value[key]
    : undefined;
}

// Normalized records omit the review keys when there is no review, so these
// are read own-only (#1918 F-1): an unreviewed record must never pick review
// evidence up from a polluted Object.prototype.
function requireExplicitReview(record) {
  if (
    own(record, 'review_actor') !== own(record, 'owner')
    || typeof own(record, 'review_request_digest') !== 'string'
    || typeof own(record, 'reviewed_from_provenance_digest') !== 'string'
    || typeof own(record, 'review_decision') !== 'string'
  ) {
    throw new ValidationError('Semantic memory record has no explicit owner review evidence');
  }
}
