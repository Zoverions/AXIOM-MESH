import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl = new URL('../config/founder-genesis-receipt-v0.schema.json', import.meta.url);

test('Founder Genesis Receipt v0 schema preserves one-use inert evidence boundaries', async () => {
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));

  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.properties.schema.const, 'axiom-founder-genesis-receipt.v0');
  assert.equal(schema.properties.slot_number.maximum, 10);
  assert.equal(schema.properties.inherited_authority.const, false);
  assert.equal(schema.properties.execution_authority.const, false);
  assert.equal(schema.properties.authority_effect.const, 'none');
  assert.equal(schema.properties.runtime_activation.const, false);

  assert.equal(
    schema['x-axiom-semantic-validator'],
    'mesh/src/lib/founder-genesis-receipt.mjs'
  );
  assert.deepEqual(schema['x-axiom-non-claims'], [
    'live-genesis-commit',
    'human-presence-proof',
    'digital-personhood-proof',
    'runtime-authority',
    'automatic-execution'
  ]);
});
