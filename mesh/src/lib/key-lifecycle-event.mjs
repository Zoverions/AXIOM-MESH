import {
  ValidationError,
  assertPlainObject,
  assertString,
  assertStringArray
} from './canonical.mjs';

export const KEY_LIFECYCLE_EVENT_SCHEMA = 'axiom-key-lifecycle-event.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const ALLOWED = new Set([
  'generated->staged',
  'staged->active',
  'active->rotating',
  'rotating->retired',
  'active->compromised',
  'retired->compromised',
  'generated->destroyed',
  'staged->destroyed',
  'retired->destroyed',
  'compromised->destroyed',
  'retired->recovery_only',
  'recovery_only->destroyed'
]);

function exact(raw, fields, label) {
  const value = assertPlainObject(raw, label);
  const allowed = new Set(fields);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ValidationError(`${label} contains unsupported field ${key}`);
  }
  for (const key of fields) {
    if (!Object.hasOwn(value, key)) throw new ValidationError(`${label} is missing required field ${key}`);
  }
  return value;
}

function id(value, label) {
  return assertString(value, label, { min: 1, max: 192, pattern: ID });
}

function digest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

function timestamp(value, label) {
  const text = assertString(value, label, { min: 24, max: 24 });
  const parsed = new Date(text);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== text) {
    throw new ValidationError(`${label} must be canonical UTC ISO`);
  }
  return text;
}

export function validateKeyLifecycleEvent(raw) {
  const value = exact(raw, [
    'schema',
    'event_id',
    'key_id',
    'key_purpose',
    'cryptographic_profile_id',
    'instance_id',
    'from_state',
    'to_state',
    'public_material_digest',
    'authority_evidence_digest',
    'occurred_at',
    'secret_material_present',
    'offline_context',
    'limitations'
  ], 'key lifecycle event');

  if (value.schema !== KEY_LIFECYCLE_EVENT_SCHEMA) {
    throw new ValidationError('key lifecycle event schema is invalid');
  }

  id(value.event_id, 'event_id');
  id(value.key_id, 'key_id');
  id(value.key_purpose, 'key_purpose');
  id(value.cryptographic_profile_id, 'cryptographic_profile_id');
  id(value.instance_id, 'instance_id');
  id(value.from_state, 'from_state');
  id(value.to_state, 'to_state');

  const transition = `${value.from_state}->${value.to_state}`;
  if (!ALLOWED.has(transition)) throw new ValidationError(`key lifecycle transition is not allowed: ${transition}`);

  digest(value.public_material_digest, 'public_material_digest');
  digest(value.authority_evidence_digest, 'authority_evidence_digest');
  timestamp(value.occurred_at, 'occurred_at');

  if (value.secret_material_present !== false) {
    throw new ValidationError('key lifecycle evidence must never embed secret material');
  }

  const offline = exact(value.offline_context, [
    'offline',
    'fresh_external_status_required',
    'fresh_external_status_satisfied',
    'reconciliation_required'
  ], 'offline_context');

  for (const field of [
    'offline',
    'fresh_external_status_required',
    'fresh_external_status_satisfied',
    'reconciliation_required'
  ]) {
    if (typeof offline[field] !== 'boolean') {
      throw new ValidationError(`offline_context.${field} must be boolean`);
    }
  }

  const effectIncreasing = value.to_state === 'active';
  if (
    effectIncreasing &&
    offline.offline &&
    offline.fresh_external_status_required &&
    !offline.fresh_external_status_satisfied
  ) {
    throw new ValidationError('offline key activation requires satisfied external status when policy requires it');
  }

  const limitations = assertStringArray(value.limitations, 'limitations', {
    maxItems: 64,
    itemMax: 512
  });
  if (limitations.length === 0) {
    throw new ValidationError('key lifecycle event must declare limitations');
  }

  return Object.freeze({
    valid: true,
    transition,
    key_id: value.key_id,
    key_purpose: value.key_purpose,
    evidence_effect: 'lifecycle_evidence_only',
    authority_effect: 'none'
  });
}
