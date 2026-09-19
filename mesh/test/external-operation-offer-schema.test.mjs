import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validateExternalOperationOfferSchema } from '../src/lib/external-operation-offer.mjs';

const schemaUrl = new URL(
  '../../docs/architecture/contracts/external-operation-offer.v0.schema.json',
  import.meta.url
);

test('External Operation Offer v0 schema mirrors closed-world invariants', async () => {
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));
  assert.equal(validateExternalOperationOfferSchema(schema), true);
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.$id, 'urn:axiom:contract:external-operation-offer:v0');
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.grants_authority.const, false);
  assert.equal(schema.properties.execution_effect.const, 'none');
  assert.deepEqual(schema.properties.operation.properties.effect_class.enum, [
    'read-external',
    'write-external',
    'publish-external',
    'create-external-resource',
    'delete-external-resource',
    'generate-media',
    'financial',
    'communication',
    'unknown'
  ]);
  assert.deepEqual(schema.properties.quote.properties.kind.enum, [
    'free', 'exact', 'bounded', 'variable', 'unknown'
  ]);
  assert.deepEqual(schema.properties.quote.properties.pricing_unit.enum, [
    'call', 'result', 'character', 'second', 'token', 'other'
  ]);
  assert.equal(schema.properties.catalog_entry.additionalProperties, false);
  assert.equal(schema.properties.operation.additionalProperties, false);
  assert.equal(schema.properties.topology.additionalProperties, false);
  assert.equal(schema.properties.quote.additionalProperties, false);
  assert.equal(schema.properties.health.additionalProperties, false);
  assert.equal(schema.properties.execution_semantics.additionalProperties, false);
  assert.equal(schema.properties.evidence.additionalProperties, false);
  assert.equal(schema.properties.freshness.additionalProperties, false);
});
