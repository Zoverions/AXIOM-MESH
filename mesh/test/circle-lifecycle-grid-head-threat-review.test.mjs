import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const reviewUrl = new URL('../config/circle-lifecycle-grid-head-threat-review.v0.json', import.meta.url);

const EXPECTED_THREATS = new Set([
  'lifecycle-head-forgery',
  'stale-lifecycle-head-overwrite',
  'no-op-head-churn',
  'projection-drift-or-rollback',
  'current-membership-snapshot-confusion',
  'credential-validation-loss-after-membership-suspension',
  'generic-grid-append-bypass',
  'deterministic-event-replay-or-conflict',
  'cross-circle-or-cross-membership-substitution',
  'actor-laundering',
  'timestamp-or-ordering-laundering',
  'grid-chain-corruption'
]);

const EXPECTED_NON_CLAIMS = new Set([
  'authorized-lifecycle-mutation-service',
  'credential-possession',
  'human-identity',
  'legal-identity',
  'membership-resume-authority',
  'role-grant-authority',
  'credential-issuance-authority',
  'current-circle-record-admission',
  'authorization-commit-atomicity',
  'trusted-wall-clock',
  'governance-legitimacy',
  'legal-authority',
  'runtime-authority',
  'portable-authority',
  'external-effect-authority',
  'distributed-consensus'
]);

const EXPECTED_BLOCKERS = new Set([
  'authorized-membership-and-credential-lifecycle-mutation-procedure',
  'credential-possession-proof-bound-to-lifecycle-mutation',
  'grid-backed-replay-safe-underlying-lifecycle-mutation-records-or-equivalent-proof',
  'circle-record-admission-compare-and-set-against-exact-current-lifecycle-heads',
  'atomic-or-serializable-lifecycle-head-check-with-circle-record-commit',
  'historical-backfill-import-authority-and-live-event-freshness-policy',
  'membership-resume-role-grant-credential-issuance-and-recovery-authority-procedures',
  'accessible-member-facing-lifecycle-change-and-denial-explanations',
  'independent-security-privacy-coercion-sybil-recovery-capture-governance-review'
]);

async function review() {
  return JSON.parse(await readFile(reviewUrl, 'utf8'));
}

function exactSet(values, expected) {
  return Array.isArray(values)
    && values.length === expected.size
    && new Set(values).size === expected.size
    && [...expected].every(value => values.includes(value));
}

test('Circle lifecycle Grid-head threat review is inert and exact-scope', async () => {
  const value = await review();
  assert.equal(value.schema, 'axiom-circle-lifecycle-grid-head-threat-review.v0');
  assert.equal(value.version, 0);
  assert.equal(value.status, 'inert-grid-head-threat-review');
  assert.equal(value.runtime_activation, false);
  assert.equal(value.authority_effect, 'none');
  assert.equal(value.network_effect, 'none');
  assert.equal(exactSet(value.threats.map(item => item.threat), EXPECTED_THREATS), true);
  assert.equal(exactSet(value.non_claims, EXPECTED_NON_CLAIMS), true);
  assert.equal(exactSet(value.promotion_blockers, EXPECTED_BLOCKERS), true);
});

test('every lifecycle Grid-head threat retains concrete mitigations and a residual limitation', async () => {
  const value = await review();
  for (const item of value.threats) {
    assert.ok(Array.isArray(item.mitigations) && item.mitigations.length >= 2, item.threat);
    assert.equal(typeof item.residual_limitation, 'string', item.threat);
    assert.ok(item.residual_limitation.length >= 40, item.threat);
  }
});

test('review refuses to equate durable lifecycle heads with mutation authority or atomic admission', async () => {
  const value = await review();
  assert.ok(value.non_claims.includes('authorized-lifecycle-mutation-service'));
  assert.ok(value.non_claims.includes('authorization-commit-atomicity'));
  assert.ok(value.promotion_blockers.includes('circle-record-admission-compare-and-set-against-exact-current-lifecycle-heads'));
  assert.ok(value.promotion_blockers.includes('atomic-or-serializable-lifecycle-head-check-with-circle-record-commit'));
  assert.ok(value.promotion_blockers.includes('grid-backed-replay-safe-underlying-lifecycle-mutation-records-or-equivalent-proof'));
});
