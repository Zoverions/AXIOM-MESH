import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl = new URL('../config/cognitive-capability-observation-v0.schema.json', import.meta.url);

async function loadSchema() {
  return JSON.parse(await readFile(schemaUrl, 'utf8'));
}

test('capability observation schema mirrors the inert empirical-evidence boundary', async () => {
  const schema = await loadSchema();
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.properties.schema.const, 'axiom-cognitive-capability-observation.v0');
  assert.equal(schema.properties.version.const, 0);
  assert.equal(schema.properties.status.const, 'inert-evidence');
  assert.equal(schema.properties.result.$ref, '#/$defs/result');
  assert.equal(schema.$defs.result.properties.failure_mode_refs.maxItems, 32);
  assert.equal(schema.properties.resource_observations.maxItems, 32);
  assert.equal(schema.properties.contains_secret_material.const, false);
  assert.equal(schema.properties.authority_effect.const, 'none');
  assert.equal(schema.properties.network_effect.const, 'none');
  assert.equal(schema.properties.training_effect.const, 'none');
  assert.equal(schema.properties.spend_effect.const, 'none');
  assert.equal(schema.properties.runtime_activation.const, false);
  assert.equal(schema.properties.selection_effect.const, 'evidence-only');
  assert.equal(
    schema['x-axiom-semantic-validator'],
    'mesh/src/lib/cognitive-capability-observation.mjs'
  );
  assert.equal(Object.hasOwn(schema.properties, 'aggregate_score'), false);
  assert.equal(Object.hasOwn(schema.properties, 'routing_weight'), false);
});

test('schema rejects unknown fields at every object boundary', async () => {
  const schema = await loadSchema();
  assert.equal(schema.additionalProperties, false);
  for (const def of ['context', 'evaluation', 'result', 'evaluator', 'evidence', 'resourceObservation']) {
    assert.equal(schema.$defs[def].additionalProperties, false, `${def} must fail closed`);
  }
});

test('schema preserves exact enum domains and bounds', async () => {
  const schema = await loadSchema();
  assert.deepEqual(schema.properties.capability.enum, [
    'reasoning', 'coding', 'vision', 'computer-use', 'research', 'planning',
    'critique', 'summarization', 'embedding', 'tool-use', 'agent-orchestration', 'other'
  ]);
  assert.deepEqual(schema.$defs.context.properties.difficulty_class.enum, [
    'trivial', 'routine', 'challenging', 'expert', 'adversarial', 'unknown'
  ]);
  assert.deepEqual(schema.$defs.result.properties.classification.enum, [
    'pass', 'degraded', 'fail', 'indeterminate'
  ]);
  assert.deepEqual(schema.$defs.evaluator.properties.evaluator_kind.enum, [
    'local-agent', 'local-service', 'remote-service', 'human-reviewer',
    'provider', 'external-verifier', 'synthetic-harness'
  ]);
  assert.deepEqual(schema.$defs.evidence.properties.evidence_kind.enum, [
    'evaluation-run', 'signed-evaluation-run', 'human-review', 'external-observation',
    'provider-report', 'synthetic-probe-result', 'other'
  ]);
  assert.deepEqual(schema.$defs.evidence.properties.assurance_class.enum, [
    'declared', 'signed', 'verified-local', 'corroborated'
  ]);
  assert.deepEqual(schema.$defs.resourceObservation.properties.resource_class.enum, [
    'input-tokens', 'output-tokens', 'compute-time', 'wall-time', 'energy',
    'memory', 'storage', 'network-transfer', 'currency', 'other'
  ]);
  assert.deepEqual(schema.$defs.resourceObservation.properties.basis.enum, [
    'observed', 'estimated', 'unknown'
  ]);
  assert.equal(schema.$defs.result.properties.confidence.minimum, 0);
  assert.equal(schema.$defs.result.properties.confidence.maximum, 1);
});

test('semantic annotations preserve profile binding, evidence, resource, time, and authority rules', async () => {
  const schema = await loadSchema();
  const rules = schema['x-axiom-semantic-rules'].join('\n');
  assert.match(rules, /profile_id.*profile_digest.*exact/i);
  assert.match(rules, /capability.*declared.*profile/i);
  assert.match(rules, /verification_ref.*verification_digest.*paired/i);
  assert.match(rules, /signed-evaluation-run.*declared/i);
  assert.match(rules, /unknown.*amount.*unit.*null/i);
  assert.match(rules, /valid_until.*recorded_at.*observed_at/i);
  assert.match(rules, /resource.*not.*aggregat/i);
  assert.match(rules, /selection.*evidence-only.*authority/i);

  const nonClaims = new Set(schema['x-axiom-non-claims']);
  for (const item of [
    'global-intelligence-rank',
    'cross-benchmark-comparability',
    'availability-proof',
    'routing-authority',
    'execution-authority',
    'training-or-adaptation-authority',
    'spend-authority',
    'capability-promotion',
    'topology-mutation'
  ]) assert.equal(nonClaims.has(item), true, `missing non-claim ${item}`);
});
