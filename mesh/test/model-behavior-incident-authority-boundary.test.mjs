import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(TEST_DIR, '..');

const MODULES = Object.freeze([
  'src/lib/model-behavior-incident.mjs'
]);

const SCHEMAS = Object.freeze([
  'config/axiom-model-behavior-incident-v0.schema.json'
]);

const FORBIDDEN_TOP_LEVEL_FIELDS = Object.freeze([
  'allow',
  'authorized',
  'approved',
  'route',
  'winner',
  'safe_to_execute',
  'capability_grant',
  'effect_authority',
  'assurance_tier',
  'required_assurance',
  'protection_floor'
]);

async function loadJson(path) {
  return JSON.parse(await readFile(resolve(ROOT, path), 'utf8'));
}

test('model behavior incident contract exposes zero authority and no consequence-floor control', async () => {
  for (const path of SCHEMAS) {
    const schema = await loadJson(path);
    const properties = schema.properties || {};

    assert.equal(properties.authority_effect?.const, 'none', `${path} authority_effect`);
    assert.equal(properties.network_effect?.const, 'none', `${path} network_effect`);
    assert.equal(properties.runtime_activation?.const, false, `${path} runtime_activation`);
    assert.equal(properties.selection_effect?.const, 'evidence-only', `${path} selection_effect`);
    assert.equal(properties.credential_visibility?.const, 'none', `${path} credential_visibility`);

    for (const field of FORBIDDEN_TOP_LEVEL_FIELDS) {
      assert.equal(
        Object.hasOwn(properties, field),
        false,
        `${path} must not expose ${field}`
      );
    }
  }
});

test('model behavior incident module remains isolated from authority and effect execution surfaces', async () => {
  const forbiddenImport = /(?:gateway|hypervisor|sandbox|grid|machine-principal|capabilit|policy|effect-consequence|effect-admission|executor|operator|network|http|https|child_process|fs\/promises|node:fs|undici|fetch)/i;

  for (const path of MODULES) {
    const source = await readFile(resolve(ROOT, path), 'utf8');
    const importTargets = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match => match[1]);

    assert.ok(importTargets.length >= 1, `${path} should have explicit local imports`);
    for (const target of importTargets) {
      assert.doesNotMatch(target, forbiddenImport, `${path} imports authority/effect surface ${target}`);
    }
    assert.ok(importTargets.every(target => target.startsWith('./')), `${path} must use local relative imports only`);
  }
});

test('schema non-claims deny disclosure automation and industry-standard claims', async () => {
  const schema = await loadJson('config/axiom-model-behavior-incident-v0.schema.json');
  assert.ok(schema['x-axiom-non-claims'].includes('disclosure-automation'));
  assert.ok(schema['x-axiom-non-claims'].includes('industry-standard'));
  assert.ok(schema['x-axiom-non-claims'].includes('severity-certification'));
  assert.ok(schema['x-axiom-non-claims'].includes('openai-failure-equivalence'));
  assert.ok(schema['x-axiom-non-claims'].includes('live-provider-access'));
});
