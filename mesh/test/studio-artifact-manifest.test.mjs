import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validateStudioArtifactManifest } from '../src/lib/studio-artifact-manifest.mjs';

const exampleUrl = new URL('../../studio/examples/local-research-capsule.manifest.v1.json', import.meta.url);
const syncUrl = new URL('../../agent-commons/offline-reconciliation-profile.v1.json', import.meta.url);

test('Studio artifact envelope is reusable but inert', async () => {
  const manifest = JSON.parse(await readFile(exampleUrl, 'utf8'));
  const result = validateStudioArtifactManifest(manifest);
  assert.equal(result.valid, true);
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.activation_requires_local_admission, true);
});

test('Studio artifact cannot gain authority through publication, installation, or missing local admission', async () => {
  const base = JSON.parse(await readFile(exampleUrl, 'utf8'));
  for (const [field, value, pattern] of [
    ['installation_grants_authority', true, /installation must grant no authority/],
    ['publication_grants_authority', true, /publication must grant no authority/],
    ['activation_requires_local_admission', false, /activation must require local admission/],
    ['required_local_adaptation', false, /require explicit local adaptation/]
  ]) {
    const changed = structuredClone(base);
    changed[field] = value;
    assert.throws(() => validateStudioArtifactManifest(changed), pattern);
  }
});

test('Studio artifact profile and topology identifiers must be canonical IDs', async () => {
  const base = JSON.parse(await readFile(exampleUrl, 'utf8'));

  const whitespace = structuredClone(base);
  whitespace.protection_profile_ids = ['not a canonical id'];
  assert.throws(
    () => validateStudioArtifactManifest(whitespace),
    /protection_profile_ids/
  );

  const overlong = structuredClone(base);
  overlong.verification_profile_ids = ['a'.repeat(193)];
  assert.throws(
    () => validateStudioArtifactManifest(overlong),
    /verification_profile_ids/
  );
});

test('offline reconciliation preserves stale-state uncertainty and conflict evidence', async () => {
  const profile = JSON.parse(await readFile(syncUrl, 'utf8'));
  const external = profile.local_state_classes.find(({ id }) => id === 'externally_freshness_bound');
  assert.ok(external, 'externally_freshness_bound state class must exist');
  assert.equal(external.offline_behavior, 'deny_or_pending_when_freshness_required');
  assert.ok(profile.forbidden.includes('retroactively label an offline action as externally verified when it was not'));
  assert.ok(profile.forbidden.includes('drop conflicting evidence to simplify convergence'));
});
