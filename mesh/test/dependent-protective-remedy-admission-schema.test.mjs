import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl=new URL(
  '../config/dependent-protective-remedy-admission-v0.schema.json',
  import.meta.url
);

test('Dependent Protective Remedy Admission v0 is currentness/proportionality evidence only',async()=>{
  const schema=JSON.parse(await readFile(schemaUrl,'utf8'));
  assert.equal(schema.$schema,'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.properties.schema.const,'axiom-dependent-protective-remedy-admission.v0');
  assert.equal(schema.properties.model_final_authority.const,false);
  assert.equal(schema.properties.remedy_admission_only.const,true);
  assert.equal(schema.properties.creates_guardian_removal.const,false);
  assert.equal(schema.properties.creates_guardianship_transfer.const,false);
  assert.equal(schema.properties.creates_private_memory_access.const,false);
  assert.equal(schema.properties.creates_evidence_seizure.const,false);
  assert.equal(schema.properties.creates_credential_suspension.const,false);
  assert.equal(schema.properties.creates_runtime_quarantine.const,false);
  assert.equal(schema.properties.creates_emergency_authority.const,false);
  assert.equal(schema.properties.creates_execution_authority.const,false);
  assert.equal(schema.properties.developmental_status_downgrade_authorized.const,false);
  assert.equal(schema.properties.runtime_activation.const,false);
  assert.deepEqual(schema['x-axiom-non-claims'],[
    'remedy-execution','guardian-removal','live-guardianship-transfer',
    'private-memory-access','evidence-seizure','credential-suspension',
    'runtime-quarantine','emergency-authority','status-mutation','appeal-adjudication'
  ]);
});
