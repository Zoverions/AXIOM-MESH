import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const reviewUrl = new URL('../config/circle-charter-threat-review.v0.json', import.meta.url);

async function loadReview() {
  return JSON.parse(await readFile(reviewUrl, 'utf8'));
}

const EXPECTED_THREATS = new Set([
  'charter-digest-substitution',
  'parallel-charter-heads-or-history-fork',
  'version-skip-or-rollback',
  'retroactive-or-backdated-activation',
  'future-charter-misrepresented-as-active',
  'stale-charter-applied-to-historical-action',
  'activation-evidence-authority-laundering',
  'cross-circle-charter-confusion',
  'role-or-runtime-authority-confusion',
  'activation-clock-trust'
]);

test('Circle charter threat review is inert and exact-scope', async () => {
  const review = await loadReview();
  assert.equal(review.schema, 'axiom-circle-charter-threat-review.v0');
  assert.equal(review.version, 0);
  assert.equal(review.status, 'inert-charter-history-threat-review');
  assert.equal(review.runtime_activation, false);
  assert.equal(review.authority_effect, 'none');
  assert.equal(review.network_effect, 'none');
  assert.equal(review.scope, 'activated-circle-charter-history-and-local-historical-resolution-only');
  const ids = new Set(review.threats.map(threat => threat.id));
  assert.equal(ids.size, EXPECTED_THREATS.size);
  for (const id of EXPECTED_THREATS) assert.ok(ids.has(id), `missing threat ${id}`);
});

test('every charter threat retains mitigations and residual limitations', async () => {
  const review = await loadReview();
  for (const threat of review.threats) {
    assert.ok(Array.isArray(threat.mitigations));
    assert.ok(threat.mitigations.length >= 2, `${threat.id} has insufficient mitigations`);
    assert.equal(new Set(threat.mitigations).size, threat.mitigations.length);
    assert.equal(typeof threat.residual_limit, 'string');
    assert.ok(threat.residual_limit.length >= 55, `${threat.id} residual limit is too weak`);
  }
});

test('creation chronology and immutable historical resolution remain explicit mitigations', async () => {
  const review = await loadReview();
  const retroactive = review.threats.find(threat => threat.id === 'retroactive-or-backdated-activation');
  const stale = review.threats.find(threat => threat.id === 'stale-charter-applied-to-historical-action');
  const clock = review.threats.find(threat => threat.id === 'activation-clock-trust');
  assert.ok(retroactive.mitigations.includes('record-and-effective-time-not-before-circle-creation'));
  assert.ok(stale.mitigations.includes('resolved-charter-deeply-frozen'));
  assert.ok(clock.mitigations.includes('circle-creation-time-lower-bound'));
});

test('charter history never becomes governance legitimacy or runtime authority proof', async () => {
  const review = await loadReview();
  const authority = review.threats.find(threat => threat.id === 'role-or-runtime-authority-confusion');
  const evidence = review.threats.find(threat => threat.id === 'activation-evidence-authority-laundering');
  assert.match(authority.residual_limit, /cannot itself grant Sandbox, Grid, repository, legal, or coercive authority/);
  assert.match(evidence.residual_limit, /does not establish truth, legitimacy, quorum, consent, or authorization/);
  assert.equal(review.non_claims.charter_history_proves_legitimate_governance, false);
  assert.equal(review.non_claims.activation_evidence_proves_approval, false);
  assert.equal(review.non_claims.charter_role_grants_runtime_authority, false);
  assert.equal(review.non_claims.portable_authority_granted, false);
});

test('future and fork semantics remain explicit promotion blockers', async () => {
  const review = await loadReview();
  const future = review.threats.find(threat => threat.id === 'future-charter-misrepresented-as-active');
  const fork = review.threats.find(threat => threat.id === 'parallel-charter-heads-or-history-fork');
  assert.ok(future.mitigations.includes('future-activation-rejected'));
  assert.ok(future.mitigations.includes('historical-resolution-cannot-project-into-future'));
  assert.match(fork.residual_limit, /does not provide distributed fork choice or consensus/);
  assert.equal(review.non_claims.scheduled_future_charters_supported, false);
  assert.equal(review.non_claims.distributed_consensus_enabled, false);
  assert.ok(review.promotion_blockers.includes('conflict-and-concurrent-head-handling-for-causal-exchange'));
});

test('real runtime promotion requires historical action binding and replay-safe storage', async () => {
  const review = await loadReview();
  const stale = review.threats.find(threat => threat.id === 'stale-charter-applied-to-historical-action');
  assert.match(stale.residual_limit, /future action and decision records must explicitly bind this resolved digest/);
  assert.ok(review.promotion_blockers.includes('grid-backed-replay-safe-charter-history-storage'));
  assert.ok(review.promotion_blockers.includes('historical-proposal-decision-and-membership-binding-to-resolved-charter'));
  assert.ok(review.promotion_blockers.includes('explicit-charter-amendment-proposal-and-approval-authority-model'));
});
