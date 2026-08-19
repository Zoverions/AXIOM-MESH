import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, win32 } from 'node:path';
import test from 'node:test';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const expectedScopes = [
  'authentication-authorization',
  'container-policy',
  'credential-trust',
  'evidence-integrity',
  'kernel',
  'provider-boundary',
  'recovery-rotation',
  'release-governance'
];

async function text(path) {
  return readFile(resolve(repositoryRoot, path), 'utf8');
}

test('red-team target catalog stays bounded, review-aligned, and discoverable', async () => {
  const [catalogRaw, discoveryRaw, llms] = await Promise.all([
    text('RED-TEAM-TARGETS.json'),
    text('agent-discovery.json'),
    text('llms.txt')
  ]);

  const catalog = JSON.parse(catalogRaw);
  const discovery = JSON.parse(discoveryRaw);

  assert.equal(catalog.schema, 'axiom-red-team-target-catalog.v1');
  assert.equal(catalog.supported_build, '0.12.0-dev.3');
  assert.equal(catalog.status, 'challenge_catalog_not_findings');
  assert.equal(catalog.production_status, 'production_candidate_not_production_promoted');
  assert.deepEqual(catalog.independent_review_scopes, expectedScopes);
  assert.equal(discovery.community.red_team_targets, 'RED-TEAM-TARGETS.json');
  assert.match(llms, /RED-TEAM-TARGETS\.json/);

  assert.equal(catalog.safety.third_party_testing_authorized, false);
  assert.equal(catalog.safety.catalog_claims_findings_exist, false);
  assert.equal(catalog.safety.catalog_grants_runtime_authority, false);
  assert.equal(catalog.safety.catalog_grants_merge_authority, false);
  assert.equal(catalog.safety.catalog_grants_deployment_authority, false);

  assert.equal(catalog.targets.length, expectedScopes.length);
  assert.deepEqual(catalog.targets.map((target) => target.review_scope), expectedScopes);
  assert.equal(new Set(catalog.targets.map((target) => target.id)).size, catalog.targets.length);

  for (const target of catalog.targets) {
    assert.match(target.id, /^RT-[A-Z]+-\d{3}$/);
    assert.equal(typeof target.title, 'string');
    assert.equal(typeof target.claim_boundary, 'string');
    assert.equal(typeof target.challenge_question, 'string');
    assert.ok(target.starting_points.length >= 2);
    assert.equal('severity' in target, false);
    assert.equal('priority' in target, false);
    assert.equal('confirmed' in target, false);
    assert.equal('vulnerability' in target, false);

    for (const path of target.starting_points) {
      assert.equal(path.includes('\0'), false);
      assert.equal(isAbsolute(path), false);
      assert.equal(win32.isAbsolute(path), false);

      const resolvedPath = resolve(repositoryRoot, path);
      const repositoryRelativePath = relative(repositoryRoot, resolvedPath);
      assert.equal(isAbsolute(repositoryRelativePath), false);
      assert.doesNotMatch(repositoryRelativePath, /^\.\.(?:[\\/]|$)/);

      await access(resolvedPath);
    }
  }

  assert.match(catalog.nonclaims.join('\n'), /not a confirmed vulnerability or finding/i);
  assert.match(catalog.nonclaims.join('\n'), /does not authorize testing against third-party systems/i);
});
