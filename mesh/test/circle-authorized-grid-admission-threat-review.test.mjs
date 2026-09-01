import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const reviewUrl = new URL('../config/circle-authorized-grid-admission-threat-review.v0.json', import.meta.url);

const THREATS = new Set([
  'mutable-membership-snapshot-laundering',
  'role-narrowing-bypass',
  'credential-currentness-laundering',
  'participant-credential-substitution',
  'open-proposal-electorate-mutation-ambiguity',
  'transport-vote-conflation',
  'authorization-event-substitution',
  'unbound-parent-admission-bypass',
  'authorization-to-commit-state-race',
  'historical-backfill-authority-confusion',
  'authorization-replay-or-reissue',
  'identity-sybil-or-coercion-confusion'
]);

const BLOCKERS = new Set([
  'hypervisor-bound-proof-of-current-credential-possession-and-request-binding',
  'participant-attestation-binding-to-exact-credential-eligibility-assessment-or-equivalent-atomic-proof',
  'explicit-open-proposal-electorate-change-semantics',
  'historical-backfill-import-authority-and-live-event-freshness-policy',
  'current-membership-and-credential-lifecycle-head-guard-at-grid-commit-or-atomic-equivalent',
  'composed-authorized-admission-as-sole-service-level-circle-append-path',
  'grid-backed-replay-safe-membership-and-credential-lifecycle-events',
  'authorized-role-grant-membership-resume-credential-issuance-and-recovery-procedures',
  'trusted-grid-chain-verification-obtained-internally-not-caller-supplied',
  'accessible-member-facing-authorization-and-denial-explanations',
  'independent-security-privacy-coercion-sybil-recovery-capture-and-governance-review'
]);

const NON_CLAIMS = Object.freeze({
  credential_possession_proved: false,
  human_identity_proved: false,
  legal_identity_proved: false,
  historical_backfill_authorized: false,
  open_proposal_electorate_changes_resolved: false,
  authorization_and_commit_are_atomic: false,
  governance_legitimacy_proved: false,
  coercion_free_participation_proved: false,
  runtime_authority_granted: false,
  portable_authority_granted: false,
  external_effect_authority_granted: false,
  distributed_consensus_proved: false
});

async function review() {
  return JSON.parse(await readFile(reviewUrl, 'utf8'));
}

test('authorized Grid admission threat inventory and promotion blockers are exact', async () => {
  const value = await review();
  assert.equal(value.schema, 'axiom-circle-authorized-grid-admission-threat-review.v0');
  assert.equal(value.version, 0);
  assert.equal(value.status, 'inert-authorized-admission-threat-review');
  assert.equal(value.runtime_activation, false);
  assert.equal(value.authority_effect, 'none');
  assert.equal(value.network_effect, 'none');
  assert.equal(value.scope, 'lifecycle-aware-circle-record-authorization-bound-to-grid-admission');

  const actualThreats = new Set(value.threats.map(item => item.id));
  assert.equal(value.threats.length, THREATS.size);
  assert.deepEqual(actualThreats, THREATS);
  assert.equal(value.promotion_blockers.length, BLOCKERS.size);
  assert.deepEqual(new Set(value.promotion_blockers), BLOCKERS);
  assert.deepEqual(value.non_claims, NON_CLAIMS);
});

test('every authorized admission threat carries mitigations and a residual limitation', async () => {
  const value = await review();
  for (const threat of value.threats) {
    assert.ok(Array.isArray(threat.mitigations));
    assert.ok(threat.mitigations.length >= 2, `missing mitigations for ${threat.id}`);
    assert.equal(new Set(threat.mitigations).size, threat.mitigations.length);
    assert.equal(typeof threat.residual_limit, 'string');
    assert.ok(threat.residual_limit.length > 20, `missing residual limit for ${threat.id}`);
  }
});

test('review keeps backfill, state-race, credential-possession and old-admission bypass unresolved', async () => {
  const value = await review();
  const byId = new Map(value.threats.map(item => [item.id, item]));
  assert.match(byId.get('historical-backfill-authority-confusion').residual_limit, /does not by itself authorize/i);
  assert.match(byId.get('authorization-to-commit-state-race').residual_limit, /may change after Hypervisor assessment/i);
  assert.match(byId.get('credential-currentness-laundering').residual_limit, /does not prove possession/i);
  assert.match(byId.get('unbound-parent-admission-bypass').residual_limit, /must prove it is unreachable/i);
  assert.equal(value.non_claims.historical_backfill_authorized, false);
  assert.equal(value.non_claims.authorization_and_commit_are_atomic, false);
  assert.equal(value.non_claims.credential_possession_proved, false);
});
