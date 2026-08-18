import assert from 'node:assert/strict';
import test from 'node:test';

import { digestObject, sha256 } from '../src/lib/canonical.mjs';
import { verifyAgentExecutorDurableStateReceipt } from '../src/lib/agent-executor-durable-format.mjs';
import {
  AGENT_EXECUTOR_ISOLATION_POLICY_CATALOG_DIGEST,
  AGENT_EXECUTOR_ISOLATION_POLICY_CATALOG_SCHEMA
} from '../src/lib/agent-executor-isolation-profile.mjs';
import {
  AGENT_LINUX_ISOLATION_ADAPTER_ID,
  AGENT_LINUX_ISOLATION_DOCKER_BINARY,
  AGENT_LINUX_ISOLATION_ENTRYPOINT,
  AGENT_LINUX_ISOLATION_IMAGE_TAG,
  buildAgentLinuxIsolationConformanceReceipt
} from '../src/lib/agent-linux-isolation-conformance.mjs';
import {
  createAgentReadSystemFactsEffectAdmission,
  verifyAgentReadSystemFactsEffectAdmission
} from '../src/lib/agent-read-system-facts-effect-admission.mjs';
import {
  AgentReadSystemFactsEffectController,
  verifyAgentReadSystemFactsEffectReceipt
} from '../src/lib/agent-read-system-facts-effect.mjs';
import {
  cleanupDurableState,
  createDurableStateFixture,
  durableKeyPair
} from './fixtures/agent-executor-durable-fixture.mjs';

const REVISION = 'f'.repeat(40);

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function isolationReceipt() {
  const evidence = {
    baseline: {
      container_pid_namespace: 'pid:[200]', container_mount_namespace: 'mnt:[201]', container_network_namespace: 'net:[202]',
      uid: 10001, cap_eff: '0000000000000000', no_new_privs: 1, seccomp: 2, root_read_only: true,
      workspace_write_succeeded: true, root_write_error: 'EROFS', symlink_write_error: 'EROFS', docker_socket_present: false,
      host_sentinel_present: false, secret_mount_present: false, public_network_error: 'ENETUNREACH', memory_max: 134217728,
      pids_max: 32, cpu_quota: 50000, cpu_period: 100000, fd_count: 19, unexpected_sensitive_fd: false, mount_digest: 'a'.repeat(64)
    },
    pid_ceiling: { requested: 64, started: 24, blocked: 40, container_absent_after_cleanup: true },
    timeout_cleanup: { timed_out: true, container_absent_after_cleanup: true },
    output_ceiling: { overflow_detected: true, output_limit_bytes: 65536, container_absent_after_cleanup: true }
  };
  return buildAgentLinuxIsolationConformanceReceipt({
    revision: REVISION,
    platform: { operating_system: 'linux', architecture: 'x64', kernel_release: '6.8.0-test', runner_pid_namespace: 'pid:[100]', runner_mount_namespace: 'mnt:[101]', runner_network_namespace: 'net:[102]' },
    policy: { catalog_schema: AGENT_EXECUTOR_ISOLATION_POLICY_CATALOG_SCHEMA, catalog_digest: AGENT_EXECUTOR_ISOLATION_POLICY_CATALOG_DIGEST, policy_id: 'linux-kernel-isolation-v1', revision: 1 },
    adapter: { adapter_id: AGENT_LINUX_ISOLATION_ADAPTER_ID, docker_binary: AGENT_LINUX_ISOLATION_DOCKER_BINARY, docker_server_version: '28.0.0', image_tag: AGENT_LINUX_ISOLATION_IMAGE_TAG, image_id: `sha256:${'c'.repeat(64)}`, entrypoint: AGENT_LINUX_ISOLATION_ENTRYPOINT },
    limits: { network_mode: 'none', read_only_root: true, capabilities_dropped: 'ALL', no_new_privileges: true, uid_gid: '10001:10001', pids: 32, memory_bytes: 134217728, cpu_quota: 0.5, probe_timeout_ms: 5000, max_output_bytes: 65536 },
    controls: { pid_namespace_separated: true, mount_namespace_separated: true, network_namespace_separated: true, effective_capabilities_zero: true, no_new_privileges_active: true, seccomp_filter_active: true, disposable_workspace_writable: true, container_root_write_denied: true, symlink_write_escape_denied: true, docker_socket_absent: true, host_sentinel_absent: true, secret_mount_absent: true, public_network_denied: true, memory_limit_observed: true, pid_limit_observed: true, cpu_limit_observed: true, pid_exhaustion_bounded: true, timeout_cleanup_verified: true, output_overflow_cleanup_verified: true },
    evidence,
    probes: [
      { probe_id: 'baseline', status: 'pass', observation_digest: digestObject(evidence.baseline) },
      { probe_id: 'pid-ceiling', status: 'pass', observation_digest: digestObject(evidence.pid_ceiling) },
      { probe_id: 'timeout-cleanup', status: 'pass', observation_digest: digestObject(evidence.timeout_cleanup) },
      { probe_id: 'output-ceiling', status: 'pass', observation_digest: digestObject(evidence.output_ceiling) }
    ],
    claims: { fixed_probe_real_process_effects_observed: true, fixed_probe_disposable_filesystem_effects_observed: true, tested_linux_kernel_controls_observed: true, tested_network_denial_observed: true, physical_device_proof: false, globally_verified_platform_isolation: false, arbitrary_repository_code_isolation_verified: false, compiled_plan_effect_admission: false, production_executor_ready: false, remote_execution_enabled: false, remote_administration_enabled: false, credentials_available: false, secrets_available: false, production_node_enrollment: false, deployment_authority: false, capability_promoted: false, authority_granted: false }
  });
}
function admissionFor(current, keys, overrides = {}) {
  return createAgentReadSystemFactsEffectAdmission({
    admissionId: overrides.admissionId ?? 'effect-admission:test:read-facts',
    issuerId: 'issuer:test:read-facts', issuerPrivateKey: keys.privateKey, plan: current.plan,
    revision: REVISION, notBefore: overrides.notBefore ?? '2026-08-18T12:04:50.000Z',
    expiresAt: overrides.expiresAt ?? '2026-08-18T12:09:00.000Z'
  });
}
function observationFor(sequence) {
  const output = sequence === 1 ? 'v24.18.0' : JSON.stringify({ platform: 'linux', arch: 'x64' });
  const args = sequence === 1 ? ['--version'] : ['-p', 'JSON.stringify({platform:process.platform,arch:process.arch})'];
  return {
    sequence, step_id: sequence === 1 ? 'read-system-facts:node-version' : 'read-system-facts:platform-arch',
    executable_id: 'node-current-pinned', absolute_executable: '/usr/local/bin/node', arguments: args,
    logical_working_directory: 'work/session', container_working_directory: '/work', exit_status: 0,
    sanitized_output: output, output_sha256: sha256(output), output_bytes: Buffer.byteLength(output), stderr_empty: true,
    network_mode: 'none', repository_code_execution: false, container_absent_after_cleanup: true
  };
}
function controllerFixture() {
  const current = createDurableStateFixture();
  const issuer = durableKeyPair();
  const executor = durableKeyPair();
  const isolation = isolationReceipt();
  const admission = admissionFor(current, issuer);
  const controller = new AgentReadSystemFactsEffectController({ durableStore: current.store, executorPrivateKey: executor.privateKey,
    admission, trustedAdmissionIssuerPublicKey: issuer.publicKey, isolationConformanceReceipt: isolation, revision: REVISION });
  return { current, issuer, executor, isolation, admission, controller };
}
function beginEffect(f) {
  const transcript = f.current.store.currentRecord.payload.lifecycle_transcript;
  const lifecycleReceipt = f.current.store.currentRecord.payload.lifecycle_receipt;
  return f.controller.begin({ currentLifecycleTranscript: transcript, currentLifecycleReceipt: lifecycleReceipt,
    trustedLifecyclePublicKey: f.current.store.lifecyclePublicKey, revocationState: 'active', occurredAt: '2026-08-18T12:05:05.000Z' });
}
function verifyArgs(f, durableConsumeHeadReceipt) {
  return {
    trustedExecutorPublicKey: f.controller.executorPublicKey,
    trustedAdmissionIssuerPublicKey: f.issuer.publicKey,
    trustedDurableStorePublicKey: f.current.store.storePublicKey,
    durableConsumeHeadReceipt,
    plan: f.current.plan,
    admission: f.admission,
    isolationConformanceReceipt: f.isolation
  };
}

test('effect admission signs only the exact inert read-system-facts plan', () => {
  const current = createDurableStateFixture();
  try {
    const issuer = durableKeyPair();
    const admission = admissionFor(current, issuer);
    const checked = verifyAgentReadSystemFactsEffectAdmission(admission, { trustedIssuerPublicKey: issuer.publicKey, plan: current.plan, expectedRevision: REVISION, now: '2026-08-18T12:05:00.000Z' });
    assert.equal(current.plan.effects.effect_reachable, false);
    assert.equal(checked.statement.operation_id, 'read-system-facts');
    assert.equal(checked.statement.general_executor_authority, false);
    assert.equal(checked.statement.repository_code_execution_authority, false);
    assert.equal(checked.statement.network_authority, false);
    assert.equal(checked.statement.axiom_authority_granted, false);
  } finally { cleanupDurableState(current); }
});

test('effect admission rejects wrong issuer, excessive lifetime, plan substitution and authority elevation', () => {
  const current = createDurableStateFixture();
  try {
    const issuer = durableKeyPair();
    const wrong = durableKeyPair();
    const admission = admissionFor(current, issuer);
    assert.throws(() => verifyAgentReadSystemFactsEffectAdmission(admission, { trustedIssuerPublicKey: wrong.publicKey, plan: current.plan, expectedRevision: REVISION, now: '2026-08-18T12:05:00.000Z' }), /issuer|signature|key/i);
    assert.throws(() => admissionFor(current, issuer, { expiresAt: '2026-08-18T12:10:01.000Z' }), /lifetime/i);
    const changedPlan = clone(current.plan); changedPlan.plan_digest = 'e'.repeat(64);
    assert.throws(() => verifyAgentReadSystemFactsEffectAdmission(admission, { trustedIssuerPublicKey: issuer.publicKey, plan: changedPlan, expectedRevision: REVISION, now: '2026-08-18T12:05:00.000Z' }), /digest|plan/i);
    const elevated = clone(admission); elevated.statement.general_executor_authority = true;
    assert.throws(() => verifyAgentReadSystemFactsEffectAdmission(elevated, { trustedIssuerPublicKey: issuer.publicKey, plan: current.plan, expectedRevision: REVISION, now: '2026-08-18T12:05:00.000Z' }), /widen authority/i);
  } finally { cleanupDurableState(current); }
});

test('unknown revocation fails before consumption; active revocation returns signed consumed head before effect descriptor', () => {
  const f = controllerFixture();
  try {
    const transcript = f.current.store.currentRecord.payload.lifecycle_transcript;
    const receipt = f.current.store.currentRecord.payload.lifecycle_receipt;
    assert.throws(() => f.controller.begin({ currentLifecycleTranscript: transcript, currentLifecycleReceipt: receipt,
      trustedLifecyclePublicKey: f.current.store.lifecyclePublicKey, revocationState: 'unknown', occurredAt: '2026-08-18T12:05:05.000Z' }), /known-active/i);
    assert.equal(f.current.store.status, 'issued');
    const descriptor = beginEffect(f);
    assert.equal(f.current.store.status, 'consumed');
    assert.equal(f.current.store.generation, 2);
    assert.equal(descriptor.steps.length, 2);
    assert.equal(descriptor.repository_mount_allowed, false);
    const consumed = verifyAgentExecutorDurableStateReceipt(descriptor.durable_consume_head_receipt, {
      trustedStorePublicKey: f.current.store.storePublicKey, plan: f.current.plan, expectedStoreId: f.current.store.storeId
    });
    assert.equal(consumed.statement.lifecycle_status, 'consumed');
    assert.equal(consumed.statement.generation, 2);
    assert.equal(consumed.statement.record_digest, f.current.store.currentRecord.record_digest);
    assert.throws(() => beginEffect(f), /already consumed/i);
  } finally { cleanupDurableState(f.current); }
});

test('current lifecycle substitution fails before durable consumption', () => {
  const f = controllerFixture();
  try {
    const transcript = clone(f.current.store.currentRecord.payload.lifecycle_transcript);
    transcript.transcript_digest = 'a'.repeat(64);
    assert.throws(() => f.controller.begin({ currentLifecycleTranscript: transcript, currentLifecycleReceipt: f.current.store.currentRecord.payload.lifecycle_receipt,
      trustedLifecyclePublicKey: f.current.store.lifecyclePublicKey, revocationState: 'active', occurredAt: '2026-08-18T12:05:05.000Z' }), /digest|lifecycle/i);
    assert.equal(f.current.store.status, 'issued');
  } finally { cleanupDurableState(f.current); }
});

test('completed exact observations bind signed consumed and final durable heads', () => {
  const f = controllerFixture();
  try {
    const descriptor = beginEffect(f);
    const consumedHead = descriptor.durable_consume_head_receipt;
    const receipt = f.controller.complete({ observations: [observationFor(1), observationFor(2)], finishedAt: '2026-08-18T12:05:10.000Z' });
    const checked = verifyAgentReadSystemFactsEffectReceipt(receipt, verifyArgs(f, consumedHead));
    assert.equal(f.current.store.status, 'completed');
    assert.equal(checked.statement.durable_consume_generation, 2);
    assert.equal(checked.statement.durable_consume_head_receipt_digest, consumedHead.receipt_digest);
    assert.equal(checked.statement.durable_final_generation, 3);
    assert.equal(checked.statement.real_process_effect_observed, true);
    assert.equal(checked.statement.durable_consumption_before_effect_observed, true);
    assert.equal(checked.statement.dry_run_plan_effect_reachable, false);
    assert.equal(checked.statement.task_success_claimed, false);
    assert.equal(checked.statement.general_executor_available, false);
    assert.equal(checked.statement.axiom_authority_granted, false);
  } finally { cleanupDurableState(f.current); }
});

test('effect receipt rejects missing, wrong-key and substituted consumed-head evidence', () => {
  const f = controllerFixture();
  try {
    const descriptor = beginEffect(f);
    const consumedHead = descriptor.durable_consume_head_receipt;
    const receipt = f.controller.complete({ observations: [observationFor(1), observationFor(2)], finishedAt: '2026-08-18T12:05:10.000Z' });
    assert.throws(() => verifyAgentReadSystemFactsEffectReceipt(receipt, {
      ...verifyArgs(f, consumedHead), durableConsumeHeadReceipt: undefined
    }), /durable|receipt|object/i);
    const wrongStore = durableKeyPair();
    assert.throws(() => verifyAgentReadSystemFactsEffectReceipt(receipt, {
      ...verifyArgs(f, consumedHead), trustedDurableStorePublicKey: wrongStore.publicKey
    }), /key|signature|store/i);
    const substituted = clone(consumedHead);
    substituted.statement.lifecycle_status = 'issued';
    assert.throws(() => verifyAgentReadSystemFactsEffectReceipt(receipt, {
      ...verifyArgs(f, consumedHead), durableConsumeHeadReceipt: substituted
    }), /digest|signature|consumed/i);
  } finally { cleanupDurableState(f.current); }
});

test('effect observations and receipt cannot widen argv, platform result, executor key or authority claims', () => {
  const f = controllerFixture();
  try {
    beginEffect(f);
    const widened = observationFor(1); widened.arguments.push('--eval');
    assert.throws(() => f.controller.complete({ observations: [widened, observationFor(2)], finishedAt: '2026-08-18T12:05:10.000Z' }), /widened|mapping/i);
    assert.equal(f.current.store.status, 'consumed');
    f.controller.interrupt({ occurredAt: '2026-08-18T12:05:11.000Z', reasonCode: 'test-invalid-observation' });
  } finally { cleanupDurableState(f.current); }

  const g = controllerFixture();
  try {
    const descriptor = beginEffect(g);
    const consumedHead = descriptor.durable_consume_head_receipt;
    const receipt = g.controller.complete({ observations: [observationFor(1), observationFor(2)], finishedAt: '2026-08-18T12:05:10.000Z' });
    const wrong = durableKeyPair();
    assert.throws(() => verifyAgentReadSystemFactsEffectReceipt(receipt, {
      ...verifyArgs(g, consumedHead), trustedExecutorPublicKey: wrong.publicKey
    }), /executor key/i);
    const elevated = clone(receipt); elevated.statement.general_executor_available = true;
    assert.throws(() => verifyAgentReadSystemFactsEffectReceipt(elevated, verifyArgs(g, consumedHead)), /elevate general_executor_available/i);
    const platform = clone(receipt); platform.statement.observations[1].sanitized_output = JSON.stringify({ platform: 'linux', arch: 'arm64' });
    platform.statement.observations[1].output_bytes = Buffer.byteLength(platform.statement.observations[1].sanitized_output);
    platform.statement.observations[1].output_sha256 = sha256(platform.statement.observations[1].sanitized_output);
    assert.throws(() => verifyAgentReadSystemFactsEffectReceipt(platform, verifyArgs(g, consumedHead)), /platform output/i);
  } finally { cleanupDurableState(g.current); }
});
