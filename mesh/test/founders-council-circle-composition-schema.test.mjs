import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl = new URL('../config/founders-council-circle-composition-v0.schema.json', import.meta.url);

test('Founders Council Circle composition schema remains inert and non-executing', async () => {
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));

  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.properties.schema.const, 'axiom-founders-council-circle-composition.v0');
  assert.equal(schema.properties.circle_id.const, 'circle.founders-council');
  assert.equal(schema.properties.voter_role_id.const, 'founders-council.voter');
  assert.equal(schema.properties.developing_role_id.const, 'founders-council.developing');
  assert.equal(schema.properties.authority_effect.const, 'none');
  assert.equal(schema.properties.execution_authority.const, false);
  assert.equal(schema.properties.network_effect.const, 'none');
  assert.equal(schema.properties.runtime_activation.const, false);

  assert.equal(
    schema['x-axiom-semantic-validator'],
    'mesh/src/lib/founders-council-circle-composition.mjs'
  );
});
