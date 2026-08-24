import { AxiomError, ValidationError, digestObject } from '../lib/canonical.mjs';
import {
  getCircleRecordAuthorizationLifecyclePolicy,
  validateCircleRecordAuthorizationEligibilityResult
} from '../../../packages/axiom-circle-record-authorization-lifecycle/index.mjs';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const GUARD_KEYS = Object.freeze([
  'schema', 'circle_id', 'membership_id', 'principal_id',
  'expected_lifecycle_head_digest', 'membership_lifecycle_digest',
  'credential_lifecycle_digest', 'source_event_id', 'source_event_seq'
]);
const SNAPSHOT_KEYS = Object.freeze([
  'circle_id', 'membership_id', 'principal_id', 'lifecycle_head_digest',
  'membership_lifecycle_digest', 'credential_lifecycle_digest',
  'event_id', 'event_seq', 'updated_at'
]);
const GUARD_SCHEMA = 'axiom-circle-admission-lifecycle-head-guard.v0';
const GUARD_SET_SCHEMA = 'axiom-circle-admission-lifecycle-head-guard-set.v0';

export function deriveCircleAdmissionLifecycleGuardSet({
  authorizationInput,
  authorization,
  lifecycleHeads
}) {
  validateCircleRecordAuthorizationEligibilityResult(
    authorization,
    getCircleRecordAuthorizationLifecyclePolicy()
  );
  if (!authorizationInput || typeof authorizationInput !== 'object' || Array.isArray(authorizationInput)) {
    throw new ValidationError('Circle lifecycle CAS authorization input is required');
  }
  if (!Array.isArray(authorizationInput.memberContexts)) {
    throw new ValidationError('Circle lifecycle CAS authorization member contexts are required');
  }
  if (!Array.isArray(lifecycleHeads) || lifecycleHeads.length > 4096) {
    throw new ValidationError('Circle lifecycle CAS head snapshots are invalid');
  }

  const required = requiredMembershipsFromAuthorization(authorization);
  if (lifecycleHeads.length !== required.size) {
    throw new ValidationError('Circle lifecycle CAS requires exactly one Grid head for every authorization membership');
  }

  const contextByMembership = new Map();
  for (const context of authorizationInput.memberContexts) {
    if (!context || typeof context !== 'object' || Array.isArray(context)) continue;
    if (contextByMembership.has(context.membership_id)) {
      throw new ValidationError(`Duplicate Circle lifecycle CAS member context: ${context.membership_id}`);
    }
    contextByMembership.set(context.membership_id, context);
  }

  const snapshotByMembership = new Map();
  for (const raw of lifecycleHeads) {
    const snapshot = normalizeCircleLifecycleHeadSnapshot(raw);
    if (snapshotByMembership.has(snapshot.membership_id)) {
      throw new ValidationError(`Duplicate Circle lifecycle CAS Grid head: ${snapshot.membership_id}`);
    }
    snapshotByMembership.set(snapshot.membership_id, snapshot);
  }

  const guards = [];
  for (const [membershipId, requirement] of required.entries()) {
    const context = contextByMembership.get(membershipId);
    const snapshot = snapshotByMembership.get(membershipId);
    if (!context || !snapshot) {
      throw new ValidationError(`Circle lifecycle CAS is missing context or Grid head for ${membershipId}`);
    }
    if (
      context.circle_id !== requirement.circle_id
      || context.membership_id !== membershipId
      || context.principal_id !== requirement.principal_id
      || snapshot.circle_id !== requirement.circle_id
      || snapshot.membership_id !== membershipId
      || snapshot.principal_id !== requirement.principal_id
    ) {
      throw new ValidationError('Circle lifecycle CAS membership identity does not match authorization evidence');
    }
    if (!context.membership_lifecycle || !context.credential_lifecycle) {
      throw new ValidationError('Circle lifecycle CAS role-bearing authorization requires complete lifecycle context');
    }
    const membershipDigest = digestObject(context.membership_lifecycle);
    const credentialDigest = digestObject(context.credential_lifecycle);
    if (
      snapshot.membership_lifecycle_digest !== membershipDigest
      || snapshot.credential_lifecycle_digest !== credentialDigest
    ) {
      throw new AxiomError(
        'circle_lifecycle_guard_context_mismatch',
        'Circle lifecycle Grid head does not match the lifecycle context used for authorization',
        409,
        {
          circle_id: requirement.circle_id,
          membership_id: membershipId,
          expected_membership_lifecycle_digest: membershipDigest,
          observed_membership_lifecycle_digest: snapshot.membership_lifecycle_digest,
          expected_credential_lifecycle_digest: credentialDigest,
          observed_credential_lifecycle_digest: snapshot.credential_lifecycle_digest
        }
      );
    }
    guards.push(Object.freeze({
      schema: GUARD_SCHEMA,
      circle_id: snapshot.circle_id,
      membership_id: snapshot.membership_id,
      principal_id: snapshot.principal_id,
      expected_lifecycle_head_digest: snapshot.lifecycle_head_digest,
      membership_lifecycle_digest: snapshot.membership_lifecycle_digest,
      credential_lifecycle_digest: snapshot.credential_lifecycle_digest,
      source_event_id: snapshot.event_id,
      source_event_seq: snapshot.event_seq
    }));
  }

  return normalizeCircleAdmissionLifecycleGuardSet({
    schema: GUARD_SET_SCHEMA,
    guards
  }, { authorization });
}

export function normalizeCircleAdmissionLifecycleGuardSet(value, { authorization = null } = {}) {
  exactObject(value, 'Circle lifecycle CAS guard set', ['schema', 'guards']);
  if (value.schema !== GUARD_SET_SCHEMA || !Array.isArray(value.guards) || value.guards.length > 4096) {
    throw new ValidationError('Circle lifecycle CAS guard set boundary is invalid');
  }
  const guards = value.guards.map(normalizeCircleAdmissionLifecycleGuard);
  guards.sort((left, right) => `${left.circle_id}:${left.membership_id}`.localeCompare(`${right.circle_id}:${right.membership_id}`));
  const seen = new Set();
  for (const guard of guards) {
    const key = `${guard.circle_id}\u0000${guard.membership_id}`;
    if (seen.has(key)) throw new ValidationError('Circle lifecycle CAS guard set contains duplicate membership');
    seen.add(key);
  }
  const normalized = deepFreeze({ schema: GUARD_SET_SCHEMA, guards });
  if (authorization !== null) validateCircleAdmissionLifecycleGuardSetAgainstAuthorization(normalized, authorization);
  return normalized;
}

export function validateCircleAdmissionLifecycleGuardSetAgainstAuthorization(guardSet, authorization) {
  validateCircleRecordAuthorizationEligibilityResult(
    authorization,
    getCircleRecordAuthorizationLifecyclePolicy()
  );
  const normalized = normalizeCircleAdmissionLifecycleGuardSet(guardSet);
  const required = requiredMembershipsFromAuthorization(authorization);
  if (normalized.guards.length !== required.size) {
    throw new ValidationError('Circle lifecycle CAS guard set does not exactly cover authorization memberships');
  }
  for (const guard of normalized.guards) {
    const requirement = required.get(guard.membership_id);
    if (
      !requirement
      || guard.circle_id !== requirement.circle_id
      || guard.principal_id !== requirement.principal_id
    ) {
      throw new ValidationError('Circle lifecycle CAS guard does not match authorization membership evidence');
    }
  }
  return true;
}

export function digestCircleAdmissionLifecycleGuardSet(guardSet) {
  return digestObject(normalizeCircleAdmissionLifecycleGuardSet(guardSet));
}

export function normalizeCircleLifecycleHeadSnapshot(value) {
  exactObject(value, 'Circle lifecycle Grid head snapshot', SNAPSHOT_KEYS);
  if (
    !ID.test(value.circle_id ?? '')
    || !ID.test(value.membership_id ?? '')
    || !ID.test(value.principal_id ?? '')
    || !DIGEST.test(value.lifecycle_head_digest ?? '')
    || !DIGEST.test(value.membership_lifecycle_digest ?? '')
    || !DIGEST.test(value.credential_lifecycle_digest ?? '')
    || !ID.test(value.event_id ?? '')
    || !Number.isSafeInteger(value.event_seq)
    || value.event_seq < 1
    || !canonicalTimestamp(value.updated_at)
  ) throw new ValidationError('Circle lifecycle Grid head snapshot boundary is invalid');
  return deepFreeze(structuredClone(value));
}

function normalizeCircleAdmissionLifecycleGuard(value) {
  exactObject(value, 'Circle lifecycle CAS guard', GUARD_KEYS);
  if (
    value.schema !== GUARD_SCHEMA
    || !ID.test(value.circle_id ?? '')
    || !ID.test(value.membership_id ?? '')
    || !ID.test(value.principal_id ?? '')
    || !DIGEST.test(value.expected_lifecycle_head_digest ?? '')
    || !DIGEST.test(value.membership_lifecycle_digest ?? '')
    || !DIGEST.test(value.credential_lifecycle_digest ?? '')
    || !ID.test(value.source_event_id ?? '')
    || !Number.isSafeInteger(value.source_event_seq)
    || value.source_event_seq < 1
  ) throw new ValidationError('Circle lifecycle CAS guard boundary is invalid');
  return deepFreeze(structuredClone(value));
}

function requiredMembershipsFromAuthorization(authorization) {
  const required = new Map();
  for (const item of authorization.eligibility_evidence.items) {
    const existing = required.get(item.membership_id);
    if (existing && (existing.circle_id !== item.circle_id || existing.principal_id !== item.principal_id)) {
      throw new ValidationError('Circle authorization eligibility evidence has inconsistent membership identity');
    }
    required.set(item.membership_id, {
      circle_id: item.circle_id,
      principal_id: item.principal_id
    });
  }
  return required;
}

function canonicalTimestamp(value) {
  if (typeof value !== 'string') return false;
  const date = new Date(value);
  return !Number.isNaN(date.valueOf()) && date.toISOString() === value;
}

function exactObject(value, label, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new ValidationError(`${label} fields are invalid`);
  }
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
