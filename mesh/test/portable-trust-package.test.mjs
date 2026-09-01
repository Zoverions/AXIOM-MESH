import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validatePortableTrustPackage } from '../src/lib/portable-trust-package.mjs';

const exampleUrl = new URL('../../agent-commons/examples/portable-trust-package.v1.json', import.meta.url);
const NOW = new Date('2026-09-01T13:00:00.000Z');

test('portable trust package imports only as quarantined inert content', async () => {
  const pkg = JSON.parse(await readFile(exampleUrl, 'utf8'));
  const result = validatePortableTrustPackage(pkg, { now: NOW });
  assert.equal(result.valid_for_quarantine_import, true);
  assert.equal(result.import_state, 'quarantined_inert');
  assert.equal(result.authority_effect, 'none');
  assert.deepEqual(result.next_required_steps, [
    'quarantine_scan',
    'local_review',
    'fresh_policy_check',
    'explicit_admission'
  ]);
});

test('signature, witness, import and installation can never directly grant authority', async () => {
  const base = JSON.parse(await readFile(exampleUrl, 'utf8'));
  for (const field of [
    'signature_grants_authority',
    'witness_grants_authority',
    'import_grants_authority',
    'installation_grants_authority'
  ]) {
    const changed = structuredClone(base);
    changed.authority[field] = true;
    assert.throws(
      () => validatePortableTrustPackage(changed, { now: NOW }),
      new RegExp(field)
    );
  }
});

test('unsafe package paths are rejected', async () => {
  const pkg = JSON.parse(await readFile(exampleUrl, 'utf8'));
  pkg.artifacts[0].path = '../escape.bin';
  assert.throws(
    () => validatePortableTrustPackage(pkg, { now: NOW }),
    /traversal-safe/
  );
});

test('expired package cannot enter even quarantine as valid transfer context', async () => {
  const pkg = JSON.parse(await readFile(exampleUrl, 'utf8'));
  const result = validatePortableTrustPackage(pkg, {
    now: new Date('2026-09-03T13:00:00.000Z')
  });
  assert.equal(result.valid_for_quarantine_import, false);
  assert.equal(result.authority_effect, 'none');
});
