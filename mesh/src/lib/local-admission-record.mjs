import {
  ValidationError,
  assertPlainObject,
  assertString,
  assertStringArray
} from './canonical.mjs';
import { types } from 'node:util';

import { snapshotDelegationPlainData } from './delegation-plain-snapshot.mjs';

export const LOCAL_ADMISSION_RECORD_SCHEMA = 'axiom-local-admission-record.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;

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

function readNow(options) {
  if (options === undefined) return new Date();
  if (types.isProxy(options) || !options || typeof options !== 'object' || Array.isArray(options)) {
    throw new ValidationError('local admission options must be an object');
  }
  const prototype = Object.getPrototypeOf(options);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new ValidationError('local admission options must be a plain object');
  }
  const descriptor = Object.getOwnPropertyDescriptor(options, 'now');
  if (descriptor === undefined) return new Date();
  if (!Object.hasOwn(descriptor, 'value')) {
    throw new ValidationError('local admission options.now must be a data property');
  }
  return descriptor.value === undefined ? new Date() : descriptor.value;
}

// Converts the already-read now without calling caller code: a genuine Date is
// read through Date.prototype.getTime, and only primitives go through new Date.
function nowMilliseconds(now) {
  if (types.isDate(now)) return Date.prototype.getTime.call(now);
  if (now === null || ['string', 'number', 'boolean'].includes(typeof now)) return new Date(now).valueOf();
  return Number.NaN;
}

/**
 * Validates a local admission record. The record is copied once at entry into
 * fresh plain data (snapshotDelegationPlainData): no Proxy trap or getter runs,
 * and accessors, symbol keys, hidden fields, non-plain prototypes and non-JSON
 * values are a ValidationError. Every check and the returned fields read only
 * that copy, so the output contains only values that were validated.
 */
export function validateLocalAdmissionRecord(raw, options = undefined) {
  const now = readNow(options);
  const value = exact(snapshotDelegationPlainData(raw, 'local admission record'), [
    'schema',
    'admission_id',
    'target_instance_id',
    'source_package_id',
    'source_package_manifest_digest',
    'approved_artifact_digests',
    'rejected_artifact_digests',
    'policy_digest',
    'protection_profile_ids',
    'deployment_topology_id',
    'authority_source',
    'review',
    'valid_from',
    'expires_at',
    'rollback',
    'activation',
    'limitations'
  ], 'local admission record');

  if (value.schema !== LOCAL_ADMISSION_RECORD_SCHEMA) {
    throw new ValidationError('local admission record schema is invalid');
  }

  id(value.admission_id, 'admission_id');
  id(value.target_instance_id, 'target_instance_id');
  id(value.source_package_id, 'source_package_id');
  digest(value.source_package_manifest_digest, 'source_package_manifest_digest');

  const approved = assertStringArray(value.approved_artifact_digests, 'approved_artifact_digests', {
    maxItems: 512,
    itemMax: 64
  });
  const rejected = assertStringArray(value.rejected_artifact_digests, 'rejected_artifact_digests', {
    maxItems: 512,
    itemMax: 64
  });
  if (approved.length === 0) {
    throw new ValidationError('local admission record requires at least one approved artifact digest');
  }
  for (const [index, item] of approved.entries()) digest(item, `approved_artifact_digests[${index}]`);
  for (const [index, item] of rejected.entries()) digest(item, `rejected_artifact_digests[${index}]`);

  const approvedSet = new Set(approved);
  if (approvedSet.size !== approved.length) {
    throw new ValidationError('approved artifact digests must be unique');
  }
  const rejectedSet = new Set(rejected);
  if (rejectedSet.size !== rejected.length) {
    throw new ValidationError('rejected artifact digests must be unique');
  }
  for (const item of approvedSet) {
    if (rejectedSet.has(item)) {
      throw new ValidationError('artifact digest cannot be both approved and rejected');
    }
  }

  digest(value.policy_digest, 'policy_digest');

  const protectionProfiles = assertStringArray(value.protection_profile_ids, 'protection_profile_ids', {
    maxItems: 128,
    itemMax: 192
  });
  if (protectionProfiles.length === 0) {
    throw new ValidationError('local admission record requires protection_profile_ids');
  }
  for (const [index, item] of protectionProfiles.entries()) {
    id(item, `protection_profile_ids[${index}]`);
  }
  id(value.deployment_topology_id, 'deployment_topology_id');

  const authoritySource = exact(value.authority_source, [
    'authority_type',
    'authority_id',
    'authority_evidence_digest'
  ], 'authority_source');
  id(authoritySource.authority_type, 'authority_source.authority_type');
  id(authoritySource.authority_id, 'authority_source.authority_id');
  digest(authoritySource.authority_evidence_digest, 'authority_source.authority_evidence_digest');

  const review = exact(value.review, [
    'reviewer_ids',
    'review_evidence_digests',
    'quarantine_scan_passed',
    'policy_check_passed'
  ], 'review');
  const reviewers = assertStringArray(review.reviewer_ids, 'review.reviewer_ids', {
    maxItems: 64,
    itemMax: 192
  });
  if (reviewers.length === 0) throw new ValidationError('local admission record requires reviewer_ids');
  for (const [index, item] of reviewers.entries()) {
    id(item, `review.reviewer_ids[${index}]`);
  }
  const reviewDigests = assertStringArray(review.review_evidence_digests, 'review.review_evidence_digests', {
    maxItems: 128,
    itemMax: 64
  });
  if (reviewDigests.length === 0) throw new ValidationError('local admission record requires review evidence');
  for (const [index, item] of reviewDigests.entries()) digest(item, `review_evidence_digests[${index}]`);
  if (review.quarantine_scan_passed !== true) {
    throw new ValidationError('quarantine scan must pass before local admission');
  }
  if (review.policy_check_passed !== true) {
    throw new ValidationError('local policy check must pass before local admission');
  }

  const validFrom = timestamp(value.valid_from, 'valid_from');
  const expiresAt = timestamp(value.expires_at, 'expires_at');

  const rollback = exact(value.rollback, [
    'required',
    'rollback_plan_digest',
    'max_recovery_seconds'
  ], 'rollback');
  if (rollback.required !== true) {
    throw new ValidationError('rollback plan is required');
  }
  digest(rollback.rollback_plan_digest, 'rollback.rollback_plan_digest');
  if (!Number.isInteger(rollback.max_recovery_seconds) || rollback.max_recovery_seconds <= 0) {
    throw new ValidationError('rollback.max_recovery_seconds must be a positive integer');
  }

  const activation = exact(value.activation, [
    'state',
    'requires_fresh_effect_admission',
    'auto_activate'
  ], 'activation');
  if (activation.state !== 'admitted_inert') {
    throw new ValidationError('activation.state must be admitted_inert');
  }
  if (activation.requires_fresh_effect_admission !== true) {
    throw new ValidationError('fresh effect admission is required');
  }
  if (activation.auto_activate !== false) {
    throw new ValidationError('local admission record cannot auto-activate');
  }

  const limitations = assertStringArray(value.limitations, 'limitations', {
    maxItems: 64,
    itemMax: 512
  });
  if (limitations.length === 0) {
    throw new ValidationError('local admission record must declare limitations');
  }

  const nowMs = nowMilliseconds(now);
  if (!Number.isFinite(nowMs)) throw new ValidationError('now is invalid');
  const validFromMs = new Date(validFrom).valueOf();
  const expiresMs = new Date(expiresAt).valueOf();
  if (expiresMs <= validFromMs) {
    throw new ValidationError('expires_at must follow valid_from');
  }

  const checks = Object.freeze({
    effective: validFromMs <= nowMs,
    not_expired: expiresMs > nowMs,
    quarantine_scan_passed: review.quarantine_scan_passed === true,
    policy_check_passed: review.policy_check_passed === true,
    rollback_defined: rollback.required === true
  });

  return Object.freeze({
    valid: Object.values(checks).every(Boolean),
    checks,
    admission_id: value.admission_id,
    target_instance_id: value.target_instance_id,
    state: 'admitted_inert',
    authority_effect: 'none',
    activation_requires_fresh_effect_admission: true
  });
}
