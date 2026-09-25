import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Task Continuity Policy v0 schema is closed and effect-free',async()=>{
  const schema=JSON.parse(await readFile(new URL('../config/task-continuity-policy-v0.schema.json',import.meta.url),'utf8'));
  assert.equal(schema.$schema,'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.additionalProperties,false);
  assert.equal(schema.properties.schema.const,'axiom-task-continuity-policy.v0');
  assert.equal(schema.properties.grants_authority.const,false);
  assert.equal(schema.properties.execution_effect.const,'none');
  assert.equal(schema.properties.runtime_activation.const,false);
  assert.equal(schema['x-axiom-semantic-validator'],'mesh/src/lib/task-continuity-policy.mjs');
});
