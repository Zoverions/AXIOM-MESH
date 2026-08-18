import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sourceUrl = new URL(
  '../src/lib/public-witness-source-provisioning-lifecycle-store.mjs',
  import.meta.url
);

test('lifecycle-aware provisioning store remains local and adds no network or Grid runtime surface', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.doesNotMatch(source, /node:(?:http|https|net|tls|dns|dgram)/);
  assert.doesNotMatch(source, /\b(?:fetch|listen|createServer|connect)\s*\(/);
  assert.doesNotMatch(source, /(?:gateway|hypervisor|sandbox|grid-store)\.mjs/i);
  assert.match(source, /signer_cutover_requires_reopen: true/);
  assert.match(source, /network_effect: 'none'/);
  assert.match(source, /capability_promotion_effect: 'none'/);
  assert.match(source, /historical_records_resigned: false/);
});
