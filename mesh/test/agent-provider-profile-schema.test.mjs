import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl = new URL('../config/agent-provider-profile-v0.schema.json', import.meta.url);

test('Agent Provider Profile v0 schema preserves the inert non-authority boundary', async () => {
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));

  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.properties.schema.const, 'axiom-agent-provider-profile.v0');
  assert.equal(schema.properties.version.const, 0);
  assert.equal(schema.properties.status.const, 'inert-provider-laboratory');
  assert.deepEqual(schema.properties.provider_class.enum, [
    'memory',
    'knowledge-projection',
    'agent-interop',
    'attestation',
    'provenance',
    'settlement'
  ]);
  assert.deepEqual(schema.properties.implementation.properties.source_kind.enum, [
    'local',
    'external',
    'fork',
    'adapter'
  ]);
  assert.deepEqual(schema.properties.implementation.properties.artifact_digest.anyOf, [
    { type: 'string', pattern: '^[a-f0-9]{64}$' },
    { type: 'null' }
  ]);
  assert.deepEqual(schema.properties.assurance_ceiling.enum, [
    'none',
    'self-asserted',
    'behavioral',
    'cryptographic',
    'hardware-rooted'
  ]);
  assert.equal(schema.properties.authority_effect.const, 'none');
  assert.equal(schema.properties.trust_effect.const, 'evidence-only');
  assert.equal(schema.properties.credential_visibility.const, 'none');
  assert.equal(schema.properties.network_effect.const, 'none');
  assert.equal(schema.properties.runtime_activation.const, false);
  assert.equal(schema.properties.settlement_activation.const, false);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.implementation.additionalProperties, false);
  assert.equal(schema['x-axiom-semantic-validator'], 'mesh/src/lib/agent-provider-profile.mjs');
  assert.deepEqual(schema['x-axiom-non-claims'], [
    'provider-execution',
    'authority-grant',
    'trust-promotion',
    'credential-storage',
    'network-connectivity',
    'hardware-root-proof',
    'settlement-activation',
    'artifact-verification-without-digest'
  ]);
});
