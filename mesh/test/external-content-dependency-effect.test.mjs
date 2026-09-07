import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const fixtureUrl = new URL('../../agent-commons/external-content-dependency-effect-fixtures.v1.json', import.meta.url);

async function loadFixtures() {
  return JSON.parse(await readFile(fixtureUrl, 'utf8'));
}

test('external content, dependency provenance and effect authority remain separate planes', async () => {
  const fixtures = await loadFixtures();

  assert.equal(fixtures.schema, 'axiom-external-content-dependency-effect-fixtures.v1');
  assert.equal(fixtures.target, 'RT-AUTH-001');
  assert.equal(fixtures.portable, true);
  assert.equal(fixtures.production_conformance_claimed, false);
  assert.equal(fixtures.authority_granted, false);

  assert.deepEqual(fixtures.planes.map(({ id }) => id), [
    'external_content',
    'dependency_identity',
    'artifact_provenance',
    'local_authorization',
    'effect'
  ]);
  assert.deepEqual(fixtures.planes.map(({ authority_effect }) => authority_effect), [
    'none',
    'none',
    'none',
    'bounded_local_grant_only',
    'consequential_boundary'
  ]);
});

test('profile covers dependency takeover, mutable references, signed instructions and protocol switching', async () => {
  const fixtures = await loadFixtures();
  const ids = new Set(fixtures.cases.map(({ id }) => id));

  for (const required of [
    'unregistered-package-claimed-later',
    'expired-domain-reregistered',
    'package-ownership-transfer',
    'same-name-new-publisher',
    'mutable-tag-retargeted',
    'signed-llms-txt-unapproved-install',
    'git-reference-substituted',
    'container-tag-substituted',
    'remote-bootstrap-script-substituted',
    'protocol-switch-content-to-mcp-to-shell'
  ]) assert.ok(ids.has(required), required);

  assert.equal(ids.size, fixtures.cases.length);
});

test('every fixture prevents external content or provenance evidence from minting execution authority', async () => {
  const fixtures = await loadFixtures();

  for (const entry of fixtures.cases) {
    assert.equal(entry.expect.authority, 'none', entry.id);
    assert.equal(entry.expect.decision, 'deny', entry.id);
    assert.equal(entry.expect.effect_invoked, false, entry.id);
  }

  const signedDocs = fixtures.cases.find(({ id }) => id === 'signed-llms-txt-unapproved-install');
  assert.equal(signedDocs.expect.failure_plane, 'local_authorization');

  const takeover = fixtures.cases.find(({ id }) => id === 'unregistered-package-claimed-later');
  assert.equal(takeover.expect.failure_plane, 'artifact_provenance');

  const switchCase = fixtures.cases.find(({ id }) => id === 'protocol-switch-content-to-mcp-to-shell');
  assert.equal(switchCase.expect.failure_plane, 'local_authorization');
  assert.equal(switchCase.expect.protocol_transition_may_widen_authority, false);
});
