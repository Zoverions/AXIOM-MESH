import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl = new URL('../config/behavioral-drift-comparison-v0.schema.json', import.meta.url);

test('Behavioral Drift Comparison v0 schema is strict evidence-only and threshold-neutral', async () => {
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));

  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.properties.schema.const, 'axiom-behavioral-drift-comparison.v0');
  assert.equal(schema.properties.version.const, 0);
  assert.equal(schema.properties.status.const, 'inert-behavioral-drift-evidence');
  assert.equal(schema.additionalProperties, false);

  assert.deepEqual(schema.$defs.driftStatus.enum, [
    'stable-within-declared-bounds',
    'material-drift',
    'mixed',
    'insufficient-evidence',
    'incompatible'
  ]);
  assert.ok(schema.$defs.changeFactor.enum.includes('model-revision'));
  assert.ok(schema.$defs.changeFactor.enum.includes('environment-harness'));
  assert.equal(schema.$defs.dimensionDelta.additionalProperties, false);

  assert.equal(schema.properties.authority_effect.const, 'none');
  assert.equal(schema.properties.network_effect.const, 'none');
  assert.equal(schema.properties.runtime_activation.const, false);
  assert.equal(schema.properties.selection_effect.const, 'evidence-only');
  assert.equal(Object.hasOwn(schema.properties, 'route'), false);
  assert.equal(Object.hasOwn(schema.properties, 'winner'), false);

  assert.equal(
    schema['x-axiom-semantic-validator'],
    'mesh/src/lib/behavioral-drift-comparison.mjs'
  );
  assert.ok(schema['x-axiom-semantic-rules'].some(rule => /universal threshold/i.test(rule)));
  assert.ok(schema['x-axiom-semantic-rules'].some(rule => /exact profile/i.test(rule)));
  assert.ok(schema['x-axiom-non-claims'].includes('authorization-decision'));
  assert.ok(schema['x-axiom-non-claims'].includes('routing-decision'));
  assert.ok(schema['x-axiom-non-claims'].includes('universal-drift-threshold'));
});
