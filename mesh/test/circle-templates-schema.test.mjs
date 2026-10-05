import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Circle Template v0 schema preserves the inert template boundary', async () => {
  const schema = JSON.parse(await readFile(
    new URL('../config/circle-template-v0.schema.json', import.meta.url),
    'utf8'
  ));
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.schema.const, 'axiom-circle-template-catalog.v0');
  assert.equal(schema.properties.authority_effect.const, 'none');
  assert.equal(schema.properties.network_effect.const, 'none');
  assert.equal(schema.properties.runtime_activation.const, false);
  assert.equal(schema.$defs.template.additionalProperties, false);
  assert.equal(schema.$defs.template.properties.execution_authority.const, false);
  assert.equal(schema.$defs.template.properties.membership_authority.const, false);
  assert.equal(schema.$defs.template.properties.policy_floor.const, 'raise-only');
  assert.equal(schema.$defs.role.properties.execution_authority.const, false);
  assert.equal(schema['x-axiom-semantic-validator'], 'mesh/src/lib/circle-templates.mjs');
});
