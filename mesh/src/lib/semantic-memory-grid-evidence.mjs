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
  normalizeSemanticMemoryProvenance
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

export function verifySemanticMemoryGridEvidence(record, {
  intent,
  events,
  chain
} = {}) {
  const normalized = normalizeSemanticMemoryProvenance(record);
  requireExplicitReview(normalized);
  const reviewIntent = recordedSemanticMemoryReviewIntent(normalized);
  const expectedRequestDigest = intentRequestDigest(reviewIntent);
  if (expectedRequestDigest !== normalized.review_request_digest) {
    throw new ValidationError('Semantic memory recorded review request digest is invalid');
  }
  if (!chain || chain.valid !== true) {
    throw new ValidationError('Semantic memory review requires a valid Grid evidence chain');
  }

  const intentRow = assertPlainObject(intent, 'semantic review intent');
  const intentId = assertString(intentRow.intent_id, 'semantic review intent_id', {
    max: 160,
    pattern: ID
  });
  const traceId = assertString(intentRow.trace_id, 'semantic review trace_id', {
    max: 160,
    pattern: ID
  });
  if (
    intentRow.principal !== normalized.owner
    || intentRow.action !== SEMANTIC_MEMORY_REVIEW_ACTION
    || intentRow.status !== 'completed'
    || intentRow.request_digest !== expectedRequestDigest
    || intentRow.input_digest !== digestObject(reviewIntent.input)
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
  if (
    !Number.isSafeInteger(accepted.seq)
    || !Number.isSafeInteger(completed.seq)
    || accepted.seq >= completed.seq
    || accepted.actor !== normalized.owner
    || completed.actor !== normalized.owner
    || accepted.trace_id !== traceId
    || completed.trace_id !== traceId
    || accepted.subject !== intentId
    || completed.subject !== intentId
  ) {
    throw new ValidationError('Semantic memory review event ordering or actor/trace binding is invalid');
  }
  if (
    accepted.payload?.intent_id !== intentId
    || accepted.payload?.principal !== normalized.owner
    || accepted.payload?.principal_type !== 'human'
    || accepted.payload?.action !== SEMANTIC_MEMORY_REVIEW_ACTION
    || accepted.payload?.request_digest !== expectedRequestDigest
    || accepted.payload?.input_digest !== digestObject(reviewIntent.input)
  ) {
    throw new ValidationError('Semantic memory accepted event does not match the exact review request');
  }

  const result = assertPlainObject(completed.payload?.result, 'semantic review result');
  if (
    completed.payload?.intent_id !== intentId
    || result.intent_id !== intentId
    || result.trace_id !== traceId
    || result.status !== 'completed'
  ) {
    throw new ValidationError('Semantic memory completed event does not match the exact review request');
  }
  if (canonicalJson(intentRow.result_json) !== canonicalJson(result)) {
    throw new ValidationError('Semantic memory materialized completion does not match signed evidence');
  }

  const chainHead = assertString(chain.head, 'semantic review chain head', {
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
      seq: accepted.seq,
      event_id: accepted.event_id,
      event_hash: accepted.event_hash
    }),
    completed: Object.freeze({
      seq: completed.seq,
      event_id: completed.event_id,
      event_hash: completed.event_hash
    }),
    chain: Object.freeze({
      valid: true,
      head: chainHead,
      events: chain.events
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
