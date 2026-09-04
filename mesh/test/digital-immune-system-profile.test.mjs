import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const url = new URL('../../agent-commons/digital-immune-system-profile.v1.json', import.meta.url);

test('digital immune agents remain non-authoritative sensors', async () => {
  const profile = JSON.parse(await readFile(url, 'utf8'));
  assert.equal(profile.schema, 'axiom-digital-immune-system-profile.v1');
  assert.ok(profile.agent_roles.length >= 5);
  assert.ok(profile.agent_roles.every(({ authority_effect }) =>
    authority_effect === 'none' || authority_effect === 'none_outside_disposable_lab'
  ));
  assert.ok(profile.core_invariants.includes(
    'No single model or defensive agent is a root of trust.'
  ));
});

test('high-impact immune actions require progression beyond advisory model output', async () => {
  const profile = JSON.parse(await readFile(url, 'utf8'));
  const advisory = profile.decision_lanes.find(({ id }) => id === 'advisory');
  assert.ok(advisory, 'advisory decision lane must exist');
  assert.ok(advisory.prohibited_effects.includes('permanent_block'));
  assert.ok(advisory.prohibited_effects.includes('credential_revocation'));
  assert.ok(advisory.prohibited_effects.includes('policy_mutation'));

  const confirmed = profile.decision_lanes.find(({ id }) => id === 'confirmed');
  assert.ok(confirmed, 'confirmed decision lane must exist');
  assert.ok(confirmed.allowed_effects.includes('add_regression_fixture'));
  assert.ok(confirmed.prohibited_effects.includes('silent_permanent_blacklist'));
});

test('anti-autoimmunity preserves novelty and appeal', async () => {
  const profile = JSON.parse(await readFile(url, 'utf8'));
  assert.ok(profile.anti_autoimmunity.includes(
    'independent confirmation before high-impact containment'
  ));
  assert.ok(profile.anti_autoimmunity.includes(
    'appeal/review path for quarantined principals or artifacts'
  ));
  assert.ok(profile.core_invariants.includes(
    'Unknown or novel behavior is not itself proof of hostility.'
  ));
});
