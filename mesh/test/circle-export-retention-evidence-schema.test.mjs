import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Circle Export Retention Evidence v0 is closed, retention-only, and non-authorizing',async()=>{
  const schema=JSON.parse(await readFile(
    new URL('../config/circle-export-retention-evidence-v0.schema.json',import.meta.url),
    'utf8'
  ));
  assert.equal(schema.$schema,'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.additionalProperties,false);
  assert.equal(schema.properties.schema.const,'axiom-circle-export-retention-evidence.v0');
  assert.equal(schema.properties.history_retention_only.const,true);
  assert.equal(schema.properties.requires_disclosure_authorization.const,true);
  assert.equal(schema.properties.requires_external_snapshot_verification.const,true);
  assert.equal(schema.properties.requires_external_record_evidence_verification.const,true);
  assert.equal(schema.properties.record_observations_digest.pattern,'^[a-f0-9]{64}
  assert.equal(schema.properties.portable_authority.const,false);
  assert.equal(schema.properties.authority_effect.const,'none');
  assert.equal(schema.properties.governance_effect.const,'none');
  assert.equal(schema.properties.export_effect.const,'none');
  assert.equal(schema.properties.network_effect.const,'none');
  assert.equal(schema.properties.runtime_activation.const,false);
  assert.equal(schema['x-axiom-semantic-validator'],'mesh/src/lib/circle-export-retention-evidence.mjs');
});
);
  assert.equal(schema.properties.portable_authority.const,false);
  assert.equal(schema.properties.authority_effect.const,'none');
  assert.equal(schema.properties.governance_effect.const,'none');
  assert.equal(schema.properties.export_effect.const,'none');
  assert.equal(schema.properties.network_effect.const,'none');
  assert.equal(schema.properties.runtime_activation.const,false);
  assert.equal(schema['x-axiom-semantic-validator'],'mesh/src/lib/circle-export-retention-evidence.mjs');
});
