import { createHash, randomUUID } from 'node:crypto';

export function canonicalize(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Canonical JSON does not allow non-finite numbers');
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === 'object') {
    const output = {};
    for (const key of Object.keys(value).sort()) {
      const item = value[key];
      if (item === undefined || typeof item === 'function' || typeof item === 'symbol') {
        throw new TypeError(`Canonical JSON cannot encode property ${key}`);
      }
      output[key] = canonicalize(item);
    }
    return output;
  }
  throw new TypeError(`Canonical JSON cannot encode ${typeof value}`);
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
