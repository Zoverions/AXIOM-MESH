import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl = new URL('../config/cognitive-capability-surface-report-v0.schema.json', import.meta.url);

async function loadSchema() {
  return JSON.parse(await readFile(schemaUrl, 'utf8'));
}

test('surface report schema mirrors the inert evidence-aggregation boundary', async () => {
  const schema = await loadSchema();
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.properties.schema.const, 'axiom-cognitive-capability-surface-report.v0');
  assert.equal(schema.properties.version.const, 0);
  assert.equal(schema.properties.status.const, 'inert-evidence-report');
  assert.equal(schema.properties.observations.maxItems, 256);
  assert.equal(schema.properties.capability_surfaces.maxItems, 12);
  assert.equal(schema.properties.contains_secret_material.const, false);
  assert.equal(schema.properties.authority_effect.const, 'none');
  assert.equal(schema.properties.network_effect.const, 'none');
  assert.equal(schema.properties.training_effect.const, 'none');
  assert.equal(schema.properties.spend_effect.const, 'none');
  assert.equal(schema.properties.runtime_activation.const, false);
  assert.equal(schema.properties.selection_effect.const, 'evidence-only');
  assert.equal(
    schema['x-axiom-semantic-validator'],
    'mesh/src/lib/cognitive-capability-surface-report.mjs'
  );
  for (const forbidden of ['score', 'rank', 'winner', 'routing_weight', 'average_confidence']) {
    assert.equal(Object.hasOwn(schema.properties, forbidden), false);
  }
});

test('schema fails closed at every report object boundary', async () => {
  const schema = await loadSchema();
  assert.equal(schema.additionalProperties, false);
  for (const def of [
    'observationInventory', 'capabilitySurface', 'observationCounts', 'cell', 'dimensions',
    'classificationCounts', 'evaluatorCoverage', 'observationRef', 'failureMode', 'resourceRange'
  ]) {
    assert.equal(schema.$defs[def].additionalProperties, false, `${def} must fail closed`);
  }
});

test('schema preserves freshness, capability, conflict, assurance, and resource vocabularies', async () => {
  const schema = await loadSchema();
  assert.deepEqual(schema.$defs.observationInventory.properties.freshness_class.enum, [
    'current', 'stale', 'future', 'not-yet-recorded'
  ]);
  assert.deepEqual(schema.$defs.capabilitySurface.properties.capability.enum, [
    'reasoning', 'coding', 'vision', 'computer-use', 'research', 'planning',
    'critique', 'summarization', 'embedding', 'tool-use', 'agent-orchestration', 'other'
  ]);
  assert.deepEqual(schema.$defs.cell.properties.conflict_class.enum, ['none', 'mixed', 'direct']);
  assert.deepEqual(schema.$defs.cell.properties.assurance_classes.items.enum, [
    'declared', 'signed', 'verified-local', 'corroborated'
  ]);
  assert.deepEqual(schema.$defs.resourceRange.properties.resource_class.enum, [
    'input-tokens', 'output-tokens', 'compute-time', 'wall-time', 'energy',
    'memory', 'storage', 'network-transfer', 'currency', 'other'
  ]);
  assert.deepEqual(schema.$defs.resourceRange.properties.basis.enum, ['observed', 'estimated', 'unknown']);
  assert.equal(schema.$defs.resourceRange.properties.measurement_count.minimum, 1);
});

test('semantic annotations preserve historical, exact-cell, attribution, and no-ranking rules', async () => {
  const schema = await loadSchema();
  const rules = schema['x-axiom-semantic-rules'].join('\n');
  assert.match(rules, /future.*not-yet-recorded.*stale.*current/i);
  assert.match(rules, /wall clock|wall-clock/i);
  assert.match(rules, /exact.*cell.*context.*task.*environment.*toolset.*suite.*metric.*threshold.*method/i);
  assert.match(rules, /declared.*no observations.*not.*fail/i);
  assert.match(rules, /pass.*fail.*direct/i);
  assert.match(rules, /contextual.*variation.*not.*direct/i);
  assert.match(rules, /measurement_count.*resource entries.*supporting observations.*deduplicated/i);
  assert.match(rules, /no.*majority|majority.*not/i);
  assert.match(rules, /aggregation.*not.*authority/i);

  const nonClaims = new Set(schema['x-axiom-non-claims']);
  for (const item of [
    'universal-intelligence-score',
    'overall-quality-rank',
    'majority-vote-truth',
    'cross-benchmark-comparability',
    'future-task-success-probability',
    'evaluator-independence',
    'routing-authority',
    'execution-authority',
    'training-authority',
    'spend-authority',
    'topology-mutation',
    'learning-promotion'
  ]) assert.equal(nonClaims.has(item), true, `missing non-claim ${item}`);
});
