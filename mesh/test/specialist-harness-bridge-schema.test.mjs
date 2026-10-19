import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl = new URL('../config/specialist-harness-bridge-v0.schema.json', import.meta.url);

function everyObjectSchemaIsClosed(node, path = '$') {
  if (Array.isArray(node)) return node.forEach((item, index) => everyObjectSchemaIsClosed(item, `${path}[${index}]`));
  if (!node || typeof node !== 'object') return;
  if (node.type === 'object') assert.equal(node.additionalProperties, false, `${path} must be closed`);
  for (const [key, value] of Object.entries(node)) everyObjectSchemaIsClosed(value, `${path}.${key}`);
}

test('Specialist Harness Bridge v0 schema pins every hard zero and is closed everywhere', async () => {
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.properties.schema.const, 'axiom-specialist-harness-bridge.v0');
  assert.equal(schema.properties.authority_effect.const, 'none');
  assert.equal(schema.properties.execution_effect.const, 'none');
  assert.equal(schema.properties.network_effect.const, 'none');
  assert.equal(schema.properties.delegation_effect.const, 'none');
  assert.equal(schema.properties.population_effect.const, 'none');
  assert.equal(schema.properties.governance_identity_effect.const, 'none');
  assert.equal(schema.properties.runtime_activation.const, false);
  everyObjectSchemaIsClosed(schema);
  assert.deepEqual([...schema.required].sort(), Object.keys(schema.properties).sort());
  const text = JSON.stringify(schema.properties);
  assert.doesNotMatch(text, /mind_id|genesis_receipt|delegation_allowed|grants_authority/);
  assert.equal(schema['x-axiom-semantic-validator'], 'mesh/src/lib/specialist-harness-bridge.mjs');
  assert.ok(schema['x-axiom-non-claims'].includes('authority-grant'));
  assert.ok(schema['x-axiom-non-claims'].includes('delegation'));
  assert.ok(schema['x-axiom-non-claims'].includes('output-as-authority'));
});
