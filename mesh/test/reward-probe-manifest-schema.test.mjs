import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl = new URL('../config/reward-probe-manifest-v0.schema.json', import.meta.url);

test('Reward Probe Manifest v0 schema mirrors the closed evidence-only contract', async () => {
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.properties.schema.const, 'axiom-reward-probe-manifest.v0');
  assert.equal(schema.properties.version.const, 0);
  assert.equal(schema.properties.status.const, 'inert-evidence');
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.properties.probe_type.enum, ['state-value', 'reward-prediction-error']);
  assert.deepEqual(schema.properties.measurement_method.enum, ['linear-probe', 'sparse-feature-probe', 'activation-subset', 'model-native-signal', 'other-reviewed']);
  assert.deepEqual(schema.properties.transfer_scope.enum, ['exact-target-only', 'declared-family', 'reviewed-cross-target']);
  assert.deepEqual(schema.$defs.target.properties.kind.enum, ['topology-node', 'model-artifact', 'runtime-offering']);
  assert.deepEqual(schema.$defs.target.properties.artifact_digest_availability.enum, ['exact', 'unavailable-provider-controlled', 'not-applicable']);
  assert.deepEqual(schema.$defs.calibration.properties.class.enum, ['uncalibrated', 'calibrated-bounded', 'calibrated-probabilistic']);
  for (const name of ['target', 'calibration']) assert.equal(schema.$defs[name].additionalProperties, false);
  assert.equal(schema.properties.contains_secret_material.const, false);
  assert.equal(schema.properties.authority_effect.const, 'none');
  assert.equal(schema.properties.network_effect.const, 'none');
  assert.equal(schema.properties.credential_visibility.const, 'none');
  assert.equal(schema.properties.runtime_activation.const, false);
  assert.equal(schema.properties.routing_effect.const, 'none');
  assert.equal(schema.properties.promotion_effect.const, 'evidence-only');
  assert.equal(schema.$defs.digest.pattern, '^[a-f0-9]{64}$');
  assert.equal(schema['x-axiom-semantic-validator'], 'mesh/src/lib/reward-probe-manifest.mjs');
  assert.ok(schema['x-axiom-semantic-rules'].some(rule => rule.includes('exact')));
  assert.deepEqual(schema['x-axiom-non-claims'], [
    'authority-grant', 'routing', 'promotion', 'runtime-activation', 'network-effect',
    'biological-dopamine', 'consciousness-inference'
  ]);
});
