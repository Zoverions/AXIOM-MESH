import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const reviewUrl = new URL('../config/circle-simulation-threat-review.v0.json', import.meta.url);

async function loadReview() {
  return JSON.parse(await readFile(reviewUrl, 'utf8'));
}

const EXPECTED_THREATS = new Set([
  'sybil-membership',
  'quorum-manipulation',
  'role-capture',
  'stale-membership',
  'charter-or-circle-substitution',
  'simulation-result-laundering',
  'evidence-reference-laundering',
  'coercive-or-nonvoluntary-participation',
  'clock-and-timestamp-manipulation',
  'cross-circle-confusion'
]);

test('Circle simulation threat review is inert and exact-scope', async () => {
  const review = await loadReview();
  assert.equal(review.schema, 'axiom-circle-simulation-threat-review.v0');
  assert.equal(review.version, 0);
  assert.equal(review.status, 'inert-simulation-threat-review');
  assert.equal(review.runtime_activation, false);
  assert.equal(review.authority_effect, 'none');
  assert.equal(review.network_effect, 'none');
  assert.equal(review.scope, 'local-multiprincipal-circle-simulation-only');
  const ids = new Set(review.threats.map(threat => threat.id));
  assert.equal(ids.size, EXPECTED_THREATS.size);
  for (const id of EXPECTED_THREATS) assert.ok(ids.has(id), `missing threat ${id}`);
});

test('every Circle simulation threat retains mitigation and residual-limit evidence', async () => {
  const review = await loadReview();
  for (const threat of review.threats) {
    assert.ok(Array.isArray(threat.mitigations));
    assert.ok(threat.mitigations.length >= 2, `${threat.id} has insufficient mitigations`);
    assert.equal(new Set(threat.mitigations).size, threat.mitigations.length);
    assert.equal(typeof threat.residual_limit, 'string');
    assert.ok(threat.residual_limit.length >= 40, `${threat.id} residual limit is too weak`);
  }
});

test('Sybil and quorum protections do not claim human uniqueness or legitimate electorate composition', async () => {
  const review = await loadReview();
  const sybil = review.threats.find(threat => threat.id === 'sybil-membership');
  const quorum = review.threats.find(threat => threat.id === 'quorum-manipulation');
  assert.match(sybil.residual_limit, /does not prove one human/);
  assert.match(quorum.residual_limit, /does not establish Sybil-resistant admission/);
  assert.equal(review.non_claims.human_uniqueness_proved, false);
  assert.equal(review.non_claims.legal_identity_proved, false);
  assert.equal(review.non_claims.legitimate_electorate_proved, false);
});

test('simulation-result threat model forbids promotion into effect authority', async () => {
  const review = await loadReview();
  const laundering = review.threats.find(threat => threat.id === 'simulation-result-laundering');
  assert.deepEqual(laundering.mitigations, [
    'finality-simulation-only',
    'no-circle-decision-created',
    'no-grid-event-created',
    'no-gateway-action-created',
    'no-runtime-authority-minted'
  ]);
  assert.equal(review.non_claims.collective_finality_proved, false);
  assert.equal(review.non_claims.runtime_authority_granted, false);
  assert.equal(review.non_claims.public_authority_granted, false);
  assert.equal(review.non_claims.consensus_enabled, false);
  assert.equal(review.non_claims.federation_enabled, false);
});

test('simulation threat review keeps device lifecycle and runtime promotion explicitly blocked', async () => {
  const review = await loadReview();
  const blockers = new Set(review.promotion_blockers);
  for (const blocker of [
    'device-and-credential-lifecycle-integration',
    'charter-amendment-and-activation-lifecycle',
    'grid-backed-replay-safe-mutation-records',
    'explicit-separation-of-circle-decision-from-runtime-grant',
    'human-explanation-and-accessibility-evidence',
    'security-and-privacy-review-before-real-participant-pilot'
  ]) assert.ok(blockers.has(blocker), `missing promotion blocker ${blocker}`);
});

test('evidence reference and timestamps remain bounded observations, not truth or time attestations', async () => {
  const review = await loadReview();
  const evidence = review.threats.find(threat => threat.id === 'evidence-reference-laundering');
  const clock = review.threats.find(threat => threat.id === 'clock-and-timestamp-manipulation');
  assert.match(evidence.residual_limit, /does not prove.*authentic.*relevant.*true/);
  assert.match(clock.residual_limit, /does not independently attest the real-world time/);
  assert.equal(review.non_claims.content_truth_proved, false);
});
