import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import {
  AGENT_READ_SYSTEM_FACTS_EFFECT_ADMISSION_SCHEMA,
  AGENT_READ_SYSTEM_FACTS_ISOLATION_POLICY,
  AGENT_READ_SYSTEM_FACTS_ISOLATION_POLICY_DIGEST
} from '../src/lib/agent-read-system-facts-effect-admission.mjs';

const admissionSchemaUrl = new URL(
  '../../agent-commons/contracts/agent-read-system-facts-effect-admission.v2.schema.json',
  import.meta.url
);
const policyUrl = new URL(
  '../../agent-commons/read-system-facts-isolation-policy.json',
  import.meta.url
);

test('committed isolation policy bytes reproduce the runtime policy digest exactly', async () => {
  const committed = JSON.parse(await readFile(policyUrl, 'utf8'));
  assert.deepEqual(committed, AGENT_READ_SYSTEM_FACTS_ISOLATION_POLICY);
  assert.equal(digestObject(committed), AGENT_READ_SYSTEM_FACTS_ISOLATION_POLICY_DIGEST);
  assert.equal(committed.operation, 'agent.read-system-facts');
  assert.equal(committed.network.mode, 'none');
  assert.equal(committed.filesystem.bind_mounts_allowed, false);
  assert.equal(committed.image.caller_selectable, false);
  assert.equal(committed.templates.length, 2);
  assert.deepEqual(committed.templates.map(item => item.template_id), [
    'node-version',
    'platform-arch'
  ]);
});

test('admission JSON Schema stays synchronized with runtime fixed semantics', async () => {
  const schema = JSON.parse(await readFile(admissionSchemaUrl, 'utf8'));
  assert.equal(schema.properties.schema.const, AGENT_READ_SYSTEM_FACTS_EFFECT_ADMISSION_SCHEMA);
  const statement = schema.properties.statement.properties;
  assert.equal(statement.repository.const, 'Zoverions/AXIOM-MESH');
  assert.equal(statement.action.const, 'agent.read-system-facts');
  assert.equal(statement.isolation_policy_id.const, AGENT_READ_SYSTEM_FACTS_ISOLATION_POLICY.policy_id);
  assert.equal(statement.isolation_policy_revision.const, AGENT_READ_SYSTEM_FACTS_ISOLATION_POLICY.revision);
  assert.equal(statement.admission_kind.const, 'fixed-consumed-handoff-effect-admission');
  assert.equal(statement.fixed_operation_only.const, true);
  assert.equal(statement.consumption_record_required.const, true);
  assert.equal(statement.effect_boundary_currentness_recheck_required.const, true);
  assert.equal(statement.effect_already_executed.const, false);
  assert.equal(statement.general_executor_authority.const, false);
  assert.equal(statement.repository_code_execution_authority.const, false);
  assert.equal(statement.arbitrary_command_authority.const, false);
  assert.equal(statement.arbitrary_path_authority.const, false);
  assert.equal(statement.network_authority.const, false);
  assert.equal(statement.credential_authority.const, false);
  assert.equal(statement.secret_authority.const, false);
  assert.equal(statement.remote_hardware_authority.const, false);
  assert.equal(statement.production_authority.const, false);
  assert.equal(statement.deployment_authority.const, false);
  assert.equal(statement.capability_promotion_authority.const, false);
  assert.equal(statement.global_currentness_claimed.const, false);
  assert.equal(statement.task_success_claimed.const, false);
  assert.equal(statement.truth_claimed.const, false);
  assert.equal(statement.application_correctness_claimed.const, false);
  assert.equal(statement.authority_effect.const, 'none');
  assert.equal(statement.delegation_effect.const, 'none');
});
