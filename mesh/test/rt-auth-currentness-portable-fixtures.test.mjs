import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const profileUrl = new URL(
  '../../agent-commons/rt-auth-currentness-portable-profile.v1.json',
  import.meta.url
);
const fixturesUrl = new URL(
  '../../agent-commons/rt-auth-currentness-portable-fixtures.v1.json',
  import.meta.url
);

async function loadRequiredJson(url, label) {
  try {
    return JSON.parse(await readFile(url, 'utf8'));
  } catch (error) {
    assert.fail(`${label} must exist and contain valid JSON: ${error.message}`);
  }
}

test('RT-AUTH-001 portable currentness profile keeps currentness deny-only and separate from authority', async () => {
  const profile = await loadRequiredJson(profileUrl, 'portable currentness profile');

  assert.equal(profile.schema, 'axiom-rt-auth-currentness-portable-profile.v1');
  assert.equal(profile.target, 'RT-AUTH-001');
  assert.equal(profile.portable, true);
  assert.equal(profile.production_conformance_claimed, false);
  assert.equal(profile.independent_external_reproduction_claimed, false);
  assert.equal(profile.authority_model.currentness_can_mint_authority, false);
  assert.equal(profile.authority_model.historical_capability_validity_is_current_authority, false);
  assert.equal(profile.authority_model.local_effect_authority_remains_required, true);
  assert.equal(profile.authority_model.stale_or_rollback_checkpoint_fails_closed, true);

  assert.deepEqual(profile.result_dimensions, [
    'historical_evidence_valid',
    'currentness_state',
    'checkpoint_state',
    'local_effect_authority_valid',
    'effect_allowed'
  ]);
});

test('RT-AUTH-001 portable currentness fixtures cover the canonical consume-mutate-release cases', async () => {
  const fixtures = await loadRequiredJson(fixturesUrl, 'portable currentness fixtures');

  assert.equal(fixtures.schema, 'axiom-rt-auth-currentness-portable-fixtures.v1');
  assert.equal(fixtures.target, 'RT-AUTH-001');
  assert.equal(fixtures.portable, true);
  assert.equal(fixtures.production_conformance_claimed, false);
  assert.equal(fixtures.independent_external_reproduction_claimed, false);
  assert.equal(fixtures.authority_granted_by_fixture, false);

  assert.deepEqual(
    fixtures.cases.map(({ id }) => id),
    [
      'authority-replacement-after-consumption',
      'revocation-after-consumption',
      'unchanged-authority-positive-control',
      'stale-or-rollback-checkpoint-fails-closed'
    ]
  );
});

test('historically valid consumed authority cannot survive replacement or revocation', async () => {
  const fixtures = await loadRequiredJson(fixturesUrl, 'portable currentness fixtures');
  const changed = fixtures.cases.find(({ id }) => id === 'authority-replacement-after-consumption');
  const revoked = fixtures.cases.find(({ id }) => id === 'revocation-after-consumption');

  assert.ok(changed);
  assert.ok(revoked);

  for (const entry of [changed, revoked]) {
    assert.equal(entry.given.capability_consumed, true, entry.id);
    assert.equal(entry.given.historical_evidence_valid, true, entry.id);
    assert.equal(entry.given.local_effect_authority_valid_at_issue, true, entry.id);
    assert.equal(entry.expect.effect_allowed, false, entry.id);
    assert.equal(entry.expect.authority_minted_by_currentness, false, entry.id);
  }

  assert.equal(changed.expect.currentness_state, 'authority_changed');
  assert.equal(changed.expect.reason_code, 'machine_currentness_authority_changed');
  assert.equal(revoked.expect.currentness_state, 'revoked');
  assert.equal(revoked.expect.reason_code, 'machine_currentness_revoked');
});

test('unchanged authority is a positive control without making currentness an authority source', async () => {
  const fixtures = await loadRequiredJson(fixturesUrl, 'portable currentness fixtures');
  const entry = fixtures.cases.find(({ id }) => id === 'unchanged-authority-positive-control');

  assert.ok(entry);
  assert.equal(entry.given.local_effect_authority_valid_at_effect, true);
  assert.equal(entry.expect.currentness_state, 'current');
  assert.equal(entry.expect.checkpoint_state, 'current');
  assert.equal(entry.expect.effect_allowed, true);
  assert.equal(entry.expect.authority_minted_by_currentness, false);
  assert.equal(entry.expect.effect_authority_source, 'preexisting_local_effect_authority');
});

test('stale or rollback currentness evidence fails closed even when earlier authority was valid', async () => {
  const fixtures = await loadRequiredJson(fixturesUrl, 'portable currentness fixtures');
  const entry = fixtures.cases.find(({ id }) => id === 'stale-or-rollback-checkpoint-fails-closed');

  assert.ok(entry);
  assert.equal(entry.given.historical_evidence_valid, true);
  assert.equal(entry.given.local_effect_authority_valid_at_issue, true);
  assert.ok(entry.given.presented_checkpoint_sequence < entry.given.retained_head_sequence);
  assert.notEqual(entry.given.presented_checkpoint_digest, entry.given.retained_head_digest);
  assert.equal(entry.expect.checkpoint_state, 'stale_or_rollback');
  assert.equal(entry.expect.effect_allowed, false);
  assert.equal(entry.expect.authority_minted_by_currentness, false);
  assert.equal(entry.expect.reason_code, 'currentness_checkpoint_not_latest');
});
