import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl = new URL('../config/persistence-attestation-v0.schema.json', import.meta.url);

test('Persistence Attestation v0 schema preserves strict inert evidence semantics', async () => {
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));

  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.properties.schema.const, 'axiom-persistence-attestation.v0');
  assert.equal(schema.properties.version.const, 0);
  assert.equal(schema.properties.status.const, 'inert-evidence');
  assert.equal(schema.properties.contains_secret_material.const, false);
  assert.equal(schema.properties.authority_effect.const, 'none');
  assert.equal(schema.properties.network_effect.const, 'none');
  assert.equal(schema.properties.runtime_activation.const, false);
  assert.equal(schema.additionalProperties, false);

  assert.equal(schema.$defs.declaredPersistence.additionalProperties, false);
  assert.equal(schema.$defs.observation.additionalProperties, false);
  assert.equal(schema.$defs.evidence.additionalProperties, false);

  assert.deepEqual(schema.$defs.declaredPersistence.properties.mode.enum, [
    'none',
    'local',
    'provider-bound',
    'mirrored'
  ]);
  assert.deepEqual(schema.$defs.declaredPersistence.properties.exportability.enum, [
    'none',
    'partial',
    'full',
    'unknown'
  ]);
  assert.deepEqual(schema.$defs.observation.properties.availability.enum, [
    'available',
    'unavailable',
    'unknown'
  ]);
  assert.deepEqual(schema.$defs.observation.properties.observed_exportability.enum, [
    'none',
    'partial',
    'full',
    'unknown'
  ]);
  assert.deepEqual(schema.$defs.evidence.properties.evidence_kind.enum, [
    'local-observation',
    'provider-statement',
    'signed-provider-statement',
    'export-test'
  ]);

  assert.equal(
    schema['x-axiom-semantic-validator'],
    'mesh/src/lib/persistence-attestation.mjs'
  );
  assert.deepEqual(schema['x-axiom-semantic-rules'], [
    'topology_id and topology_digest must bind to one exact Cognitive Topology',
    'node_id and model_id must identify one exact Cognitive Topology node',
    'declared_persistence must exactly match the bound Cognitive Topology node persistence declaration',
    'available observations may carry snapshot_ref and snapshot_digest only as a both-null or both-present pair',
    'unavailable and unknown observations cannot carry snapshot_ref or snapshot_digest',
    'recorded_at cannot precede observed_at'
  ]);
  assert.deepEqual(schema['x-axiom-non-claims'], [
    'provider-reachability',
    'snapshot-availability',
    'snapshot-integrity-beyond-recorded-digest',
    'provider-statement-truth',
    'external-signature-verification',
    'persistence-synchronization',
    'export-performance',
    'authority-grant',
    'network-effect',
    'runtime-activation',
    'subjective-identity-proof'
  ]);
});
