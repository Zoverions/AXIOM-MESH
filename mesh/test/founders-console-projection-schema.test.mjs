import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl = new URL('../config/founders-console-projection-v0.schema.json', import.meta.url);

test('Founders Console projection v0 exposes no action or credential surface', async () => {
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));

  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.properties.schema.const, 'axiom-founders-console-projection.v0');
  assert.equal(schema.properties.status.const, 'read-only-inert-projection');
  assert.equal(schema.properties.action_surface.const, 'none');
  assert.equal(schema.properties.credential_material.const, 'none');
  assert.equal(schema.properties.authority_effect.const, 'none');
  assert.equal(schema.properties.network_effect.const, 'none');
  assert.equal(schema.properties.runtime_activation.const, false);

  assert.equal(
    schema['x-axiom-semantic-validator'],
    'mesh/src/lib/founders-console-projection.mjs'
  );
  assert.deepEqual(schema['x-axiom-non-claims'], [
    'gateway-route',
    'live-founder-console',
    'governance-mutation',
    'credential-disclosure',
    'runtime-authority',
    'automatic-execution'
  ]);
});
