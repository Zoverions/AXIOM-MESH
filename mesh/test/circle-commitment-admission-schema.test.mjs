import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Circle Commitment Admission v0 schema is closed and non-authorizing',async()=>{
  const schema=JSON.parse(await readFile(
    new URL('../config/circle-commitment-admission-v0.schema.json',import.meta.url),
    'utf8'
  ));
  assert.equal(schema.additionalProperties,false);
  assert.equal(schema.properties.schema.const,'axiom-circle-commitment-admission.v0');
  assert.equal(schema.$defs.partyBinding.additionalProperties,false);
  assert.equal(schema.properties.authority_effect.const,'none');
  assert.equal(schema.properties.governance_effect.const,'none');
  assert.equal(schema.properties.enforcement_effect.const,'none');
  assert.equal(schema.properties.execution_effect.const,'none');
  assert.equal(schema.properties.payment_effect.const,'none');
  assert.equal(schema.properties.settlement_effect.const,'none');
  assert.equal(schema.properties.network_effect.const,'none');
  assert.equal(schema.properties.runtime_activation.const,false);
});
