import {
  ValidationError,
  assertPlainObject,
  assertString,
  assertStringArray
} from '../lib/canonical.mjs';

export const SIEA_AUTHORITY_BEARING_FIELDS = new Set([
  'allow',
  'authorized',
  'authorized_effects',
  'capability_grant',
  'execution_authority',
  'grant',
  'sandbox_grant'
]);

export function assertEnum(value, name, allowed) {
  assertString(value, name, { max: 128 });
  if (!allowed.has(value)) throw new ValidationError(`${name} is not an allowed value`);
  return value;
}

export function assertUniqueStrings(value, name, { min = 0, maxItems = 64, itemMax = 256 } = {}) {
  const items = assertStringArray(value, name, { maxItems, itemMax });
  if (items.length < min) throw new ValidationError(`${name} must contain at least ${min} item(s)`);
  if (new Set(items).size !== items.length) throw new ValidationError(`${name} must not contain duplicates`);
  return items;
}

export function assertIsoTimestamp(value, name) {
  assertString(value, name, { max: 64 });
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new ValidationError(`${name} must be an ISO timestamp`);
  }
  return value;
}

export function assertReference(value, name) {
  if (typeof value !== 'string' || value.length < 3 || value.length > 512 || !value.includes(':')) {
    throw new ValidationError(`${name} must be a namespaced reference`);
  }
  return value;
}

export function assertNoUnknownKeys(record, name, allowedKeys) {
  assertPlainObject(record, name);
  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) throw new ValidationError(`${name} contains unknown field ${key}`);
  }
  return record;
}

export function assertAuthorityNeutral(record, name) {
  assertPlainObject(record, name);
  for (const key of SIEA_AUTHORITY_BEARING_FIELDS) {
    if (Object.hasOwn(record, key)) {
      throw new ValidationError(`${name} must not carry execution authority via ${key}`);
    }
  }
  return record;
}
