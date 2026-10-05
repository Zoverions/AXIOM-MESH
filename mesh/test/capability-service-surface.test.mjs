import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { validateCapabilityServiceSurfaces } from '../src/check-registry.mjs';

const packageUrl = new URL('../package.json', import.meta.url);
const registryUrl = new URL('../config/capabilities.json', import.meta.url);

async function fixtures() {
  return {
    manifest: JSON.parse(await readFile(packageUrl, 'utf8')),
    registry: JSON.parse(await readFile(registryUrl, 'utf8'))
  };
}

test('operator-runnable service scripts are represented by registered capability surfaces', async () => {
  const { manifest, registry } = await fixtures();
  const result = validateCapabilityServiceSurfaces(registry, manifest);

  assert.equal(result.valid, true);
  assert.equal(result.service_scripts.includes('public-witness:start'), true);
  assert.equal(result.surface_map['public-witness:start'], 'operations.public-witness');
});

test('inverse capability surface validation rejects a newly introduced unmapped service', async () => {
  const { manifest, registry } = await fixtures();
  const changed = structuredClone(manifest);
  changed.scripts['unregistered:start'] = 'node src/unregistered-service.mjs';

  assert.throws(
    () => validateCapabilityServiceSurfaces(registry, changed),
    /unmapped runnable service scripts: unregistered:start/i
  );
});

test('development entrypoints require an explicit allowlist rather than a capability claim', async () => {
  const { manifest, registry } = await fixtures();
  const result = validateCapabilityServiceSurfaces(registry, manifest);

  assert.equal(result.allowlisted_scripts.includes('dev'), true);
  assert.equal(Object.hasOwn(result.surface_map, 'dev'), false);
});
