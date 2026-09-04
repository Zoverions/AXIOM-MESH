import {
  ValidationError,
  assertPlainObject,
  assertString,
  assertStringArray
} from './canonical.mjs';

export const PROOF_ASSERTION_SCHEMA = 'axiom-proof-bearing-assertion.v1';

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

export function validateProofBearingAssertion(raw, { now = new Date() } = {}) {
  const value = exact(raw, [
    'schema',
    'assertion_id',
    'statement_type',
    'proof_profile',
    'source_domain',
    'subject_binding',
    'audience',
    'resource',
    'purpose',
    'issued_at',
    'expires_at',
    'public_inputs_digest',
    'proof_digest',
    'verifier',
    'verification_result',
    'limitations'
  ], 'proof-bearing assertion');

  if (value.schema !== PROOF_ASSERTION_SCHEMA) {
    throw new ValidationError('proof-bearing assertion schema is invalid');
  }

  id(value.assertion_id, 'assertion_id');
  id(value.statement_type, 'statement_type');
  id(value.proof_profile, 'proof_profile');
  id(value.source_domain, 'source_domain');
  id(value.subject_binding, 'subject_binding');
  id(value.audience, 'audience');
  id(value.resource, 'resource');
  id(value.purpose, 'purpose');
  const issuedAt = timestamp(value.issued_at, 'issued_at');
  const expiresAt = timestamp(value.expires_at, 'expires_at');
  const issuedAtMs = new Date(issuedAt).valueOf();
  const expiresAtMs = new Date(expiresAt).valueOf();
  if (expiresAtMs <= issuedAtMs) {
    throw new ValidationError('expires_at must follow issued_at');
  }
  digest(value.public_inputs_digest, 'public_inputs_digest');
  digest(value.proof_digest, 'proof_digest');

  const verifier = exact(value.verifier, [
    'verifier_id',
    'implementation_digest',
    'trust_profile',
    'independently_reproducible'
  ], 'verifier');
  id(verifier.verifier_id, 'verifier.verifier_id');
  digest(verifier.implementation_digest, 'verifier.implementation_digest');
  id(verifier.trust_profile, 'verifier.trust_profile');
  if (typeof verifier.independently_reproducible !== 'boolean') {
    throw new ValidationError('verifier.independently_reproducible must be boolean');
  }

  const result = exact(value.verification_result, [
    'verified',
    'checked_statement',
    'checked_subject_binding',
    'checked_audience',
    'checked_resource',
    'checked_expiry'
  ], 'verification_result');

  for (const field of [
    'verified',
    'checked_statement',
    'checked_subject_binding',
    'checked_audience',
    'checked_resource',
    'checked_expiry'
  ]) {
    if (typeof result[field] !== 'boolean') {
      throw new ValidationError(`verification_result.${field} must be boolean`);
    }
  }

  const limitations = assertStringArray(value.limitations, 'limitations', {
    maxItems: 64,
    itemMax: 512
  });
  if (limitations.length === 0) {
    throw new ValidationError('proof-bearing assertion must declare at least one limitation');
  }

  const nowMs = now instanceof Date ? now.valueOf() : new Date(now).valueOf();
  if (!Number.isFinite(nowMs)) throw new ValidationError('now is invalid');

  const checks = Object.freeze({
    verifier_reports_verified: result.verified === true,
    statement_checked: result.checked_statement === true,
    subject_binding_checked: result.checked_subject_binding === true,
    audience_checked: result.checked_audience === true,
    resource_checked: result.checked_resource === true,
    expiry_checked: result.checked_expiry === true,
    not_expired: expiresAtMs > nowMs
  });

  return Object.freeze({
    valid: Object.values(checks).every(Boolean),
    checks,
    assertion_id: value.assertion_id,
    statement_type: value.statement_type,
    source_domain: value.source_domain,
    evidence_effect: 'verified_input_only',
    authority_effect: 'none',
    external_truth_effect: 'bounded_statement_only'
  });
}
