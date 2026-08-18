import { AxiomError, ValidationError } from '../lib/canonical.mjs';
import {
  SEMANTIC_MEMORY_REVIEW_ACTION,
  normalizeSemanticMemoryProvenance
} from '../lib/semantic-memory-provenance.mjs';
import { verifySemanticMemoryGridEvidence } from '../lib/semantic-memory-grid-evidence.mjs';

export function verifySemanticMemoryReviewFromGrid(store, record) {
  if (!store || typeof store.requireIntentEvidenceChain !== 'function') {
    throw new TypeError('Semantic memory review verification requires a Grid store');
  }
  const normalized = normalizeSemanticMemoryProvenance(record);
  if (typeof normalized.review_request_digest !== 'string') {
    throw new ValidationError('Semantic memory record has no explicit review request');
  }

  const chain = store.requireIntentEvidenceChain();
  const acceptedRows = store.db.prepare(`
    SELECT * FROM events
    WHERE kind = 'intent.accepted' AND actor = ?
    ORDER BY seq DESC
  `).all(normalized.owner);

  let matchingRequestSeen = false;
  for (const row of acceptedRows) {
    const accepted = store.decodeEventRow(row);
    if (accepted.payload?.request_digest !== normalized.review_request_digest) continue;
    matchingRequestSeen = true;
    if (
      accepted.payload?.principal !== normalized.owner
      || accepted.payload?.action !== SEMANTIC_MEMORY_REVIEW_ACTION
    ) {
      throw new ValidationError('Semantic memory review acceptance has invalid principal or action');
    }

    let intent;
    try {
      intent = store.getIntent(accepted.payload.intent_id);
    } catch (error) {
      if (error?.code === 'intent_not_found') {
        throw new ValidationError('Semantic memory review acceptance has no materialized intent');
      }
      throw error;
    }
    if (intent.status !== 'completed') continue;

    const events = store.db.prepare(`
      SELECT * FROM events
      WHERE subject = ?
        AND kind IN ('intent.accepted', 'intent.completed', 'intent.denied', 'intent.failed')
      ORDER BY seq
    `).all(intent.intent_id).map(eventRow => store.decodeEventRow(eventRow));

    return verifySemanticMemoryGridEvidence(normalized, {
      intent,
      events,
      chain
    });
  }

  if (matchingRequestSeen) {
    throw new AxiomError(
      'semantic_memory_review_not_completed',
      'A matching semantic memory review request exists but did not complete successfully',
      409
    );
  }
  throw new AxiomError(
    'semantic_memory_review_evidence_not_found',
    'No completed Grid evidence exists for this semantic memory review',
    404
  );
}
