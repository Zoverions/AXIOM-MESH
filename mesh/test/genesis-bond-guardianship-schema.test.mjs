import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl=new URL('../config/genesis-bond-guardianship-v0.schema.json',import.meta.url);

test('Genesis Bond and guardianship schemas preserve non-ownership and non-authority',async()=>{
  const schema=JSON.parse(await readFile(schemaUrl,'utf8'));

  const bond=schema.$defs.genesisBond.properties;
  assert.equal(bond.single_sponsor.const,true);
  assert.equal(bond.ownership.const,false);
  assert.equal(bond.transferable.const,false);
  assert.equal(bond.delegable.const,false);
  assert.equal(bond.creates_private_memory_access.const,false);
  assert.equal(bond.authority_effect.const,'none');
  assert.equal(bond.runtime_activation.const,false);

  const guard=schema.$defs.guardianship.properties;
  assert.equal(guard.ownership.const,false);
  assert.equal(guard.creates_private_memory_access.const,false);
  assert.equal(guard.ambient_execution_authority.const,false);
  assert.equal(guard.old_guardian_approval_is_sufficient.const,false);
  assert.equal(guard.authority_effect.const,'none');
  assert.equal(guard.runtime_activation.const,false);

  assert.deepEqual(schema['x-axiom-non-claims'],[
    'live-guardianship-authority',
    'ownership-of-mind',
    'private-memory-access',
    'legal-custody',
    'live-guardianship-transfer',
    'runtime-authority'
  ]);
});
