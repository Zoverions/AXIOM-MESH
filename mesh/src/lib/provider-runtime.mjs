import { spawn } from 'node:child_process';
import {
  createHash,
  createPublicKey,
  randomBytes,
  randomUUID
} from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile
} from 'node:fs/promises';
import {
  dirname,
  isAbsolute,
  join,
  parse,
  relative,
  resolve,
  sep
} from 'node:path';
import {
  AxiomError,
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject,
  sha256
} from './canonical.mjs';
import { normalizePrincipals } from './config.mjs';
import { verifyObjectSignature } from './identity.mjs';
import { validatePolicy } from './policy.mjs';
import { loadTransportRuntime } from './transport-credentials.mjs';
import { validateCapabilityRegistry } from '../check-registry.mjs';

const CONFIG_SCHEMA = 'axiom-provider-runtime-config.v1';
const REQUEST_SCHEMA = 'axiom-provider-request.v1';
const RESPONSE_SCHEMA = 'axiom-provider-response.v1';
const RECEIPT_SCHEMA = 'axiom-provider-runtime-receipt.v1';
const PROVIDER_CLASSES = Object.freeze(['secret', 'policy']);
const TRANSPORT_SERVICES = Object.freeze([
  'gateway',
  'grid',
  'hypervisor',
  'sandbox',
  'supervisor'
]);
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const SIGNATURE_KEY_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const RESOURCE_ID = /^[A-Za-z0-9][A-Za-z0-9/_.:-]{0,255}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const ENVIRONMENT_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
const MAX_CONFIG_BYTES = 1_048_576;
const MAX_KEY_BYTES = 16_384;
const MAX_ARGUMENTS = 32;
const MAX_ARTIFACTS = 16;
const MAX_POLICY_LAYERS = 8;
const RESPONSE_CLOCK_SKEW_MS = 30_000;
const MAX_RESPONSE_TTL_MS = 60_000;
const SAFE_INHERITED_ENVIRONMENT = new Set([
  'AWS_DEFAULT_REGION',
  'AWS_REGION',
  'AWS_ROLE_ARN',
  'AWS_ROLE_SESSION_NAME',
  'AWS_WEB_IDENTITY_TOKEN_FILE',
  'AZURE_CLIENT_ID',
  'AZURE_FEDERATED_TOKEN_FILE',
  'AZURE_TENANT_ID',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'GOOGLE_CLOUD_PROJECT',
  'HTTPS_PROXY',
  'HTTP_PROXY',
  'NO_PROXY'
]);

export async function loadProviderRuntimeConfig(configPath) {
  const path = absolutePath(configPath, 'provider runtime config path');
  const serialized = await privateRegularFile(
    path,
    MAX_CONFIG_BYTES,
    'Provider runtime config'
  );
  let parsed;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new ValidationError('Provider runtime config must contain valid JSON');
  }
  const config = normalizeProviderRuntimeConfig(parsed);
  const providers = {};
  for (const providerClass of PROVIDER_CLASSES) {
    const provider = config.providers[providerClass];
    const publicKeyPems = await Promise.all(
      provider.public_key_files.map((keyPath, index) => regularFile(
        keyPath,
        MAX_KEY_BYTES,
        `${providerClass} provider public key ${index + 1}`,
        { requireNotWritable: true }
      ))
    );
    const publicKeys = publicKeyPems.map(pem => {
      let key;
      try {
        key = createPublicKey(pem);
      } catch {
        throw new ValidationError(`${providerClass} provider public key is invalid`);
      }
      if (key.asymmetricKeyType !== 'ed25519') {
        throw new ValidationError(`${providerClass} provider public key must use Ed25519`);
      }
      return key;
    });
    providers[providerClass] = Object.freeze({
      ...provider,
      public_keys: Object.freeze(publicKeys),
      public_key_digests: Object.freeze(publicKeys.map(key => sha256(
        key.export({ type: 'spki', format: 'der' })
      )))
    });
  }
  const overlap = providers.secret.public_key_digests.filter(digest => (
    providers.policy.public_key_digests.includes(digest)
  ));
  if (overlap.length) {
    throw new ValidationError(
      'Secret and policy providers must use independent signing identities'
    );
  }
  return Object.freeze({
    path,
    schema: config.schema,
    deployment_id: config.deployment_id,
    runtime_directory: config.runtime_directory,
    providers: Object.freeze(providers),
    resources: config.resources,
    config_digest: digestObject(parsed)
  });
}

export async function prepareProviderRuntime(configPath, {
  now = Date.now(),
  spawnImpl = spawn,
  environment = process.env
} = {}) {
  const config = await loadProviderRuntimeConfig(configPath);
  const expectations = providerExpectations(config);
  const results = {};
  for (const providerClass of PROVIDER_CLASSES) {
    const request = providerRequest(
      config,
      providerClass,
      expectations[providerClass],
      now
    );
    const rawResponse = await executeProvider(
      config.providers[providerClass],
      request,
      { spawnImpl, environment }
    );
    results[providerClass] = verifyProviderResponse({
      response: rawResponse,
      request,
      provider: config.providers[providerClass],
      expectations: expectations[providerClass],
      now
    });
  }

  await mkdir(config.runtime_directory, { recursive: true, mode: 0o700 });
  await assertPrivatePath(config.runtime_directory, 'Provider runtime directory');
  const runtimeLock = await acquireRuntimeLock(config.runtime_directory, now);
  const sessionId = `session-${randomUUID()}`;
  const sessionPath = join(config.runtime_directory, sessionId);
  try {
    const existing = (await readdir(config.runtime_directory)).filter(
      name => name !== '.provider-runtime.lock'
    );
    if (existing.length) {
      throw providerError('provider_runtime_not_empty');
    }
    await mkdir(sessionPath, { mode: 0o700 });
    const byAlias = new Map(
      PROVIDER_CLASSES.flatMap(providerClass => (
        results[providerClass].resources.map(resource => [
          resource.alias,
          resource
        ])
      ))
    );
    const paths = materializedPaths(sessionPath, config.resources);
    for (const [alias, path] of Object.entries(paths.by_alias)) {
      const resource = byAlias.get(alias);
      if (!resource) {
        throw new ValidationError(`Provider response is missing ${alias}`);
      }
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      await writeFile(path, resource.content, { mode: 0o600, flag: 'wx' });
      await assertPrivatePath(path, `Materialized provider resource ${alias}`);
    }
    await validateMaterializedRuntime(paths, now);
    const receipt = {
      schema: RECEIPT_SCHEMA,
      deployment_id: config.deployment_id,
      session_id: sessionId,
      config_digest: config.config_digest,
      prepared_at: isoNow(now),
      providers: Object.fromEntries(PROVIDER_CLASSES.map(providerClass => [
        providerClass,
        {
          provider_id: config.providers[providerClass].provider_id,
          response_digest: results[providerClass].response_digest,
          signing_key_digest: results[providerClass].signing_key_digest
        }
      ])),
      resources: PROVIDER_CLASSES.flatMap(providerClass => (
        results[providerClass].resources.map(resource => ({
          alias: resource.alias,
          provider_class: providerClass,
          version: resource.version,
          media_type: resource.media_type,
          bytes: resource.bytes,
          sha256: resource.sha256
        }))
      )).sort((left, right) => left.alias.localeCompare(right.alias))
    };
    await writeFile(
      join(sessionPath, 'provider-receipt.json'),
      `${canonicalJson(receipt)}\n`,
      { mode: 0o600, flag: 'wx' }
    );
    let cleaned = false;
    return Object.freeze({
      config,
      session_id: sessionId,
      session_path: sessionPath,
      paths,
      receipt: Object.freeze(receipt),
      environment: Object.freeze(providerEnvironment(paths)),
      async cleanup() {
        if (cleaned) return;
        assertOwnedSession(config.runtime_directory, sessionPath, sessionId);
        await rm(sessionPath, { recursive: true, force: true });
        await runtimeLock.release();
        cleaned = true;
      }
    });
  } catch (error) {
    assertOwnedSession(config.runtime_directory, sessionPath, sessionId);
    await rm(sessionPath, { recursive: true, force: true });
    await runtimeLock.release();
    throw error;
  }
}

export function providerEnvironment(paths) {
  return {
    AXIOM_DATA_KEY: '',
    AXIOM_DATA_KEY_FILE: paths.data_key,
    AXIOM_API_TOKENS: '',
    AXIOM_API_TOKENS_FILE: paths.api_tokens,
    AXIOM_TRANSPORT_DIR: paths.transport_directory,
    AXIOM_POLICY_PATH: paths.policy_layers[0],
    AXIOM_POLICY_PATHS: JSON.stringify(paths.policy_layers),
    AXIOM_CAPABILITIES_PATH: paths.capabilities,
    AXIOM_PROVIDER_CONFIG: ''
  };
}

export function assertProviderStartupEnvironment(environment = process.env) {
  const configPath = absolutePath(
    environment.AXIOM_PROVIDER_CONFIG,
    'AXIOM_PROVIDER_CONFIG'
  );
  for (const name of [
    'AXIOM_DATA_KEY',
    'AXIOM_DATA_KEY_FILE',
    'AXIOM_API_TOKENS',
    'AXIOM_API_TOKENS_FILE',
    'AXIOM_TRANSPORT_DIR',
    'AXIOM_POLICY_PATH',
    'AXIOM_POLICY_PATHS',
    'AXIOM_CAPABILITIES_PATH'
  ]) {
    if (environment[name]) {
      throw new ValidationError(
        `${name} must be unset when AXIOM_PROVIDER_CONFIG is active`
      );
    }
  }
  return configPath;
}

export function verifyProviderResponse({
  response,
  request,
  provider,
  expectations,
  now = Date.now()
}) {
  const value = assertPlainObject(response, 'provider response');
  assertOnlyKeys(value, [
    'schema',
    'provider_id',
    'deployment_id',
    'request_id',
    'request_digest',
    'issued_at',
    'expires_at',
    'resources',
    'signature'
  ], 'provider response');
  if (value.schema !== RESPONSE_SCHEMA) {
    throw providerError('provider_response_schema_invalid');
  }
  if (
    value.provider_id !== provider.provider_id
    || value.deployment_id !== request.deployment_id
    || value.request_id !== request.request_id
    || value.request_digest !== digestObject(request)
  ) {
    throw providerError('provider_response_binding_invalid');
  }
  const issuedAt = timestamp(value.issued_at, 'provider response issued_at');
  const expiresAt = timestamp(value.expires_at, 'provider response expires_at');
  if (
    Math.abs(now - issuedAt) > RESPONSE_CLOCK_SKEW_MS
    || expiresAt <= now
    || expiresAt < issuedAt
    || expiresAt - issuedAt > MAX_RESPONSE_TTL_MS
    || expiresAt > Date.parse(request.expires_at)
  ) {
    throw providerError('provider_response_expired');
  }
  if (!Array.isArray(value.resources) || value.resources.length !== expectations.length) {
    throw providerError('provider_resource_set_invalid');
  }
  const expectedByAlias = new Map(expectations.map(item => [item.alias, item]));
  const seen = new Set();
  const resources = value.resources.map(raw => {
    const resource = assertPlainObject(raw, 'provider response resource');
    assertOnlyKeys(resource, [
      'alias',
      'resource_id',
      'version',
      'media_type',
      'content_base64',
      'bytes',
      'sha256'
    ], 'provider response resource');
    const alias = assertString(resource.alias, 'provider resource alias', {
      max: 160,
      pattern: RESOURCE_ID
    });
    if (seen.has(alias)) throw providerError('provider_resource_set_invalid');
    seen.add(alias);
    const expected = expectedByAlias.get(alias);
    if (
      !expected
      || resource.resource_id !== expected.resource_id
      || resource.media_type !== expected.media_type
    ) {
      throw providerError('provider_resource_binding_invalid');
    }
    let content;
    try {
      content = decodeBase64Url(
        resource.content_base64,
        `provider resource ${alias}`
      );
    } catch {
      throw providerError('provider_resource_digest_invalid');
    }
    if (
      content.length < 1
      || content.length > expected.maximum_bytes
      || resource.bytes !== content.length
      || resource.sha256 !== sha256(content)
    ) {
      throw providerError('provider_resource_digest_invalid');
    }
    return {
      alias,
      resource_id: expected.resource_id,
      classification: expected.classification,
      version: assertString(resource.version, 'provider resource version', {
        max: 160,
        pattern: ID
      }),
      media_type: expected.media_type,
      content,
      bytes: content.length,
      sha256: resource.sha256
    };
  });
  if (expectations.some(item => !seen.has(item.alias))) {
    throw providerError('provider_resource_set_invalid');
  }
  const unsigned = {
    schema: value.schema,
    provider_id: value.provider_id,
    deployment_id: value.deployment_id,
    request_id: value.request_id,
    request_digest: value.request_digest,
    issued_at: value.issued_at,
    expires_at: value.expires_at,
    resources: value.resources
  };
  const signature = assertPlainObject(
    value.signature,
    'provider response signature'
  );
  assertOnlyKeys(
    signature,
    ['algorithm', 'key_id', 'digest', 'signature'],
    'provider response signature'
  );
  if (
    signature.algorithm !== 'Ed25519'
    || !DIGEST.test(signature.digest ?? '')
    || !SIGNATURE_KEY_ID.test(signature.key_id ?? '')
    || !validSignatureEncoding(signature.signature)
  ) {
    throw providerError('provider_signature_invalid');
  }
  const signingKeyIndex = provider.public_keys.findIndex(key => (
    verifyObjectSignature(unsigned, signature, key)
  ));
  if (signingKeyIndex < 0) {
    throw providerError('provider_signature_invalid');
  }
  return {
    response_digest: digestObject(unsigned),
    signing_key_digest: provider.public_key_digests[signingKeyIndex],
    resources
  };
}

function normalizeProviderRuntimeConfig(input) {
  const value = assertPlainObject(input, 'provider runtime config');
  assertOnlyKeys(value, [
    'schema',
    'deployment_id',
    'runtime_directory',
    'providers',
    'resources'
  ], 'provider runtime config');
  if (value.schema !== CONFIG_SCHEMA) {
    throw new ValidationError(`Provider runtime config schema must be ${CONFIG_SCHEMA}`);
  }
  const providersValue = assertPlainObject(value.providers, 'providers');
  assertOnlyKeys(providersValue, PROVIDER_CLASSES, 'providers');
  const providers = Object.fromEntries(PROVIDER_CLASSES.map(providerClass => [
    providerClass,
    normalizeProvider(providersValue[providerClass], providerClass)
  ]));
  if (providers.secret.provider_id === providers.policy.provider_id) {
    throw new ValidationError('Secret and policy provider IDs must be independent');
  }
  const resources = normalizeResources(value.resources);
  return {
    schema: CONFIG_SCHEMA,
    deployment_id: assertString(value.deployment_id, 'deployment_id', {
      max: 160,
      pattern: ID
    }),
    runtime_directory: safeRuntimeDirectory(value.runtime_directory),
    providers: Object.freeze(providers),
    resources
  };
}

function normalizeProvider(input, providerClass) {
  const value = assertPlainObject(input, `${providerClass} provider`);
  assertOnlyKeys(value, [
    'provider_id',
    'executable',
    'executable_sha256',
    'arguments',
    'artifacts',
    'public_key_files',
    'inherit_environment',
    'timeout_ms',
    'maximum_response_bytes'
  ], `${providerClass} provider`);
  const publicKeyFiles = value.public_key_files;
  if (
    !Array.isArray(publicKeyFiles)
    || publicKeyFiles.length < 1
    || publicKeyFiles.length > 4
  ) {
    throw new ValidationError(
      `${providerClass} provider must pin 1-4 public keys`
    );
  }
  const keyPaths = publicKeyFiles.map((path, index) => absolutePath(
    path,
    `${providerClass} provider public_key_files[${index}]`
  ));
  if (new Set(keyPaths).size !== keyPaths.length) {
    throw new ValidationError(`${providerClass} provider public keys must be unique`);
  }
  const args = value.arguments ?? [];
  if (
    !Array.isArray(args)
    || args.length > MAX_ARGUMENTS
    || args.some(argument => (
      typeof argument !== 'string'
      || argument.length > 2_048
      || argument.includes('\0')
    ))
  ) {
    throw new ValidationError(`${providerClass} provider arguments are invalid`);
  }
  const artifacts = value.artifacts ?? [];
  if (!Array.isArray(artifacts) || artifacts.length > MAX_ARTIFACTS) {
    throw new ValidationError(`${providerClass} provider artifacts are invalid`);
  }
  const normalizedArtifacts = artifacts.map((raw, index) => {
    const artifact = assertPlainObject(
      raw,
      `${providerClass} provider artifact ${index}`
    );
    assertOnlyKeys(artifact, ['path', 'sha256'], 'provider artifact');
    return {
      path: absolutePath(
        artifact.path,
        `${providerClass} provider artifact path`
      ),
      sha256: digest(
        artifact.sha256,
        `${providerClass} provider artifact digest`
      )
    };
  });
  if (
    new Set(normalizedArtifacts.map(item => item.path)).size
    !== normalizedArtifacts.length
  ) {
    throw new ValidationError(`${providerClass} provider artifacts must be unique`);
  }
  const inheritEnvironment = value.inherit_environment ?? [];
  if (
    !Array.isArray(inheritEnvironment)
    || inheritEnvironment.length > 32
    || inheritEnvironment.some(name => (
      typeof name !== 'string'
      || !ENVIRONMENT_NAME.test(name)
      || !SAFE_INHERITED_ENVIRONMENT.has(name)
    ))
    || new Set(inheritEnvironment).size !== inheritEnvironment.length
  ) {
    throw new ValidationError(
      `${providerClass} provider inherited environment is not allowlisted`
    );
  }
  return Object.freeze({
    provider_id: assertString(value.provider_id, `${providerClass} provider_id`, {
      max: 160,
      pattern: ID
    }),
    executable: absolutePath(value.executable, `${providerClass} provider executable`),
    executable_sha256: digest(
      value.executable_sha256,
      `${providerClass} provider executable digest`
    ),
    arguments: Object.freeze([...args]),
    artifacts: Object.freeze(normalizedArtifacts),
    public_key_files: Object.freeze(keyPaths),
    inherit_environment: Object.freeze([...inheritEnvironment]),
    timeout_ms: boundedInteger(
      value.timeout_ms ?? 10_000,
      `${providerClass} provider timeout_ms`,
      1_000,
      30_000
    ),
    maximum_response_bytes: boundedInteger(
      value.maximum_response_bytes ?? 16_777_216,
      `${providerClass} provider maximum_response_bytes`,
      65_536,
      33_554_432
    )
  });
}

function normalizeResources(input) {
  const value = assertPlainObject(input, 'provider resources');
  assertOnlyKeys(value, [
    'data_key',
    'api_tokens',
    'transport',
    'policy_layers',
    'capabilities'
  ], 'provider resources');
  const transport = assertPlainObject(value.transport, 'transport resources');
  assertOnlyKeys(
    transport,
    ['manifest', 'ca_certificate', 'services'],
    'transport resources'
  );
  const services = assertPlainObject(
    transport.services,
    'transport service resources'
  );
  assertOnlyKeys(services, TRANSPORT_SERVICES, 'transport service resources');
  const normalizedServices = Object.fromEntries(TRANSPORT_SERVICES.map(service => {
    const serviceValue = assertPlainObject(
      services[service],
      `${service} transport resources`
    );
    assertOnlyKeys(
      serviceValue,
      ['certificate', 'private_key'],
      `${service} transport resources`
    );
    return [service, Object.freeze({
      certificate: resourceId(
        serviceValue.certificate,
        `${service} transport certificate resource`
      ),
      private_key: resourceId(
        serviceValue.private_key,
        `${service} transport private-key resource`
      )
    })];
  }));
  if (
    !Array.isArray(value.policy_layers)
    || value.policy_layers.length < 1
    || value.policy_layers.length > MAX_POLICY_LAYERS
  ) {
    throw new ValidationError(
      `policy_layers must contain 1-${MAX_POLICY_LAYERS} resources`
    );
  }
  const normalized = Object.freeze({
    data_key: resourceId(value.data_key, 'data_key resource'),
    api_tokens: resourceId(value.api_tokens, 'api_tokens resource'),
    transport: Object.freeze({
      manifest: resourceId(transport.manifest, 'transport manifest resource'),
      ca_certificate: resourceId(
        transport.ca_certificate,
        'transport CA certificate resource'
      ),
      services: Object.freeze(normalizedServices)
    }),
    policy_layers: Object.freeze(value.policy_layers.map((id, index) => (
      resourceId(id, `policy layer ${index} resource`)
    ))),
    capabilities: resourceId(value.capabilities, 'capabilities resource')
  });
  const all = [
    normalized.data_key,
    normalized.api_tokens,
    normalized.transport.manifest,
    normalized.transport.ca_certificate,
    ...TRANSPORT_SERVICES.flatMap(service => [
      normalized.transport.services[service].certificate,
      normalized.transport.services[service].private_key
    ]),
    ...normalized.policy_layers,
    normalized.capabilities
  ];
  if (new Set(all).size !== all.length) {
    throw new ValidationError('Provider resource IDs must be globally unique');
  }
  return normalized;
}

function providerExpectations(config) {
  const resources = config.resources;
  return {
    secret: [
      expectation('data_key', resources.data_key, 'secret',
        'application/vnd.axiom.data-key', 4_096),
      expectation('api_tokens', resources.api_tokens, 'secret',
        'application/vnd.axiom.api-principals+json', 1_048_576),
      expectation('transport.manifest', resources.transport.manifest, 'configuration',
        'application/vnd.axiom.transport-manifest+json', 1_048_576),
      expectation(
        'transport.ca_certificate',
        resources.transport.ca_certificate,
        'configuration',
        'application/x-pem-file',
        65_536
      ),
      ...TRANSPORT_SERVICES.flatMap(service => [
        expectation(
          `transport.${service}.certificate`,
          resources.transport.services[service].certificate,
          'configuration',
          'application/x-pem-file',
          65_536
        ),
        expectation(
          `transport.${service}.private_key`,
          resources.transport.services[service].private_key,
          'secret',
          'application/x-pem-file',
          65_536
        )
      ])
    ],
    policy: [
      ...resources.policy_layers.map((id, index) => expectation(
        `policy.${index}`,
        id,
        'policy',
        'application/vnd.axiom.policy+json',
        4_194_304
      )),
      expectation(
        'capabilities',
        resources.capabilities,
        'policy',
        'application/vnd.axiom.capabilities+json',
        4_194_304
      )
    ]
  };
}

function expectation(alias, id, classification, mediaType, maximumBytes) {
  return Object.freeze({
    alias,
    resource_id: id,
    classification,
    media_type: mediaType,
    maximum_bytes: maximumBytes
  });
}

function providerRequest(config, providerClass, expectations, now) {
  const provider = config.providers[providerClass];
  return {
    schema: REQUEST_SCHEMA,
    provider_id: provider.provider_id,
    deployment_id: config.deployment_id,
    request_id: `provider-request-${randomUUID()}`,
    nonce: randomBytes(32).toString('base64url'),
    issued_at: isoNow(now),
    expires_at: isoNow(now + provider.timeout_ms + 5_000),
    resources: expectations.map(item => ({
      alias: item.alias,
      resource_id: item.resource_id,
      classification: item.classification,
      media_type: item.media_type,
      maximum_bytes: item.maximum_bytes
    }))
  };
}

async function executeProvider(provider, request, {
  spawnImpl,
  environment
}) {
  await verifyProviderCommand(provider);
  const childEnvironment = {
    AXIOM_PROVIDER_PROTOCOL: '1'
  };
  if (process.platform === 'win32' && environment.SystemRoot) {
    childEnvironment.SystemRoot = environment.SystemRoot;
  }
  for (const name of provider.inherit_environment) {
    if (environment[name] !== undefined) childEnvironment[name] = environment[name];
  }
  let child;
  try {
    child = spawnImpl(provider.executable, provider.arguments, {
      env: childEnvironment,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      shell: false
    });
  } catch {
    throw providerError('provider_process_unavailable');
  }
  return new Promise((resolvePromise, rejectPromise) => {
    const chunks = [];
    let size = 0;
    let failureCode = null;
    let settled = false;
    const settle = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) rejectPromise(error);
      else resolvePromise(value);
    };
    const timer = setTimeout(() => {
      failureCode = 'provider_process_timeout';
      child.kill('SIGKILL');
    }, provider.timeout_ms);
    timer.unref();
    child.once('error', () => {
      settle(providerError('provider_process_unavailable'));
    });
    child.stdin.on('error', () => {
      // Process exit or close supplies the stable provider failure code.
    });
    child.stdout.on('data', chunk => {
      size += chunk.length;
      if (size > provider.maximum_response_bytes) {
        failureCode = 'provider_response_too_large';
        child.kill('SIGKILL');
        return;
      }
      chunks.push(Buffer.from(chunk));
    });
    child.stderr.on('data', () => {
      // Provider stderr can contain sensitive backend diagnostics and is discarded.
    });
    child.once('close', code => {
      if (failureCode) {
        settle(providerError(failureCode));
        return;
      }
      if (code !== 0) {
        settle(providerError('provider_process_failed'));
        return;
      }
      let parsed;
      try {
        parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        settle(providerError('provider_response_invalid'));
        return;
      }
      settle(null, parsed);
    });
    try {
      child.stdin.end(`${canonicalJson(request)}\n`);
    } catch {
      settle(providerError('provider_process_unavailable'));
    }
  });
}

async function verifyProviderCommand(provider) {
  let executableMetadata;
  try {
    executableMetadata = await stat(provider.executable);
  } catch {
    throw providerError('provider_executable_invalid');
  }
  if (!executableMetadata.isFile()) {
    throw providerError('provider_executable_invalid');
  }
  if (
    process.platform !== 'win32'
    && (executableMetadata.mode & 0o022) !== 0
  ) {
    throw providerError('provider_executable_writable');
  }
  let executableDigest;
  try {
    executableDigest = await fileDigest(provider.executable);
  } catch {
    throw providerError('provider_executable_invalid');
  }
  if (executableDigest !== provider.executable_sha256) {
    throw providerError('provider_executable_digest_invalid');
  }
  for (const artifact of provider.artifacts) {
    let metadata;
    try {
      metadata = await stat(artifact.path);
    } catch {
      throw providerError('provider_artifact_invalid');
    }
    if (!metadata.isFile()) throw providerError('provider_artifact_invalid');
    if (
      process.platform !== 'win32'
      && (metadata.mode & 0o022) !== 0
    ) {
      throw providerError('provider_artifact_writable');
    }
    let artifactDigest;
    try {
      artifactDigest = await fileDigest(artifact.path);
    } catch {
      throw providerError('provider_artifact_invalid');
    }
    if (artifactDigest !== artifact.sha256) {
      throw providerError('provider_artifact_digest_invalid');
    }
  }
}

async function acquireRuntimeLock(root, now) {
  const path = join(root, '.provider-runtime.lock');
  try {
    await mkdir(path, { mode: 0o700 });
  } catch {
    throw providerError('provider_runtime_locked');
  }
  const nonce = randomUUID();
  const ownerPath = join(path, 'owner.json');
  try {
    await writeFile(ownerPath, `${canonicalJson({
      schema: 'axiom-provider-runtime-lock.v1',
      pid: process.pid,
      nonce,
      created_at: isoNow(now)
    })}\n`, { mode: 0o600, flag: 'wx' });
  } catch {
    await rm(path, { recursive: true, force: true });
    throw providerError('provider_runtime_locked');
  }
  let active = true;
  return {
    async release() {
      if (!active) return;
      let owner;
      try {
        owner = JSON.parse(await readFile(ownerPath, 'utf8'));
      } catch {
        throw providerError('provider_runtime_lock_changed');
      }
      if (
        owner?.schema !== 'axiom-provider-runtime-lock.v1'
        || owner.pid !== process.pid
        || owner.nonce !== nonce
      ) {
        throw providerError('provider_runtime_lock_changed');
      }
      active = false;
      await rm(path, { recursive: true, force: true });
    }
  };
}

function materializedPaths(sessionPath, resources) {
  const transportDirectory = join(sessionPath, 'transport');
  const policyLayers = resources.policy_layers.map((_id, index) => (
    join(sessionPath, 'policy', `${String(index).padStart(2, '0')}.json`)
  ));
  const byAlias = {
    data_key: join(sessionPath, 'secrets', 'data-protection.key'),
    api_tokens: join(sessionPath, 'secrets', 'api-tokens.json'),
    'transport.manifest': join(transportDirectory, 'manifest.json'),
    'transport.ca_certificate': join(transportDirectory, 'ca-cert.pem'),
    capabilities: join(sessionPath, 'policy', 'capabilities.json')
  };
  for (const service of TRANSPORT_SERVICES) {
    byAlias[`transport.${service}.certificate`] = join(
      transportDirectory,
      'services',
      `${service}.cert.pem`
    );
    byAlias[`transport.${service}.private_key`] = join(
      transportDirectory,
      'services',
      `${service}.key.pem`
    );
  }
  policyLayers.forEach((path, index) => {
    byAlias[`policy.${index}`] = path;
  });
  return Object.freeze({
    data_key: byAlias.data_key,
    api_tokens: byAlias.api_tokens,
    transport_directory: transportDirectory,
    policy_layers: Object.freeze(policyLayers),
    capabilities: byAlias.capabilities,
    by_alias: Object.freeze(byAlias)
  });
}

async function validateMaterializedRuntime(paths, now) {
  const dataKey = (await readFile(paths.data_key, 'utf8')).trim();
  const decodedKey = decodeBase64Url(dataKey, 'materialized data key');
  if (decodedKey.length !== 32) {
    throw new ValidationError('Materialized data key must contain 32 bytes');
  }
  let principals;
  try {
    principals = JSON.parse(await readFile(paths.api_tokens, 'utf8'));
  } catch {
    throw new ValidationError('Materialized API principal registry is invalid');
  }
  normalizePrincipals(principals);
  for (const path of paths.policy_layers) {
    let policy;
    try {
      policy = JSON.parse(await readFile(path, 'utf8'));
    } catch {
      throw new ValidationError('Materialized policy layer is invalid');
    }
    validatePolicy(policy);
  }
  let capabilities;
  try {
    capabilities = JSON.parse(await readFile(paths.capabilities, 'utf8'));
  } catch {
    throw new ValidationError('Materialized capability registry is invalid');
  }
  validateCapabilityRegistry(capabilities);
  for (const service of TRANSPORT_SERVICES) {
    await loadTransportRuntime({
      transportDir: paths.transport_directory,
      service,
      now: new Date(now)
    });
  }
}

async function regularFile(path, maximumBytes, label, {
  privatePath = false,
  requireNotWritable = false
} = {}) {
  const metadata = await stat(path);
  if (!metadata.isFile() || metadata.size < 1 || metadata.size > maximumBytes) {
    throw new ValidationError(`${label} must be a bounded regular file`);
  }
  if (
    privatePath
    && process.platform !== 'win32'
    && (metadata.mode & 0o077) !== 0
  ) {
    throw new ValidationError(`${label} must not be accessible by group or others`);
  }
  if (
    requireNotWritable
    && process.platform !== 'win32'
    && (metadata.mode & 0o022) !== 0
  ) {
    throw new ValidationError(`${label} must not be group or other writable`);
  }
  return readFile(path, 'utf8');
}

function privateRegularFile(path, maximumBytes, label) {
  return regularFile(path, maximumBytes, label, { privatePath: true });
}

async function assertPrivatePath(path, label) {
  if (process.platform === 'win32') return;
  const metadata = await stat(path);
  if ((metadata.mode & 0o077) !== 0) {
    throw new ValidationError(`${label} must not be accessible by group or others`);
  }
}

async function fileDigest(path) {
  return new Promise((resolvePromise, rejectPromise) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('data', chunk => hash.update(chunk));
    stream.once('error', rejectPromise);
    stream.once('end', () => resolvePromise(hash.digest('hex')));
  });
}

function safeRuntimeDirectory(value) {
  const path = absolutePath(value, 'runtime_directory');
  if (path === parse(path).root) {
    throw new ValidationError('runtime_directory must not be a filesystem root');
  }
  return path;
}

function absolutePath(value, name) {
  if (typeof value !== 'string' || !isAbsolute(value)) {
    throw new ValidationError(`${name} must be an absolute path`);
  }
  return resolve(value);
}

function assertOwnedSession(root, sessionPath, sessionId) {
  if (
    !/^session-[0-9a-f-]{36}$/.test(sessionId)
    || dirname(sessionPath) !== root
    || relative(root, sessionPath) !== sessionId
    || !sessionPath.startsWith(`${root}${sep}`)
  ) {
    throw new ValidationError('Provider runtime session path is unsafe');
  }
}

function resourceId(value, name) {
  return assertString(value, name, {
    max: 256,
    pattern: RESOURCE_ID
  });
}

function digest(value, name) {
  return assertString(value, name, {
    min: 64,
    max: 64,
    pattern: DIGEST
  });
}

function decodeBase64Url(value, name) {
  const serialized = assertString(value, name, {
    max: 44_739_243,
    pattern: /^[A-Za-z0-9_-]+$/
  });
  const decoded = Buffer.from(serialized, 'base64url');
  if (decoded.toString('base64url') !== serialized) {
    throw new ValidationError(`${name} is not canonical base64url`);
  }
  return decoded;
}

function validSignatureEncoding(value) {
  try {
    return decodeBase64Url(
      value,
      'provider response signature value'
    ).length === 64;
  } catch {
    return false;
  }
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

function timestamp(value, name) {
  const raw = assertString(value, name, { max: 64 });
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== raw) {
    throw new ValidationError(`${name} must be a canonical ISO timestamp`);
  }
  return parsed.valueOf();
}

function isoNow(value) {
  return new Date(value).toISOString();
}

function assertOnlyKeys(value, allowed, name) {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(value).filter(key => !allowedSet.has(key));
  if (unknown.length) {
    throw new ValidationError(`${name} contains unsupported fields`);
  }
}

function providerError(code) {
  return new AxiomError(
    code,
    'Provider runtime validation failed',
    503
  );
}

export {
  CONFIG_SCHEMA,
  REQUEST_SCHEMA,
  RESPONSE_SCHEMA,
  RECEIPT_SCHEMA,
  TRANSPORT_SERVICES
};
