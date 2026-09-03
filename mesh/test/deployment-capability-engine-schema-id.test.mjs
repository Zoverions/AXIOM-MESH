import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function readSchema(name) {
  return JSON.parse(await readFile(
    new URL(`../config/${name}`, import.meta.url),
    'utf8'
  ));
}

test('deployment caller-authored schemas follow the repository URL-form $id convention', async () => {
  const cases = [
    ['desired-deployment-v0.schema.json', 'https://axiom.invalid/schemas/desired-deployment-v0.schema.json'],
    ['deployment-provider-binding-v0.schema.json', 'https://axiom.invalid/schemas/deployment-provider-binding-v0.schema.json'],
    ['deployment-spec-v0.schema.json', 'https://axiom.invalid/schemas/deployment-spec-v0.schema.json']
  ];

  for (const [filename, expectedId] of cases) {
    const schema = await readSchema(filename);
    assert.equal(schema.$id, expectedId);
  }
});
