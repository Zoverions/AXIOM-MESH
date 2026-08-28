import {
  AxiomError,
  ValidationError,
  digestObject
} from '../lib/canonical.mjs';
import { intentRequestDigest } from '../lib/intent-binding.mjs';
import {
  LOCAL_CONTEXT_SEMANTIC_REVIEW_ACTION,
  normalizeLocalContextSemanticReviewIntent,
  verifyCompletedLocalContextSemanticReview
} from '../lib/context-semantic-review-evidence.mjs';

export function verifyLocalContextSemanticReviewFromGrid(store, {
  candidate,
  trust,
  intent
} = {}) {
  if (
    !store
    || typeof store.requireIntentEvidenceChain !== 'function'
    || typeof store.getIntent !== 'function'
    || typeof store.decodeEventRow !== 'function'
    || !store.db
  ) {
    throw new TypeError('Local context semantic review verification requires a Grid store');
  }

  const normalizedIntent = normalizeLocalContextSemanticReviewIntent(intent, candidate, trust);
  const expectedRequestDigest = intentRequestDigest(normalizedIntent);
  const expectedInputDigest = digestObject(normalizedIntent.input);
  const owner = normalizedIntent.principal.id;
  const verifiedChain = store.requireIntentEvidenceChain();
  const status = store.getStatus();
  if (
    verifiedChain?.valid !== true
    || !Number.isSafeInteger(status?.last_seq)
    || typeof status?.last_hash !== 'string'
  ) {
    throw new ValidationError('Grid did not provide a valid full-chain status for semantic review');
  }

  const acceptedRows = store.db.prepare(`
    SELECT * FROM events
    WHERE kind = 'intent.accepted' AND actor = ?
    ORDER BY seq DESC
  `).all(owner);

  let matchingRequestSeen = false;
  for (const row of acceptedRows) {
    const accepted = store.decodeEventRow(row);
    if (
      accepted.payload?.request_digest !== expectedRequestDigest
      || accepted.payload?.input_digest !== expectedInputDigest
    ) continue;
    matchingRequestSeen = true;
    if (
      accepted.payload?.principal !== owner
      || accepted.payload?.action !== LOCAL_CONTEXT_SEMANTIC_REVIEW_ACTION
    ) {
      throw new ValidationError('semantic review acceptance has invalid owner or action');
    }

    let materializedIntent;
    try {
      materializedIntent = store.getIntent(accepted.payload.intent_id);
    } catch (error) {
      if (error?.code === 'intent_not_found') {
        throw new ValidationError('semantic review acceptance has no materialized intent');
      }
      throw error;
    }
    if (materializedIntent.status !== 'completed') continue;

    const events = store.db.prepare(`
      SELECT * FROM events
      WHERE subject = ?
        AND kind IN ('intent.accepted', 'intent.completed', 'intent.denied', 'intent.failed')
      ORDER BY seq
    `).all(materializedIntent.intent_id).map(eventRow => store.decodeEventRow(eventRow));

    return verifyCompletedLocalContextSemanticReview({
      candidate,
      trust,
      intent: normalizedIntent,
      materializedIntent,
      events,
      chain: {
        valid: true,
        last_seq: status.last_seq,
        last_hash: status.last_hash
      }
    });
  }

  if (matchingRequestSeen) {
    throw new AxiomError(
      'context_semantic_review_not_completed',
      'A matching context semantic review request exists but did not complete successfully',
      409
    );
  }
  throw new AxiomError(
    'context_semantic_review_evidence_not_found',
    'No completed Grid evidence exists for this context semantic review',
    404
  );
}
