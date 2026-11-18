import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Circle Artifact Mutation Admission v0 schema is closed and inert',async()=>{
  const schema=JSON.parse(await readFile(
    new URL('../config/circle-artifact-mutation-admission-v0.schema.json',import.meta.url),
    'utf8'
  ));
  assert.equal(schema.$schema,'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.additionalProperties,false);
  assert.equal(schema.properties.schema.const,'axiom-circle-artifact-mutation-admission.v0');
  assert.equal(schema.properties.authority_effect.const,'none');
  assert.equal(schema.properties.governance_effect.const,'none');
  assert.equal(schema.properties.artifact_effect.const,'none');
  assert.equal(schema.properties.execution_effect.const,'none');
  assert.equal(schema.properties.network_effect.const,'none');
  assert.equal(schema.properties.runtime_activation.const,false);
  assert.equal(schema['x-axiom-semantic-validator'],'mesh/src/lib/circle-artifact-mutation-admission.mjs');
});
