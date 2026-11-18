import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl = new URL('../config/bounded-decision-observation-v0.schema.json', import.meta.url);

test('Bounded Decision Observation v0 schema preserves typed probability evidence without authority', async () => {
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));

  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.properties.schema.const, 'axiom-bounded-decision-observation.v0');
  assert.equal(schema.properties.version.const, 0);
  assert.equal(schema.properties.status.const, 'inert-bounded-decision-observation');
  assert.equal(schema.additionalProperties, false);

  assert.equal(schema.required.includes('provider_profile_digest'), true);
  assert.equal(schema.required.includes('question_schema_digest'), true);
  assert.equal(schema.required.includes('state_digest'), true);
  assert.equal(schema.required.includes('probability_evidence'), true);
  assert.equal(schema.required.includes('observation_digest'), true);
  assert.equal(schema.properties.state, undefined);
  assert.equal(schema.properties.raw_state, undefined);
  assert.equal(schema.properties.required_assurance, undefined);
  assert.equal(schema.properties.achieved_assurance, undefined);

  assert.deepEqual(schema.properties.offering_revision_evidence.enum, [
    'exact-artifact', 'provider-versioned', 'mutable-alias', 'unknown'
  ]);
  assert.equal(schema.properties.provider_confidence.minimum, 0);
  assert.equal(schema.properties.provider_confidence.maximum, 1);
  assert.equal(schema.properties.latency_ms.minimum, 0);

  assert.equal(schema.$defs.usageEvidence.additionalProperties, false);
  assert.deepEqual(schema.$defs.usageEvidence.required, [
    'input_units', 'output_units', 'compute_class', 'provider_report_ref'
  ]);

  assert.equal(schema.$defs.choiceAnswer.additionalProperties, false);
  assert.equal(schema.$defs.scoreAnswer.additionalProperties, false);
  assert.equal(schema.$defs.binaryAnswer.additionalProperties, false);
  assert.equal(schema.$defs.choiceProbability.additionalProperties, false);
  assert.equal(schema.$defs.scoreProbability.additionalProperties, false);
  assert.equal(schema.$defs.binaryProbability.additionalProperties, false);
  assert.equal(schema.properties.answer.oneOf.length, 3);
  assert.equal(schema.properties.probability_evidence.oneOf.length, 3);

  assert.equal(schema.properties.authority_effect.const, 'none');
  assert.equal(schema.properties.assurance_effect.const, 'none');
  assert.equal(schema.properties.network_effect.const, 'none');
  assert.equal(schema.properties.credential_visibility.const, 'none');
  assert.equal(schema.properties.runtime_activation.const, false);
  assert.equal(schema.properties.selection_effect.const, 'evidence-only');

  assert.equal(
    schema['x-axiom-semantic-validator'],
    'mesh/src/lib/bounded-decision-observation.mjs'
  );
  assert.ok(schema['x-axiom-semantic-rules'].some(rule => rule.includes('sum to 1')));
  assert.ok(schema['x-axiom-semantic-rules'].some(rule => rule.includes('weighted')));
  assert.ok(schema['x-axiom-semantic-rules'].some(rule => rule.includes('tie')));
  assert.ok(schema['x-axiom-semantic-rules'].some(rule => rule.includes('raw state')));
  assert.deepEqual(schema['x-axiom-non-claims'], [
    'semantic-correctness',
    'authority-grant',
    'assurance-promotion',
    'tool-execution',
    'provider-availability',
    'calibration-truth'
  ]);
});
