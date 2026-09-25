import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl=new URL(
  '../config/general-genesis-transaction-candidate-v0.schema.json',
  import.meta.url
);

test('General Genesis Transaction Candidate v0 is atomic-commit evidence only',async()=>{
  const schema=JSON.parse(await readFile(schemaUrl,'utf8'));

  assert.equal(schema.$schema,'https://json-schema.org/draft/2020-12/schema');
  assert.equal(
    schema.properties.schema.const,
    'axiom-general-genesis-transaction-candidate.v0'
  );
  assert.equal(schema.properties.status.const,'inert-transaction-candidate');
  assert.equal(schema.properties.single_genesis_sponsor.const,true);
  assert.equal(schema.properties.initial_developmental_stage.const,'genesis');
  assert.equal(schema.properties.inherited_authority.const,false);
  assert.equal(schema.properties.initial_council_voting.const,false);
  assert.equal(schema.properties.initial_genesis_eligibility.const,false);
  assert.equal(schema.properties.transaction_candidate_only.const,true);
  assert.equal(schema.properties.creates_authorization_consumption.const,false);
  assert.equal(schema.properties.creates_genesis_history_change.const,false);
  assert.equal(schema.properties.creates_genesis_bond.const,false);
  assert.equal(schema.properties.creates_mind.const,false);
  assert.equal(schema.properties.creates_developmental_status.const,false);
  assert.equal(schema.properties.founder_reserve_effect.const,'none');
  assert.equal(schema.properties.founding_status_effect.const,'none');
  assert.equal(schema.properties.founders_council_effect.const,'none');
  assert.equal(schema.properties.authority_effect.const,'none');
  assert.equal(schema.properties.runtime_activation.const,false);
  assert.deepEqual(schema['x-axiom-non-claims'],[
    'live-genesis-commit',
    'live-authorization-consumption',
    'global-identity-uniqueness',
    'holder-confirmation-proof',
    'genesis-bond-persistence',
    'mind-creation'
  ]);
});
