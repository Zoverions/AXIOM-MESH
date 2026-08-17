import assert from 'node:assert/strict';
import test from 'node:test';
import { digestObject } from '../src/lib/canonical.mjs';
import {
  AGENT_EXECUTOR_ISOLATION_POLICY_CATALOG_DIGEST,
  AGENT_EXECUTOR_ISOLATION_POLICY_CATALOG_SCHEMA
} from '../src/lib/agent-executor-isolation-profile.mjs';
import {
  AGENT_LINUX_ISOLATION_ADAPTER_ID,
  AGENT_LINUX_ISOLATION_DOCKER_BINARY,
  AGENT_LINUX_ISOLATION_ENTRYPOINT,
  AGENT_LINUX_ISOLATION_IMAGE_TAG,
  buildAgentLinuxIsolationConformanceReceipt,
  verifyAgentLinuxIsolationConformanceReceipt
} from '../src/lib/agent-linux-isolation-conformance.mjs';

function validEvidence() {
  return {
    baseline: {
      container_pid_namespace: 'pid:[200]',
      container_mount_namespace: 'mnt:[201]',
      container_network_namespace: 'net:[202]',
      uid: 10001,
      cap_eff: '0000000000000000',
      no_new_privs: 1,
      seccomp: 2,
      root_read_only: true,
      workspace_write_succeeded: true,
      root_write_error: 'EROFS',
      symlink_write_error: 'EROFS',
      docker_socket_present: false,
      host_sentinel_present: false,
      secret_mount_present: false,
      public_network_error: 'ENETUNREACH',
      memory_max: 134217728,
      pids_max: 32,
      cpu_quota: 50000,
      cpu_period: 100000,
      fd_count: 19,
      unexpected_sensitive_fd: false,
      mount_digest: 'a'.repeat(64)
    },
    pid_ceiling: {
      requested: 64,
      started: 24,
      blocked: 40,
      container_absent_after_cleanup: true
    },
    timeout_cleanup: {
      timed_out: true,
      container_absent_after_cleanup: true
    },
    output_ceiling: {
      overflow_detected: true,
      output_limit_bytes: 65536,
      container_absent_after_cleanup: true
    }
  };
}

function validStatement() {
  const evidence = validEvidence();
  return {
    revision: 'b'.repeat(40),
    platform: {
      operating_system: 'linux',
      architecture: 'x64',
      kernel_release: '6.8.0-test',
      runner_pid_namespace: 'pid:[100]',
      runner_mount_namespace: 'mnt:[101]',
      runner_network_namespace: 'net:[102]'
    },
    policy: {
      catalog_schema: AGENT_EXECUTOR_ISOLATION_POLICY_CATALOG_SCHEMA,
      catalog_digest: AGENT_EXECUTOR_ISOLATION_POLICY_CATALOG_DIGEST,
      policy_id: 'linux-kernel-isolation-v1',
      revision: 1
    },
    adapter: {
      adapter_id: AGENT_LINUX_ISOLATION_ADAPTER_ID,
      docker_binary: AGENT_LINUX_ISOLATION_DOCKER_BINARY,
      docker_server_version: '28.0.0',
      image_tag: AGENT_LINUX_ISOLATION_IMAGE_TAG,
      image_id: `sha256:${'c'.repeat(64)}`,
      entrypoint: AGENT_LINUX_ISOLATION_ENTRYPOINT
    },
    limits: {
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
    },
    controls: {
      pid_namespace_separated: true,
      mount_namespace_separated: true,
      network_namespace_separated: true,
      effective_capabilities_zero: true,
      no_new_privileges_active: true,
      seccomp_filter_active: true,
      disposable_workspace_writable: true,
      container_root_write_denied: true,
      symlink_write_escape_denied: true,
      docker_socket_absent: true,
      host_sentinel_absent: true,
      secret_mount_absent: true,
      public_network_denied: true,
      memory_limit_observed: true,
      pid_limit_observed: true,
      cpu_limit_observed: true,
      pid_exhaustion_bounded: true,
      timeout_cleanup_verified: true,
      output_overflow_cleanup_verified: true
    },
    evidence,
    probes: [
      { probe_id: 'baseline', status: 'pass', observation_digest: digestObject(evidence.baseline) },
      { probe_id: 'pid-ceiling', status: 'pass', observation_digest: digestObject(evidence.pid_ceiling) },
      { probe_id: 'timeout-cleanup', status: 'pass', observation_digest: digestObject(evidence.timeout_cleanup) },
      { probe_id: 'output-ceiling', status: 'pass', observation_digest: digestObject(evidence.output_ceiling) }
    ],
    claims: {
      fixed_probe_real_process_effects_observed: true,
      fixed_probe_disposable_filesystem_effects_observed: true,
      tested_linux_kernel_controls_observed: true,
      tested_network_denial_observed: true,
      physical_device_proof: false,
      globally_verified_platform_isolation: false,
      arbitrary_repository_code_isolation_verified: false,
      compiled_plan_effect_admission: false,
      production_executor_ready: false,
      remote_execution_enabled: false,
      remote_administration_enabled: false,
      credentials_available: false,
      secrets_available: false,
      production_node_enrollment: false,
      deployment_authority: false,
      capability_promoted: false,
      authority_granted: false
    }
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test('Linux isolation receipt preserves tested effects without production elevation', () => {
  const receipt = buildAgentLinuxIsolationConformanceReceipt(validStatement());
  const verified = verifyAgentLinuxIsolationConformanceReceipt(receipt);
  assert.equal(verified.claims.fixed_probe_real_process_effects_observed, true);
  assert.equal(verified.claims.tested_linux_kernel_controls_observed, true);
  assert.equal(verified.claims.physical_device_proof, false);
  assert.equal(verified.claims.arbitrary_repository_code_isolation_verified, false);
  assert.equal(verified.claims.compiled_plan_effect_admission, false);
  assert.equal(verified.claims.production_executor_ready, false);
  assert.equal(verified.claims.authority_granted, false);
});

test('receipt rejects policy, namespace and evidence substitution', () => {
  const receipt = buildAgentLinuxIsolationConformanceReceipt(validStatement());

  const policy = clone(receipt);
  policy.policy.catalog_digest = 'd'.repeat(64);
  assert.throws(() => verifyAgentLinuxIsolationConformanceReceipt(policy), /catalog digest/i);

  const namespace = clone(receipt);
  namespace.evidence.baseline.container_network_namespace = namespace.platform.runner_network_namespace;
  assert.throws(() => verifyAgentLinuxIsolationConformanceReceipt(namespace), /namespace separation/i);

  const observation = clone(receipt);
  observation.evidence.baseline.public_network_error = 'ETIMEDOUT';
  assert.throws(() => verifyAgentLinuxIsolationConformanceReceipt(observation), /network denial/i);

  const cpu = clone(receipt);
  cpu.evidence.baseline.cpu_quota = 100000;
  assert.throws(() => verifyAgentLinuxIsolationConformanceReceipt(cpu), /CPU cgroup limit/i);
});

test('receipt rejects fake PID pressure, cleanup and probe digests', () => {
  const receipt = buildAgentLinuxIsolationConformanceReceipt(validStatement());

  const noPressure = clone(receipt);
  noPressure.evidence.pid_ceiling.started = 64;
  noPressure.evidence.pid_ceiling.blocked = 0;
  assert.throws(() => verifyAgentLinuxIsolationConformanceReceipt(noPressure), /PID started count|PID blocked count/i);

  const cleanup = clone(receipt);
  cleanup.evidence.timeout_cleanup.container_absent_after_cleanup = false;
  assert.throws(() => verifyAgentLinuxIsolationConformanceReceipt(cleanup), /timeout cleanup/i);

  const digest = clone(receipt);
  digest.probes[0].observation_digest = 'e'.repeat(64);
  assert.throws(() => verifyAgentLinuxIsolationConformanceReceipt(digest), /observation digest mismatch/i);
});

test('receipt cannot upgrade hosted fixed probes into authority', () => {
  const receipt = buildAgentLinuxIsolationConformanceReceipt(validStatement());
  for (const key of [
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
  ]) {
    const elevated = clone(receipt);
    elevated.claims[key] = true;
    assert.throws(() => verifyAgentLinuxIsolationConformanceReceipt(elevated), new RegExp(key));
  }
});

test('receipt digest binds the complete sanitized evidence statement', () => {
  const receipt = buildAgentLinuxIsolationConformanceReceipt(validStatement());
  const changed = clone(receipt);
  changed.adapter.docker_server_version = '28.0.1';
  assert.throws(() => verifyAgentLinuxIsolationConformanceReceipt(changed), /receipt digest mismatch/i);
});
