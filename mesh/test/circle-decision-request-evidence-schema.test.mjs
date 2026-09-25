import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Circle Decision Request Evidence v0 schema is closed and cannot mint ordinary authority',async()=>{
  const schema=JSON.parse(await readFile(
    new URL('../config/circle-decision-request-evidence-v0.schema.json',import.meta.url),
    'utf8'
  ));
  assert.equal(schema.$schema,'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.additionalProperties,false);
  assert.equal(schema.properties.schema.const,'axiom-circle-decision-request-evidence.v0');
  assert.equal(schema.properties.request_descriptor.additionalProperties,false);
  assert.equal(schema.properties.ordinary_authority_path_required.const,true);
  assert.equal(schema.properties.creates_grant.const,false);
  assert.equal(schema.properties.creates_approval.const,false);
  assert.equal(schema.properties.creates_prepared_effect.const,false);
  assert.equal(schema.properties.authority_effect.const,'none');
  assert.equal(schema.properties.governance_effect.const,'none');
  assert.equal(schema.properties.execution_effect.const,'none');
  assert.equal(schema.properties.network_effect.const,'none');
  assert.equal(schema.properties.runtime_activation.const,false);
  assert.equal(schema['x-axiom-semantic-validator'],'mesh/src/lib/circle-decision-request-evidence.mjs');
});
