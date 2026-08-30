import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const MODULE_PATH = '../src/lib/cognitive-selection-proposal.mjs';
const SCHEMA_PATH = new URL('../config/cognitive-selection-policy-v0.schema.json', import.meta.url);
const SOURCE_PATH = new URL('../src/lib/cognitive-selection-proposal.mjs', import.meta.url);

const FORBIDDEN_IMPORT_MARKERS = [
  "node:fs",
  "node:http",
  "node:https",
  "node:net",
  "node:tls",
  "node:child_process",
  "node:worker_threads",
  "credential",
  "wallet",
  "secret-store"
];

test('exposes an inert cognitive selection proposal surface and schema without authority-bearing imports', async () => {
  let selection;
  try {
    selection = await import(MODULE_PATH);
  } catch (error) {
    assert.fail(`cognitive selection proposal module must exist: ${error?.code ?? error?.message ?? error}`);
  }

  assert.equal(selection.COGNITIVE_SELECTION_POLICY_SCHEMA, 'axiom-cognitive-selection-policy.v0');
  assert.equal(typeof selection.validateCognitiveSelectionPolicy, 'function');
  assert.equal(typeof selection.proposeCognitiveSelection, 'function');

  const schemaText = await readFile(SCHEMA_PATH, 'utf8');
  const schema = JSON.parse(schemaText);
  assert.equal(schema.$id, 'axiom-cognitive-selection-policy.v0');

  const source = await readFile(SOURCE_PATH, 'utf8');
  for (const marker of FORBIDDEN_IMPORT_MARKERS) {
    assert.equal(source.includes(marker), false, `selection proposal source must not contain ${marker}`);
  }
});
