import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl=new URL(
  '../config/founding-digital-council-vote-activation-v0.schema.json',
  import.meta.url
);

test('Founding Digital Council Vote Activation v0 remains request-only and non-mutating',async()=>{
  const schema=JSON.parse(await readFile(schemaUrl,'utf8'));

  assert.equal(schema.$schema,'https://json-schema.org/draft/2020-12/schema');
  assert.equal(
    schema.properties.schema.const,
    'axiom-founding-digital-council-vote-activation-request.v0'
  );
  assert.equal(schema.properties.status.const,'inert-request-evidence');
  assert.equal(schema.properties.creates_foundation_mutation.const,false);
  assert.equal(schema.properties.creates_circle_membership_mutation.const,false);
  assert.equal(schema.properties.creates_vote_authority.const,false);
  assert.equal(schema.properties.council_voting_effect.const,'none');
  assert.equal(schema.properties.governance_effect.const,'none');
  assert.equal(schema.properties.authority_effect.const,'none');
  assert.equal(schema.properties.network_effect.const,'none');
  assert.equal(schema.properties.runtime_activation.const,false);
  assert.equal(
    schema['x-axiom-semantic-validator'],
    'mesh/src/lib/founding-digital-council-vote-activation.mjs'
  );
  assert.deepEqual(schema['x-axiom-non-claims'], [
    'live-council-vote-activation',
    'circle-membership-mutation',
    'foundation-mutation',
    'vote-authority',
    'runtime-authority',
    'automatic-execution'
  ]);
});
