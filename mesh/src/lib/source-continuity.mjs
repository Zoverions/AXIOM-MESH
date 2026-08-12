import {
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject
} from './canonical.mjs';

export const SOURCE_STATE_SCHEMA = 'axiom-source-state.v1';
export const SOURCE_TRANSITION_SCHEMA = 'axiom-source-transition.v1';
export const SOURCE_REPLICA_OBSERVATION_SCHEMA = 'axiom-source-replica-observation.v1';
export const SOURCE_CONTENT_ADDRESS_PROFILE = 'axiom-canonical-json-sha256.v1';

const DIGEST = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const GIT_SHA1 = /^[a-f0-9]{40}$/;
const GIT_SHA256 = /^[a-f0-9]{64}$/;
const TRANSITION_TYPES = new Set(['genesis', 'advance', 'rollback', 'recovery', 'supersede']);
const TRANSPORTS = new Set([
  'local_git',
  'bare_git',
  'github',
  'forgejo',
  'gitlab',
  'radicle',
  'agent_forge',
  'other'
]);
const REPLICA_STATUSES = new Set([
  'reachable',
  'stale',
  'divergent',
  'unavailable',
  'compromised'
]);

function rejectUnknown(value, allowed, name) {
  const unknown = Object.keys(value).filter(key => !allowed.has(key));
  if (unknown.length) {
    throw new ValidationError(`${name} contains unsupported fields: ${unknown.join(', ')}`);
  }
}

function digest(value, name) {
  return assertString(value, name, { min: 64, max: 64, pattern: DIGEST });
}

function id(value, name) {
  return assertString(value, name, { min: 1, max: 192, pattern: ID });
}

function iso(value, name) {
  const raw = assertString(value, name, { min: 1, max: 64 });
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.valueOf())) throw new ValidationError(`${name} must be an ISO timestamp`);
  return parsed.toISOString();
}

function gitOid(value, objectFormat, name) {
  const pattern = objectFormat === 'sha1' ? GIT_SHA1 : GIT_SHA256;
  const length = objectFormat === 'sha1' ? 40 : 64;
  return assertString(value, name, { min: length, max: length, pattern });
}

function contentAddress(body, prefix, suppliedId, suppliedDigest) {
  const objectDigest = digestObject(body);
  const objectId = `${prefix}:${objectDigest}`;
  if (suppliedDigest !== undefined && digest(suppliedDigest, `${prefix}_digest`) !== objectDigest) {
    throw new ValidationError(`${prefix} digest does not match canonical content`);
  }
  if (suppliedId !== undefined && assertString(suppliedId, `${prefix}_id`, { max: 256 }) !== objectId) {
    throw new ValidationError(`${prefix} id does not match canonical content`);
  }
  return { objectId, objectDigest };
}

function normalizeBuild(raw) {
  const value = assertPlainObject(raw, 'source build binding');
  rejectUnknown(value, new Set([
    'kernel_version',
    'capability_registry_digest',
    'capability_evidence_digest',
    'release_boundary_digest',
    'build_digest'
  ]), 'source build binding');
  const body = {
    kernel_version: assertString(value.kernel_version, 'build.kernel_version', { min: 1, max: 64 }),
    capability_registry_digest: digest(value.capability_registry_digest, 'build.capability_registry_digest'),
    capability_evidence_digest: digest(value.capability_evidence_digest, 'build.capability_evidence_digest'),
    release_boundary_digest: digest(value.release_boundary_digest, 'build.release_boundary_digest')
  };
  const buildDigest = digestObject(body);
  if (value.build_digest !== undefined && digest(value.build_digest, 'build.build_digest') !== buildDigest) {
    throw new ValidationError('source build digest does not match its exact bindings');
  }
  return { ...body, build_digest: buildDigest };
}

export function normalizeSourceState(raw) {
  const value = assertPlainObject(raw, 'source state');
  rejectUnknown(value, new Set([
    'schema',
    'repository_id',
    'vcs',
    'object_format',
    'commit_oid',
    'tree_oid',
    'source_manifest_digest',
    'build',
    'content_address_profile',
    'state_id',
    'state_digest'
  ]), 'source state');
  if (value.schema !== SOURCE_STATE_SCHEMA) {
    throw new ValidationError(`source state schema must be ${SOURCE_STATE_SCHEMA}`);
  }
  if (value.vcs !== 'git') throw new ValidationError('source state vcs must be git in v1');
  if (!['sha1', 'sha256'].includes(value.object_format)) {
    throw new ValidationError('source state Git object format must be sha1 or sha256');
  }
  if (value.content_address_profile !== SOURCE_CONTENT_ADDRESS_PROFILE) {
    throw new ValidationError('source state content-address profile is unsupported');
  }
  const body = {
    schema: SOURCE_STATE_SCHEMA,
    repository_id: id(value.repository_id, 'repository_id'),
    vcs: 'git',
    object_format: value.object_format,
    commit_oid: gitOid(value.commit_oid, value.object_format, 'commit_oid'),
    tree_oid: gitOid(value.tree_oid, value.object_format, 'tree_oid'),
    source_manifest_digest: digest(value.source_manifest_digest, 'source_manifest_digest'),
    build: normalizeBuild(value.build),
    content_address_profile: SOURCE_CONTENT_ADDRESS_PROFILE
  };
  const addressed = contentAddress(body, 'source-state', value.state_id, value.state_digest);
  return {
    ...body,
    state_id: addressed.objectId,
    state_digest: addressed.objectDigest
  };
}

export function normalizeSourceTransition(raw) {
  const value = assertPlainObject(raw, 'source transition');
  rejectUnknown(value, new Set([
    'schema',
    'repository_id',
    'parent_state_digest',
    'child_state_digest',
    'transition_type',
    'sequence',
    'authority_digest',
    'evidence_digest',
    'accepted_at',
    'content_address_profile',
    'transition_id',
    'transition_digest'
  ]), 'source transition');
  if (value.schema !== SOURCE_TRANSITION_SCHEMA) {
    throw new ValidationError(`source transition schema must be ${SOURCE_TRANSITION_SCHEMA}`);
  }
  if (!TRANSITION_TYPES.has(value.transition_type)) {
    throw new ValidationError('source transition type is unsupported');
  }
  if (value.content_address_profile !== SOURCE_CONTENT_ADDRESS_PROFILE) {
    throw new ValidationError('source transition content-address profile is unsupported');
  }
  if (!Number.isSafeInteger(value.sequence) || value.sequence < 0) {
    throw new ValidationError('source transition sequence must be a non-negative safe integer');
  }
  const parentDigest = value.parent_state_digest === null
    ? null
    : digest(value.parent_state_digest, 'parent_state_digest');
  if (value.transition_type === 'genesis') {
    if (parentDigest !== null || value.sequence !== 0) {
      throw new ValidationError('genesis source transition requires null parent and sequence 0');
    }
  } else if (parentDigest === null || value.sequence === 0) {
    throw new ValidationError('non-genesis source transition requires a parent and positive sequence');
  }
  const childDigest = digest(value.child_state_digest, 'child_state_digest');
  if (parentDigest !== null && parentDigest === childDigest) {
    throw new ValidationError('source transition parent and child states must differ');
  }
  const body = {
    schema: SOURCE_TRANSITION_SCHEMA,
    repository_id: id(value.repository_id, 'repository_id'),
    parent_state_digest: parentDigest,
    child_state_digest: childDigest,
    transition_type: value.transition_type,
    sequence: value.sequence,
    authority_digest: digest(value.authority_digest, 'authority_digest'),
    evidence_digest: digest(value.evidence_digest, 'evidence_digest'),
    accepted_at: iso(value.accepted_at, 'accepted_at'),
    content_address_profile: SOURCE_CONTENT_ADDRESS_PROFILE
  };
  const addressed = contentAddress(
    body,
    'source-transition',
    value.transition_id,
    value.transition_digest
  );
  return {
    ...body,
    transition_id: addressed.objectId,
    transition_digest: addressed.objectDigest
  };
}

export function verifySourceTransition({ transition, parent_state = null, child_state }) {
  const normalizedTransition = normalizeSourceTransition(transition);
  const child = normalizeSourceState(child_state);
  if (
    child.repository_id !== normalizedTransition.repository_id
    || child.state_digest !== normalizedTransition.child_state_digest
  ) {
    throw new ValidationError('source transition child state binding is invalid');
  }
  if (normalizedTransition.transition_type === 'genesis') {
    if (parent_state !== null) throw new ValidationError('genesis source transition must not supply a parent state');
  } else {
    if (parent_state === null) throw new ValidationError('non-genesis source transition requires its parent state');
    const parent = normalizeSourceState(parent_state);
    if (
      parent.repository_id !== normalizedTransition.repository_id
      || parent.state_digest !== normalizedTransition.parent_state_digest
    ) {
      throw new ValidationError('source transition parent state binding is invalid');
    }
  }
  return {
    valid: true,
    repository_id: normalizedTransition.repository_id,
    transition_digest: normalizedTransition.transition_digest,
    child_state_digest: child.state_digest,
    authority_granted_by_structure: false
  };
}

export function normalizeSourceReplicaObservation(raw) {
  const value = assertPlainObject(raw, 'source replica observation');
  rejectUnknown(value, new Set([
    'schema',
    'repository_id',
    'source_state_digest',
    'replica_id',
    'transport',
    'locator',
    'object_format',
    'observed_commit_oid',
    'object_complete',
    'digest_verified',
    'status',
    'observed_at',
    'non_authoritative',
    'content_address_profile',
    'observation_id',
    'observation_digest'
  ]), 'source replica observation');
  if (value.schema !== SOURCE_REPLICA_OBSERVATION_SCHEMA) {
    throw new ValidationError(
      `source replica observation schema must be ${SOURCE_REPLICA_OBSERVATION_SCHEMA}`
    );
  }
  if (!TRANSPORTS.has(value.transport)) {
    throw new ValidationError('source replica transport is unsupported');
  }
  if (!REPLICA_STATUSES.has(value.status)) {
    throw new ValidationError('source replica status is unsupported');
  }
  if (!['sha1', 'sha256'].includes(value.object_format)) {
    throw new ValidationError('source replica Git object format must be sha1 or sha256');
  }
  if (value.non_authoritative !== true) {
    throw new ValidationError('source replica observations must remain explicitly non-authoritative');
  }
  if (value.content_address_profile !== SOURCE_CONTENT_ADDRESS_PROFILE) {
    throw new ValidationError('source replica content-address profile is unsupported');
  }
  const observedCommit = value.observed_commit_oid === null
    ? null
    : gitOid(value.observed_commit_oid, value.object_format, 'observed_commit_oid');
  if (
    value.status === 'unavailable'
    && (observedCommit !== null || value.object_complete !== false || value.digest_verified !== false)
  ) {
    throw new ValidationError('unavailable source replica cannot claim observed or verified objects');
  }
  if (value.digest_verified === true && value.object_complete !== true) {
    throw new ValidationError('source replica digest verification requires a complete object set');
  }
  const body = {
    schema: SOURCE_REPLICA_OBSERVATION_SCHEMA,
    repository_id: id(value.repository_id, 'repository_id'),
    source_state_digest: digest(value.source_state_digest, 'source_state_digest'),
    replica_id: id(value.replica_id, 'replica_id'),
    transport: value.transport,
    locator: assertString(value.locator, 'locator', { min: 1, max: 2048 }),
    object_format: value.object_format,
    observed_commit_oid: observedCommit,
    object_complete: value.object_complete === true,
    digest_verified: value.digest_verified === true,
    status: value.status,
    observed_at: iso(value.observed_at, 'observed_at'),
    non_authoritative: true,
    content_address_profile: SOURCE_CONTENT_ADDRESS_PROFILE
  };
  const addressed = contentAddress(
    body,
    'source-replica-observation',
    value.observation_id,
    value.observation_digest
  );
  return {
    ...body,
    observation_id: addressed.objectId,
    observation_digest: addressed.objectDigest
  };
}
