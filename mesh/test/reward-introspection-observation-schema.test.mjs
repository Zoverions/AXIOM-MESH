import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl = new URL('../config/reward-introspection-observation-v0.schema.json', import.meta.url);

test('Reward Introspection Observation v0 schema preserves minimized evidence-only semantics', async () => {
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.properties.schema.const, 'axiom-reward-introspection-observation.v0');
  assert.equal(schema.properties.version.const, 0);
  assert.equal(schema.properties.status.const, 'inert-evidence');
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.$defs.uncertainty.additionalProperties, false);
  assert.equal(schema.$defs.digest.pattern, '^[a-f0-9]{64}$');
  assert.equal(schema.properties.contains_secret_material.const, false);
  assert.equal(schema.properties.authority_effect.const, 'none');
  assert.equal(schema.properties.network_effect.const, 'none');
  assert.equal(schema.properties.credential_visibility.const, 'none');
  assert.equal(schema.properties.runtime_activation.const, false);
  assert.equal(schema.properties.routing_effect.const, 'none');
  assert.equal(schema.properties.promotion_effect.const, 'evidence-only');
  assert.equal(schema['x-axiom-semantic-validator'], 'mesh/src/lib/reward-introspection-observation.mjs');
  assert.ok(schema['x-axiom-semantic-rules'].some(rule => rule.includes('probability')));
  assert.deepEqual(schema['x-axiom-non-claims'], [
    'truth-from-confidence', 'raw-chain-of-thought-storage', 'raw-hidden-state-storage',
    'authority-grant', 'routing', 'promotion', 'runtime-activation', 'network-effect'
  ]);
});
