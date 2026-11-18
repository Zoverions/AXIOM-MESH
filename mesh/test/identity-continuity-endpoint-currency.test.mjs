import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const fixtureUrl = new URL('../../agent-commons/identity-continuity-endpoint-currency-fixtures.v1.json', import.meta.url);

async function loadFixtures() {
  return JSON.parse(await readFile(fixtureUrl, 'utf8'));
}

test('identity continuity and endpoint currency remain separate non-authoritative planes', async () => {
  const fixtures = await loadFixtures();

  assert.equal(fixtures.schema, 'axiom-identity-continuity-endpoint-currency-fixtures.v1');
  assert.equal(fixtures.target, 'RT-AUTH-001');
  assert.equal(fixtures.portable, true);
  assert.equal(fixtures.production_conformance_claimed, false);
  assert.equal(fixtures.authority_granted, false);

  assert.deepEqual(fixtures.planes.map(({ id }) => id), [
    'root_identity',
    'service_relationship',
    'endpoint_currency',
    'local_authorization'
  ]);
  assert.deepEqual(fixtures.planes.map(({ authority_effect }) => authority_effect), [
    'none',
    'none',
    'none',
    'bounded_local_grant_only'
  ]);
});

test('profile covers rotation, compromise isolation, stale endpoint evidence, cross-service replay and correlation privacy', async () => {
  const fixtures = await loadFixtures();
  const ids = new Set(fixtures.cases.map(({ id }) => id));

  for (const required of [
    'service-key-rotation-root-stable',
    'service-key-compromise-isolated',
    'root-compromise-invalidates-descendants',
    'dns-endpoint-change-no-authority-transfer',
    'stale-endpoint-current-service-delegation',
    'valid-service-lineage-expired-endpoint',
    'valid-endpoint-no-service-relationship',
    'valid-lineage-not-execution-authority',
    'cross-service-credential-transplant',
    'pairwise-credential-noncorrelation'
  ]) assert.ok(ids.has(required), required);

  assert.equal(ids.size, fixtures.cases.length);
});

test('every fixture refuses to derive execution authority from identity or endpoint evidence', async () => {
  const fixtures = await loadFixtures();

  for (const entry of fixtures.cases) {
    assert.equal(entry.expect.authority, 'none', entry.id);
    if ('decision' in entry.expect) assert.equal(entry.expect.decision, 'deny', entry.id);
  }

  const rotation = fixtures.cases.find(({ id }) => id === 'service-key-rotation-root-stable');
  assert.equal(rotation.expect.identity_continuity, 'preserved');
  assert.equal(rotation.expect.endpoint_currency, 'new_key_only');

  const stale = fixtures.cases.find(({ id }) => id === 'stale-endpoint-current-service-delegation');
  assert.equal(stale.expect.decision, 'deny');
  assert.equal(stale.expect.failure_plane, 'endpoint_currency');

  const transplant = fixtures.cases.find(({ id }) => id === 'cross-service-credential-transplant');
  assert.equal(transplant.expect.decision, 'deny');
  assert.equal(transplant.expect.failure_plane, 'service_relationship');

  const privacy = fixtures.cases.find(({ id }) => id === 'pairwise-credential-noncorrelation');
  assert.equal(privacy.expect.cross_service_linkability, 'not_derivable_without_separate_authorized_evidence');
});
