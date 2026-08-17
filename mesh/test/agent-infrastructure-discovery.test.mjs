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
    discovery.executor_durable_state_receipt_contract
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
    [discovery.executor_durable_state_receipt_contract, 'agent-executor-durable-state-receipt.v1.schema.json', 'axiom-agent-executor-durable-state-receipt.v1']
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
  for (const key of Object.keys(threatModel.boundaries)) {
    assert.equal(threatModel.boundaries[key], false, `threat-model boundary ${key} must remain false`);
  }

  const conformanceThreatModel = await readJson(discovery.executor_conformance_threat_model);
  assert.equal(conformanceThreatModel.schema, 'axiom-agent-executor-conformance-threat-model.v1');
  assert.equal(conformanceThreatModel.phase, 'executor-conformance-virtual-sandbox');
  assert.ok(Array.isArray(conformanceThreatModel.attack_classes));
  assert.ok(conformanceThreatModel.attack_classes.length >= 15);
  assert.ok(Array.isArray(conformanceThreatModel.promotion_blockers));
  assert.ok(conformanceThreatModel.promotion_blockers.length >= 6);
  for (const key of Object.keys(conformanceThreatModel.boundaries)) {
    assert.equal(conformanceThreatModel.boundaries[key], false, `conformance threat-model boundary ${key} must remain false`);
  }

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
  for (const key of Object.keys(durableThreatModel.boundaries)) {
    assert.equal(durableThreatModel.boundaries[key], false, `durable threat-model boundary ${key} must remain false`);
  }

  assert.deepEqual(discovery.challenge_classes, [
    'hardware-validation',
    'test-node-provisioning',
    'deployment-reproduction',
    'infrastructure-diagnostics',
    'support-assistance',
    'device-lab-capacity'
  ]);

  assert.equal(discovery.device_key_possession_verification_available, true);
  assert.equal(discovery.test_session_lifecycle_evidence_available, true);
  assert.equal(discovery.test_session_lifecycle_receipts_available, true);
  assert.equal(discovery.executor_dry_run_compiler_available, true);
  assert.equal(discovery.executor_conformance_virtual_sandbox_available, true);
  assert.equal(discovery.executor_durable_state_lab_available, true);
  assert.equal(discovery.executor_durable_control_state_filesystem_write_enabled, true);

  for (const key of [
    'executor_dry_run_effects_reachable',
    'executor_conformance_real_effects_reachable',
    'executor_durable_state_real_effects_reachable',
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
  ]) {
    assert.equal(discovery[key], false, `${key} must remain false`);
  }
});
