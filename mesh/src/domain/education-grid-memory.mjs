import { ValidationError, assertPlainObject, assertString } from '../lib/canonical.mjs';
import { requireOwnedMemoryReference } from '../grid/memory-reference.mjs';
import {
  EDUCATION_LEARNER_MEMORY_EVENT_TYPE_TO_KIND,
  EDUCATION_LEARNER_MEMORY_EVENT_TYPE_TO_OWNER,
  EDUCATION_LEARNER_RECORD_MEMORY_KINDS,
} from './education-learner-memory-profile.mjs';

export { EDUCATION_LEARNER_RECORD_MEMORY_KINDS };

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const KIND = /^[a-z][a-z0-9.-]+$/;
const CANONICAL_KINDS = new Set(EDUCATION_LEARNER_RECORD_MEMORY_KINDS);

function findReference(store, memoryObjectId, owner) {
  try {
    return requireOwnedMemoryReference(store, {
      object_id: memoryObjectId,
      owner,
    });
  } catch (error) {
    if (error instanceof ValidationError) return null;
    throw error;
  }
}

/**
 * Build a reference-only education memory assertion from Grid state.
 *
 * New-content workflow events use the digest-pinned ownership profile:
 * educator-authored content is owned by the authenticated actor, while
 * learner-authored content is owned by the learner subject. For workflow events
 * that reuse existing content and therefore have no new-content profile row,
 * only actor-owned or subject-owned canonical education memory may be reused.
 * The assertion never selects or decrypts payload_json.
 */
export function createGridEducationMemoryReferenceAssertion({
  store,
  allowedKinds,
}) {
  if (!Array.isArray(allowedKinds) || allowedKinds.length === 0) {
    throw new ValidationError('education Grid memory assertion requires allowedKinds');
  }
  const kinds = new Set(
    allowedKinds.map((kind, index) => {
      const normalized = assertString(
        kind,
        `education Grid allowedKinds[${index}]`,
        { max: 128, pattern: KIND },
      );
      if (!CANONICAL_KINDS.has(normalized)) {
        throw new ValidationError(
          `education Grid memory kind is outside the provider contract: ${normalized}`,
        );
      }
      return normalized;
    }),
  );
  if (kinds.size !== allowedKinds.length) {
    throw new ValidationError('education Grid allowedKinds must not contain duplicates');
  }

  return function assertEducationMemoryReference(rawRequest) {
    const request = assertPlainObject(rawRequest, 'education memory assertion request');
    const subjectId = assertString(request.subject_id, 'education memory subject_id', {
      max: 160,
      pattern: ID,
    });
    const actorId = assertString(request.actor_id, 'education memory actor_id', {
      max: 160,
      pattern: ID,
    });
    const eventType = assertString(request.event_type, 'education memory event_type', {
      max: 128,
      pattern: /^[a-z][a-z0-9.-]+$/,
    });
    const memoryObjectId = assertString(
      request.memory_object_id,
      'education memory memory_object_id',
      { max: 160, pattern: ID },
    );

    const expectedKind = EDUCATION_LEARNER_MEMORY_EVENT_TYPE_TO_KIND[eventType];
    const ownerBinding = EDUCATION_LEARNER_MEMORY_EVENT_TYPE_TO_OWNER[eventType];
    if (expectedKind !== undefined || ownerBinding !== undefined) {
      if (expectedKind === undefined || ownerBinding === undefined) {
        throw new ValidationError('education learner-memory profile mappings are incomplete');
      }
      if (!kinds.has(expectedKind)) return false;
      const expectedOwner = ownerBinding === 'actor' ? actorId : subjectId;
      const reference = findReference(store, memoryObjectId, expectedOwner);
      return reference !== null && reference.kind === expectedKind;
    }

    for (const owner of new Set([actorId, subjectId])) {
      const reference = findReference(store, memoryObjectId, owner);
      if (reference !== null && kinds.has(reference.kind)) return true;
    }
    return false;
  };
}
