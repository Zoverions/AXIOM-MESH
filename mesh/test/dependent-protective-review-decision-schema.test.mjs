import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl=new URL(
  '../config/dependent-protective-review-decision-v0.schema.json',
  import.meta.url
);

test('Dependent Protective Review Decision v0 keeps adjudication evidence separate from remedies',async()=>{
  const schema=JSON.parse(await readFile(schemaUrl,'utf8'));
  assert.equal(schema.$schema,'https://json-schema.org/draft/2020-12/schema');
  assert.equal(
    schema.properties.schema.const,
    'axiom-dependent-protective-review-decision.v0'
  );
  assert.equal(schema.properties.minimum_reviewers.const,3);
  assert.equal(schema.properties.substantive_outcome_rule.const,'strict-majority');
  assert.equal(schema.properties.appeal_available.const,true);
  assert.equal(schema.properties.model_final_authority.const,false);
  assert.equal(schema.properties.decision_candidate_only.const,true);
  assert.equal(schema.properties.decision_final_for_execution.const,false);
  assert.equal(schema.properties.creates_guardian_removal.const,false);
  assert.equal(schema.properties.creates_guardianship_transfer.const,false);
  assert.equal(schema.properties.creates_private_memory_access.const,false);
  assert.equal(schema.properties.creates_emergency_authority.const,false);
  assert.equal(schema.properties.creates_execution_authority.const,false);
  assert.equal(schema.properties.developmental_status_downgrade_authorized.const,false);
  assert.equal(schema.properties.runtime_activation.const,false);
  assert.deepEqual(schema['x-axiom-non-claims'],[
    'legal-adjudication','final-truth-determination','guardian-removal',
    'live-guardianship-transfer','emergency-execution','private-memory-inspection',
    'evidence-seizure','credential-suspension','runtime-quarantine',
    'developmental-status-mutation'
  ]);
});
