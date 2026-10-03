import { createHash, randomUUID } from 'node:crypto';
import { types } from 'node:util';

/**
 * Maximum container nesting accepted by canonicalize. The deepest real input
 * in the repository is a 1,004-level semantic operation proposal (test B-1 in
 * specialist-harness-bridge.test.mjs); 2,048 leaves about 2x headroom and is
 * below the roughly 3,100 levels at which the engine stack overflows for this
 * recursion, so the bound normally fires before the stack does. A stack
 * overflow that still happens (small stacks, deep callers) is reported as the
 * same typed error. This is a module constant, not a caller option.
 */
export const CANONICAL_JSON_MAX_DEPTH = 2048;

/**
 * Typed rejection for values canonical JSON cannot encode. It extends
 * TypeError so every existing `instanceof TypeError` branch keeps its outcome,
 * and it is not a ValidationError, so no `instanceof ValidationError` branch
 * changes either. The string code makes it a documented, typed rejection.
 */
export class CanonicalJsonError extends TypeError {
  constructor(message) {
    super(message);
    this.name = 'CanonicalJsonError';
    this.code = 'canonical_json_invalid';
  }
}

export function canonicalize(value) {
  try {
    return canonicalValue(value, new Set(), 0);
  } catch (error) {
    // canonicalValue throws only CanonicalJsonError itself; a RangeError here
    // is the engine stack limit, reached before CANONICAL_JSON_MAX_DEPTH.
    if (error instanceof RangeError) {
      throw new CanonicalJsonError('Canonical JSON input exceeds the engine stack depth');
    }
    throw error;
  }
}

// After the Proxy test below, canonicalization runs no caller code: ordinary
// objects and arrays expose no traps, accessors are rejected from their
// descriptors before any read, and prototypes must be the intrinsic ones. So
// every value read here is read from a stable object.
function canonicalValue(value, ancestors, depth) {
  // The Proxy test is the first operation on every value, so no trap of a
  // Proxy (including a revoked one) ever runs.
  if (types.isProxy(value)) throw new CanonicalJsonError('Canonical JSON cannot encode a Proxy');
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new CanonicalJsonError('Canonical JSON does not allow non-finite numbers');
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value !== 'object') throw new CanonicalJsonError(`Canonical JSON cannot encode ${typeof value}`);
  if (depth >= CANONICAL_JSON_MAX_DEPTH) {
    throw new CanonicalJsonError(`Canonical JSON nesting exceeds ${CANONICAL_JSON_MAX_DEPTH} levels`);
  }
  if (ancestors.has(value)) throw new CanonicalJsonError('Canonical JSON cannot encode a cyclic structure');
  ancestors.add(value);
  const output = Array.isArray(value)
    ? canonicalizeArray(value, ancestors, depth + 1)
    : canonicalizeRecord(value, ancestors, depth + 1);
  // Shared (acyclic) references are allowed: only the current path is tracked.
  ancestors.delete(value);
  return output;
}

function canonicalizeArray(value, ancestors, depth) {
  if (Object.getPrototypeOf(value) !== Array.prototype) {
    throw new CanonicalJsonError('Canonical JSON arrays must use the ordinary Array prototype');
  }
  if (Object.getOwnPropertySymbols(value).length) {
    throw new CanonicalJsonError('Canonical JSON arrays cannot contain symbol-keyed state');
  }
  const length = value.length;
  const allowedNames = new Set(['length']);
  const output = [];
  for (let index = 0; index < length; index += 1) {
    const key = String(index);
    allowedNames.add(key);
    if (!Object.hasOwn(value, key)) {
      throw new CanonicalJsonError(`Canonical JSON arrays cannot contain a sparse index at ${index}`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw new CanonicalJsonError(`Canonical JSON array index ${index} must be an enumerable data property`);
    }
    output.push(canonicalValue(descriptor.value, ancestors, depth));
  }
  for (const name of Object.getOwnPropertyNames(value)) {
    if (!allowedNames.has(name)) {
      throw new CanonicalJsonError(`Canonical JSON arrays cannot contain custom property ${name}`);
    }
  }
  return output;
}

function canonicalizeRecord(value, ancestors, depth) {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new CanonicalJsonError('Canonical JSON objects must be plain records');
  }
  if (Object.getOwnPropertySymbols(value).length) {
    throw new CanonicalJsonError('Canonical JSON objects cannot contain symbol-keyed state');
  }
  const ownNames = Object.getOwnPropertyNames(value);
  const enumerableKeys = Object.keys(value);
  if (ownNames.length !== enumerableKeys.length) {
    throw new CanonicalJsonError('Canonical JSON objects cannot contain non-enumerable state');
  }
  const output = {};
  for (const key of enumerableKeys.sort()) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw new CanonicalJsonError(`Canonical JSON property ${key} must be an enumerable data property`);
    }
    const item = descriptor.value;
    if (item === undefined || typeof item === 'function' || typeof item === 'symbol') {
      throw new CanonicalJsonError(`Canonical JSON cannot encode property ${key}`);
    }
    Object.defineProperty(output, key, {
      value: canonicalValue(item, ancestors, depth),
      enumerable: true,
      configurable: true,
      writable: true
    });
  }
  return output;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function sha256(value) {
  const input = Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8');
  return createHash('sha256').update(input).digest('hex');
}

export function digestObject(value) {
  return sha256(canonicalJson(value));
}

export function newId(prefix) {
  return `${prefix}_${randomUUID()}`;
}

export function assertPlainObject(value, name = 'value') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${name} must be an object`);
  }
  return value;
}

export function assertString(value, name, { min = 1, max = 4096, pattern } = {}) {
  if (typeof value !== 'string') throw new ValidationError(`${name} must be a string`);
  if (value.length < min || value.length > max) {
    throw new ValidationError(`${name} must contain ${min}-${max} characters`);
  }
  if (pattern && !pattern.test(value)) throw new ValidationError(`${name} has an invalid format`);
  return value;
}

export function assertStringArray(value, name, { maxItems = 64, itemMax = 256 } = {}) {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new ValidationError(`${name} must be an array with at most ${maxItems} items`);
  }
  return value.map((item, index) => assertString(item, `${name}[${index}]`, { max: itemMax }));
}

export class ValidationError extends Error {
  constructor(message, details = undefined) {
    super(message);
    this.name = 'ValidationError';
    this.code = 'validation_error';
    this.status = 400;
    this.details = details;
  }
}

export class AxiomError extends Error {
  constructor(code, message, status = 500, details = undefined) {
    super(message);
    this.name = 'AxiomError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}
