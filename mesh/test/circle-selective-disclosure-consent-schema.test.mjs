import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Circle selective disclosure consent evidence is closed and cannot disclose by itself',async()=>{
  const schema=JSON.parse(await readFile(
    new URL('../config/circle-selective-disclosure-consent-v0.schema.json',import.meta.url),
    'utf8'
  ));
  assert.equal(schema.$schema,'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.additionalProperties,false);
  assert.equal(schema.properties.schema.const,'axiom-circle-selective-disclosure-consent-evidence.v0');
  assert.equal(schema.properties.requires_external_snapshot_verification.const,true);
  assert.equal(schema.properties.requires_external_membership_evidence_verification.const,true);
  assert.equal(schema.properties.requires_external_access_decision_verification.const,true);
  assert.equal(schema.properties.requires_external_consent_evidence_verification.const,true);
  assert.equal(schema.properties.creates_disclosure.const,false);
  assert.equal(schema.properties.creates_export_bundle.const,false);
  assert.equal(schema.properties.creates_grant.const,false);
  assert.equal(schema.properties.authority_effect.const,'none');
  assert.equal(schema.properties.governance_effect.const,'none');
  assert.equal(schema.properties.disclosure_effect.const,'none');
  assert.equal(schema.properties.network_effect.const,'none');
  assert.equal(schema.properties.runtime_activation.const,false);
  assert.equal(schema['x-axiom-semantic-validator'],'mesh/src/lib/circle-selective-disclosure-consent.mjs');
});
