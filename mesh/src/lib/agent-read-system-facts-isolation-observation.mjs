import {
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject
} from './canonical.mjs';
import {
  AGENT_READ_SYSTEM_FACTS_ISOLATION_POLICY,
  AGENT_READ_SYSTEM_FACTS_ISOLATION_POLICY_DIGEST
} from './agent-read-system-facts-effect-admission.mjs';

export const AGENT_READ_SYSTEM_FACTS_ISOLATION_OBSERVATION_SCHEMA =
  'axiom-agent-read-system-facts-isolation-observation.v1';

const SHA1 = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const IMAGE_ID = /^sha256:[a-f0-9]{64}$/;
const WRITE_DENIED = new Set(['EROFS', 'EACCES', 'EPERM']);
const NETWORK_DENIED = new Set(['ENETUNREACH', 'EHOSTUNREACH', 'EACCES', 'EPERM']);

const TOP_KEYS = new Set([
  'schema', 'repository', 'revision', 'observed_at', 'observation_environment',
  'policy_id', 'policy_revision', 'policy_digest', 'docker_binary',
  'docker_server_version', 'image_tag', 'image_id', 'container_configuration',
  'evidence', 'claims', 'observation_digest'
]);
const CONFIG_KEYS = new Set([
  'network_mode', 'read_only_root', 'bind_mount_count', 'capabilities_drop',
  'no_new_privileges', 'user', 'pids_limit', 'memory_bytes', 'cpu_quota'
]);
const EVIDENCE_KEYS = new Set([
  'uid', 'cap_eff', 'no_new_privs', 'seccomp', 'workspace_write_succeeded',
  'root_write_error', 'docker_socket_present', 'public_network_error',
  'memory_max', 'pids_max', 'cpu_quota', 'cpu_period', 'cleanup_verified'
]);
const POSITIVE_CLAIMS = Object.freeze([
  'non_root_uid_observed',
  'zero_effective_capabilities_observed',
  'no_new_privileges_observed',
  'seccomp_filter_observed',
  'network_denial_observed',
  'root_write_denial_observed',
  'disposable_workspace_write_observed',
  'docker_socket_absence_observed',
  'memory_limit_observed',
  'pid_limit_observed',
  'cpu_limit_observed',
  'cleanup_observed'
]);
const NEGATIVE_CLAIMS = Object.freeze([
  'physical_device_proof',
  'globally_verified_isolation',
  'arbitrary_repository_code_isolation_verified',
  'general_executor_authority',
  'production_executor_ready',
  'network_authority',
  'credential_authority',
  'secret_authority',
  'remote_hardware_authority',
  'deployment_authority',
  'capability_promotion_authority',
  'authority_granted'
]);
const CLAIM_KEYS = new Set([...POSITIVE_CLAIMS, ...NEGATIVE_CLAIMS]);

function exactObject(raw, allowed, label) {
  const value = assertPlainObject(raw, label);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ValidationError(`${label} contains unsupported field ${key}`);
  }
  for (const key of allowed) {
    if (!Object.hasOwn(value, key)) throw new ValidationError(`${label} is missing required field ${key}`);
  }
  return value;
}

function integer(value, label, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ValidationError(`${label} is invalid`);
  }
  return value;
}

function timestamp(value, label) {
  const text = assertString(value, label, { min: 24, max: 24 });
  const parsed = new Date(text);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== text) {
    throw new ValidationError(`${label} must be canonical UTC`);
  }
  return text;
}

function normalizeClaims(raw) {
  exactObject(raw, CLAIM_KEYS, 'read-system-facts isolation claims');
  for (const key of POSITIVE_CLAIMS) {
    if (raw[key] !== true) {
      throw new ValidationError(`read-system-facts isolation must retain observed claim ${key}`);
    }
  }
  for (const key of NEGATIVE_CLAIMS) {
    if (raw[key] !== false) {
      throw new ValidationError(`read-system-facts isolation attempts to elevate ${key}`);
    }
  }
  return Object.freeze({
    ...Object.fromEntries(POSITIVE_CLAIMS.map(key => [key, true])),
    ...Object.fromEntries(NEGATIVE_CLAIMS.map(key => [key, false]))
  });
}

function normalizeConfiguration(raw) {
  exactObject(raw, CONFIG_KEYS, 'read-system-facts isolation container configuration');
  const policy = AGENT_READ_SYSTEM_FACTS_ISOLATION_POLICY;
  const config = Object.freeze({
    network_mode: raw.network_mode,
    read_only_root: raw.read_only_root,
    bind_mount_count: integer(raw.bind_mount_count, 'isolation bind mount count', { min: 0, max: 32 }),
    capabilities_drop: raw.capabilities_drop,
    no_new_privileges: raw.no_new_privileges,
    user: raw.user,
    pids_limit: integer(raw.pids_limit, 'isolation PID limit', { min: 1 }),
    memory_bytes: integer(raw.memory_bytes, 'isolation memory limit', { min: 1 }),
    cpu_quota: raw.cpu_quota
  });
  if (
    config.network_mode !== policy.network.mode
    || config.read_only_root !== policy.filesystem.read_only_root
    || config.bind_mount_count !== 0
    || config.capabilities_drop !== policy.privilege.capabilities_drop
    || config.no_new_privileges !== policy.privilege.no_new_privileges
    || config.user !== policy.privilege.uid_gid
    || config.pids_limit !== policy.limits.pids
    || config.memory_bytes !== policy.limits.memory_bytes
    || config.cpu_quota !== policy.limits.cpu_quota
  ) {
    throw new ValidationError('read-system-facts isolation container configuration does not match fixed policy');
  }
  return config;
}

function normalizeEvidence(raw) {
  exactObject(raw, EVIDENCE_KEYS, 'read-system-facts isolation evidence');
  const evidence = Object.freeze({
    uid: integer(raw.uid, 'isolation uid', { min: 0, max: 2 ** 31 - 1 }),
    cap_eff: assertString(raw.cap_eff, 'isolation cap_eff', { min: 16, max: 16 }),
    no_new_privs: integer(raw.no_new_privs, 'isolation no_new_privs', { min: 0, max: 1 }),
    seccomp: integer(raw.seccomp, 'isolation seccomp', { min: 0, max: 2 }),
    workspace_write_succeeded: raw.workspace_write_succeeded,
    root_write_error: assertString(raw.root_write_error, 'isolation root_write_error', { min: 1, max: 32 }),
    docker_socket_present: raw.docker_socket_present,
    public_network_error: assertString(raw.public_network_error, 'isolation public_network_error', { min: 1, max: 64 }),
    memory_max: integer(raw.memory_max, 'isolation memory_max', { min: 1 }),
    pids_max: integer(raw.pids_max, 'isolation pids_max', { min: 1 }),
    cpu_quota: integer(raw.cpu_quota, 'isolation cpu quota', { min: 1 }),
    cpu_period: integer(raw.cpu_period, 'isolation cpu period', { min: 1 }),
    cleanup_verified: raw.cleanup_verified
  });
  if (evidence.uid !== 10001) throw new ValidationError('read-system-facts isolation UID mismatch');
  if (evidence.cap_eff !== '0000000000000000') throw new ValidationError('read-system-facts isolation capabilities are not zero');
  if (evidence.no_new_privs !== 1) throw new ValidationError('read-system-facts isolation no-new-privileges was not observed');
  if (evidence.seccomp !== 2) throw new ValidationError('read-system-facts isolation seccomp filter was not observed');
  if (evidence.workspace_write_succeeded !== true) throw new ValidationError('read-system-facts isolation workspace write was not observed');
  if (!WRITE_DENIED.has(evidence.root_write_error)) throw new ValidationError('read-system-facts isolation root write did not fail closed');
  if (evidence.docker_socket_present !== false) throw new ValidationError('read-system-facts isolation Docker socket is visible');
  if (!NETWORK_DENIED.has(evidence.public_network_error)) throw new ValidationError('read-system-facts isolation public network denial is ambiguous');
  if (evidence.memory_max !== AGENT_READ_SYSTEM_FACTS_ISOLATION_POLICY.limits.memory_bytes) {
    throw new ValidationError('read-system-facts isolation memory ceiling mismatch');
  }
  if (evidence.pids_max !== AGENT_READ_SYSTEM_FACTS_ISOLATION_POLICY.limits.pids) {
    throw new ValidationError('read-system-facts isolation PID ceiling mismatch');
  }
  if (Math.abs((evidence.cpu_quota / evidence.cpu_period) - AGENT_READ_SYSTEM_FACTS_ISOLATION_POLICY.limits.cpu_quota) > 0.01) {
    throw new ValidationError('read-system-facts isolation CPU ceiling mismatch');
  }
  if (evidence.cleanup_verified !== true) throw new ValidationError('read-system-facts isolation cleanup was not observed');
  return evidence;
}

function normalize(raw, { expectedRevision } = {}) {
  exactObject(raw, TOP_KEYS, 'read-system-facts isolation observation');
  if (raw.schema !== AGENT_READ_SYSTEM_FACTS_ISOLATION_OBSERVATION_SCHEMA) {
    throw new ValidationError(`read-system-facts isolation schema must be ${AGENT_READ_SYSTEM_FACTS_ISOLATION_OBSERVATION_SCHEMA}`);
  }
  if (raw.repository !== 'Zoverions/AXIOM-MESH') throw new ValidationError('read-system-facts isolation repository mismatch');
  const revision = assertString(raw.revision, 'read-system-facts isolation revision', { min: 40, max: 40, pattern: SHA1 });
  if (expectedRevision !== undefined && revision !== expectedRevision) {
    throw new ValidationError('read-system-facts isolation revision mismatch');
  }
  if (raw.observation_environment !== 'hosted-ci') throw new ValidationError('read-system-facts isolation observation environment mismatch');
  if (
    raw.policy_id !== AGENT_READ_SYSTEM_FACTS_ISOLATION_POLICY.policy_id
    || raw.policy_revision !== AGENT_READ_SYSTEM_FACTS_ISOLATION_POLICY.revision
    || raw.policy_digest !== AGENT_READ_SYSTEM_FACTS_ISOLATION_POLICY_DIGEST
  ) {
    throw new ValidationError('read-system-facts isolation policy binding mismatch');
  }
  if (raw.docker_binary !== AGENT_READ_SYSTEM_FACTS_ISOLATION_POLICY.docker_binary) {
    throw new ValidationError('read-system-facts isolation Docker binary mismatch');
  }
  const dockerServerVersion = assertString(raw.docker_server_version, 'isolation Docker server version', { min: 1, max: 128 });
  if (raw.image_tag !== AGENT_READ_SYSTEM_FACTS_ISOLATION_POLICY.image.tag) {
    throw new ValidationError('read-system-facts isolation image tag mismatch');
  }
  const imageId = assertString(raw.image_id, 'read-system-facts isolation image id', { min: 71, max: 71, pattern: IMAGE_ID });
  const config = normalizeConfiguration(raw.container_configuration);
  const evidence = normalizeEvidence(raw.evidence);
  const claims = normalizeClaims(raw.claims);
  return Object.freeze({
    schema: AGENT_READ_SYSTEM_FACTS_ISOLATION_OBSERVATION_SCHEMA,
    repository: 'Zoverions/AXIOM-MESH',
    revision,
    observed_at: timestamp(raw.observed_at, 'read-system-facts isolation observed_at'),
    observation_environment: 'hosted-ci',
    policy_id: AGENT_READ_SYSTEM_FACTS_ISOLATION_POLICY.policy_id,
    policy_revision: AGENT_READ_SYSTEM_FACTS_ISOLATION_POLICY.revision,
    policy_digest: AGENT_READ_SYSTEM_FACTS_ISOLATION_POLICY_DIGEST,
    docker_binary: AGENT_READ_SYSTEM_FACTS_ISOLATION_POLICY.docker_binary,
    docker_server_version: dockerServerVersion,
    image_tag: AGENT_READ_SYSTEM_FACTS_ISOLATION_POLICY.image.tag,
    image_id: imageId,
    container_configuration: config,
    evidence,
    claims
  });
}

export function createAgentReadSystemFactsIsolationObservation(raw, options = {}) {
  const normalized = normalize({ ...raw, observation_digest: '0'.repeat(64) }, options);
  const observationDigest = digestObject(normalized);
  return Object.freeze({ ...normalized, observation_digest: observationDigest });
}

export function verifyAgentReadSystemFactsIsolationObservation(raw, options = {}) {
  const normalized = normalize(raw, options);
  const observationDigest = assertString(raw.observation_digest, 'read-system-facts isolation observation_digest', {
    min: 64,
    max: 64,
    pattern: SHA256
  });
  if (observationDigest !== digestObject(normalized)) {
    throw new ValidationError('read-system-facts isolation observation digest mismatch');
  }
  return Object.freeze({ ...normalized, observation_digest: observationDigest });
}
