import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl = new URL('../config/reward-calibration-report-v0.schema.json', import.meta.url);

test('Reward Calibration Report v0 schema preserves independent evidence-only calibration semantics', async () => {
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.properties.schema.const, 'axiom-reward-calibration-report.v0');
  assert.equal(schema.properties.version.const, 0);
  assert.equal(schema.properties.status.const, 'inert-evidence');
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.$defs.verificationSource.additionalProperties, false);
  assert.equal(schema.$defs.observationOutcomePair.additionalProperties, false);
  assert.equal(schema.$defs.metric.additionalProperties, false);
  assert.deepEqual(schema.$defs.verificationSource.properties.source_class.enum, [
    'benchmark-harness', 'deterministic-checker', 'human-adjudication', 'independent-verifier', 'other-reviewed'
  ]);
  assert.deepEqual(schema.$defs.observationOutcomePair.properties.outcome.enum, ['success', 'failure']);
  assert.deepEqual(schema.$defs.metric.properties.name.enum, [
    'agreement-count', 'disagreement-count', 'success-rate', 'calibration-error',
    'discrimination-score', 'false-high-confidence-count', 'false-low-confidence-count',
    'missing-invalid-observation-count'
  ]);
  assert.deepEqual(schema.properties.calibration_status.enum, [
    'calibrated', 'miscalibrated', 'mixed', 'insufficient-evidence', 'incompatible'
  ]);
  assert.equal(schema.$defs.verificationSource.properties.independent_from_probe.const, true);
  assert.equal(schema.properties.contains_secret_material.const, false);
  assert.equal(schema.properties.authority_effect.const, 'none');
  assert.equal(schema.properties.network_effect.const, 'none');
  assert.equal(schema.properties.credential_visibility.const, 'none');
  assert.equal(schema.properties.runtime_activation.const, false);
  assert.equal(schema.properties.routing_effect.const, 'none');
  assert.equal(schema.properties.promotion_effect.const, 'evidence-only');
  assert.equal(schema['x-axiom-semantic-validator'], 'mesh/src/lib/reward-calibration-report.mjs');
  assert.ok(schema['x-axiom-semantic-rules'].some(rule => rule.includes('independent')));
  assert.ok(schema['x-axiom-semantic-rules'].some(rule => rule.includes('insufficient-evidence')));
  assert.deepEqual(schema['x-axiom-non-claims'], [
    'truth-from-internal-confidence', 'self-attested-correctness', 'model-promotion', 'model-routing',
    'authority-grant', 'runtime-activation', 'network-effect'
  ]);
});
