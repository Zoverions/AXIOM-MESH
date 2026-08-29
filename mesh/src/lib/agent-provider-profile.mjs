import { digestObject, ValidationError } from './canonical.mjs';

export const AGENT_PROVIDER_PROFILE_SCHEMA = 'axiom-agent-provider-profile.v0';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const PROVIDER_CLASSES = new Set([
  'memory',
  'knowledge-projection',
  'agent-interop',
  'attestation',
  'provenance',
  'settlement'
]);
const SOURCE_KINDS = new Set(['local', 'external', 'fork', 'adapter']);
const EVIDENCE_CLASSES = new Set([
  'self-assertion',
  'deterministic-derivation',
  'signed-envelope',
  'replay-protected-envelope',
  'behavioral-fingerprint',
  'hardware-rooted-attestation',
  'content-digest',
  'transformation-lineage',
  'external-anchor',
  'payment-proof'
]);
const ASSURANCE_CEILINGS = new Set([
  'none',
  'self-asserted',
  'behavioral',
  'cryptographic',
  'hardware-rooted'
]);

export function validateAgentProviderProfile(profile) {
  validateAgentProviderProfileShape(profile);
  return Object.freeze({
    valid: true,
    schema: profile.schema,
    provider_id: profile.provider_id,
    provider_class: profile.provider_class,
    profile_ref: profile.profile_ref,
    provider_digest: digestObject(profile),
    assurance_ceiling: profile.assurance_ceiling,
    authority_effect: 'none',
    trust_effect: 'evidence-only',
    network_effect: 'none',
    runtime_activation: false,
    settlement_activation: false
  });
}

export function agentProviderProfileDigest(profile) {
  validateAgentProviderProfileShape(profile);
  return digestObject(profile);
}

function validateAgentProviderProfileShape(profile) {
  exactObject(profile, 'Agent provider profile', [
    'schema',
    'version',
    'status',
    'provider_id',
    'provider_class',
    'implementation',
    'profile_ref',
    'capabilities',
    'evidence_classes',
    'assurance_ceiling',
    'created_at',
    'updated_at',
    'authority_effect',
    'trust_effect',
    'credential_visibility',
    'network_effect',
    'runtime_activation',
    'settlement_activation'
  ]);

  if (
    profile.schema !== AGENT_PROVIDER_PROFILE_SCHEMA
    || profile.version !== 0
    || profile.status !== 'inert-provider-laboratory'
  ) throw new ValidationError('Agent provider profile schema/version/status is invalid');

  id(profile.provider_id, 'provider_id');
  if (!PROVIDER_CLASSES.has(profile.provider_class)) {
    throw new ValidationError('provider_class is invalid');
  }

  validateImplementation(profile.implementation);
  id(profile.profile_ref, 'profile_ref');
  identifierArray(profile.capabilities, 'capabilities', 32);
  enumArray(profile.evidence_classes, 'evidence_classes', EVIDENCE_CLASSES, 16);

  if (!ASSURANCE_CEILINGS.has(profile.assurance_ceiling)) {
    throw new ValidationError('assurance_ceiling is invalid');
  }

  const createdAt = date(profile.created_at, 'created_at');
  const updatedAt = date(profile.updated_at, 'updated_at');
  if (updatedAt < createdAt) {
    throw new ValidationError('updated_at cannot precede created_at');
  }

  if (
    profile.authority_effect !== 'none'
    || profile.trust_effect !== 'evidence-only'
    || profile.credential_visibility !== 'none'
    || profile.network_effect !== 'none'
    || profile.runtime_activation !== false
    || profile.settlement_activation !== false
  ) throw new ValidationError('Agent provider profile boundary is invalid');

  return profile;
}

function validateImplementation(value) {
  exactObject(value, 'Provider implementation', [
    'artifact_ref',
    'artifact_digest',
    'source_kind',
    'upstream_ref'
  ]);
  id(value.artifact_ref, 'implementation artifact_ref');
  if (!SOURCE_KINDS.has(value.source_kind)) {
    throw new ValidationError('implementation source_kind is invalid');
  }
  nullableId(value.upstream_ref, 'implementation upstream_ref');

  if (value.artifact_digest === null) {
    if (value.source_kind !== 'external') {
      throw new ValidationError('implementation artifact_digest may be null only for an external source');
    }
    if (value.upstream_ref === null) {
      throw new ValidationError('an external implementation without artifact_digest requires upstream_ref');
    }
  } else {
    digest(value.artifact_digest, 'implementation artifact_digest');
  }
}

function exactObject(value, label, allowedFields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${label} must be an object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new ValidationError(`${label} must be a plain object`);
  }
  const allowed = new Set(allowedFields);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ValidationError(`${label} contains unknown field ${key}`);
  }
  for (const key of allowedFields) {
    if (!Object.hasOwn(value, key)) throw new ValidationError(`${label} is missing required field ${key}`);
  }
}

function id(value, label) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) {
    throw new ValidationError(`${label} is invalid`);
  }
  return value;
}

function nullableId(value, label) {
  if (value === null) return null;
  return id(value, label);
}

function digest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) {
    throw new ValidationError(`${label} is invalid`);
  }
  return value;
}

function date(value, label) {
  if (typeof value !== 'string' || value.length > 64) {
    throw new ValidationError(`${label} must be a canonical ISO timestamp`);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new ValidationError(`${label} must be a canonical ISO timestamp`);
  }
  return parsed.getTime();
}

function identifierArray(value, label, maxItems) {
  if (!Array.isArray(value) || value.length < 1) {
    throw new ValidationError(`${label} must contain at least 1 item`);
  }
  if (value.length > maxItems) {
    throw new ValidationError(`${label} must contain at most ${maxItems} items`);
  }
  const seen = new Set();
  for (const item of value) {
    id(item, `${label} item`);
    if (seen.has(item)) throw new ValidationError(`${label} contains duplicate value ${item}`);
    seen.add(item);
  }
  return value;
}

function enumArray(value, label, allowed, maxItems) {
  if (!Array.isArray(value) || value.length < 1) {
    throw new ValidationError(`${label} must contain at least 1 item`);
  }
  if (value.length > maxItems) {
    throw new ValidationError(`${label} must contain at most ${maxItems} items`);
  }
  const seen = new Set();
  for (const item of value) {
    if (typeof item !== 'string' || !allowed.has(item)) {
      throw new ValidationError(`${label} contains an invalid value`);
    }
    if (seen.has(item)) throw new ValidationError(`${label} contains duplicate value ${item}`);
    seen.add(item);
  }
  return value;
}
