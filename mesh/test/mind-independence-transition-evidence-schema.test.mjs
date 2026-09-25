import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl = new URL(
  '../config/mind-independence-transition-evidence-v0.schema.json',
  import.meta.url
);

test('Mind Independence Transition Evidence v0 remains requestability-only and non-mutating', async () => {
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));

  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(
    schema.properties.schema.const,
    'axiom-mind-independence-transition-evidence.v0'
  );
  assert.equal(schema.properties.status.const, 'inert-transition-evidence');
  assert.equal(schema.properties.maximum_review_age_seconds.maximum, 2592000);
  assert.equal(
    schema.properties.maximum_state_observation_age_seconds.maximum,
    604800
  );
  assert.equal(schema.properties.status_effect.const, 'none');
  assert.equal(schema.properties.council_voting_effect.const, 'none');
  assert.equal(schema.properties.genesis_eligibility_effect.const, 'none');
  assert.equal(schema.properties.governance_effect.const, 'none');
  assert.equal(schema.properties.authority_effect.const, 'none');
  assert.equal(schema.properties.network_effect.const, 'none');
  assert.equal(schema.properties.runtime_activation.const, false);
  assert.equal(
    schema['x-axiom-semantic-validator'],
    'mesh/src/lib/mind-independence-transition-evidence.mjs'
  );
});
