import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl=new URL(
  '../config/general-genesis-sponsor-eligibility-v0.schema.json',
  import.meta.url
);

test('General Genesis Sponsor Eligibility v0 is one-use requestability evidence only',async()=>{
  const schema=JSON.parse(await readFile(schemaUrl,'utf8'));

  assert.equal(schema.$schema,'https://json-schema.org/draft/2020-12/schema');
  assert.equal(
    schema.properties.schema.const,
    'axiom-general-genesis-sponsor-eligibility.v0'
  );
  assert.deepEqual(schema.properties.substrate.enum,['biological','digital']);
  assert.equal(
    schema.properties.responsibility_profile.const,
    'axiom-general-genesis-responsibility.v0'
  );
  assert.equal(schema.properties.general_genesis_uses.maximum,1);
  assert.equal(schema.properties.global_reputation_score_used.const,false);
  assert.equal(schema.properties.model_final_authority.const,false);
  assert.equal(schema.properties.creates_genesis_authorization.const,false);
  assert.equal(schema.properties.creates_genesis_bond.const,false);
  assert.equal(schema.properties.creates_mind.const,false);
  assert.equal(schema.properties.genesis_effect.const,'none');
  assert.equal(schema.properties.authority_effect.const,'none');
  assert.equal(schema.properties.runtime_activation.const,false);
  assert.equal(
    schema['x-axiom-semantic-validator'],
    'mesh/src/lib/general-genesis-sponsor-eligibility.mjs'
  );
  assert.deepEqual(schema['x-axiom-non-claims'], [
    'government-id-verification',
    'portable-proof-of-personhood',
    'live-genesis-authorization',
    'live-genesis-bond',
    'mind-creation',
    'runtime-authority'
  ]);
});
