import {
  AxiomError,
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject
} from '../lib/canonical.mjs';
import { intentRequestDigest } from '../lib/intent-binding.mjs';
import { normalizeSemanticMemoryProvenance } from '../lib/semantic-memory-provenance.mjs';
import { isVerifiedSemanticMemoryCurrentEvidence } from './semantic-memory-state-store.mjs';

export const SEMANTIC_MEMORY_RETRANSMISSION_ACTION = 'memory.semantic.retransmit';
export const SEMANTIC_MEMORY_RETRANSMISSION_INPUT_SCHEMA =
  'axiom-semantic-memory-retransmission-input.v1';
export const SEMANTIC_MEMORY_RETRANSMISSION_EVIDENCE_SCHEMA =
  'axiom-semantic-memory-retransmission-evidence.v1';
export const SEMANTIC_MEMORY_RETRANSMISSION_PURPOSE =
  'govern-semantic-memory-retransmission';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const VERIFIED_RETRANSMISSION_EVIDENCE = new WeakSet();

export function semanticMemoryRetransmissionIntent(record, request = {}) {
  const normalized = normalizeSemanticMemoryProvenance(record);
  const normalizedRequest = normalizeRetransmissionRequest(request);
  return Object.freeze({
    principal: Object.freeze({ type: 'human', id: normalized.owner }),
    action: SEMANTIC_MEMORY_RETRANSMISSION_ACTION,
    input: Object.freeze({
      schema: SEMANTIC_MEMORY_RETRANSMISSION_INPUT_SCHEMA,
      object_id: normalized.object_id,
      content_digest: normalized.content_digest,
      provenance_digest: normalized.provenance_digest,
      recipient: normalizedRequest.recipient,
      destination: normalizedRequest.destination,
      use_purpose: normalizedRequest.use_purpose,
      max_bytes: normalizedRequest.max_bytes,
      expires_at: normalizedRequest.expires_at
    }),
    purpose: SEMANTIC_MEMORY_RETRANSMISSION_PURPOSE,
    data_scopes: Object.freeze([`memory.semantic:${normalized.object_id}`])
  });
}

export function verifySemanticMemoryRetransmissionFromGrid(
  store,
  record,
  request,
  currentEvidence
) {
  requireGridStore(store);
  const normalized = normalizeSemanticMemoryProvenance(record);
  assertCurrentEvidence(normalized, currentEvidence);
  const retransmissionIntent = semanticMemoryRetransmissionIntent(normalized, request);
  const expectedRequestDigest = intentRequestDigest(retransmissionIntent);
  const expectedInputDigest = digestObject(retransmissionIntent.input);
  const chain = store.requireIntentEvidenceChain();
  if (!chain || chain.valid !== true) {
    throw new ValidationError('Semantic memory retransmission requires a valid Grid evidence chain');
  }

  const acceptedRows = store.db.prepare(`
    SELECT * FROM events
    WHERE kind = 'intent.accepted' AND actor = ?
    ORDER BY seq DESC
  `).all(normalized.owner);

  let matchingRequestSeen = false;
  for (const row of acceptedRows) {
    const accepted = store.decodeEventRow(row);
    if (accepted.payload?.request_digest !== expectedRequestDigest) continue;
    matchingRequestSeen = true;
    if (
      accepted.payload?.principal !== normalized.owner
      || accepted.payload?.principal_type !== 'human'
      || accepted.payload?.action !== SEMANTIC_MEMORY_RETRANSMISSION_ACTION
      || accepted.payload?.input_digest !== expectedInputDigest
    ) {
      throw new ValidationError(
        'Semantic memory retransmission acceptance is not bound to the exact human request'
      );
    }

    let intent;
    try {
      intent = store.getIntent(accepted.payload.intent_id);
    } catch (error) {
      if (error?.code === 'intent_not_found') {
        throw new ValidationError(
          'Semantic memory retransmission acceptance has no materialized intent'
        );
      }
      throw error;
    }
    if (intent.status !== 'completed') continue;
    if (
      intent.principal !== normalized.owner
      || intent.action !== SEMANTIC_MEMORY_RETRANSMISSION_ACTION
      || intent.request_digest !== expectedRequestDigest
      || intent.input_digest !== expectedInputDigest
    ) {
      throw new ValidationError(
        'Semantic memory retransmission materialized intent is mismatched'
      );
    }

    const events = store.db.prepare(`
      SELECT * FROM events
      WHERE subject = ?
        AND kind IN ('intent.accepted', 'intent.completed', 'intent.denied', 'intent.failed')
      ORDER BY seq
    `).all(intent.intent_id).map(eventRow => store.decodeEventRow(eventRow));
    const acceptedEvents = events.filter(event => event.kind === 'intent.accepted');
    const completedEvents = events.filter(event => event.kind === 'intent.completed');
    const adverseEvents = events.filter(event =>
      event.kind === 'intent.denied' || event.kind === 'intent.failed'
    );
    if (acceptedEvents.length !== 1 || completedEvents.length !== 1 || adverseEvents.length) {
      throw new ValidationError(
        'Semantic memory retransmission requires exactly one successful accepted/completed lifecycle'
      );
    }

    const completed = completedEvents[0];
    const result = assertPlainObject(
      completed.payload?.result,
      'semantic memory retransmission result'
    );
    if (
      !Number.isSafeInteger(accepted.seq)
      || !Number.isSafeInteger(completed.seq)
      || accepted.seq >= completed.seq
      || accepted.actor !== normalized.owner
      || completed.actor !== normalized.owner
      || accepted.trace_id !== intent.trace_id
      || completed.trace_id !== intent.trace_id
      || accepted.subject !== intent.intent_id
      || completed.subject !== intent.intent_id
      || completed.payload?.intent_id !== intent.intent_id
      || result.intent_id !== intent.intent_id
      || result.trace_id !== intent.trace_id
      || result.status !== 'completed'
    ) {
      throw new ValidationError(
        'Semantic memory retransmission event ordering or identity binding is invalid'
      );
    }

    const evidence = Object.freeze({
      schema: SEMANTIC_MEMORY_RETRANSMISSION_EVIDENCE_SCHEMA,
      owner: normalized.owner,
      object_id: normalized.object_id,
      content_digest: normalized.content_digest,
      provenance_digest: normalized.provenance_digest,
      recipient: retransmissionIntent.input.recipient,
      destination: retransmissionIntent.input.destination,
      use_purpose: retransmissionIntent.input.use_purpose,
      max_bytes: retransmissionIntent.input.max_bytes,
      expires_at: retransmissionIntent.input.expires_at,
      verified_request_digest: expectedRequestDigest,
      intent_id: intent.intent_id,
      trace_id: intent.trace_id,
      chain_head: requiredDigest(chain.head, 'semantic memory retransmission chain head'),
      retransmission_authorized: true,
      downstream_effect_authorized: false,
      production_selection_authorized: false
    });
    VERIFIED_RETRANSMISSION_EVIDENCE.add(evidence);
    return evidence;
  }

  if (matchingRequestSeen) {
    throw new AxiomError(
      'semantic_memory_retransmission_not_completed',
      'A matching semantic memory retransmission request exists but did not complete successfully',
      409
    );
  }
  throw new AxiomError(
    'semantic_memory_retransmission_evidence_not_found',
    'No completed Grid evidence exists for this semantic memory retransmission request',
    404
  );
}

export function evaluateSemanticMemoryRetransmission(record, {
  authorization,
  current_evidence,
  recipient,
  destination,
  use_purpose,
  payload_bytes,
  now = new Date().toISOString()
} = {}) {
  const normalized = normalizeSemanticMemoryProvenance(record);
  if (normalized.review_state === 'quarantined') {
    return deny('semantic_memory_retransmission_quarantined');
  }
  if (normalized.review_state === 'rejected') {
    return deny('semantic_memory_retransmission_rejected');
  }
  if (!isVerifiedSemanticMemoryCurrentEvidence(current_evidence)) {
    return deny('semantic_memory_retransmission_current_evidence_unverified');
  }
  if (!isVerifiedSemanticMemoryRetransmissionEvidence(authorization)) {
    return deny('semantic_memory_retransmission_authorization_unverified');
  }
  try {
    assertCurrentEvidence(normalized, current_evidence);
  } catch {
    return deny('semantic_memory_retransmission_current_evidence_mismatch');
  }
  if (
    authorization.owner !== normalized.owner
    || authorization.object_id !== normalized.object_id
    || authorization.content_digest !== normalized.content_digest
    || authorization.provenance_digest !== normalized.provenance_digest
  ) {
    return deny('semantic_memory_retransmission_source_mismatch');
  }

  let normalizedRecipient;
  let normalizedDestination;
  let normalizedPurpose;
  let bytes;
  let nowMs;
  try {
    normalizedRecipient = requiredId(recipient, 'semantic memory retransmission recipient');
    normalizedDestination = requiredText(
      destination,
      'semantic memory retransmission destination',
      512
    );
    normalizedPurpose = requiredText(
      use_purpose,
      'semantic memory retransmission use_purpose',
      160
    );
    if (!Number.isSafeInteger(payload_bytes) || payload_bytes < 0) {
      throw new ValidationError('Semantic memory retransmission payload_bytes is invalid');
    }
    bytes = payload_bytes;
    nowMs = normalizeTimestamp(now, 'semantic memory retransmission now').milliseconds;
  } catch {
    return deny('semantic_memory_retransmission_request_invalid');
  }

  if (
    authorization.recipient !== normalizedRecipient
    || authorization.destination !== normalizedDestination
    || authorization.use_purpose !== normalizedPurpose
  ) {
    return deny('semantic_memory_retransmission_scope_mismatch');
  }
  if (bytes > authorization.max_bytes) {
    return deny('semantic_memory_retransmission_size_exceeded');
  }
  const expiresMs = Date.parse(authorization.expires_at);
  if (!Number.isFinite(expiresMs) || nowMs > expiresMs) {
    return deny('semantic_memory_retransmission_expired');
  }

  return Object.freeze({
    allow: true,
    code: 'semantic_memory_retransmission_allowed',
    object_id: normalized.object_id,
    provenance_digest: normalized.provenance_digest,
    recipient: normalizedRecipient,
    destination: normalizedDestination,
    use_purpose: normalizedPurpose,
    payload_bytes: bytes,
    retransmission_authorized: true,
    downstream_effect_authorized: false,
    production_selection_authorized: false
  });
}

export function isVerifiedSemanticMemoryRetransmissionEvidence(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && VERIFIED_RETRANSMISSION_EVIDENCE.has(value)
  );
}

function normalizeRetransmissionRequest(request) {
  const input = assertPlainObject(request, 'semantic memory retransmission request');
  const maxBytes = input.max_bytes;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 16 * 1024 * 1024) {
    throw new ValidationError('Semantic memory retransmission max_bytes is invalid');
  }
  return Object.freeze({
    recipient: requiredId(input.recipient, 'semantic memory retransmission recipient'),
    destination: requiredText(
      input.destination,
      'semantic memory retransmission destination',
      512
    ),
    use_purpose: requiredText(
      input.use_purpose,
      'semantic memory retransmission use_purpose',
      160
    ),
    max_bytes: maxBytes,
    expires_at: normalizeTimestamp(
      input.expires_at,
      'semantic memory retransmission expires_at'
    ).iso
  });
}

function assertCurrentEvidence(record, evidence) {
  if (!isVerifiedSemanticMemoryCurrentEvidence(evidence)) {
    throw new ValidationError(
      'Semantic memory retransmission requires authentic current-state evidence'
    );
  }
  if (
    evidence.owner !== record.owner
    || evidence.object_id !== record.object_id
    || evidence.content_digest !== record.content_digest
    || evidence.provenance_digest !== record.provenance_digest
  ) {
    throw new ValidationError(
      'Semantic memory retransmission current-state evidence is mismatched'
    );
  }
}

function requireGridStore(store) {
  if (
    !store
    || typeof store.requireIntentEvidenceChain !== 'function'
    || typeof store.getIntent !== 'function'
    || typeof store.decodeEventRow !== 'function'
    || !store.db
  ) {
    throw new TypeError('Semantic memory retransmission verification requires a Grid store');
  }
}

function requiredId(value, label) {
  return assertString(value, label, { min: 1, max: 160, pattern: ID });
}

function requiredText(value, label, max) {
  return assertString(value, label, { min: 1, max });
}

function requiredDigest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

function normalizeTimestamp(value, label) {
  const text = assertString(value, label, { min: 20, max: 64 });
  const milliseconds = Date.parse(text);
  if (!Number.isFinite(milliseconds)) {
    throw new ValidationError(`${label} is invalid`);
  }
  return { milliseconds, iso: new Date(milliseconds).toISOString() };
}

function deny(code) {
  return Object.freeze({
    allow: false,
    code,
    retransmission_authorized: false,
    downstream_effect_authorized: false,
    production_selection_authorized: false
  });
}
