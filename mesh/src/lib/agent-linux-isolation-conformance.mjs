import { ValidationError, digestObject } from './canonical.mjs';
import {
  AGENT_EXECUTOR_ISOLATION_POLICY_CATALOG_DIGEST,
  AGENT_EXECUTOR_ISOLATION_POLICY_CATALOG_SCHEMA
} from './agent-executor-isolation-profile.mjs';

export const AGENT_LINUX_ISOLATION_CONFORMANCE_RECEIPT_SCHEMA =
  'axiom-agent-linux-isolation-conformance-receipt.v1';
export const AGENT_LINUX_ISOLATION_ADAPTER_ID = 'docker-linux-isolation-lab-v1';
export const AGENT_LINUX_ISOLATION_IMAGE_TAG = 'axiom-mesh-kernel:0.12.0-dev.3';
export const AGENT_LINUX_ISOLATION_DOCKER_BINARY = '/usr/bin/docker';
export const AGENT_LINUX_ISOLATION_ENTRYPOINT = '/usr/local/bin/node';

const SHA1 = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const IMAGE_ID = /^sha256:[a-f0-9]{64}$/;
const MAX_DOCUMENT_BYTES = 262_144;
const DENIED_WRITE_CODES = new Set(['EROFS', 'EACCES', 'EPERM']);
const DENIED_NETWORK_CODES = new Set(['ENETUNREACH', 'EHOSTUNREACH', 'EACCES', 'EPERM']);

const RECEIPT_KEYS = new Set([
  'schema', 'repository', 'revision', 'observation_environment', 'platform',
  'policy', 'adapter', 'limits', 'controls', 'evidence', 'probes', 'claims', 'receipt_digest'
]);
const PLATFORM_KEYS = new Set([
  'operating_system', 'architecture', 'kernel_release', 'runner_pid_namespace',
  'runner_mount_namespace', 'runner_network_namespace'
]);
const POLICY_KEYS = new Set(['catalog_schema', 'catalog_digest', 'policy_id', 'revision']);
const ADAPTER_KEYS = new Set([
  'adapter_id', 'docker_binary', 'docker_server_version', 'image_tag', 'image_id', 'entrypoint'
]);
const LIMIT_KEYS = new Set([
  'network_mode', 'read_only_root', 'capabilities_dropped', 'no_new_privileges',
  'uid_gid', 'pids', 'memory_bytes', 'cpu_quota', 'probe_timeout_ms', 'max_output_bytes'
]);
const CONTROL_KEYS = Object.freeze([
  'pid_namespace_separated',
  'mount_namespace_separated',
  'network_namespace_separated',
  'effective_capabilities_zero',
  'no_new_privileges_active',
  'seccomp_filter_active',
  'disposable_workspace_writable',
  'container_root_write_denied',
  'symlink_write_escape_denied',
  'docker_socket_absent',
  'host_sentinel_absent',
  'secret_mount_absent',
  'public_network_denied',
  'memory_limit_observed',
  'pid_limit_observed',
  'cpu_limit_observed',
  'pid_exhaustion_bounded',
  'timeout_cleanup_verified',
  'output_overflow_cleanup_verified'
]);
const CONTROL_KEY_SET = new Set(CONTROL_KEYS);
const EVIDENCE_KEYS = new Set(['baseline', 'pid_ceiling', 'timeout_cleanup', 'output_ceiling']);
const BASELINE_KEYS = new Set([
  'container_pid_namespace', 'container_mount_namespace', 'container_network_namespace',
  'uid', 'cap_eff', 'no_new_privs', 'seccomp', 'root_read_only',
  'workspace_write_succeeded', 'root_write_error', 'symlink_write_error',
  'docker_socket_present', 'host_sentinel_present', 'secret_mount_present',
  'public_network_error', 'memory_max', 'pids_max', 'cpu_quota', 'cpu_period',
  'fd_count', 'unexpected_sensitive_fd', 'mount_digest'
]);
const PID_CEILING_KEYS = new Set(['requested', 'started', 'blocked', 'container_absent_after_cleanup']);
const TIMEOUT_KEYS = new Set(['timed_out', 'container_absent_after_cleanup']);
const OUTPUT_KEYS = new Set(['overflow_detected', 'output_limit_bytes', 'container_absent_after_cleanup']);
const PROBE_KEYS = new Set(['probe_id', 'status', 'observation_digest']);
const REQUIRED_PROBES = Object.freeze([
  ['baseline', 'baseline'],
  ['pid-ceiling', 'pid_ceiling'],
  ['timeout-cleanup', 'timeout_cleanup'],
  ['output-ceiling', 'output_ceiling']
]);
const POSITIVE_CLAIMS = Object.freeze([
  'fixed_probe_real_process_effects_observed',
  'fixed_probe_disposable_filesystem_effects_observed',
  'tested_linux_kernel_controls_observed',
  'tested_network_denial_observed'
]);
const NEGATIVE_CLAIMS = Object.freeze([
  'physical_device_proof',
  'globally_verified_platform_isolation',
  'arbitrary_repository_code_isolation_verified',
  'compiled_plan_effect_admission',
  'production_executor_ready',
  'remote_execution_enabled',
  'remote_administration_enabled',
  'credentials_available',
  'secrets_available',
  'production_node_enrollment',
  'deployment_authority',
  'capability_promoted',
  'authority_granted'
]);
const CLAIM_KEYS = new Set([...POSITIVE_CLAIMS, ...NEGATIVE_CLAIMS]);

function boundedObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${label} must be an object`);
  }
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_DOCUMENT_BYTES) {
    throw new ValidationError(`${label} exceeds the maximum encoded size`);
  }
  return value;
}

function exactKeys(value, expected, label) {
  boundedObject(value, label);
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) throw new ValidationError(`${label} contains unsupported field: ${key}`);
  }
  for (const key of expected) {
    if (!Object.hasOwn(value, key)) throw new ValidationError(`${label} is missing required field: ${key}`);
  }
}

function text(value, label, max = 1024) {
  if (typeof value !== 'string' || value.length < 1 || value.length > max || value.includes('\0')) {
    throw new ValidationError(`${label} is invalid`);
  }
  return value;
}

function integer(value, label, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ValidationError(`${label} is invalid`);
  }
  return value;
}

function assertEqual(value, expected, label) {
  if (value !== expected) throw new ValidationError(`${label} is invalid`);
  return value;
}

function assertTrueMap(value, keys, label) {
  exactKeys(value, keys, label);
  for (const key of keys) {
    if (value[key] !== true) throw new ValidationError(`${label} must keep ${key} true`);
  }
  return Object.freeze(Object.fromEntries([...keys].map(key => [key, true])));
}

function normalizeClaims(value) {
  exactKeys(value, CLAIM_KEYS, 'Agent Linux isolation claims');
  for (const key of POSITIVE_CLAIMS) {
    if (value[key] !== true) throw new ValidationError(`Agent Linux isolation receipt must retain observed claim ${key}`);
  }
  for (const key of NEGATIVE_CLAIMS) {
    if (value[key] !== false) throw new ValidationError(`Agent Linux isolation receipt attempts to elevate ${key}`);
  }
  return Object.freeze({
    ...Object.fromEntries(POSITIVE_CLAIMS.map(key => [key, true])),
    ...Object.fromEntries(NEGATIVE_CLAIMS.map(key => [key, false]))
  });
}

function normalizeEvidence(value, platform) {
  exactKeys(value, EVIDENCE_KEYS, 'Agent Linux isolation evidence');

  exactKeys(value.baseline, BASELINE_KEYS, 'Agent Linux isolation baseline evidence');
  const baseline = Object.freeze({
    container_pid_namespace: text(value.baseline.container_pid_namespace, 'Agent Linux container PID namespace', 256),
    container_mount_namespace: text(value.baseline.container_mount_namespace, 'Agent Linux container mount namespace', 256),
    container_network_namespace: text(value.baseline.container_network_namespace, 'Agent Linux container network namespace', 256),
    uid: assertEqual(value.baseline.uid, 10001, 'Agent Linux isolation UID'),
    cap_eff: assertEqual(value.baseline.cap_eff, '0000000000000000', 'Agent Linux effective capabilities'),
    no_new_privs: assertEqual(value.baseline.no_new_privs, 1, 'Agent Linux no-new-privileges state'),
    seccomp: assertEqual(value.baseline.seccomp, 2, 'Agent Linux seccomp mode'),
    root_read_only: assertEqual(value.baseline.root_read_only, true, 'Agent Linux read-only root observation'),
    workspace_write_succeeded: assertEqual(value.baseline.workspace_write_succeeded, true, 'Agent Linux disposable workspace write observation'),
    root_write_error: value.baseline.root_write_error,
    symlink_write_error: value.baseline.symlink_write_error,
    docker_socket_present: assertEqual(value.baseline.docker_socket_present, false, 'Agent Linux Docker socket observation'),
    host_sentinel_present: assertEqual(value.baseline.host_sentinel_present, false, 'Agent Linux host sentinel observation'),
    secret_mount_present: assertEqual(value.baseline.secret_mount_present, false, 'Agent Linux secret mount observation'),
    public_network_error: value.baseline.public_network_error,
    memory_max: assertEqual(value.baseline.memory_max, 134217728, 'Agent Linux memory cgroup limit'),
    pids_max: assertEqual(value.baseline.pids_max, 32, 'Agent Linux PID cgroup limit'),
    cpu_quota: integer(value.baseline.cpu_quota, 'Agent Linux CPU quota', { min: 1 }),
    cpu_period: integer(value.baseline.cpu_period, 'Agent Linux CPU period', { min: 1 }),
    fd_count: integer(value.baseline.fd_count, 'Agent Linux file-descriptor count', { min: 3, max: 64 }),
    unexpected_sensitive_fd: assertEqual(value.baseline.unexpected_sensitive_fd, false, 'Agent Linux sensitive descriptor observation'),
    mount_digest: value.baseline.mount_digest
  });
  if (!DENIED_WRITE_CODES.has(baseline.root_write_error)) {
    throw new ValidationError('Agent Linux root write was not fail-closed');
  }
  if (!DENIED_WRITE_CODES.has(baseline.symlink_write_error)) {
    throw new ValidationError('Agent Linux symlink write escape was not fail-closed');
  }
  if (!DENIED_NETWORK_CODES.has(baseline.public_network_error)) {
    throw new ValidationError('Agent Linux public network denial was not observed unambiguously');
  }
  if (typeof baseline.mount_digest !== 'string' || !SHA256.test(baseline.mount_digest)) {
    throw new ValidationError('Agent Linux mount digest is invalid');
  }
  if (
    baseline.container_pid_namespace === platform.runner_pid_namespace
    || baseline.container_mount_namespace === platform.runner_mount_namespace
    || baseline.container_network_namespace === platform.runner_network_namespace
  ) {
    throw new ValidationError('Agent Linux isolation namespace separation was not observed');
  }
  if (Math.abs((baseline.cpu_quota / baseline.cpu_period) - 0.5) > 0.01) {
    throw new ValidationError('Agent Linux CPU cgroup limit does not match the reviewed ceiling');
  }

  exactKeys(value.pid_ceiling, PID_CEILING_KEYS, 'Agent Linux PID ceiling evidence');
  const pidCeiling = Object.freeze({
    requested: assertEqual(value.pid_ceiling.requested, 64, 'Agent Linux PID requested count'),
    started: integer(value.pid_ceiling.started, 'Agent Linux PID started count', { min: 1, max: 63 }),
    blocked: integer(value.pid_ceiling.blocked, 'Agent Linux PID blocked count', { min: 1, max: 63 }),
    container_absent_after_cleanup: assertEqual(value.pid_ceiling.container_absent_after_cleanup, true, 'Agent Linux PID probe cleanup')
  });
  if (pidCeiling.started + pidCeiling.blocked !== pidCeiling.requested) {
    throw new ValidationError('Agent Linux PID ceiling observation counts do not reconcile');
  }

  exactKeys(value.timeout_cleanup, TIMEOUT_KEYS, 'Agent Linux timeout cleanup evidence');
  const timeoutCleanup = Object.freeze({
    timed_out: assertEqual(value.timeout_cleanup.timed_out, true, 'Agent Linux timeout observation'),
    container_absent_after_cleanup: assertEqual(value.timeout_cleanup.container_absent_after_cleanup, true, 'Agent Linux timeout cleanup')
  });

  exactKeys(value.output_ceiling, OUTPUT_KEYS, 'Agent Linux output ceiling evidence');
  const outputCeiling = Object.freeze({
    overflow_detected: assertEqual(value.output_ceiling.overflow_detected, true, 'Agent Linux output overflow observation'),
    output_limit_bytes: assertEqual(value.output_ceiling.output_limit_bytes, 65536, 'Agent Linux output ceiling'),
    container_absent_after_cleanup: assertEqual(value.output_ceiling.container_absent_after_cleanup, true, 'Agent Linux output cleanup')
  });

  return Object.freeze({
    baseline,
    pid_ceiling: pidCeiling,
    timeout_cleanup: timeoutCleanup,
    output_ceiling: outputCeiling
  });
}

function normalizeProbes(value, evidence) {
  if (!Array.isArray(value) || value.length !== REQUIRED_PROBES.length) {
    throw new ValidationError('Agent Linux isolation probes must contain the exact reviewed probe set');
  }
  return Object.freeze(value.map((probe, index) => {
    exactKeys(probe, PROBE_KEYS, `Agent Linux isolation probe ${index}`);
    const [expectedProbeId, evidenceKey] = REQUIRED_PROBES[index];
    if (probe.probe_id !== expectedProbeId) {
      throw new ValidationError('Agent Linux isolation probes must preserve reviewed order and identity');
    }
    if (probe.status !== 'pass') throw new ValidationError('Agent Linux isolation probe status must be pass');
    const expectedObservationDigest = digestObject(evidence[evidenceKey]);
    if (probe.observation_digest !== expectedObservationDigest) {
      throw new ValidationError(`Agent Linux isolation ${expectedProbeId} observation digest mismatch`);
    }
    return Object.freeze({
      probe_id: expectedProbeId,
      status: 'pass',
      observation_digest: expectedObservationDigest
    });
  }));
}

export function verifyAgentLinuxIsolationConformanceReceipt(raw) {
  boundedObject(raw, 'Agent Linux isolation conformance receipt');
  exactKeys(raw, RECEIPT_KEYS, 'Agent Linux isolation conformance receipt');
  assertEqual(raw.schema, AGENT_LINUX_ISOLATION_CONFORMANCE_RECEIPT_SCHEMA, 'Agent Linux isolation receipt schema');
  assertEqual(raw.repository, 'Zoverions/AXIOM-MESH', 'Agent Linux isolation receipt repository');
  if (typeof raw.revision !== 'string' || !SHA1.test(raw.revision)) {
    throw new ValidationError('Agent Linux isolation receipt revision is invalid');
  }
  assertEqual(raw.observation_environment, 'hosted-ci', 'Agent Linux isolation observation environment');

  exactKeys(raw.platform, PLATFORM_KEYS, 'Agent Linux isolation platform');
  assertEqual(raw.platform.operating_system, 'linux', 'Agent Linux isolation operating system');
  if (!['x64', 'arm64'].includes(raw.platform.architecture)) {
    throw new ValidationError('Agent Linux isolation architecture is unsupported');
  }
  const platform = Object.freeze({
    operating_system: 'linux',
    architecture: raw.platform.architecture,
    kernel_release: text(raw.platform.kernel_release, 'Agent Linux isolation kernel release', 256),
    runner_pid_namespace: text(raw.platform.runner_pid_namespace, 'Agent Linux runner PID namespace', 256),
    runner_mount_namespace: text(raw.platform.runner_mount_namespace, 'Agent Linux runner mount namespace', 256),
    runner_network_namespace: text(raw.platform.runner_network_namespace, 'Agent Linux runner network namespace', 256)
  });

  exactKeys(raw.policy, POLICY_KEYS, 'Agent Linux isolation policy');
  assertEqual(raw.policy.catalog_schema, AGENT_EXECUTOR_ISOLATION_POLICY_CATALOG_SCHEMA, 'Agent Linux isolation policy catalog schema');
  assertEqual(raw.policy.catalog_digest, AGENT_EXECUTOR_ISOLATION_POLICY_CATALOG_DIGEST, 'Agent Linux isolation policy catalog digest');
  assertEqual(raw.policy.policy_id, 'linux-kernel-isolation-v1', 'Agent Linux isolation policy ID');
  assertEqual(raw.policy.revision, 1, 'Agent Linux isolation policy revision');
  const policy = Object.freeze({ ...raw.policy });

  exactKeys(raw.adapter, ADAPTER_KEYS, 'Agent Linux isolation adapter');
  assertEqual(raw.adapter.adapter_id, AGENT_LINUX_ISOLATION_ADAPTER_ID, 'Agent Linux isolation adapter ID');
  assertEqual(raw.adapter.docker_binary, AGENT_LINUX_ISOLATION_DOCKER_BINARY, 'Agent Linux isolation Docker binary');
  assertEqual(raw.adapter.image_tag, AGENT_LINUX_ISOLATION_IMAGE_TAG, 'Agent Linux isolation image tag');
  assertEqual(raw.adapter.entrypoint, AGENT_LINUX_ISOLATION_ENTRYPOINT, 'Agent Linux isolation entrypoint');
  text(raw.adapter.docker_server_version, 'Agent Linux isolation Docker server version', 256);
  if (typeof raw.adapter.image_id !== 'string' || !IMAGE_ID.test(raw.adapter.image_id)) {
    throw new ValidationError('Agent Linux isolation image ID is invalid');
  }
  const adapter = Object.freeze({ ...raw.adapter });

  exactKeys(raw.limits, LIMIT_KEYS, 'Agent Linux isolation limits');
  const expectedLimits = Object.freeze({
    network_mode: 'none',
    read_only_root: true,
    capabilities_dropped: 'ALL',
    no_new_privileges: true,
    uid_gid: '10001:10001',
    pids: 32,
    memory_bytes: 134217728,
    cpu_quota: 0.5,
    probe_timeout_ms: 5000,
    max_output_bytes: 65536
  });
  for (const [key, expected] of Object.entries(expectedLimits)) {
    assertEqual(raw.limits[key], expected, `Agent Linux isolation limit ${key}`);
  }

  const controls = assertTrueMap(raw.controls, CONTROL_KEY_SET, 'Agent Linux isolation controls');
  const evidence = normalizeEvidence(raw.evidence, platform);
  const probes = normalizeProbes(raw.probes, evidence);
  const claims = normalizeClaims(raw.claims);

  if (typeof raw.receipt_digest !== 'string' || !SHA256.test(raw.receipt_digest)) {
    throw new ValidationError('Agent Linux isolation receipt digest is invalid');
  }

  const normalizedWithoutDigest = {
    schema: AGENT_LINUX_ISOLATION_CONFORMANCE_RECEIPT_SCHEMA,
    repository: 'Zoverions/AXIOM-MESH',
    revision: raw.revision,
    observation_environment: 'hosted-ci',
    platform,
    policy,
    adapter,
    limits: expectedLimits,
    controls,
    evidence,
    probes,
    claims
  };
  const expectedDigest = digestObject(normalizedWithoutDigest);
  if (raw.receipt_digest !== expectedDigest) {
    throw new ValidationError('Agent Linux isolation receipt digest mismatch');
  }

  return Object.freeze({ ...normalizedWithoutDigest, receipt_digest: expectedDigest });
}

export function buildAgentLinuxIsolationConformanceReceipt(statement) {
  boundedObject(statement, 'Agent Linux isolation receipt statement');
  const candidate = {
    ...statement,
    schema: AGENT_LINUX_ISOLATION_CONFORMANCE_RECEIPT_SCHEMA,
    repository: 'Zoverions/AXIOM-MESH',
    observation_environment: 'hosted-ci'
  };
  const receipt = { ...candidate, receipt_digest: digestObject(candidate) };
  return verifyAgentLinuxIsolationConformanceReceipt(receipt);
}
