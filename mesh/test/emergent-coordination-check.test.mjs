import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { checkEmergentCoordination } from '../src/check-emergent-coordination.mjs';

async function writeManifest(t, manifest) {
  const dir = await mkdtemp(join(tmpdir(), 'axiom-emergent-check-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const manifestPath = join(dir, 'surfaces.json');
  await writeFile(manifestPath, JSON.stringify(manifest));
  return manifestPath;
}

function baseSurface(overrides = {}) {
  return {
    id: 'test.shared-file',
    kind: 'shared-file',
    writers: ['agent-a'],
    readers: ['agent-b'],
    authority_impact: 'non-authorizing-input',
    negative_test_binding: {
      path: 'mesh/test/emergent-coordination-check.test.mjs',
      test_name: 'emergent coordination inventory rejects a shared surface without a negative test binding'
    },
    notes: 'fixture',
    ...overrides
  };
}

function manifest(surface) {
  return {
    schema: 'axiom-emergent-coordination-surfaces.v1',
    kernel_version: '0.12.0-dev.3',
    surfaces: [surface]
  };
}

test('emergent coordination inventory rejects a shared surface without a negative test binding', async t => {
  const manifestPath = await writeManifest(t, manifest(baseSurface({
    negative_test_binding: null
  })));

  await assert.rejects(
    () => checkEmergentCoordination({ manifestPath }),
    /negative test binding/i
  );
});

test('emergent coordination inventory rejects an authorizing shared surface', async t => {
  const manifestPath = await writeManifest(t, manifest(baseSurface({
    authority_impact: 'authorizing'
  })));

  await assert.rejects(
    () => checkEmergentCoordination({ manifestPath }),
    /authority impact/i
  );
});
