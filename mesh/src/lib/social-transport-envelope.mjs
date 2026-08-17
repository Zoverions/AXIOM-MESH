import {
  createPrivateKey,
  createPublicKey,
  sign,
  verify
} from 'node:crypto';

import {
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject,
  sha256
} from './canonical.mjs';
import { SOCIAL_EXCHANGE_PACKAGE_SCHEMA } from './social-exchange-package.mjs';

export const SOCIAL_TRANSPORT_ENVELOPE_SCHEMA = 'axiom-social-transport-envelope.v1';

const MAX_ENVELOPE_BYTES = 2_359_296;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const NONCE = /^[A-Za-z0-9][A-Za-z0-9_-]{15,191}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const MAX_CLOCK_SKEW_MS = 5 * 60_000;
const MAX_RESPONSE_AGE_MS = 10 * 60_000;

const ENVELOPE_KEYS = new Set(['schema', 'statement', 'package', 'signature']);
const STATEMENT_KEYS = new Set([
  'scope',
  'source_origin',
  'package_digest',
  'package_bytes_digest',
  'transport_key_id',
  'exporter_grid_id',
  'exporter_key_id',
  'request_nonce',
  'sent_at',
  'delivery_claimed',
  'admission_claimed',
  'federation_claimed',
  'authority_effect'
]);

export function createSocialTransportEnvelope({
  package: packageValue,
  sourceOrigin,
  transportPrivateKey,
  transportPublicKey,
  requestNonce,
  sentAt = new Date().toISOString(),
  now = Date.now()
}) {
  const publicKey = parsePublicKey(transportPublicKey, 'social transport public key');
  const privateKey = parsePrivateKey(transportPrivateKey, 'social transport private key');
  const derivedPublic = createPublicKey(privateKey)
    .export({ type: 'spki', format: 'pem' })
    .toString();
  if (sha256(derivedPublic) !== publicKey.keyId) {
    throw new ValidationError('social transport private key does not match the supplied public key');
  }

  const packageHeader = inspectPackageHeader(packageValue);
  const statement = normalizeStatement({
    scope: 'social-package-transfer',
    source_origin: normalizeSocialTransportOrigin(sourceOrigin),
    package_digest: packageHeader.packageDigest,
    package_bytes_digest: sha256(canonicalJson(packageValue)),
    transport_key_id: publicKey.keyId,
    exporter_grid_id: packageHeader.exporterGridId,
    exporter_key_id: packageHeader.exporterKeyId,
    request_nonce: requestNonce,
    sent_at: sentAt,
    delivery_claimed: false,
    admission_claimed: false,
    federation_claimed: false,
    authority_effect: 'none'
  }, { now });
  const signed = {
    schema: SOCIAL_TRANSPORT_ENVELOPE_SCHEMA,
    statement
  };
  const signature = sign(
    null,
    Buffer.from(canonicalJson(signed)),
    privateKey
  ).toString('base64url');

  return Object.freeze({
    schema: SOCIAL_TRANSPORT_ENVELOPE_SCHEMA,
    statement,
    package: structuredClone(packageValue),
    signature
  });
}

export function verifySocialTransportEnvelope(input, {
  trustedTransportPublicKey,
  expectedSourceOrigin,
  expectedPackageDigest,
  expectedExporterGridId,
  expectedExporterKeyId,
  expectedRequestNonce,
  now = Date.now()
} = {}) {
  const value = assertPlainObject(input, 'social transport envelope');
  assertExactKeys(value, ENVELOPE_KEYS, 'social transport envelope');
  if (value.schema !== SOCIAL_TRANSPORT_ENVELOPE_SCHEMA) {
    throw new ValidationError('unsupported social transport envelope schema');
  }
  if (Buffer.byteLength(canonicalJson(value)) > MAX_ENVELOPE_BYTES) {
    throw new ValidationError('social transport envelope exceeds the byte limit');
  }

  const trustedKey = parsePublicKey(
    trustedTransportPublicKey,
    'trusted social transport public key'
  );
  const statement = normalizeStatement(value.statement, { now });
  if (statement.transport_key_id !== trustedKey.keyId) {
    throw new ValidationError('social transport key does not match the trusted transport key');
  }
  if (
    expectedSourceOrigin !== undefined
    && statement.source_origin !== normalizeSocialTransportOrigin(expectedSourceOrigin)
  ) {
    throw new ValidationError('social transport source origin does not match the expected source');
  }
  if (
    expectedPackageDigest !== undefined
    && statement.package_digest !== digest(expectedPackageDigest, 'expected social package digest')
  ) {
    throw new ValidationError('social transport package digest does not match the requested package');
  }
  if (
    expectedExporterGridId !== undefined
    && statement.exporter_grid_id !== identifier(
      expectedExporterGridId,
      'expected social exporter Grid id'
    )
  ) {
    throw new ValidationError('social transport exporter Grid does not match the expected exporter');
  }
  if (
    expectedExporterKeyId !== undefined
    && statement.exporter_key_id !== digest(
      expectedExporterKeyId,
      'expected social exporter key id'
    )
  ) {
    throw new ValidationError('social transport exporter key does not match the expected exporter');
  }
  if (
    expectedRequestNonce !== undefined
    && statement.request_nonce !== nonce(expectedRequestNonce, 'expected social transport request nonce')
  ) {
    throw new ValidationError('social transport response is not bound to the current request nonce');
  }

  const packageHeader = inspectPackageHeader(value.package);
  if (
    packageHeader.packageDigest !== statement.package_digest
    || packageHeader.exporterGridId !== statement.exporter_grid_id
    || packageHeader.exporterKeyId !== statement.exporter_key_id
  ) {
    throw new ValidationError('social transport envelope package binding is invalid');
  }
  if (sha256(canonicalJson(value.package)) !== statement.package_bytes_digest) {
    throw new ValidationError('social transport package byte digest is invalid');
  }

  const signed = {
    schema: SOCIAL_TRANSPORT_ENVELOPE_SCHEMA,
    statement
  };
  const signature = assertString(value.signature, 'social transport signature', {
    min: 1,
    max: 1024,
    pattern: BASE64URL
  });
  let valid = false;
  try {
    valid = verify(
      null,
      Buffer.from(canonicalJson(signed)),
      trustedKey.key,
      Buffer.from(signature, 'base64url')
    );
  } catch {
    valid = false;
  }
  if (!valid) throw new ValidationError('social transport signature is invalid');

  return Object.freeze({
    valid: true,
    schema: SOCIAL_TRANSPORT_ENVELOPE_SCHEMA,
    statement,
    package: structuredClone(value.package),
    transport_key_id: trustedKey.keyId,
    delivery_claimed: false,
    admission_claimed: false,
    federation_claimed: false,
    authority_effect: 'none'
  });
}

export function socialTransportPublicKeyId(publicKeyPem) {
  return parsePublicKey(publicKeyPem, 'social transport public key').keyId;
}

export function normalizeSocialTransportOrigin(value) {
  const raw = assertString(value, 'social transport origin', { min: 8, max: 2048 });
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new ValidationError('social transport origin must be an absolute HTTPS origin');
  }
  if (
    url.protocol !== 'https:'
    || url.username
    || url.password
    || url.pathname !== '/'
    || url.search
    || url.hash
  ) {
    throw new ValidationError(
      'social transport origin must be an exact HTTPS origin without credentials or path'
    );
  }
  return url.origin;
}

function inspectPackageHeader(input) {
  const value = assertPlainObject(input, 'social transport package');
  if (value.schema !== SOCIAL_EXCHANGE_PACKAGE_SCHEMA) {
    throw new ValidationError('social transport carries an unsupported social package schema');
  }
  const packageDigest = digest(value.package_digest, 'social transport package_digest');
  const statement = assertPlainObject(value.statement, 'social transport package statement');
  if (packageDigest !== digestObject(statement)) {
    throw new ValidationError('social transport package digest does not bind the package statement');
  }
  const exporter = assertPlainObject(statement.exporter, 'social transport package exporter');
  return {
    packageDigest,
    exporterGridId: identifier(exporter.grid_id, 'social transport exporter grid_id'),
    exporterKeyId: digest(exporter.key_id, 'social transport exporter key_id')
  };
}

function normalizeStatement(input, { now }) {
  const value = assertPlainObject(input, 'social transport statement');
  assertExactKeys(value, STATEMENT_KEYS, 'social transport statement');
  if (value.scope !== 'social-package-transfer') {
    throw new ValidationError('social transport scope must be social-package-transfer');
  }
  if (
    value.delivery_claimed !== false
    || value.admission_claimed !== false
    || value.federation_claimed !== false
    || value.authority_effect !== 'none'
  ) {
    throw new ValidationError('social transport envelope cannot claim delivery, admission, federation, or authority');
  }
  const sentAt = canonicalTimestamp(value.sent_at, 'social transport sent_at');
  const sentMs = Date.parse(sentAt);
  if (sentMs > now + MAX_CLOCK_SKEW_MS) {
    throw new ValidationError('social transport sent_at is too far in the future');
  }
  if (sentMs < now - MAX_RESPONSE_AGE_MS) {
    throw new ValidationError('social transport response is stale');
  }
  return Object.freeze({
    scope: 'social-package-transfer',
    source_origin: normalizeSocialTransportOrigin(value.source_origin),
    package_digest: digest(value.package_digest, 'social transport package_digest'),
    package_bytes_digest: digest(
      value.package_bytes_digest,
      'social transport package_bytes_digest'
    ),
    transport_key_id: digest(value.transport_key_id, 'social transport transport_key_id'),
    exporter_grid_id: identifier(value.exporter_grid_id, 'social transport exporter_grid_id'),
    exporter_key_id: digest(value.exporter_key_id, 'social transport exporter_key_id'),
    request_nonce: nonce(value.request_nonce, 'social transport request_nonce'),
    sent_at: sentAt,
    delivery_claimed: false,
    admission_claimed: false,
    federation_claimed: false,
    authority_effect: 'none'
  });
}

function parsePublicKey(value, label) {
  const raw = assertString(value, label, { min: 64, max: 8192 });
  let key;
  try {
    key = createPublicKey(raw);
  } catch {
    throw new ValidationError(`${label} is invalid`);
  }
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new ValidationError(`${label} must use Ed25519`);
  }
  const canonicalPem = key.export({ type: 'spki', format: 'pem' }).toString();
  return { key, keyId: sha256(canonicalPem) };
}

function parsePrivateKey(value, label) {
  const raw = assertString(value, label, { min: 64, max: 8192 });
  let key;
  try {
    key = createPrivateKey(raw);
  } catch {
    throw new ValidationError(`${label} is invalid`);
  }
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new ValidationError(`${label} must use Ed25519`);
  }
  return key;
}

function canonicalTimestamp(value, label) {
  const raw = assertString(value, label, { min: 20, max: 40 });
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString() !== raw) {
    throw new ValidationError(`${label} must be canonical ISO-8601 UTC`);
  }
  return raw;
}

function identifier(value, label) {
  return assertString(value, label, { min: 1, max: 192, pattern: IDENTIFIER });
}

function digest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

function nonce(value, label) {
  return assertString(value, label, { min: 16, max: 192, pattern: NONCE });
}

function assertExactKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ValidationError(`${label} contains unsupported field ${key}`);
  }
  for (const key of allowed) {
    if (!(key in value)) throw new ValidationError(`${label} is missing required field ${key}`);
  }
}
