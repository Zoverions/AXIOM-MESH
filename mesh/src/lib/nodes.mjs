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
  const format = nodeFormat(
    value.format,
    'axiom-node-admission.v1',
    'axiom-node-admission.v2'
  );
  const statement = {
    format,
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
  if (format === 'axiom-node-admission.v2') {
    statement.discovery = normalizeDiscovery(value.discovery);
  }
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
  const format = nodeFormat(
    value.format,
    'axiom-node-renewal.v1',
    'axiom-node-renewal.v2'
  );
  const statement = {
    format,
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
  if (format === 'axiom-node-renewal.v2') {
    statement.discovery = normalizeDiscovery(value.discovery);
  }
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

export function normalizeNodeDiscovery(value) {
  return normalizeDiscovery(value);
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

function normalizeDiscovery(value) {
  const input = assertPlainObject(value, 'discovery');
  const endpoint = normalizeEndpoint(input.endpoint);
  const resources = assertPlainObject(input.resources, 'discovery.resources');
  return {
    endpoint,
    failure_domain: assertString(
      input.failure_domain,
      'discovery.failure_domain',
      {
        max: 128,
        pattern: /^[a-z0-9][a-z0-9._:-]{0,127}$/
      }
    ),
    roles: uniqueStrings(input.roles, 'discovery.roles', 32, 128),
    resources: {
      cpu_millis: boundedInteger(
        resources.cpu_millis,
        'discovery.resources.cpu_millis',
        1,
        1_000_000_000
      ),
      memory_bytes: boundedInteger(
        resources.memory_bytes,
        'discovery.resources.memory_bytes',
        1,
        Number.MAX_SAFE_INTEGER
      ),
      storage_bytes: boundedInteger(
        resources.storage_bytes,
        'discovery.resources.storage_bytes',
        0,
        Number.MAX_SAFE_INTEGER
      ),
      max_concurrent_assignments: boundedInteger(
        resources.max_concurrent_assignments,
        'discovery.resources.max_concurrent_assignments',
        1,
        1_024
      )
    }
  };
}

function normalizeEndpoint(value) {
  const raw = assertString(value, 'discovery.endpoint', { max: 512 });
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new ValidationError('discovery.endpoint must be an absolute HTTPS origin');
  }
  if (
    url.protocol !== 'https:'
    || url.username
    || url.password
    || url.search
    || url.hash
    || !url.hostname
    || !['', '/'].includes(url.pathname)
  ) {
    throw new ValidationError(
      'discovery.endpoint must be an HTTPS origin without credentials, path, query, or fragment'
    );
  }
  return url.origin;
}

function boundedInteger(value, name, minimum, maximum) {
  if (
    !Number.isSafeInteger(value)
    || value < minimum
    || value > maximum
  ) {
    throw new ValidationError(
      `${name} must be an integer between ${minimum} and ${maximum}`
    );
  }
  return value;
}

function nodeFormat(value, legacy, current) {
  if (value !== legacy && value !== current) {
    throw new ValidationError(`Node statement format must be ${legacy} or ${current}`);
  }
  return value;
}
