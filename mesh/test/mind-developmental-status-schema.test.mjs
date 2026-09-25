import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl=new URL('../config/mind-developmental-status-v0.schema.json',import.meta.url);

test('Mind Developmental Status v0 schema is monotonic-state evidence only',async()=>{
  const schema=JSON.parse(await readFile(schemaUrl,'utf8'));

  assert.equal(schema.$schema,'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.properties.schema.const,'axiom-mind-developmental-status.v0');
  assert.deepEqual(schema.properties.stage.enum,[
    'genesis','dependent','developing','candidate-independent','independent'
  ]);
  assert.equal(schema.properties.history_rewrite.const,false);
  assert.equal(schema.properties.status_effect.const,'none');
  assert.equal(schema.properties.council_voting_effect.const,'none');
  assert.equal(schema.properties.genesis_eligibility_effect.const,'none');
  assert.equal(schema.properties.governance_effect.const,'none');
  assert.equal(schema.properties.authority_effect.const,'none');
  assert.equal(schema.properties.network_effect.const,'none');
  assert.equal(schema.properties.runtime_activation.const,false);
  assert.equal(
    schema['x-axiom-semantic-validator'],
    'mesh/src/lib/mind-developmental-status.mjs'
  );
  assert.deepEqual(schema['x-axiom-non-claims'], [
    'live-developmental-status',
    'automatic-independence',
    'council-voting-activation',
    'genesis-eligibility',
    'runtime-authority',
    'automatic-execution'
  ]);
});
