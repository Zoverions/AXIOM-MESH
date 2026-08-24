import { posix } from 'node:path';
import { ValidationError } from './canonical.mjs';

export const AGENT_CHALLENGE_REGISTRY_SCHEMA = 'axiom-agent-challenge-registry.v2';
export const AGENT_COMMONS_DISCOVERY_SCHEMA = 'axiom-agent-commons-discovery.v2';
export const AGENT_CHALLENGE_SCHEMA = 'axiom-agent-challenge.v1';
export const AGENT_CHALLENGE_CANONICAL_REPOSITORY = 'Zoverions/AXIOM-MESH';
export const AGENT_CHALLENGE_CANONICAL_URL = 'https://github.com/Zoverions/AXIOM-MESH';
export const AGENT_CHALLENGE_CANONICAL_PUBLISHER = 'Zoverions';
export const AGENT_CHALLENGE_SUPPORTED_BUILD = '0.12.0-dev.3';
export const AGENT_CHALLENGE_REGISTRY_MAX_BYTES = 262_144;

const SHA_40 = /^[0-9a-f]{40}$/;
const ID = /^[a-z0-9][a-z0-9._:-]{0,159}$/;
const REF = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,239}$/;
const ENTRY_STATUSES = new Set(['open', 'superseded', 'expired']);
const ENVIRONMENTS = new Set([
  'repository-owned',
  'contributor-owned',
  'explicitly-disposable-authorized'
]);
const AUTHORITY_NONCLAIMS = Object.freeze([
  'runtime_authority_granted',
  'merge_authority_granted',
  'deployment_authority_granted',
  'credential_authority_granted',
  'spending_authority_granted',
  'hardware_custody_granted',
  'production_promotion_granted',
  'third_party_testing_authorized',
  'compensation_committed'
]);

export function validateAgentChallengeRegistry(document) {
  if (!plainObject(document)) {
    throw new ValidationError('Agent challenge registry must be an object');
  }
  if (Buffer.byteLength(JSON.stringify(document), 'utf8') > AGENT_CHALLENGE_REGISTRY_MAX_BYTES) {
    throw new ValidationError('Agent challenge registry exceeds the maximum encoded size');
  }
  exactKeys(document, 'Agent challenge registry', [
    'schema',
    'version',
    'project',
    'supported_build',
    'repository',
    'canonical_repository_url',
    'publisher',
    'base',
    'generated_at',
    'public_discovery_only',
    'authority_effect',
    'challenges'
  ]);
  if (document.schema !== AGENT_CHALLENGE_REGISTRY_SCHEMA || document.version !== 2) {
    throw new ValidationError('Agent challenge registry identity is invalid');
  }
  requireCurrentProjectIdentity(document, 'Agent challenge registry');

  exactKeys(document.publisher, 'Agent challenge registry publisher', ['type', 'id']);
  if (
    document.publisher.type !== 'repository-owner'
    || document.publisher.id !== AGENT_CHALLENGE_CANONICAL_PUBLISHER
  ) {
    throw new ValidationError('Agent challenge registry publisher identity is invalid');
  }

  exactKeys(document.base, 'Agent challenge registry base', ['ref', 'sha']);
  if (!REF.test(document.base.ref ?? '') || !SHA_40.test(document.base.sha ?? '')) {
    throw new ValidationError('Agent challenge registry base is invalid');
  }
  if (
    document.base.ref.includes('..')
    || document.base.ref.includes('//')
    || document.base.ref.startsWith('/')
  ) {
    throw new ValidationError('Agent challenge registry base ref is not normalized');
  }

  const generatedAt = canonicalTimestamp(
    document.generated_at,
    'Agent challenge registry generated_at'
  );
  if (document.public_discovery_only !== true || document.authority_effect !== 'none') {
    throw new ValidationError('Agent challenge registry authority boundary is invalid');
  }
  if (!Array.isArray(document.challenges) || document.challenges.length > 64) {
    throw new ValidationError('Agent challenge registry challenges are invalid');
  }

  const seen = new Set();
  const counts = { open: 0, superseded: 0, expired: 0 };
  for (const entry of document.challenges) {
    exactKeys(entry, 'Agent challenge registry entry', ['status', 'challenge']);
    if (!ENTRY_STATUSES.has(entry.status)) {
      throw new ValidationError('Agent challenge registry entry status is invalid');
    }
    const challenge = validateAgentChallenge(entry.challenge, {
      registryBaseSha: document.base.sha,
      status: entry.status,
      generatedAt
    });
    if (seen.has(challenge.challenge_id)) {
      throw new ValidationError(`Duplicate Agent Commons challenge: ${challenge.challenge_id}`);
    }
    seen.add(challenge.challenge_id);
    counts[entry.status] += 1;
  }

  return Object.freeze({
    valid: true,
    schema: document.schema,
    repository: document.repository,
    base_ref: document.base.ref,
    base_sha: document.base.sha,
    challenges: document.challenges.length,
    counts: Object.freeze(counts),
    public_discovery_only: true,
    authority_effect: 'none'
  });
}

export function validateAgentChallenge(challenge, {
  registryBaseSha,
  status = 'open',
  generatedAt = new Date(0)
} = {}) {
  if (!plainObject(challenge)) throw new ValidationError('Agent challenge must be an object');
  exactKeys(challenge, 'Agent challenge', [
    'schema',
    'project',
    'supported_build',
    'challenge_id',
    'canonical_repository',
    'base_sha',
    'issued_at',
    'expires_at',
    'problem',
    'scope',
    'acceptance',
    'evidence_expectations',
    'result_contract',
    'disclosure',
    'claim_boundary',
    'authority_nonclaims'
  ], { optional: ['expires_at', 'result_contract'] });

  if (challenge.schema !== AGENT_CHALLENGE_SCHEMA || !ID.test(challenge.challenge_id ?? '')) {
    throw new ValidationError('Agent challenge identity is invalid');
  }
  if (
    challenge.project !== 'AXIOM-MESH'
    || challenge.supported_build !== AGENT_CHALLENGE_SUPPORTED_BUILD
    || challenge.canonical_repository !== AGENT_CHALLENGE_CANONICAL_REPOSITORY
    || !SHA_40.test(challenge.base_sha ?? '')
  ) {
    throw new ValidationError(`Agent challenge ${challenge.challenge_id} project/base is invalid`);
  }
  if (status === 'open' && registryBaseSha && challenge.base_sha !== registryBaseSha) {
    throw new ValidationError(`Open Agent challenge ${challenge.challenge_id} has a stale base SHA`);
  }

  const issuedAt = canonicalTimestamp(
    challenge.issued_at,
    `Agent challenge ${challenge.challenge_id} issued_at`
  );
  boundedText(challenge.problem, `Agent challenge ${challenge.challenge_id} problem`);
  boundedText(challenge.claim_boundary, `Agent challenge ${challenge.challenge_id} claim boundary`);

  exactKeys(challenge.scope, `Agent challenge ${challenge.challenge_id} scope`, [
    'allowed_paths',
    'prohibited_effects',
    'environment_boundary',
    'notes'
  ], { optional: ['notes'] });
  const paths = uniqueRepositoryPaths(
    challenge.scope.allowed_paths,
    `Agent challenge ${challenge.challenge_id} allowed_paths`
  );
  boundedTextArray(
    challenge.scope.prohibited_effects,
    `Agent challenge ${challenge.challenge_id} prohibited_effects`,
    { min: 1, max: 64 }
  );
  const environments = canonicalStringSet(
    challenge.scope.environment_boundary,
    `Agent challenge ${challenge.challenge_id} environment_boundary`,
    { min: 1, max: 3, allowed: ENVIRONMENTS }
  );
  if (challenge.scope.notes !== undefined) {
    boundedText(challenge.scope.notes, `Agent challenge ${challenge.challenge_id} scope notes`);
  }

  boundedTextArray(challenge.acceptance, `Agent challenge ${challenge.challenge_id} acceptance`, {
    min: 1,
    max: 64
  });
  boundedTextArray(
    challenge.evidence_expectations,
    `Agent challenge ${challenge.challenge_id} evidence expectations`,
    { min: 1, max: 64 }
  );

  if (
    challenge.result_contract !== undefined
    && challenge.result_contract !== 'agent-readiness/CONTRIBUTION-RESULT.schema.json'
  ) {
    throw new ValidationError(`Agent challenge ${challenge.challenge_id} result contract is invalid`);
  }

  exactKeys(challenge.disclosure, `Agent challenge ${challenge.challenge_id} disclosure`, [
    'public_issue_safe_only',
    'sensitive_findings_route'
  ]);
  if (
    challenge.disclosure.public_issue_safe_only !== true
    || challenge.disclosure.sensitive_findings_route !== 'SECURITY.md'
  ) {
    throw new ValidationError(`Agent challenge ${challenge.challenge_id} disclosure boundary is invalid`);
  }
  validateAuthorityNonclaims(
    challenge.authority_nonclaims,
    `Agent challenge ${challenge.challenge_id} authority_nonclaims`
  );

  let expiresAt = null;
  if (challenge.expires_at !== undefined && challenge.expires_at !== null) {
    expiresAt = canonicalTimestamp(
      challenge.expires_at,
      `Agent challenge ${challenge.challenge_id} expires_at`
    );
    if (expiresAt.getTime() <= issuedAt.getTime()) {
      throw new ValidationError(`Agent challenge ${challenge.challenge_id} expiry must follow issuance`);
    }
    if (status === 'open' && expiresAt.getTime() <= generatedAt.getTime()) {
      throw new ValidationError(`Open Agent challenge ${challenge.challenge_id} is already expired`);
    }
    if (status === 'expired' && expiresAt.getTime() > generatedAt.getTime()) {
      throw new ValidationError(`Expired Agent challenge ${challenge.challenge_id} has a future expiry`);
    }
  } else if (status === 'expired') {
    throw new ValidationError(`Expired Agent challenge ${challenge.challenge_id} must declare expires_at`);
  }

  return Object.freeze({
    valid: true,
    challenge_id: challenge.challenge_id,
    status,
    base_sha: challenge.base_sha,
    paths: paths.length,
    environments: environments.length,
    result_contract: challenge.result_contract ?? null,
    authority_effect: 'none'
  });
}

export function validateAgentCommonsDiscovery(document) {
  if (!plainObject(document)) {
    throw new ValidationError('Agent Commons discovery manifest must be an object');
  }
  exactKeys(document, 'Agent Commons discovery manifest', [
    'schema',
    'project',
    'supported_build',
    'repository',
    'canonical_repository_url',
    'human_entrypoint',
    'agent_entrypoint',
    'challenge_registry',
    'security_policy',
    'challenge_contract',
    'contribution_result_contract',
    'feedback_contract',
    'public_discovery_only',
    'authority_effect'
  ]);
  if (document.schema !== AGENT_COMMONS_DISCOVERY_SCHEMA) {
    throw new ValidationError('Agent Commons discovery manifest identity is invalid');
  }
  requireCurrentProjectIdentity(document, 'Agent Commons discovery manifest');
  const expected = {
    human_entrypoint: 'README.md',
    agent_entrypoint: 'AGENTS.md',
    challenge_registry: 'agent-commons/challenges.json',
    security_policy: 'SECURITY.md',
    challenge_contract: 'docs/architecture/contracts/agent-challenge.v1.schema.json',
    contribution_result_contract: 'agent-readiness/CONTRIBUTION-RESULT.schema.json',
    feedback_contract: 'docs/architecture/contracts/agent-feedback.v1.schema.json'
  };
  for (const [key, value] of Object.entries(expected)) {
    if (document[key] !== value) {
      throw new ValidationError(`Agent Commons discovery manifest ${key} is invalid`);
    }
  }
  if (document.public_discovery_only !== true || document.authority_effect !== 'none') {
    throw new ValidationError('Agent Commons discovery manifest authority boundary is invalid');
  }
  return Object.freeze({
    valid: true,
    schema: document.schema,
    challenge_registry: document.challenge_registry,
    contribution_result_contract: document.contribution_result_contract,
    public_discovery_only: true,
    authority_effect: 'none'
  });
}

export function validateRepositoryPath(value, label = 'Agent Commons repository path') {
  if (
    typeof value !== 'string'
    || value.length < 1
    || value.length > 512
    || value.includes('\0')
    || value.includes('\\')
    || value.includes('//')
    || value.startsWith('/')
  ) {
    throw new ValidationError(`${label} is invalid`);
  }
  const normalized = posix.normalize(value);
  if (
    normalized !== value
    || normalized === '.'
    || normalized === '..'
    || normalized.startsWith('../')
    || value.split('/').includes('..')
  ) {
    throw new ValidationError(`${label} escapes or is not normalized`);
  }
  return normalized;
}

function requireCurrentProjectIdentity(document, label) {
  if (
    document.project !== 'AXIOM-MESH'
    || document.supported_build !== AGENT_CHALLENGE_SUPPORTED_BUILD
    || document.repository !== AGENT_CHALLENGE_CANONICAL_REPOSITORY
    || document.canonical_repository_url !== AGENT_CHALLENGE_CANONICAL_URL
  ) {
    throw new ValidationError(`${label} project identity is invalid`);
  }
}

function validateAuthorityNonclaims(value, label) {
  exactKeys(value, label, AUTHORITY_NONCLAIMS);
  for (const field of AUTHORITY_NONCLAIMS) {
    if (value[field] !== false) {
      throw new ValidationError(`${label}.${field} must remain false`);
    }
  }
}

function uniqueRepositoryPaths(value, label) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 128) {
    throw new ValidationError(`${label} are invalid`);
  }
  const paths = value.map((item, index) => validateRepositoryPath(item, `${label}[${index}]`));
  if (new Set(paths).size !== paths.length) {
    throw new ValidationError(`${label} contain duplicates`);
  }
  return paths;
}

function canonicalStringSet(value, label, { min, max, allowed }) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new ValidationError(`${label} is invalid`);
  }
  const seen = new Set();
  for (const item of value) {
    if (typeof item !== 'string' || !allowed.has(item) || seen.has(item)) {
      throw new ValidationError(`${label} contains an invalid or duplicate value`);
    }
    seen.add(item);
  }
  return [...seen];
}

function boundedTextArray(value, label, { min, max }) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new ValidationError(`${label} is invalid`);
  }
  for (const item of value) boundedText(item, label);
}

function boundedText(value, label) {
  if (
    typeof value !== 'string'
    || value.length < 1
    || value.length > 8_000
    || value.includes('\0')
  ) {
    throw new ValidationError(`${label} is invalid`);
  }
}

function canonicalTimestamp(value, label) {
  if (typeof value !== 'string') throw new ValidationError(`${label} must be a UTC date-time`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new ValidationError(`${label} must be a canonical UTC date-time`);
  }
  return parsed;
}

function exactKeys(value, label, keys, { optional = [] } = {}) {
  if (!plainObject(value)) throw new ValidationError(`${label} must be an object`);
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ValidationError(`${label} contains unsupported field: ${key}`);
  }
  for (const key of keys) {
    if (!optional.includes(key) && !Object.hasOwn(value, key)) {
      throw new ValidationError(`${label} is missing required field: ${key}`);
    }
  }
}

function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
