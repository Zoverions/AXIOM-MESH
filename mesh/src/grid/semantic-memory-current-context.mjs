import { ValidationError } from '../lib/canonical.mjs';
import { normalizeSemanticMemoryProvenance } from '../lib/semantic-memory-provenance.mjs';
import { projectSemanticMemoryContext } from './semantic-memory-context-projection.mjs';
import { verifySemanticMemoryReviewFromGrid } from './semantic-memory-review-evidence.mjs';
import { isVerifiedSemanticMemoryCurrentEvidence } from './semantic-memory-state-store.mjs';

export const SEMANTIC_MEMORY_CURRENT_CONTEXT_SCHEMA =
  'axiom-semantic-memory-current-context.v1';

export function projectCurrentSemanticMemoryContext(store, record) {
  if (!store || typeof store.verifySemanticMemoryCurrentState !== 'function') {
    throw new TypeError('Current semantic-memory projection requires a semantic state Grid store');
  }
  const normalized = normalizeSemanticMemoryProvenance(record);
  const currentEvidence = store.verifySemanticMemoryCurrentState(normalized);
  if (!isVerifiedSemanticMemoryCurrentEvidence(currentEvidence)) {
    throw new ValidationError('Semantic memory current-state evidence is not Grid-verified in this process');
  }
  if (
    currentEvidence.owner !== normalized.owner
    || currentEvidence.object_id !== normalized.object_id
    || currentEvidence.content_digest !== normalized.content_digest
    || currentEvidence.provenance_digest !== normalized.provenance_digest
    || currentEvidence.downstream_effect_authorized !== false
  ) {
    throw new ValidationError('Semantic memory current-state evidence does not match the projected record');
  }

  const reviewEvidence = normalized.authority_tier === 'owner-approved-instruction'
    ? verifySemanticMemoryReviewFromGrid(store, normalized)
    : undefined;
  const projection = projectSemanticMemoryContext(normalized, {
    ...(reviewEvidence ? { review_evidence: reviewEvidence } : {})
  });

  return Object.freeze({
    ...projection,
    current_context_schema: SEMANTIC_MEMORY_CURRENT_CONTEXT_SCHEMA,
    current_grid_state_verified: true,
    current_state_event_id: currentEvidence.source_event_id,
    current_state_seq: currentEvidence.source_seq,
    requires_current_grid_state: false,
    currentness_scope: 'record-and-recursive-derived-lineage',
    downstream_effect_authorized: false
  });
}
