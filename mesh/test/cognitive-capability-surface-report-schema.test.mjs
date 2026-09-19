import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl = new URL('../config/cognitive-capability-surface-report-v0.schema.json', import.meta.url);

async function loadSchema() {
  return JSON.parse(await readFile(schemaUrl, 'utf8'));
}

test('Capability Surface Report v0 schema mirrors the inert semantic contract', async () => {
  const schema = await loadSchema();

  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(
    schema.$id,
    'https://axiom.invalid/schemas/cognitive-capability-surface-report-v0.schema.json'
  );
  assert.equal(schema.type, 'object');
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.schema.const, 'axiom-cognitive-capability-surface-report.v0');
  assert.equal(schema.properties.version.const, 0);
  assert.equal(schema.properties.status.const, 'inert-evidence-report');
  assert.equal(schema.properties.source_observations.maxItems, 256);
  assert.equal(schema.properties.capability_surfaces.maxItems, 64);
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
});

test('schema closes every report object boundary and preserves exact enums', async () => {
  const schema = await loadSchema();

  for (const name of [
    'sourceObservation',
    'capabilitySurface',
    'currentCell',
    'cellKey',
    'classificationCounts',
    'evaluatorEvidence',
    'failureMode',
    'resourceBucket'
  ]) {
    assert.equal(schema.$defs[name].type, 'object');
    assert.equal(schema.$defs[name].additionalProperties, false);
  }

  assert.deepEqual(schema.$defs.sourceObservation.properties.freshness.enum, [
    'current',
    'stale',
    'future',
    'not-yet-recorded'
  ]);
  assert.deepEqual(schema.$defs.currentCell.properties.conflict_class.enum, [
    'none',
    'mixed',
    'direct'
  ]);
  assert.deepEqual(schema.$defs.currentCell.properties.classification_set.items.enum, [
    'pass',
    'degraded',
    'fail',
    'indeterminate'
  ]);
  assert.deepEqual(schema.$defs.cellKey.properties.difficulty_class.enum, [
    'trivial',
    'routine',
    'challenging',
    'expert',
    'adversarial',
    'unknown'
  ]);
  assert.deepEqual(schema.$defs.resourceBucket.properties.basis.enum, [
    'observed',
    'estimated',
    'unknown'
  ]);

  assert.equal(schema.$defs.capabilitySurface.properties.current_cells.maxItems, 256);
  assert.equal(schema.$defs.currentCell.properties.evaluator_evidence.maxItems, 256);
  assert.equal(schema.$defs.currentCell.properties.failure_modes.maxItems, 256);
  assert.equal(schema.$defs.currentCell.properties.resource_buckets.maxItems, 256);
});

test('top-level and nested required fields mirror the semantic validator', async () => {
  const schema = await loadSchema();

  assert.deepEqual(schema.required, [
    'schema',
    'version',
    'status',
    'report_id',
    'profile_id',
    'profile_digest',
    'assessment_at',
    'recorded_at',
    'source_observations',
    'capability_surfaces',
    'contains_secret_material',
    'authority_effect',
    'network_effect',
    'training_effect',
    'spend_effect',
    'runtime_activation',
    'selection_effect'
  ]);

  assert.deepEqual(schema.$defs.sourceObservation.required, [
    'observation_id',
    'observation_digest',
    'capability',
    'freshness',
    'observed_at',
    'valid_until',
    'recorded_at'
  ]);
  assert.deepEqual(schema.$defs.capabilitySurface.required, [
    'capability',
    'current_cells',
    'direct_conflict_cells',
    'mixed_conflict_cells',
    'variation_present'
  ]);
  assert.deepEqual(schema.$defs.currentCell.required, [
    'cell_key',
    'cell_digest',
    'observation_refs',
    'observation_digests',
    'classification_counts',
    'classification_set',
    'conflict_class',
    'evaluator_evidence',
    'failure_modes',
    'resource_buckets'
  ]);
  assert.deepEqual(schema.$defs.cellKey.required, [
    'capability',
    'context_ref',
    'context_digest',
    'task_family_ref',
    'task_family_digest',
    'difficulty_class',
    'environment_ref',
    'environment_digest',
    'toolset_ref',
    'toolset_digest',
    'suite_ref',
    'suite_digest',
    'metric_set_ref',
    'metric_set_digest',
    'threshold_ref',
    'threshold_digest',
    'method_ref',
    'method_digest'
  ]);
  assert.deepEqual(schema.$defs.classificationCounts.required, [
    'pass',
    'degraded',
    'fail',
    'indeterminate'
  ]);
  assert.deepEqual(schema.$defs.evaluatorEvidence.required, [
    'evaluator_kind',
    'evaluator_ref',
    'evaluator_principal_ref',
    'assurance_class',
    'evidence_kind',
    'evidence_ref',
    'evidence_digest',
    'verification_ref',
    'verification_digest',
    'observation_refs'
  ]);
  assert.deepEqual(schema.$defs.failureMode.required, [
    'failure_mode_ref',
    'observation_refs'
  ]);
  assert.deepEqual(schema.$defs.resourceBucket.required, [
    'resource_class',
    'basis',
    'unit',
    'measurement_count',
    'min_amount',
    'max_amount',
    'observation_refs'
  ]);
});

test('schema annotations preserve semantic derivation rules and non-claims', async () => {
  const schema = await loadSchema();
  const semanticRules = schema['x-axiom-semantic-rules'];
  const nonClaims = schema['x-axiom-non-claims'];

  assert.ok(Array.isArray(semanticRules));
  assert.ok(Array.isArray(nonClaims));

  const rules = semanticRules.join('\n').toLowerCase();
  assert.match(rules, /profile.*digest/);
  assert.match(rules, /source.*digest|observation.*digest/);
  assert.match(rules, /freshness.*precedence|future.*not-yet-recorded.*stale/);
  assert.match(rules, /exact.*cell/);
  assert.match(rules, /conflict/);
  assert.match(rules, /canonical.*order/);
  assert.match(rules, /resource.*unit|unit.*resource/);
  assert.match(rules, /re-deriv|re-verif|verify/);

  const claims = nonClaims.join('\n').toLowerCase();
  assert.match(claims, /universal.*score|universal.*model/);
  assert.match(claims, /provider.*rank|global.*rank/);
  assert.match(claims, /majority.*winner|majority.*truth/);
  assert.match(claims, /routing.*weight|routing.*authority/);
  assert.match(claims, /evaluator.*independence|independence.*evaluator/);
  assert.match(claims, /execution.*authority/);
  assert.match(claims, /training/);
  assert.match(claims, /spend/);
});
