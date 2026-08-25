import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('load-bearing Clean Kernel workflow pins actions, runner, and source paths', async () => {
  const source = await readFile(new URL('../../.github/workflows/kernel.yml', import.meta.url), 'utf8');
  assert.equal(source.includes('ubuntu-latest'), false);
  assert.equal(source.includes('actions/checkout@v7'), false);
  assert.equal(source.includes('actions/setup-node@v7'), false);
  assert.equal(source.includes('actions/upload-artifact@v7'), false);
  assert.ok(source.includes('actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7'));
  assert.ok(source.includes('actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7'));
  assert.ok(source.includes('actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7'));
  assert.ok(source.includes('node src/lib/runtime-adapter-contract.mjs'));
  assert.ok(source.includes('node src/runtime-adapter-conformance.mjs'));
  assert.ok(source.includes('Verify pinned hosted-production runtime and unchanged safeguards'));
  assert.ok(source.includes('mesh/test/production-host.test.mjs'));
  assert.ok(source.includes('mesh/test/supervisor-shutdown.test.mjs'));
  assert.ok(source.includes('mesh/test/transport-credentials.test.mjs'));
  assert.ok(source.includes('mesh/test/network-boundary.test.mjs'));
  assert.ok(source.includes('mesh/test/hosted-plesk.test.mjs'));
  assert.ok(source.includes('--require-commit-bound'));
  assert.ok(source.includes('axiom-runtime-adapter-reference-conformance-evidence-${{ github.sha }}'));
  assert.equal((source.match(/- "apps\/\*\*"/g) ?? []).length, 2);
  assert.equal((source.match(/- "packages\/\*\*"/g) ?? []).length, 2);
});
