import { lstat, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, posix, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  canonicalJson,
  canonicalize,
  digestObject,
  sha256,
  ValidationError
} from './canonical.mjs';
import { validateAgentChallengeRegistry } from './agent-challenge-registry.mjs';
import { validateCapabilityRegistry } from '../check-registry.mjs';

export const AGENT_COMMONS_READONLY_LAB_SCHEMA = 'axiom-agent-commons-readonly-lab.v1';
export const AGENT_COMMONS_READONLY_REQUEST_SCHEMA = 'axiom-agent-commons-readonly-request.v1';
export const AGENT_COMMONS_READONLY_RESPONSE_SCHEMA = 'axiom-agent-commons-readonly-response.v1';

export const AGENT_COMMONS_READONLY_METHODS = Object.freeze([
  'project.get',
  'capabilities.list',
  'challenges.list',
  'schemas.list',
  'verification.get',
  'protocols.get'
]);

const PROJECT = 'AXIOM-MESH';
const SUPPORTED_BUILD = '0.12.0-dev.3';
const CANONICAL_REPOSITORY = 'Zoverions/AXIOM-MESH';
const CANONICAL_REPOSITORY_URL = 'https://github.com/Zoverions/AXIOM-MESH';
const LABORATORY_BASE_SHA = '65b0fc914fb294ab7250968d94b787424d282ae9';
const SHA_40 = /^[0-9a-f]{40}$/;
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const REPOSITORY_ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));

const PATHS = Object.freeze({
  manifest: 'agent-commons/readonly-lab.json',
  package: 'package.json',
  capabilities: 'mesh/config/capabilities.json',
  challenges: 'agent-commons/challenges.json'
});

const SCHEMA_PATHS = Object.freeze([
  'docs/architecture/contracts/agent-challenge.v1.schema.json',
  'docs/architecture/contracts/agent-feedback.v1.schema.json',
  'agent-readiness/CONTRIBUTION-RESULT.schema.json'
]);

const VERIFICATION_COMMANDS = Object.freeze([
  'npm run setup:check',
  'npm run agent-commons:check',
  'npm run agent-commons:challenges:check',
  'npm run check'
]);

const LIMITS = Object.freeze({
  max_request_bytes: 4096,
  max_response_bytes: 65536,
  max_requests_per_session: 32,
  max_concurrent_requests: 1,
  max_capabilities: 64,
  max_challenges: 64,
  max_schemas: 8
});

const PROTOCOL_REFERENCES = Object.freeze([
  Object.freeze({
    family: 'mcp',
    released_profile: '2026-07-28',
    maintenance_release: null,
    source: 'https://blog.modelcontextprotocol.io/posts/2026-07-28/',
    candidate_reference_only: true,
    compatibility_claimed: false
  }),
  Object.freeze({
    family: 'a2a',
    released_profile: '1.0.0',
    maintenance_release: '1.0.1',
    source: 'https://a2a-protocol.org/v1.0.0/specification',
    candidate_reference_only: true,
    compatibility_claimed: false
  })
]);

export function validateAgentCommonsReadonlyManifest(manifest) {
  exactKeys(manifest, 'Agent Commons read-only lab manifest', [
    'schema',
    'version',
    'project',
    'supported_build',
    'canonical_repository',
    'canonical_repository_url',
    'laboratory_base_sha',
    'transport',
    'network_listener',
    'public_state_only',
    'private_grid_access',
    'consequential_tools',
    'authority_granted',
    'compatibility_claimed',
    'methods',
    'limits',
    'protocol_references',
    'schema_paths',
    'verification_commands'
  ]);

  if (
    manifest.schema !== AGENT_COMMONS_READONLY_LAB_SCHEMA
    || manifest.version !== 1
    || manifest.project !== PROJECT
    || manifest.supported_build !== SUPPORTED_BUILD
    || manifest.canonical_repository !== CANONICAL_REPOSITORY
    || manifest.canonical_repository_url !== CANONICAL_REPOSITORY_URL
    || manifest.laboratory_base_sha !== LABORATORY_BASE_SHA
    || !SHA_40.test(manifest.laboratory_base_sha ?? '')
  ) {
    throw new ValidationError('Agent Commons read-only lab identity is invalid');
  }

  if (
    manifest.transport !== 'none'
    || manifest.network_listener !== false
    || manifest.public_state_only !== true
    || manifest.private_grid_access !== false
    || manifest.consequential_tools !== false
    || manifest.authority_granted !== false
    || manifest.compatibility_claimed !== false
  ) {
    throw new ValidationError('Agent Commons read-only lab authority/transport boundary is invalid');
  }

  exactArray(manifest.methods, AGENT_COMMONS_READONLY_METHODS, 'Agent Commons read-only methods');
  exactKeys(manifest.limits, 'Agent Commons read-only limits', Object.keys(LIMITS));
  for (const [key, expected] of Object.entries(LIMITS)) {
    if (manifest.limits[key] !== expected) {
      throw new ValidationError(`Agent Commons read-only limit ${key} is invalid`);
    }
  }

  if (!Array.isArray(manifest.protocol_references) || manifest.protocol_references.length !== 2) {
    throw new ValidationError('Agent Commons protocol references are invalid');
  }
  for (let index = 0; index < PROTOCOL_REFERENCES.length; index += 1) {
    exactProtocolReference(manifest.protocol_references[index], PROTOCOL_REFERENCES[index]);
  }

  exactArray(manifest.schema_paths, SCHEMA_PATHS, 'Agent Commons read-only schema paths');
  exactArray(
    manifest.verification_commands,
    VERIFICATION_COMMANDS,
    'Agent Commons read-only verification commands'
  );

  return Object.freeze({
    valid: true,
    schema: manifest.schema,
    project: manifest.project,
    supported_build: manifest.supported_build,
    laboratory_base_sha: manifest.laboratory_base_sha,
    transport: manifest.transport,
    public_state_only: true,
    authority_granted: false,
    compatibility_claimed: false,
    methods: manifest.methods.length
  });
}

export async function loadAgentCommonsReadonlySnapshot({ repositoryRoot = REPOSITORY_ROOT } = {}) {
  const root = await realpath(resolve(repositoryRoot));
  const manifest = await readJsonFile(root, PATHS.manifest, 32_768);
  validateAgentCommonsReadonlyManifest(manifest);

  const packageDocument = await readJsonFile(root, PATHS.package, 131_072);
  if (packageDocument.version !== manifest.supported_build) {
    throw new ValidationError('Agent Commons read-only lab package version drifted');
  }

  const capabilityRegistry = await readJsonFile(root, PATHS.capabilities, 1_048_576);
  const capabilityStatus = validateCapabilityRegistry(capabilityRegistry);
  if (capabilityStatus.kernel_version !== manifest.supported_build) {
    throw new ValidationError('Agent Commons read-only capability build drifted');
  }
  if (capabilityStatus.capabilities > manifest.limits.max_capabilities) {
    throw new ValidationError('Agent Commons read-only capability projection exceeds its bound');
  }

  const challengeRegistry = await readJsonFile(root, PATHS.challenges, 262_144);
  const challengeStatus = validateAgentChallengeRegistry(challengeRegistry);
  if (challengeStatus.challenges > manifest.limits.max_challenges) {
    throw new ValidationError('Agent Commons read-only challenge projection exceeds its bound');
  }

  if (manifest.schema_paths.length > manifest.limits.max_schemas) {
    throw new ValidationError('Agent Commons read-only schema projection exceeds its bound');
  }
  const schemas = [];
  for (const repositoryPath of manifest.schema_paths) {
    const raw = await readRepositoryFile(root, repositoryPath, 524_288);
    try {
      JSON.parse(raw);
    } catch {
      throw new ValidationError(`Agent Commons public schema is not valid JSON: ${repositoryPath}`);
    }
    schemas.push({
      path: repositoryPath,
      sha256: sha256(raw),
      bytes: Buffer.byteLength(raw, 'utf8')
    });
  }

  const capabilities = capabilityRegistry.capabilities
    .map(item => ({ id: item.id, family: item.family, status: item.status }))
    .sort((left, right) => left.id.localeCompare(right.id));

  const openChallenges = challengeRegistry.challenges
    .filter(entry => entry.status === 'open')
    .map(entry => ({
      status: entry.status,
      challenge: structuredClone(entry.challenge)
    }))
    .sort((left, right) => left.challenge.challenge_id.localeCompare(right.challenge.challenge_id));

  const snapshot = canonicalize({
    manifest: structuredClone(manifest),
    project: {
      schema: 'axiom-agent-commons-readonly-project.v1',
      project: manifest.project,
      supported_build: manifest.supported_build,
      canonical_repository: manifest.canonical_repository,
      canonical_repository_url: manifest.canonical_repository_url,
      laboratory_base_sha: manifest.laboratory_base_sha,
      transport: manifest.transport,
      network_listener: false,
      public_state_only: true,
      private_grid_access: false,
      consequential_tools: false,
      authority_granted: false,
      compatibility_claimed: false,
      discovery_is_not_authorization: true,
      methods: [...manifest.methods]
    },
    capabilities: {
      schema: capabilityStatus.schema,
      kernel_version: capabilityStatus.kernel_version,
      verified_at: capabilityStatus.verified_at,
      digest: capabilityStatus.digest,
      counts: capabilityStatus.counts,
      capabilities
    },
    challenges: {
      schema: challengeStatus.schema,
      project: challengeStatus.project,
      supported_build: challengeStatus.supported_build,
      repository: challengeStatus.repository,
      registry_base_ref: challengeStatus.base_ref,
      registry_base_sha: challengeStatus.base_sha,
      public_discovery_only: true,
      authority_granted: false,
      payment_promised: false,
      evidence_certified: false,
      open_challenges: openChallenges
    },
    schemas: {
      schema: 'axiom-agent-commons-readonly-schemas.v1',
      schemas
    },
    verification: {
      schema: 'axiom-agent-commons-readonly-verification.v1',
      canonical_repository: manifest.canonical_repository,
      canonical_repository_url: manifest.canonical_repository_url,
      commands: [...manifest.verification_commands],
      contribution_result_contract: 'agent-readiness/CONTRIBUTION-RESULT.schema.json',
      sensitive_findings_route: 'SECURITY.md',
      successful_check_is_not_authority: true,
      external_validation_claimed: false,
      production_promotion_claimed: false
    },
    protocols: {
      schema: 'axiom-agent-commons-readonly-protocol-references.v1',
      transport_implemented: false,
      compatibility_claimed: false,
      references: structuredClone(manifest.protocol_references)
    }
  });

  return deepFreeze(snapshot);
}

export async function createAgentCommonsReadonlyLab(options = {}) {
  const snapshot = await loadAgentCommonsReadonlySnapshot(options);
  let activeRequests = 0;
  let acceptedRequests = 0;

  return Object.freeze({
    schema: AGENT_COMMONS_READONLY_LAB_SCHEMA,
    methods: Object.freeze([...AGENT_COMMONS_READONLY_METHODS]),
    limits: Object.freeze({ ...LIMITS }),
    async request(request) {
      const encodedRequest = encodeBoundedJson(request, 'Agent Commons read-only request');
      if (Buffer.byteLength(encodedRequest, 'utf8') > LIMITS.max_request_bytes) {
        throw new ValidationError('Agent Commons read-only request exceeds the maximum encoded size');
      }
      validateAgentCommonsReadonlyRequest(request);

      if (activeRequests >= LIMITS.max_concurrent_requests) {
        throw new ValidationError('Agent Commons read-only concurrent request limit exceeded');
      }
      if (acceptedRequests >= LIMITS.max_requests_per_session) {
        throw new ValidationError('Agent Commons read-only session request limit exceeded');
      }

      activeRequests += 1;
      acceptedRequests += 1;
      try {
        // Keep one microtask boundary so concurrent callers exercise the explicit
        // one-request laboratory ceiling rather than relying on synchronous timing.
        await Promise.resolve();
        const data = structuredClone(resolveMethod(snapshot, request.method));
        const document = {
          schema: AGENT_COMMONS_READONLY_RESPONSE_SCHEMA,
          id: request.id,
          method: request.method,
          data
        };
        const response = {
          ...document,
          digest: digestObject(document)
        };
        const encodedResponse = encodeBoundedJson(response, 'Agent Commons read-only response');
        if (Buffer.byteLength(encodedResponse, 'utf8') > LIMITS.max_response_bytes) {
          throw new ValidationError('Agent Commons read-only response exceeds the maximum encoded size');
        }
        return response;
      } finally {
        activeRequests -= 1;
      }
    }
  });
}

export function validateAgentCommonsReadonlyRequest(request) {
  exactKeys(request, 'Agent Commons read-only request', ['schema', 'id', 'method', 'params']);
  if (request.schema !== AGENT_COMMONS_READONLY_REQUEST_SCHEMA) {
    throw new ValidationError('Agent Commons read-only request schema is invalid');
  }
  if (!REQUEST_ID.test(request.id ?? '')) {
    throw new ValidationError('Agent Commons read-only request id is invalid');
  }
  if (!AGENT_COMMONS_READONLY_METHODS.includes(request.method)) {
    throw new ValidationError('Agent Commons read-only method is unsupported');
  }
  exactKeys(request.params, 'Agent Commons read-only request params', []);
  return request;
}

export function validateAgentCommonsReadonlyResponse(response) {
  exactKeys(response, 'Agent Commons read-only response', [
    'schema',
    'id',
    'method',
    'data',
    'digest'
  ]);
  if (response.schema !== AGENT_COMMONS_READONLY_RESPONSE_SCHEMA) {
    throw new ValidationError('Agent Commons read-only response schema is invalid');
  }
  if (!REQUEST_ID.test(response.id ?? '') || !AGENT_COMMONS_READONLY_METHODS.includes(response.method)) {
    throw new ValidationError('Agent Commons read-only response identity is invalid');
  }
  const { digest, ...document } = response;
  if (!SHA_40.test(LABORATORY_BASE_SHA) || !/^[0-9a-f]{64}$/.test(digest ?? '')) {
    throw new ValidationError('Agent Commons read-only response digest is invalid');
  }
  if (digestObject(document) !== digest) {
    throw new ValidationError('Agent Commons read-only response content address is invalid');
  }
  return response;
}

function resolveMethod(snapshot, method) {
  switch (method) {
    case 'project.get':
      return snapshot.project;
    case 'capabilities.list':
      return snapshot.capabilities;
    case 'challenges.list':
      return snapshot.challenges;
    case 'schemas.list':
      return snapshot.schemas;
    case 'verification.get':
      return snapshot.verification;
    case 'protocols.get':
      return snapshot.protocols;
    default:
      throw new ValidationError('Agent Commons read-only method is unsupported');
  }
}

async function readJsonFile(root, repositoryPath, maxBytes) {
  const raw = await readRepositoryFile(root, repositoryPath, maxBytes);
  try {
    return JSON.parse(raw);
  } catch {
    throw new ValidationError(`Agent Commons read-only JSON is invalid: ${repositoryPath}`);
  }
}

async function readRepositoryFile(root, repositoryPath, maxBytes) {
  validateFixedRepositoryPath(repositoryPath);
  const absolute = resolve(root, repositoryPath);
  ensureInsideRepository(root, absolute, repositoryPath);

  let metadata;
  try {
    metadata = await lstat(absolute);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new ValidationError(`Agent Commons read-only public source is missing: ${repositoryPath}`);
    }
    throw error;
  }
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new ValidationError(`Agent Commons read-only public source must be a regular file: ${repositoryPath}`);
  }
  if (metadata.size > maxBytes) {
    throw new ValidationError(`Agent Commons read-only public source exceeds its bound: ${repositoryPath}`);
  }

  const canonical = await realpath(absolute);
  ensureInsideRepository(root, canonical, repositoryPath);
  if (resolve(canonical) !== resolve(absolute)) {
    throw new ValidationError(`Agent Commons read-only public source cannot traverse links: ${repositoryPath}`);
  }
  return readFile(canonical, 'utf8');
}

function validateFixedRepositoryPath(repositoryPath) {
  if (
    typeof repositoryPath !== 'string'
    || repositoryPath.length < 3
    || repositoryPath.length > 320
    || repositoryPath.includes('\\')
    || repositoryPath.includes('//')
    || repositoryPath.includes('\0')
    || isAbsolute(repositoryPath)
    || !/^[A-Za-z0-9._/-]+$/.test(repositoryPath)
    || posix.normalize(repositoryPath) !== repositoryPath
    || repositoryPath === '..'
    || repositoryPath.startsWith('../')
  ) {
    throw new ValidationError('Agent Commons read-only repository path is invalid');
  }
}

function ensureInsideRepository(root, absolute, repositoryPath) {
  const inside = relative(root, absolute);
  if (
    inside === ''
    || inside === '..'
    || inside.startsWith(`..${sep}`)
    || isAbsolute(inside)
  ) {
    throw new ValidationError(`Agent Commons read-only path escaped the repository: ${repositoryPath}`);
  }
}

function exactProtocolReference(actual, expected) {
  exactKeys(actual, `Agent Commons ${expected.family} protocol reference`, [
    'family',
    'released_profile',
    'maintenance_release',
    'source',
    'candidate_reference_only',
    'compatibility_claimed'
  ]);
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    throw new ValidationError(`Agent Commons ${expected.family} protocol reference drifted`);
  }
}

function exactArray(actual, expected, label) {
  if (!Array.isArray(actual) || canonicalJson(actual) !== canonicalJson(expected)) {
    throw new ValidationError(`${label} are invalid`);
  }
}

function exactKeys(value, label, expected) {
  if (!plainObject(value)) {
    throw new ValidationError(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new ValidationError(`${label} fields are invalid`);
  }
}

function plainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function encodeBoundedJson(value, label) {
  try {
    return canonicalJson(value);
  } catch {
    throw new ValidationError(`${label} must contain canonical JSON data`);
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) deepFreeze(item);
  return Object.freeze(value);
}
