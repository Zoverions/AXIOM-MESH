import { ValidationError, assertContractNode, digestObject } from './canonical.mjs';
import { withSemanticMemoryOwnReads } from './semantic-memory-provenance.mjs';

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

function normalizedLifecycleBody(raw, provenance, read) {
  const source = plainObject(raw, 'Semantic memory lifecycle');
  rejectUnknown(source, TOP_LEVEL_KEYS, 'Semantic memory lifecycle');
  if (read(source, 'schema') !== undefined && read(source, 'schema') !== SEMANTIC_MEMORY_LIFECYCLE_SCHEMA) {
    throw new ValidationError('Semantic memory lifecycle schema is unsupported');
  }

  const objectId = id(read(source, 'object_id'), 'Semantic memory lifecycle object_id');
  const owner = id(read(source, 'owner'), 'Semantic memory lifecycle owner');
  const provenanceDigest = digest(read(source, 'provenance_digest'), 'Semantic memory lifecycle provenance_digest');
  const originClass = id(read(source, 'origin_class'), 'Semantic memory lifecycle origin_class');

  if (
    objectId !== provenance.object_id
    || owner !== provenance.owner
    || provenanceDigest !== provenance.provenance_digest
    || originClass !== provenance.origin_class
  ) {
    throw new ValidationError('Semantic memory lifecycle does not match its exact provenance record');
  }

  const mode = retentionMode(read(source, 'retention_mode'));
  let expiresAt = null;
  if (mode === 'bounded') {
    expiresAt = canonicalTimestamp(read(source, 'expires_at'), 'Semantic memory lifecycle expires_at');
  } else if (read(source, 'expires_at') !== null) {
    throw new ValidationError('Owner-controlled semantic memory retention requires expires_at null');
  }

  const expectedInheritance = provenance.origin_class === 'system-derived'
    ? 'provenance-only-no-authority'
    : 'not-derived';
  const inheritance = inheritancePolicy(read(source, 'inheritance_policy'));
  if (inheritance !== expectedInheritance) {
    throw new ValidationError('Semantic memory inheritance_policy does not match provenance origin');
  }

  const expectedParent = provenance.origin_class === 'system-derived'
    ? read(provenance, 'parent_provenance_digest')
    : null;
  const parentDigest = nullableDigest(
    read(source, 'parent_provenance_digest'),
    'Semantic memory lifecycle parent_provenance_digest'
  );
  if (parentDigest !== expectedParent) {
    throw new ValidationError('Semantic memory lifecycle parent provenance binding is invalid');
  }

  for (const [key, expected] of Object.entries(FIXED_NON_AUTHORITY)) {
    if (read(source, key) !== expected) {
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
  // Destructured only so null options throw main's TypeError; the values are
  // re-read below as own properties (#1918).
  retention_mode: _retentionMode = 'owner-controlled',
  expires_at: _expiresAt = null
} = {}) {
  const options = optionsArgument(arguments[1]);
  return withSemanticMemoryOwnReads(reader => createLifecycleWith(reader, record, options));
}

function createLifecycleWith(reader, record, options) {
  const { read } = reader;
  const retention_mode = defaulted(read(options, 'retention_mode'), 'owner-controlled');
  const expires_at = defaulted(read(options, 'expires_at'), null);
  const provenance = reader.normalize(record);
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
      ? read(provenance, 'parent_provenance_digest')
      : null,
    ...FIXED_NON_AUTHORITY
  }, provenance, read);
  return Object.freeze({ ...body, lifecycle_digest: digestObject(body) });
}

export function verifySemanticMemoryLifecycle(rawLifecycle, record) {
  return withSemanticMemoryOwnReads(reader => verifyLifecycleWith(reader, rawLifecycle, record));
}

function verifyLifecycleWith(reader, rawLifecycle, record) {
  const provenance = reader.normalize(record);
  // Same non-reading container check as the provenance record (#1918).
  if (rawLifecycle !== null && typeof rawLifecycle === 'object') {
    assertContractNode(rawLifecycle, 'Semantic memory lifecycle');
  }
  const value = plainObject(rawLifecycle, 'Semantic memory lifecycle');
  const body = normalizedLifecycleBody(value, provenance, reader.read);
  const suppliedDigest = digest(
    reader.read(value, 'lifecycle_digest'),
    'Semantic memory lifecycle lifecycle_digest'
  );
  if (suppliedDigest !== digestObject(body)) {
    throw new ValidationError('Semantic memory lifecycle digest mismatch');
  }
  return Object.freeze({ ...body, lifecycle_digest: suppliedDigest });
}

export function evaluateSemanticMemoryLifecycleUse(record, lifecycle, usage, {
  // Destructured only so null options throw main's TypeError. The values are
  // re-read below as own properties: an inherited verified digest or clock
  // reads as absent (#1918). The default clock is only constructed when
  // there is no own `now`.
  now: _now,
  verified_review_request_digest: _verifiedReviewRequestDigest
} = {}) {
  const options = optionsArgument(arguments[3]);
  return withSemanticMemoryOwnReads(reader => evaluateLifecycleUseWith(
    reader,
    record,
    lifecycle,
    usage,
    options
  ));
}

function evaluateLifecycleUseWith(reader, record, lifecycle, usage, options) {
  const { read } = reader;
  const suppliedNow = read(options, 'now');
  const now = suppliedNow === undefined ? new Date() : suppliedNow;
  const verifiedReviewRequestDigest = read(options, 'verified_review_request_digest');
  const provenance = reader.normalize(record);
  const verifiedLifecycle = verifyLifecycleWith(reader, lifecycle, provenance);
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
  const decision = reader.evaluateUse(provenance, usage, verifiedReviewRequestDigest);
  return {
    ...decision,
    lifecycle_digest: verifiedLifecycle.lifecycle_digest
  };
}

export function deriveSemanticMemoryLifecycle(parentRecord, parentLifecycle, childRecord, {
  // Destructured only so null options throw main's TypeError; re-read below
  // as own properties (#1918).
  retention_mode: _retentionMode,
  expires_at: _expiresAt
} = {}) {
  const options = optionsArgument(arguments[3]);
  return withSemanticMemoryOwnReads(reader => deriveLifecycleWith(
    reader,
    parentRecord,
    parentLifecycle,
    childRecord,
    options
  ));
}

function deriveLifecycleWith(reader, parentRecord, parentLifecycle, childRecord, options) {
  const { read } = reader;
  const retention_mode = read(options, 'retention_mode');
  const expires_at = read(options, 'expires_at');
  const parent = reader.normalize(parentRecord);
  const child = reader.normalize(childRecord);
  const parentState = verifyLifecycleWith(reader, parentLifecycle, parent);

  if (
    child.origin_class !== 'system-derived'
    || read(child, 'parent_object_id') !== parent.object_id
    || read(child, 'parent_content_digest') !== parent.content_digest
    || read(child, 'parent_provenance_digest') !== parent.provenance_digest
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

  return createLifecycleWith(reader, child, {
    retention_mode: childMode,
    expires_at: childExpiry
  });
}

function optionsArgument(value) {
  return value === undefined ? {} : value;
}

// Parameter-default semantics: the default applies only when the value is
// undefined (an absent own field), exactly as destructuring defaults do.
function defaulted(value, fallback) {
  return value === undefined ? fallback : value;
}
