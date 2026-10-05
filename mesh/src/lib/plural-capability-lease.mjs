import {
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject
} from './canonical.mjs';

export const PLURAL_CAPABILITY_LEASE_CANDIDATE_SCHEMA =
  'axiom-plural-capability-lease-candidate.v0';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const UTC_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const CURRENTNESS = new Set(['current', 'revoked', 'unknown']);

function exact(raw, fields, label) {
  const value = assertPlainObject(raw, label);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new ValidationError(`${label} must be a plain record`);
  }
  if (Object.getOwnPropertySymbols(value).length !== 0) {
    throw new ValidationError(`${label} cannot contain symbol-keyed state`);
  }

  const ownNames = Object.getOwnPropertyNames(value);
  const allowed = new Set(fields);
  for (const key of ownNames) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw new ValidationError(
        `${label} property ${key} must be an enumerable data property`
      );
    }
    if (!allowed.has(key)) {
      throw new ValidationError(`${label} contains unsupported field ${key}`);
    }
  }

  for (const key of fields) {
    if (!Object.hasOwn(value, key)) {
      throw new ValidationError(`${label} is missing required field ${key}`);
    }
  }
  return value;
}

function denseOrdinaryArray(value, label, { maxItems = 64 } = {}) {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new ValidationError(
      `${label} must be an array with at most ${maxItems} entries`
    );
  }
  if (Object.getPrototypeOf(value) !== Array.prototype) {
    throw new ValidationError(`${label} must use the ordinary Array prototype`);
  }
  if (Object.getOwnPropertySymbols(value).length !== 0) {
    throw new ValidationError(`${label} cannot contain symbol-keyed state`);
  }

  const allowedNames = new Set(['length']);
  for (let index = 0; index < value.length; index += 1) {
    const key = String(index);
    allowedNames.add(key);
    if (!Object.hasOwn(value, key)) {
      throw new ValidationError(`${label} cannot contain sparse indexes`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw new ValidationError(
        `${label}[${index}] must be an enumerable data property`
      );
    }
  }

  for (const key of Object.getOwnPropertyNames(value)) {
    if (!allowedNames.has(key)) {
      throw new ValidationError(`${label} contains unsupported array property ${key}`);
    }
  }

  return value;
}

function id(value, label) {
  return assertString(value, label, { min: 1, max: 192, pattern: ID });
}

function digest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

function integer(value, label, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ValidationError(
      `${label} must be an integer between ${min} and ${max}`
    );
  }
  return value;
}

function timestamp(value, label) {
  assertString(value, label, { min: 24, max: 24, pattern: UTC_TIMESTAMP });
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    throw new ValidationError(`${label} must be a canonical UTC timestamp`);
  }
  return milliseconds;
}

function uniqueSortedIds(values, label, { maxItems = 64 } = {}) {
  denseOrdinaryArray(values, label, { maxItems });
  const seen = new Set();
  for (const [index, value] of values.entries()) {
    const parsed = id(value, `${label}[${index}]`);
    if (seen.has(parsed)) {
      throw new ValidationError(`${label} must not contain duplicates`);
    }
    seen.add(parsed);
  }
  return [...seen].sort();
}

function normalizeScope(raw) {
  const scope = exact(raw, [
    'principal_ref',
    'capability_ref',
    'purpose',
    'resource_ref',
    'effect_class',
    'consequence_ceiling',
    'max_uses',
    'max_cost_minor_units'
  ], 'scope');

  return Object.freeze({
    principal_ref: id(scope.principal_ref, 'scope.principal_ref'),
    capability_ref: id(scope.capability_ref, 'scope.capability_ref'),
    purpose: id(scope.purpose, 'scope.purpose'),
    resource_ref: id(scope.resource_ref, 'scope.resource_ref'),
    effect_class: id(scope.effect_class, 'scope.effect_class'),
    consequence_ceiling: integer(
      scope.consequence_ceiling,
      'scope.consequence_ceiling',
      { min: 0, max: 1_000_000 }
    ),
    max_uses: integer(scope.max_uses, 'scope.max_uses', { min: 1, max: 1_000_000 }),
    max_cost_minor_units: scope.max_cost_minor_units === null
      ? null
      : integer(
        scope.max_cost_minor_units,
        'scope.max_cost_minor_units',
        { min: 0, max: Number.MAX_SAFE_INTEGER }
      )
  });
}

function normalizePolicy(raw) {
  const policy = exact(raw, [
    'threshold',
    'required_authority_classes',
    'min_distinct_authority_domains',
    'max_duration_seconds'
  ], 'policy');

  const threshold = integer(policy.threshold, 'policy.threshold', { min: 1, max: 64 });
  const requiredAuthorityClasses = uniqueSortedIds(
    policy.required_authority_classes,
    'policy.required_authority_classes'
  );
  const minDistinctAuthorityDomains = integer(
    policy.min_distinct_authority_domains,
    'policy.min_distinct_authority_domains',
    { min: 1, max: 64 }
  );

  if (requiredAuthorityClasses.length > threshold) {
    throw new ValidationError(
      'policy.required_authority_classes cannot exceed policy.threshold'
    );
  }
  if (minDistinctAuthorityDomains > threshold) {
    throw new ValidationError(
      'policy.min_distinct_authority_domains cannot exceed policy.threshold'
    );
  }

  return Object.freeze({
    threshold,
    required_authority_classes: Object.freeze(requiredAuthorityClasses),
    min_distinct_authority_domains: minDistinctAuthorityDomains,
    max_duration_seconds: integer(
      policy.max_duration_seconds,
      'policy.max_duration_seconds',
      { min: 1, max: 31_536_000 }
    )
  });
}

function normalizeApproval(raw, index) {
  const label = `approvals[${index}]`;
  const approval = exact(raw, [
    'approval_id',
    'approver_ref',
    'authority_class',
    'authority_domain',
    'evidence_digest',
    'scope_digest',
    'issued_at',
    'expires_at',
    'currentness'
  ], label);

  const issuedAtMs = timestamp(approval.issued_at, `${label}.issued_at`);
  const expiresAtMs = timestamp(approval.expires_at, `${label}.expires_at`);
  if (expiresAtMs <= issuedAtMs) {
    throw new ValidationError(`${label}.expires_at must be after issued_at`);
  }

  if (!CURRENTNESS.has(approval.currentness)) {
    throw new ValidationError(`${label}.currentness is invalid`);
  }

  return Object.freeze({
    approval_id: id(approval.approval_id, `${label}.approval_id`),
    approver_ref: id(approval.approver_ref, `${label}.approver_ref`),
    authority_class: id(approval.authority_class, `${label}.authority_class`),
    authority_domain: id(approval.authority_domain, `${label}.authority_domain`),
    evidence_digest: digest(approval.evidence_digest, `${label}.evidence_digest`),
    scope_digest: digest(approval.scope_digest, `${label}.scope_digest`),
    issued_at: approval.issued_at,
    expires_at: approval.expires_at,
    currentness: approval.currentness,
    issued_at_ms: issuedAtMs,
    expires_at_ms: expiresAtMs
  });
}

function normalizeSafety(raw) {
  const safety = exact(raw, [
    'authority_effect',
    'runtime_activation',
    'capability_registry_change',
    'requires_effect_admission',
    'renewal_supported'
  ], 'safety');

  if (safety.authority_effect !== 'none') {
    throw new ValidationError('safety.authority_effect must be none');
  }
  if (safety.runtime_activation !== false) {
    throw new ValidationError('safety.runtime_activation must be false');
  }
  if (safety.capability_registry_change !== false) {
    throw new ValidationError('safety.capability_registry_change must be false');
  }
  if (safety.requires_effect_admission !== true) {
    throw new ValidationError('safety.requires_effect_admission must be true');
  }
  if (safety.renewal_supported !== false) {
    throw new ValidationError('P0 plural capability lease candidates do not support renewal');
  }

  return Object.freeze({
    authority_effect: 'none',
    runtime_activation: false,
    capability_registry_change: false,
    requires_effect_admission: true,
    renewal_supported: false
  });
}

export function evaluatePluralCapabilityLeaseCandidate(raw) {
  const value = exact(raw, [
    'schema',
    'candidate_id',
    'evaluation_time',
    'lease_window',
    'scope',
    'policy',
    'approvals',
    'safety'
  ], 'plural capability lease candidate');

  if (value.schema !== PLURAL_CAPABILITY_LEASE_CANDIDATE_SCHEMA) {
    throw new ValidationError('plural capability lease candidate schema is invalid');
  }

  const candidateId = id(value.candidate_id, 'candidate_id');
  const evaluationTimeMs = timestamp(value.evaluation_time, 'evaluation_time');

  const leaseWindow = exact(
    value.lease_window,
    ['valid_from', 'expires_at'],
    'lease_window'
  );
  const validFromMs = timestamp(leaseWindow.valid_from, 'lease_window.valid_from');
  const expiresAtMs = timestamp(leaseWindow.expires_at, 'lease_window.expires_at');
  if (expiresAtMs <= validFromMs) {
    throw new ValidationError('lease_window.expires_at must be after valid_from');
  }

  const scope = normalizeScope(value.scope);
  const scopeDigest = digestObject(scope);
  const policy = normalizePolicy(value.policy);
  const safety = normalizeSafety(value.safety);

  denseOrdinaryArray(value.approvals, 'approvals', { maxItems: 64 });
  const approvals = value.approvals.map(normalizeApproval);

  const approvalIds = new Set();
  const approverRefs = new Set();
  for (const approval of approvals) {
    if (approvalIds.has(approval.approval_id)) {
      throw new ValidationError('approval_id values must be unique');
    }
    approvalIds.add(approval.approval_id);

    if (approverRefs.has(approval.approver_ref)) {
      throw new ValidationError('approver_ref values must be unique');
    }
    approverRefs.add(approval.approver_ref);
  }

  const normalizedApprovals = approvals
    .map((approval) => ({
      approval_id: approval.approval_id,
      approver_ref: approval.approver_ref,
      authority_class: approval.authority_class,
      authority_domain: approval.authority_domain,
      evidence_digest: approval.evidence_digest,
      scope_digest: approval.scope_digest,
      issued_at: approval.issued_at,
      expires_at: approval.expires_at,
      currentness: approval.currentness
    }))
    .sort((left, right) => {
      if (left.approver_ref < right.approver_ref) return -1;
      if (left.approver_ref > right.approver_ref) return 1;
      if (left.approval_id < right.approval_id) return -1;
      if (left.approval_id > right.approval_id) return 1;
      return 0;
    });

  const normalizedCandidate = {
    schema: PLURAL_CAPABILITY_LEASE_CANDIDATE_SCHEMA,
    candidate_id: candidateId,
    evaluation_time: value.evaluation_time,
    lease_window: {
      valid_from: leaseWindow.valid_from,
      expires_at: leaseWindow.expires_at
    },
    scope,
    policy,
    approvals: normalizedApprovals,
    safety
  };

  const reasons = [];
  const requestedDurationSeconds = (expiresAtMs - validFromMs) / 1_000;

  if (requestedDurationSeconds > policy.max_duration_seconds) {
    reasons.push('lease_duration_exceeds_policy_maximum');
  }
  if (evaluationTimeMs < validFromMs) {
    reasons.push('lease_not_yet_active');
  }
  if (evaluationTimeMs >= expiresAtMs) {
    reasons.push('lease_expired');
  }

  const supportingClasses = new Set();
  const supportingDomains = new Set();
  let supportingApprovals = 0;

  for (const approval of approvals) {
    let supporting = true;

    if (approval.scope_digest !== scopeDigest) {
      reasons.push('approval_scope_mismatch');
      supporting = false;
    }
    if (approval.currentness === 'revoked') {
      reasons.push('approval_revoked');
      supporting = false;
    } else if (approval.currentness === 'unknown') {
      reasons.push('approval_currentness_unknown');
      supporting = false;
    }
    if (approval.issued_at_ms > evaluationTimeMs) {
      reasons.push('approval_not_yet_issued');
      supporting = false;
    }
    if (approval.expires_at_ms <= evaluationTimeMs) {
      reasons.push('approval_expired');
      supporting = false;
    }
    if (approval.expires_at_ms < expiresAtMs) {
      reasons.push('lease_outlives_supporting_approval');
      supporting = false;
    }

    if (supporting) {
      supportingApprovals += 1;
      supportingClasses.add(approval.authority_class);
      supportingDomains.add(approval.authority_domain);
    }
  }

  if (supportingApprovals < policy.threshold) {
    reasons.push('approval_threshold_unsatisfied');
  }

  for (const authorityClass of policy.required_authority_classes) {
    if (!supportingClasses.has(authorityClass)) {
      reasons.push(`required_authority_class_missing:${authorityClass}`);
    }
  }

  if (supportingDomains.size < policy.min_distinct_authority_domains) {
    reasons.push('distinct_authority_domain_floor_unsatisfied');
  }

  const reasonCodes = [...new Set(reasons)].sort();
  const satisfiedAuthorityClasses = [...supportingClasses].sort();

  return Object.freeze({
    valid: true,
    eligible: reasonCodes.length === 0,
    candidate_id: candidateId,
    candidate_digest: digestObject(normalizedCandidate),
    scope_digest: scopeDigest,
    reason_codes: Object.freeze(reasonCodes),
    counted_approvals: supportingApprovals,
    distinct_authority_domains: supportingDomains.size,
    satisfied_authority_classes: Object.freeze(satisfiedAuthorityClasses),
    requested_duration_seconds: requestedDurationSeconds,
    authority_effect: 'none',
    runtime_activation: false,
    capability_registry_change: false,
    requires_effect_admission: true,
    renewal_supported: false
  });
}
