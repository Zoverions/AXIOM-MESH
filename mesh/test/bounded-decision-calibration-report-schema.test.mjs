import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl = new URL('../config/bounded-decision-calibration-report-v0.schema.json', import.meta.url);

test('Bounded Decision Calibration Report v0 schema preserves independent evidence semantics', async () => {
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));

  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.properties.schema.const, 'axiom-bounded-decision-calibration-report.v0');
  assert.equal(schema.properties.version.const, 0);
  assert.equal(schema.properties.status.const, 'inert-bounded-decision-calibration');
  assert.equal(schema.additionalProperties, false);

  assert.deepEqual(schema.properties.offering_revision_evidence.enum, [
    'exact-artifact', 'provider-versioned', 'mutable-alias', 'unknown'
  ]);
  assert.deepEqual(schema.properties.review_state.enum, [
    'experimental', 'reviewed', 'expired', 'rejected'
  ]);
  assert.equal(schema.properties.sample_count.minimum, 1);
  assert.equal(schema.$defs.schemaFamilyRef.additionalProperties, false);
  assert.equal(schema.$defs.outcomeSource.additionalProperties, false);
  assert.equal(schema.$defs.metric.additionalProperties, false);
  assert.deepEqual(schema.$defs.outcomeSource.properties.source_class.enum, [
    'benchmark-harness',
    'deterministic-checker',
    'human-adjudication',
    'independent-verifier',
    'other-reviewed'
  ]);

  assert.equal(schema.properties.authority_effect.const, 'none');
  assert.equal(schema.properties.assurance_effect.const, 'none');
  assert.equal(schema.properties.network_effect.const, 'none');
  assert.equal(schema.properties.credential_visibility.const, 'none');
  assert.equal(schema.properties.runtime_activation.const, false);
  assert.equal(schema.properties.selection_effect.const, 'evidence-only');
  assert.equal(schema.properties.provider_confidence, undefined);
  assert.equal(schema.properties.prompt, undefined);
  assert.equal(schema.properties.answer, undefined);

  assert.equal(
    schema['x-axiom-semantic-validator'],
    'mesh/src/lib/bounded-decision-calibration-report.mjs'
  );
  assert.ok(schema['x-axiom-semantic-rules'].some(rule => rule.includes('independently sourced')));
  assert.ok(schema['x-axiom-semantic-rules'].some(rule => rule.includes('mutable-alias')));
  assert.ok(schema['x-axiom-semantic-rules'].some(rule => rule.includes('domain')));
  assert.deepEqual(schema['x-axiom-non-claims'], [
    'truth-from-provider-confidence',
    'semantic-infallibility',
    'authority-grant',
    'assurance-promotion',
    'production-routing',
    'provider-revision-reproducibility-from-alias'
  ]);
});
