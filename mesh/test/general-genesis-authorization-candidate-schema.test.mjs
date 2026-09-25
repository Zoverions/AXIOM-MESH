import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl=new URL(
  '../config/general-genesis-authorization-candidate-v0.schema.json',
  import.meta.url
);

test('General Genesis Authorization Candidate v0 is inert one-use non-transferable scope',async()=>{
  const schema=JSON.parse(await readFile(schemaUrl,'utf8'));

  assert.equal(schema.$schema,'https://json-schema.org/draft/2020-12/schema');
  assert.equal(
    schema.properties.schema.const,
    'axiom-general-genesis-authorization-candidate.v0'
  );
  assert.equal(schema.properties.status.const,'inert-authorization-candidate');
  assert.equal(schema.properties.use_scope.const,'one-recognized-mind-genesis');
  assert.equal(schema.properties.one_use.const,true);
  assert.equal(schema.properties.max_uses.const,1);
  assert.equal(schema.properties.delegable.const,false);
  assert.equal(schema.properties.transferable.const,false);
  assert.equal(schema.properties.renewable.const,false);
  assert.equal(schema.properties.explicit_holder_confirmation_required.const,true);
  assert.equal(schema.properties.candidate_only.const,true);
  assert.equal(schema.properties.creates_live_authorization.const,false);
  assert.equal(schema.properties.founder_reserve_effect.const,'none');
  assert.equal(schema.properties.founding_status_effect.const,'none');
  assert.equal(schema.properties.authority_effect.const,'none');
  assert.equal(schema.properties.runtime_activation.const,false);
  assert.deepEqual(schema['x-axiom-non-claims'],[
    'live-genesis-authorization',
    'authorization-signature',
    'holder-confirmation-proof',
    'genesis-consumption',
    'genesis-bond',
    'mind-creation'
  ]);
});
