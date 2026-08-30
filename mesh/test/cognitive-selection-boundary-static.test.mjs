import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const SURFACES = Object.freeze([
  Object.freeze({
    name: 'eligibility',
    sourceUrl: new URL('../src/lib/cognitive-capability-profile.mjs', import.meta.url),
    allowedImports: Object.freeze([
      './canonical.mjs',
      './runtime-connector-fabric-contracts.mjs'
    ])
  }),
  Object.freeze({
    name: 'selection-proposal',
    sourceUrl: new URL('../src/lib/cognitive-selection-proposal.mjs', import.meta.url),
    allowedImports: Object.freeze([
      './canonical.mjs',
      './cognitive-capability-profile.mjs'
    ])
  })
]);

const FORBIDDEN_SURFACES = Object.freeze([
  'node:fs',
  'node:http',
  'node:https',
  'node:net',
  'node:tls',
  'node:dns',
  'node:child_process',
  'node:worker_threads',
  'fetch(',
  'readFile(',
  'writeFile(',
  'createConnection(',
  'request(',
  'spawn(',
  'exec(',
  'Gateway',
  'Hypervisor',
  'Sandbox',
  'Grid',
  'credentialBroker',
  'wallet',
  'paymentToken',
  'secretStore'
]);

function importSpecifiers(source) {
  return [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);
}

for (const surface of SURFACES) {
  test(`cognitive ${surface.name} source stays pure and outside authority or I/O surfaces`, async () => {
    const source = await readFile(surface.sourceUrl, 'utf8');
    const imports = importSpecifiers(source);

    assert.deepEqual(imports.sort(), [...surface.allowedImports].sort());

    for (const forbidden of FORBIDDEN_SURFACES) {
      assert.equal(
        source.includes(forbidden),
        false,
        `forbidden cognitive ${surface.name} surface: ${forbidden}`
      );
    }
  });
}
