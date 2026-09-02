import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validateCapabilitySurfaceRegistry } from '../src/lib/capability-surfaces.mjs';

const registryUrl = new URL('../config/capability-surfaces.v0.json', import.meta.url);

test('sterile Blank Egg surface map is valid and remains specified-only', async () => {
  const document = JSON.parse(await readFile(registryUrl, 'utf8'));
  const result = validateCapabilitySurfaceRegistry(document);
  assert.equal(result.valid, true);
  assert.equal(result.entry_count, 8);
  assert.equal(document.entries.every(entry => entry.lifecycle === 'specified'), true);
  assert.equal(document.entries.every(entry => entry.executable_capability_ref === null), true);
  assert.equal(document.entries.every(entry => entry.authority_boundary === 'discovery-only-no-authority'), true);
});
