import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const threatUrl = new URL('../config/circle-possession-challenge-idempotency-threat-review.v0.json', import.meta.url);

const EXPECTED_THREATS = [
  'cross-request-challenge-reuse',
  'lifecycle-head-drift-under-reuse',
  'duplicate-state-transition',
  'reissued-capability-byte-drift',
  'stale-challenge-reuse',
  'audit-noise-from-repeated-observation',
  'same-request-first-grant-loss',
  'external-effect-policy-laundering',
  'human-or-authority-laundering',
  'trusted-hypervisor-compromise'
];
const EXPECTED_NON_CLAIMS = [
  'global-replay-protection',
  'challenge-single-use',
  'cross-request-replay-safety',
  'non-deterministic-effect-idempotency',
  'external-effect-idempotency',
  'human-identity',
  'legal-identity',
  'authorized-human-custody',
  'lifecycle-mutation-authority',
  'governance-legitimacy',
  'trusted-global-time',
  'runtime-authority',
  'portable-authority',
  'external-effect-authority',
  'distributed-consensus'
];
const EXPECTED_BLOCKERS = [
  'authorized-membership-and-credential-lifecycle-mutation-procedure',
  'member-side-key-custody-and-signing-without-secret-export',
  'recovery-compromise-and-key-loss-procedure',
  'possession-bound-successor-as-sole-service-level-circle-append-path',
  'gateway-hypervisor-grid-route-design-preserving-existing-authority-boundary',
  'operator-audit-policy-for-repeated-challenge-observation',
  'accessible-member-facing-challenge-denial-retry-and-recovery-explanations',
  'independent-security-privacy-device-loss-coercion-sybil-recovery-governance-review'
];

test('challenge idempotency threat review preserves exact threat, non-claim, and promotion inventories', async () => {
  const review = JSON.parse(await readFile(threatUrl, 'utf8'));
  assert.equal(review.schema, 'axiom-circle-possession-challenge-idempotency-threat-review.v0');
  assert.equal(review.version, 0);
  assert.equal(review.status, 'inert-exact-request-idempotency-threat-review');
  assert.equal(review.runtime_activation, false);
  assert.equal(review.authority_effect, 'none');
  assert.equal(review.network_effect, 'none');
  assert.deepEqual(review.threats.map(item => item.threat), EXPECTED_THREATS);
  assert.deepEqual(review.non_claims, EXPECTED_NON_CLAIMS);
  assert.deepEqual(review.promotion_blockers, EXPECTED_BLOCKERS);
  for (const threat of review.threats) {
    assert.ok(Array.isArray(threat.mitigations) && threat.mitigations.length >= 2);
    assert.equal(typeof threat.residual_limitation, 'string');
    assert.ok(threat.residual_limitation.length > 30);
  }
});

test('threat review forbids exporting same-request idempotency to arbitrary effects', async () => {
  const review = JSON.parse(await readFile(threatUrl, 'utf8'));
  const external = review.threats.find(item => item.threat === 'external-effect-policy-laundering');
  assert.match(external.mitigations.join(' '), /external-effects-may-not-inherit-policy/);
  assert.match(external.residual_limitation, /own idempotency key/);
  const duplicate = review.threats.find(item => item.threat === 'duplicate-state-transition');
  assert.match(duplicate.residual_limitation, /specific to the deterministic Circle persistence event path/);
  const stale = review.threats.find(item => item.threat === 'stale-challenge-reuse');
  assert.match(stale.residual_limitation, /No durable consumed-challenge ledger/);
});
