import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl = new URL('../config/cognitive-capability-observation-v0.schema.json', import.meta.url);

async function loadSchema() {
  return JSON.parse(await readFile(schemaUrl, 'utf8'));
}

test('Capability Observation v0 schema mirrors the semantic contract', async () => {
  const schema = await loadSchema();

  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.type, 'object');
  assert.equal(schema.additionalProperties, false);
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
});

test('schema closes every object boundary and preserves exact enum vocabularies', async () => {
  const schema = await loadSchema();

  for (const name of ['context', 'evaluation', 'result', 'evaluator', 'evidence', 'resourceObservation']) {
    assert.equal(schema.$defs[name].type, 'object');
    assert.equal(schema.$defs[name].additionalProperties, false);
  }

  assert.deepEqual(schema.properties.capability.enum, [
    'reasoning',
    'coding',
    'vision',
    'computer-use',
    'research',
    'planning',
    'critique',
    'summarization',
    'embedding',
    'tool-use',
    'agent-orchestration',
    'other'
  ]);
  assert.deepEqual(schema.$defs.context.properties.difficulty_class.enum, [
    'trivial',
    'routine',
    'challenging',
    'expert',
    'adversarial',
    'unknown'
  ]);
  assert.deepEqual(schema.$defs.result.properties.classification.enum, [
    'pass',
    'degraded',
    'fail',
    'indeterminate'
  ]);
  assert.deepEqual(schema.$defs.evaluator.properties.evaluator_kind.enum, [
    'local-agent',
    'local-service',
    'remote-service',
    'human-reviewer',
    'provider',
    'external-verifier',
    'synthetic-harness'
  ]);
  assert.deepEqual(schema.$defs.evidence.properties.evidence_kind.enum, [
    'evaluation-run',
    'signed-evaluation-run',
    'human-review',
    'external-observation',
    'provider-report',
    'synthetic-probe-result',
    'other'
  ]);
  assert.deepEqual(schema.$defs.evidence.properties.assurance_class.enum, [
    'declared',
    'signed',
    'verified-local',
    'corroborated'
  ]);
  assert.deepEqual(schema.$defs.resourceObservation.properties.resource_class.enum, [
    'input-tokens',
    'output-tokens',
    'compute-time',
    'wall-time',
    'energy',
    'memory',
    'storage',
    'network-transfer',
    'currency',
    'other'
  ]);
  assert.deepEqual(schema.$defs.resourceObservation.properties.basis.enum, [
    'observed',
    'estimated',
    'unknown'
  ]);
  assert.equal(schema.$defs.result.properties.confidence.minimum, 0);
  assert.equal(schema.$defs.result.properties.confidence.maximum, 1);
});

test('schema annotations preserve semantic rules and non-claims', async () => {
  const schema = await loadSchema();
  const semanticRules = schema['x-axiom-semantic-rules'];
  const nonClaims = schema['x-axiom-non-claims'];

  assert.ok(Array.isArray(semanticRules));
  assert.ok(Array.isArray(nonClaims));

  const rules = semanticRules.join('\n').toLowerCase();
  assert.match(rules, /profile.*digest/);
  assert.match(rules, /capability.*declared/);
  assert.match(rules, /verification/);
  assert.match(rules, /signed-evaluation-run/);
  assert.match(rules, /valid_until|timestamp/);
  assert.match(rules, /unknown.*amount.*unit|amount.*unit.*unknown/);
  assert.match(rules, /unlike.*unit|no.*aggregation|never.*aggregat/);
  assert.match(rules, /routing.*authority|selection.*authority|non-authorizing/);

  const claims = nonClaims.join('\n').toLowerCase();
  assert.match(claims, /universal.*intelligence|global.*rank/);
  assert.match(claims, /cross-benchmark|benchmark.*comparability/);
  assert.match(claims, /availability/);
  assert.match(claims, /routing authority/);
  assert.match(claims, /execution authority/);
  assert.match(claims, /training/);
  assert.match(claims, /spend/);
  assert.match(claims, /capability.*promotion/);
  assert.match(claims, /topology.*mutation/);
});

test('top-level and nested required fields are explicit', async () => {
  const schema = await loadSchema();

  assert.deepEqual(schema.required, [
    'schema',
    'version',
    'status',
    'observation_id',
    'profile_id',
    'profile_digest',
    'capability',
    'context',
    'evaluation',
    'result',
    'evaluator',
    'evidence',
    'resource_observations',
    'observed_at',
    'valid_until',
    'recorded_at',
    'contains_secret_material',
    'authority_effect',
    'network_effect',
    'training_effect',
    'spend_effect',
    'runtime_activation',
    'selection_effect'
  ]);

  assert.deepEqual(schema.$defs.context.required, [
    'context_ref',
    'context_digest',
    'task_family_ref',
    'task_family_digest',
    'difficulty_class',
    'environment_ref',
    'environment_digest',
    'toolset_ref',
    'toolset_digest'
  ]);
  assert.deepEqual(schema.$defs.evaluation.required, [
    'suite_ref',
    'suite_digest',
    'metric_set_ref',
    'metric_set_digest',
    'threshold_ref',
    'threshold_digest',
    'method_ref',
    'method_digest'
  ]);
  assert.deepEqual(schema.$defs.result.required, [
    'classification',
    'confidence',
    'observed_metric_ref',
    'observed_metric_digest',
    'failure_mode_refs'
  ]);
});
