import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const threatUrl = new URL('../config/circle-possession-bound-atomic-admission-threat-review.v0.json', import.meta.url);

const EXPECTED_THREATS = [
  'possession-proof-omission',
  'participant-proof-substitution',
  'cross-request-attestation-replay',
  'stale-lifecycle-possession-proof',
  'possession-after-authorization-before-commit-race',
  'attestation-set-tampering',
  'authorization-context-substitution',
  'parallel-credential-evidence-collapse',
  'historical-record-rewrite-after-credential-change',
  'parent-path-bypass',
  'bootstrap-possession-laundering',
  'grid-or-hypervisor-trust-root-substitution'
];
const EXPECTED_NON_CLAIMS = [
  'human-identity',
  'legal-identity',
  'authorized-human-custody',
  'authorized-lifecycle-mutation-service',
  'membership-resume-authority',
  'role-grant-authority',
  'credential-issuance-authority',
  'recovery-authority',
  'historical-backfill-authority',
  'challenge-single-use-persistence',
  'trusted-global-time',
  'governance-legitimacy',
  'coercion-free-participation',
  'legal-authority',
  'runtime-authority',
  'portable-authority',
  'external-effect-authority',
  'distributed-consensus'
];
const EXPECTED_BLOCKERS = [
  'durable-or-explicitly-idempotent-challenge-consumption-policy',
  'authorized-membership-and-credential-lifecycle-mutation-procedure',
  'member-side-key-custody-and-signing-without-secret-export',
  'recovery-compromise-and-key-loss-procedure',
  'possession-bound-successor-as-sole-service-level-circle-append-path',
  'gateway-hypervisor-grid-route-design-preserving-existing-authority-boundary',
  'accessible-member-facing-challenge-denial-and-recovery-explanations',
  'independent-security-privacy-device-loss-coercion-sybil-recovery-governance-review'
];

test('possession-bound atomic admission threat review preserves exact threat and promotion inventories', async () => {
  const review = JSON.parse(await readFile(threatUrl, 'utf8'));
  assert.equal(review.schema, 'axiom-circle-possession-bound-atomic-admission-threat-review.v0');
  assert.equal(review.version, 0);
  assert.equal(review.status, 'inert-possession-bound-atomic-admission-threat-review');
  assert.equal(review.runtime_activation, false);
  assert.equal(review.authority_effect, 'none');
  assert.equal(review.network_effect, 'none');
  assert.deepEqual(review.threats.map(item => item.threat), EXPECTED_THREATS);
  assert.deepEqual(review.non_claims, EXPECTED_NON_CLAIMS);
  assert.deepEqual(review.promotion_blockers, EXPECTED_BLOCKERS);
  for (const item of review.threats) {
    assert.ok(Array.isArray(item.mitigations) && item.mitigations.length >= 2);
    assert.equal(typeof item.residual_limitation, 'string');
    assert.ok(item.residual_limitation.length > 20);
  }
});

test('threat review keeps key possession distinct from human custody, governance legitimacy, and runtime authority', async () => {
  const review = JSON.parse(await readFile(threatUrl, 'utf8'));
  const nonClaims = new Set(review.non_claims);
  for (const required of [
    'human-identity',
    'authorized-human-custody',
    'authorized-lifecycle-mutation-service',
    'governance-legitimacy',
    'runtime-authority',
    'distributed-consensus'
  ]) assert.equal(nonClaims.has(required), true);

  const replay = review.threats.find(item => item.threat === 'cross-request-attestation-replay');
  assert.match(replay.residual_limitation, /same exact deterministic admission request/);
  const race = review.threats.find(item => item.threat === 'possession-after-authorization-before-commit-race');
  assert.match(race.mitigations.join(' '), /same-guard-atomic-cas/);
  const bypass = review.threats.find(item => item.threat === 'parent-path-bypass');
  assert.match(bypass.residual_limitation, /parent helper functions still exist/);
});
