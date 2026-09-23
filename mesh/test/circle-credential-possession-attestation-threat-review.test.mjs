import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const reviewUrl = new URL('../config/circle-credential-possession-attestation-threat-review.v0.json', import.meta.url);

const EXPECTED_THREATS = new Set([
  'wrong-or-substituted-private-key',
  'public-key-encoding-substitution',
  'expired-or-future-challenge',
  'request-substitution',
  'lifecycle-head-substitution',
  'revoked-suspended-expired-or-compromised-credential',
  'challenge-response-replay',
  'historical-possession-backdating',
  'possession-laundered-into-identity-or-role',
  'hypervisor-key-substitution'
]);

const EXPECTED_NON_CLAIMS = new Set([
  'human-identity',
  'legal-identity',
  'authorized-human-custody',
  'credential-issuance-authority',
  'membership-authority',
  'role-authority',
  'governance-legitimacy',
  'trusted-global-time',
  'historical-possession-before-hypervisor-observation',
  'challenge-single-use-persistence',
  'runtime-authorization',
  'portable-authority',
  'external-effect-authority',
  'distributed-consensus'
]);

const EXPECTED_BLOCKERS = new Set([
  'bind-possession-attestation-into-atomic-circle-admission-capability',
  'bind-attestation-lifecycle-head-to-same-grid-commit-cas',
  'define-durable-challenge-consumption-if-single-use-is-required',
  'define-member-client-key-custody-and-signing-interface-without-secret-export',
  'define-recovery-and-compromise-response-for-possession-keys',
  'member-facing-explanation-that-possession-is-not-identity-or-role-authority',
  'independent-security-privacy-device-loss-coercion-and-recovery-review'
]);

async function loadReview() {
  return JSON.parse(await readFile(reviewUrl, 'utf8'));
}

function exactSet(values, expected) {
  return Array.isArray(values)
    && values.length === expected.size
    && new Set(values).size === expected.size
    && [...expected].every(value => values.includes(value));
}

test('Circle credential possession threat review is inert and exact-scope', async () => {
  const review = await loadReview();
  assert.equal(review.schema, 'axiom-circle-credential-possession-attestation-threat-review.v0');
  assert.equal(review.version, 0);
  assert.equal(review.status, 'inert-possession-attestation-threat-review');
  assert.equal(review.runtime_activation, false);
  assert.equal(review.authority_effect, 'none');
  assert.equal(review.network_effect, 'none');
  assert.equal(exactSet(review.threats.map(item => item.threat), EXPECTED_THREATS), true);
  assert.equal(exactSet(review.non_claims, EXPECTED_NON_CLAIMS), true);
  assert.equal(exactSet(review.promotion_blockers, EXPECTED_BLOCKERS), true);
});

test('every possession threat has multiple mitigations and an explicit residual limitation', async () => {
  const review = await loadReview();
  for (const threat of review.threats) {
    assert.ok(Array.isArray(threat.mitigations));
    assert.ok(threat.mitigations.length >= 2, `${threat.threat} must retain multiple mitigations`);
    assert.equal(typeof threat.residual_limitation, 'string');
    assert.ok(threat.residual_limitation.length >= 40, `${threat.threat} residual limitation is too weak`);
  }
});

test('review preserves possession-only semantics and names replay/integration blockers', async () => {
  const review = await loadReview();
  const replay = review.threats.find(item => item.threat === 'challenge-response-replay');
  assert.match(replay.residual_limitation, /single-use consumption is not durably persisted/i);

  const backdating = review.threats.find(item => item.threat === 'historical-possession-backdating');
  assert.match(backdating.residual_limitation, /cannot prove the signer possessed the key before that observation/i);

  const laundering = review.threats.find(item => item.threat === 'possession-laundered-into-identity-or-role');
  assert.ok(laundering.mitigations.includes('attestation-human-identity-false'));
  assert.ok(laundering.mitigations.includes('attestation-role-authority-false'));

  assert.ok(review.promotion_blockers.includes('bind-possession-attestation-into-atomic-circle-admission-capability'));
  assert.ok(review.promotion_blockers.includes('bind-attestation-lifecycle-head-to-same-grid-commit-cas'));
});
