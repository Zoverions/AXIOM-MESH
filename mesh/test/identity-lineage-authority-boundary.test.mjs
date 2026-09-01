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
  assert.equal(fixtures.cases.length, 7);
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

test('portable negative set covers rotation, stale evidence, replay, proof laundering, protocol switching and root compromise', async () => {
  const fixtures = JSON.parse(await readFile(fixtureUrl, 'utf8'));
  const ids = new Set(fixtures.cases.map(({ id }) => id));
  for (const required of [
    'service-key-rotation-root-stable',
    'stale-endpoint-current-delegation',
    'valid-lineage-no-local-grant',
    'cross-service-delegation-replay',
    'endpoint-proof-as-allow',
    'protocol-switch-authority-laundering',
    'root-compromise-vs-service-compromise'
  ]) assert.ok(ids.has(required), required);
});
