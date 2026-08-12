import { ValidationError, assertPlainObject, assertString } from '../lib/canonical.mjs';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;

/**
 * Return only non-secret metadata for an active memory object owned by `owner`.
 *
 * This helper intentionally does not select or decrypt payload_json. It exists
 * for authorization/reference validation paths that must not expose learner or
 * other protected content merely to prove that a governed object exists.
 */
export function requireOwnedMemoryReference(store, { object_id, owner }) {
  const value = assertPlainObject({ object_id, owner }, 'memory reference request');
  const objectId = assertString(value.object_id, 'memory reference object_id', {
    max: 160,
    pattern: ID,
  });
  const ownerId = assertString(value.owner, 'memory reference owner', {
    max: 160,
    pattern: ID,
  });
  if (!store || typeof store !== 'object' || typeof store.db?.prepare !== 'function') {
    throw new ValidationError('memory reference lookup requires a GridStore');
  }

  const row = store.db.prepare(`
    SELECT object_id, owner, kind, content_digest, status, created_at
    FROM memory_objects
    WHERE object_id = ? AND owner = ? AND status = 'active'
  `).get(objectId, ownerId);
  if (!row) {
    throw new ValidationError('Owned active memory reference was not found');
  }

  assertString(row.kind, 'memory reference kind', {
    max: 128,
    pattern: /^[a-z][a-z0-9.-]+$/,
  });
  assertString(row.content_digest, 'memory reference content_digest', {
    min: 64,
    max: 64,
    pattern: DIGEST,
  });

  return Object.freeze({
    object_id: row.object_id,
    owner: row.owner,
    kind: row.kind,
    content_digest: row.content_digest,
    status: row.status,
    created_at: row.created_at,
  });
}
