import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const meshRoot = new URL('../', import.meta.url);

async function json(url) {
  return JSON.parse(await readFile(url, 'utf8'));
}

test('version policy is explicit and bound to the current package version', async () => {
  const [policy, packageJson] = await Promise.all([
    json(new URL('config/version-policy.json', meshRoot)),
    json(new URL('package.json', meshRoot))
  ]);
  assert.equal(policy.schema, 'axiom-version-policy.v1');
  assert.equal(policy.versioning_model, 'semver-prerelease');
  assert.equal(policy.current_build_version, packageJson.version);
  assert.equal(policy.rules.historical_release_artifacts_are_immutable, true);
  assert.equal(policy.rules.live_build_surfaces_must_share_current_version, true);
  assert.equal(policy.rules.release_significant_merge_requires_version_review, true);
  assert.equal(policy.rules.published_release_requires_exact_head_evidence, true);
  assert.equal(policy.rules.version_bump_does_not_imply_capability_promotion, true);
  assert.ok(policy.release_significant_change_classes.includes('security-boundary'));
  assert.ok(policy.release_significant_change_classes.includes('trusted-kernel-runtime'));
});
