import { ValidationError } from './canonical.mjs';

const SHA256_RE = /^[a-f0-9]{64}$/;
const BOUNDED_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;

function assertPlainRecord(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${name} must be a plain object`);
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    throw new ValidationError(`${name} must be a plain object`);
  }
  if (Object.getOwnPropertySymbols(value).length !== 0) {
    throw new ValidationError(`${name} cannot contain symbol-keyed state`);
  }
  for (const key of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw new ValidationError(`${name}.${key} must be an enumerable data property`);
    }
  }
  return value;
}

export function assertExactKeys(value, expectedKeys, name) {
  assertPlainRecord(value, name);
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    const missing = expected.filter((key) => !actual.includes(key));
    const extra = actual.filter((key) => !expected.includes(key));
    throw new ValidationError(`${name} has invalid fields`, { missing, extra });
  }
  return value;
}

export function assertSha256(value, name) {
  if (typeof value !== 'string' || !SHA256_RE.test(value)) {
    throw new ValidationError(`${name} must be a lowercase 64-character SHA-256 digest`);
  }
  return value;
}

export function assertCanonicalInstant(value, name) {
  if (typeof value !== 'string') {
    throw new ValidationError(`${name} must be a canonical UTC timestamp`);
  }
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== value) {
    throw new ValidationError(`${name} must be a canonical UTC timestamp`);
  }
  return value;
}

export function assertSafeNonNegativeInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ValidationError(`${name} must be a non-negative safe integer`);
  }
  return value;
}

export function assertSafePositiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new ValidationError(`${name} must be a positive safe integer`);
  }
  return value;
}

export function assertBoundedId(value, name) {
  if (typeof value !== 'string' || !BOUNDED_ID_RE.test(value)) {
    throw new ValidationError(`${name} must be a 1-256 character bounded identifier`);
  }
  return value;
}

export function deepFreezeJson(value) {
  if (!value || typeof value !== 'object') return value;
  if (Object.isFrozen(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) deepFreezeJson(item);
  } else {
    for (const key of Object.keys(value)) deepFreezeJson(value[key]);
  }
  return Object.freeze(value);
}
