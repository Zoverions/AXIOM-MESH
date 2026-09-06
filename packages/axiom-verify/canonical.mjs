import { createHash } from 'node:crypto';

/**
 * Minimal canonical JSON + digest helpers for AXIOM Verify.
 * Dependency-free subset aligned with mesh/src/lib/canonical.mjs for offline use.
 */

export function canonicalize(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('Canonical JSON does not allow non-finite numbers');
    }
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return canonicalizeArray(value);
  if (typeof value === 'object') return canonicalizeRecord(value);
  throw new TypeError(`Canonical JSON cannot encode ${typeof value}`);
}

function canonicalizeArray(value) {
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
    output.push(canonicalize(descriptor.value));
  }
  for (const name of Object.getOwnPropertyNames(value)) {
    if (!allowedNames.has(name)) {
      throw new TypeError(`Canonical JSON arrays cannot contain custom property ${name}`);
    }
  }
  return output;
}

function canonicalizeRecord(value) {
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
      value: canonicalize(item),
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

export class VerifyError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'VerifyError';
    this.code = code;
  }
}
