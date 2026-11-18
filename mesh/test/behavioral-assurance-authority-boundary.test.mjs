import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(TEST_DIR, '..');

const MODULES = Object.freeze([
  'src/lib/behavioral-assurance-profile.mjs',
  'src/lib/response-assurance-envelope.mjs',
  'src/lib/behavioral-drift-comparison.mjs'
]);

const SCHEMAS = Object.freeze([
  'config/behavioral-assurance-profile-v0.schema.json',
  'config/response-assurance-envelope-v0.schema.json',
  'config/behavioral-drift-comparison-v0.schema.json'
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

test('behavioral evidence contracts expose zero authority and no consequence-floor control', async () => {
  for (const path of SCHEMAS) {
    const schema = await loadJson(path);
    const properties = schema.properties || {};

    assert.equal(properties.authority_effect?.const, 'none', `${path} authority_effect`);
    assert.equal(properties.network_effect?.const, 'none', `${path} network_effect`);
    assert.equal(properties.runtime_activation?.const, false, `${path} runtime_activation`);
    assert.equal(properties.selection_effect?.const, 'evidence-only', `${path} selection_effect`);

    for (const field of FORBIDDEN_TOP_LEVEL_FIELDS) {
      assert.equal(
        Object.hasOwn(properties, field),
        false,
        `${path} must not expose ${field}`
      );
    }
  }
});

test('behavioral evidence modules remain isolated from authority and effect execution surfaces', async () => {
  const forbiddenImport = /(?:gateway|hypervisor|sandbox|grid|machine-principal|capabilit|policy|effect-consequence|effect-admission|executor|operator|network|http|child_process)/i;

  for (const path of MODULES) {
    const source = await readFile(resolve(ROOT, path), 'utf8');
    const importTargets = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match => match[1]);

    assert.ok(importTargets.length >= 1, `${path} should have explicit local imports`);
    for (const target of importTargets) {
      assert.doesNotMatch(target, forbiddenImport, `${path} imports authority/effect surface ${target}`);
    }
  }
});

test('response and drift schemas explicitly deny routing or execution interpretation', async () => {
  const response = await loadJson('config/response-assurance-envelope-v0.schema.json');
  const drift = await loadJson('config/behavioral-drift-comparison-v0.schema.json');

  assert.ok(response['x-axiom-non-claims'].includes('authorization-decision'));
  assert.ok(response['x-axiom-non-claims'].includes('safe-to-execute'));
  assert.ok(response['x-axiom-non-claims'].includes('provider-routing'));
  assert.ok(drift['x-axiom-non-claims'].includes('authorization-decision'));
  assert.ok(drift['x-axiom-non-claims'].includes('routing-decision'));
  assert.ok(drift['x-axiom-non-claims'].includes('universal-drift-threshold'));
});

test('behavioral confidence cannot encode a lower A0-A4 consequence assurance floor', async () => {
  for (const path of SCHEMAS) {
    const schema = await loadJson(path);
    const serialized = JSON.stringify(schema);
    assert.doesNotMatch(serialized, /"(?:assurance_tier|required_assurance|protection_floor)"\s*:/i);
  }
});
