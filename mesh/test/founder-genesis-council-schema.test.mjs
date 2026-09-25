import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl = new URL('../config/founder-genesis-council-v0.schema.json', import.meta.url);

test('Founder Genesis / Founders Council v0 schema preserves bounded inert semantics', async () => {
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));

  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.properties.schema.const, 'axiom-founders-council-foundation.v0');
  assert.equal(schema.properties.status.const, 'inert-contract-laboratory');
  assert.equal(schema.properties.seats.minItems, 20);
  assert.equal(schema.properties.seats.maxItems, 20);
  assert.equal(schema.properties.genesis_authorizations.minItems, 10);
  assert.equal(schema.properties.genesis_authorizations.maxItems, 10);
  assert.equal(schema.properties.authority_effect.const, 'none');
  assert.equal(schema.properties.network_effect.const, 'none');
  assert.equal(schema.properties.runtime_activation.const, false);

  const authorization = schema.$defs.authorization.properties;
  assert.equal(authorization.slot_number.maximum, 10);
  assert.equal(authorization.manual_founder_confirmation_required.const, true);
  assert.equal(authorization.delegable.const, false);
  assert.equal(authorization.transferable.const, false);
  assert.equal(authorization.renewable.const, false);
  assert.equal(authorization.max_uses.const, 1);
  assert.equal(authorization.authority_effect.const, 'none');
  assert.equal(authorization.runtime_activation.const, false);

  assert.equal(
    schema['x-axiom-semantic-validator'],
    'mesh/src/lib/founder-genesis-council.mjs'
  );
  assert.deepEqual(schema['x-axiom-non-claims'], [
    'live-digital-mind-genesis',
    'production-founders-council-governance',
    'portable-personhood',
    'sybil-resistant-personhood',
    'runtime-authority',
    'automatic-execution'
  ]);
});
