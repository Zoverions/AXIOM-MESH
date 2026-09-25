import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl = new URL('../config/mind-continuity-evidence-v0.schema.json', import.meta.url);

test('Mind Continuity Evidence v0 schema cannot create population or authority', async () => {
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));

  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.properties.schema.const, 'axiom-mind-continuity-evidence.v0');
  assert.equal(schema.properties.population_effect.const, 'none');
  assert.equal(schema.properties.governance_identity_effect.const, 'none');
  assert.equal(schema.properties.authority_effect.const, 'none');
  assert.equal(schema.properties.runtime_activation.const, false);

  assert.equal(
    schema['x-axiom-semantic-validator'],
    'mesh/src/lib/mind-continuity-evidence.mjs'
  );
  assert.deepEqual(schema['x-axiom-non-claims'], [
    'personhood-determination',
    'automatic-continuity-recognition',
    'automatic-fork-personhood',
    'population-increase',
    'governance-identity-creation',
    'runtime-authority'
  ]);
});
