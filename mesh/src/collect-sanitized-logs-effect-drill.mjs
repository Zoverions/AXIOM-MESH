import { generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { arch } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import { canonicalJson, digestObject, sha256 } from './lib/canonical.mjs';
import { compileAgentExecutorDryRunPlan } from './lib/agent-executor-dry-run.mjs';
import { AgentExecutorDurableStateStore } from './lib/agent-executor-durable-state.mjs';
import { verifyAgentExecutorDurableStateReceipt } from './lib/agent-executor-durable-format.mjs';
import { AgentTestSessionLifecycleLedger } from './lib/agent-test-session-lifecycle.mjs';
import {
  AGENT_LINUX_ISOLATION_DOCKER_BINARY,
  AGENT_LINUX_ISOLATION_ENTRYPOINT,
  verifyAgentLinuxIsolationConformanceReceipt
} from './lib/agent-linux-isolation-conformance.mjs';
import {
  createAgentCollectSanitizedLogsEffectAdmission,
  verifyAgentCollectSanitizedLogsEffectAdmission
} from './lib/agent-collect-sanitized-logs-effect-admission.mjs';
import {
  AGENT_COLLECT_SANITIZED_LOGS_ADAPTER_SCRIPT,
  AGENT_COLLECT_SANITIZED_LOGS_ADAPTER_SCRIPT_SHA256,
  AGENT_COLLECT_SANITIZED_LOGS_FORBIDDEN_SENTINEL,
  AGENT_COLLECT_SANITIZED_LOGS_SOURCE_LOGICAL_PATH,
  AgentCollectSanitizedLogsEffectController,
  verifyAgentCollectSanitizedLogsEffectReceipt
} from './lib/agent-collect-sanitized-logs-effect.mjs';

const REVISION = process.env.GITHUB_SHA;
const LAB_OPT_IN = process.env.AXIOM_AGENT_COLLECT_SANITIZED_LOGS_EFFECT_LAB;
const ISOLATION_RECEIPT_PATH = process.env.AXIOM_AGENT_LINUX_ISOLATION_RECEIPT;
const RUNNER_TEMP = process.env.RUNNER_TEMP;
const MAX_INPUT_BYTES = 512 * 1024;
const MAX_OUTPUT_BYTES = 4096;
const PROCESS_TIMEOUT_MS = 5000;
const PROFILE_SHA = 'e'.repeat(64);
const NONCE_PREFIX = 'collect_sanitized_logs_effect_nonce_';

function fail(message) { throw new Error(message); }
function assert(value, message) { if (!value) fail(message); }
function iso(ms) { return new Date(ms).toISOString(); }
function keyPair() {
  const pair = generateKeyPairSync('ed25519');
  return {
    privateKey: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
  };
}
function safeDockerEnvironment() {
  return { PATH: '/usr/bin:/bin', HOME: '/nonexistent', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', DOCKER_HOST: 'unix:///var/run/docker.sock', DOCKER_CONTEXT: 'default' };
}
function docker(args, { timeout = PROCESS_TIMEOUT_MS, maxBuffer = MAX_OUTPUT_BYTES } = {}) {
  return spawnSync(AGENT_LINUX_ISOLATION_DOCKER_BINARY, args, {
    encoding: 'utf8', env: safeDockerEnvironment(), timeout, maxBuffer, windowsHide: true, shell: false
  });
}
function absent(name) { return docker(['container', 'inspect', name], { timeout: 3000, maxBuffer: 1024 }).status !== 0; }
function cleanup(name) { docker(['rm', '-f', name], { timeout: 3000, maxBuffer: 1024 }); return absent(name); }
function fixedArgs(name, imageId) {
  return [
    'run', '--name', name, '--rm', '--init', '--network', 'none', '--read-only',
    '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges=true', '--pids-limit', '32',
    '--memory', '128m', '--memory-swap', '128m', '--cpus', '0.5', '--user', '10001:10001',
    '--tmpfs', '/work:rw,noexec,nosuid,nodev,size=16777216,mode=700,uid=10001,gid=10001',
    '--tmpfs', '/tmp:rw,noexec,nosuid,nodev,size=8388608,mode=700,uid=10001,gid=10001',
    '--tmpfs', '/var/lib/axiom-mesh:rw,noexec,nosuid,nodev,size=8388608,mode=700,uid=10001,gid=10001',
    '--workdir', '/work', '--entrypoint', AGENT_LINUX_ISOLATION_ENTRYPOINT, imageId,
    '--input-type=module', '-e', AGENT_COLLECT_SANITIZED_LOGS_ADAPTER_SCRIPT
  ];
}
function executeCollector(imageId, descriptor) {
  assert(descriptor.absolute_executable === AGENT_LINUX_ISOLATION_ENTRYPOINT, 'sanitized-log descriptor executable drifted');
  assert(descriptor.adapter_script_sha256 === AGENT_COLLECT_SANITIZED_LOGS_ADAPTER_SCRIPT_SHA256, 'sanitized-log descriptor script digest drifted');
  assert(descriptor.source_logical_path === AGENT_COLLECT_SANITIZED_LOGS_SOURCE_LOGICAL_PATH, 'sanitized-log descriptor path drifted');
  const name = `axiom-collect-logs-${randomBytes(6).toString('hex')}`;
  let result;
  let cleanupVerified = false;
  try { result = docker(fixedArgs(name, imageId)); }
  finally { cleanupVerified = cleanup(name); }
  assert(cleanupVerified, 'sanitized-log effect container cleanup could not be verified');
  if (result.error || result.status !== 0) fail(`sanitized-log effect failed: ${String(result.stderr || result.error?.message || '').slice(0, 1200)}`);
  const stderr = String(result.stderr || '');
  assert(stderr.length === 0, 'sanitized-log effect wrote stderr');
  const output = String(result.stdout || '').trim();
  assert(output.length > 0 && Buffer.byteLength(output, 'utf8') <= MAX_OUTPUT_BYTES, 'sanitized-log effect output is invalid');
  assert(!output.includes(AGENT_COLLECT_SANITIZED_LOGS_FORBIDDEN_SENTINEL), 'forbidden log sentinel escaped sanitizer');
  let parsed;
  try { parsed = JSON.parse(output); } catch { fail('sanitized-log effect output is not JSON'); }
  assert(parsed && Array.isArray(parsed.records), 'sanitized-log effect output records missing');
  return Object.freeze({
    adapter_script_sha256: AGENT_COLLECT_SANITIZED_LOGS_ADAPTER_SCRIPT_SHA256,
    source_logical_path: AGENT_COLLECT_SANITIZED_LOGS_SOURCE_LOGICAL_PATH,
    source_record_count: parsed.source_record_count,
    source_bytes: parsed.source_bytes,
    sanitized_record_count: parsed.records.length,
    sanitized_output: output,
    output_sha256: sha256(output),
    output_bytes: Buffer.byteLength(output, 'utf8'),
    source_open_nofollow: true,
    source_regular_file: true,
    source_inside_disposable_workspace: true,
    forbidden_sentinel_absent: true,
    exit_status: 0,
    stderr_empty: true,
    network_mode: 'none',
    repository_code_execution: false,
    container_absent_after_cleanup: true
  });
}
function boundedJsonFile(path, root, label) {
  assert(typeof path === 'string' && isAbsolute(path), `${label} path must be absolute`);
  const inputInfo = lstatSync(path);
  assert(inputInfo.isFile() && !inputInfo.isSymbolicLink() && inputInfo.size > 0 && inputInfo.size <= MAX_INPUT_BYTES, `${label} must be a bounded non-symlink regular file`);
  const resolvedRoot = realpathSync(root);
  const resolvedPath = realpathSync(path);
  const rel = relative(resolvedRoot, resolvedPath);
  assert(rel && !rel.startsWith('..') && !isAbsolute(rel), `${label} must stay inside RUNNER_TEMP`);
  return JSON.parse(readFileSync(resolvedPath, 'utf8'));
}
function objects(nowMs) {
  const offerId = 'offer:collect-sanitized-logs:hosted-ci';
  const challengeId = 'infra:collect-sanitized-logs:effect';
  const nonce = `${NONCE_PREFIX}${randomBytes(16).toString('hex')}`;
  const offer = {
    schema: 'axiom-agent-infrastructure-offer.v1', offer_id: offerId, repository: 'Zoverions/AXIOM-MESH',
    publisher: { type: 'human', id: 'contributor:hosted-ci-log-lab' },
    node_profile: { schema: 'axiom-compute-node-profile.v1', profile_id: 'node:hosted-ci:collect-logs', profile_sha256: PROFILE_SHA },
    custody: { physical_control: 'contributor', remote_access_available: false },
    availability: { starts_at: iso(nowMs - 60_000), expires_at: iso(nowMs + 600_000), maximum_sessions: 1 },
    challenge_classes: ['hardware-validation'], evidence: { fact_status: 'measured', evidence_refs: ['evidence:hosted-ci:isolation'] },
    boundaries: { destructive_actions_allowed: false, production_enrollment_allowed: false, credential_issuance_allowed: false, secret_access_allowed: false, firmware_changes_allowed: false, purchases_allowed: false, authority_granted: false, payment_promised: false }
  };
  const challenge = {
    schema: 'axiom-agent-infrastructure-challenge.v1', challenge_id: challengeId, repository: 'Zoverions/AXIOM-MESH', base_sha: REVISION,
    class: 'hardware-validation', target: { offer_id: offerId, node_profile_sha256: PROFILE_SHA },
    plan: {
      allowed_operations: ['collect-sanitized-logs'],
      prohibited_operations: ['production-node-enrollment','credential-issuance','secret-retrieval','firmware-change','boot-chain-change','disk-erasure','purchase-or-subscription','security-boundary-weakening','unbounded-remote-shell','permanent-system-mutation'],
      network: { mode: 'none', allowed_origins: [], credentials_allowed: false }
    },
    acceptance: ['Return only exact allowlisted synthetic log fields from the disposable workspace.'],
    evidence_requirements: ['Bind exact plan, consumed durable head, sanitizer digest and final effect receipt.'],
    security_reporting: { public_safe: true, private_route: 'SECURITY.md' },
    boundaries: { production_enrollment_allowed: false, credential_issuance_allowed: false, secret_access_allowed: false, firmware_changes_allowed: false, purchases_allowed: false, destructive_actions_allowed: false, authority_granted: false, payment_promised: false },
    expires_at: iso(nowMs + 300_000)
  };
  const attestationKeys = generateKeyPairSync('ed25519');
  const publicDer = attestationKeys.publicKey.export({ format: 'der', type: 'spki' });
  const attestationStatement = {
    attestation_id: 'attestation:collect-sanitized-logs:hosted-ci', repository: 'Zoverions/AXIOM-MESH', offer_id: offerId,
    node_profile_sha256: PROFILE_SHA, nonce, issued_at: iso(nowMs - 30_000), expires_at: iso(nowMs + 240_000),
    claims: { physical_ownership_verified: false, platform_backed_key_verified: false, secure_element_verified: false, boot_integrity_verified: false, external_verifier_confirmed: false }
  };
  const attestation = {
    schema: 'axiom-agent-device-attestation.v1', statement: attestationStatement,
    key: { algorithm: 'ed25519', public_key_spki_der_base64: publicDer.toString('base64'), fingerprint_sha256: sha256(publicDer) },
    signature_base64: sign(null, Buffer.from(canonicalJson(attestationStatement), 'utf8'), attestationKeys.privateKey).toString('base64'),
    evidence_refs: ['evidence:key-possession:hosted-ci-log-lab'],
    boundaries: { production_enrollment_allowed: false, remote_execution_allowed: false, credential_issuance_allowed: false, secret_access_allowed: false, firmware_changes_allowed: false, platform_trust_inferred: false, authority_granted: false }
  };
  const authorization = {
    schema: 'axiom-agent-test-session-authorization.v1', authorization_id: 'session-auth:collect-sanitized-logs:hosted-ci', repository: 'Zoverions/AXIOM-MESH',
    sponsor: { type: 'human', id: 'sponsor:agent-commons-log-lab', approval_ref: 'approval:issue:1142' }, subject: { type: 'machine', id: 'agent:hosted-ci-collect-logs' },
    challenge: { challenge_id: challengeId, offer_id: offerId, node_profile_sha256: PROFILE_SHA },
    attestation: { attestation_id: attestationStatement.attestation_id, key_fingerprint_sha256: attestation.key.fingerprint_sha256 },
    timing: { issued_at: iso(nowMs - 15_000), not_before: iso(nowMs - 5_000), expires_at: iso(nowMs + 175_000), maximum_duration_seconds: 180 },
    scope: { allowed_operations: ['collect-sanitized-logs'], network: { mode: 'none', allowed_origins: [] }, filesystem_scope: 'disposable-workspace-only', credentials_allowed: false, secret_access_allowed: false, interactive_shell_allowed: false, unbounded_remote_shell_allowed: false },
    revocation: { revocable: true, one_time: true, fail_closed_on_unknown: true, revocation_ref: 'revocation:collect-sanitized-logs:hosted-ci' },
    effects: { effect_reachable: false, production_enrollment: false, persistent_remote_administration: false, credentials_issued: false, secrets_accessed: false, firmware_changed: false, boot_chain_changed: false, purchase_performed: false, destructive_action_performed: false, permanent_system_mutation: false, deployment_authority: false, capability_promoted: false }
  };
  return { offer, challenge, attestation, authorization, nonce };
}
function preflight() {
  assert(process.platform === 'linux', 'sanitized-log effect laboratory requires Linux');
  assert(LAB_OPT_IN === '1', 'sanitized-log effect laboratory requires explicit opt-in');
  assert(process.env.CI === 'true' && process.env.GITHUB_ACTIONS === 'true', 'sanitized-log effect laboratory is hosted-CI-only');
  assert(typeof REVISION === 'string' && /^[a-f0-9]{40}$/.test(REVISION), 'GITHUB_SHA must bind exact revision');
  assert(typeof RUNNER_TEMP === 'string' && isAbsolute(RUNNER_TEMP), 'RUNNER_TEMP must be absolute');
  assert(typeof ISOLATION_RECEIPT_PATH === 'string', 'isolation receipt path is required');
  assert(realpathSync(AGENT_LINUX_ISOLATION_DOCKER_BINARY) === AGENT_LINUX_ISOLATION_DOCKER_BINARY, 'Docker binary path drifted');
}

function main() {
  preflight();
  const isolationReceipt = verifyAgentLinuxIsolationConformanceReceipt(boundedJsonFile(ISOLATION_RECEIPT_PATH, RUNNER_TEMP, 'isolation receipt'));
  assert(isolationReceipt.revision === REVISION, 'isolation receipt does not bind current revision');
  const nowMs = Date.now();
  const now = iso(nowMs);
  const { offer, challenge, attestation, authorization, nonce } = objects(nowMs);
  const lifecycleKeys = keyPair();
  const ledger = new AgentTestSessionLifecycleLedger({ ledgerId: 'session-ledger:collect-sanitized-logs:hosted-ci', ledgerPrivateKey: lifecycleKeys.privateKey });
  ledger.issue(authorization, { eventId: 'event:collect-sanitized-logs:issued', occurredAt: authorization.timing.issued_at, challenge, offer, attestation, expectedNonce: nonce, now: new Date(now) });
  const lifecycleTranscript = ledger.exportTranscript();
  const lifecycleReceipt = ledger.receipt({ generatedAt: iso(nowMs - 2_000) });
  const platformProfile = {
    schema: 'axiom-agent-executor-platform-profile.v1', profile_id: `platform:hosted-ci-log-lab:linux-${arch()}`,
    operating_system: 'linux', architecture: arch(), fact_status: 'measured', source_ref: `isolation-receipt:${isolationReceipt.receipt_digest}`,
    claims: { platform_trust_inferred: false, secure_boot_verified: false, platform_backed_key_verified: false, privileged_executor_available: false, remote_administration_enabled: false, authority_granted: false }
  };
  const plan = compileAgentExecutorDryRunPlan({ authorization, challenge, offer, attestation, expectedNonce: nonce, now: new Date(now), lifecycleTranscript, lifecycleReceipt, trustedLifecycleLedgerPublicKey: ledger.ledgerPublicKey, platformProfile });
  assert(plan.effects.effect_reachable === false && plan.steps.length === 1 && plan.steps[0].step_id === 'collect-sanitized-logs:builtin', 'sanitized-log dry-run plan boundary changed');

  const issuerKeys = keyPair();
  const admission = createAgentCollectSanitizedLogsEffectAdmission({
    admissionId: 'effect-admission:collect-sanitized-logs:hosted-ci', issuerId: 'issuer:agent-commons-hosted-ci-log-lab', issuerPrivateKey: issuerKeys.privateKey,
    plan, revision: REVISION, notBefore: iso(nowMs - 1_000), expiresAt: iso(nowMs + 120_000)
  });
  verifyAgentCollectSanitizedLogsEffectAdmission(admission, { trustedIssuerPublicKey: issuerKeys.publicKey, plan, expectedRevision: REVISION, now });

  const stateRoot = mkdtempSync(join(resolve(RUNNER_TEMP), 'axiom-collect-sanitized-logs-state-'));
  const storeKeys = keyPair();
  const executorKeys = keyPair();
  let store;
  let controller;
  let consumed = false;
  try {
    store = AgentExecutorDurableStateStore.open({
      stateRoot, storeId: 'executor-durable:collect-sanitized-logs:hosted-ci', storePrivateKey: storeKeys.privateKey,
      lifecyclePrivateKey: lifecycleKeys.privateKey, plan, initialLifecycleTranscript: lifecycleTranscript,
      initialLifecycleReceipt: lifecycleReceipt, now, leaseSeconds: 180, clock: () => iso(Date.now())
    });
    controller = new AgentCollectSanitizedLogsEffectController({
      durableStore: store, executorPrivateKey: executorKeys.privateKey, admission,
      trustedAdmissionIssuerPublicKey: issuerKeys.publicKey, isolationConformanceReceipt: isolationReceipt, revision: REVISION
    });
    const descriptor = controller.begin({
      currentLifecycleTranscript: lifecycleTranscript, currentLifecycleReceipt: lifecycleReceipt,
      trustedLifecyclePublicKey: ledger.ledgerPublicKey, revocationState: 'active', occurredAt: iso(Date.now())
    });
    consumed = true;
    assert(store.status === 'consumed' && store.generation === 2, 'sanitized-log durable consume was not committed before effect');
    const checkedConsumedHead = verifyAgentExecutorDurableStateReceipt(descriptor.durable_consume_head_receipt, {
      trustedStorePublicKey: store.storePublicKey, plan, expectedStoreId: store.storeId
    });
    assert(checkedConsumedHead.statement.lifecycle_status === 'consumed' && checkedConsumedHead.statement.generation === 2, 'sanitized-log signed consumed head is invalid before effect');
    const effectObservation = executeCollector(isolationReceipt.adapter.image_id, descriptor);
    const effectReceipt = controller.complete({ observation: effectObservation, finishedAt: iso(Date.now()) });
    verifyAgentCollectSanitizedLogsEffectReceipt(effectReceipt, {
      trustedExecutorPublicKey: controller.executorPublicKey, trustedAdmissionIssuerPublicKey: issuerKeys.publicKey,
      trustedDurableStorePublicKey: store.storePublicKey, durableConsumeHeadReceipt: descriptor.durable_consume_head_receipt,
      plan, admission, isolationConformanceReceipt: isolationReceipt
    });
    const durableHeadReceipt = store.headReceipt({ generatedAt: iso(Date.now()) });
    const checkedDurableHead = verifyAgentExecutorDurableStateReceipt(durableHeadReceipt, { trustedStorePublicKey: store.storePublicKey, plan, expectedStoreId: store.storeId });
    assert(checkedDurableHead.statement.generation === effectReceipt.statement.durable_final_generation, 'sanitized-log final durable head generation mismatch');
    assert(checkedDurableHead.statement.record_digest === effectReceipt.statement.durable_final_record_digest, 'sanitized-log final durable head digest mismatch');
    const bundleBody = {
      schema: 'axiom-agent-collect-sanitized-logs-effect-evidence-bundle.v1', revision: REVISION, plan, admission,
      admission_issuer_public_key: issuerKeys.publicKey, executor_public_key: controller.executorPublicKey,
      durable_store_public_key: store.storePublicKey, durable_consume_head_receipt: descriptor.durable_consume_head_receipt,
      durable_head_receipt: durableHeadReceipt, isolation_receipt_digest: isolationReceipt.receipt_digest, effect_receipt: effectReceipt,
      claims: {
        raw_log_exported: false, host_or_repository_logs_read: false, arbitrary_path_used: false,
        ephemeral_ci_admission_issuer_is_production_identity: false, external_human_approval_verified: false,
        global_revocation_currentness_claimed: false, physical_device_proof: false, general_executor_available: false
      }
    };
    const bundle = { ...bundleBody, bundle_digest: digestObject(bundleBody) };
    process.stdout.write(`${canonicalJson(bundle)}\n`);
  } catch (error) {
    if (consumed && controller && store?.status === 'consumed') {
      try { controller.interrupt({ occurredAt: iso(Date.now()), reasonCode: 'collect-sanitized-logs-effect-drill-failed' }); } catch {}
    }
    throw error;
  } finally {
    try { store?.release(); } catch {}
    rmSync(stateRoot, { recursive: true, force: true });
  }
}

try { main(); }
catch (error) {
  process.stderr.write(`Collect-sanitized-logs effect drill failed: ${String(error?.message || error).slice(0, 2000)}\n`);
  process.exit(1);
}
