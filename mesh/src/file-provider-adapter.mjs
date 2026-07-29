import {
  createPrivateKey,
  createPublicKey,
  sign
} from 'node:crypto';
import {
  readFile,
  stat
} from 'node:fs/promises';
import {
  isAbsolute,
  resolve
} from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject,
  sha256
} from './lib/canonical.mjs';
import {
  REQUEST_SCHEMA,
  RESPONSE_SCHEMA
} from './lib/provider-runtime.mjs';

const ADAPTER_SCHEMA = 'axiom-file-provider-adapter.v1';
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const RESOURCE_ID = /^[A-Za-z0-9][A-Za-z0-9/_.:-]{0,255}$/;
const MAX_CONFIG_BYTES = 2_097_152;
const MAX_REQUEST_BYTES = 1_048_576;
const MAX_RESOURCE_BYTES = 4_194_304;

export async function serveFileProviderRequest(request, configPath, {
  now = Date.now()
} = {}) {
  const config = await loadFileProviderAdapterConfig(configPath);
  const normalizedRequest = normalizeRequest(request, config, now);
  const resources = [];
  for (const requested of normalizedRequest.resources) {
    const configured = config.resources[requested.resource_id];
    const metadata = await stat(configured.path);
    if (
      !metadata.isFile()
      || metadata.size < 1
      || metadata.size > requested.maximum_bytes
      || metadata.size > MAX_RESOURCE_BYTES
    ) {
      throw new ValidationError('Provider resource exceeds its requested bound');
    }
    if (
      process.platform !== 'win32'
      && (metadata.mode & 0o022) !== 0
    ) {
      throw new ValidationError('Provider resources must not be group or other writable');
    }
    if (
      configured.classification === 'secret'
      && process.platform !== 'win32'
      && (metadata.mode & 0o077) !== 0
    ) {
      throw new ValidationError('Secret provider resources must be private');
    }
    const content = await readFile(configured.path);
    const contentDigest = sha256(content);
    resources.push({
      alias: requested.alias,
      resource_id: requested.resource_id,
      version: `sha256:${contentDigest}`,
      media_type: requested.media_type,
      content_base64: content.toString('base64url'),
      bytes: content.length,
      sha256: contentDigest
    });
  }
  const responseExpiresAt = Math.min(
    Date.parse(normalizedRequest.expires_at),
    now + 30_000
  );
  const unsigned = {
    schema: RESPONSE_SCHEMA,
    provider_id: config.provider_id,
    deployment_id: normalizedRequest.deployment_id,
    request_id: normalizedRequest.request_id,
    request_digest: digestObject(normalizedRequest),
    issued_at: new Date(now).toISOString(),
    expires_at: new Date(responseExpiresAt).toISOString(),
    resources
  };
  return {
    ...unsigned,
    signature: signResponse(unsigned, config)
  };
}

export async function loadFileProviderAdapterConfig(configPath) {
  const path = absolutePath(configPath, 'file provider adapter config path');
  const serialized = await privateFile(
    path,
    MAX_CONFIG_BYTES,
    'File provider adapter config'
  );
  let parsed;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new ValidationError('File provider adapter config must contain valid JSON');
  }
  const value = assertPlainObject(parsed, 'file provider adapter config');
  assertOnlyKeys(value, [
    'schema',
    'provider_id',
    'private_key_file',
    'public_key_file',
    'resources'
  ], 'file provider adapter config');
  if (value.schema !== ADAPTER_SCHEMA) {
    throw new ValidationError(`File provider adapter schema must be ${ADAPTER_SCHEMA}`);
  }
  const providerId = assertString(value.provider_id, 'provider_id', {
    max: 160,
    pattern: ID
  });
  const privateKeyFile = absolutePath(
    value.private_key_file,
    'private_key_file'
  );
  const publicKeyFile = absolutePath(
    value.public_key_file,
    'public_key_file'
  );
  const [privatePem, publicPem] = await Promise.all([
    privateFile(privateKeyFile, 16_384, 'Provider private key'),
    boundedFile(publicKeyFile, 16_384, 'Provider public key')
  ]);
  let privateKey;
  let publicKey;
  try {
    privateKey = createPrivateKey(privatePem);
    publicKey = createPublicKey(publicPem);
  } catch {
    throw new ValidationError('File provider signing identity is invalid');
  }
  if (
    privateKey.asymmetricKeyType !== 'ed25519'
    || publicKey.asymmetricKeyType !== 'ed25519'
    || !createPublicKey(privateKey).equals(publicKey)
  ) {
    throw new ValidationError('File provider signing identity must be a matching Ed25519 pair');
  }
  const rawResources = assertPlainObject(value.resources, 'provider resources');
  const entries = Object.entries(rawResources);
  if (entries.length < 1 || entries.length > 64) {
    throw new ValidationError('File provider adapter must expose 1-64 resources');
  }
  const resources = {};
  for (const [resourceId, raw] of entries) {
    if (!RESOURCE_ID.test(resourceId)) {
      throw new ValidationError('File provider resource ID is invalid');
    }
    const resource = assertPlainObject(raw, `provider resource ${resourceId}`);
    assertOnlyKeys(
      resource,
      ['path', 'classification', 'media_type'],
      `provider resource ${resourceId}`
    );
    if (!['secret', 'policy', 'configuration'].includes(resource.classification)) {
      throw new ValidationError('File provider resource classification is invalid');
    }
    resources[resourceId] = Object.freeze({
      path: absolutePath(resource.path, `provider resource ${resourceId} path`),
      classification: resource.classification,
      media_type: assertString(
        resource.media_type,
        `provider resource ${resourceId} media_type`,
        {
          max: 160,
          pattern: /^[a-z0-9][a-z0-9.+-]+\/[A-Za-z0-9][A-Za-z0-9.+-]+$/
        }
      )
    });
  }
  return Object.freeze({
    path,
    schema: ADAPTER_SCHEMA,
    provider_id: providerId,
    private_key_file: privateKeyFile,
    public_key_file: publicKeyFile,
    private_key: privateKey,
    public_key: publicKey,
    public_key_pem: publicPem,
    resources: Object.freeze(resources)
  });
}

function normalizeRequest(input, config, now) {
  const value = assertPlainObject(input, 'provider request');
  assertOnlyKeys(value, [
    'schema',
    'provider_id',
    'deployment_id',
    'request_id',
    'nonce',
    'issued_at',
    'expires_at',
    'resources'
  ], 'provider request');
  if (value.schema !== REQUEST_SCHEMA || value.provider_id !== config.provider_id) {
    throw new ValidationError('Provider request is addressed to a different provider');
  }
  const issuedAt = canonicalTimestamp(value.issued_at, 'request issued_at');
  const expiresAt = canonicalTimestamp(value.expires_at, 'request expires_at');
  if (
    issuedAt > now + 30_000
    || expiresAt <= now
    || expiresAt - issuedAt > 60_000
  ) {
    throw new ValidationError('Provider request is expired or outside its time bound');
  }
  if (
    !Array.isArray(value.resources)
    || value.resources.length < 1
    || value.resources.length > 32
  ) {
    throw new ValidationError('Provider request resource set is invalid');
  }
  const seenAliases = new Set();
  const seenResources = new Set();
  const resources = value.resources.map(raw => {
    const resource = assertPlainObject(raw, 'provider request resource');
    assertOnlyKeys(resource, [
      'alias',
      'resource_id',
      'classification',
      'media_type',
      'maximum_bytes'
    ], 'provider request resource');
    const alias = assertString(resource.alias, 'resource alias', {
      max: 160,
      pattern: RESOURCE_ID
    });
    const resourceId = assertString(resource.resource_id, 'resource_id', {
      max: 256,
      pattern: RESOURCE_ID
    });
    if (seenAliases.has(alias) || seenResources.has(resourceId)) {
      throw new ValidationError('Provider request resources must be unique');
    }
    seenAliases.add(alias);
    seenResources.add(resourceId);
    const configured = config.resources[resourceId];
    if (
      !configured
      || configured.classification !== resource.classification
      || configured.media_type !== resource.media_type
    ) {
      throw new ValidationError('Provider request resource binding is invalid');
    }
    if (
      !Number.isSafeInteger(resource.maximum_bytes)
      || resource.maximum_bytes < 1
      || resource.maximum_bytes > MAX_RESOURCE_BYTES
    ) {
      throw new ValidationError('Provider request resource byte bound is invalid');
    }
    return {
      alias,
      resource_id: resourceId,
      classification: resource.classification,
      media_type: resource.media_type,
      maximum_bytes: resource.maximum_bytes
    };
  });
  return {
    schema: REQUEST_SCHEMA,
    provider_id: config.provider_id,
    deployment_id: assertString(value.deployment_id, 'deployment_id', {
      max: 160,
      pattern: ID
    }),
    request_id: assertString(value.request_id, 'request_id', {
      max: 160,
      pattern: ID
    }),
    nonce: assertString(value.nonce, 'request nonce', {
      min: 43,
      max: 43,
      pattern: /^[A-Za-z0-9_-]+$/
    }),
    issued_at: value.issued_at,
    expires_at: value.expires_at,
    resources
  };
}

function signResponse(value, config) {
  const body = canonicalJson(value);
  return {
    algorithm: 'Ed25519',
    key_id: `${config.provider_id}:${sha256(config.public_key_pem).slice(0, 16)}`,
    digest: sha256(body),
    signature: sign(
      null,
      Buffer.from(body),
      config.private_key
    ).toString('base64url')
  };
}

async function readStdinBounded(maximumBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > maximumBytes) {
      throw new ValidationError('Provider request exceeds the byte limit');
    }
    chunks.push(Buffer.from(chunk));
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ValidationError('Provider request must contain valid JSON');
  }
}

async function boundedFile(path, maximumBytes, label, {
  requirePrivate = false
} = {}) {
  const metadata = await stat(path);
  if (!metadata.isFile() || metadata.size < 1 || metadata.size > maximumBytes) {
    throw new ValidationError(`${label} must be a bounded regular file`);
  }
  if (
    requirePrivate
    && process.platform !== 'win32'
    && (metadata.mode & 0o077) !== 0
  ) {
    throw new ValidationError(`${label} must not be accessible by group or others`);
  }
  return readFile(path, 'utf8');
}

function privateFile(path, maximumBytes, label) {
  return boundedFile(path, maximumBytes, label, { requirePrivate: true });
}

function absolutePath(value, name) {
  if (typeof value !== 'string' || !isAbsolute(value)) {
    throw new ValidationError(`${name} must be an absolute path`);
  }
  return resolve(value);
}

function canonicalTimestamp(value, name) {
  const raw = assertString(value, name, { max: 64 });
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== raw) {
    throw new ValidationError(`${name} must be a canonical ISO timestamp`);
  }
  return parsed.valueOf();
}

function assertOnlyKeys(value, allowed, name) {
  const allowedSet = new Set(allowed);
  if (Object.keys(value).some(key => !allowedSet.has(key))) {
    throw new ValidationError(`${name} contains unsupported fields`);
  }
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const request = await readStdinBounded(MAX_REQUEST_BYTES);
  const response = await serveFileProviderRequest(request, process.argv[2]);
  process.stdout.write(`${canonicalJson(response)}\n`);
}

export {
  ADAPTER_SCHEMA
};
