import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function loadSchema() {
  const schemaUrl = new URL('../config/canonical-shared-artifact-v0.schema.json', import.meta.url);
  return JSON.parse(await readFile(schemaUrl, 'utf8'));
}

test('canonical shared artifact schema is a strict Draft 2020-12 mirror', async () => {
  const schema = await loadSchema();
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.properties.schema.const, 'axiom-canonical-shared-artifact.v0');
  assert.equal(schema.properties.version.const, 0);
  assert.equal(schema.properties.status.const, 'inert-shared-artifact-contract');
  assert.equal(schema.properties.authority_effect.const, 'none');
  assert.equal(schema.properties.network_effect.const, 'none');
  assert.equal(schema.properties.runtime_activation.const, false);
  assert.equal(schema.properties.revisions.minItems, 1);
  assert.equal(schema.properties.revisions.maxItems, 256);
  assert.equal(schema.additionalProperties, false);
});

test('canonical shared artifact schema closes every nested object boundary', async () => {
  const schema = await loadSchema();
  for (const definition of ['authorityDomain', 'sharing', 'revision', 'authorization', 'workGraph']) {
    assert.equal(schema.$defs[definition].additionalProperties, false, `${definition} must reject unknown fields`);
  }
});

test('canonical shared artifact schema mirrors bounded causal and projection arrays', async () => {
  const schema = await loadSchema();
  const revision = schema.$defs.revision.properties;
  assert.equal(revision.parents.maxItems, 32);
  assert.equal(revision.resolves.maxItems, 32);
  assert.equal(schema.$defs.sharing.properties.projection_refs.maxItems, 64);
  assert.equal(schema.properties.current_heads.minItems, 1);
  assert.equal(schema.properties.current_heads.maxItems, 32);
});

test('canonical shared artifact schema requires semantic validation for full invariants', async () => {
  const schema = await loadSchema();
  assert.equal(schema.$defs.timestamp.format, 'date-time');
  assert.equal(schema['x-axiom-semantic-validator'], 'mesh/src/lib/canonical-shared-artifact.mjs');
  assert.equal(schema['x-axiom-validation-requirement'], 'semantic-validator-required');
  assert.deepEqual(schema['x-axiom-semantic-invariants'], [
    'timestamp calendar validity and canonical ISO round-trip are enforced by the semantic validator',
    'declared current_heads exactly match derived causal heads',
    'conflicts remain explicit until a resolution names every current head',
    'state and current_content_digest are derived from current causal heads',
    'authorization and verified-work bindings are evidence only and create no authority effect'
  ]);
});

test('canonical shared artifact schema keeps authority network and runtime inert', async () => {
  const schema = await loadSchema();
  assert.deepEqual(schema.properties.authority_effect, { const: 'none' });
  assert.deepEqual(schema.properties.network_effect, { const: 'none' });
  assert.deepEqual(schema.properties.runtime_activation, { const: false });
});
