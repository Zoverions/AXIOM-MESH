import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const threatUrl = new URL('../config/circle-authorized-grid-admission-lifecycle-cas-threat-review.v0.json', import.meta.url);

const EXPECTED_THREATS = new Set([
  'authorization-commit-race',
  'stale-membership-or-credential-head',
  'guard-omission',
  'guard-substitution',
  'authorization-context-substitution',
  'post-commit-lifecycle-change-rewrites-history',
  'different-token-replay',
  'unguarded-parent-path-bypass',
  'lifecycle-head-projection-drift',
  'cross-circle-or-membership-confusion'
]);

const EXPECTED_NON_CLAIMS = new Set([
  'credential-possession',
  'authorized-lifecycle-mutation-service',
  'human-identity',
  'legal-identity',
  'historical-backfill-authority',
  'membership-resume-authority',
  'role-grant-authority',
  'credential-issuance-authority',
  'trusted-wall-clock',
  'governance-legitimacy',
  'coercion-free-participation',
  'runtime-authority',
  'portable-authority',
  'external-effect-authority',
  'distributed-consensus'
]);

const EXPECTED_BLOCKERS = new Set([
  'credential-possession-proof-bound-to-request',
  'authorized-grid-backed-membership-and-credential-lifecycle-mutations',
  'historical-backfill-import-authority-and-live-event-freshness-policy',
  'role-grant-membership-resume-credential-issuance-and-recovery-authority-procedures',
  'guarded-successor-as-sole-service-level-circle-append-path',
  'internally-obtained-trusted-grid-chain-verification',
  'accessible-member-facing-currentness-and-denial-explanations',
  'independent-security-privacy-coercion-sybil-recovery-capture-governance-review'
]);

async function loadReview() {
  return JSON.parse(await readFile(threatUrl, 'utf8'));
}

function exactSet(values, expected) {
  return Array.isArray(values)
    && values.length === expected.size
    && new Set(values).size === expected.size
    && [...expected].every(value => values.includes(value));
}

test('Circle lifecycle CAS admission threat review is inert and exact-scope', async () => {
  const review = await loadReview();
  assert.equal(review.schema, 'axiom-circle-authorized-grid-admission-lifecycle-cas-threat-review.v0');
  assert.equal(review.version, 0);
  assert.equal(review.status, 'inert-lifecycle-cas-threat-review');
  assert.equal(review.runtime_activation, false);
  assert.equal(review.authority_effect, 'none');
  assert.equal(review.network_effect, 'none');
  assert.equal(exactSet(review.threats.map(item => item.threat), EXPECTED_THREATS), true);
  assert.equal(exactSet(review.non_claims, EXPECTED_NON_CLAIMS), true);
  assert.equal(exactSet(review.promotion_blockers, EXPECTED_BLOCKERS), true);
});

test('every lifecycle CAS threat carries multiple mitigations and an explicit residual limit', async () => {
  const review = await loadReview();
  for (const threat of review.threats) {
    assert.ok(Array.isArray(threat.mitigations));
    assert.ok(threat.mitigations.length >= 2, `${threat.threat} must retain multiple mitigations`);
    assert.equal(typeof threat.residual_limitation, 'string');
    assert.ok(threat.residual_limitation.length >= 40, `${threat.threat} residual limitation is too weak`);
  }
});

test('threat review distinguishes local atomicity from lifecycle legitimacy and distributed consensus', async () => {
  const review = await loadReview();
  const race = review.threats.find(item => item.threat === 'authorization-commit-race');
  assert.ok(race.mitigations.includes('guard-check-executes-inside-grid-begin-immediate'));
  assert.match(race.residual_limitation, /local to the authoritative Grid transaction/i);

  const stale = review.threats.find(item => item.threat === 'stale-membership-or-credential-head');
  assert.match(stale.residual_limitation, /not that the underlying lifecycle mutation was legitimately authorized/i);

  assert.ok(review.non_claims.includes('authorized-lifecycle-mutation-service'));
  assert.ok(review.non_claims.includes('distributed-consensus'));
  assert.ok(review.promotion_blockers.includes('guarded-successor-as-sole-service-level-circle-append-path'));
});
