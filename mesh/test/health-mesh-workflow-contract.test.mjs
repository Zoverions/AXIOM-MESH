import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(TEST_DIR, '../..');

const WORKFLOW_CONTRACT = 'mesh/contracts/health-mesh-workflow.v0.1.schema.json';
const FIXTURES = Object.freeze([
  'mesh/test/fixtures/health-mesh/non-invasive-assessment.json',
  'mesh/test/fixtures/health-mesh/supervised-venipuncture.json',
  'mesh/test/fixtures/health-mesh/post-draw-emergency.json'
]);

async function readJson(relativePath) {
  return JSON.parse(await readFile(resolve(REPOSITORY_ROOT, relativePath), 'utf8'));
}

function autonomyRank(level) {
  return Number(level.slice(1));
}

test('Health Mesh workflow contract is strict and grants no runtime or clinical authority', async () => {
  const schema = await readJson(WORKFLOW_CONTRACT);

  assert.equal(schema.$id, 'urn:axiom:contract:health-mesh-workflow:v0.1');
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.runtime_authority_granted.const, false);
  assert.equal(schema.properties.clinical_authorization_claimed.const, false);
  assert.deepEqual(schema.properties.maximum_autonomy_level.enum, ['H0', 'H1', 'H2', 'H3', 'H4', 'H5']);

  const escalation = schema.properties.escalation_policy.properties;
  assert.equal(escalation.supervision_loss_cannot_raise_autonomy.const, true);
  assert.equal(escalation.emergency_authority_is_separate.const, true);
  assert.equal(escalation.uncertain_physical_effects_are_not_retried.const, true);
});

test('reference workflows remain non-authorizing and internally bounded', async () => {
  for (const path of FIXTURES) {
    const workflow = await readJson(path);
    const ids = new Set(workflow.steps.map(step => step.step_id));
    const max = autonomyRank(workflow.maximum_autonomy_level);

    assert.equal(workflow.schema, 'axiom-health-mesh-workflow.v0.1');
    assert.equal(workflow.runtime_authority_granted, false);
    assert.equal(workflow.clinical_authorization_claimed, false);
    assert.equal(workflow.subject_binding_required, true);
    assert.equal(workflow.encounter_binding_required, true);
    assert.equal(workflow.consent_required, true);
    assert.equal(workflow.escalation_policy.supervision_loss_cannot_raise_autonomy, true);
    assert.equal(workflow.escalation_policy.emergency_authority_is_separate, true);
    assert.equal(workflow.escalation_policy.uncertain_physical_effects_are_not_retried, true);

    for (const step of workflow.steps) {
      assert.ok(ids.has(step.step_id));
      assert.ok(autonomyRank(step.autonomy_level) <= max, `${path}:${step.step_id} exceeds workflow autonomy ceiling`);
      assert.ok(step.required_evidence.length > 0, `${path}:${step.step_id} must retain evidence requirements`);
      if (step.success_next !== null && step.success_next !== undefined) {
        assert.ok(ids.has(step.success_next), `${path}:${step.step_id} has unknown success target`);
      }
      if (step.failure_next !== null && step.failure_next !== undefined) {
        assert.ok(ids.has(step.failure_next), `${path}:${step.step_id} has unknown failure target`);
      }
    }
  }
});

test('supervised venipuncture cannot continue invasive work after supervision loss', async () => {
  const workflow = await readJson('mesh/test/fixtures/health-mesh/supervised-venipuncture.json');
  const invasive = workflow.steps.find(step => step.kind === 'INVASIVE_COLLECTION');

  assert.equal(workflow.maximum_autonomy_level, 'H3');
  assert.equal(invasive.effect_class, 'PHYSICAL_INVASIVE');
  assert.equal(invasive.autonomy_level, 'H3');
  assert.equal(invasive.required_supervision.mode, 'REMOTE_SYNCHRONOUS');
  assert.equal(
    invasive.required_supervision.loss_behavior,
    'COMPLETE_CURRENT_ATOMIC_STEP_THEN_HALT'
  );
  assert.equal(invasive.retry_policy, 'EXPLICIT_HUMAN_REAUTHORIZE');
});

test('H5 emergency workflow uses a separate event-specific capability and safe-state terminal', async () => {
  const workflow = await readJson('mesh/test/fixtures/health-mesh/post-draw-emergency.json');
  const emergency = workflow.steps.find(step => step.kind === 'EMERGENCY_REQUEST');
  const safeState = workflow.steps.find(step => step.step_id === 'safe-state');

  assert.equal(workflow.maximum_autonomy_level, 'H5');
  assert.equal(workflow.escalation_policy.emergency_capability_class, 'health.emergency.request.v0');
  assert.deepEqual(emergency.required_capabilities, ['health.emergency.request.v0']);
  assert.equal(emergency.effect_class, 'EMERGENCY_EXTERNAL');
  assert.ok(emergency.required_evidence.includes('emergency_capability_grant'));
  assert.equal(safeState.kind, 'HALT');
  assert.equal(safeState.failure_behavior, 'SAFE_LOCAL_STATE');
});

test('planning capability identifiers remain absent from production capability registry', async () => {
  const registry = await readJson('mesh/config/capabilities.json');
  const serialized = JSON.stringify(registry);

  for (const identifier of [
    'health.specimen.position.supervised',
    'health.specimen.venipuncture.supervised',
    'health.remote-clinician.request',
    'health.emergency.request.v0'
  ]) {
    assert.equal(serialized.includes(identifier), false, `${identifier} must remain planning-only`);
  }
});
