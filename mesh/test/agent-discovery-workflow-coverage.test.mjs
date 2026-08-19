import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const workflows = [
  '.github/workflows/kernel.yml',
  '.github/workflows/windows.yml'
];

const protectedPaths = [
  'AGENT-ENTRY.md',
  '.cursorrules',
  'llms.txt',
  'llms-full.txt',
  'agent-discovery.json',
  'agent-readiness/**',
  'agent-skills/**',
  'RED-TEAM-TRIAGE.txt',
  'RED-TEAM-TARGETS.json',
  '.github/ISSUE_TEMPLATE/**',
  '.github/workflows/**'
];

function occurrences(text, needle) {
  return text.split(needle).length - 1;
}

test('protected agent-discovery surfaces trigger both push and pull-request CI', async () => {
  for (const workflow of workflows) {
    const source = await readFile(resolve(repositoryRoot, workflow), 'utf8');

    assert.match(source, /\n  push:\n/);
    assert.match(source, /\n  pull_request:\n/);

    for (const path of protectedPaths) {
      const quoted = `- "${path}"`;
      assert.equal(
        occurrences(source, quoted),
        2,
        `${workflow} must include ${path} in both push and pull_request path filters`
      );
    }
  }
});
