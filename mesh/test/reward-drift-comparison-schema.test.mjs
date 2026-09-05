import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl = new URL('../config/reward-drift-comparison-v0.schema.json', import.meta.url);

test('Reward Drift Comparison v0 schema preserves compatibility-gated evidence-only semantics', async () => {
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.properties.schema.const, 'axiom-reward-drift-comparison.v0');
  assert.equal(schema.properties.version.const, 0);
  assert.equal(schema.properties.status.const, 'inert-evidence');
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.$defs.sideBinding.additionalProperties, false);
  assert.equal(schema.$defs.comparisonMethod.additionalProperties, false);
  assert.equal(schema.$defs.metricDelta.additionalProperties, false);
  assert.deepEqual(schema.$defs.metricDelta.properties.name.enum, [
    'agreement-count', 'disagreement-count', 'success-rate', 'calibration-error',
    'discrimination-score', 'false-high-confidence-count', 'false-low-confidence-count',
    'missing-invalid-observation-count'
  ]);
  assert.deepEqual(schema.properties.drift_status.enum, [
    'stable-within-declared-bounds', 'material-drift', 'mixed', 'insufficient-evidence', 'incompatible'
  ]);
  assert.equal(schema.properties.contains_secret_material.const, false);
  assert.equal(schema.properties.authority_effect.const, 'none');
  assert.equal(schema.properties.network_effect.const, 'none');
  assert.equal(schema.properties.credential_visibility.const, 'none');
  assert.equal(schema.properties.runtime_activation.const, false);
  assert.equal(schema.properties.routing_effect.const, 'none');
  assert.equal(schema.properties.promotion_effect.const, 'evidence-only');
  assert.equal(schema['x-axiom-semantic-validator'], 'mesh/src/lib/reward-drift-comparison.mjs');
  assert.ok(schema['x-axiom-semantic-rules'].some(rule => rule.includes('incompatible')));
  assert.ok(schema['x-axiom-semantic-rules'].some(rule => rule.includes('insufficient-evidence')));
  assert.deepEqual(schema['x-axiom-non-claims'], [
    'universal-drift-threshold', 'model-promotion', 'model-routing', 'authority-grant',
    'runtime-activation', 'network-effect', 'biological-reward-equivalence'
  ]);
});
