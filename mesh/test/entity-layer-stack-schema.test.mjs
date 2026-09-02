import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl = new URL('../../docs/architecture/contracts/entity-layer-stack.v0.schema.json', import.meta.url);

test('layer stack schema locks deterministic zero-authority composition', async () => {
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));
  assert.equal(schema.$id, 'axiom-entity-layer-stack.v0');
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.active_layers.maxItems, 64);
  assert.equal(schema.properties.authority_effect.const, 'none');
  assert.equal(schema.properties.network_effect.const, 'none');
  assert.equal(schema.properties.runtime_activation.const, false);
  assert.equal(schema.properties.active_layers.items.additionalProperties, false);
  assert.equal(schema.properties.active_layers.items.properties.precedence.type, 'integer');
});
