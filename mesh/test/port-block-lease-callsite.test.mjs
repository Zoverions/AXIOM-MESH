import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const THIS_FILE = fileURLToPath(import.meta.url);
const TEST_ROOT = dirname(THIS_FILE);
const MESH_ROOT = dirname(TEST_ROOT);
const LEGACY_HELPER_PATTERN = /async function findPortBlock\s*\(/;

async function collectModules(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const modules = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      modules.push(...await collectModules(path));
      continue;
    }
    if (entry.isFile() && path.endsWith('.mjs') && path !== THIS_FILE) {
      modules.push(path);
    }
  }
  return modules;
}

test('real-stack tests and drills use the cross-process port-block lease', async () => {
  const paths = [
    ...await collectModules(TEST_ROOT),
    join(MESH_ROOT, 'src', 'intent-lifecycle-drill.mjs')
  ];

  const offenders = [];
  for (const path of paths) {
    const source = await readFile(path, 'utf8');
    if (LEGACY_HELPER_PATTERN.test(source)) {
      offenders.push(relative(MESH_ROOT, path).replaceAll('\\', '/'));
    }
  }

  assert.deepEqual(
    offenders,
    [],
    'local findPortBlock probes release their sockets before the real stack binds; use reserveProductionPortBlock and hold the lease until teardown'
  );
});
