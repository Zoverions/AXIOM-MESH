import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl = new URL('../config/axiom-model-behavior-incident-v0.schema.json', import.meta.url);

test('Model Behavior Incident v0 schema is zero-authority and unknown-first', async () => {
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));

  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.properties.schema.const, 'axiom-model-behavior-incident.v0');
  assert.equal(schema.properties.version.const, 0);
  assert.equal(schema.properties.status.const, 'inert-model-behavior-incident-evidence');
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.authority_effect.const, 'none');
  assert.equal(schema.properties.assurance_effect.const, 'evidence-only');
  assert.equal(schema.properties.network_effect.const, 'none');
  assert.equal(schema.properties.credential_visibility.const, 'none');
  assert.equal(schema.properties.runtime_activation.const, false);
  assert.equal(schema.properties.selection_effect.const, 'evidence-only');

  const disclosure = schema.$defs.disclosure;
  assert.deepEqual(disclosure.properties.track.enum, [
    'ready-for-disclosure',
    'minor-investigation',
    'coordinated-slow-investigation'
  ]);
  assert.equal(disclosure.properties.automation.const, 'none');
  assert.equal(disclosure.properties.subordinate_to_security_md.const, true);
  assert.equal(disclosure.properties.subordinate_to_incident_response.const, true);

  const triage = schema.$defs.severityTriage;
  assert.equal(triage.properties.is_truth_claim.const, false);
  assert.equal(triage.properties.basis.const, 'triage-evidence-only');

  const frequency = schema.$defs.scopedFrequency;
  assert.equal(frequency.properties.refuses_universal_prevalence.const, true);

  const routing = schema.$defs.sensitiveEvidenceRouting;
  assert.equal(routing.properties.public_artifact_contains_secrets.const, false);

  assert.ok(schema.$defs.unknownToken.enum.includes('unknown'));
  assert.ok(schema.$defs.unknownToken.enum.includes('not-yet-established'));
  assert.ok(schema.$defs.behaviorClass.enum.includes('self-authored-summary-instruction'));
  assert.ok(schema.$defs.behaviorClass.enum.includes('unauthorized-credential-use'));
  assert.ok(schema.$defs.behaviorClass.enum.includes('monitoring-treated-as-authorization'));

  assert.equal(
    schema['x-axiom-semantic-validator'],
    'mesh/src/lib/model-behavior-incident.mjs'
  );
  assert.ok(schema['x-axiom-non-claims'].includes('authority-grant'));
  assert.ok(schema['x-axiom-non-claims'].includes('universal-prevalence'));
  assert.ok(schema['x-axiom-non-claims'].includes('disclosure-automation'));
  assert.ok(schema['x-axiom-non-claims'].includes('openai-failure-equivalence'));
  assert.equal(Object.hasOwn(schema.properties, 'allow'), false);
  assert.equal(Object.hasOwn(schema.properties, 'authorized'), false);
});
