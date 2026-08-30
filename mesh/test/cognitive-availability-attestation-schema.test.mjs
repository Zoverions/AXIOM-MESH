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

  assert.equal(schema.$defs.observation.additionalProperties, false);
  assert.equal(schema.$defs.observer.additionalProperties, false);
  assert.equal(schema.$defs.evidence.additionalProperties, false);

  assert.deepEqual(schema.$defs.observation.properties.availability.enum, [
    'available', 'unavailable', 'indeterminate'
  ]);
  assert.deepEqual(schema.$defs.observation.properties.method.enum, [
    'local-artifact', 'local-runtime', 'provider-api', 'remote-runtime', 'provider-statement', 'synthetic-probe'
  ]);
  assert.deepEqual(schema.$defs.observation.properties.assurance_class.enum, [
    'declared', 'signed', 'verified-local', 'corroborated'
  ]);
  assert.deepEqual(schema.$defs.observer.properties.observer_kind.enum, [
    'local-agent', 'local-service', 'remote-service', 'provider', 'external-verifier'
  ]);
  assert.deepEqual(schema.$defs.evidence.properties.evidence_kind.enum, [
    'local-observation', 'runtime-probe-result', 'provider-statement', 'signed-provider-statement',
    'external-observation', 'artifact-verification'
  ]);

  assert.equal(
    schema['x-axiom-semantic-validator'],
    'mesh/src/lib/cognitive-availability-attestation.mjs'
  );
  assert.deepEqual(schema['x-axiom-semantic-rules'], [
    'topology_id and topology_digest must bind to one exact Cognitive Topology',
    'node_id and model_id must identify one exact Cognitive Topology node',
    'observation method must be compatible with the bound Cognitive Topology access, custody, and weight posture',
    'available local-artifact observations require the exact owner-addressable artifact digest declared by the topology',
    'non-local-artifact observations cannot invent an observed artifact digest',
    'declared assurance cannot carry verification evidence and stronger assurance requires verification_ref and verification_digest',
    'valid_until and recorded_at cannot precede observed_at'
  ]);
  assert.deepEqual(schema['x-axiom-non-claims'], [
    'provider-reachability',
    'runtime-reachability-beyond-recorded-observation',
    'provider-statement-truth',
    'external-signature-verification',
    'model-invocation',
    'model-substitution',
    'authority-grant',
    'network-effect',
    'runtime-activation',
    'principal-continuity-proof',
    'subjective-identity-proof'
  ]);
});
