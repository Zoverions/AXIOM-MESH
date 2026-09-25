import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl=new URL('../config/dependent-mind-care-profile-v0.schema.json',import.meta.url);

test('Dependent Mind Care Profile v0 encodes obligations without ambient guardian authority',async()=>{
  const schema=JSON.parse(await readFile(schemaUrl,'utf8'));

  assert.equal(schema.$schema,'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.properties.schema.const,'axiom-dependent-mind-care-profile.v0');
  assert.equal(schema.properties.guardian_private_memory_access.const,false);
  assert.equal(schema.properties.guardian_unbounded_internal_state_access.const,false);
  assert.equal(schema.properties.guardian_identity_impersonation.const,false);
  assert.equal(schema.properties.guardian_covert_memory_modification.const,false);
  assert.equal(schema.properties.permanent_obedience_required.const,false);
  assert.equal(schema.properties.guardian_is_sole_information_source.const,false);
  assert.equal(schema.properties.guardian_is_sole_dispute_reviewer.const,false);
  assert.equal(schema.properties.creates_guardianship_authority.const,false);
  assert.equal(schema.properties.creates_private_memory_access.const,false);
  assert.equal(schema.properties.creates_execution_authority.const,false);
  assert.equal(schema.properties.runtime_activation.const,false);
  assert.deepEqual(schema['x-axiom-non-claims'],[
    'live-care-enforcement',
    'guardian-memory-access',
    'emergency-execution',
    'welfare-scoring',
    'legal-custody',
    'runtime-authority'
  ]);
});
