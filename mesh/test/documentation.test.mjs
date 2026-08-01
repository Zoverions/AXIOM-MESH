import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  markdownLocalTargets,
  repositoryMarkdownFiles,
  verifyCanonicalDocumentation
} from '../src/check-docs.mjs';
import { normalizeLineEndings } from '../src/status.mjs';

test('generated documentation comparisons are line-ending independent', () => {
  assert.equal(normalizeLineEndings('alpha\r\nbeta\r\n'), 'alpha\nbeta\n');
  assert.equal(normalizeLineEndings('alpha\rbeta\r'), 'alpha\nbeta\n');
});

test('canonical documentation is complete and has valid local links', async () => {
  assert.deepEqual(
    markdownLocalTargets('[local](../README.md) [anchor](#part) [web](https://example.com)'),
    ['../README.md']
  );
  const result = await verifyCanonicalDocumentation();
  assert.equal(result.valid, true);
  assert.ok(result.documents >= 10);
  assert.ok(result.links >= 10);
});

test('repository Markdown boundary stops at nested Git repositories', async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), 'axiom-doc-boundary-'));
  try {
    await mkdir(join(repositoryRoot, '.git'));
    await mkdir(join(repositoryRoot, 'ordinary'));
    await mkdir(join(repositoryRoot, 'nested', '.git'), { recursive: true });
    await writeFile(join(repositoryRoot, 'README.md'), '# Root\n');
    await writeFile(join(repositoryRoot, 'ordinary', 'NOTES.md'), '# Ordinary\n');
    await writeFile(join(repositoryRoot, 'nested', 'README.md'), '# Separate repository\n');

    assert.deepEqual(await repositoryMarkdownFiles(repositoryRoot), [
      'README.md',
      'ordinary/NOTES.md'
    ]);
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true });
  }
});
