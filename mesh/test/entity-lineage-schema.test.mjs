import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const schemaUrl=new URL('../../docs/architecture/contracts/entity-lineage-event.v0.schema.json',import.meta.url);
test('lineage event schema locks fork ancestry, identity uncertainty, and zero authority',async()=>{
  const schema=JSON.parse(await readFile(schemaUrl,'utf8'));
  assert.equal(schema.$id,'axiom-entity-lineage-event.v0');
  assert.equal(schema.additionalProperties,false);
  assert.equal(schema.properties.event_type.const,'fork');
  assert.equal(schema.properties.subjective_identity_claim.const,'unspecified');
  assert.equal(schema.properties.authority_effect.const,'none');
  assert.equal(schema.properties.network_effect.const,'none');
  assert.equal(schema.properties.runtime_activation.const,false);
  assert.equal(schema.properties.copied_active_layer_ids.uniqueItems,true);
  assert.equal(schema.properties.copied_active_layer_ids.maxItems,64);
});
