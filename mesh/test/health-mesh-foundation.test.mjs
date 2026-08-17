import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CANONICAL_DOCUMENTS } from '../src/check-docs.mjs';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(TEST_DIR, '../..');

const HEALTH_DOCUMENTS = Object.freeze([
  'docs/MASTER-TODO-HEALTH-MESH.md',
  'docs/ROADMAP-EXTENSION-HEALTH-MESH.md',
  'docs/architecture/HEALTH-MESH-FOUNDATION.md',
  'docs/architecture/contracts/health-mesh-clinical-envelope.v0.1.schema.json',
  'docs/security/HEALTH-MESH-THREAT-MODEL.md'
]);

async function readJson(relativePath) {
  return JSON.parse(await readFile(resolve(REPOSITORY_ROOT, relativePath), 'utf8'));
}

async function readText(relativePath) {
  return readFile(resolve(REPOSITORY_ROOT, relativePath), 'utf8');
}

test('Health Mesh foundation is part of the canonical documentation boundary', () => {
  for (const document of HEALTH_DOCUMENTS) {
    assert.equal(
      CANONICAL_DOCUMENTS.includes(document),
      true,
      `${document} must remain inside the canonical documentation boundary`
    );
  }
});

test('Health Mesh clinical envelope preserves autonomy and fail-closed invariants', async () => {
  const schema = await readJson(
    'docs/architecture/contracts/health-mesh-clinical-envelope.v0.1.schema.json'
  );

  assert.equal(schema.properties.schema.const, 'axiom-health-clinical-envelope.v0.1');
  assert.deepEqual(schema.properties.autonomy_level.enum, ['H0', 'H1', 'H2', 'H3', 'H4', 'H5']);
  assert.equal(schema.properties.assurance.properties.fail_closed.const, true);
  assert.equal(schema.properties.revocation.properties.revocable.const, true);
  assert.equal(schema.additionalProperties, false);

  for (const required of [
    'principal',
    'subject_scope',
    'action',
    'purpose',
    'autonomy_level',
    'jurisdiction',
    'data_access',
    'assurance',
    'evidence_requirements',
    'revocation'
  ]) {
    assert.equal(schema.required.includes(required), true, `${required} must remain mandatory`);
  }
});

test('Health Mesh foundation explicitly preserves supervision and emergency boundaries', async () => {
  const foundation = await readText('docs/architecture/HEALTH-MESH-FOUNDATION.md');
  const threatModel = await readText('docs/security/HEALTH-MESH-THREAT-MODEL.md');
  const roadmap = await readText('docs/ROADMAP-EXTENSION-HEALTH-MESH.md');

  assert.match(
    foundation,
    /Loss of remote connectivity must not silently convert supervised execution into autonomous execution\./
  );
  assert.match(foundation, /H5 emergency capabilities/);
  assert.match(threatModel, /ordinary workflow mints an H5 emergency grant/);
  assert.match(roadmap, /H4 autonomous invasive execution is a later, separately promoted programme/);
});

test('Health Mesh documentation does not promote a runnable healthcare capability', async () => {
  const registry = await readJson('mesh/config/capabilities.json');
  const serialized = JSON.stringify(registry).toLowerCase();

  assert.equal(serialized.includes('health-mesh'), false);
  assert.equal(serialized.includes('health_mesh'), false);
  assert.equal(serialized.includes('clinical-envelope'), false);
});
