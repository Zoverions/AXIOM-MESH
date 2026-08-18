import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('../../', import.meta.url);
const readJson = relative => readFile(new URL(relative, ROOT), 'utf8').then(JSON.parse);

test('read-system-facts effect discovery binds its dedicated threat ledger', async () => {
  const discovery = await readJson('agent-commons/infrastructure-lab.json');
  assert.equal(discovery.read_system_facts_effect_threat_model, 'agent-commons/read-system-facts-effect-threat-model.json');
  const threat = await readJson(discovery.read_system_facts_effect_threat_model);
  assert.equal(threat.schema, 'axiom-agent-read-system-facts-effect-threat-model.v1');
  assert.equal(threat.phase, 'plan-bound-read-system-facts-hosted-ci-effect');
  assert.equal(threat.effect_scope.fixed_read_system_facts_process_execution, true);
  assert.equal(threat.effect_scope.disposable_container_lifecycle_effects, true);
  assert.equal(threat.effect_scope.durable_lifecycle_control_state_filesystem_writes, true);
  assert.equal(threat.effect_scope.sanitized_system_fact_output, true);
  for (const key of [
    'caller_supplied_command_or_argv', 'repository_code_execution', 'repository_workspace_mount_or_mutation',
    'network_effects', 'credential_or_secret_access', 'package_or_service_control',
    'remote_or_contributed_hardware_access', 'production_node_enrollment', 'deployment_or_capability_authority'
  ]) assert.equal(threat.effect_scope[key], false, `${key} must remain false`);
  assert.ok(threat.attack_classes.length >= 18);
  assert.ok(threat.required_controls.length >= 15);
  assert.ok(threat.promotion_blockers.length >= 10);
  for (const [key, value] of Object.entries(threat.boundaries)) {
    assert.equal(value, false, `read-system-facts threat boundary ${key} must remain false`);
  }
});
