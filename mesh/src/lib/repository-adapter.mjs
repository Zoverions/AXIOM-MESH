import {
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject
} from './canonical.mjs';
import {
  SOURCE_CONTENT_ADDRESS_PROFILE,
  SOURCE_REPLICA_OBSERVATION_SCHEMA,
  normalizeSourceReplicaObservation,
  normalizeSourceState
} from './source-continuity.mjs';

export const REPOSITORY_ADAPTER_SCHEMA = 'axiom-repository-adapter.v1';
export const REPOSITORY_ADAPTER_OPERATION_SCHEMA = 'axiom-repository-adapter-operation.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const GIT_SHA1 = /^[a-f0-9]{40}$/;
const GIT_SHA256 = /^[a-f0-9]{64}$/;
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
const OPERATIONS = Object.freeze([
  'base.observe',
  'file.observe',
  'candidate.compare',
  'branch.ensure',
  'file.write',
  'review.ensure',
  'mirror.fetch',
  'mirror.publish'
]);
const OPERATION_SET = new Set(OPERATIONS);

function rejectUnknown(value, allowed, name) {
  const unknown = Object.keys(value).filter(key => !allowed.has(key));
  if (unknown.length) {
    throw new ValidationError(`${name} contains unsupported fields: ${unknown.join(', ')}`);
  }
}

function id(value, name) {
  return assertString(value, name, { min: 1, max: 192, pattern: ID });
}

function digest(value, name) {
  return assertString(value, name, { min: 64, max: 64, pattern: DIGEST });
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

function normalizedOperations(raw) {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > OPERATIONS.length) {
    throw new ValidationError('repository adapter operations must be a non-empty bounded array');
  }
  const values = raw.map((value, index) => assertString(
    value,
    `operations[${index}]`,
    { min: 1, max: 64 }
  ));
  if (values.some(value => !OPERATION_SET.has(value))) {
    throw new ValidationError('repository adapter declares an unsupported operation');
  }
  if (new Set(values).size !== values.length) {
    throw new ValidationError('repository adapter operations must be unique');
  }
  return [...values].sort();
}

export function normalizeRepositoryAdapterDescriptor(raw) {
  const value = assertPlainObject(raw, 'repository adapter descriptor');
  rejectUnknown(value, new Set([
    'schema',
    'adapter_id',
    'repository_id',
    'transport',
    'locator',
    'vcs',
    'object_format',
    'operations',
    'source_identity_authority',
    'lineage_acceptance_authority',
    'credentials_are_identity',
    'provider_metadata_is_authority',
    'operation_authority_required',
    'descriptor_digest'
  ]), 'repository adapter descriptor');
  if (value.schema !== REPOSITORY_ADAPTER_SCHEMA) {
    throw new ValidationError(`repository adapter schema must be ${REPOSITORY_ADAPTER_SCHEMA}`);
  }
  if (!TRANSPORTS.has(value.transport)) {
    throw new ValidationError('repository adapter transport is unsupported');
  }
  if (value.vcs !== 'git') {
    throw new ValidationError('repository adapter vcs must be git in v1');
  }
  if (!['sha1', 'sha256'].includes(value.object_format)) {
    throw new ValidationError('repository adapter Git object format must be sha1 or sha256');
  }
  if (
    value.source_identity_authority !== false
    || value.lineage_acceptance_authority !== false
    || value.credentials_are_identity !== false
    || value.provider_metadata_is_authority !== false
    || value.operation_authority_required !== true
  ) {
    throw new ValidationError('repository adapter authority boundary is weakened');
  }
  const body = {
    schema: REPOSITORY_ADAPTER_SCHEMA,
    adapter_id: id(value.adapter_id, 'adapter_id'),
    repository_id: id(value.repository_id, 'repository_id'),
    transport: value.transport,
    locator: assertString(value.locator, 'locator', { min: 1, max: 2048 }),
    vcs: 'git',
    object_format: value.object_format,
    operations: normalizedOperations(value.operations),
    source_identity_authority: false,
    lineage_acceptance_authority: false,
    credentials_are_identity: false,
    provider_metadata_is_authority: false,
    operation_authority_required: true
  };
  const descriptorDigest = digestObject(body);
  if (
    value.descriptor_digest !== undefined
    && digest(value.descriptor_digest, 'descriptor_digest') !== descriptorDigest
  ) {
    throw new ValidationError('repository adapter descriptor digest is invalid');
  }
  return { ...body, descriptor_digest: descriptorDigest };
}

export function normalizeRepositoryAdapterOperation(raw) {
  const value = assertPlainObject(raw, 'repository adapter operation');
  rejectUnknown(value, new Set([
    'schema',
    'adapter_digest',
    'repository_id',
    'operation',
    'authority_digest',
    'request_digest',
    'issued_at',
    'expires_at',
    'operation_digest'
  ]), 'repository adapter operation');
  if (value.schema !== REPOSITORY_ADAPTER_OPERATION_SCHEMA) {
    throw new ValidationError(
      `repository adapter operation schema must be ${REPOSITORY_ADAPTER_OPERATION_SCHEMA}`
    );
  }
  if (!OPERATION_SET.has(value.operation)) {
    throw new ValidationError('repository adapter operation is unsupported');
  }
  const issuedAt = iso(value.issued_at, 'issued_at');
  const expiresAt = iso(value.expires_at, 'expires_at');
  const issuedMs = new Date(issuedAt).valueOf();
  const expiresMs = new Date(expiresAt).valueOf();
  if (expiresMs <= issuedMs || expiresMs - issuedMs > 15 * 60_000) {
    throw new ValidationError('repository adapter operation lifetime must be positive and at most 15 minutes');
  }
  const body = {
    schema: REPOSITORY_ADAPTER_OPERATION_SCHEMA,
    adapter_digest: digest(value.adapter_digest, 'adapter_digest'),
    repository_id: id(value.repository_id, 'repository_id'),
    operation: value.operation,
    authority_digest: digest(value.authority_digest, 'authority_digest'),
    request_digest: digest(value.request_digest, 'request_digest'),
    issued_at: issuedAt,
    expires_at: expiresAt
  };
  const operationDigest = digestObject(body);
  if (
    value.operation_digest !== undefined
    && digest(value.operation_digest, 'operation_digest') !== operationDigest
  ) {
    throw new ValidationError('repository adapter operation digest is invalid');
  }
  return { ...body, operation_digest: operationDigest };
}

export function authorizeRepositoryAdapterOperation({ descriptor, operation, now = new Date().toISOString() }) {
  const adapter = normalizeRepositoryAdapterDescriptor(descriptor);
  const requested = normalizeRepositoryAdapterOperation(operation);
  if (requested.adapter_digest !== adapter.descriptor_digest) {
    throw new ValidationError('repository adapter operation is bound to a different adapter');
  }
  if (requested.repository_id !== adapter.repository_id) {
    throw new ValidationError('repository adapter operation is bound to a different repository');
  }
  if (!adapter.operations.includes(requested.operation)) {
    throw new ValidationError('repository adapter operation exceeds the adapter capability ceiling');
  }
  if (new Date(requested.expires_at).valueOf() <= new Date(iso(now, 'now')).valueOf()) {
    throw new ValidationError('repository adapter operation is expired');
  }
  return {
    allowed_by_adapter_ceiling: true,
    execution_authorized: false,
    authority_digest: requested.authority_digest,
    operation_digest: requested.operation_digest,
    adapter_digest: adapter.descriptor_digest
  };
}

export function buildRepositoryAdapterReplicaObservation({
  descriptor,
  source_state,
  observed_commit_oid = null,
  object_complete,
  digest_verified,
  status,
  observed_at = new Date().toISOString()
}) {
  const adapter = normalizeRepositoryAdapterDescriptor(descriptor);
  const state = normalizeSourceState(source_state);
  if (adapter.repository_id !== state.repository_id) {
    throw new ValidationError('repository adapter and source state use different logical repository ids');
  }
  if (adapter.object_format !== state.object_format) {
    throw new ValidationError('repository adapter and source state Git object formats differ');
  }
  const observedCommit = observed_commit_oid === null
    ? null
    : gitOid(observed_commit_oid, adapter.object_format, 'observed_commit_oid');
  return normalizeSourceReplicaObservation({
    schema: SOURCE_REPLICA_OBSERVATION_SCHEMA,
    repository_id: state.repository_id,
    source_state_digest: state.state_digest,
    replica_id: adapter.adapter_id,
    transport: adapter.transport,
    locator: adapter.locator,
    object_format: adapter.object_format,
    observed_commit_oid: observedCommit,
    object_complete: object_complete === true,
    digest_verified: digest_verified === true,
    status,
    observed_at,
    non_authoritative: true,
    content_address_profile: SOURCE_CONTENT_ADDRESS_PROFILE
  });
}

export function repositoryAdapterSupports(descriptor, operation) {
  const adapter = normalizeRepositoryAdapterDescriptor(descriptor);
  if (!OPERATION_SET.has(operation)) return false;
  return adapter.operations.includes(operation);
}

export const REPOSITORY_ADAPTER_OPERATIONS = OPERATIONS;
