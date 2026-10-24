import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('load-bearing Clean Kernel workflow pins actions and runner and filters no change', async () => {
  const source = await readFile(new URL('../../.github/workflows/kernel.yml', import.meta.url), 'utf8');
  assert.equal(source.includes('ubuntu-latest'), false);
  assert.equal(source.includes('actions/checkout@v7'), false);
  assert.equal(source.includes('actions/setup-node@v7'), false);
  assert.equal(source.includes('actions/upload-artifact@v7'), false);
  assert.ok(source.includes('actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7'));
  assert.ok(source.includes('actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7'));
  assert.ok(source.includes('actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7'));
  assert.ok(source.includes('node src/lib/runtime-adapter-contract.mjs'));
  assert.ok(source.includes('node src/runtime-adapter-conformance.mjs'));
  assert.ok(source.includes('Verify pinned hosted-production runtime and unchanged safeguards'));
  assert.ok(source.includes('mesh/test/production-host.test.mjs'));
  assert.ok(source.includes('mesh/test/supervisor-shutdown.test.mjs'));
  assert.ok(source.includes('mesh/test/transport-credentials.test.mjs'));
  assert.ok(source.includes('mesh/test/network-boundary.test.mjs'));
  assert.ok(source.includes('mesh/test/hosted-plesk.test.mjs'));
  assert.ok(source.includes('mesh/test/agent-readiness.test.mjs'));
  assert.ok(source.includes('mesh/test/agent-readiness-hub.test.mjs'));
  assert.ok(source.includes('mesh/test/runtime-provider-catalog.test.mjs'));
  assert.ok(source.includes('mesh/test/runtime-provider-catalog-negative.test.mjs'));
  assert.ok(source.includes('--require-commit-bound'));
  assert.ok(source.includes('axiom-runtime-adapter-reference-conformance-evidence-${{ github.sha }}'));
  assert.doesNotMatch(source, /^\s+paths(?:-ignore)?:/m);
});

test('container CI assembles an exact-head non-authorizing release bundle candidate', async () => {
  const source = await readFile(new URL('../../.github/workflows/kernel.yml', import.meta.url), 'utf8');
  assert.ok(source.includes('Assemble exact-head non-authorizing release bundle candidate'));
  assert.ok(source.includes('git archive --format=tar'));
  assert.ok(source.includes('docker save --output'));
  assert.ok(source.includes('node mesh/src/release.mjs --write'));
  assert.ok(source.includes('node mesh/src/release-bundle-candidate.mjs'));
  assert.ok(source.includes('axiom-release-bundle-candidate-${{ github.sha }}'));
  assert.ok(source.includes('mesh/.data/release/0.12.0-dev.3/sbom.spdx.json'));
  assert.ok(source.includes('mesh/.data/release/0.12.0-dev.3/provenance.json'));
  assert.equal(source.includes('release_ready: true'), false);
  assert.equal(source.includes('production_promoted: true'), false);
});
