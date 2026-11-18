import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const workflows = [
  '.github/workflows/kernel.yml',
  '.github/workflows/windows.yml'
];

test('every change triggers both push and pull-request CI', async () => {
  for (const workflow of workflows) {
    const source = await readFile(resolve(repositoryRoot, workflow), 'utf8');

    assert.match(source, /\n  push:\n/);
    assert.match(source, /\n  pull_request:\n/);

    assert.doesNotMatch(
      source,
      /^\s+paths(?:-ignore)?:/m,
      `${workflow} must not restrict verification to a path allowlist`
    );
  }
});
