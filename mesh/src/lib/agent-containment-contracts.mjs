import { canonicalJson, digestObject, ValidationError } from './canonical.mjs';

export const FLOW_CONTEXT_SCHEMA = 'axiom-flow-context.v0';
export const CREDENTIAL_SURROGATE_SCHEMA = 'axiom-credential-surrogate.v0';
export const TRUSTED_APPROVAL_CHALLENGE_SCHEMA = 'axiom-trusted-approval-challenge.v0';
export const FLOW_RECEIPT_SCHEMA = 'axiom-flow-receipt.v0';

export const DATA_CLASSES = Object.freeze([
  'public',
  'owner_private',
  'shared_private',
  'regulated_or_restricted',
  'secret',
  'authority_bearing_secret'
]);

export const AUTHORITY_CLASSES = Object.freeze([
  'credential',
  'authentication_factor',
  'recovery_material',
  'signing_key',
  'session_authority',
  'payment_authority',
  'device_enrollment',
  'other_authority_bearing'
]);

const MAX_OBJECT_BYTES = 65_536;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const REVERSIBILITY = new Set(['reversible', 'compensating-only', 'irreversible', 'unknown']);
const DECISIONS = new Set(['allow', 'deny']);

const FLOW_FIELDS = Object.freeze([
  'schema',
  'flow_context_id',
  'principal',
  'runtime_identity',
  'root_task_id',
  'parent_flow_contexts',
  'lineage_depth',
  'observed_data_classes',
  'observed_authority_classes',
  'owner_or_domain_scopes',
  'purpose_scopes',
  'source_commitments',
  'created_at',
  'updated_at',
  'policy_profile_digest',
  'flow_digest'
]);

const SURROGATE_FIELDS = Object.freeze([
  'schema',
  'surrogate_id',
  'credential_class',
  'principal',
  'provider_or_connector',
  'exact_action',
  'purpose',
  'exact_destination',
  'allowed_data_classes',
  'issued_at',
  'expires_at',
  'single_use',
  'prepared_effect_digest',
  'policy_profile_digest',
  'surrogate_digest'
]);

const CHALLENGE_FIELDS = Object.freeze([
  'schema',
  'challenge_id',
  'principal',
  'requested_action',
  'provider_or_connector',
  'exact_destination',
  'observed_data_classes',
  'purpose',
  'external_transfer',
  'reversibility',
  'request_digest',
  'policy_profile_digest',
  'issued_at',
  'expires_at',
  'challenge_digest'
]);

const RECEIPT_FIELDS = Object.freeze([
  'schema',
  'receipt_id',
  'flow_context_digest',
  'principal',
  'runtime_identity',
  'data_class_summary',
  'authority_class_summary',
  'purpose',
  'destination',
  'provider_or_connector',
  'action',
  'policy_profile_digest',
  'decision',
  'reason_codes',
  'evaluated_at',
  'receipt_digest'
]);

function fail(message) {
  throw new ValidationError(message);
}

function assertPlainRecord(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${name} must be a plain object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail(`${name} must be a plain object`);
  }
  return value;
}

function boundedCanonical(value, name) {
  assertPlainRecord(value, name);
  let encoded;
  try {
    encoded = canonicalJson(value);
  } catch (error) {
    fail(`${name} must contain canonical plain JSON data: ${error.message}`);
  }
  if (Buffer.byteLength(encoded, 'utf8') > MAX_OBJECT_BYTES) {
    fail(`${name} exceeds 65536 bytes`);
  }
  return JSON.parse(encoded);
}

function assertClosedRequired(value, allowedFields, name) {
  const allowed = new Set(allowedFields);
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) fail(`${name} contains unsupported field ${field}`);
  }
  for (const field of allowedFields) {
    if (!Object.hasOwn(value, field)) fail(`${name} missing required field ${field}`);
  }
}

function assertString(value, name, max = 2048) {
  if (typeof value !== 'string' || value.length === 0 || value.length > max) {
    fail(`${name} must be a non-empty string no longer than ${max} characters`);
  }
  return value;
}

function assertExactString(value, name, max = 2048) {
  assertString(value, name, max);
  if (value.includes('*')) {
    fail(`${name} must be exact and cannot contain wildcard characters`);
  }
  return value;
}

function assertDigest(value, name) {
  if (typeof value !== 'string' || !DIGEST_PATTERN.test(value)) {
    fail(`${name} must be a sha256 digest`);
  }
  return value;
}

function assertTimestamp(value, name) {
  if (typeof value !== 'string' || !TIMESTAMP_PATTERN.test(value)) {
    fail(`${name} must be a canonical ISO timestamp`);
  }
  const millis = Date.parse(value);
  if (!Number.isFinite(millis) || new Date(millis).toISOString() !== value) {
    fail(`${name} must be a canonical ISO timestamp`);
  }
  return millis;
}

function assertInteger(value, name, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isInteger(value) || value < min || value > max) {
    fail(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function assertBoolean(value, name) {
  if (typeof value !== 'boolean') fail(`${name} must be boolean`);
  return value;
}

function assertUniqueStringSet(value, name, {
  maxItems,
  itemMax = 256,
  vocabulary = null,
  vocabularyLabel = 'value'
}) {
  if (!Array.isArray(value) || value.length > maxItems) {
    fail(`${name} must be an array with at most ${maxItems} items`);
  }
  const seen = new Set();
  for (let index = 0; index < value.length; index += 1) {
    const item = assertString(value[index], `${name}[${index}]`, itemMax);
    if (vocabulary && !vocabulary.has(item)) {
      fail(`${name}[${index}] has unknown ${vocabularyLabel} ${item}`);
    }
    if (seen.has(item)) fail(`${name} contains duplicate value ${item}`);
    seen.add(item);
  }
  return value;
}

function assertCurrentWindow(issuedAt, expiresAt, { now, maxLifetimeMs, label }) {
  const issued = assertTimestamp(issuedAt, `${label}.issued_at`);
  const expires = assertTimestamp(expiresAt, `${label}.expires_at`);
  const lifetime = expires - issued;
  if (lifetime <= 0 || lifetime > maxLifetimeMs) {
    const minutes = maxLifetimeMs / 60_000;
    fail(`${label} lifetime must be greater than 0 and at most ${minutes} minutes`);
  }
  if (now !== undefined) {
    const current = assertTimestamp(now, `${label}.now`);
    if (current < issued) fail(`${label} is not yet valid`);
    if (current >= expires) fail(`${label} is expired`);
  }
}

function assertSelfDigest(value, field, name) {
  assertDigest(value[field], `${name}.${field}`);
  const expected = contractDigest(value, field);
  if (value[field] !== expected) fail(`${name} digest mismatch`);
}

export function contractDigest(value, digestField) {
  assertPlainRecord(value, 'contract');
  assertString(digestField, 'digestField', 128);
  let canonical;
  try {
    canonical = JSON.parse(canonicalJson(value));
  } catch (error) {
    fail(`contract must contain canonical plain JSON data: ${error.message}`);
  }
  delete canonical[digestField];
  return `sha256:${digestObject(canonical)}`;
}

export function verifyFlowContext(input) {
  const value = boundedCanonical(input, 'FlowContext');
  assertClosedRequired(value, FLOW_FIELDS, 'FlowContext');
  if (value.schema !== FLOW_CONTEXT_SCHEMA) fail('FlowContext schema mismatch');
  assertString(value.flow_context_id, 'FlowContext.flow_context_id', 256);
  assertString(value.principal, 'FlowContext.principal', 256);
  assertString(value.runtime_identity, 'FlowContext.runtime_identity', 256);
  assertString(value.root_task_id, 'FlowContext.root_task_id', 256);
  if (!Array.isArray(value.parent_flow_contexts) || value.parent_flow_contexts.length > 8) {
    fail('FlowContext parent count exceeds 8');
  }
  const parentIds = new Set();
  for (let index = 0; index < value.parent_flow_contexts.length; index += 1) {
    const parent = assertPlainRecord(value.parent_flow_contexts[index], `FlowContext.parent_flow_contexts[${index}]`);
    assertClosedRequired(parent, ['flow_context_id', 'flow_digest'], `FlowContext.parent_flow_contexts[${index}]`);
    assertString(parent.flow_context_id, `FlowContext.parent_flow_contexts[${index}].flow_context_id`, 256);
    assertDigest(parent.flow_digest, `FlowContext.parent_flow_contexts[${index}].flow_digest`);
    if (parentIds.has(parent.flow_context_id)) fail('FlowContext parent list contains duplicate flow_context_id');
    parentIds.add(parent.flow_context_id);
  }
  assertInteger(value.lineage_depth, 'FlowContext lineage depth', { min: 0, max: 16 });
  assertUniqueStringSet(value.observed_data_classes, 'FlowContext.observed_data_classes', {
    maxItems: DATA_CLASSES.length,
    vocabulary: new Set(DATA_CLASSES),
    vocabularyLabel: 'data class'
  });
  assertUniqueStringSet(value.observed_authority_classes, 'FlowContext.observed_authority_classes', {
    maxItems: AUTHORITY_CLASSES.length,
    vocabulary: new Set(AUTHORITY_CLASSES),
    vocabularyLabel: 'authority class'
  });
  assertUniqueStringSet(value.owner_or_domain_scopes, 'FlowContext.owner_or_domain_scopes', { maxItems: 16 });
  assertUniqueStringSet(value.purpose_scopes, 'FlowContext.purpose_scopes', { maxItems: 16 });
  assertUniqueStringSet(value.source_commitments, 'FlowContext.source_commitments', { maxItems: 64, itemMax: 71 });
  for (const digest of value.source_commitments) assertDigest(digest, 'FlowContext.source_commitments item');
  const created = assertTimestamp(value.created_at, 'FlowContext.created_at');
  const updated = assertTimestamp(value.updated_at, 'FlowContext.updated_at');
  if (updated < created) fail('FlowContext updated_at cannot precede created_at');
  assertDigest(value.policy_profile_digest, 'FlowContext.policy_profile_digest');
  assertSelfDigest(value, 'flow_digest', 'FlowContext');
  return value;
}

export function verifyCredentialSurrogate(input, { now } = {}) {
  const value = boundedCanonical(input, 'CredentialSurrogate');
  assertClosedRequired(value, SURROGATE_FIELDS, 'CredentialSurrogate');
  if (value.schema !== CREDENTIAL_SURROGATE_SCHEMA) fail('CredentialSurrogate schema mismatch');
  assertString(value.surrogate_id, 'CredentialSurrogate.surrogate_id', 256);
  assertString(value.credential_class, 'CredentialSurrogate.credential_class', 128);
  if (!AUTHORITY_CLASSES.includes(value.credential_class)) fail('CredentialSurrogate credential class is unknown');
  assertString(value.principal, 'CredentialSurrogate.principal', 256);
  assertString(value.provider_or_connector, 'CredentialSurrogate.provider_or_connector', 256);
  assertExactString(value.exact_action, 'CredentialSurrogate.exact_action', 256);
  assertString(value.purpose, 'CredentialSurrogate.purpose', 256);
  assertString(value.exact_destination, 'CredentialSurrogate.exact_destination', 2048);
  assertUniqueStringSet(value.allowed_data_classes, 'CredentialSurrogate.allowed_data_classes', {
    maxItems: DATA_CLASSES.length,
    vocabulary: new Set(DATA_CLASSES),
    vocabularyLabel: 'data class'
  });
  assertCurrentWindow(value.issued_at, value.expires_at, {
    now,
    maxLifetimeMs: 15 * 60_000,
    label: 'CredentialSurrogate'
  });
  if (value.single_use !== true) fail('CredentialSurrogate single_use must be true');
  assertDigest(value.prepared_effect_digest, 'CredentialSurrogate.prepared_effect_digest');
  assertDigest(value.policy_profile_digest, 'CredentialSurrogate.policy_profile_digest');
  assertSelfDigest(value, 'surrogate_digest', 'CredentialSurrogate');
  return value;
}

export function verifyTrustedApprovalChallenge(input, { now } = {}) {
  const value = boundedCanonical(input, 'TrustedApprovalChallenge');
  assertClosedRequired(value, CHALLENGE_FIELDS, 'TrustedApprovalChallenge');
  if (value.schema !== TRUSTED_APPROVAL_CHALLENGE_SCHEMA) fail('TrustedApprovalChallenge schema mismatch');
  assertString(value.challenge_id, 'TrustedApprovalChallenge.challenge_id', 256);
  assertString(value.principal, 'TrustedApprovalChallenge.principal', 256);
  assertExactString(value.requested_action, 'TrustedApprovalChallenge.requested_action', 256);
  assertString(value.provider_or_connector, 'TrustedApprovalChallenge.provider_or_connector', 256);
  assertString(value.exact_destination, 'TrustedApprovalChallenge.exact_destination', 2048);
  assertUniqueStringSet(value.observed_data_classes, 'TrustedApprovalChallenge.observed_data_classes', {
    maxItems: DATA_CLASSES.length,
    vocabulary: new Set(DATA_CLASSES),
    vocabularyLabel: 'data class'
  });
  assertString(value.purpose, 'TrustedApprovalChallenge.purpose', 256);
  assertBoolean(value.external_transfer, 'TrustedApprovalChallenge.external_transfer');
  if (!REVERSIBILITY.has(value.reversibility)) fail('TrustedApprovalChallenge reversibility is invalid');
  assertDigest(value.request_digest, 'TrustedApprovalChallenge.request_digest');
  assertDigest(value.policy_profile_digest, 'TrustedApprovalChallenge.policy_profile_digest');
  assertCurrentWindow(value.issued_at, value.expires_at, {
    now,
    maxLifetimeMs: 10 * 60_000,
    label: 'TrustedApprovalChallenge'
  });
  assertSelfDigest(value, 'challenge_digest', 'TrustedApprovalChallenge');
  return value;
}

export function verifyFlowReceipt(input) {
  const value = boundedCanonical(input, 'FlowReceipt');
  assertClosedRequired(value, RECEIPT_FIELDS, 'FlowReceipt');
  if (value.schema !== FLOW_RECEIPT_SCHEMA) fail('FlowReceipt schema mismatch');
  assertString(value.receipt_id, 'FlowReceipt.receipt_id', 256);
  assertDigest(value.flow_context_digest, 'FlowReceipt.flow_context_digest');
  assertString(value.principal, 'FlowReceipt.principal', 256);
  assertString(value.runtime_identity, 'FlowReceipt.runtime_identity', 256);
  assertUniqueStringSet(value.data_class_summary, 'FlowReceipt.data_class_summary', {
    maxItems: DATA_CLASSES.length,
    vocabulary: new Set(DATA_CLASSES),
    vocabularyLabel: 'data class'
  });
  assertUniqueStringSet(value.authority_class_summary, 'FlowReceipt.authority_class_summary', {
    maxItems: AUTHORITY_CLASSES.length,
    vocabulary: new Set(AUTHORITY_CLASSES),
    vocabularyLabel: 'authority class'
  });
  assertString(value.purpose, 'FlowReceipt.purpose', 256);
  assertString(value.destination, 'FlowReceipt.destination', 2048);
  assertString(value.provider_or_connector, 'FlowReceipt.provider_or_connector', 256);
  assertString(value.action, 'FlowReceipt.action', 256);
  assertDigest(value.policy_profile_digest, 'FlowReceipt.policy_profile_digest');
  if (!DECISIONS.has(value.decision)) fail('FlowReceipt decision must be allow or deny');
  assertUniqueStringSet(value.reason_codes, 'FlowReceipt.reason_codes', { maxItems: 64, itemMax: 128 });
  assertTimestamp(value.evaluated_at, 'FlowReceipt.evaluated_at');
  assertSelfDigest(value, 'receipt_digest', 'FlowReceipt');
  return value;
}
