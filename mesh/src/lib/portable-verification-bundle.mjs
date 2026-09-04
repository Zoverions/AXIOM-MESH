import {
  ValidationError,
  assertPlainObject,
  assertString,
  assertStringArray
} from './canonical.mjs';

export const PORTABLE_VERIFICATION_BUNDLE_SCHEMA =
  'axiom-portable-verification-bundle.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;

function exact(raw, fields, label) {
  const value = assertPlainObject(raw, label);
  const allowed = new Set(fields);
  for (const key of Object.keys(value)) {
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

export function validatePortableVerificationBundle(raw, { now = new Date() } = {}) {
  const value = exact(raw, [
    'schema',
    'bundle_id',
    'bundle_version',
    'created_at',
    'expires_at',
    'assertion_profile_ids',
    'verifier_artifacts',
    'trust_material',
    'freshness_requirements',
    'revocation_requirements',
    'offline_policy',
    'authority',
    'limitations'
  ], 'portable verification bundle');

  if (value.schema !== PORTABLE_VERIFICATION_BUNDLE_SCHEMA) {
    throw new ValidationError('portable verification bundle schema is invalid');
  }

  id(value.bundle_id, 'bundle_id');
  assertString(value.bundle_version, 'bundle_version', {
    min: 5,
    max: 32,
    pattern: /^[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?$/
  });
  const createdAt = timestamp(value.created_at, 'created_at');
  const expiresAt = timestamp(value.expires_at, 'expires_at');

  const assertionProfiles = assertStringArray(
    value.assertion_profile_ids,
    'assertion_profile_ids',
    { maxItems: 128, itemMax: 192 }
  );
  if (assertionProfiles.length === 0) {
    throw new ValidationError('portable verification bundle requires assertion_profile_ids');
  }

  if (!Array.isArray(value.verifier_artifacts) || value.verifier_artifacts.length === 0) {
    throw new ValidationError('portable verification bundle requires verifier_artifacts');
  }

  for (const [index, artifactRaw] of value.verifier_artifacts.entries()) {
    const artifact = exact(artifactRaw, [
      'verifier_id',
      'implementation_digest',
      'artifact_digest',
      'reproducible',
      'source_available'
    ], `verifier_artifacts[${index}]`);
    id(artifact.verifier_id, `verifier_artifacts[${index}].verifier_id`);
    digest(artifact.implementation_digest, `verifier_artifacts[${index}].implementation_digest`);
    digest(artifact.artifact_digest, `verifier_artifacts[${index}].artifact_digest`);
    if (typeof artifact.reproducible !== 'boolean') {
      throw new ValidationError(`verifier_artifacts[${index}].reproducible must be boolean`);
    }
    if (typeof artifact.source_available !== 'boolean') {
      throw new ValidationError(`verifier_artifacts[${index}].source_available must be boolean`);
    }
  }

  const trust = exact(value.trust_material, [
    'trust_profile_ids',
    'trust_anchor_digests',
    'policy_digest'
  ], 'trust_material');
  const trustProfiles = assertStringArray(trust.trust_profile_ids, 'trust_profile_ids', {
    maxItems: 128,
    itemMax: 192
  });
  if (trustProfiles.length === 0) {
    throw new ValidationError('trust_material requires trust_profile_ids');
  }
  const anchors = assertStringArray(trust.trust_anchor_digests, 'trust_anchor_digests', {
    maxItems: 128,
    itemMax: 64
  });
  if (anchors.length === 0) {
    throw new ValidationError('trust_material requires trust_anchor_digests');
  }
  for (const [index, anchor] of anchors.entries()) {
    digest(anchor, `trust_anchor_digests[${index}]`);
  }
  digest(trust.policy_digest, 'trust_material.policy_digest');

  const freshness = exact(value.freshness_requirements, [
    'max_bundle_age_seconds',
    'external_currentness_required'
  ], 'freshness_requirements');
  if (!Number.isInteger(freshness.max_bundle_age_seconds) || freshness.max_bundle_age_seconds <= 0) {
    throw new ValidationError('max_bundle_age_seconds must be a positive integer');
  }
  if (typeof freshness.external_currentness_required !== 'boolean') {
    throw new ValidationError('external_currentness_required must be boolean');
  }

  const revocation = exact(value.revocation_requirements, [
    'mode',
    'last_checked_at',
    'must_recheck_before_high_consequence'
  ], 'revocation_requirements');
  id(revocation.mode, 'revocation_requirements.mode');
  timestamp(revocation.last_checked_at, 'revocation_requirements.last_checked_at');
  if (typeof revocation.must_recheck_before_high_consequence !== 'boolean') {
    throw new ValidationError('must_recheck_before_high_consequence must be boolean');
  }

  const offline = exact(value.offline_policy, [
    'allowed',
    'allow_until',
    'stale_behavior'
  ], 'offline_policy');
  if (typeof offline.allowed !== 'boolean') {
    throw new ValidationError('offline_policy.allowed must be boolean');
  }
  const allowUntil = timestamp(offline.allow_until, 'offline_policy.allow_until');
  id(offline.stale_behavior, 'offline_policy.stale_behavior');

  const authority = exact(value.authority, [
    'bundle_grants_authority',
    'verification_grants_authority',
    'requires_local_effect_admission'
  ], 'authority');
  if (authority.bundle_grants_authority !== false) {
    throw new ValidationError('bundle must grant no authority');
  }
  if (authority.verification_grants_authority !== false) {
    throw new ValidationError('verification must grant no authority');
  }
  if (authority.requires_local_effect_admission !== true) {
    throw new ValidationError('local effect admission is required');
  }

  const limitations = assertStringArray(value.limitations, 'limitations', {
    maxItems: 64,
    itemMax: 512
  });
  if (limitations.length === 0) {
    throw new ValidationError('portable verification bundle must declare limitations');
  }

  const nowMs = now instanceof Date ? now.valueOf() : new Date(now).valueOf();
  if (!Number.isFinite(nowMs)) throw new ValidationError('now is invalid');

  const createdMs = new Date(createdAt).valueOf();
  const expiresMs = new Date(expiresAt).valueOf();
  const allowUntilMs = new Date(allowUntil).valueOf();
  const bundleAgeMs = nowMs - createdMs;

  const checks = Object.freeze({
    bundle_not_expired: expiresMs > nowMs,
    bundle_age_within_policy:
      bundleAgeMs >= 0 &&
      bundleAgeMs <= freshness.max_bundle_age_seconds * 1000,
    offline_window_open: !offline.allowed || allowUntilMs > nowMs
  });

  return Object.freeze({
    valid: Object.values(checks).every(Boolean),
    checks,
    bundle_id: value.bundle_id,
    authority_effect: 'none',
    verification_effect: 'portable_verifier_context_only',
    offline_allowed: offline.allowed,
    external_currentness_required: freshness.external_currentness_required
  });
}
