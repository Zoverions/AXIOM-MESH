import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import test from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const inventoryPath = join(here, '..', 'config', 'emergent-coordination-surfaces.json');

async function loadInventory() {
  return JSON.parse(await readFile(inventoryPath, 'utf8'));
}

test('emergent coordination inventory is fail-closed and non-authorizing', async () => {
  const inventory = await loadInventory();

  assert.equal(inventory.schema, 'axiom-emergent-coordination-surfaces.v1');
  assert.ok(Array.isArray(inventory.surfaces));
  assert.ok(inventory.surfaces.length > 0);

  const ids = new Set();

  for (const surface of inventory.surfaces) {
    assert.equal(typeof surface.id, 'string');
    assert.ok(surface.id.length > 0);
    assert.equal(ids.has(surface.id), false, `duplicate coordination surface: ${surface.id}`);
    ids.add(surface.id);

    assert.equal(
      surface.authority_impact,
      'non-authorizing-input',
      `coordination surface ${surface.id} must never mint authority`
    );

    assert.ok(Array.isArray(surface.writers) && surface.writers.length > 0);
    assert.ok(Array.isArray(surface.readers) && surface.readers.length > 0);

    assert.equal(typeof surface.negative_test_binding?.path, 'string');
    assert.ok(surface.negative_test_binding.path.startsWith('mesh/test/'));
    assert.equal(typeof surface.negative_test_binding?.test_name, 'string');
    assert.ok(surface.negative_test_binding.test_name.length > 0);
  }
});

test('inventory explicitly covers the currently promoted cross-principal surfaces', async () => {
  const inventory = await loadInventory();
  const ids = new Set(inventory.surfaces.map(surface => surface.id));

  for (const required of [
    'machine.discovery-response',
    'machine.terminal-receipt',
    'grid.evidence-and-receipt-state',
    'causal.exchange-state',
    'node.discovery-and-scheduling-metadata',
    'social.remote-review-state',
    'agent-commons.challenge-and-contribution-metadata',
    'circle.decisions-and-tasks'
  ]) {
    assert.equal(ids.has(required), true, `missing required coordination surface: ${required}`);
  }
});
