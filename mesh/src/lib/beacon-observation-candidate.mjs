import {
  createPublicKey,
  verify as verifySignature
} from 'node:crypto';
import {
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject,
  sha256,
  ValidationError
} from './canonical.mjs';

export const BEACON_OBSERVATION_CANDIDATE_SCHEMA = 'axiom-beacon-observation-candidate.v0';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/]{0,159}$/;
const NONCE = /^[A-Za-z0-9_-]{16,128}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const MAX_LIFETIME_MS = 5 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 30 * 1000;
const MAX_REPLAY_KEYS = 4096;
const ENVELOPE_KEYS = Object.freeze([
  'schema',
  'version',
  'status',
  'sender_id',
  'sender_public_key_spki',
  'nonce',
  'issued_at',
  'expires_at',
  'content_type',
  'payload_text',
  'payload_digest',
  'signature_algorithm',
  'authority_effect',
  'network_effect',
  'runtime_activation',
  'compatibility_claimed',
  'signature_base64'
]);
const OPTION_KEYS = Object.freeze(['now', 'seen_replay_keys']);

function assertExactKeys(value, allowed, name) {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) {
      throw new ValidationError(`${name} contains unknown field: ${key}`);
    }
  }
  for (const key of allowed) {
    if (!Object.hasOwn(value, key)) {
      throw new ValidationError(`${name} is missing required field: ${key}`);
    }
  }
}

function assertIdentifier(value, name) {
  return assertString(value, name, { min: 1, max: 160, pattern: IDENTIFIER });
}

function assertDigest(value, name) {
  return assertString(value, name, { min: 64, max: 64, pattern: DIGEST });
}

function assertCanonicalInstant(value, name) {
  assertString(value, name, { min: 20, max: 35 });
  const instant = Date.parse(value);
  if (!Number.isFinite(instant) || new Date(instant).toISOString() !== value) {
    throw new ValidationError(`${name} must be a canonical ISO-8601 instant`);
  }
  return instant;
}

function decodeCanonicalBase64(value, name, { maxEncoded = 4096, expectedBytes } = {}) {
  assertString(value, name, { min: 4, max: maxEncoded });
  if (!BASE64.test(value)) {
    throw new ValidationError(`${name} must be canonical base64`);
  }
  const decoded = Buffer.from(value, 'base64');
  if (!decoded.length || decoded.toString('base64') !== value) {
    throw new ValidationError(`${name} must be canonical base64`);
  }
  if (expectedBytes !== undefined && decoded.length !== expectedBytes) {
    throw new ValidationError(`${name} has an invalid byte length`);
  }
  return decoded;
}

function validateReplayOptions(options) {
  assertPlainObject(options, 'Beacon verification options');
  assertExactKeys(options, OPTION_KEYS, 'Beacon verification options');
  const nowMs = assertCanonicalInstant(options.now, 'Beacon verification options.now');
  if (!Array.isArray(options.seen_replay_keys) || options.seen_replay_keys.length > MAX_REPLAY_KEYS) {
    throw new ValidationError(`Beacon replay state must be an array with at most ${MAX_REPLAY_KEYS} items`);
  }
  const seen = new Set();
  for (const value of options.seen_replay_keys) {
    if (typeof value !== 'string' || !DIGEST.test(value)) {
      throw new ValidationError('Beacon replay state contains an invalid replay key');
    }
    if (seen.has(value)) {
      throw new ValidationError('Beacon replay state contains duplicate replay keys');
    }
    seen.add(value);
  }
  return { nowMs, seen };
}

function validateEnvelopeShape(envelope) {
  assertPlainObject(envelope, 'Beacon observation envelope');
  assertExactKeys(envelope, ENVELOPE_KEYS, 'Beacon observation envelope');

  if (envelope.schema !== BEACON_OBSERVATION_CANDIDATE_SCHEMA) {
    throw new ValidationError('Beacon observation schema is unsupported');
  }
  if (envelope.version !== 0) {
    throw new ValidationError('Beacon observation version must be 0');
  }
  if (envelope.status !== 'read-only-external-observation') {
    throw new ValidationError('Beacon observation status is unsupported');
  }

  assertIdentifier(envelope.sender_id, 'sender_id');
  decodeCanonicalBase64(envelope.sender_public_key_spki, 'sender_public_key_spki', { maxEncoded: 1024 });
  assertString(envelope.nonce, 'nonce', { min: 16, max: 128, pattern: NONCE });
  const issuedMs = assertCanonicalInstant(envelope.issued_at, 'issued_at');
  const expiresMs = assertCanonicalInstant(envelope.expires_at, 'expires_at');

  if (!['application/json', 'text/plain'].includes(envelope.content_type)) {
    throw new ValidationError('content_type is unsupported');
  }
  assertString(envelope.payload_text, 'payload_text', { min: 1, max: 16_384 });
  assertDigest(envelope.payload_digest, 'payload_digest');
  if (sha256(envelope.payload_text) !== envelope.payload_digest) {
    throw new ValidationError('Beacon observation payload digest does not match payload_text');
  }
  if (envelope.signature_algorithm !== 'ed25519') {
    throw new ValidationError('signature_algorithm must be ed25519');
  }
  decodeCanonicalBase64(envelope.signature_base64, 'signature_base64', {
    maxEncoded: 128,
    expectedBytes: 64
  });

  if (
    envelope.authority_effect !== 'none'
    || envelope.network_effect !== 'none'
    || envelope.runtime_activation !== false
    || envelope.compatibility_claimed !== false
  ) {
    throw new ValidationError('Beacon observation boundary cannot widen authority, network, runtime, or compatibility claims');
  }

  return { issuedMs, expiresMs };
}

function signingDocument(envelope) {
  const document = {};
  for (const key of ENVELOPE_KEYS) {
    if (key !== 'signature_base64') document[key] = envelope[key];
  }
  return document;
}

export function beaconObservationReplayKey(envelope) {
  assertPlainObject(envelope, 'Beacon observation envelope');
  assertIdentifier(envelope.sender_id, 'sender_id');
  assertString(envelope.nonce, 'nonce', { min: 16, max: 128, pattern: NONCE });
  return digestObject({ sender_id: envelope.sender_id, nonce: envelope.nonce });
}

export function verifyBeaconObservationEnvelope(envelope, options) {
  const { nowMs, seen } = validateReplayOptions(options);
  const { issuedMs, expiresMs } = validateEnvelopeShape(envelope);

  if (expiresMs < issuedMs || expiresMs - issuedMs > MAX_LIFETIME_MS) {
    throw new ValidationError('Beacon observation lifetime must be between zero and five minutes');
  }
  if (issuedMs > nowMs + MAX_FUTURE_SKEW_MS) {
    throw new ValidationError('Beacon observation is future-dated beyond the allowed skew');
  }
  if (expiresMs < nowMs) {
    throw new ValidationError('Beacon observation is expired');
  }

  const replayKey = beaconObservationReplayKey(envelope);
  if (seen.has(replayKey)) {
    throw new ValidationError('Beacon observation replay detected');
  }

  const publicKeyBytes = decodeCanonicalBase64(
    envelope.sender_public_key_spki,
    'sender_public_key_spki',
    { maxEncoded: 1024 }
  );
  let publicKey;
  try {
    publicKey = createPublicKey({ key: publicKeyBytes, format: 'der', type: 'spki' });
  } catch {
    throw new ValidationError('Beacon observation sender public key is invalid');
  }
  if (publicKey.asymmetricKeyType !== 'ed25519') {
    throw new ValidationError('Beacon observation sender public key must be Ed25519');
  }

  const signature = decodeCanonicalBase64(envelope.signature_base64, 'signature_base64', {
    maxEncoded: 128,
    expectedBytes: 64
  });
  const message = Buffer.from(canonicalJson(signingDocument(envelope)), 'utf8');
  if (!verifySignature(null, message, publicKey, signature)) {
    throw new ValidationError('Beacon observation signature verification failed');
  }

  return Object.freeze({
    valid: true,
    schema: envelope.schema,
    version: envelope.version,
    sender_id: envelope.sender_id,
    sender_key_fingerprint: sha256(publicKeyBytes),
    observation_digest: digestObject(envelope),
    replay_key: replayKey,
    signature_verified: true,
    freshness_verified: true,
    replay_checked: true,
    replay_persistence: false,
    network_listener: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false,
    compatibility_claimed: false
  });
}
