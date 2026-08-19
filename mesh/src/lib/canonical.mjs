import { createHash, randomUUID } from 'node:crypto';

export function canonicalize(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Canonical JSON does not allow non-finite numbers');
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
