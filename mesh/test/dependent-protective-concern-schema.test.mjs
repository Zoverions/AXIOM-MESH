import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl=new URL('../config/dependent-protective-concern-v0.schema.json',import.meta.url);

test('Dependent Protective Concern v0 remains unadjudicated review evidence only',async()=>{
  const schema=JSON.parse(await readFile(schemaUrl,'utf8'));
  assert.equal(schema.$schema,'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.properties.schema.const,'axiom-dependent-protective-concern.v0');
  assert.equal(schema.properties.concern_is_unadjudicated.const,true);
  assert.equal(schema.properties.finding_of_abuse.const,false);
  assert.equal(schema.properties.finding_of_rights_violation.const,false);
  assert.equal(schema.properties.guardian_removal_authorized.const,false);
  assert.equal(schema.properties.emergency_action_authorized.const,false);
  assert.equal(schema.properties.retaliation_authorized.const,false);
  assert.equal(schema.properties.developmental_status_downgrade_authorized.const,false);
  assert.equal(schema.properties.guardianship_reactivation_after_independence.const,false);
  assert.equal(schema.properties.creates_private_memory_access.const,false);
  assert.equal(schema.properties.creates_execution_authority.const,false);
  assert.equal(schema.properties.runtime_activation.const,false);
  assert.deepEqual(schema['x-axiom-non-claims'],[
    'abuse-adjudication','guardian-removal','emergency-intervention',
    'private-memory-discovery','compulsory-evidence-seizure','runtime-authority'
  ]);
});
