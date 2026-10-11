import {
  AxiomError,
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject
} from '../lib/canonical.mjs';
import { intentRequestDigest } from '../lib/intent-binding.mjs';
import {
  SEMANTIC_MEMORY_REVIEW_ACTION,
  normalizeSemanticMemoryProvenance,
  verifySemanticMemoryReviewedFromProvenance
} from '../lib/semantic-memory-provenance.mjs';
import {
  SEMANTIC_MEMORY_GRID_EVIDENCE_SCHEMA,
  recordedSemanticMemoryReviewIntent
} from '../lib/semantic-memory-grid-evidence.mjs';
import { GridStore } from './store.mjs';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;

/**
 * The Grid-verified owner review for a semantic memory record, and the only
 * exported way to obtain verified semantic-memory review evidence. It reads
 * the completed 'memory.semantic.review' intent for the record's exact
 * review_request_digest, its accepted/completed events and the verified
 * evidence chain from `store` itself, then checks those rows against the
 * record (including the record's own pre-review provenance, #1937). This is
 * the only sanctioned source of `verified_review_request_digest` for
 * evaluateSemanticMemoryUse and evaluateSemanticMemoryLifecycleUse. A record's
 * claimed authority_tier, review_state, review_decision or review digests, and
 * any retrieval result, are never a substitute.
 *
 * `store` must be a GridStore instance. Anything else, such as a plain
 * object with store-shaped methods serving caller-built rows, is rejected
 * with a TypeError. The store itself is the trust root: this function proves
 * what the given GridStore holds, not which store a caller chose, and it does
 * not defend against a caller that subverts the GridStore object it passes.
 *
 * Throws when no completed review exists (404), when a matching review did
 * not complete (409), or when the rows do not bind the exact review.
 * See docs/architecture/SEMANTIC-MEMORY-RETRIEVAL-BOUNDARY.md.
 */
export function verifySemanticMemoryReviewFromGrid(store, record) {
  if (!(store instanceof GridStore) || typeof store.requireIntentEvidenceChain !== 'function') {
    throw new TypeError('Semantic memory review verification requires a Grid store');
  }
  const normalized = normalizeSemanticMemoryProvenance(record);
  // Own-only (#1918 F-1): unreviewed records omit review_request_digest, so an
  // inherited (polluted) value must not select review evidence.
  const reviewRequestDigest = Object.hasOwn(normalized, 'review_request_digest')
    ? normalized.review_request_digest
    : undefined;
  if (typeof reviewRequestDigest !== 'string') {
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
    if (accepted.payload?.request_digest !== reviewRequestDigest) continue;
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

    return verifySemanticMemoryGridEvidence(normalized, intent, events, chain);
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

// Own data only (#1918): a field that is not an own property of its object,
// such as one inherited from a polluted Object.prototype, reads as absent.
function own(value, key) {
  return value !== null
    && (typeof value === 'object' || typeof value === 'function')
    && Object.hasOwn(value, key)
    ? value[key]
    : undefined;
}

function ownEntry(array, item) {
  return array.some((entry, index) => entry === item && Object.hasOwn(array, index));
}

// Checks that the intent row, events and chain summary read from the store
// bind the record's exact owner review. NOT exported (deny-only hardening):
// rows a caller assembles from the record alone pass these checks, so they are
// Grid evidence only because verifySemanticMemoryReviewFromGrid read them from
// a GridStore. Moved here from mesh/src/lib/semantic-memory-grid-evidence.mjs,
// where it was exported as verifySemanticMemoryGridEvidence(record, { intent,
// events, chain }); the checks are unchanged, the rows are now positional.
// Row fields stay own-only reads (#1918) as defence in depth against a
// corrupted store.
function verifySemanticMemoryGridEvidence(record, intent, events, chain) {
  const normalized = normalizeSemanticMemoryProvenance(record);
  // Throws first for a record without explicit owner review evidence, as
  // before; the record is already normalized, so this is the same check.
  const reviewIntent = recordedSemanticMemoryReviewIntent(normalized);
  // The claimed pre-review digest must be the record's own (#1937).
  verifySemanticMemoryReviewedFromProvenance(normalized);
  const expectedRequestDigest = intentRequestDigest(reviewIntent);
  if (expectedRequestDigest !== own(normalized, 'review_request_digest')) {
    throw new ValidationError('Semantic memory recorded review request digest is invalid');
  }
  if (!chain || own(chain, 'valid') !== true) {
    throw new ValidationError('Semantic memory review requires a valid Grid evidence chain');
  }

  const intentRow = assertPlainObject(intent, 'semantic review intent');
  const intentId = assertString(own(intentRow, 'intent_id'), 'semantic review intent_id', {
    max: 160,
    pattern: ID
  });
  const traceId = assertString(own(intentRow, 'trace_id'), 'semantic review trace_id', {
    max: 160,
    pattern: ID
  });
  if (
    own(intentRow, 'principal') !== normalized.owner
    || own(intentRow, 'action') !== SEMANTIC_MEMORY_REVIEW_ACTION
    || own(intentRow, 'status') !== 'completed'
    || own(intentRow, 'request_digest') !== expectedRequestDigest
    || own(intentRow, 'input_digest') !== digestObject(reviewIntent.input)
  ) {
    throw new ValidationError('Semantic memory materialized intent does not match the exact review');
  }

  if (!Array.isArray(events)) {
    throw new ValidationError('Semantic memory review events must be an array');
  }
  const acceptedEvents = events.filter(event => event?.kind === 'intent.accepted');
  const completedEvents = events.filter(event => event?.kind === 'intent.completed');
  const adverseEvents = events.filter(event =>
    event?.kind === 'intent.denied' || event?.kind === 'intent.failed'
  );
  if (acceptedEvents.length !== 1 || completedEvents.length !== 1) {
    throw new ValidationError('Semantic memory review requires one accepted and one completed event');
  }
  if (adverseEvents.length) {
    throw new ValidationError('Semantic memory review contains a denied or failed terminal event');
  }

  const accepted = acceptedEvents[0];
  const completed = completedEvents[0];
  // The counts above keep the original reads, so an inherited entry or kind
  // can only add a deny. The one accepted and one completed event must also
  // be own array entries with an own kind (#1918).
  if (
    !ownEntry(events, accepted)
    || !ownEntry(events, completed)
    || own(accepted, 'kind') !== 'intent.accepted'
    || own(completed, 'kind') !== 'intent.completed'
  ) {
    throw new ValidationError('Semantic memory review requires one accepted and one completed event');
  }
  const acceptedSeq = own(accepted, 'seq');
  const completedSeq = own(completed, 'seq');
  if (
    !Number.isSafeInteger(acceptedSeq)
    || !Number.isSafeInteger(completedSeq)
    || acceptedSeq >= completedSeq
    || own(accepted, 'actor') !== normalized.owner
    || own(completed, 'actor') !== normalized.owner
    || own(accepted, 'trace_id') !== traceId
    || own(completed, 'trace_id') !== traceId
    || own(accepted, 'subject') !== intentId
    || own(completed, 'subject') !== intentId
  ) {
    throw new ValidationError('Semantic memory review event ordering or actor/trace binding is invalid');
  }
  const acceptedPayload = own(accepted, 'payload');
  if (
    own(acceptedPayload, 'intent_id') !== intentId
    || own(acceptedPayload, 'principal') !== normalized.owner
    || own(acceptedPayload, 'principal_type') !== 'human'
    || own(acceptedPayload, 'action') !== SEMANTIC_MEMORY_REVIEW_ACTION
    || own(acceptedPayload, 'request_digest') !== expectedRequestDigest
    || own(acceptedPayload, 'input_digest') !== digestObject(reviewIntent.input)
  ) {
    throw new ValidationError('Semantic memory accepted event does not match the exact review request');
  }

  const completedPayload = own(completed, 'payload');
  const result = assertPlainObject(own(completedPayload, 'result'), 'semantic review result');
  if (
    own(completedPayload, 'intent_id') !== intentId
    || own(result, 'intent_id') !== intentId
    || own(result, 'trace_id') !== traceId
    || own(result, 'status') !== 'completed'
  ) {
    throw new ValidationError('Semantic memory completed event does not match the exact review request');
  }
  if (canonicalJson(own(intentRow, 'result_json')) !== canonicalJson(result)) {
    throw new ValidationError('Semantic memory materialized completion does not match signed evidence');
  }

  const chainHead = assertString(own(chain, 'head'), 'semantic review chain head', {
    min: 64,
    max: 64,
    pattern: DIGEST
  });
  return Object.freeze({
    schema: SEMANTIC_MEMORY_GRID_EVIDENCE_SCHEMA,
    owner: normalized.owner,
    object_id: normalized.object_id,
    review_decision: own(normalized, 'review_decision'),
    verified_review_request_digest: expectedRequestDigest,
    intent_id: intentId,
    trace_id: traceId,
    accepted: Object.freeze({
      seq: acceptedSeq,
      event_id: own(accepted, 'event_id'),
      event_hash: own(accepted, 'event_hash')
    }),
    completed: Object.freeze({
      seq: completedSeq,
      event_id: own(completed, 'event_id'),
      event_hash: own(completed, 'event_hash')
    }),
    chain: Object.freeze({
      valid: true,
      head: chainHead,
      events: own(chain, 'events')
    }),
    downstream_effect_authorized: false
  });
}
