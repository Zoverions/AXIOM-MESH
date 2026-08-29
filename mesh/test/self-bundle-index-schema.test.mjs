import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl = new URL('../config/self-bundle-index-v0.schema.json', import.meta.url);

async function loadSchema() {
  return JSON.parse(await readFile(schemaUrl, 'utf8'));
}

test('schema fixes the inert Self Bundle v0 identity and authority boundary', async () => {
  const schema = await loadSchema();
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.schema.const, 'axiom-self-bundle-index.v0');
  assert.equal(schema.properties.version.const, 0);
  assert.equal(schema.properties.status.const, 'inert-contract-laboratory');
  assert.equal(schema.properties.contains_secret_material.const, false);
  assert.equal(schema.properties.authority_effect.const, 'none');
  assert.equal(schema.properties.network_effect.const, 'none');
  assert.equal(schema.properties.runtime_activation.const, false);
});

test('schema mirrors exact reference and semantic-state shapes', async () => {
  const schema = await loadSchema();
  assert.equal(schema.properties.semantic_state.type, 'array');
  assert.equal(schema.properties.semantic_state.maxItems, 256);
  assert.equal(schema.$defs.reference.additionalProperties, false);
  assert.deepEqual(schema.$defs.reference.required, ['ref', 'digest']);
  assert.equal(schema.$defs.semantic_state.additionalProperties, false);
  assert.deepEqual(
    schema.$defs.semantic_state.required,
    ['claim_id', 'ref', 'digest', 'required_for_continuity']
  );
  assert.equal(schema.$defs.semantic_state.properties.required_for_continuity.type, 'boolean');
});

test('predecessor is nullable while composition and Pack references are required', async () => {
  const schema = await loadSchema();
  assert.ok(schema.required.includes('predecessor_bundle'));
  assert.ok(schema.required.includes('agent_composition'));
  assert.ok(schema.required.includes('personal_agent_pack'));
  assert.deepEqual(schema.properties.predecessor_bundle.oneOf, [
    { $ref: '#/$defs/reference' },
    { type: 'null' }
  ]);
  assert.equal(schema.properties.agent_composition.$ref, '#/$defs/reference');
  assert.equal(schema.properties.personal_agent_pack.$ref, '#/$defs/reference');
});

test('schema advertises semantic validator and explicit non-claims', async () => {
  const schema = await loadSchema();
  assert.equal(schema['x-axiom-semantic-validator'], 'mesh/src/lib/self-bundle-index.mjs');
  for (const nonClaim of [
    'subjective-identity-proof',
    'authority-grant',
    'secret-storage',
    'runtime-activation'
  ]) {
    assert.ok(schema['x-axiom-non-claims'].includes(nonClaim));
  }
});
