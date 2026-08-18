import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('../../', import.meta.url);
async function readJson(relative) {
  return JSON.parse(await readFile(new URL(relative, ROOT), 'utf8'));
}

test('benchmark effect discovery binds exact contracts, threat ledger and nonclaims', async () => {
  const discovery = await readJson('agent-commons/infrastructure-lab.json');
  assert.equal(discovery.collect_benchmark_metrics_effect_admission_contract, 'agent-commons/contracts/agent-collect-benchmark-metrics-effect-admission.v1.schema.json');
  assert.equal(discovery.collect_benchmark_metrics_effect_receipt_contract, 'agent-commons/contracts/agent-collect-benchmark-metrics-effect-receipt.v1.schema.json');
  assert.equal(discovery.collect_benchmark_metrics_effect_threat_model, 'agent-commons/collect-benchmark-metrics-effect-threat-model.json');

  const admission = await readJson(discovery.collect_benchmark_metrics_effect_admission_contract);
  assert.equal(admission.$id, 'https://axiom.invalid/schemas/agent-collect-benchmark-metrics-effect-admission.v1.schema.json');
  assert.equal(admission.properties.schema.const, 'axiom-agent-collect-benchmark-metrics-effect-admission.v1');
  assert.equal(admission.properties.statement.properties.operation_id.const, 'collect-benchmark-metrics');
  assert.equal(admission.properties.statement.properties.benchmark_policy_id.const, 'synthetic-lcg-u32-262144-v1');
  for (const key of [
    'general_executor_authority','arbitrary_benchmark_authority','host_telemetry_authority','repository_code_execution_authority',
    'network_authority','credential_authority','secret_authority','remote_hardware_authority','production_authority',
    'deployment_authority','capability_promotion_authority','axiom_authority_granted'
  ]) assert.equal(admission.properties.statement.properties[key].const, false, `benchmark admission ${key} must remain false`);

  const receipt = await readJson(discovery.collect_benchmark_metrics_effect_receipt_contract);
  assert.equal(receipt.$id, 'https://axiom.invalid/schemas/agent-collect-benchmark-metrics-effect-receipt.v1.schema.json');
  assert.equal(receipt.properties.schema.const, 'axiom-agent-collect-benchmark-metrics-effect-receipt.v1');
  const observation = receipt.properties.statement.properties.observation.properties;
  assert.equal(observation.workload_id.const, 'lcg-u32-262144-v1');
  assert.equal(observation.iterations.const, 262144);
  assert.equal(observation.checksum_u32.const, 1679840888);
  assert.equal(observation.timer_source.const, 'process.hrtime.bigint');
  assert.equal(observation.host_telemetry_read.const, false);
  for (const key of ['host_telemetry_observed','machine_comparison_score_claimed','production_slo_claimed','arbitrary_benchmark_used','repository_code_executed','network_performed','task_success_claimed','general_executor_available','axiom_authority_granted']) {
    assert.equal(receipt.properties.statement.properties[key].const, false, `benchmark receipt ${key} must remain false`);
  }

  const threat = await readJson(discovery.collect_benchmark_metrics_effect_threat_model);
  assert.equal(threat.schema, 'axiom-agent-collect-benchmark-metrics-effect-threat-model.v1');
  assert.equal(threat.phase, 'plan-bound-synthetic-benchmark-hosted-ci-effect');
  assert.equal(threat.effect_scope.fixed_synthetic_benchmark_process_execution, true);
  assert.equal(threat.effect_scope.monotonic_elapsed_time_observation, true);
  assert.equal(threat.effect_scope.fixed_checksum_observation, true);
  assert.equal(threat.effect_scope.caller_supplied_benchmark_code_or_input, false);
  assert.equal(threat.effect_scope.host_telemetry_read, false);
  assert.equal(threat.effect_scope.repository_code_execution, false);
  assert.equal(threat.effect_scope.machine_comparison_score, false);
  assert.equal(threat.effect_scope.production_slo_claim, false);
  assert.ok(threat.attack_classes.length >= 20);
  assert.ok(threat.required_controls.length >= 20);
  assert.ok(threat.promotion_blockers.length >= 10);
  for (const key of Object.keys(threat.boundaries)) assert.equal(threat.boundaries[key], false, `benchmark threat boundary ${key} must remain false`);

  for (const key of [
    'collect_benchmark_metrics_effect_admission_available','collect_benchmark_metrics_plan_bound_effect_lab_available',
    'collect_benchmark_metrics_effect_receipts_available','collect_benchmark_metrics_real_process_effects_enabled',
    'collect_benchmark_metrics_synthetic_workload_enabled'
  ]) assert.equal(discovery[key], true, `${key} must be true`);
  for (const key of [
    'collect_benchmark_metrics_arbitrary_benchmark_enabled','collect_benchmark_metrics_host_telemetry_enabled',
    'collect_benchmark_metrics_repository_code_execution_enabled','collect_benchmark_metrics_network_effects_enabled',
    'collect_benchmark_metrics_machine_comparison_score_enabled','collect_benchmark_metrics_production_slo_claim_enabled',
    'compiled_plan_effect_admission_enabled','general_executor_available','remote_execution_enabled','production_node_enrollment_enabled',
    'credential_issuance_enabled','secret_access_enabled','authority_granted'
  ]) assert.equal(discovery[key], false, `${key} must remain false`);
});
