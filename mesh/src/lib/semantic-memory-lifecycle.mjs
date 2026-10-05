import { ValidationError, digestObject } from './canonical.mjs';
import {
  evaluateSemanticMemoryUse,
  normalizeSemanticMemoryProvenance
} from './semantic-memory-provenance.mjs';

export const SEMANTIC_MEMORY_LIFECYCLE_SCHEMA = 'axiom-semantic-memory-lifecycle.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const RETENTION_MODES = new Set(['owner-controlled', 'bounded']);
const INHERITANCE_POLICIES = new Set(['not-derived', 'provenance-only-no-authority']);
const TOP_LEVEL_KEYS = new Set([
  'schema',
  'object_id',
  'owner',
  'provenance_digest',
  'origin_class',
  'retention_mode',
  'expires_at',
  'inheritance_policy',
  'parent_provenance_digest',
  'authority_inheritance',
  'instruction_inheritance',
  'lifecycle_effect',
  'lifecycle_digest'
]);

const FIXED_NON_AUTHORITY = Object.freeze({
  authority_inheritance: 'none',
  instruction_inheritance: 'none',
  lifecycle_effect: 'none'
});

function plainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${label} must be an object`);
  }
  return value;
}

function rejectUnknown(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ValidationError(`${label} contains unsupported field ${key}`);
  }
}

function id(value, label) {
  if (typeof value !== 'string' || !ID.test(value)) throw new ValidationError(`${label} is invalid`);
  return value;
}

function digest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) {
    throw new ValidationError(`${label} must be a lowercase SHA-256 digest`);
  }
  return value;
}

function nullableDigest(value, label) {
  return value === null ? null : digest(value, label);
}

function canonicalTimestamp(value, label) {
  if (typeof value !== 'string' || value.length !== 24) {
    throw new ValidationError(`${label} must be a canonical UTC ISO timestamp`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) {
    throw new ValidationError(`${label} must be a canonical UTC ISO timestamp`);
  }
  return value;
}

function retentionMode(value) {
  if (!RETENTION_MODES.has(value)) throw new ValidationError('Semantic memory retention_mode is invalid');
  return value;
}

function inheritancePolicy(value) {
  if (!INHERITANCE_POLICIES.has(value)) {
    throw new ValidationError('Semantic memory inheritance_policy is invalid');
  }
  return value;
}

function normalizedLifecycleBody(raw, provenance) {
  const source = plainObject(raw, 'Semantic memory lifecycle');
  rejectUnknown(source, TOP_LEVEL_KEYS, 'Semantic memory lifecycle');
  if (source.schema !== undefined && source.schema !== SEMANTIC_MEMORY_LIFECYCLE_SCHEMA) {
    throw new ValidationError('Semantic memory lifecycle schema is unsupported');
  }

  const objectId = id(source.object_id, 'Semantic memory lifecycle object_id');
  const owner = id(source.owner, 'Semantic memory lifecycle owner');
  const provenanceDigest = digest(source.provenance_digest, 'Semantic memory lifecycle provenance_digest');
  const originClass = id(source.origin_class, 'Semantic memory lifecycle origin_class');

  if (
    objectId !== provenance.object_id
    || owner !== provenance.owner
    || provenanceDigest !== provenance.provenance_digest
    || originClass !== provenance.origin_class
  ) {
    throw new ValidationError('Semantic memory lifecycle does not match its exact provenance record');
  }

  const mode = retentionMode(source.retention_mode);
  let expiresAt = null;
  if (mode === 'bounded') {
    expiresAt = canonicalTimestamp(source.expires_at, 'Semantic memory lifecycle expires_at');
  } else if (source.expires_at !== null) {
    throw new ValidationError('Owner-controlled semantic memory retention requires expires_at null');
  }

  const expectedInheritance = provenance.origin_class === 'system-derived'
    ? 'provenance-only-no-authority'
    : 'not-derived';
  const inheritance = inheritancePolicy(source.inheritance_policy);
  if (inheritance !== expectedInheritance) {
    throw new ValidationError('Semantic memory inheritance_policy does not match provenance origin');
  }

  const expectedParent = provenance.origin_class === 'system-derived'
    ? provenance.parent_provenance_digest
    : null;
  const parentDigest = nullableDigest(
    source.parent_provenance_digest,
    'Semantic memory lifecycle parent_provenance_digest'
  );
  if (parentDigest !== expectedParent) {
    throw new ValidationError('Semantic memory lifecycle parent provenance binding is invalid');
  }

  for (const [key, expected] of Object.entries(FIXED_NON_AUTHORITY)) {
    if (source[key] !== expected) {
      throw new ValidationError(`Semantic memory lifecycle ${key} must remain ${expected}`);
    }
  }

  return Object.freeze({
    schema: SEMANTIC_MEMORY_LIFECYCLE_SCHEMA,
    object_id: objectId,
    owner,
    provenance_digest: provenanceDigest,
    origin_class: originClass,
    retention_mode: mode,
    expires_at: expiresAt,
    inheritance_policy: inheritance,
    parent_provenance_digest: parentDigest,
    ...FIXED_NON_AUTHORITY
  });
}

export function createSemanticMemoryLifecycle(record, {
  retention_mode = 'owner-controlled',
  expires_at = null
} = {}) {
  const provenance = normalizeSemanticMemoryProvenance(record);
  const body = normalizedLifecycleBody({
    schema: SEMANTIC_MEMORY_LIFECYCLE_SCHEMA,
    object_id: provenance.object_id,
    owner: provenance.owner,
    provenance_digest: provenance.provenance_digest,
    origin_class: provenance.origin_class,
    retention_mode,
    expires_at,
    inheritance_policy: provenance.origin_class === 'system-derived'
      ? 'provenance-only-no-authority'
      : 'not-derived',
    parent_provenance_digest: provenance.origin_class === 'system-derived'
      ? provenance.parent_provenance_digest
      : null,
    ...FIXED_NON_AUTHORITY
  }, provenance);
  return Object.freeze({ ...body, lifecycle_digest: digestObject(body) });
}

export function verifySemanticMemoryLifecycle(rawLifecycle, record) {
  const provenance = normalizeSemanticMemoryProvenance(record);
  const value = plainObject(rawLifecycle, 'Semantic memory lifecycle');
  const body = normalizedLifecycleBody(value, provenance);
  const suppliedDigest = digest(value.lifecycle_digest, 'Semantic memory lifecycle lifecycle_digest');
  if (suppliedDigest !== digestObject(body)) {
    throw new ValidationError('Semantic memory lifecycle digest mismatch');
  }
  return Object.freeze({ ...body, lifecycle_digest: suppliedDigest });
}

export function evaluateSemanticMemoryLifecycleUse(record, lifecycle, usage, {
  now = new Date(),
  verified_review_request_digest
} = {}) {
  const provenance = normalizeSemanticMemoryProvenance(record);
  const verifiedLifecycle = verifySemanticMemoryLifecycle(lifecycle, provenance);
  const currentTime = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(currentTime.valueOf())) {
    throw new ValidationError('Semantic memory lifecycle evaluation now is invalid');
  }
  if (
    verifiedLifecycle.retention_mode === 'bounded'
    && currentTime.valueOf() >= new Date(verifiedLifecycle.expires_at).valueOf()
  ) {
    return {
      allow: false,
      code: 'semantic_memory_expired',
      provenance_digest: provenance.provenance_digest,
      lifecycle_digest: verifiedLifecycle.lifecycle_digest
    };
  }
  const decision = evaluateSemanticMemoryUse(provenance, usage, {
    verified_review_request_digest
  });
  return {
    ...decision,
    lifecycle_digest: verifiedLifecycle.lifecycle_digest
  };
}

export function deriveSemanticMemoryLifecycle(parentRecord, parentLifecycle, childRecord, {
  retention_mode,
  expires_at
} = {}) {
  const parent = normalizeSemanticMemoryProvenance(parentRecord);
  const child = normalizeSemanticMemoryProvenance(childRecord);
  const parentState = verifySemanticMemoryLifecycle(parentLifecycle, parent);

  if (
    child.origin_class !== 'system-derived'
    || child.parent_object_id !== parent.object_id
    || child.parent_content_digest !== parent.content_digest
    || child.parent_provenance_digest !== parent.provenance_digest
  ) {
    throw new ValidationError('Derived semantic memory lifecycle requires exact parent provenance linkage');
  }

  let childMode = retention_mode;
  let childExpiry = expires_at;
  if (parentState.retention_mode === 'bounded') {
    childMode = childMode ?? 'bounded';
    childExpiry = childExpiry ?? parentState.expires_at;
    if (childMode !== 'bounded') {
      throw new ValidationError('Derived memory cannot escape bounded parent retention');
    }
    const normalizedExpiry = canonicalTimestamp(
      childExpiry,
      'Derived semantic memory lifecycle expires_at'
    );
    if (new Date(normalizedExpiry).valueOf() > new Date(parentState.expires_at).valueOf()) {
      throw new ValidationError('Derived memory cannot outlive bounded parent retention');
    }
    childExpiry = normalizedExpiry;
  } else {
    childMode = childMode ?? 'owner-controlled';
    childExpiry = childMode === 'owner-controlled' ? null : childExpiry;
  }

  return createSemanticMemoryLifecycle(child, {
    retention_mode: childMode,
    expires_at: childExpiry
  });
}
