import {
  ValidationError,
  assertPlainObject,
  assertString
} from './canonical.mjs';

export const STUDIO_ARTIFACT_MANIFEST_SCHEMA = 'axiom-studio-artifact-manifest.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;

function exact(raw, keys, label) {
  const value = assertPlainObject(raw, label);
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ValidationError(`${label} contains unsupported field ${key}`);
  }
  for (const key of keys) {
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

function strings(value, label, { min = 0, max = 128 } = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new ValidationError(`${label} must contain ${min}-${max} strings`);
  }
  const out = value.map((entry, index) =>
    assertString(entry, `${label}[${index}]`, { min: 1, max: 256 })
  );
  if (new Set(out).size !== out.length) throw new ValidationError(`${label} must be unique`);
  return Object.freeze(out);
}

export function validateStudioArtifactManifest(raw) {
  const value = exact(raw, [
    'schema','artifact_id','artifact_type','version','content_digest','provenance',
    'protection_profile_ids','verification_profile_ids','deployment_topology_compatibility',
    'required_local_adaptation','installation_grants_authority','publication_grants_authority',
    'activation_requires_local_admission','limitations'
  ], 'Studio artifact manifest');

  if (value.schema !== STUDIO_ARTIFACT_MANIFEST_SCHEMA) {
    throw new ValidationError('Studio artifact manifest schema is invalid');
  }

  id(value.artifact_id, 'Studio artifact artifact_id');
  id(value.artifact_type, 'Studio artifact artifact_type');
  assertString(value.version, 'Studio artifact version', {
    min: 5, max: 32, pattern: /^[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?$/
  });
  digest(value.content_digest, 'Studio artifact content_digest');

  const provenance = exact(value.provenance, [
    'source','author_or_generator','source_version','source_digest'
  ], 'Studio artifact provenance');
  assertString(provenance.source, 'Studio artifact provenance source', { min: 1, max: 512 });
  assertString(provenance.author_or_generator, 'Studio artifact provenance author_or_generator', { min: 1, max: 256 });
  assertString(provenance.source_version, 'Studio artifact provenance source_version', { min: 1, max: 128 });
  digest(provenance.source_digest, 'Studio artifact provenance source_digest');

  strings(value.protection_profile_ids, 'Studio artifact protection_profile_ids', { min: 1 });
  strings(value.verification_profile_ids, 'Studio artifact verification_profile_ids', { min: 1 });
  strings(value.deployment_topology_compatibility, 'Studio artifact deployment_topology_compatibility', { min: 1 });

  if (value.required_local_adaptation !== true) {
    throw new ValidationError('Studio artifact must require explicit local adaptation');
  }
  if (value.installation_grants_authority !== false) {
    throw new ValidationError('Studio artifact installation must grant no authority');
  }
  if (value.publication_grants_authority !== false) {
    throw new ValidationError('Studio artifact publication must grant no authority');
  }
  if (value.activation_requires_local_admission !== true) {
    throw new ValidationError('Studio artifact activation must require local admission');
  }

  strings(value.limitations, 'Studio artifact limitations', { min: 1, max: 64 });

  return Object.freeze({
    valid: true,
    artifact_id: value.artifact_id,
    artifact_type: value.artifact_type,
    authority_effect: 'none',
    activation_requires_local_admission: true
  });
}
