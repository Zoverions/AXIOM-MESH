import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl = new URL('../config/founder-casting-vote-receipt-v0.schema.json', import.meta.url);

test('Founder Casting Vote Receipt v0 remains manual-evidence-only and non-executing', async () => {
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));

  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.properties.schema.const, 'axiom-founder-casting-vote-receipt.v0');
  assert.deepEqual(schema.properties.casting_vote.enum, ['for', 'against']);
  assert.equal(schema.properties.authority_effect.const, 'none');
  assert.equal(schema.properties.execution_authority.const, false);
  assert.equal(schema.properties.runtime_activation.const, false);
  assert.equal(
    schema['x-axiom-semantic-validator'],
    'mesh/src/lib/founder-casting-vote-receipt.mjs'
  );
});
