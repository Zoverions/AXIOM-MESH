import { createHash } from 'node:crypto';
import { types } from 'node:util';

/**
 * Minimal canonical JSON + digest helpers for AXIOM Verify.
 * Dependency-free subset aligned with mesh/src/lib/canonical.mjs for offline use.
 */

export const CANONICAL_JSON_MAX_DEPTH = 2048;

const STACK_OVERFLOW = 'Maximum call stack size exceeded';

let ancestors = null;
let depth = 0;

export function canonicalize(value) {
  ancestors = new Set();
  depth = 0;
  try {
    return canonicalValue(value);
  } catch (error) {
    if (error instanceof RangeError) {
      throw new TypeError(
        String(error.message).includes(STACK_OVERFLOW)
          ? 'Canonical JSON input exceeds the engine stack depth'
          : `Canonical JSON input exceeds an engine limit (${error.message})`
      );
    }
    throw error;
  } finally {
    ancestors = null;
  }
}

function canonicalValue(value) {
  if (types.isProxy(value)) {
    throw new TypeError('Canonical JSON cannot encode a Proxy');
  }
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('Canonical JSON does not allow non-finite numbers');
    }
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value !== 'object') {
    throw new TypeError(`Canonical JSON cannot encode ${typeof value}`);
  }
  if (depth >= CANONICAL_JSON_MAX_DEPTH) {
    throw new TypeError(`Canonical JSON nesting exceeds ${CANONICAL_JSON_MAX_DEPTH} levels`);
  }
  if (ancestors.has(value)) {
    throw new TypeError('Canonical JSON cannot encode a cyclic structure');
  }
  return Array.isArray(value) ? canonicalizeArray(value) : canonicalizeRecord(value);
}

function enter(value) {
  ancestors.add(value);
  depth += 1;
}

function leave(value) {
  depth -= 1;
  ancestors.delete(value);
}

function canonicalizeArray(value) {
  enter(value);
  if (Object.getPrototypeOf(value) !== Array.prototype) {
    throw new TypeError('Canonical JSON arrays must use the ordinary Array prototype');
  }
  if (Object.getOwnPropertySymbols(value).length) {
    throw new TypeError('Canonical JSON arrays cannot contain symbol-keyed state');
  }
  const allowedNames = new Set(['length']);
  const output = [];
  for (let index = 0; index < value.length; index += 1) {
    const key = String(index);
    allowedNames.add(key);
    if (!Object.hasOwn(value, key)) {
      throw new TypeError(`Canonical JSON arrays cannot contain a sparse index at ${index}`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw new TypeError(`Canonical JSON array index ${index} must be an enumerable data property`);
    }
    output.push(canonicalValue(descriptor.value));
  }
  for (const name of Object.getOwnPropertyNames(value)) {
    if (!allowedNames.has(name)) {
      throw new TypeError(`Canonical JSON arrays cannot contain custom property ${name}`);
    }
  }
  leave(value);
  return output;
}

function canonicalizeRecord(value) {
  enter(value);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('Canonical JSON objects must be plain records');
  }
  if (Object.getOwnPropertySymbols(value).length) {
    throw new TypeError('Canonical JSON objects cannot contain symbol-keyed state');
  }
  const ownNames = Object.getOwnPropertyNames(value);
  const enumerableKeys = Object.keys(value);
  if (ownNames.length !== enumerableKeys.length) {
    throw new TypeError('Canonical JSON objects cannot contain non-enumerable state');
  }
  const output = {};
  for (const key of enumerableKeys.sort()) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw new TypeError(`Canonical JSON property ${key} must be an enumerable data property`);
    }
    const item = descriptor.value;
    if (item === undefined || typeof item === 'function' || typeof item === 'symbol') {
      throw new TypeError(`Canonical JSON cannot encode property ${key}`);
    }
    Object.defineProperty(output, key, {
      value: canonicalValue(item),
      enumerable: true,
      configurable: true,
      writable: true
    });
  }
  leave(value);
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

export class VerifyError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'VerifyError';
    this.code = code;
  }
}
