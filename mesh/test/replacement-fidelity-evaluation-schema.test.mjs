import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl = new URL('../config/replacement-fidelity-evaluation-v0.schema.json', import.meta.url);

test('Replacement Fidelity Evaluation v0 schema preserves strict dimension-specific inert evidence semantics', async () => {
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

  for (const definition of ['endpoint', 'lineage', 'suite', 'aggregationRules', 'dimension', 'thresholds']) {
    assert.equal(schema.$defs[definition].additionalProperties, false);
  }

  assert.deepEqual(schema.$defs.dimension.properties.dimension_id.enum, [
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
  assert.deepEqual(schema.$defs.dimension.properties.status.enum, ['pass', 'degraded', 'fail', 'indeterminate']);
  assert.deepEqual(schema.$defs.dimension.properties.confidence.enum, ['low', 'medium', 'high', 'unknown']);
  assert.deepEqual(schema.properties.aggregate_class.enum, [
    'high-fidelity',
    'acceptable-with-degradation',
    'materially-degraded',
    'insufficient-evidence',
    'incompatible'
  ]);
  assert.deepEqual(schema.$defs.aggregationRules.properties.degraded_result.enum, [
    'acceptable-with-degradation',
    'materially-degraded'
  ]);
  assert.deepEqual(schema.$defs.aggregationRules.properties.fail_result.enum, [
    'materially-degraded',
    'incompatible'
  ]);

  assert.equal(schema.$defs.dimension.properties.measured_score.anyOf[0].minimum, 0);
  assert.equal(schema.$defs.dimension.properties.measured_score.anyOf[0].maximum, 1);
  assert.equal(schema.$defs.thresholds.properties.degraded_min.minimum, 0);
  assert.equal(schema.$defs.thresholds.properties.pass_min.maximum, 1);
  assert.equal(schema.$defs.dimension.properties.sample_count.minimum, 0);
  assert.equal(schema.$defs.dimension.properties.sample_count.maximum, 1000000);
  assert.equal(schema.$defs.suite.properties.required_dimensions.uniqueItems, true);
  assert.equal(schema.$defs.suite.properties.required_dimensions.maxItems, 9);

  assert.equal(schema.properties.evaluation_id.pattern, '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$');
  assert.equal(schema.properties.topology_digest.pattern, '^[a-f0-9]{64}$');
  assert.equal(schema.$defs.endpoint.properties.artifact_digest.anyOf[0].pattern, '^[a-f0-9]{64}$');
  assert.equal(schema.$defs.dimension.properties.metric_digest.pattern, '^[a-f0-9]{64}$');
  assert.equal(schema.$defs.dimension.properties.evidence_digest.pattern, '^[a-f0-9]{64}$');

  assert.equal(
    schema['x-axiom-semantic-validator'],
    'mesh/src/lib/replacement-fidelity-evaluation.mjs'
  );
  assert.deepEqual(schema['x-axiom-semantic-rules'], [
    'topology_id and topology_digest must bind to one exact Cognitive Topology',
    'reference and candidate must be different nodes already declared in the same exact topology',
    'reference and candidate node_id, model_id, and owner-addressable artifact digests must exactly match Cognitive Topology',
    'suite_digest binds suite_id, lexicographically sorted unique required_dimensions, and aggregation_rules excluding suite_digest itself',
    'every required dimension must be explicitly present and every dimension_id must be unique and supported',
    'dimension measured_score, thresholds, and status must agree exactly; indeterminate has no numeric score',
    'aggregate_class is deterministically the weakest suite-required dimension constraint and cannot be strengthened by the document',
    'optional lineage must resolve to the exact same reference-to-candidate topology pair',
    'dimension-specific numeric scores are evidence only and never represent identity or subjective sameness percentages',
    'recorded_at cannot precede evaluated_at'
  ]);
  assert.deepEqual(schema['x-axiom-non-claims'], [
    'benchmark-execution',
    'evaluator-execution',
    'model-invocation',
    'model-equivalence',
    'behavioral-identity',
    'principal-continuity-proof',
    'subjective-identity-proof',
    'replacement-approval',
    'topology-mutation',
    'authority-grant',
    'network-effect',
    'runtime-activation'
  ]);
});
