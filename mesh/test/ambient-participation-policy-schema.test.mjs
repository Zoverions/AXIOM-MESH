import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const cases = [
  ['participation-observation-v0.schema.json', 'axiom-participation-observation.v0', ['authority_effect','assurance_effect','execution_effect','runtime_activation']],
  ['participation-policy-v0.schema.json', 'axiom-participation-policy.v0', ['grants_authority','data_scope_effect','execution_effect','runtime_activation']],
  ['active-task-steering-v0.schema.json', 'axiom-active-task-steering.v0', ['grants_authority','delegation_effect','execution_effect','runtime_activation']],
  ['silent-investigation-result-v0.schema.json', 'axiom-silent-investigation-result.v0', ['emitted_message','authority_effect','execution_effect','runtime_activation']]
];

for (const [name, schemaConst, boundaryFields] of cases) {
  test(name + ' is closed and pins inert boundaries', async () => {
    const schema = JSON.parse(await readFile(new URL('../config/' + name, import.meta.url), 'utf8'));
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.equal(schema.additionalProperties, false);
    assert.equal(schema.properties.schema.const, schemaConst);
    assert.equal(schema.properties.version.const, 0);
    for (const field of boundaryFields) {
      assert.ok(schema.required.includes(field), field + ' is required');
      assert.ok(Object.hasOwn(schema.properties[field], 'const'), field + ' is pinned');
    }
  });
}

test('participation nested policy and observation objects are closed', async () => {
  const observation = JSON.parse(await readFile(new URL('../config/participation-observation-v0.schema.json', import.meta.url), 'utf8'));
  const policy = JSON.parse(await readFile(new URL('../config/participation-policy-v0.schema.json', import.meta.url), 'utf8'));
  assert.equal(observation.properties.dimensions.additionalProperties, false);
  assert.equal(policy.properties.thresholds.additionalProperties, false);
  assert.equal(policy.properties.cooldown.additionalProperties, false);
  assert.deepEqual(policy.properties.context_scope_mode.enum, ['all-eligible','allowlist']);
  assert.equal(policy.properties.allowed_context_ids.maxItems, 256);
  assert.equal(policy.allOf.length, 2);
  assert.equal(policy.properties.threshold_basis.const, 'illustrative-unvalidated');
});
