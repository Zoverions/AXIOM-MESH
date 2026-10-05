import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl = new URL('../config/agent-composition-v0.schema.json', import.meta.url);

test('Agent Composition v0 schema preserves the inert non-authority boundary', async () => {
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.properties.schema.const, 'axiom-agent-composition.v0');
  assert.equal(schema.properties.version.const, 0);
  assert.equal(schema.properties.status.const, 'inert-contract-laboratory');
  assert.deepEqual(schema.properties.integration_mode.enum, ['wrapped', 'integrated', 'native']);
  assert.equal(schema.properties.authority_effect.const, 'none');
  assert.equal(schema.properties.network_effect.const, 'none');
  assert.equal(schema.properties.runtime_activation.const, false);
  assert.equal(schema.properties.cognitive_workers.properties.authority_effect.const, 'none');
  assert.equal(schema.properties.cognitive_workers.properties.delegation_enabled.const, false);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema['x-axiom-semantic-validator'], 'mesh/src/lib/agent-composition.mjs');
  assert.deepEqual(schema['x-axiom-non-claims'], [
    'runtime-activation',
    'authority-grant',
    'machine-delegation',
    'credential-storage',
    'credential-brokering',
    'model-continuity-proof',
    'autonomous-self-modification'
  ]);
});
