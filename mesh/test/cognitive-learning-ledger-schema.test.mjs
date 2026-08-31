import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl = new URL('../config/cognitive-learning-ledger-v0.schema.json', import.meta.url);

async function loadSchema() {
  return JSON.parse(await readFile(schemaUrl, 'utf8'));
}

test('cognitive learning ledger schema mirrors the inert contract boundary', async () => {
  const schema = await loadSchema();
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.properties.schema.const, 'axiom-cognitive-learning-ledger.v0');
  assert.equal(schema.properties.version.const, 0);
  assert.equal(schema.properties.status.const, 'inert-contract-laboratory');
  assert.equal(schema.properties.source_evidence.minItems, 1);
  assert.equal(schema.properties.source_evidence.maxItems, 64);
  assert.equal(schema.properties.resource_costs.maxItems, 32);
  assert.equal(schema.properties.evaluation_evidence.maxItems, 64);
  assert.equal(schema.properties.contains_secret_material.const, false);
  assert.equal(schema.properties.authority_effect.const, 'none');
  assert.equal(schema.properties.network_effect.const, 'none');
  assert.equal(schema.properties.training_effect.const, 'none');
  assert.equal(schema.properties.spend_effect.const, 'none');
  assert.equal(schema.properties.runtime_activation.const, false);
  assert.equal(schema['x-axiom-semantic-validator'], 'mesh/src/lib/cognitive-learning-ledger.mjs');
  assert.equal(Object.hasOwn(schema.properties, 'aggregate_score'), false);
});

test('schema rejects unknown fields at every object boundary', async () => {
  const schema = await loadSchema();
  assert.equal(schema.additionalProperties, false);
  for (const def of ['sourceEvidence', 'artifact', 'expectedReuse', 'resourceCost', 'policyUtility']) {
    assert.equal(schema.$defs[def].additionalProperties, false, `${def} must fail closed`);
  }
});

test('schema preserves learning, tier, reuse, cost, and utility enum domains', async () => {
  const schema = await loadSchema();
  assert.deepEqual(schema.properties.learning_class.enum, [
    'episodic', 'semantic', 'procedural', 'personal', 'context', 'adapter', 'base-model', 'developmental'
  ]);
  assert.deepEqual(schema.properties.representation_class.enum, ['exact-retained', 'lossy', 'mixed']);
  assert.deepEqual(schema.properties.current_tier.enum, [
    'active-context', 'retrievable-memory', 'semantic-consolidation', 'skill-workflow',
    'adapter-specialist', 'identity-kernel', 'foundation-training'
  ]);
  assert.deepEqual(schema.$defs.expectedReuse.properties.class.enum, [
    'one-shot', 'occasional', 'recurring', 'frequent', 'unknown'
  ]);
  assert.deepEqual(schema.$defs.resourceCost.properties.cost_class.enum, [
    'create', 'validate', 'store', 'maintain', 'migrate', 'risk-resource', 'per-use'
  ]);
  assert.deepEqual(schema.$defs.resourceCost.properties.basis.enum, ['observed', 'estimated', 'unknown']);
  assert.deepEqual(schema.$defs.policyUtility.properties.privacy.enum, ['negative', 'neutral', 'positive', 'unknown']);
});

test('semantic annotations document cross-field safety rules and non-claims', async () => {
  const schema = await loadSchema();
  const rules = schema['x-axiom-semantic-rules'].join('\n');
  assert.match(rules, /principal.*composition binding/i);
  assert.match(rules, /exact-retained.*digest/i);
  assert.match(rules, /unknown.*amount.*unit/i);
  assert.match(rules, /identity-kernel.*evaluation/i);
  assert.match(rules, /duplicate.*ref/i);
  assert.match(rules, /self-reference/i);

  const nonClaims = new Set(schema['x-axiom-non-claims']);
  for (const item of [
    'authority-grant',
    'network-fetch',
    'provider-or-model-invocation',
    'training-or-adaptation-execution',
    'spend-authorization',
    'skill-or-model-activation',
    'routing-mutation',
    'truth-or-subjective-identity-proof'
  ]) assert.equal(nonClaims.has(item), true, `missing non-claim ${item}`);
});
