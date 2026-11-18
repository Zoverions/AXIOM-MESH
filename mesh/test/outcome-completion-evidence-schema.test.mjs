import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Outcome Completion Evidence v0 schema is closed, inert and non-truth-claiming', async () => {
  const schema = JSON.parse(await readFile(
    new URL('../config/outcome-completion-evidence-v0.schema.json', import.meta.url),
    'utf8'
  ));
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.schema.const, 'axiom-outcome-completion-evidence.v0');
  assert.equal(schema.properties.grants_authority.const, false);
  assert.equal(schema.properties.execution_effect.const, 'none');
  assert.equal(schema.properties.external_truth_claim.const, false);
  assert.equal(schema.properties.runtime_activation.const, false);
  assert.equal(schema['x-axiom-semantic-validator'], 'mesh/src/lib/outcome-completion-evidence.mjs');
});
