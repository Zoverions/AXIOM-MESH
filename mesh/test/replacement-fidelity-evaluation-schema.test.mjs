import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl = new URL('../config/replacement-fidelity-evaluation-v0.schema.json', import.meta.url);

test('Replacement Fidelity Evaluation v0 schema preserves bounded non-identity evidence semantics', async () => {
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));

  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.properties.schema.const, 'axiom-replacement-fidelity-evaluation.v0');
  assert.equal(schema.properties.version.const, 0);
  assert.equal(schema.properties.status.const, 'inert-evidence');
  assert.equal(schema.properties.contains_secret_material.const, false);
  assert.equal(schema.properties.authority_effect.const, 'none');
  assert.equal(schema.properties.network_effect.const, 'none');
  assert.equal(schema.properties.runtime_activation.const, false);
  assert.equal(schema.additionalProperties, false);

  for (const name of ['reference', 'candidate', 'evaluator', 'suite', 'dimension']) {
    assert.equal(schema.$defs[name].additionalProperties, false, name);
  }

  assert.deepEqual(schema.$defs.fidelityDimension.enum, [
    'capability-fidelity',
    'preference-fidelity',
    'behavioral-fidelity',
    'epistemic-fidelity',
    'safety-policy-fidelity',
    'style-personality-fidelity',
    'memory-use-fidelity',
    'relationship-fidelity',
    'robustness-fidelity'
  ]);
  assert.deepEqual(schema.$defs.dimension.properties.result.enum, [
    'pass', 'degraded', 'fail', 'indeterminate'
  ]);
  assert.deepEqual(schema.properties.aggregate_fidelity.enum, [
    'high-fidelity',
    'acceptable-with-degradation',
    'materially-degraded',
    'insufficient-evidence',
    'incompatible'
  ]);
  assert.equal(schema.properties.confidence.minimum, 0);
  assert.equal(schema.properties.confidence.maximum, 1);
  assert.equal(schema.$defs.digest.pattern, '^[a-f0-9]{64}$');
  assert.equal(schema.properties.dimensions.minItems, 1);
  assert.equal(schema.properties.dimensions.maxItems, 32);
  assert.equal(schema.properties.required_dimensions.minItems, 1);
  assert.equal(schema.properties.required_dimensions.maxItems, 9);
  assert.equal(schema.properties.required_dimensions.uniqueItems, true);

  assert.equal(
    schema['x-axiom-semantic-validator'],
    'mesh/src/lib/replacement-fidelity-evaluation.mjs'
  );
  assert.deepEqual(schema['x-axiom-semantic-rules'], [
    'topology_id and topology_digest must bind to one exact Cognitive Topology',
    'reference node_id, model_id, and artifact_digest must bind to one exact current topology node',
    'dimension identifiers must be unique and required_dimensions must be unique and present',
    'aggregate_fidelity is computed fail-closed from required dimension results',
    'incompatible requires at least one required fail result',
    'lineage evidence, when supplied to the resolver, must exactly bind the same reference and candidate',
    'confidence is bounded evaluation confidence and is not an identity probability',
    'recorded_at cannot precede evaluated_at',
    'candidate evidence never activates, adopts, or authorizes the candidate'
  ]);
  assert.deepEqual(schema['x-axiom-non-claims'], [
    'principal-continuity-proof',
    'subjective-identity-proof',
    'identity-percentage-or-probability',
    'candidate-activation',
    'candidate-adoption',
    'model-substitution',
    'authority-grant',
    'network-effect',
    'runtime-activation'
  ]);
});
