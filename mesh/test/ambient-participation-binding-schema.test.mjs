import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function schema(name) {
  return JSON.parse(await readFile(new URL('../config/' + name, import.meta.url), 'utf8'));
}

test('participation decision v0 schema is closed and pins all effects to none', async () => {
  const value = await schema('participation-decision-v0.schema.json');
  assert.equal(value.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(value.additionalProperties, false);
  assert.equal(value.properties.schema.const, 'axiom-participation-decision.v0');
  assert.equal(value.properties.version.const, 0);
  assert.deepEqual(value.properties.action.enum, ['ANSWER','INVESTIGATE','ACKNOWLEDGE','PASS']);
  assert.equal(value.properties.authority_effect.const, 'none');
  assert.equal(value.properties.data_scope_effect.const, 'none');
  assert.equal(value.properties.communication_effect.const, 'none');
  assert.equal(value.properties.execution_effect.const, 'none');
  assert.equal(value.properties.runtime_activation.const, false);
  assert.ok(value.required.includes('decision_digest'));
  assert.equal(value.allOf.length, 2);
});

test('participation cooldown evidence v0 schema is closed and non-authorizing', async () => {
  const value = await schema('participation-cooldown-evidence-v0.schema.json');
  assert.equal(value.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(value.additionalProperties, false);
  assert.equal(value.properties.schema.const, 'axiom-participation-cooldown-evidence.v0');
  assert.equal(value.properties.version.const, 0);
  assert.deepEqual(value.properties.derived_state.enum, ['ready','blocked']);
  assert.equal(value.properties.authority_effect.const, 'none');
  assert.equal(value.properties.communication_effect.const, 'none');
  assert.equal(value.properties.execution_effect.const, 'none');
  assert.equal(value.properties.runtime_activation.const, false);
  assert.ok(value.required.includes('history_digest'));
  assert.ok(value.required.includes('evidence_digest'));
  assert.equal(value.properties.evidence_refs.minItems, 1);
  assert.equal(value.properties.evidence_refs.maxItems, 128);
});
