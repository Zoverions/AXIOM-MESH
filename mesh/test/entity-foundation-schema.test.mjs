import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl = new URL('../../docs/architecture/contracts/entity-foundation.v0.schema.json', import.meta.url);

test('entity foundation schema locks blankness and zero-authority semantics', async () => {
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));
  assert.equal(schema.$id, 'axiom-entity-foundation.v0');
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.profile.const, 'blank-egg');
  for (const key of ['personal_grounding_present','worldview_layers_present','disposition_layers_present','provider_binding_present']) {
    assert.equal(schema.properties[key].const, false);
  }
  assert.equal(schema.properties.authority_effect.const, 'none');
  assert.equal(schema.properties.network_effect.const, 'none');
  assert.equal(schema.properties.runtime_activation.const, false);
  assert.equal(schema.properties.core_contract_refs.minItems, 1);
  assert.equal(schema.properties.core_contract_refs.maxItems, 32);
  assert.equal(schema.properties.core_contract_refs.uniqueItems, true);
});
