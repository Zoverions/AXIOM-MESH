import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
test('Autonomy Constraint Profile v0 is narrow-only and non-authorizing',async()=>{
 const schema=JSON.parse(await readFile(new URL('../config/autonomy-constraint-profile-v0.schema.json',import.meta.url),'utf8'));
 assert.equal(schema.additionalProperties,false);
 assert.equal(schema.properties.schema.const,'axiom-autonomy-constraint-profile.v0');
 assert.equal(schema.properties.may_widen_authority.const,false);
 assert.equal(schema.properties.grants_authority.const,false);
 assert.equal(schema.properties.execution_effect.const,'none');
 assert.equal(schema.properties.runtime_activation.const,false);
 assert.equal(schema['x-axiom-semantic-validator'],'mesh/src/lib/autonomy-constraint-profile.mjs');
});
