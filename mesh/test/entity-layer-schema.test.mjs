import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl = new URL('../../docs/architecture/contracts/entity-layer.v0.schema.json', import.meta.url);

test('entity layer schema locks modular zero-authority metadata', async () => {
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));
  assert.equal(schema.$id, 'axiom-entity-layer.v0');
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.properties.layer_class.enum, ['constitution','worldview','judgment','disposition','culture','domain','skill','relationship','personal-grounding','presentation','self-authored']);
  assert.deepEqual(schema.properties.endorsement_mode.enum, ['none','human','entity','joint','governance']);
  assert.deepEqual(schema.properties.privacy_class.enum, ['public','shared','private','sealed']);
  assert.deepEqual(schema.properties.mutability.enum, ['immutable','replaceable','evolvable','ephemeral']);
  assert.equal(schema.properties.contains_raw_private_content.const, false);
  assert.equal(schema.properties.authority_effect.const, 'none');
  assert.equal(schema.properties.network_effect.const, 'none');
  assert.equal(schema.properties.runtime_activation.const, false);
});
