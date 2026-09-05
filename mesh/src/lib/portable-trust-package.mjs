import {
  ValidationError,
  assertPlainObject,
  assertString,
  assertStringArray
} from './canonical.mjs';

export const PORTABLE_TRUST_PACKAGE_SCHEMA = 'axiom-portable-trust-package.v1';

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

export function validatePortableTrustPackage(raw, { now = new Date() } = {}) {
  const value = exact(raw, [
    'schema',
    'package_id',
    'package_version',
    'created_at',
    'expires_at',
    'purpose',
    'artifacts',
    'signatures',
    'witnesses',
    'import_policy',
    'authority',
    'limitations'
  ], 'portable trust package');

  if (value.schema !== PORTABLE_TRUST_PACKAGE_SCHEMA) {
    throw new ValidationError('portable trust package schema is invalid');
  }

  id(value.package_id, 'package_id');
  assertString(value.package_version, 'package_version', {
    min: 5,
    max: 32,
    pattern: /^[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?$/
  });
  const createdAt = timestamp(value.created_at, 'created_at');
  const expiresAt = timestamp(value.expires_at, 'expires_at');
  assertString(value.purpose, 'purpose', { min: 1, max: 256 });

  if (!Array.isArray(value.artifacts) || value.artifacts.length === 0 || value.artifacts.length > 512) {
    throw new ValidationError('portable trust package requires 1-512 artifacts');
  }

  const seenPaths = new Set();
  for (const [index, rawArtifact] of value.artifacts.entries()) {
    const artifact = exact(rawArtifact, [
      'path',
      'artifact_type',
      'content_digest',
      'source',
      'required',
      'confidentiality'
    ], `artifacts[${index}]`);

    const path = assertString(artifact.path, `artifacts[${index}].path`, { min: 1, max: 512 });
    const pathSegments = path.split('/');
    if (
      path.startsWith('/') ||
      path.includes('\\') ||
      path.includes('\u0000') ||
      pathSegments.some((segment) => segment === '' || segment === '.' || segment === '..')
    ) {
      throw new ValidationError(`artifacts[${index}].path must be relative and traversal-safe`);
    }
    if (seenPaths.has(path)) {
      throw new ValidationError('portable trust package artifact paths must be unique');
    }
    seenPaths.add(path);

    id(artifact.artifact_type, `artifacts[${index}].artifact_type`);
    digest(artifact.content_digest, `artifacts[${index}].content_digest`);
    assertString(artifact.source, `artifacts[${index}].source`, { min: 1, max: 512 });
    if (typeof artifact.required !== 'boolean') {
      throw new ValidationError(`artifacts[${index}].required must be boolean`);
    }
    id(artifact.confidentiality, `artifacts[${index}].confidentiality`);
  }

  if (!Array.isArray(value.signatures) || value.signatures.length === 0 || value.signatures.length > 64) {
    throw new ValidationError('portable trust package requires 1-64 signatures');
  }

  for (const [index, rawSignature] of value.signatures.entries()) {
    const signature = exact(rawSignature, [
      'signer_id',
      'key_id',
      'signature_profile',
      'signed_manifest_digest',
      'verified'
    ], `signatures[${index}]`);
    id(signature.signer_id, `signatures[${index}].signer_id`);
    id(signature.key_id, `signatures[${index}].key_id`);
    id(signature.signature_profile, `signatures[${index}].signature_profile`);
    digest(signature.signed_manifest_digest, `signatures[${index}].signed_manifest_digest`);
    if (signature.verified !== true) {
      throw new ValidationError(`signatures[${index}] must be verified before import admission`);
    }
  }

  if (!Array.isArray(value.witnesses) || value.witnesses.length > 64) {
    throw new ValidationError('portable trust package witnesses must contain at most 64 entries');
  }
  for (const [index, rawWitness] of value.witnesses.entries()) {
    const witness = exact(rawWitness, [
      'witness_id',
      'witness_type',
      'statement_digest',
      'verified'
    ], `witnesses[${index}]`);
    id(witness.witness_id, `witnesses[${index}].witness_id`);
    id(witness.witness_type, `witnesses[${index}].witness_type`);
    digest(witness.statement_digest, `witnesses[${index}].statement_digest`);
    if (typeof witness.verified !== 'boolean') {
      throw new ValidationError(`witnesses[${index}].verified must be boolean`);
    }
  }

  const importPolicy = exact(value.import_policy, [
    'default_state',
    'requires_quarantine_scan',
    'requires_local_review',
    'requires_fresh_policy_check',
    'max_package_age_seconds'
  ], 'import_policy');

  id(importPolicy.default_state, 'import_policy.default_state');
  if (importPolicy.default_state !== 'quarantined_inert') {
    throw new ValidationError('portable trust package default import state must be quarantined_inert');
  }
  for (const field of [
    'requires_quarantine_scan',
    'requires_local_review',
    'requires_fresh_policy_check'
  ]) {
    if (importPolicy[field] !== true) {
      throw new ValidationError(`import_policy.${field} must be true`);
    }
  }
  if (!Number.isInteger(importPolicy.max_package_age_seconds) || importPolicy.max_package_age_seconds <= 0) {
    throw new ValidationError('import_policy.max_package_age_seconds must be a positive integer');
  }

  const authority = exact(value.authority, [
    'signature_grants_authority',
    'witness_grants_authority',
    'import_grants_authority',
    'installation_grants_authority',
    'activation_requires_local_admission'
  ], 'authority');

  for (const field of [
    'signature_grants_authority',
    'witness_grants_authority',
    'import_grants_authority',
    'installation_grants_authority'
  ]) {
    if (authority[field] !== false) {
      throw new ValidationError(`authority.${field} must be false`);
    }
  }
  if (authority.activation_requires_local_admission !== true) {
    throw new ValidationError('authority.activation_requires_local_admission must be true');
  }

  const limitations = assertStringArray(value.limitations, 'limitations', {
    maxItems: 64,
    itemMax: 512
  });
  if (limitations.length === 0) {
    throw new ValidationError('portable trust package must declare limitations');
  }

  const nowMs = now instanceof Date ? now.valueOf() : new Date(now).valueOf();
  if (!Number.isFinite(nowMs)) throw new ValidationError('now is invalid');
  const createdMs = new Date(createdAt).valueOf();
  const expiresMs = new Date(expiresAt).valueOf();
  if (expiresMs <= createdMs) {
    throw new ValidationError('expires_at must follow created_at');
  }
  const packageAgeMs = nowMs - createdMs;

  const checks = Object.freeze({
    not_expired: expiresMs > nowMs,
    age_within_policy:
      packageAgeMs >= 0 &&
      packageAgeMs <= importPolicy.max_package_age_seconds * 1000,
    signatures_verified: value.signatures.every(({ verified }) => verified === true)
  });

  return Object.freeze({
    valid_for_quarantine_import: Object.values(checks).every(Boolean),
    checks,
    package_id: value.package_id,
    import_state: 'quarantined_inert',
    authority_effect: 'none',
    next_required_steps: Object.freeze([
      'quarantine_scan',
      'local_review',
      'fresh_policy_check',
      'explicit_admission'
    ])
  });
}
