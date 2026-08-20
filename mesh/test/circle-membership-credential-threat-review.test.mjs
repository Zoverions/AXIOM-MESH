import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const reviewUrl = new URL('../config/circle-membership-credential-threat-review.v0.json', import.meta.url);

async function loadReview() {
  return JSON.parse(await readFile(reviewUrl, 'utf8'));
}

const EXPECTED_THREATS = new Set([
  'stolen-device-or-private-key',
  'credential-key-reuse',
  'rotation-substitution-or-branching',
  'revocation-bypass',
  'compromised-device-reactivation',
  'recovery-takeover',
  'membership-exit-or-revocation-ambiguity',
  'role-or-authority-confusion',
  'secret-material-leakage',
  'clock-expiry-or-term-manipulation',
  'cross-circle-credential-confusion'
]);

test('Circle membership credential threat review is inert and exact-scope', async () => {
  const review = await loadReview();
  assert.equal(review.schema, 'axiom-circle-membership-credential-threat-review.v0');
  assert.equal(review.version, 0);
  assert.equal(review.status, 'inert-membership-credential-threat-review');
  assert.equal(review.runtime_activation, false);
  assert.equal(review.authority_effect, 'none');
  assert.equal(review.network_effect, 'none');
  assert.equal(review.scope, 'circle-member-device-and-public-credential-lifecycle-only');
  const ids = new Set(review.threats.map(threat => threat.id));
  assert.equal(ids.size, EXPECTED_THREATS.size);
  for (const id of EXPECTED_THREATS) assert.ok(ids.has(id), `missing threat ${id}`);
});

test('every credential lifecycle threat retains mitigations and a residual limit', async () => {
  const review = await loadReview();
  for (const threat of review.threats) {
    assert.ok(Array.isArray(threat.mitigations));
    assert.ok(threat.mitigations.length >= 2, `${threat.id} has insufficient mitigations`);
    assert.equal(new Set(threat.mitigations).size, threat.mitigations.length);
    assert.equal(typeof threat.residual_limit, 'string');
    assert.ok(threat.residual_limit.length >= 45, `${threat.id} residual limit is too weak`);
  }
});

test('credential possession never becomes identity, role, or runtime authority proof', async () => {
  const review = await loadReview();
  const confusion = review.threats.find(threat => threat.id === 'role-or-authority-confusion');
  assert.match(confusion.residual_limit, /authenticate a key.*cannot establish permission/);
  assert.equal(review.non_claims.key_possession_proves_human_identity, false);
  assert.equal(review.non_claims.key_possession_proves_legal_identity, false);
  assert.equal(review.non_claims.credential_grants_circle_role, false);
  assert.equal(review.non_claims.credential_grants_runtime_authority, false);
  assert.equal(review.non_claims.portable_authority_granted, false);
  assert.equal(review.non_claims.network_authentication_enabled, false);
});

test('recovery remains non-authorizing and requires future admission design', async () => {
  const review = await loadReview();
  const recovery = review.threats.find(threat => threat.id === 'recovery-takeover');
  assert.ok(recovery.mitigations.includes('recovery-proposal-grants-no-authority'));
  assert.ok(recovery.mitigations.includes('explicit-admission-required'));
  assert.match(recovery.residual_limit, /future recovery admission remain unimplemented/);
  assert.equal(review.non_claims.recovery_proposal_restores_membership, false);
  assert.ok(review.promotion_blockers.includes('recovery-admission-proof-and-human-review'));
});

test('revocation and compromised-device threats require current derived-state enforcement before runtime', async () => {
  const review = await loadReview();
  const revocation = review.threats.find(threat => threat.id === 'revocation-bypass');
  const compromise = review.threats.find(threat => threat.id === 'compromised-device-reactivation');
  assert.match(revocation.residual_limit, /future runtime must bind every authentication decision/);
  assert.ok(compromise.mitigations.includes('compromised-device-credentials-not-authentication-eligible'));
  assert.ok(review.promotion_blockers.includes('runtime-authentication-check-against-current-derived-state'));
  assert.ok(review.promotion_blockers.includes('grid-backed-replay-safe-device-and-credential-events'));
});

test('secret custody and real-world clock trust remain outside this inert contract', async () => {
  const review = await loadReview();
  const secrets = review.threats.find(threat => threat.id === 'secret-material-leakage');
  const clock = review.threats.find(threat => threat.id === 'clock-expiry-or-term-manipulation');
  assert.match(secrets.residual_limit, /private-key generation, storage, backup, hardware binding, and destruction/);
  assert.match(clock.residual_limit, /do not independently attest trusted real-world time/);
  assert.equal(review.non_claims.secure_hardware_custody_proved, false);
});
