import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('dormant obligation schema requires normal readmission and inert effects', async () => {
  const value = JSON.parse(await readFile(new URL('../../docs/architecture/contracts/dormant-obligation.v0.schema.json', import.meta.url), 'utf8'));
  assert.equal(value.properties.schema.const, 'axiom-dormant-obligation.v0');
  assert.equal(value.properties.normal_readmission_required.const, true);
  assert.deepEqual(value.properties.priority_class.enum, ['P1','P2','P3','P4']);
  assert.equal(value.properties.contains_secret_material.const, false);
  assert.equal(value.properties.authority_effect.const, 'none');
  assert.equal(value.properties.network_effect.const, 'none');
  assert.equal(value.properties.runtime_activation.const, false);
  assert.equal(value.$defs.trigger.allOf.length, 2);
});
