import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function schema(name) {
  return JSON.parse(await readFile(new URL(`../../docs/architecture/contracts/${name}`, import.meta.url), 'utf8'));
}

test('resource envelope schema locks finite budget and inheritance semantics', async () => {
  const value = await schema('resource-envelope.v0.schema.json');
  assert.equal(value.properties.schema.const, 'axiom-resource-envelope.v0');
  assert.deepEqual(value.properties.priority_class.enum, ['P0','P1','P2','P3','P4']);
  assert.equal(value.properties.contains_secret_material.const, false);
  assert.equal(value.properties.authority_effect.const, 'none');
  assert.equal(value.properties.network_effect.const, 'none');
  assert.equal(value.properties.runtime_activation.const, false);
  assert.equal(value.$defs.inheritance.allOf.length, 3);
  for (const key of ['cpu_millis','memory_bytes','accelerator_memory_bytes','durable_storage_bytes','scratch_storage_bytes','io_bytes','network_bytes','network_requests','model_calls','input_units','output_units','concurrency','wall_time_ms','monetary_cost_units','energy_millijoules','process_count','thread_count','file_descriptors']) {
    assert.equal(value.$defs.resources.properties[key].type, 'integer', key);
    assert.equal(value.$defs.resources.properties[key].minimum, 0, key);
  }
});

test('resource observation schema is attributable, expiring, typed, and inert', async () => {
  const value = await schema('resource-observation.v0.schema.json');
  assert.equal(value.properties.schema.const, 'axiom-resource-observation.v0');
  assert.ok(value.properties.observer_principal_id);
  assert.ok(value.properties.host_ref);
  assert.deepEqual(value.properties.kind.enum, ['cpu','memory','accelerator','storage','io','network','battery','thermal','energy','cost']);
  assert.deepEqual(value.properties.observation_status.enum, ['measured','verified','failed','stale']);
  assert.ok(value.properties.observed_at);
  assert.ok(value.properties.expires_at);
  assert.equal(value.properties.contains_secret_material.const, false);
  assert.equal(value.properties.authority_effect.const, 'none');
  assert.equal(value.properties.runtime_activation.const, false);
  assert.equal(value.allOf.length, 4);
});
