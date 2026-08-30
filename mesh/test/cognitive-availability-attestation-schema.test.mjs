import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl = new URL('../config/cognitive-availability-attestation-v0.schema.json', import.meta.url);

test('Cognitive Availability Attestation v0 schema preserves strict inert evidence semantics', async () => {
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));

  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.properties.schema.const, 'axiom-cognitive-availability-attestation.v0');
  assert.equal(schema.properties.version.const, 0);
  assert.equal(schema.properties.status.const, 'inert-evidence');
  assert.equal(schema.properties.contains_secret_material.const, false);
  assert.equal(schema.properties.authority_effect.const, 'none');
  assert.equal(schema.properties.network_effect.const, 'none');
  assert.equal(schema.properties.runtime_activation.const, false);
  assert.equal(schema.additionalProperties, false);

  assert.equal(schema.$defs.declaredTarget.additionalProperties, false);
  assert.equal(schema.$defs.observation.additionalProperties, false);
  assert.equal(schema.$defs.evidence.additionalProperties, false);

  assert.deepEqual(schema.$defs.observation.properties.availability.enum, [
    'available',
    'unavailable',
    'indeterminate'
  ]);
  assert.deepEqual(schema.$defs.observation.properties.observation_mode.enum, [
    'local-artifact',
    'local-runtime',
    'provider-api',
    'remote-runtime',
    'provider-statement',
    'synthetic-probe'
  ]);
  assert.deepEqual(schema.$defs.observation.properties.evidence_class.enum, [
    'direct-local',
    'direct-remote',
    'provider-asserted',
    'synthetic-observed',
    'indirect'
  ]);

  assert.equal(schema.properties.attestation_id.pattern, '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$');
  assert.equal(schema.properties.topology_digest.pattern, '^[a-f0-9]{64}$');
  assert.equal(schema.$defs.observation.properties.observed_artifact_digest.anyOf[0].pattern, '^[a-f0-9]{64}$');

  assert.equal(
    schema['x-axiom-semantic-validator'],
    'mesh/src/lib/cognitive-availability-attestation.mjs'
  );
  assert.deepEqual(schema['x-axiom-semantic-rules'], [
    'topology_id and topology_digest must bind to one exact Cognitive Topology',
    'node_id and model_id must identify one exact Cognitive Topology node',
    'declared_target must exactly match the bound node access_mode, custody, weight state, and artifact digest',
    'owner-addressable available observations require an observed artifact digest; unavailable or indeterminate observations require null',
    'non-owner-addressable observations require observed_artifact_digest null',
    'a different valid owner artifact digest remains structurally valid evidence and resolves with artifact_match false',
    'valid_until cannot precede observed_at and recorded_at cannot precede observed_at',
    'freshness is evaluated by consumers against valid_until rather than mutating or invalidating historical evidence'
  ]);
  assert.deepEqual(schema['x-axiom-non-claims'], [
    'provider-reachability',
    'provider-statement-truth',
    'artifact-availability-beyond-recorded-observation',
    'observer-trust',
    'model-invocation',
    'provider-api-execution',
    'authority-grant',
    'network-effect',
    'runtime-activation',
    'principal-continuity-proof',
    'subjective-identity-proof'
  ]);
});
