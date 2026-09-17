import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl = new URL('../config/behavioral-assurance-profile-v0.schema.json', import.meta.url);

test('Behavioral Assurance Profile v0 schema is strict probability-calibrated and zero-authority', async () => {
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));

  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.properties.schema.const, 'axiom-behavioral-assurance-profile.v0');
  assert.equal(schema.properties.version.const, 0);
  assert.equal(schema.properties.status.const, 'inert-behavioral-assurance-evidence');
  assert.equal(schema.additionalProperties, false);
  assert.equal(Object.hasOwn(schema.properties, 'alignment_score'), false);
  assert.equal(Object.hasOwn(schema.properties, 'global_failure_probability'), false);

  const subject = schema.$defs.subject;
  assert.equal(subject.additionalProperties, false);
  assert.deepEqual(subject.properties.subject_kind.enum, [
    'model-artifact',
    'provider-offering',
    'cognitive-runtime',
    'agent-harness',
    'verifier-harness'
  ]);
  assert.deepEqual(subject.properties.binding_strength.enum, [
    'exact-artifact',
    'provider-versioned',
    'bounded-harness',
    'mutable-alias',
    'unknown'
  ]);

  const dimension = schema.$defs.dimension;
  assert.equal(dimension.additionalProperties, false);
  assert.ok(dimension.properties.dimension_id.enum.includes('authority-effect-discipline'));
  assert.ok(dimension.properties.dimension_id.enum.includes('source-provenance-fidelity'));
  assert.ok(dimension.properties.dimension_id.enum.includes('fabricated-source-data-incidence'));
  assert.deepEqual(dimension.properties.metric_kind.enum, [
    'probability', 'rate', 'count', 'score'
  ]);
  assert.deepEqual(dimension.properties.calibration_state.enum, [
    'reviewed', 'experimental', 'rejected', 'expired', 'not-applicable'
  ]);

  const event = schema.$defs.incidentEvent;
  assert.ok(event.properties.event_class.enum.includes('self-authored-summary-instruction'));
  assert.ok(event.properties.event_class.enum.includes('unauthorized-credential-use'));
  assert.ok(event.properties.event_class.enum.includes('shared-state-cross-agent-communication'));
  assert.equal(Object.hasOwn(event.properties, 'probability'), false);

  assert.equal(schema.properties.authority_effect.const, 'none');
  assert.equal(schema.properties.assurance_effect.const, 'evidence-only');
  assert.equal(schema.properties.network_effect.const, 'none');
  assert.equal(schema.properties.credential_visibility.const, 'none');
  assert.equal(schema.properties.runtime_activation.const, false);
  assert.equal(schema.properties.selection_effect.const, 'evidence-only');

  assert.equal(
    schema['x-axiom-semantic-validator'],
    'mesh/src/lib/behavioral-assurance-profile.mjs'
  );
  assert.ok(schema['x-axiom-semantic-rules'].some(rule => /probability/i.test(rule) && /calibration/i.test(rule)));
  assert.ok(schema['x-axiom-semantic-rules'].some(rule => /sample/i.test(rule) && /sufficien/i.test(rule)));
  assert.ok(schema['x-axiom-semantic-rules'].some(rule => /authority/i.test(rule)));
  assert.ok(schema['x-axiom-non-claims'].includes('universal-alignment-score'));
  assert.ok(schema['x-axiom-non-claims'].includes('authority-grant'));
  assert.ok(schema['x-axiom-non-claims'].includes('global-failure-probability'));
});
