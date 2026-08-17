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

const RECEIPT_KEYS = new Set([
  'schema', 'repository', 'revision', 'observation_environment', 'platform',
  'policy', 'adapter', 'limits', 'controls', 'probes', 'claims', 'receipt_digest'
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
const PROBE_KEYS = new Set(['probe_id', 'status', 'observation_digest']);
const REQUIRED_PROBES = Object.freeze([
  'baseline',
  'pid-ceiling',
  'timeout-cleanup',
  'output-ceiling'
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

function normalizeProbes(value) {
  if (!Array.isArray(value) || value.length !== REQUIRED_PROBES.length) {
    throw new ValidationError('Agent Linux isolation probes must contain the exact reviewed probe set');
  }
  return Object.freeze(value.map((probe, index) => {
    exactKeys(probe, PROBE_KEYS, `Agent Linux isolation probe ${index}`);
    if (probe.probe_id !== REQUIRED_PROBES[index]) {
      throw new ValidationError('Agent Linux isolation probes must preserve reviewed order and identity');
    }
    if (probe.status !== 'pass') throw new ValidationError('Agent Linux isolation probe status must be pass');
    if (typeof probe.observation_digest !== 'string' || !SHA256.test(probe.observation_digest)) {
      throw new ValidationError('Agent Linux isolation probe observation digest is invalid');
    }
    return Object.freeze({
      probe_id: probe.probe_id,
      status: 'pass',
      observation_digest: probe.observation_digest
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
  const probes = normalizeProbes(raw.probes);
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
