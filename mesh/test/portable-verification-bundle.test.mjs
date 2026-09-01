import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validatePortableVerificationBundle } from '../src/lib/portable-verification-bundle.mjs';

const exampleUrl = new URL('../../agent-commons/examples/portable-verification-bundle.v1.json', import.meta.url);

test('portable verifier context remains non-authoritative', async () => {
  const bundle = JSON.parse(await readFile(exampleUrl, 'utf8'));
  const result = validatePortableVerificationBundle(bundle, {
    now: new Date('2026-09-01T13:00:00.000Z')
  });
  assert.equal(result.valid, true);
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.verification_effect, 'portable_verifier_context_only');
  assert.equal(result.external_currentness_required, true);
});

test('offline window does not silently extend', async () => {
  const bundle = JSON.parse(await readFile(exampleUrl, 'utf8'));
  const result = validatePortableVerificationBundle(bundle, {
    now: new Date('2026-09-01T19:00:00.000Z')
  });
  assert.equal(result.valid, false);
  assert.equal(result.checks.offline_window_open, false);
});

test('bundle cannot grant authority', async () => {
  const bundle = JSON.parse(await readFile(exampleUrl, 'utf8'));
  bundle.authority.bundle_grants_authority = true;
  assert.throws(
    () => validatePortableVerificationBundle(bundle),
    /bundle must grant no authority/
  );
});

test('high-consequence revocation requirement is explicit', async () => {
  const bundle = JSON.parse(await readFile(exampleUrl, 'utf8'));
  assert.equal(bundle.revocation_requirements.must_recheck_before_high_consequence, true);
  assert.equal(bundle.offline_policy.stale_behavior, 'hold_pending_reconnect');
});
