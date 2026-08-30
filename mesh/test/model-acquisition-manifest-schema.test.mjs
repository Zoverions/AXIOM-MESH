import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl = new URL('../config/model-acquisition-manifest-v0.schema.json', import.meta.url);

test('Model Acquisition Manifest v0 schema preserves strict inert evidence semantics', async () => {
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));

  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.properties.schema.const, 'axiom-model-acquisition-manifest.v0');
  assert.equal(schema.properties.version.const, 0);
  assert.equal(schema.properties.status.const, 'inert-evidence');
  assert.equal(schema.properties.contains_secret_material.const, false);
  assert.equal(schema.properties.authority_effect.const, 'none');
  assert.equal(schema.properties.network_effect.const, 'none');
  assert.equal(schema.properties.runtime_activation.const, false);
  assert.equal(schema.additionalProperties, false);

  assert.equal(schema.$defs.artifact.additionalProperties, false);
  assert.equal(schema.$defs.source.additionalProperties, false);
  assert.equal(schema.$defs.custody.additionalProperties, false);

  assert.deepEqual(schema.$defs.source.properties.source_kind.enum, [
    'upstream-release',
    'owner-build',
    'authorized-transfer',
    'recovery-copy'
  ]);
  assert.deepEqual(schema.$defs.custody.properties.mode.enum, [
    'owner-local',
    'owner-remote',
    'shared'
  ]);

  assert.equal(
    schema['x-axiom-semantic-validator'],
    'mesh/src/lib/model-acquisition-manifest.mjs'
  );
  assert.deepEqual(schema['x-axiom-semantic-rules'], [
    'topology_id and topology_digest must bind to one exact Cognitive Topology',
    'node_id and model_id must identify one exact Cognitive Topology node',
    'the bound node must declare weight state open-acquired or local-proprietary',
    'artifact_digest must exactly match the bound topology weight artifact digest',
    'licence_ref must match the bound topology licence reference when one is declared',
    'provider-controlled topology custody cannot be represented as acquired owner custody',
    'custody.mode must exactly match the bound topology owner/shared custody declaration',
    'recorded_at cannot precede acquired_at'
  ]);
  assert.deepEqual(schema['x-axiom-non-claims'], [
    'artifact-availability',
    'source-authenticity',
    'licence-legal-validity',
    'behavioral-equivalence',
    'authority-grant',
    'network-effect',
    'runtime-activation',
    'model-invocation',
    'weight-acquisition-effect',
    'subjective-identity-proof'
  ]);
});
