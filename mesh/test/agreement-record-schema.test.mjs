import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Agreement Record v0 schema is digest-only and non-enforcing',async()=>{
  const schema=JSON.parse(await readFile(new URL('../config/agreement-record-v0.schema.json',import.meta.url),'utf8'));
  assert.equal(schema.additionalProperties,false);
  assert.equal(schema.properties.schema.const,'axiom-agreement-record.v0');
  assert.equal(schema.properties.contains_private_body.const,false);
  assert.equal(schema.properties.authority_effect.const,'none');
  assert.equal(schema.properties.enforcement_effect.const,'none');
  assert.equal(schema.properties.legal_validity_claimed.const,false);
  assert.equal(schema.properties.payment_effect.const,'none');
  assert.equal(schema.properties.settlement_effect.const,'none');
  assert.equal(schema.properties.network_effect.const,'none');
  assert.equal(schema.properties.runtime_activation.const,false);
});

test('Agreement Acceptance Evidence v0 schema is non-authorizing',async()=>{
  const schema=JSON.parse(await readFile(new URL('../config/agreement-acceptance-evidence-v0.schema.json',import.meta.url),'utf8'));
  assert.equal(schema.additionalProperties,false);
  assert.equal(schema.properties.schema.const,'axiom-agreement-acceptance-evidence.v0');
  assert.equal(schema.properties.authority_effect.const,'none');
  assert.equal(schema.properties.enforcement_effect.const,'none');
  assert.equal(schema.properties.consent_effect.const,'none');
  assert.equal(schema.properties.network_effect.const,'none');
  assert.equal(schema.properties.runtime_activation.const,false);
});
