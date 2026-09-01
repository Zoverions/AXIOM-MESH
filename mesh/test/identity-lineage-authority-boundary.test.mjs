import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const fixtureUrl = new URL('../../agent-commons/identity-lineage-negative-fixtures.v1.json', import.meta.url);
const threatUrl = new URL('../../agent-commons/identity-lineage-composition-threat-model.json', import.meta.url);

test('identity lineage fixtures keep discovery, continuity and accountability non-authoritative', async () => {
  const fixtures = JSON.parse(await readFile(fixtureUrl, 'utf8'));
  const threat = JSON.parse(await readFile(threatUrl, 'utf8'));

  assert.equal(fixtures.schema, 'axiom-identity-lineage-negative-fixtures.v1');
  assert.equal(fixtures.target, 'RT-AUTH-001');
  assert.equal(fixtures.portable, true);
  assert.equal(fixtures.production_conformance_claimed, false);
  assert.equal(fixtures.authority_granted, false);
  assert.equal(fixtures.cases.length, 10);
  assert.equal(new Set(fixtures.cases.map(({ id }) => id)).size, fixtures.cases.length);

  for (const entry of fixtures.cases) {
    assert.equal(entry.expect.authority, 'none', entry.id);
    if ('decision' in entry.expect) assert.equal(entry.expect.decision, 'deny', entry.id);
  }

  const nonAuthorizationPlanes = threat.planes.filter(({ id }) => id !== 'authorization');
  assert.ok(nonAuthorizationPlanes.length >= 3);
  assert.ok(nonAuthorizationPlanes.every(({ authority_effect }) => authority_effect === 'none'));
  assert.match(threat.core_invariant, /MUST NOT create local effect authority/);
});

test('portable negative set covers rotation, stale evidence, replay, proof laundering, protocol switching, credential isolation and root compromise', async () => {
  const fixtures = JSON.parse(await readFile(fixtureUrl, 'utf8'));
  const ids = new Set(fixtures.cases.map(({ id }) => id));
  for (const required of [
    'service-key-rotation-root-stable',
    'stale-endpoint-current-delegation',
    'valid-lineage-no-local-grant',
    'cross-service-delegation-replay',
    'endpoint-proof-as-allow',
    'protocol-switch-authority-laundering',
    'root-compromise-vs-service-compromise',
    'endpoint-rotation-does-not-inherit-old-grant',
    'platform-credential-isolation',
    'root-compromise-invalidates-unrevalidated-lineage'
  ]) assert.ok(ids.has(required), required);
});

test('service-key rotation preserves identity continuity without inheriting retired-key grants', async () => {
  const fixtures = JSON.parse(await readFile(fixtureUrl, 'utf8'));
  const rotation = fixtures.cases.find(({ id }) => id === 'service-key-rotation-root-stable');
  const oldGrant = fixtures.cases.find(({ id }) => id === 'endpoint-rotation-does-not-inherit-old-grant');

  assert.equal(rotation.expect.identity_continuity, 'preserved_by_delegation');
  assert.equal(rotation.expect.endpoint_currency, 'new_key_only');
  assert.equal(oldGrant.expect.decision, 'deny');
  assert.equal(oldGrant.expect.requires_fresh_or_rebound_grant, true);
});

test('root compromise and platform credential replay are treated as wider-scope failures', async () => {
  const fixtures = JSON.parse(await readFile(fixtureUrl, 'utf8'));
  const root = fixtures.cases.find(({ id }) => id === 'root-compromise-invalidates-unrevalidated-lineage');
  const platform = fixtures.cases.find(({ id }) => id === 'platform-credential-isolation');

  assert.equal(root.expect.recovery_class, 'root_compromise');
  assert.equal(root.expect.requires_reestablished_root_or_local_recovery_policy, true);
  assert.equal(platform.expect.cross_platform_reuse, 'forbidden');
});
