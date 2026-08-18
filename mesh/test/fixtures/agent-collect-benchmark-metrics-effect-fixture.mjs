import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { canonicalJson, digestObject, sha256 } from '../../src/lib/canonical.mjs';
import { compileAgentExecutorDryRunPlan } from '../../src/lib/agent-executor-dry-run.mjs';
import { AgentExecutorDurableStateStore } from '../../src/lib/agent-executor-durable-state.mjs';
import { AgentTestSessionLifecycleLedger } from '../../src/lib/agent-test-session-lifecycle.mjs';
import {
  AGENT_EXECUTOR_ISOLATION_POLICY_CATALOG_DIGEST,
  AGENT_EXECUTOR_ISOLATION_POLICY_CATALOG_SCHEMA
} from '../../src/lib/agent-executor-isolation-profile.mjs';
import {
  AGENT_LINUX_ISOLATION_ADAPTER_ID,
  AGENT_LINUX_ISOLATION_DOCKER_BINARY,
  AGENT_LINUX_ISOLATION_ENTRYPOINT,
  AGENT_LINUX_ISOLATION_IMAGE_TAG,
  buildAgentLinuxIsolationConformanceReceipt
} from '../../src/lib/agent-linux-isolation-conformance.mjs';
import { createAgentCollectBenchmarkMetricsEffectAdmission } from '../../src/lib/agent-collect-benchmark-metrics-effect-admission.mjs';
import { AgentCollectBenchmarkMetricsEffectController } from '../../src/lib/agent-collect-benchmark-metrics-effect.mjs';

export const BENCHMARK_REVISION = 'd'.repeat(40);
const PROFILE_SHA = 'b'.repeat(64);
const NONCE = 'challenge_nonce_benchmark_0123456789';
const NOW = new Date('2026-08-18T15:05:00.000Z');

export function benchmarkKeyPair() {
  const pair = generateKeyPairSync('ed25519');
  return {
    privateKey: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
  };
}

function buildObjects() {
  const offer = {
    schema: 'axiom-agent-infrastructure-offer.v1', offer_id: 'offer:benchmark:test-node', repository: 'Zoverions/AXIOM-MESH',
    publisher: { type: 'human', id: 'contributor:benchmark' },
    node_profile: { schema: 'axiom-compute-node-profile.v1', profile_id: 'node:benchmark:test-node', profile_sha256: PROFILE_SHA },
    custody: { physical_control: 'contributor', remote_access_available: false },
    availability: { starts_at: '2026-08-18T14:00:00.000Z', expires_at: '2026-08-18T16:00:00.000Z', maximum_sessions: 2 },
    challenge_classes: ['hardware-validation'], evidence: { fact_status: 'declared', evidence_refs: [] },
    boundaries: { destructive_actions_allowed: false, production_enrollment_allowed: false, credential_issuance_allowed: false, secret_access_allowed: false, firmware_changes_allowed: false, purchases_allowed: false, authority_granted: false, payment_promised: false }
  };
  const challenge = {
    schema: 'axiom-agent-infrastructure-challenge.v1', challenge_id: 'infra:benchmark:effect-lab', repository: 'Zoverions/AXIOM-MESH',
    base_sha: BENCHMARK_REVISION, class: 'hardware-validation', target: { offer_id: offer.offer_id, node_profile_sha256: PROFILE_SHA },
    plan: {
      allowed_operations: ['collect-benchmark-metrics'],
      prohibited_operations: ['production-node-enrollment','credential-issuance','secret-retrieval','firmware-change','boot-chain-change','disk-erasure','purchase-or-subscription','security-boundary-weakening','unbounded-remote-shell','permanent-system-mutation'],
      network: { mode: 'none', allowed_origins: [], credentials_allowed: false }
    },
    acceptance: ['Return only the fixed synthetic workload checksum and bounded monotonic elapsed observation.'],
    evidence_requirements: ['Bind exact plan, consumed durable head, benchmark script digest and final effect receipt.'],
    security_reporting: { public_safe: true, private_route: 'SECURITY.md' },
    boundaries: { production_enrollment_allowed: false, credential_issuance_allowed: false, secret_access_allowed: false, firmware_changes_allowed: false, purchases_allowed: false, destructive_actions_allowed: false, authority_granted: false, payment_promised: false },
    expires_at: '2026-08-18T15:15:00.000Z'
  };
  const attestationKeys = generateKeyPairSync('ed25519');
  const publicDer = attestationKeys.publicKey.export({ format: 'der', type: 'spki' });
  const attestationStatement = {
    attestation_id: 'attestation:benchmark:001', repository: 'Zoverions/AXIOM-MESH', offer_id: offer.offer_id,
    node_profile_sha256: PROFILE_SHA, nonce: NONCE, issued_at: '2026-08-18T15:00:00.000Z', expires_at: '2026-08-18T15:15:00.000Z',
    claims: { physical_ownership_verified: false, platform_backed_key_verified: false, secure_element_verified: false, boot_integrity_verified: false, external_verifier_confirmed: false }
  };
  const attestation = {
    schema: 'axiom-agent-device-attestation.v1', statement: attestationStatement,
    key: { algorithm: 'ed25519', public_key_spki_der_base64: publicDer.toString('base64'), fingerprint_sha256: sha256(publicDer) },
    signature_base64: sign(null, Buffer.from(canonicalJson(attestationStatement), 'utf8'), attestationKeys.privateKey).toString('base64'),
    evidence_refs: ['evidence:key-possession:benchmark'],
    boundaries: { production_enrollment_allowed: false, remote_execution_allowed: false, credential_issuance_allowed: false, secret_access_allowed: false, firmware_changes_allowed: false, platform_trust_inferred: false, authority_granted: false }
  };
  const authorization = {
    schema: 'axiom-agent-test-session-authorization.v1', authorization_id: 'session-auth:benchmark:001', repository: 'Zoverions/AXIOM-MESH',
    sponsor: { type: 'human', id: 'sponsor:benchmark-human', approval_ref: 'approval:issue:1155' },
    subject: { type: 'machine', id: 'agent:benchmark-runtime' },
    challenge: { challenge_id: challenge.challenge_id, offer_id: offer.offer_id, node_profile_sha256: PROFILE_SHA },
    attestation: { attestation_id: attestationStatement.attestation_id, key_fingerprint_sha256: attestation.key.fingerprint_sha256 },
    timing: { issued_at: '2026-08-18T15:04:00.000Z', not_before: '2026-08-18T15:05:00.000Z', expires_at: '2026-08-18T15:10:00.000Z', maximum_duration_seconds: 300 },
    scope: { allowed_operations: ['collect-benchmark-metrics'], network: { mode: 'none', allowed_origins: [] }, filesystem_scope: 'disposable-workspace-only', credentials_allowed: false, secret_access_allowed: false, interactive_shell_allowed: false, unbounded_remote_shell_allowed: false },
    revocation: { revocable: true, one_time: true, fail_closed_on_unknown: true, revocation_ref: 'revocation:benchmark:001' },
    effects: { effect_reachable: false, production_enrollment: false, persistent_remote_administration: false, credentials_issued: false, secrets_accessed: false, firmware_changed: false, boot_chain_changed: false, purchase_performed: false, destructive_action_performed: false, permanent_system_mutation: false, deployment_authority: false, capability_promoted: false }
  };
  return { offer, challenge, attestation, authorization };
}

export function buildBenchmarkIsolationReceipt() {
  const evidence = {
    baseline: {
      container_pid_namespace: 'pid:[400]', container_mount_namespace: 'mnt:[401]', container_network_namespace: 'net:[402]',
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
    revision: BENCHMARK_REVISION,
    platform: { operating_system: 'linux', architecture: 'x64', kernel_release: '6.8.0-test', runner_pid_namespace: 'pid:[200]', runner_mount_namespace: 'mnt:[201]', runner_network_namespace: 'net:[202]' },
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

export function createBenchmarkFixture() {
  const { offer, challenge, attestation, authorization } = buildObjects();
  const lifecycleKeys = benchmarkKeyPair();
  const ledger = new AgentTestSessionLifecycleLedger({ ledgerId: 'session-ledger:benchmark:001', ledgerPrivateKey: lifecycleKeys.privateKey });
  ledger.issue(authorization, { eventId: 'event:benchmark:issued', occurredAt: authorization.timing.issued_at, challenge, offer, attestation, expectedNonce: NONCE, now: NOW });
  const lifecycleTranscript = ledger.exportTranscript();
  const lifecycleReceipt = ledger.receipt({ generatedAt: '2026-08-18T15:04:30.000Z' });
  const platformProfile = {
    schema: 'axiom-agent-executor-platform-profile.v1', profile_id: 'platform:benchmark:linux-x64', operating_system: 'linux', architecture: 'x64',
    fact_status: 'measured', source_ref: 'evidence:benchmark:linux-x64',
    claims: { platform_trust_inferred: false, secure_boot_verified: false, platform_backed_key_verified: false, privileged_executor_available: false, remote_administration_enabled: false, authority_granted: false }
  };
  const plan = compileAgentExecutorDryRunPlan({ authorization, challenge, offer, attestation, expectedNonce: NONCE, now: NOW, lifecycleTranscript, lifecycleReceipt, trustedLifecycleLedgerPublicKey: ledger.ledgerPublicKey, platformProfile });
  const root = mkdtempSync(join(tmpdir(), 'axiom-benchmark-effect-'));
  const storeKeys = benchmarkKeyPair();
  const store = AgentExecutorDurableStateStore.open({
    stateRoot: root, storeId: 'executor-durable:benchmark:test', storePrivateKey: storeKeys.privateKey,
    lifecyclePrivateKey: lifecycleKeys.privateKey, plan, initialLifecycleTranscript: lifecycleTranscript,
    initialLifecycleReceipt: lifecycleReceipt, now: '2026-08-18T15:05:00.000Z', leaseSeconds: 900,
    clock: () => '2026-08-18T15:05:00.000Z'
  });
  const issuer = benchmarkKeyPair();
  const executor = benchmarkKeyPair();
  const admission = createAgentCollectBenchmarkMetricsEffectAdmission({
    admissionId: 'effect-admission:benchmark:test', issuerId: 'issuer:benchmark:test', issuerPrivateKey: issuer.privateKey,
    plan, revision: BENCHMARK_REVISION, notBefore: '2026-08-18T15:04:50.000Z', expiresAt: '2026-08-18T15:09:00.000Z'
  });
  const isolation = buildBenchmarkIsolationReceipt();
  const controller = new AgentCollectBenchmarkMetricsEffectController({
    durableStore: store, executorPrivateKey: executor.privateKey, admission,
    trustedAdmissionIssuerPublicKey: issuer.publicKey, isolationConformanceReceipt: isolation, revision: BENCHMARK_REVISION
  });
  return { offer, challenge, attestation, authorization, lifecycleKeys, ledger, lifecycleTranscript, lifecycleReceipt, plan, root, storeKeys, store, issuer, executor, admission, isolation, controller };
}

export function cleanupBenchmarkFixture(current) {
  try { current.store?.release(); } catch {}
  rmSync(current.root, { recursive: true, force: true });
}
