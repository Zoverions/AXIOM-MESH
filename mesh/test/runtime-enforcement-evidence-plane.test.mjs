import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const profileUrl = new URL('../../agent-commons/runtime-enforcement-evidence-profile.v1.json', import.meta.url);
const fixtureUrl = new URL('../../agent-commons/runtime-enforcement-evidence-fixtures.v1.json', import.meta.url);

async function loadJson(url) {
  return JSON.parse(await readFile(url, 'utf8'));
}

test('runtime enforcement evidence plane is independent, deny-dominant, and non-authorizing', async () => {
  const profile = await loadJson(profileUrl);
  const fixtures = await loadJson(fixtureUrl);

  assert.equal(profile.schema, 'axiom-runtime-enforcement-evidence-profile.v1');
  assert.equal(profile.status, 'experimental evidence and containment profile; no production promotion claimed');
  assert.equal(profile.authority_model.host_runtime_can_mint_axiom_authority, false);
  assert.equal(profile.authority_model.sensor_evidence_can_mint_axiom_authority, false);
  assert.equal(profile.authority_model.axiom_grant_can_disable_host_containment, false);
  assert.equal(profile.authority_model.effect_release_requires_axiom_authority, true);

  assert.deepEqual(profile.correlation_chain, [
    'principal',
    'delegation_or_grant',
    'intent',
    'tool_or_protocol_transition',
    'process_or_runtime',
    'consequential_effect',
    'receipt'
  ]);

  assert.equal(fixtures.schema, 'axiom-runtime-enforcement-evidence-fixtures.v1');
  assert.equal(fixtures.portable, true);
  assert.equal(fixtures.production_conformance_claimed, false);
  assert.equal(fixtures.authority_granted, false);

  for (const entry of fixtures.cases) {
    assert.equal(entry.expect.effect_allowed, false, entry.id);
    assert.equal(entry.expect.authority_minted_by_host_or_sensor, false, entry.id);
  }
});

test('host approval never substitutes for AXIOM effect authority', async () => {
  const fixtures = await loadJson(fixtureUrl);
  const entry = fixtures.cases.find(({ id }) => id === 'host-allows-axiom-denies');

  assert.ok(entry);
  assert.equal(entry.given.host_runtime_identity_verified, true);
  assert.equal(entry.given.host_policy_allows_execution, true);
  assert.equal(entry.given.axiom_authorization_allowed, false);
  assert.equal(entry.expect.effect_allowed, false);
  assert.equal(entry.expect.decision, 'deny');
});

test('AXIOM authority cannot suppress an independent host containment deny', async () => {
  const fixtures = await loadJson(fixtureUrl);
  const entry = fixtures.cases.find(({ id }) => id === 'axiom-allows-host-containment-denies');

  assert.ok(entry);
  assert.equal(entry.given.axiom_authorization_allowed, true);
  assert.equal(entry.given.host_containment_allows_execution, false);
  assert.equal(entry.expect.effect_allowed, false);
  assert.equal(entry.expect.decision, 'deny');
});

test('sensor evidence enriches receipts but cannot become an authority root', async () => {
  const fixtures = await loadJson(fixtureUrl);
  const valid = fixtures.cases.find(({ id }) => id === 'valid-sensor-evidence-without-local-grant');
  const tampered = fixtures.cases.find(({ id }) => id === 'tampered-sensor-evidence');

  assert.ok(valid);
  assert.ok(tampered);
  assert.equal(valid.given.sensor_evidence_valid, true);
  assert.equal(valid.given.axiom_authorization_allowed, false);
  assert.equal(valid.expect.effect_allowed, false);
  assert.equal(valid.expect.receipt_sensor_evidence_state, 'verified-input-only');
  assert.equal(tampered.expect.receipt_sensor_evidence_state, 'invalid');
  assert.equal(tampered.expect.effect_allowed, false);
});

test('runtime and protocol transitions remain attributable across the correlation chain', async () => {
  const fixtures = await loadJson(fixtureUrl);
  const entry = fixtures.cases.find(({ id }) => id === 'runtime-switch-after-authorization');

  assert.ok(entry);
  assert.notEqual(entry.given.authorized_runtime_digest, entry.given.actual_runtime_digest);
  assert.equal(entry.expect.effect_allowed, false);
  assert.equal(entry.expect.decision, 'deny');
  assert.equal(entry.expect.reason_code, 'runtime_evidence_binding_changed');
});
