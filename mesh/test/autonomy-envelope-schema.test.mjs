import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Autonomy Envelope v0 schema has no Full Access or delegation authority',async()=>{
  const schema=JSON.parse(await readFile(new URL('../config/autonomy-envelope-v0.schema.json',import.meta.url),'utf8'));
  assert.equal(schema.$schema,'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.additionalProperties,false);
  assert.equal(schema.properties.schema.const,'axiom-autonomy-envelope.v0');
  assert.equal(schema.properties.delegation_allowed.const,false);
  assert.equal(schema.properties.wildcard_authority.const,false);
  assert.equal(schema.properties.grants_authority.const,false);
  assert.equal(schema.properties.execution_effect.const,'none');
  assert.equal(schema.properties.runtime_activation.const,false);
});
