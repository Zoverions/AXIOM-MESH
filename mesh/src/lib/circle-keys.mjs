import { KeyObject, createPublicKey, sign, verify } from 'node:crypto';
import { canonicalJson, sha256, ValidationError } from './canonical.mjs';

/**
 * Circle key establishment. Inert contract laboratory.
 *
 * A Circle's members sign their exchange updates with keys the Circle itself
 * establishes, instead of a roster supplied by the caller:
 *
 * - Root: the genesis carries the creator's key.
 * - Endorsement: the creator, or a member whose role declares 'approve',
 *   binds a principal's first key (or a replacement after revocation).
 * - Rotation: a principal replaces their current key from within that key's
 *   own log; the old key signs nothing after the rotation.
 * - Revocation: the principal or an administrator names a key and the last
 *   counter of that key's log that remains valid. Updates signed with the key
 *   beyond that counter are void, whenever they claim to have been written.
 *
 * Every endorsement and rotation carries proof of possession: the new key's
 * signature over the genesis digest, the principal and the key id. A key can
 * therefore be bound only to the principal its holder agreed to, and to only
 * one Circle genesis. A key id is the SHA-256 of the key's SPKI DER encoding,
 * as ballot verification computes it.
 *
 * A revocation's last valid counter is the revoker's statement of the last
 * update they trust. Set too high, it leaves room for a thief to have
 * written (and rotated the key) within it; replicas cannot tell, since the
 * timestamps in records are the author's own claim.
 *
 * Keys identify authors of exchange updates. They grant no authority, and
 * nothing here opens a network connection or changes the Grid.
 */

export const CIRCLE_KEY_ENDORSEMENT_SCHEMA = 'axiom-circle-key-endorsement.v0';
export const CIRCLE_KEY_ROTATION_SCHEMA = 'axiom-circle-key-rotation.v0';
export const CIRCLE_KEY_REVOCATION_SCHEMA = 'axiom-circle-key-revocation.v0';
export const CIRCLE_KEY_POSSESSION_SCHEMA = 'axiom-circle-key-possession.v0';
export const CIRCLE_KEY_MAX_COUNTER = 4096;

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const ENCODED_KEY = /^[A-Za-z0-9_-]{16,256}$/;

/** Normalizes a public key (KeyObject, PEM or encoded SPKI) to an Ed25519 KeyObject. */
export function circlePublicKey(value) {
  let publicKey;
  try {
    if (value instanceof KeyObject) {
      publicKey = value.type === 'public' ? value : createPublicKey(value);
    } else if (typeof value === 'string' && ENCODED_KEY.test(value)) {
      publicKey = createPublicKey({ key: Buffer.from(value, 'base64url'), format: 'der', type: 'spki' });
    } else {
      publicKey = createPublicKey(value);
    }
  } catch {
    throw new ValidationError('Circle public key is invalid');
  }
  if (publicKey.asymmetricKeyType !== 'ed25519') {
    throw new ValidationError('Circle public key must be Ed25519');
  }
  return publicKey;
}

/** The canonical encoding carried in records: base64url SPKI DER. */
export function encodeCirclePublicKey(value) {
  return circlePublicKey(value).export({ type: 'spki', format: 'der' }).toString('base64url');
}

export function circleKeyId(value) {
  return sha256(circlePublicKey(value).export({ type: 'spki', format: 'der' }));
}

/** The creator's key as carried in a Circle genesis. */
export function circleCreatorKey(value) {
  return Object.freeze({ key_id: circleKeyId(value), public_key: encodeCirclePublicKey(value) });
}

export function validateCircleCreatorKey(value) {
  exactObject(value, 'Circle creator key', ['key_id', 'public_key']);
  return decodeRecordKey(value.public_key, value.key_id, 'Circle creator key');
}

/** Proof that the holder of `privateKey` agrees to be `principalId` in this Circle. */
export function createCircleKeyPossession({ genesisDigest, principalId, privateKey }) {
  const keyId = circleKeyId(createPublicKey(privateKey));
  const body = possessionBody(genesisDigest, principalId, keyId);
  return Object.freeze({
    algorithm: 'Ed25519',
    signature: sign(null, Buffer.from(canonicalJson(body)), privateKey).toString('base64url')
  });
}

export function createCircleKeyEndorsement({
  circleId,
  principalId,
  publicKey,
  possession,
  endorsedBy,
  endorsedAt
}) {
  return Object.freeze({
    schema: CIRCLE_KEY_ENDORSEMENT_SCHEMA,
    circle_id: circleId,
    principal_id: principalId,
    key_id: circleKeyId(publicKey),
    public_key: encodeCirclePublicKey(publicKey),
    possession,
    endorsed_by: endorsedBy,
    endorsed_at: endorsedAt,
    authority_effect: 'none'
  });
}

export function createCircleKeyRotation({
  circleId,
  principalId,
  previousKeyId,
  publicKey,
  possession,
  rotatedAt
}) {
  return Object.freeze({
    schema: CIRCLE_KEY_ROTATION_SCHEMA,
    circle_id: circleId,
    principal_id: principalId,
    previous_key_id: previousKeyId,
    key_id: circleKeyId(publicKey),
    public_key: encodeCirclePublicKey(publicKey),
    possession,
    rotated_at: rotatedAt,
    authority_effect: 'none'
  });
}

export function createCircleKeyRevocation({
  circleId,
  principalId,
  keyId,
  lastValidCounter,
  revokedBy,
  revokedAt,
  reasonCode
}) {
  return Object.freeze({
    schema: CIRCLE_KEY_REVOCATION_SCHEMA,
    circle_id: circleId,
    principal_id: principalId,
    key_id: keyId,
    last_valid_counter: lastValidCounter,
    revoked_by: revokedBy,
    revoked_at: revokedAt,
    reason_code: reasonCode,
    authority_effect: 'none'
  });
}

/**
 * Validates a key record on its own: shape, canonical time, Circle binding
 * and, for endorsements and rotations, proof of possession. Returns the
 * public key it introduces, if any. Authorization is judged by the view.
 */
export function validateCircleKeyRecord(type, record, { genesisDigest, circleId }) {
  if (type === 'key_endorsement') {
    exactObject(record, 'Circle key endorsement', [
      'schema', 'circle_id', 'principal_id', 'key_id', 'public_key', 'possession',
      'endorsed_by', 'endorsed_at', 'authority_effect'
    ]);
    common(record, CIRCLE_KEY_ENDORSEMENT_SCHEMA, circleId, 'Circle key endorsement');
    identifier(record.endorsed_by, 'endorsed_by');
    timestamp(record.endorsed_at, 'endorsed_at');
    const publicKey = decodeRecordKey(record.public_key, record.key_id, 'Circle key endorsement');
    checkPossession(record, publicKey, genesisDigest);
    return publicKey;
  }
  if (type === 'key_rotation') {
    exactObject(record, 'Circle key rotation', [
      'schema', 'circle_id', 'principal_id', 'previous_key_id', 'key_id', 'public_key',
      'possession', 'rotated_at', 'authority_effect'
    ]);
    common(record, CIRCLE_KEY_ROTATION_SCHEMA, circleId, 'Circle key rotation');
    if (!DIGEST.test(record.previous_key_id ?? '') || record.previous_key_id === record.key_id) {
      throw new ValidationError('Circle key rotation must replace a different key');
    }
    timestamp(record.rotated_at, 'rotated_at');
    const publicKey = decodeRecordKey(record.public_key, record.key_id, 'Circle key rotation');
    checkPossession(record, publicKey, genesisDigest);
    return publicKey;
  }
  if (type === 'key_revocation') {
    exactObject(record, 'Circle key revocation', [
      'schema', 'circle_id', 'principal_id', 'key_id', 'last_valid_counter',
      'revoked_by', 'revoked_at', 'reason_code', 'authority_effect'
    ]);
    common(record, CIRCLE_KEY_REVOCATION_SCHEMA, circleId, 'Circle key revocation');
    if (!DIGEST.test(record.key_id ?? '')) throw new ValidationError('Circle key revocation key_id is invalid');
    if (
      !Number.isSafeInteger(record.last_valid_counter)
      || record.last_valid_counter < 0
      || record.last_valid_counter > CIRCLE_KEY_MAX_COUNTER
    ) throw new ValidationError('Circle key revocation last_valid_counter is invalid');
    identifier(record.revoked_by, 'revoked_by');
    identifier(record.reason_code, 'reason_code');
    timestamp(record.revoked_at, 'revoked_at');
    return null;
  }
  throw new ValidationError('Circle key record type is invalid');
}

function common(record, schema, circleId, name) {
  if (record.schema !== schema || record.authority_effect !== 'none') {
    throw new ValidationError(`${name} is invalid`);
  }
  if (record.circle_id !== circleId) throw new ValidationError(`${name} belongs to another Circle`);
  identifier(record.principal_id, 'principal_id');
}

function decodeRecordKey(encoded, keyId, name) {
  if (typeof encoded !== 'string' || !ENCODED_KEY.test(encoded)) {
    throw new ValidationError(`${name} public_key is invalid`);
  }
  const publicKey = circlePublicKey(encoded);
  if (encodeCirclePublicKey(publicKey) !== encoded || circleKeyId(publicKey) !== keyId) {
    throw new ValidationError(`${name} key_id does not match its public key`);
  }
  return publicKey;
}

function checkPossession(record, publicKey, genesisDigest) {
  exactObject(record.possession, 'Circle key possession', ['algorithm', 'signature']);
  if (record.possession.algorithm !== 'Ed25519' || typeof record.possession.signature !== 'string') {
    throw new ValidationError('Circle key possession is invalid');
  }
  const body = possessionBody(genesisDigest, record.principal_id, record.key_id);
  let valid = false;
  try {
    valid = verify(
      null,
      Buffer.from(canonicalJson(body)),
      publicKey,
      Buffer.from(record.possession.signature, 'base64url')
    );
  } catch {
    valid = false;
  }
  if (!valid) {
    throw new ValidationError(`Key ${record.key_id.slice(0, 12)} did not prove possession for ${record.principal_id}`);
  }
}

function possessionBody(genesisDigest, principalId, keyId) {
  return {
    schema: CIRCLE_KEY_POSSESSION_SCHEMA,
    genesis_digest: genesisDigest,
    principal_id: principalId,
    key_id: keyId
  };
}

function identifier(value, name) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) {
    throw new ValidationError(`Circle key record ${name} is invalid`);
  }
}

function timestamp(value, name) {
  const parsed = new Date(value);
  if (typeof value !== 'string' || Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) {
    throw new ValidationError(`Circle key record ${name} must be a canonical ISO timestamp`);
  }
}

function exactObject(value, name, fields) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${name} must be an object`);
  }
  const keys = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new ValidationError(`${name} fields are invalid`);
  }
}
