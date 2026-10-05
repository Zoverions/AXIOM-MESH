import {
  ValidationError,
  assertPlainObject,
  assertString,
  assertStringArray
} from './canonical.mjs';

export const INSTITUTIONAL_TRANSPARENCY_MANIFEST_SCHEMA =
  'axiom-institutional-transparency-manifest.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const CLASSES = new Set([
  'public_inspectable',
  'independently_verifiable',
  'selectively_disclosed',
  'confidential_auditable',
  'opaque_dependency'
]);

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
  const d = new Date(text);
  if (Number.isNaN(d.valueOf()) || d.toISOString() !== text) {
    throw new ValidationError(`${label} must be canonical UTC ISO`);
  }
  return text;
}

export function validateInstitutionalTransparencyManifest(raw, { now = new Date() } = {}) {
  const value = exact(raw, [
    'schema',
    'manifest_id',
    'subject_id',
    'subject_version',
    'published_at',
    'expires_at',
    'surfaces',
    'change_control',
    'external_dependencies',
    'limitations',
    'authority'
  ], 'institutional transparency manifest');

  if (value.schema !== INSTITUTIONAL_TRANSPARENCY_MANIFEST_SCHEMA) {
    throw new ValidationError('institutional transparency manifest schema is invalid');
  }

  id(value.manifest_id, 'manifest_id');
  id(value.subject_id, 'subject_id');
  assertString(value.subject_version, 'subject_version', { min: 1, max: 128 });
  const publishedAt = timestamp(value.published_at, 'published_at');
  const expiresAt = timestamp(value.expires_at, 'expires_at');
  if (new Date(expiresAt).valueOf() <= new Date(publishedAt).valueOf()) {
    throw new ValidationError('expires_at must be after published_at');
  }

  if (!Array.isArray(value.surfaces) || value.surfaces.length === 0 || value.surfaces.length > 128) {
    throw new ValidationError('transparency manifest requires 1-128 surfaces');
  }

  const surfaceIds = new Set();
  for (const [index, rawSurface] of value.surfaces.entries()) {
    const surface = exact(rawSurface, [
      'surface_id',
      'class',
      'claim',
      'artifact_refs',
      'evidence_digests',
      'reviewer_or_witness_refs',
      'currentness_checked_at',
      'unresolved_assumptions'
    ], `surfaces[${index}]`);

    const surfaceId = id(surface.surface_id, `surfaces[${index}].surface_id`);
    if (surfaceIds.has(surfaceId)) throw new ValidationError('surface IDs must be unique');
    surfaceIds.add(surfaceId);

    const klass = id(surface.class, `surfaces[${index}].class`);
    if (!CLASSES.has(klass)) throw new ValidationError('transparency class is invalid');

    assertString(surface.claim, `surfaces[${index}].claim`, { min: 1, max: 4096 });
    assertStringArray(surface.artifact_refs, `surfaces[${index}].artifact_refs`, {
      maxItems: 128, itemMax: 512
    });
    const evidence = assertStringArray(surface.evidence_digests, `surfaces[${index}].evidence_digests`, {
      maxItems: 128, itemMax: 64
    });
    for (const [i, item] of evidence.entries()) {
      digest(item, `surfaces[${index}].evidence_digests[${i}]`);
    }
    assertStringArray(surface.reviewer_or_witness_refs, `surfaces[${index}].reviewer_or_witness_refs`, {
      maxItems: 128, itemMax: 512
    });
    timestamp(surface.currentness_checked_at, `surfaces[${index}].currentness_checked_at`);
    const unresolved = assertStringArray(surface.unresolved_assumptions, `surfaces[${index}].unresolved_assumptions`, {
      maxItems: 128, itemMax: 1024
    });

    if (klass === 'opaque_dependency' && unresolved.length === 0) {
      throw new ValidationError('opaque dependency must declare unresolved assumptions');
    }

    if (
      klass === 'independently_verifiable' &&
      surface.artifact_refs.length === 0 &&
      evidence.length === 0
    ) {
      throw new ValidationError('independently verifiable surface requires artifact or evidence references');
    }
  }

  const change = exact(value.change_control, [
    'policy_or_charter_ref',
    'upgrade_authority_refs',
    'emergency_change_refs',
    'change_evidence_digest'
  ], 'change_control');
  assertString(change.policy_or_charter_ref, 'change_control.policy_or_charter_ref', { min: 1, max: 512 });
  const upgradeRefs = assertStringArray(change.upgrade_authority_refs, 'change_control.upgrade_authority_refs', {
    maxItems: 64, itemMax: 512
  });
  if (upgradeRefs.length === 0) throw new ValidationError('change control requires upgrade authority refs');
  assertStringArray(change.emergency_change_refs, 'change_control.emergency_change_refs', {
    maxItems: 64, itemMax: 512
  });
  digest(change.change_evidence_digest, 'change_control.change_evidence_digest');

  if (!Array.isArray(value.external_dependencies) || value.external_dependencies.length > 128) {
    throw new ValidationError('external_dependencies must be an array with at most 128 entries');
  }
  for (const [index, rawDependency] of value.external_dependencies.entries()) {
    const dependency = exact(rawDependency, [
      'dependency_id',
      'role',
      'transparency_class',
      'replaceable',
      'trust_assumptions'
    ], `external_dependencies[${index}]`);
    id(dependency.dependency_id, `external_dependencies[${index}].dependency_id`);
    assertString(dependency.role, `external_dependencies[${index}].role`, { min: 1, max: 1024 });
    const klass = id(dependency.transparency_class, `external_dependencies[${index}].transparency_class`);
    if (!CLASSES.has(klass)) throw new ValidationError('external dependency transparency class is invalid');
    if (typeof dependency.replaceable !== 'boolean') {
      throw new ValidationError(`external_dependencies[${index}].replaceable must be boolean`);
    }
    const assumptions = assertStringArray(dependency.trust_assumptions, `external_dependencies[${index}].trust_assumptions`, {
      maxItems: 128, itemMax: 1024
    });
    if (klass === 'opaque_dependency' && assumptions.length === 0) {
      throw new ValidationError('opaque external dependency must declare trust assumptions');
    }
  }

  const limitations = assertStringArray(value.limitations, 'limitations', {
    maxItems: 128, itemMax: 1024
  });
  if (limitations.length === 0) throw new ValidationError('transparency manifest must declare limitations');

  const authority = exact(value.authority, [
    'transparency_grants_authority',
    'audit_grants_authority',
    'witness_grants_authority'
  ], 'authority');
  for (const [field, actual] of Object.entries(authority)) {
    if (actual !== false) throw new ValidationError(`authority.${field} must be false`);
  }

  const nowMs = now instanceof Date ? now.valueOf() : new Date(now).valueOf();
  if (!Number.isFinite(nowMs)) throw new ValidationError('now is invalid');

  return Object.freeze({
    valid: new Date(expiresAt).valueOf() > nowMs,
    manifest_id: value.manifest_id,
    subject_id: value.subject_id,
    surface_count: value.surfaces.length,
    authority_effect: 'none',
    trust_effect: 'claim_specific_evidence_only'
  });
}
