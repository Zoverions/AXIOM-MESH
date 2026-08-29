import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Security Residue v0 reads export bundles through one no-follow file descriptor', async () => {
  const source = await readFile(
    new URL('../src/grid/_store-checkpoints.mjs', import.meta.url),
    'utf8'
  );
  const methodMatch = source.match(/async getExportBundle\(exportId, principal\) \{[\s\S]*?\n  \}\n\n  verifyChain/);
  assert.ok(methodMatch, 'getExportBundle implementation must remain discoverable');
  const method = methodMatch[0];

  assert.match(method, /await open\(\s*expectedPath,[\s\S]*O_NOFOLLOW/);
  assert.match(method, /await \w+\.stat\(\)/);
  assert.match(method, /await \w+\.readFile\(\)/);
  assert.match(method, /await \w+\.close\(\)/);
  assert.doesNotMatch(method, /lstat\(expectedPath\)/);
  assert.doesNotMatch(method, /readFile\(expectedPath\)/);
});
