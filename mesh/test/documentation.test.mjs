import assert from 'node:assert/strict';
import test from 'node:test';
import {
  markdownLocalTargets,
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
