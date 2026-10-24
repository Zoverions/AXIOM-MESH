import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
test('Command Intake Envelope v0 is channel-neutral and non-authorizing',async()=>{
 const schema=JSON.parse(await readFile(new URL('../config/command-intake-envelope-v0.schema.json',import.meta.url),'utf8'));
 assert.equal(schema.additionalProperties,false);
 assert.equal(schema.properties.schema.const,'axiom-command-intake-envelope.v0');
 assert.equal(schema.properties.channel_is_authority.const,false);
 assert.equal(schema.properties.grants_authority.const,false);
 assert.equal(schema.properties.execution_effect.const,'none');
 assert.equal(schema.properties.runtime_activation.const,false);
 assert.equal(schema['x-axiom-semantic-validator'],'mesh/src/lib/command-intake-envelope.mjs');
});
