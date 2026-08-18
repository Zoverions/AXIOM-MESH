import {
  AxiomError,
  ValidationError,
  assertPlainObject,
  assertString
} from '../lib/canonical.mjs';
import {
  invocationEnvelopeDigest,
  validateInvocationEnvelope
} from '../lib/invocation-envelope.mjs';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;

export function verifyNativeMemoryIntentEvidence(store, {
  traceId,
  actor,
  intentId,
  allowedStatuses = ['accepted']
}) {
  requireGridStore(store);
  const trace = requiredId(traceId, 'semantic memory traceId');
  const owner = requiredId(actor, 'semantic memory actor');
  const intent = requiredId(intentId, 'semantic memory intentId');
  const statuses = new Set(allowedStatuses);
  if (statuses.size === 0) {
    throw new ValidationError('Native memory intent evidence requires an allowed status');
  }

  store.requireIntentEvidenceChain();
  const rows = store.db.prepare(`
    SELECT * FROM events
    WHERE kind = 'intent.accepted' AND subject = ?
    ORDER BY seq
  `).all(intent);
  if (rows.length !== 1) {
    throw new AxiomError(
      'semantic_memory_ingestion_acceptance_missing',
      'Native semantic ingestion requires exactly one accepted memory.put intent event',
      409
    );
  }
  const accepted = store.decodeEventRow(rows[0]);
  const payload = assertPlainObject(accepted.payload, 'accepted memory intent payload');
  if (
    accepted.trace_id !== trace
    || accepted.actor !== owner
    || payload.intent_id !== intent
    || payload.principal !== owner
    || payload.principal_type !== 'human'
    || payload.action !== 'memory.put'
  ) {
    throw new ValidationError(
      'Accepted memory intent does not match the authenticated owner ingestion request'
    );
  }

  const invocation = validateInvocationEnvelope(
    assertPlainObject(payload.invocation, 'accepted memory invocation')
  );
  const invocationDigest = requiredDigest(
    payload.invocation_digest,
    'accepted memory invocation_digest'
  );
  if (invocationEnvelopeDigest(invocation) !== invocationDigest) {
    throw new ValidationError('Accepted memory invocation digest does not match its envelope');
  }
  if (
    invocation.caller.principal_id !== owner
    || invocation.caller.principal_type !== 'human'
    || invocation.request.intent_id !== intent
    || invocation.request.action !== 'memory.put'
    || invocation.request.request_digest !== payload.request_digest
    || invocation.request.input_digest !== payload.input_digest
  ) {
    throw new ValidationError('Accepted memory invocation does not match the signed intent evidence');
  }

  const materialized = store.getIntent(intent);
  if (
    materialized.trace_id !== trace
    || materialized.principal !== owner
    || materialized.action !== 'memory.put'
    || materialized.input_digest !== payload.input_digest
    || materialized.request_digest !== payload.request_digest
  ) {
    throw new ValidationError('Materialized memory intent does not match its accepted event');
  }
  if (!statuses.has(materialized.status)) {
    throw new AxiomError(
      'semantic_memory_ingestion_intent_state_mismatch',
      'Native semantic ingestion intent is not in the required lifecycle state',
      409
    );
  }

  return Object.freeze({
    accepted,
    materialized: Object.freeze(structuredClone(materialized))
  });
}

function requireGridStore(store) {
  if (
    !store
    || typeof store.requireIntentEvidenceChain !== 'function'
    || !store.db
    || typeof store.decodeEventRow !== 'function'
    || typeof store.getIntent !== 'function'
  ) {
    throw new TypeError('Native semantic ingestion evidence requires a Grid store');
  }
}

function requiredId(value, label) {
  return assertString(value, label, { min: 1, max: 160, pattern: ID });
}

function requiredDigest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}
