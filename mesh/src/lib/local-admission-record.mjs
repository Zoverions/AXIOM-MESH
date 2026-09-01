import {
  ValidationError,
  assertPlainObject,
  assertString,
  assertStringArray
} from './canonical.mjs';

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

export function validateLocalAdmissionRecord(raw, { now = new Date() } = {}) {
  const value = exact(raw, [
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
  const overlap = approved.filter(item => rejected.includes(item));
  if (overlap.length > 0) throw new ValidationError('artifact digest cannot be both approved and rejected');

  digest(value.policy_digest, 'policy_digest');

  const protectionProfiles = assertStringArray(value.protection_profile_ids, 'protection_profile_ids', {
    maxItems: 128,
    itemMax: 192
  });
  if (protectionProfiles.length === 0) {
    throw new ValidationError('local admission record requires protection_profile_ids');
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

  const nowMs = now instanceof Date ? now.valueOf() : new Date(now).valueOf();
  if (!Number.isFinite(nowMs)) throw new ValidationError('now is invalid');
  const validFromMs = new Date(validFrom).valueOf();
  const expiresMs = new Date(expiresAt).valueOf();

  const checks = Object.freeze({
    effective: validFromMs <= nowMs,
    not_expired: expiresMs > nowMs,
    quarantine_scan_passed: true,
    policy_check_passed: true,
    rollback_defined: true
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
