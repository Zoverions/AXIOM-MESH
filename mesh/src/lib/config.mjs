import { readFile, stat } from 'node:fs/promises';
import { isAbsolute, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ValidationError } from './canonical.mjs';
import { normalizeApiPrincipalRegistry } from './principal-registry.mjs';

const MESH_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));

function envInteger(name, fallback, { min = 0, max = 65535 } = {}) {
  const raw = process.env[name];
  const value = raw === undefined || raw === '' ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ValidationError(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function envBoolean(name, fallback = false) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new ValidationError(`${name} must be true or false`);
}

function serviceUrl(name, fallback) {
  const value = process.env[name] ?? fallback;
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new ValidationError(`${name} must use http or https`);
  return url.toString().replace(/\/$/, '');
}

export function meshConfig(overrides = {}) {
  const environment = overrides.environment ?? process.env.NODE_ENV ?? 'development';
  const dataDir = resolve(overrides.dataDir ?? process.env.AXIOM_DATA_DIR ?? join(MESH_ROOT, '.data'));
  const autoBootstrap = overrides.autoBootstrap ?? envBoolean('AXIOM_AUTO_BOOTSTRAP', environment !== 'production');
  const internalTlsEnabled = overrides.internalTlsEnabled
    ?? envBoolean('AXIOM_INTERNAL_TLS', environment === 'production');
  const transportDir = optionalAbsolutePath(
    'AXIOM_TRANSPORT_DIR',
    overrides.transportDir ?? process.env.AXIOM_TRANSPORT_DIR
  );
  const requireDenyEgress = overrides.requireDenyEgress
    ?? envBoolean('AXIOM_REQUIRE_DENY_EGRESS', false);
  const gatewaySocket = optionalAbsolutePath(
    'AXIOM_GATEWAY_SOCKET',
    overrides.gatewaySocket ?? process.env.AXIOM_GATEWAY_SOCKET
  );
  const internalHost = overrides.internalHost ?? process.env.AXIOM_INTERNAL_HOST ?? '127.0.0.1';
  const config = {
    environment,
    dataDir,
    autoBootstrap,
    requireDenyEgress,
    gatewaySocket,
    transport: {
      enabled: internalTlsEnabled,
      directory: transportDir
    },
    hosts: {
      gateway: overrides.gatewayHost ?? process.env.AXIOM_GATEWAY_HOST ?? '127.0.0.1',
      internal: internalHost
    },
    maxBodyBytes: overrides.maxBodyBytes ?? envInteger('AXIOM_MAX_BODY_BYTES', 1_048_576, { min: 1024, max: 10_485_760 }),
    clockSkewSeconds: overrides.clockSkewSeconds ?? envInteger('AXIOM_CLOCK_SKEW_SECONDS', 30, { min: 5, max: 300 }),
    capabilityTtlSeconds: overrides.capabilityTtlSeconds ?? envInteger('AXIOM_CAPABILITY_TTL_SECONDS', 30, { min: 5, max: 300 }),
    integrityProbeIntervalSeconds: overrides.integrityProbeIntervalSeconds
      ?? envInteger('AXIOM_INTEGRITY_PROBE_INTERVAL_SECONDS', 30, { min: 5, max: 3_600 }),
    rateLimitCapacity: overrides.rateLimitCapacity
      ?? envInteger('AXIOM_RATE_LIMIT_CAPACITY', 60, { min: 10, max: 10_000 }),
    rateLimitRefillPerSecond: overrides.rateLimitRefillPerSecond
      ?? envInteger('AXIOM_RATE_LIMIT_REFILL_PER_SECOND', 1, { min: 1, max: 1_000 }),
    ports: {
      gateway: overrides.gatewayPort ?? envInteger('AXIOM_GATEWAY_PORT', 8080),
      hypervisor: overrides.hypervisorPort ?? envInteger('AXIOM_HYPERVISOR_PORT', 8081),
      sandbox: overrides.sandboxPort ?? envInteger('AXIOM_SANDBOX_PORT', 8082),
      grid: overrides.gridPort ?? envInteger('AXIOM_GRID_PORT', 8083)
    },
    urls: {
      hypervisor: overrides.hypervisorUrl ?? serviceUrl(
        'AXIOM_HYPERVISOR_URL',
        `${internalTlsEnabled ? 'https' : 'http'}://127.0.0.1:8081`
      ),
      sandbox: overrides.sandboxUrl ?? serviceUrl(
        'AXIOM_SANDBOX_URL',
        `${internalTlsEnabled ? 'https' : 'http'}://127.0.0.1:8082`
      ),
      grid: overrides.gridUrl ?? serviceUrl(
        'AXIOM_GRID_URL',
        `${internalTlsEnabled ? 'https' : 'http'}://127.0.0.1:8083`
      )
    },
    policyPath: resolve(overrides.policyPath ?? process.env.AXIOM_POLICY_PATH ?? join(MESH_ROOT, 'config', 'policy.json')),
    policyPaths: normalizePolicyPaths(overrides),
    capabilitiesPath: resolve(
      overrides.capabilitiesPath ?? process.env.AXIOM_CAPABILITIES_PATH ?? join(MESH_ROOT, 'config', 'capabilities.json')
    ),
    apiTokens: overrides.apiTokens ?? null
  };
  if (environment === 'production' && autoBootstrap) {
    throw new ValidationError('AXIOM_AUTO_BOOTSTRAP must be false in production');
  }
  if (environment === 'production' && !internalTlsEnabled) {
    throw new ValidationError(
      'Production internal services require mutually authenticated TLS'
    );
  }
  if (internalTlsEnabled && !transportDir) {
    throw new ValidationError(
      'AXIOM_TRANSPORT_DIR is required when internal TLS is enabled'
    );
  }
  if (environment === 'production') {
    for (const [service, value] of Object.entries(config.urls)) {
      const url = new URL(value);
      if (url.protocol !== 'https:') {
        throw new ValidationError(`Production ${service} URL must use HTTPS`);
      }
    }
  } else if (!internalTlsEnabled) {
    for (const [service, value] of Object.entries(config.urls)) {
      const url = new URL(value);
      if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
        throw new ValidationError(
          `Plaintext development ${service} URL must be loopback-only`
        );
      }
    }
  }
  return config;
}

function optionalAbsolutePath(name, value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !isAbsolute(value)) {
    throw new ValidationError(`${name} must be an absolute path`);
  }
  return value;
}

function normalizePolicyPaths(overrides) {
  if (overrides.policyPaths !== undefined) {
    if (!Array.isArray(overrides.policyPaths) || !overrides.policyPaths.length) {
      throw new ValidationError('policyPaths must contain at least one path');
    }
    return overrides.policyPaths.map(path => resolve(path));
  }
  const raw = process.env.AXIOM_POLICY_PATHS;
  if (raw) {
    let paths;
    try {
      paths = JSON.parse(raw);
    } catch {
      throw new ValidationError('AXIOM_POLICY_PATHS must be a JSON array');
    }
    if (!Array.isArray(paths) || !paths.length || paths.some(path => typeof path !== 'string')) {
      throw new ValidationError('AXIOM_POLICY_PATHS must contain at least one path');
    }
    return paths.map(path => resolve(path));
  }
  return [resolve(overrides.policyPath ?? process.env.AXIOM_POLICY_PATH ?? join(MESH_ROOT, 'config', 'policy.json'))];
}

export async function loadApiPrincipals(config) {
  if (config.apiTokens) return normalizePrincipals(config.apiTokens);
  const raw = process.env.AXIOM_API_TOKENS;
  const configuredPath = process.env.AXIOM_API_TOKENS_FILE;
  if (raw && configuredPath) {
    throw new ValidationError('Configure only one of AXIOM_API_TOKENS or AXIOM_API_TOKENS_FILE');
  }
  if (raw) return normalizePrincipals(parsePrincipalRegistry(raw, 'AXIOM_API_TOKENS'));
  if (configuredPath) {
    const path = resolve(configuredPath);
    if ((await stat(path)).size > 1_048_576) {
      throw new ValidationError('AXIOM_API_TOKENS_FILE exceeds the 1 MiB limit');
    }
    const serialized = await readFile(path, 'utf8');
    return normalizePrincipals(parsePrincipalRegistry(serialized, 'AXIOM_API_TOKENS_FILE'));
  }
  const tokenPath = join(config.dataDir, 'dev-admin.token');
  if (config.environment === 'production') {
    throw new ValidationError('AXIOM_API_TOKENS is required in production');
  }
  const token = (await readFile(tokenPath, 'utf8')).trim();
  return normalizePrincipals({
    [token]: {
      id: 'local-operator',
      type: 'human',
      roles: ['administrator'],
      scopes: ['*']
    }
  });
}

function parsePrincipalRegistry(serialized, source) {
  try {
    return JSON.parse(serialized);
  } catch {
    throw new ValidationError(`${source} must contain valid JSON`);
  }
}

export function normalizePrincipals(entries) {
  return normalizeApiPrincipalRegistry(entries);
}

export { MESH_ROOT };
