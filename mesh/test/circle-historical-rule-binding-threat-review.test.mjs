import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const reviewUrl = new URL('../config/circle-historical-rule-binding-threat-review.v0.json', import.meta.url);

async function loadReview() {
  return JSON.parse(await readFile(reviewUrl, 'utf8'));
}

const EXPECTED_THREATS = new Set([
  'historical-record-substitution-or-rewrite',
  'ledger-reordering-truncation-or-fork',
  'stale-invitation-admission-after-charter-change',
  'mid-proposal-rule-switching',
  'mutable-projection-misrepresented-as-original-event',
  'basis-binding-substitution',
  'event-time-or-binding-time-backdating',
  'cross-circle-historical-confusion',
  'evidence-or-receipt-authority-laundering',
  'historical-binding-authority-laundering',
  'partial-record-type-coverage'
]);

test('historical binding threat review is inert and exact-scope', async () => {
  const review = await loadReview();
  assert.equal(review.schema, 'axiom-circle-historical-rule-binding-threat-review.v0');
  assert.equal(review.version, 0);
  assert.equal(review.status, 'inert-historical-binding-threat-review');
  assert.equal(review.runtime_activation, false);
  assert.equal(review.authority_effect, 'none');
  assert.equal(review.network_effect, 'none');
  assert.equal(
    review.scope,
    'circle-invitation-membership-proposal-decision-event-snapshot-rule-binding-only'
  );
  const ids = new Set(review.threats.map(threat => threat.id));
  assert.equal(ids.size, EXPECTED_THREATS.size);
  for (const id of EXPECTED_THREATS) assert.ok(ids.has(id), `missing threat ${id}`);
});

test('every historical binding threat has multiple mitigations and an explicit residual limit', async () => {
  const review = await loadReview();
  for (const threat of review.threats) {
    assert.ok(Array.isArray(threat.mitigations));
    assert.ok(threat.mitigations.length >= 2, `${threat.id} has insufficient mitigations`);
    assert.equal(new Set(threat.mitigations).size, threat.mitigations.length);
    assert.equal(typeof threat.residual_limit, 'string');
    assert.ok(threat.residual_limit.length >= 65, `${threat.id} residual limit is too weak`);
  }
});

test('stale invitations and mid-proposal rule changes retain fail-closed mitigations', async () => {
  const review = await loadReview();
  const stale = review.threats.find(threat => threat.id === 'stale-invitation-admission-after-charter-change');
  const switching = review.threats.find(threat => threat.id === 'mid-proposal-rule-switching');
  assert.ok(stale.mitigations.includes('membership-charter-resolved-at-acceptance'));
  assert.ok(stale.mitigations.includes('invitation-charter-must-still-equal-acceptance-charter'));
  assert.ok(switching.mitigations.includes('proposal-freezes-charter-at-creation'));
  assert.ok(switching.mitigations.includes('decision-inherits-proposal-frozen-charter'));
});

test('binding does not turn provenance into truth, legitimacy, identity, or authority', async () => {
  const review = await loadReview();
  const evidence = review.threats.find(threat => threat.id === 'evidence-or-receipt-authority-laundering');
  const authority = review.threats.find(threat => threat.id === 'historical-binding-authority-laundering');
  assert.match(evidence.residual_limit, /does not establish truth, identity, consent, vote validity, or authorization/);
  assert.match(authority.residual_limit, /cannot grant Grid, Sandbox, repository, legal, financial, or coercive authority/);
  assert.equal(review.non_claims.historical_binding_proves_record_authenticity, false);
  assert.equal(review.non_claims.historical_binding_proves_actor_authorization, false);
  assert.equal(review.non_claims.historical_binding_proves_decision_legitimacy, false);
  assert.equal(review.non_claims.runtime_authority_granted, false);
  assert.equal(review.non_claims.portable_authority_granted, false);
});

test('ledger completeness and persistence remain explicit unresolved boundaries', async () => {
  const review = await loadReview();
  const ledger = review.threats.find(threat => threat.id === 'ledger-reordering-truncation-or-fork');
  const coverage = review.threats.find(threat => threat.id === 'partial-record-type-coverage');
  assert.match(ledger.residual_limit, /without an externally anchored head digest/);
  assert.match(coverage.residual_limit, /tasks, appeals, exits, suspensions, revocations/);
  assert.equal(review.non_claims.historical_binding_proves_complete_history, false);
  assert.equal(review.non_claims.binding_ledger_is_grid_persisted, false);
  assert.ok(review.promotion_blockers.includes('grid-backed-replay-safe-binding-ledger-with-anchored-head'));
  assert.ok(review.promotion_blockers.includes('append-only-membership-status-proposal-status-task-appeal-and-exit-events'));
});
