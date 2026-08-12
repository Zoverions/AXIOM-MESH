import {
  AxiomError,
  ValidationError,
  assertPlainObject,
  assertString,
} from '../lib/canonical.mjs';
import { requireOwnedMemoryReference } from '../grid/memory-reference.mjs';
import { EDUCATION_CONTRACT_CONTROLLER } from './education-contract.mjs';
import {
  EDUCATION_LEARNER_MEMORY_EVENT_TYPE_TO_KIND,
  EDUCATION_LEARNER_MEMORY_EVENT_TYPE_TO_OWNER,
  EDUCATION_LEARNER_RECORD_MEMORY_KINDS,
} from './education-learner-memory-profile.mjs';
import {
  EDUCATION_LEARNER_EVENT_RECORDED_KIND,
  deriveEducationLearnerGridEventId,
  validateEducationLearnerEventRecordPayload,
} from './education-learner-append-mutation.mjs';

const PRINCIPAL_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const ALLOWED_KINDS = new Set(EDUCATION_LEARNER_RECORD_MEMORY_KINDS);

function requireConsent(store, input, now) {
  const receipts = store.listConsents(input.subject_id);
  const nowMillis = Date.parse(now);
  if (!Number.isFinite(nowMillis)) {
    throw new ValidationError('Education learner Grid preflight current time is invalid');
  }
  const receipt = receipts.find(candidate =>
    candidate.consent_id === input.consent_id
    && candidate.subject === input.subject_id
    && candidate.controller === EDUCATION_CONTRACT_CONTROLLER
    && candidate.purpose === 'learning-progress-recording'
  );
  if (
    !receipt
    || receipt.status !== 'active'
    || Date.parse(receipt.expires_at) <= nowMillis
    || !Array.isArray(receipt.scopes_json)
    || !receipt.scopes_json.includes('learning-progress:write')
  ) {
    throw new AxiomError(
      'education_consent_unavailable',
      'Active learner progress recording consent was not found',
      409,
    );
  }
  return receipt;
}

function tryOwnedReference(store, objectId, owner) {
  try {
    return requireOwnedMemoryReference(store, {
      object_id: objectId,
      owner,
    });
  } catch (error) {
    if (error instanceof ValidationError) return null;
    throw error;
  }
}

function requireMemoryReference(store, input, actor) {
  const expectedKind = EDUCATION_LEARNER_MEMORY_EVENT_TYPE_TO_KIND[input.event_type];
  const ownerBinding = EDUCATION_LEARNER_MEMORY_EVENT_TYPE_TO_OWNER[input.event_type];
  if (expectedKind !== undefined || ownerBinding !== undefined) {
    if (expectedKind === undefined || ownerBinding === undefined) {
      throw new ValidationError('Learner-memory ownership profile is incomplete');
    }
    const expectedOwner = ownerBinding === 'actor' ? actor : input.subject_id;
    const reference = tryOwnedReference(store, input.memory_object_id, expectedOwner);
    if (!reference || reference.kind !== expectedKind || !ALLOWED_KINDS.has(reference.kind)) {
      throw new AxiomError(
        'education_memory_reference_unavailable',
        'Governed learner memory reference does not match required owner and kind',
        409,
      );
    }
    return reference;
  }

  for (const owner of new Set([actor, input.subject_id])) {
    const reference = tryOwnedReference(store, input.memory_object_id, owner);
    if (reference && ALLOWED_KINDS.has(reference.kind)) return reference;
  }
  throw new AxiomError(
    'education_memory_reference_unavailable',
    'Governed learner memory reference is not available to the actor or learner subject',
    409,
  );
}

export function preflightEducationLearnerGridEvent(
  store,
  rawEvent,
  actor,
  { now = new Date().toISOString() } = {},
) {
  const event = assertPlainObject(rawEvent, 'education learner Grid event');
  if (event.kind !== EDUCATION_LEARNER_EVENT_RECORDED_KIND) return null;
  const actorId = assertString(actor, 'education learner Grid actor', {
    max: 160,
    pattern: PRINCIPAL_ID,
  });
  const payloadWithEvidence = assertPlainObject(
    event.payload,
    'education learner Grid event payload',
  );
  const payload = { ...payloadWithEvidence };
  delete payload.evidence;
  const { input, record_digest } = validateEducationLearnerEventRecordPayload(payload);

  if (event.subject !== input.subject_id) {
    throw new ValidationError('Education learner Grid event subject mismatch');
  }
  const expectedEventId = deriveEducationLearnerGridEventId(
    input.subject_id,
    input.event_id,
  );
  if (event.event_id !== expectedEventId) {
    throw new ValidationError('Education learner Grid event_id binding mismatch');
  }
  if (store.db.prepare('SELECT 1 FROM events WHERE event_id = ?').get(expectedEventId)) {
    throw new AxiomError(
      'education_learner_event_conflict',
      'Learner event id is already recorded for this subject',
      409,
    );
  }

  const consent = requireConsent(store, input, now);
  const memory = requireMemoryReference(store, input, actorId);
  return Object.freeze({
    record_digest,
    consent_id: consent.consent_id,
    memory_object_id: memory.object_id,
    memory_owner: memory.owner,
    memory_kind: memory.kind,
  });
}
