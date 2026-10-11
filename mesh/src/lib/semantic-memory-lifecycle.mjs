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

// ---------------------------------------------------------------------------
// Clock primitives captured at module load (deny-only hardening, same pattern
// as the Grid review-evidence adapter, #1942). Every time this module reads,
// from an evaluation `now`, from the system clock or from a stored
// expires_at, goes through these captures invoked with the captured
// Reflect.apply, so a later swap of Date.prototype.getTime/valueOf/
// toISOString, Date.parse, Date.now, the global Date constructor,
// RegExp.prototype.exec, Number, Array.prototype[Symbol.iterator] or
// Function.prototype.call/apply cannot change it.
// Built-ins patched BEFORE this module loads are out of scope.
const {
  apply,
  getPrototypeOf
} = Reflect;
const hasOwn = Object.hasOwn;
const NUMBER = Number;
const isFiniteNumber = Number.isFinite;
const isNaNNumber = Number.isNaN;
const DATE = Date;
const DATE_GET_TIME = Date.prototype.getTime;
const DATE_TO_ISO_STRING = Date.prototype.toISOString;
const DATE_PARSE = Date.parse;
const DATE_NOW = Date.now;
const REGEXP_EXEC = RegExp.prototype.exec;
const TO_PRIMITIVE = Symbol.toPrimitive;

// Time value of a genuine Date: reads the [[DateValue]] slot directly. Throws
// TypeError for anything without the slot (primitives, plain objects, a Proxy
// around a Date, Object.create(Date.prototype)).
function dateTime(value) {
  return apply(DATE_GET_TIME, value, []);
}

// Time value of a canonical timestamp string this module has validated.
function timestampTime(value) {
  return dateTime(new DATE(value));
}

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
  const parsed = new DATE(value);
  if (isNaNNumber(dateTime(parsed)) || apply(DATE_TO_ISO_STRING, parsed, []) !== value) {
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

/**
 * Lifecycle-checked use decision: an expired bounded lifecycle denies, and
 * otherwise the decision of evaluateSemanticMemoryUse is returned with the
 * lifecycle_digest added.
 *
 * Retrieval authority boundary: an 'ordinary-retrieval' allow from this
 * function is content-only, exactly as for evaluateSemanticMemoryUse. Its
 * authority_tier is the record's unverified claim, and a lifecycle is not
 * review evidence. Instruction use is granted only for 'privileged-instruction'
 * with `verified_review_evidence`, the genuine evidence object
 * verifySemanticMemoryReviewFromGrid(store, record) returned for this record;
 * a `verified_review_request_digest` option or non-genuine evidence throws a
 * ValidationError, exactly as in evaluateSemanticMemoryUse. This is the Grid-verified
 * lifecycle path that any authority decision about a semantic memory record
 * must go through. See docs/architecture/SEMANTIC-MEMORY-RETRIEVAL-BOUNDARY.md.
 *
 * Evaluation clock (`options.now`). `now` is CALLER-TRUSTED, not secure: the
 * rules below only reject malformed values, and a caller can still pass any
 * valid past time and so evaluate an expired bounded lifecycle as unexpired.
 * - Absent (no own `now`, or own `now: undefined`): the system clock, read
 *   through Date.now captured at module load.
 * - A Date: the time is read from its [[DateValue]] slot through
 *   Date.prototype.getTime captured at module load (never valueOf, getTime or
 *   Symbol.toPrimitive on the value). Dates from other realms and plain
 *   subclasses are accepted.
 * - A string: only the strict ISO-8601 forms (date, optional time, optional
 *   `Z` or `±hh:mm` offset; fields range-checked, no rollover), parsed with
 *   the Date.parse captured at module load.
 * - Rejected with ValidationError 'Semantic memory lifecycle evaluation now
 *   is invalid': every other type (null, numbers, booleans, plain objects,
 *   arrays, functions, boxed strings, Date look-alikes without the slot such
 *   as a Proxy around a Date or Object.create(Date.prototype)); a Date that
 *   defines valueOf, getTime, toISOString or Symbol.toPrimitive on itself or
 *   on a subclass prototype (or whose chain has more than 64 prototypes
 *   before its base Date.prototype); any other string; and any time that is not
 *   finite or not after the epoch (time <= 0: new Date(0), new Date(NaN),
 *   '1970-01-01T00:00:00Z', pre-1970 Dates). No later lower bound is applied:
 *   records carry no creation time to anchor one to, and any fixed floor
 *   would be arbitrary while a caller can still pass a valid past time.
 * - Patching Date.prototype, Date.parse, Date.now or the global Date after
 *   this module loads does not change any time it reads.
 * - Prototype pollution: an inherited `now` (e.g. Object.prototype.now) is
 *   never used as the clock; the call still uses the system clock. Deny
 *   dominance applies: if main's ordinary reads would see the inherited
 *   value and deny (it is invalid under these rules, so the call throws the
 *   ValidationError above; or it is a valid time at or after expires_at, so
 *   semantic_memory_expired is returned), that deny is the result.
 */
export function evaluateSemanticMemoryLifecycleUse(record, lifecycle, usage, {
  // Destructured only so null options throw main's TypeError. The values are
  // re-read below as own properties (#1918). Inherited verified evidence or
  // clock is never used, but it is not simply ignored: the deny-dominance
  // pass re-reads it as main would, so an inherited `now` that is invalid
  // makes the call throw, and one at or after a bounded expires_at returns
  // semantic_memory_expired. Otherwise the system clock is used.
  now: _now,
  verified_review_evidence: _verifiedReviewEvidence
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
  const verifiedReviewEvidence = read(options, 'verified_review_evidence');
  const legacyVerifiedDigest = read(options, 'verified_review_request_digest');
  const provenance = reader.normalize(record);
  const verifiedLifecycle = verifyLifecycleWith(reader, lifecycle, provenance);
  // An absent `now` reads the real clock; an own `now` must pass the input
  // rules on evaluationTime (see the JSDoc above) or throws a ValidationError.
  const currentTime = evaluationTime(suppliedNow);
  if (
    verifiedLifecycle.retention_mode === 'bounded'
    && currentTime >= timestampTime(verifiedLifecycle.expires_at)
  ) {
    return {
      allow: false,
      code: 'semantic_memory_expired',
      provenance_digest: provenance.provenance_digest,
      lifecycle_digest: verifiedLifecycle.lifecycle_digest
    };
  }
  const decision = reader.evaluateUse(
    provenance,
    usage,
    verifiedReviewEvidence,
    legacyVerifiedDigest
  );
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
    if (timestampTime(normalizedExpiry) > timestampTime(parentState.expires_at)) {
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

// ISO-8601 calendar date, optionally followed by a time of day with an
// optional UTC designator or offset (the ECMAScript date-time string format,
// full date required before a time). Fields are range-checked so that
// Date's rollover (2026-02-30 -> 2026-03-02, 24:00) is not accepted.
const ISO_8601_INSTANT = /^(\d{4}|[+-]\d{6})(?:-(\d{2})(?:-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(?:Z|[+-](\d{2}):(\d{2}))?)?)?)?$/;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

// Methods through which ordinary code reads a Date's time. A Date that
// overrides any of them on itself or on a subclass prototype presents a
// different time to ordinary readers than its [[DateValue]], so it is
// rejected rather than silently read one way or the other.
const DATE_TIME_READERS = ['valueOf', 'getTime', 'toISOString', TO_PRIMITIVE];
const MAX_PROTOTYPE_DEPTH = 64;

// True when the Date or a prototype below its realm's base Date.prototype
// defines a time reader. The base prototype is the first object whose own
// prototype is a chain root (Object.prototype of any realm), so genuine Dates
// from any realm and plain subclasses pass, and a post-load patch of the base
// Date.prototype is ignored here (the time is read from the slot anyway).
function overridesDateTimeReader(value) {
  if (ownsDateTimeReader(value)) return true;
  let current = value;
  for (let depth = 0; depth < MAX_PROTOTYPE_DEPTH; depth += 1) {
    const next = getPrototypeOf(current);
    if (next === null) return false;
    const afterNext = getPrototypeOf(next);
    // next is a chain root, or the realm's base prototype (child of a root).
    if (afterNext === null || getPrototypeOf(afterNext) === null) return false;
    if (ownsDateTimeReader(next)) return true;
    current = next;
  }
  return true;
}

function ownsDateTimeReader(target) {
  for (let index = 0; index < DATE_TIME_READERS.length; index += 1) {
    if (hasOwn(target, DATE_TIME_READERS[index])) return true;
  }
  return false;
}

function isIso8601Instant(value) {
  const match = apply(REGEXP_EXEC, ISO_8601_INSTANT, [value]);
  if (!match) return false;
  // Indexed reads, not array destructuring (which goes through the patchable
  // Array.prototype[Symbol.iterator]).
  const yearText = match[1];
  const month = match[2];
  const day = match[3];
  const hour = match[4];
  const minute = match[5];
  const second = match[6];
  const offsetHour = match[7];
  const offsetMinute = match[8];
  if (yearText === '-000000') return false;
  const inRange = (text, low, high) => text === undefined || (NUMBER(text) >= low && NUMBER(text) <= high);
  if (!inRange(month, 1, 12) || !inRange(hour, 0, 23) || !inRange(minute, 0, 59) || !inRange(second, 0, 59)) {
    return false;
  }
  if (!inRange(offsetHour, 0, 23) || !inRange(offsetMinute, 0, 59)) return false;
  if (day !== undefined) {
    const year = NUMBER(yearText);
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    const lastDay = NUMBER(month) === 2 ? (leap ? 29 : 28) : DAYS_IN_MONTH[NUMBER(month) - 1];
    if (!inRange(day, 1, lastDay)) return false;
  }
  return true;
}

// The evaluation time in epoch milliseconds (see the input rules in the
// evaluateSemanticMemoryLifecycleUse JSDoc). Never reads valueOf, getTime or
// Symbol.toPrimitive through the value: a Date is read from its slot with the
// captured getTime, a string through the captured Date.parse after the strict
// ISO-8601 check, and an absent `now` through the captured Date.now.
function evaluationTime(value) {
  let time;
  if (value === undefined) {
    time = apply(DATE_NOW, DATE, []);
  } else if (typeof value === 'string') {
    if (!isIso8601Instant(value)) throw invalidNow();
    time = apply(DATE_PARSE, DATE, [value]);
  } else {
    try {
      time = dateTime(value);
      if (overridesDateTimeReader(value)) time = NaN;
    } catch {
      // No [[DateValue]] slot (TypeError), or a hostile prototype chain.
      throw invalidNow();
    }
  }
  // Non-positive covers new Date(0), '1970-01-01T00:00:00Z' and every
  // pre-1970 time; non-finite covers Invalid Date and out-of-range strings.
  if (!isFiniteNumber(time) || time <= 0) throw invalidNow();
  return time;
}

function invalidNow() {
  return new ValidationError('Semantic memory lifecycle evaluation now is invalid');
}

function optionsArgument(value) {
  return value === undefined ? {} : value;
}

// Parameter-default semantics: the default applies only when the value is
// undefined (an absent own field), exactly as destructuring defaults do.
function defaulted(value, fallback) {
  return value === undefined ? fallback : value;
}
