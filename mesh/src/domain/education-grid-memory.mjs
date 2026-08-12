import { ValidationError, assertPlainObject, assertString } from '../lib/canonical.mjs';
import { requireOwnedMemoryReference } from '../grid/memory-reference.mjs';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const KIND = /^[a-z][a-z0-9.-]+$/;

/**
 * Build a reference-only education memory assertion from Grid state.
 *
 * The deployment must provide an explicit allowlist of acceptable education
 * memory kinds. The assertion verifies active ownership and content-address
 * integrity without selecting or decrypting payload_json.
 */
export function createGridEducationMemoryReferenceAssertion({
  store,
  allowedKinds,
}) {
  if (!Array.isArray(allowedKinds) || allowedKinds.length === 0) {
    throw new ValidationError('education Grid memory assertion requires allowedKinds');
  }
  const kinds = new Set(
    allowedKinds.map((kind, index) => assertString(
      kind,
      `education Grid allowedKinds[${index}]`,
      { max: 128, pattern: KIND },
    )),
  );
  if (kinds.size !== allowedKinds.length) {
    throw new ValidationError('education Grid allowedKinds must not contain duplicates');
  }

  return async function assertEducationMemoryReference(rawRequest) {
    const request = assertPlainObject(rawRequest, 'education memory assertion request');
    const subjectId = assertString(request.subject_id, 'education memory subject_id', {
      max: 160,
      pattern: ID,
    });
    const memoryObjectId = assertString(
      request.memory_object_id,
      'education memory memory_object_id',
      { max: 160, pattern: ID },
    );

    let reference;
    try {
      reference = requireOwnedMemoryReference(store, {
        object_id: memoryObjectId,
        owner: subjectId,
      });
    } catch (error) {
      if (error instanceof ValidationError) return false;
      throw error;
    }
    return kinds.has(reference.kind);
  };
}
