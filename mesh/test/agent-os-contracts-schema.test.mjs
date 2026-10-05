import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function schema(name) {
  return JSON.parse(await readFile(new URL('../config/' + name, import.meta.url), 'utf8'));
}

test('Outcome v0 schema is closed and non-authorizing', async () => {
  const value = await schema('outcome-v0.schema.json');
  assert.equal(value.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(value.additionalProperties, false);
  assert.equal(value.properties.schema.const, 'axiom-outcome.v0');
  assert.equal(value.properties.grants_authority.const, false);
  assert.equal(value.properties.execution_effect.const, 'none');
  assert.equal(value.properties.runtime_activation.const, false);
  assert.equal(value['x-axiom-semantic-validator'], 'mesh/src/lib/agent-os-contracts.mjs');
});

test('Task Lifecycle v0 schema is closed and cannot self-authorize resumption', async () => {
  const value = await schema('task-lifecycle-v0.schema.json');
  assert.equal(value.additionalProperties, false);
  assert.equal(value.properties.schema.const, 'axiom-task-lifecycle.v0');
  assert.equal(value.properties.grants_authority.const, false);
  assert.equal(value.properties.execution_effect.const, 'none');
  assert.equal(value.properties.runtime_activation.const, false);
});

test('Skill Admission v0 schema closes nested resource scopes', async () => {
  const value = await schema('skill-admission-v0.schema.json');
  assert.equal(value.additionalProperties, false);
  assert.equal(value.properties.filesystem.additionalProperties, false);
  assert.equal(value.properties.network.additionalProperties, false);
  assert.equal(value.properties.process.additionalProperties, false);
  assert.equal(value.properties.currentness.additionalProperties, false);
  assert.equal(value.properties.grants_authority.const, false);
  assert.equal(value.properties.installation_effect.const, 'none');
  assert.equal(value.properties.runtime_activation.const, false);
});
