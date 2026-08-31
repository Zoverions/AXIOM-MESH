import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl = new URL('../config/cognitive-learning-ledger-v0.schema.json', import.meta.url);

test('Cognitive Learning Ledger v0 schema preserves strict inert learning semantics', async () => {
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));

  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.properties.schema.const, 'axiom-cognitive-learning-ledger.v0');
  assert.equal(schema.properties.version.const, 0);
  assert.equal(schema.properties.status.const, 'inert-contract-laboratory');
  assert.equal(schema.additionalProperties, false);

  assert.deepEqual(schema.properties.learning_class.enum, [
    'episodic', 'semantic', 'procedural', 'personal', 'context', 'adapter', 'base-model', 'developmental'
  ]);
  assert.deepEqual(schema.properties.representation_class.enum, ['exact-retained', 'lossy', 'mixed']);
  assert.equal(schema.properties.current_tier.minimum, 0);
  assert.equal(schema.properties.current_tier.maximum, 6);
  assert.equal(schema.properties.proposed_target_tier.minimum, 0);
  assert.equal(schema.properties.proposed_target_tier.maximum, 6);

  assert.equal(schema.properties.source_evidence.maxItems, 128);
  assert.equal(schema.properties.derived_artifacts.maxItems, 64);
  assert.equal(schema.properties.resource_costs.maxItems, 64);
  assert.equal(schema.properties.policy_utility.maxItems, 8);
  assert.equal(schema.properties.evaluation_refs.maxItems, 64);
  assert.equal(schema.properties.predecessor_refs.maxItems, 64);
  assert.equal(schema.properties.successor_refs.maxItems, 64);

  assert.deepEqual(schema.properties.promotion_state.enum, [
    'observed', 'candidate', 'evaluated', 'accepted', 'rejected', 'superseded', 'rolled-back'
  ]);

  assert.equal(schema.properties.contains_secret_material.const, false);
  assert.equal(schema.properties.authority_effect.const, 'none');
  assert.equal(schema.properties.network_effect.const, 'none');
  assert.equal(schema.properties.training_effect.const, 'none');
  assert.equal(schema.properties.spend_authorization.const, 'none');
  assert.equal(schema.properties.runtime_activation.const, false);

  for (const name of ['artifactRef', 'derivedArtifact', 'expectedReuse', 'resourceCost', 'policyUtility']) {
    assert.equal(schema.$defs[name].additionalProperties, false, `${name} must reject unknown fields`);
  }

  assert.deepEqual(schema.$defs.resourceCost.properties.kind.enum, [
    'create', 'validate', 'store', 'maintain', 'migrate', 'per-use', 'risk-resource'
  ]);
  assert.deepEqual(schema.$defs.resourceCost.properties.basis.enum, ['observed', 'estimated', 'unknown']);
  assert.deepEqual(schema.$defs.policyUtility.properties.dimension.enum, [
    'reuse', 'quality', 'latency', 'privacy', 'sovereignty', 'resilience', 'portability', 'reversibility'
  ]);
  assert.deepEqual(schema.$defs.policyUtility.properties.value.enum, [
    'negative', 'neutral', 'positive', 'strong-positive', 'unknown'
  ]);

  assert.equal(schema['x-axiom-semantic-validator'], 'mesh/src/lib/cognitive-learning-ledger.mjs');
  assert.deepEqual(schema['x-axiom-semantic-rules'], [
    'duplicate source, derived-artifact, evaluation, predecessor, and successor references fail closed within their collections',
    'lossy records require at least one retained source-evidence reference',
    'identity-tier target 5 requires at least one evaluation reference',
    'base-model target 6 requires at least one evaluation reference and cannot be accepted by v0',
    'unknown resource-cost amount requires unknown basis',
    'resource costs preserve explicit units and are not converted or summed across unlike units',
    'policy-utility dimensions are unique within a record',
    'updated_at cannot precede created_at',
    'all no-effect and no-secret boundary constants fail closed'
  ]);
  assert.deepEqual(schema['x-axiom-non-claims'], [
    'authority-grant', 'runtime-activation', 'model-invocation', 'training-or-adaptation-execution',
    'network-fetch-or-egress', 'credential-access', 'spend-authorization', 'cross-unit-cost-conversion',
    'truth-or-subjective-identity-proof'
  ]);
});
