import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl = new URL('../config/circle-core-v0.schema.json', import.meta.url);

test('Circle Core v0 machine schema preserves the inert non-authority boundary', async () => {
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.properties.schema.const, 'axiom-circle-core-package.v0');
  assert.equal(schema.properties.status.const, 'inert-contract-laboratory');
  assert.equal(schema.properties.authority_effect.const, 'none');
  assert.equal(schema.properties.network_effect.const, 'none');
  assert.equal(schema.properties.runtime_activation.const, false);
  assert.equal(schema.$defs.circle.properties.policy_floor.const, 'raise-only');
  assert.equal(schema.$defs.circle.properties.member_state_ownership.const, 'independent-node');
  assert.equal(schema.$defs.charter.properties.execution_authority.const, false);
  assert.equal(schema.$defs.task.properties.execution_authority.const, false);
  assert.equal(schema.$defs.decision.properties.runtime_authority.const, false);
  assert.equal(schema.$defs.export.properties.portable_authority.const, false);
  assert.equal(schema['x-axiom-semantic-validator'], 'mesh/src/lib/circle-core.mjs');
  assert.deepEqual(schema['x-axiom-non-claims'], [
    'runtime-circle-authority',
    'multi-node-circle-governance',
    'federation',
    'consensus',
    'automatic-execution',
    'portable-authority'
  ]);
});
