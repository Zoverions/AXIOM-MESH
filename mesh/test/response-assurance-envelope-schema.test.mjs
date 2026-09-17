import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl = new URL('../config/response-assurance-envelope-v0.schema.json', import.meta.url);

test('Response Assurance Envelope v0 schema is strict evidence-only and non-authorizing', async () => {
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));

  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.properties.schema.const, 'axiom-response-assurance-envelope.v0');
  assert.equal(schema.properties.version.const, 0);
  assert.equal(schema.properties.status.const, 'inert-response-assurance-evidence');
  assert.equal(schema.additionalProperties, false);

  assert.deepEqual(schema.$defs.resolutionStatus.enum, [
    'supported',
    'supported-with-caveats',
    'conflicting-evidence',
    'insufficient-evidence',
    'stale-profile',
    'out-of-distribution',
    'invalid-evidence'
  ]);
  assert.equal(schema.$defs.deterministicCheck.properties.result.enum.includes('PASS'), true);
  assert.equal(schema.$defs.deterministicCheck.properties.result.enum.includes('FAIL'), true);
  assert.equal(schema.$defs.verifierEvidence.additionalProperties, false);
  assert.equal(
    schema.$defs.semanticObservation.properties.observation_schema.const,
    'axiom-bounded-decision-observation.v0'
  );
  assert.equal(
    schema.$defs.semanticObservation.properties.calibration_report_schema.const,
    'axiom-bounded-decision-calibration-report.v0'
  );
  assert.equal(Object.hasOwn(schema.$defs.semanticObservation.properties, 'value_kind'), false);
  assert.equal(Object.hasOwn(schema.$defs.semanticObservation.properties, 'value'), false);
  assert.deepEqual(
    schema.$defs.semanticObservation.properties.calibration_state.enum,
    ['experimental', 'reviewed', 'expired', 'rejected']
  );

  assert.equal(schema.properties.authority_effect.const, 'none');
  assert.equal(schema.properties.network_effect.const, 'none');
  assert.equal(schema.properties.runtime_activation.const, false);
  assert.equal(schema.properties.selection_effect.const, 'evidence-only');
  assert.equal(Object.hasOwn(schema.properties, 'authorized'), false);
  assert.equal(Object.hasOwn(schema.properties, 'safe_to_execute'), false);

  assert.equal(
    schema['x-axiom-semantic-validator'],
    'mesh/src/lib/response-assurance-envelope.mjs'
  );
  assert.ok(schema['x-axiom-semantic-rules'].some(rule => /deterministic/i.test(rule) && /cannot/i.test(rule)));
  assert.ok(schema['x-axiom-semantic-rules'].some(rule => /independ/i.test(rule) && /correlat/i.test(rule)));
  assert.ok(schema['x-axiom-semantic-rules'].some(rule => /bounded decision/i.test(rule) && /digest/i.test(rule)));
  assert.ok(schema['x-axiom-non-claims'].includes('authorization-decision'));
  assert.ok(schema['x-axiom-non-claims'].includes('safe-to-execute'));
});
