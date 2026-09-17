import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaPath = new URL('../config/response-assurance-envelope-v0.schema.json', import.meta.url);
const modulePath = new URL('../src/lib/response-assurance-envelope.mjs', import.meta.url);

test('response assurance binds bounded-decision evidence instead of defining a parallel semantic probability contract', async () => {
  const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
  const source = await readFile(modulePath, 'utf8');
  const semantic = schema.$defs.semanticObservation;

  assert.ok(semantic.required.includes('observation_schema'));
  assert.ok(semantic.required.includes('calibration_report_schema'));
  assert.equal(semantic.required.includes('dimension_id'), false);
  assert.equal(semantic.required.includes('value_kind'), false);
  assert.equal(semantic.required.includes('value'), false);

  assert.equal(
    semantic.properties.observation_schema.const,
    'axiom-bounded-decision-observation.v0'
  );
  assert.equal(
    semantic.properties.calibration_report_schema.const,
    'axiom-bounded-decision-calibration-report.v0'
  );

  assert.match(source, /BOUNDED_DECISION_OBSERVATION_SCHEMA/);
  assert.match(source, /BOUNDED_DECISION_CALIBRATION_REPORT_SCHEMA/);
  assert.doesNotMatch(source, /const VALUE_KINDS/);
});
