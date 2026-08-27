import { readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MESH_ROOT } from './lib/config.mjs';
import { ValidationError } from './lib/canonical.mjs';

export const EMERGENT_COORDINATION_SCHEMA = 'axiom-emergent-coordination-surfaces.v1';
export const KERNEL_VERSION = '0.12.0-dev.3';
export const ACTIVE_MANIFEST = resolve(MESH_ROOT, 'config/emergent-coordination-surfaces.json');

const REPOSITORY_ROOT = dirname(MESH_ROOT);
const TOP_LEVEL_FIELDS = Object.freeze(['kernel_version', 'schema', 'surfaces']);
const SURFACE_FIELDS = Object.freeze([
  'authority_impact',
  'id',
  'kind',
  'negative_test_binding',
  'notes',
  'readers',
  'writers'
]);
const BINDING_FIELDS = Object.freeze(['path', 'test_name']);

function fail(message) {
  throw new ValidationError(`Emergent coordination inventory ${message}`);
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactFields(value, allowed, label) {
  const actual = Object.keys(value).sort();
  const expected = [...allowed].sort();
  if (
    actual.length !== expected.length
    || actual.some((field, index) => field !== expected[index])
  ) {
    fail(`${label} fields drifted`);
  }
}

function assertNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) {
    fail(`${label} must be a non-empty canonical string`);
  }
}

function assertStringArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    fail(`${label} must be a non-empty array`);
  }
  const seen = new Set();
  for (const item of value) {
    assertNonEmptyString(item, label);
    if (seen.has(item)) fail(`${label} contains a duplicate value`);
    seen.add(item);
  }
}

async function verifyActiveBinding(binding) {
  const testPath = resolve(REPOSITORY_ROOT, binding.path);
  const relative = testPath.slice(REPOSITORY_ROOT.length);
  if (
    !testPath.startsWith(REPOSITORY_ROOT)
    || !(relative.startsWith('/') || relative.startsWith('\\'))
  ) {
    fail('negative test binding escapes the repository');
  }
  try {
    const metadata = await stat(testPath);
    if (!metadata.isFile()) fail('negative test binding does not target a file');
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    fail(`negative test binding file is missing: ${binding.path}`);
  }
  const source = await readFile(testPath, 'utf8');
  if (!source.includes(binding.test_name)) {
    fail(`negative test binding name is missing from ${binding.path}: ${binding.test_name}`);
  }
}

export async function checkEmergentCoordination({ manifestPath = ACTIVE_MANIFEST } = {}) {
  const resolvedManifestPath = resolve(manifestPath);
  let manifest;
  try {
    manifest = JSON.parse(await readFile(resolvedManifestPath, 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) fail('is not valid JSON');
    fail(`is unavailable: ${resolvedManifestPath}`);
  }

  if (!isPlainObject(manifest)) fail('must be an object');
  assertExactFields(manifest, TOP_LEVEL_FIELDS, 'top-level');
  if (manifest.schema !== EMERGENT_COORDINATION_SCHEMA) fail('schema is unsupported');
  if (manifest.kernel_version !== KERNEL_VERSION) fail('kernel version is unsupported');
  if (!Array.isArray(manifest.surfaces) || manifest.surfaces.length === 0) {
    fail('surfaces must be a non-empty array');
  }

  const ids = new Set();
  for (const [index, surface] of manifest.surfaces.entries()) {
    if (!isPlainObject(surface)) fail(`surface ${index} must be an object`);
    assertExactFields(surface, SURFACE_FIELDS, `surface ${index}`);
    assertNonEmptyString(surface.id, `surface ${index} id`);
    assertNonEmptyString(surface.kind, `surface ${index} kind`);
    assertStringArray(surface.writers, `surface ${index} writers`);
    assertStringArray(surface.readers, `surface ${index} readers`);
    assertNonEmptyString(surface.notes, `surface ${index} notes`);
    if (ids.has(surface.id)) fail(`surface id is duplicated: ${surface.id}`);
    ids.add(surface.id);

    if (surface.authority_impact !== 'non-authorizing-input') {
      fail(`surface ${surface.id} authority impact must be non-authorizing-input`);
    }

    if (!isPlainObject(surface.negative_test_binding)) {
      fail(`surface ${surface.id} requires a negative test binding`);
    }
    assertExactFields(
      surface.negative_test_binding,
      BINDING_FIELDS,
      `surface ${surface.id} negative test binding`
    );
    const { path, test_name: testName } = surface.negative_test_binding;
    assertNonEmptyString(path, `surface ${surface.id} negative test binding path`);
    assertNonEmptyString(testName, `surface ${surface.id} negative test binding test_name`);
    if (!path.startsWith('mesh/test/') || !path.endsWith('.test.mjs')) {
      fail(`surface ${surface.id} negative test binding path must target mesh/test/*.test.mjs`);
    }

    if (resolvedManifestPath === ACTIVE_MANIFEST) {
      await verifyActiveBinding(surface.negative_test_binding);
    }
  }

  return Object.freeze({
    valid: true,
    schema: manifest.schema,
    kernel_version: manifest.kernel_version,
    surfaces: manifest.surfaces.length,
    non_authorizing: manifest.surfaces.length
  });
}

async function main() {
  try {
    process.stdout.write(`${JSON.stringify(await checkEmergentCoordination())}\n`);
  } catch (error) {
    process.stderr.write(`${error?.stack ?? error}\n`);
    process.exitCode = 1;
  }
}

const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invoked && import.meta.url === invoked) {
  await main();
}
