import { posix } from 'node:path';
import { ValidationError } from './canonical.mjs';

export const AGENT_CHALLENGE_REGISTRY_SCHEMA = 'axiom-agent-challenge-registry.v1';
export const AGENT_CHALLENGE_SCHEMA = 'axiom-agent-challenge.v1';
export const AGENT_CHALLENGE_CANONICAL_REPOSITORY = 'Zoverions/AXIOM-MESH';
export const AGENT_CHALLENGE_CANONICAL_URL = 'https://github.com/Zoverions/AXIOM-MESH';
export const AGENT_CHALLENGE_CANONICAL_PUBLISHER = 'Zoverions';
export const AGENT_CHALLENGE_REGISTRY_MAX_BYTES = 262_144;

const SHA_40 = /^[0-9a-f]{40}$/;
const ID = /^[a-z0-9][a-z0-9._:-]{0,159}$/;
const REF = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,239}$/;
const ENTRY_STATUSES = new Set(['open', 'superseded', 'expired']);

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
    'repository',
    'canonical_repository_url',
    'publisher',
    'base',
    'generated_at',
    'public_discovery_only',
    'authority_granted',
    'payment_promised',
    'challenges'
  ]);
  if (document.schema !== AGENT_CHALLENGE_REGISTRY_SCHEMA || document.version !== 1) {
    throw new ValidationError('Agent challenge registry identity is invalid');
  }
  if (
    document.repository !== AGENT_CHALLENGE_CANONICAL_REPOSITORY
    || document.canonical_repository_url !== AGENT_CHALLENGE_CANONICAL_URL
  ) {
    throw new ValidationError('Agent challenge registry canonical repository is invalid');
  }

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
  if (document.base.ref.includes('..') || document.base.ref.includes('//')) {
    throw new ValidationError('Agent challenge registry base ref is not normalized');
  }

  const generatedAt = parseDateTime(document.generated_at, 'Agent challenge registry generated_at');
  if (
    document.public_discovery_only !== true
    || document.authority_granted !== false
    || document.payment_promised !== false
  ) {
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
    validateAgentChallenge(entry.challenge, {
      registryRepository: document.repository,
      registryBaseSha: document.base.sha,
      status: entry.status,
      generatedAt
    });
    if (seen.has(entry.challenge.challenge_id)) {
      throw new ValidationError(`Duplicate Agent Commons challenge: ${entry.challenge.challenge_id}`);
    }
    seen.add(entry.challenge.challenge_id);
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
    authority_granted: false,
    payment_promised: false
  });
}

export function validateAgentChallenge(challenge, {
  registryRepository = AGENT_CHALLENGE_CANONICAL_REPOSITORY,
  registryBaseSha,
  status = 'open',
  generatedAt = new Date(0)
} = {}) {
  if (!plainObject(challenge)) {
    throw new ValidationError('Agent challenge must be an object');
  }
  allowedKeys(challenge, 'Agent challenge', [
    'schema',
    'challenge_id',
    'repository',
    'base_sha',
    'problem',
    'scope',
    'acceptance',
    'evidence_expectations',
    'security_reporting',
    'claim_boundary',
    'authority_granted',
    'expires_at'
  ]);
  requiredKeys(challenge, 'Agent challenge', [
    'schema',
    'challenge_id',
    'repository',
    'base_sha',
    'problem',
    'scope',
    'acceptance',
    'evidence_expectations',
    'security_reporting',
    'claim_boundary',
    'authority_granted'
  ]);
  if (challenge.schema !== AGENT_CHALLENGE_SCHEMA || !ID.test(challenge.challenge_id ?? '')) {
    throw new ValidationError('Agent challenge identity is invalid');
  }
  if (challenge.repository !== registryRepository || !SHA_40.test(challenge.base_sha ?? '')) {
    throw new ValidationError(`Agent challenge ${challenge.challenge_id} repository/base is invalid`);
  }
  if (status === 'open' && registryBaseSha && challenge.base_sha !== registryBaseSha) {
    throw new ValidationError(`Open Agent challenge ${challenge.challenge_id} has a stale base SHA`);
  }
  boundedText(challenge.problem, `Agent challenge ${challenge.challenge_id} problem`);
  boundedText(challenge.claim_boundary, `Agent challenge ${challenge.challenge_id} claim boundary`);

  exactKeys(challenge.scope, `Agent challenge ${challenge.challenge_id} scope`, [
    'allowed_paths',
    'prohibited_effects',
    'notes'
  ], { optional: ['notes'] });
  boundedTextArray(
    challenge.scope.prohibited_effects,
    `Agent challenge ${challenge.challenge_id} prohibited effects`,
    { min: 1, max: 64 }
  );
  if (!Array.isArray(challenge.scope.allowed_paths) || challenge.scope.allowed_paths.length > 128) {
    throw new ValidationError(`Agent challenge ${challenge.challenge_id} allowed paths are invalid`);
  }
  const normalizedPaths = challenge.scope.allowed_paths.map((path) => validateRepositoryPath(
    path,
    `Agent challenge ${challenge.challenge_id} allowed path`
  ));
  if (new Set(normalizedPaths).size !== normalizedPaths.length) {
    throw new ValidationError(`Agent challenge ${challenge.challenge_id} allowed paths contain duplicates`);
  }
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

  exactKeys(
    challenge.security_reporting,
    `Agent challenge ${challenge.challenge_id} security reporting`,
    ['public_safe', 'private_route']
  );
  if (
    typeof challenge.security_reporting.public_safe !== 'boolean'
    || challenge.security_reporting.private_route !== 'SECURITY.md'
  ) {
    throw new ValidationError(`Agent challenge ${challenge.challenge_id} security reporting is invalid`);
  }
  if (challenge.authority_granted !== false) {
    throw new ValidationError(`Agent challenge ${challenge.challenge_id} cannot grant authority`);
  }

  if (challenge.expires_at !== undefined) {
    const expiry = parseDateTime(
      challenge.expires_at,
      `Agent challenge ${challenge.challenge_id} expires_at`
    );
    if (status === 'open' && expiry.getTime() <= generatedAt.getTime()) {
      throw new ValidationError(`Open Agent challenge ${challenge.challenge_id} is already expired`);
    }
    if (status === 'expired' && expiry.getTime() > generatedAt.getTime()) {
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
    paths: normalizedPaths.length,
    authority_granted: false
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
    || !/^[A-Za-z0-9._/-]+$/.test(value)
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

function boundedTextArray(value, label, { min, max }) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new ValidationError(`${label} are invalid`);
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

function parseDateTime(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)) {
    throw new ValidationError(`${label} must be a UTC date-time`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().replace('.000Z', 'Z') !== value) {
    throw new ValidationError(`${label} is invalid`);
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

function allowedKeys(value, label, keys) {
  if (!plainObject(value)) throw new ValidationError(`${label} must be an object`);
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ValidationError(`${label} contains unsupported field: ${key}`);
  }
}

function requiredKeys(value, label, keys) {
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) throw new ValidationError(`${label} is missing required field: ${key}`);
  }
}

function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
