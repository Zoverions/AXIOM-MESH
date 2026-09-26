import {
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes
} from 'node:crypto';
import { canonicalJson, sha256, ValidationError } from './canonical.mjs';

/**
 * Per-record disclosure for Circles (laboratory, with the exchange).
 *
 * Every member's replica holds every signed update, and every replica
 * derives the same Circle from them, so disclosure cannot work by leaving
 * records out: replicas would diverge, and the transport's withholding
 * checks would flag the gap. It works by content instead. A member seals
 * content for an audience named by role; everyone replicates the sealed
 * record, and only its recipients can open it.
 *
 * - Disclosure keys: each member publishes an X25519 key in a
 *   `disclosure_key` record signed with their Circle key. A later record
 *   replaces it; content sealed earlier stays readable with the earlier key.
 * - Sealing: the content is encrypted once (AES-256-GCM under a random
 *   content key). The content key is wrapped for each recipient with an
 *   ephemeral X25519 exchange, HKDF-SHA256 and AES-256-GCM. The Circle's
 *   genesis, the recipient and its key are bound into every wrap, and the
 *   recipient list into the content's associated data.
 * - Completeness is checked by every replica, without decrypting: the
 *   recipients must be exactly the members in standing who hold an audience
 *   role and a disclosure key when the content is published, plus the
 *   publisher. An envelope that leaves one out, or adds someone, is excluded
 *   from the view (circle-exchange.mjs).
 *
 * Visible to every member: the publisher, the time, the audience roles, the
 * recipients, and the sizes. No digest of the plaintext is published, so
 * short content cannot be guessed from it. A member removed from an audience
 * later can still open what was sealed for them before.
 */

export const CIRCLE_DISCLOSURE_KEY_SCHEMA = 'axiom-circle-disclosure-key.v0';
export const CIRCLE_SEALED_CONTENT_SCHEMA = 'axiom-circle-sealed-content.v0';
export const CIRCLE_SEALED_CONTENT_MAX_BYTES = 65_536;

const DIGEST = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const MAX_RECIPIENTS = 256;
const MAX_AUDIENCE_ROLES = 32;
const WRAP_INFO = 'axiom-circle-disclosure.v0';

/** A new X25519 disclosure key pair; the public key as raw base64url. */
export function generateCircleDisclosureKey() {
  const { privateKey, publicKey } = generateKeyPairSync('x25519');
  const raw = publicKey.export({ format: 'jwk' }).x;
  return { privateKey, publicKey: raw, keyId: circleDisclosureKeyId(raw) };
}

export function circleDisclosureKeyId(publicKey) {
  return sha256(Buffer.from(rawKey(publicKey, 'Disclosure public key')));
}

/** The record a member publishes to announce their disclosure key. */
export function circleDisclosureKeyRecord({ principalId, publicKey, publishedAt }) {
  const record = {
    schema: CIRCLE_DISCLOSURE_KEY_SCHEMA,
    principal_id: principalId,
    key_id: circleDisclosureKeyId(publicKey),
    public_key: publicKey,
    published_at: publishedAt
  };
  validateCircleDisclosureKeyRecord(record);
  return record;
}

export function validateCircleDisclosureKeyRecord(record) {
  exactObject(record, 'Circle disclosure key', ['schema', 'principal_id', 'key_id', 'public_key', 'published_at']);
  if (
    record.schema !== CIRCLE_DISCLOSURE_KEY_SCHEMA
    || !IDENTIFIER.test(record.principal_id ?? '')
    || !validTime(record.published_at)
    || record.key_id !== circleDisclosureKeyId(record.public_key)
  ) throw new ValidationError('Circle disclosure key is invalid');
  return record;
}

/**
 * Seals `value` (any JSON value) for `recipients`
 * ([{ principal_id, key_id, public_key }]), bound to the Circle's genesis.
 * Returns the `sealed_content` record to publish.
 */
export function sealCircleContent({ genesisDigest, publishedBy, publishedAt, audienceRoles, recipients, value }) {
  if (!DIGEST.test(genesisDigest ?? '')) throw new ValidationError('Genesis digest is invalid');
  const sorted = [...recipients].sort((left, right) => compare(left.principal_id, right.principal_id));
  const plaintext = Buffer.from(canonicalJson({ value }));
  if (plaintext.length > CIRCLE_SEALED_CONTENT_MAX_BYTES) {
    throw new ValidationError('Sealed Circle content is too large');
  }
  const contentKey = randomBytes(32);
  const wrapped = sorted.map(recipient => {
    if (recipient.key_id !== circleDisclosureKeyId(recipient.public_key)) {
      throw new ValidationError(`Disclosure key for ${recipient.principal_id} is invalid`);
    }
    const ephemeral = generateKeyPairSync('x25519');
    const ephemeralPublic = ephemeral.publicKey.export({ format: 'jwk' }).x;
    const info = wrapInfo(recipient.principal_id, recipient.key_id, ephemeralPublic);
    const kek = wrappingKey(
      diffieHellman({ privateKey: ephemeral.privateKey, publicKey: publicKeyFrom(recipient.public_key) }),
      genesisDigest,
      info
    );
    const sealed = aesSeal(kek, contentKey, Buffer.from(info));
    return {
      principal_id: recipient.principal_id,
      disclosure_key_id: recipient.key_id,
      ephemeral_public: ephemeralPublic,
      wrap_nonce: sealed.nonce,
      wrapped_key: sealed.ciphertext,
      wrap_tag: sealed.tag
    };
  });
  const header = contentHeader(genesisDigest, wrapped);
  const content = aesSeal(contentKey, plaintext, Buffer.from(canonicalJson(header)));
  const record = {
    published_by: publishedBy,
    published_at: publishedAt,
    audience: { role_ids: [...new Set(audienceRoles)].sort() },
    envelope: {
      schema: CIRCLE_SEALED_CONTENT_SCHEMA,
      genesis_digest: genesisDigest,
      cipher: 'AES-256-GCM',
      nonce: content.nonce,
      ciphertext: content.ciphertext,
      tag: content.tag,
      recipients: wrapped
    }
  };
  validateCircleSealedContentRecord(record, genesisDigest);
  return record;
}

/** Opens a sealed record for one recipient; throws if it is not theirs or was altered. */
export function openCircleSealedContent({ record, genesisDigest, principalId, privateKey }) {
  validateCircleSealedContentRecord(record, genesisDigest);
  const envelope = record.envelope;
  const recipient = envelope.recipients.find(item => item.principal_id === principalId);
  if (!recipient) throw new ValidationError(`${principalId} is not a recipient of this content`);
  const key = typeof privateKey === 'string' || Buffer.isBuffer(privateKey) ? createPrivateKey(privateKey) : privateKey;
  const ownPublic = createPublicKey(key).export({ format: 'jwk' }).x;
  if (circleDisclosureKeyId(ownPublic) !== recipient.disclosure_key_id) {
    throw new ValidationError('This content was sealed for another disclosure key');
  }
  const info = wrapInfo(principalId, recipient.disclosure_key_id, recipient.ephemeral_public);
  const kek = wrappingKey(
    diffieHellman({ privateKey: key, publicKey: publicKeyFrom(recipient.ephemeral_public) }),
    genesisDigest,
    info
  );
  let contentKey;
  let plaintext;
  try {
    contentKey = aesOpen(kek, recipient.wrap_nonce, recipient.wrapped_key, recipient.wrap_tag, Buffer.from(info));
    plaintext = aesOpen(
      contentKey,
      envelope.nonce,
      envelope.ciphertext,
      envelope.tag,
      Buffer.from(canonicalJson(contentHeader(genesisDigest, envelope.recipients)))
    );
  } catch {
    throw new ValidationError('Sealed Circle content cannot be opened');
  }
  return JSON.parse(plaintext.toString('utf8')).value;
}

/** Checks a sealed_content record's shape, without decrypting it. */
export function validateCircleSealedContentRecord(record, genesisDigest) {
  exactObject(record, 'Circle sealed content', ['published_by', 'published_at', 'audience', 'envelope']);
  exactObject(record.audience, 'Circle sealed content audience', ['role_ids']);
  exactObject(record.envelope, 'Circle sealed content envelope', [
    'schema', 'genesis_digest', 'cipher', 'nonce', 'ciphertext', 'tag', 'recipients'
  ]);
  const { audience, envelope } = record;
  const roles = audience.role_ids;
  if (
    !IDENTIFIER.test(record.published_by ?? '')
    || !validTime(record.published_at)
    || !Array.isArray(roles)
    || roles.length < 1
    || roles.length > MAX_AUDIENCE_ROLES
    || roles.some((role, index) => !IDENTIFIER.test(role ?? '') || (index && compare(roles[index - 1], role) >= 0))
    || envelope.schema !== CIRCLE_SEALED_CONTENT_SCHEMA
    || envelope.genesis_digest !== genesisDigest
    || envelope.cipher !== 'AES-256-GCM'
    || !bytes(envelope.nonce, 12, 12)
    || !bytes(envelope.tag, 16, 16)
    || !bytes(envelope.ciphertext, 1, CIRCLE_SEALED_CONTENT_MAX_BYTES + 64)
    || !Array.isArray(envelope.recipients)
    || envelope.recipients.length < 1
    || envelope.recipients.length > MAX_RECIPIENTS
  ) throw new ValidationError('Circle sealed content is invalid');
  envelope.recipients.forEach((recipient, index) => {
    exactObject(recipient, 'Circle sealed content recipient', [
      'principal_id', 'disclosure_key_id', 'ephemeral_public', 'wrap_nonce', 'wrapped_key', 'wrap_tag'
    ]);
    if (
      !IDENTIFIER.test(recipient.principal_id ?? '')
      || (index && compare(envelope.recipients[index - 1].principal_id, recipient.principal_id) >= 0)
      || !DIGEST.test(recipient.disclosure_key_id ?? '')
      || !bytes(recipient.ephemeral_public, 32, 32)
      || !bytes(recipient.wrap_nonce, 12, 12)
      || !bytes(recipient.wrapped_key, 32, 32)
      || !bytes(recipient.wrap_tag, 16, 16)
    ) throw new ValidationError('Circle sealed content recipient is invalid');
  });
  return record;
}

function contentHeader(genesisDigest, recipients) {
  return {
    schema: CIRCLE_SEALED_CONTENT_SCHEMA,
    genesis_digest: genesisDigest,
    recipients: recipients.map(item => [item.principal_id, item.disclosure_key_id])
  };
}

// The content's associated data already binds every recipient's name and
// key; binding each wrap to its recipient as well keeps a wrap from being
// usable under another name even without that check.
function wrapInfo(principalId, keyId, ephemeralPublic) {
  return `${WRAP_INFO}\u0000${principalId}\u0000${keyId}\u0000${ephemeralPublic}`;
}

function wrappingKey(shared, genesisDigest, info) {
  return Buffer.from(hkdfSync('sha256', shared, Buffer.from(genesisDigest, 'hex'), Buffer.from(info), 32));
}

function aesSeal(key, plaintext, aad) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    nonce: nonce.toString('base64url'),
    ciphertext: ciphertext.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url')
  };
}

function aesOpen(key, nonce, ciphertext, tag, aad) {
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(nonce, 'base64url'));
  decipher.setAAD(aad);
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]);
}

function publicKeyFrom(raw) {
  return createPublicKey({ key: { kty: 'OKP', crv: 'X25519', x: raw }, format: 'jwk' });
}

function rawKey(value, name) {
  if (!bytes(value, 32, 32)) throw new ValidationError(`${name} is invalid`);
  return Buffer.from(value, 'base64url');
}

function bytes(value, min, max) {
  if (typeof value !== 'string' || !BASE64URL.test(value)) return false;
  const length = Buffer.from(value, 'base64url').length;
  return length >= min && length <= max && Buffer.from(value, 'base64url').toString('base64url') === value;
}

function validTime(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function compare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
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
