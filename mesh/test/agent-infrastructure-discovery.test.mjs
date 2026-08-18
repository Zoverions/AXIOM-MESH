import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('../../', import.meta.url);

async function readJson(relative) {
  return JSON.parse(await readFile(new URL(relative, ROOT), 'utf8'));
}

test('infrastructure discovery points only to existing bounded contracts', async () => {
  const discovery = await readJson('agent-commons/infrastructure-lab.json');
  assert.equal(discovery.schema, 'axiom-agent-infrastructure-lab-discovery.v1');
  assert.equal(discovery.repository, 'Zoverions/AXIOM-MESH');
  assert.equal(discovery.architecture, 'docs/architecture/AGENT-COMMONS.md');

  const contractPaths = [
    discovery.compute_node_profile_contract,
    discovery.offer_contract,
    discovery.challenge_contract,
    discovery.result_contract,
    discovery.device_attestation_contract,
    discovery.test_session_authorization_contract,
    discovery.test_session_lifecycle_event_contract,
    discovery.test_session_lifecycle_receipt_contract,
    discovery.test_session_lifecycle_transcript_contract,
    discovery.executor_platform_profile_contract,
    discovery.executor_dry_run_plan_contract,
    discovery.executor_conformance_receipt_contract,
    discovery.executor_durable_state_record_contract,
    discovery.executor_durable_state_receipt_contract,
    discovery.executor_isolation_profile_contract,
    discovery.linux_isolation_conformance_receipt_contract,
    discovery.read_system_facts_effect_admission_contract,
    discovery.read_system_facts_effect_receipt_contract
  ];
  for (const path of contractPaths) {
    assert.equal(typeof path, 'string');
    assert.ok(!path.includes('..'));
    const document = await readJson(path);
    assert.equal(typeof document.$schema, 'string');
  }

  const identities = [
    [discovery.device_attestation_contract, 'agent-device-attestation.v1.schema.json', 'axiom-agent-device-attestation.v1'],
    [discovery.test_session_authorization_contract, 'agent-test-session-authorization.v1.schema.json', 'axiom-agent-test-session-authorization.v1'],
    [discovery.test_session_lifecycle_event_contract, 'agent-test-session-lifecycle-event.v1.schema.json', 'axiom-agent-test-session-lifecycle-event.v1'],
    [discovery.test_session_lifecycle_receipt_contract, 'agent-test-session-lifecycle-receipt.v1.schema.json', 'axiom-agent-test-session-lifecycle-receipt.v1'],
    [discovery.test_session_lifecycle_transcript_contract, 'agent-test-session-lifecycle-transcript.v1.schema.json', 'axiom-agent-test-session-lifecycle-transcript.v1'],
    [discovery.executor_platform_profile_contract, 'agent-executor-platform-profile.v1.schema.json', 'axiom-agent-executor-platform-profile.v1'],
    [discovery.executor_dry_run_plan_contract, 'agent-executor-dry-run-plan.v1.schema.json', 'axiom-agent-executor-dry-run-plan.v1'],
    [discovery.executor_conformance_receipt_contract, 'agent-executor-conformance-receipt.v1.schema.json', 'axiom-agent-executor-conformance-receipt.v1'],
    [discovery.executor_durable_state_record_contract, 'agent-executor-durable-state-record.v1.schema.json', 'axiom-agent-executor-durable-state-record.v1'],
    [discovery.executor_durable_state_receipt_contract, 'agent-executor-durable-state-receipt.v1.schema.json', 'axiom-agent-executor-durable-state-receipt.v1'],
    [discovery.executor_isolation_profile_contract, 'agent-executor-isolation-profile.v1.schema.json', 'axiom-agent-executor-isolation-profile.v1'],
    [discovery.linux_isolation_conformance_receipt_contract, 'agent-linux-isolation-conformance-receipt.v1.schema.json', 'axiom-agent-linux-isolation-conformance-receipt.v1'],
    [discovery.read_system_facts_effect_admission_contract, 'agent-read-system-facts-effect-admission.v1.schema.json', 'axiom-agent-read-system-facts-effect-admission.v1'],
    [discovery.read_system_facts_effect_receipt_contract, 'agent-read-system-facts-effect-receipt.v1.schema.json', 'axiom-agent-read-system-facts-effect-receipt.v1']
  ];
  for (const [path, idSuffix, schema] of identities) {
    const contract = await readJson(path);
    assert.equal(contract.$id, `https://axiom.invalid/schemas/${idSuffix}`);
    assert.equal(contract.properties.schema.const, schema);
  }

  const threatModel = await readJson(discovery.executor_threat_model);
  assert.equal(threatModel.schema, 'axiom-agent-pre-executor-threat-model.v1');
  assert.equal(threatModel.phase, 'pre-executor-dry-run');
  assert.ok(Array.isArray(threatModel.attack_classes));
  assert.ok(threatModel.attack_classes.length >= 10);
  for (const key of Object.keys(threatModel.boundaries)) assert.equal(threatModel.boundaries[key], false, `threat-model boundary ${key} must remain false`);

  const conformanceThreatModel = await readJson(discovery.executor_conformance_threat_model);
  assert.equal(conformanceThreatModel.schema, 'axiom-agent-executor-conformance-threat-model.v1');
  assert.equal(conformanceThreatModel.phase, 'executor-conformance-virtual-sandbox');
  assert.ok(Array.isArray(conformanceThreatModel.attack_classes));
  assert.ok(conformanceThreatModel.attack_classes.length >= 15);
  assert.ok(Array.isArray(conformanceThreatModel.promotion_blockers));
  assert.ok(conformanceThreatModel.promotion_blockers.length >= 6);
  for (const key of Object.keys(conformanceThreatModel.boundaries)) assert.equal(conformanceThreatModel.boundaries[key], false, `conformance threat-model boundary ${key} must remain false`);

  const durableThreatModel = await readJson(discovery.executor_durable_state_threat_model);
  assert.equal(durableThreatModel.schema, 'axiom-agent-executor-durable-state-threat-model.v1');
  assert.equal(durableThreatModel.phase, 'durable-atomic-executor-lifecycle-state');
  assert.equal(durableThreatModel.storage_properties.dedicated_control_state_filesystem_write_enabled, true);
  assert.equal(durableThreatModel.storage_properties.repository_workspace_write_enabled, false);
  assert.equal(durableThreatModel.storage_properties.power_loss_media_survival_claimed, false);
  assert.ok(Array.isArray(durableThreatModel.attack_classes));
  assert.ok(durableThreatModel.attack_classes.length >= 12);
  assert.ok(Array.isArray(durableThreatModel.promotion_blockers));
  assert.ok(durableThreatModel.promotion_blockers.length >= 10);
  for (const key of Object.keys(durableThreatModel.boundaries)) assert.equal(durableThreatModel.boundaries[key], false, `durable threat-model boundary ${key} must remain false`);

  const isolationCatalog = await readJson(discovery.executor_isolation_policy_catalog);
  assert.equal(isolationCatalog.schema, 'axiom-agent-executor-isolation-policy-catalog.v1');
  assert.deepEqual(Object.keys(isolationCatalog.profiles), ['linux', 'macos', 'windows']);
  assert.ok(Array.isArray(isolationCatalog.common_controls));
  assert.ok(isolationCatalog.common_controls.length >= 15);
  for (const policy of Object.values(isolationCatalog.profiles)) {
    assert.equal(policy.hosted_ci_sufficient, false);
    assert.equal(policy.physical_device_evidence_required_before_production_promotion, true);
  }
  for (const key of Object.keys(isolationCatalog.boundaries)) assert.equal(isolationCatalog.boundaries[key], false, `isolation catalog boundary ${key} must remain false`);

  const isolationThreatModel = await readJson(discovery.executor_isolation_threat_model);
  assert.equal(isolationThreatModel.schema, 'axiom-agent-executor-isolation-threat-model.v1');
  assert.equal(isolationThreatModel.phase, 'platform-isolation-profile-pre-effect');
  assert.ok(Array.isArray(isolationThreatModel.attack_classes));
  assert.ok(isolationThreatModel.attack_classes.length >= 16);
  assert.ok(Array.isArray(isolationThreatModel.promotion_blockers));
  assert.ok(isolationThreatModel.promotion_blockers.length >= 8);
  for (const key of Object.keys(isolationThreatModel.boundaries)) assert.equal(isolationThreatModel.boundaries[key], false, `isolation threat-model boundary ${key} must remain false`);

  const linuxIsolationThreatModel = await readJson(discovery.linux_isolation_adapter_threat_model);
  assert.equal(linuxIsolationThreatModel.schema, 'axiom-agent-linux-isolation-adapter-threat-model.v1');
  assert.equal(linuxIsolationThreatModel.phase, 'fixed-probe-linux-kernel-isolation');
  assert.equal(linuxIsolationThreatModel.effect_scope.disposable_local_container_create_start_kill_remove, true);
  assert.equal(linuxIsolationThreatModel.effect_scope.fixed_probe_process_execution, true);
  assert.equal(linuxIsolationThreatModel.effect_scope.disposable_container_tmpfs_mutation, true);
  assert.equal(linuxIsolationThreatModel.effect_scope.caller_supplied_image_or_command, false);
  assert.equal(linuxIsolationThreatModel.effect_scope.repository_bind_mount, false);
  assert.equal(linuxIsolationThreatModel.effect_scope.host_root_bind_mount, false);
  assert.equal(linuxIsolationThreatModel.effect_scope.docker_socket_mount, false);
  assert.equal(linuxIsolationThreatModel.effect_scope.credential_or_secret_mount, false);
  assert.equal(linuxIsolationThreatModel.effect_scope.probe_network_connectivity, false);
  assert.ok(Array.isArray(linuxIsolationThreatModel.attack_classes));
  assert.ok(linuxIsolationThreatModel.attack_classes.length >= 16);
  assert.ok(Array.isArray(linuxIsolationThreatModel.promotion_blockers));
  assert.ok(linuxIsolationThreatModel.promotion_blockers.length >= 8);
  for (const key of Object.keys(linuxIsolationThreatModel.boundaries)) assert.equal(linuxIsolationThreatModel.boundaries[key], false, `Linux isolation threat-model boundary ${key} must remain false`);

  assert.deepEqual(discovery.challenge_classes, [
    'hardware-validation', 'test-node-provisioning', 'deployment-reproduction',
    'infrastructure-diagnostics', 'support-assistance', 'device-lab-capacity'
  ]);

  for (const key of [
    'device_key_possession_verification_available',
    'test_session_lifecycle_evidence_available',
    'test_session_lifecycle_receipts_available',
    'executor_dry_run_compiler_available',
    'executor_conformance_virtual_sandbox_available',
    'executor_durable_state_lab_available',
    'executor_isolation_profile_validation_available',
    'linux_isolation_fixed_probe_conformance_available',
    'linux_isolation_hosted_ci_evidence_available',
    'linux_isolation_fixed_probe_real_process_effects_enabled',
    'linux_isolation_fixed_probe_disposable_filesystem_effects_enabled',
    'read_system_facts_effect_admission_available',
    'read_system_facts_plan_bound_effect_lab_available',
    'read_system_facts_effect_receipts_available',
    'read_system_facts_real_process_effects_enabled',
    'executor_durable_control_state_filesystem_write_enabled'
  ]) assert.equal(discovery[key], true, `${key} must be true`);

  for (const key of [
    'executor_dry_run_effects_reachable',
    'executor_conformance_real_effects_reachable',
    'executor_durable_state_real_effects_reachable',
    'executor_isolation_real_effects_reachable',
    'platform_isolation_verified',
    'hosted_ci_physical_device_proof',
    'arbitrary_repository_code_isolation_verified',
    'compiled_plan_effect_admission_enabled',
    'read_system_facts_repository_code_execution_enabled',
    'read_system_facts_network_effects_enabled',
    'general_executor_available',
    'test_session_effects_reachable',
    'production_lifecycle_persistence_enabled',
    'production_executor_persistence_enabled',
    'remote_execution_enabled',
    'production_node_enrollment_enabled',
    'credential_issuance_enabled',
    'secret_access_enabled',
    'firmware_changes_enabled',
    'purchases_enabled',
    'authority_granted',
    'payment_promised'
  ]) assert.equal(discovery[key], false, `${key} must remain false`);
});
