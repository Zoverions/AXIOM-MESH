import {
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject
} from './canonical.mjs';
import { intentRequestDigest } from './intent-binding.mjs';
import {
  SEMANTIC_MEMORY_REVIEW_ACTION,
  SEMANTIC_MEMORY_REVIEW_INPUT_SCHEMA,
  SEMANTIC_MEMORY_REVIEW_PURPOSE,
  normalizeSemanticMemoryProvenance,
  verifySemanticMemoryReviewedFromProvenance
} from './semantic-memory-provenance.mjs';

export const SEMANTIC_MEMORY_GRID_EVIDENCE_SCHEMA =
  'axiom-semantic-memory-grid-evidence.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;

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
      current_provenance_digest: normalized.reviewed_from_provenance_digest,
      decision: normalized.review_decision
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

function ownEntry(array, item) {
  return array.some((entry, index) => entry === item && Object.hasOwn(array, index));
}

export function verifySemanticMemoryGridEvidence(record, {
  // Destructured only so that a null options argument throws exactly as
  // before; the values are read below as own properties.
  intent: _intent,
  events: _events,
  chain: _chain
} = {}) {
  const options = arguments[1];
  const intent = own(options, 'intent');
  const events = own(options, 'events');
  const chain = own(options, 'chain');
  const normalized = normalizeSemanticMemoryProvenance(record);
  requireExplicitReview(normalized);
  // The claimed pre-review digest must be the record's own (#1937).
  verifySemanticMemoryReviewedFromProvenance(normalized);
  const reviewIntent = recordedSemanticMemoryReviewIntent(normalized);
  const expectedRequestDigest = intentRequestDigest(reviewIntent);
  if (expectedRequestDigest !== normalized.review_request_digest) {
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
    review_decision: normalized.review_decision,
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

function requireExplicitReview(record) {
  if (
    record.review_actor !== record.owner
    || typeof record.review_request_digest !== 'string'
    || typeof record.reviewed_from_provenance_digest !== 'string'
    || typeof record.review_decision !== 'string'
  ) {
    throw new ValidationError('Semantic memory record has no explicit owner review evidence');
  }
}
