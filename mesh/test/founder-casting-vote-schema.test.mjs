import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl = new URL('../config/founder-casting-vote-v0.schema.json', import.meta.url);

test('Founder Casting Vote v0 schema preserves inert non-authority boundaries', async () => {
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));

  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.properties.schema.const, 'axiom-founder-casting-vote-assessment.v0');
  assert.equal(schema.properties.status.const, 'inert-contract-laboratory');
  assert.equal(schema.properties.authority_effect.const, 'none');
  assert.equal(schema.properties.execution_authority.const, false);
  assert.equal(schema.properties.runtime_activation.const, false);

  const rule = schema.properties.decision_rule.properties;
  assert.equal(rule.quorum_required.maximum, 20);
  assert.equal(rule.biological_yes_minimum.maximum, 10);
  assert.equal(rule.digital_yes_minimum.maximum, 10);

  assert.equal(
    schema['x-axiom-semantic-validator'],
    'mesh/src/lib/founder-casting-vote.mjs'
  );
  assert.deepEqual(schema['x-axiom-non-claims'], [
    'live-founder-casting-vote',
    'council-execution-authority',
    'supermajority-override',
    'substrate-minimum-override',
    'runtime-authority',
    'automatic-execution'
  ]);
});
