import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const MODULE_URLS = Object.freeze([
  new URL('../src/lib/reward-probe-manifest.mjs', import.meta.url),
  new URL('../src/lib/reward-introspection-observation.mjs', import.meta.url),
  new URL('../src/lib/reward-calibration-report.mjs', import.meta.url),
  new URL('../src/lib/reward-drift-comparison.mjs', import.meta.url)
]);

const FORBIDDEN_NODE_IMPORTS = Object.freeze([
  'node:fs',
  'node:http',
  'node:https',
  'node:net',
  'node:tls',
  'node:dns',
  'node:child_process',
  'node:worker_threads'
]);

const FORBIDDEN_IMPORT_TERMS = Object.freeze([
  'gateway',
  'hypervisor',
  'sandbox',
  'grid',
  'credential-broker',
  'wallet',
  'payment',
  'provider-client',
  'runtime-supervisor',
  'capability-grant'
]);

const FORBIDDEN_CALLS = Object.freeze([
  ['fetch', /\bfetch\s*\(/],
  ['activateModel', /\bactivateModel\s*\(/],
  ['routeTo', /\brouteTo\s*\(/],
  ['grantCapability', /\bgrantCapability\s*\(/]
]);

function importsFrom(source) {
  return [...source.matchAll(/from\s+['"](.+?)['"]/g)]
    .map(match => match[1])
    .sort();
}

function namesForbiddenImport(specifier) {
  const lower = specifier.toLowerCase();
  if (FORBIDDEN_NODE_IMPORTS.some(prefix => lower === prefix || lower.startsWith(`${prefix}/`))) {
    return true;
  }
  return FORBIDDEN_IMPORT_TERMS.some(term => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[./_-])${escaped}([./_-]|$)`, 'i').test(specifier);
  });
}

for (const moduleUrl of MODULE_URLS) {
  test(`${fileURLToPath(moduleUrl)} remains isolated from authority and I/O surfaces`, async () => {
    const source = await readFile(moduleUrl, 'utf8');
    const imports = importsFrom(source);

    assert.deepEqual(
      imports.filter(namesForbiddenImport),
      [],
      `forbidden authority/I/O imports found: ${imports.filter(namesForbiddenImport).join(', ')}`
    );

    for (const [name, pattern] of FORBIDDEN_CALLS) {
      assert.equal(
        pattern.test(source),
        false,
        `reward introspection evidence module must not call ${name}()`
      );
    }
  });
}

test('the static boundary does not confuse inert credential visibility metadata with credential access', () => {
  assert.equal(namesForbiddenImport('./credential-visibility.mjs'), false);
  assert.equal(/\bcredential_visibility\b/.test('credential_visibility'), true);
});
