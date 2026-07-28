import { createPublicKey, verify } from 'node:crypto';
import {
  assertPlainObject,
  assertString,
  assertStringArray,
  canonicalJson,
  digestObject,
  sha256,
  ValidationError
} from './canonical.mjs';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;

export function verifyNodeAdmission(input, { requireFuture = true } = {}) {
  const value = assertPlainObject(input, 'node admission');
  const statement = {
    format: 'axiom-node-admission.v1',
    node_id: assertString(value.node_id, 'node_id', { max: 160, pattern: ID }),
    public_key: assertString(value.public_key, 'public_key', { max: 8192 }),
    security_profile: assertString(value.security_profile, 'security_profile', {
      max: 64,
      pattern: /^S[0-3]_[A-Z0-9_]+$/
    }),
    capabilities: uniqueStrings(value.capabilities, 'capabilities', 128, 160),
    software_digest: assertString(value.software_digest, 'software_digest', {
      min: 64,
      max: 64,
      pattern: DIGEST
    }),
    expires_at: isoDate(value.expires_at, 'expires_at', { requireFuture }),
    nonce: assertString(value.nonce, 'nonce', { max: 160, pattern: ID })
  };
  const signature = assertString(value.signature, 'signature', { max: 1024 });
  verifyStatement(statement, signature, statement.public_key);
  return {
    statement,
    signature,
    public_key_digest: sha256(statement.public_key),
    admission_digest: digestObject(statement)
  };
}

export function verifyNodeRenewal(input, { requireFuture = true } = {}) {
  const value = assertPlainObject(input, 'node renewal');
  const publicKey = assertString(value.public_key, 'public_key', { max: 8192 });
  const statement = {
    format: 'axiom-node-renewal.v1',
    node_id: assertString(value.node_id, 'node_id', { max: 160, pattern: ID }),
    capabilities: uniqueStrings(value.capabilities, 'capabilities', 128, 160),
    software_digest: assertString(value.software_digest, 'software_digest', {
      min: 64,
      max: 64,
      pattern: DIGEST
    }),
    expires_at: isoDate(value.expires_at, 'expires_at', { requireFuture }),
    nonce: assertString(value.nonce, 'nonce', { max: 160, pattern: ID })
  };
  const signature = assertString(value.signature, 'signature', { max: 1024 });
  verifyStatement(statement, signature, publicKey);
  return {
    statement,
    signature,
    public_key: publicKey,
    public_key_digest: sha256(publicKey),
    renewal_digest: digestObject(statement)
  };
}

export function verifyStorageOffer(input, { requireFuture = true } = {}) {
  const value = assertPlainObject(input, 'storage offer');
  const publicKey = assertString(value.public_key, 'public_key', { max: 8192 });
  const capacityBytes = nonNegativeInteger(value.capacity_bytes, 'capacity_bytes');
  const availableBytes = nonNegativeInteger(value.available_bytes, 'available_bytes');
  if (availableBytes > capacityBytes) throw new ValidationError('available_bytes cannot exceed capacity_bytes');
  const statement = {
    format: 'axiom-storage-offer.v1',
    node_id: assertString(value.node_id, 'node_id', { max: 160, pattern: ID }),
    capacity_bytes: capacityBytes,
    available_bytes: availableBytes,
    regions: uniqueStrings(value.regions ?? [], 'regions', 32, 64),
    expires_at: isoDate(value.expires_at, 'expires_at', { requireFuture }),
    nonce: assertString(value.nonce, 'nonce', { max: 160, pattern: ID })
  };
  const signature = assertString(value.signature, 'signature', { max: 1024 });
  verifyStatement(statement, signature, publicKey);
  const offerDigest = digestObject(statement);
  return {
    statement,
    signature,
    public_key: publicKey,
    public_key_digest: sha256(publicKey),
    offer_digest: offerDigest,
    offer_id: `offer_${offerDigest}`
  };
}

function verifyStatement(statement, signature, publicKeyPem) {
  let publicKey;
  try {
    publicKey = createPublicKey(publicKeyPem);
  } catch {
    throw new ValidationError('Node public key is invalid');
  }
  if (publicKey.asymmetricKeyType !== 'ed25519') {
    throw new ValidationError('Node public key must use Ed25519');
  }
  let valid = false;
  try {
    valid = verify(
      null,
      Buffer.from(canonicalJson(statement)),
      publicKey,
      Buffer.from(signature, 'base64url')
    );
  } catch {
    valid = false;
  }
  if (!valid) throw new ValidationError('Node statement signature is invalid');
}

function uniqueStrings(value, name, maxItems, itemMax) {
  return [...new Set(assertStringArray(value, name, { maxItems, itemMax }))].sort();
}

function nonNegativeInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ValidationError(`${name} must be a non-negative safe integer`);
  }
  return value;
}

function isoDate(value, name, { requireFuture }) {
  const date = new Date(assertString(value, name, { max: 64 }));
  if (Number.isNaN(date.valueOf())) throw new ValidationError(`${name} must be an ISO timestamp`);
  if (requireFuture && date <= new Date()) throw new ValidationError(`${name} must be in the future`);
  return date.toISOString();
}
