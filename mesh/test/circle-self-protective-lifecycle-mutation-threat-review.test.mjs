import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const url = new URL('../config/circle-self-protective-lifecycle-mutation-threat-review.v0.json', import.meta.url);
const EXPECTED_THREATS = [
  'self-service-principal-impersonation',
  'stale-pre-mutation-state',
  'bundled-hidden-mutation',
  'authority-restoration-laundering',
  'credential-issuance-or-rotation-laundering',
  'self-revocation-race',
  'device-compromise-denial-of-service',
  'administrative-or-third-party-revocation-laundering',
  'cross-circle-or-cross-membership-substitution',
  'wall-clock-manipulation',
  'authorization-as-execution-laundering'
];
const EXPECTED_NON_CLAIMS = [
  'human-identity',
  'legal-identity',
  'authorized-human-custody',
  'credential-issuance-authority',
  'credential-rotation-authority',
  'credential-resume-authority',
  'membership-resume-authority',
  'membership-revocation-authority',
  'role-grant-authority',
  'recovery-admission-authority',
  'administrative-authority',
  'governance-legitimacy',
  'coercion-free-participation',
  'trusted-global-time',
  'grid-commit-authority',
  'runtime-authority',
  'portable-authority',
  'external-effect-authority',
  'distributed-consensus'
];
const EXPECTED_BLOCKERS = [
  'compose-self-protective-authorization-with-atomic-grid-lifecycle-head-cas',
  'ensure-possession-bound-self-protective-path-is-the-sole-service-level-contraction-route',
  'separate-recovery-and-new-credential-issuance-admission',
  'separate-administrative-revocation-and-due-process-semantics',
  'member-side-key-custody-and-signing-without-secret-export',
  'gateway-hypervisor-grid-route-design-preserving-existing-authority-boundary',
  'accessible-member-facing-contraction-confirmation-denial-and-recovery-explanations',
  'independent-security-privacy-device-loss-coercion-sybil-recovery-governance-review'
];

test('self-protective lifecycle mutation threat review preserves exact threats, non-claims, and promotion blockers', async () => {
  const review = JSON.parse(await readFile(url, 'utf8'));
  assert.equal(review.schema, 'axiom-circle-self-protective-lifecycle-mutation-threat-review.v0');
  assert.equal(review.version, 0);
  assert.equal(review.status, 'inert-self-protective-lifecycle-mutation-threat-review');
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

test('threat review keeps restoration, administrative revocation, and recovery outside self-protective authority', async () => {
  const review = JSON.parse(await readFile(url, 'utf8'));
  const restoration = review.threats.find(item => item.threat === 'authority-restoration-laundering');
  assert.match(restoration.mitigations.join(' '), /credential-resume-denied/);
  assert.match(restoration.residual_limitation, /separate admission semantics/);
  const administrative = review.threats.find(item => item.threat === 'administrative-or-third-party-revocation-laundering');
  assert.match(administrative.mitigations.join(' '), /membership-revoke-excluded/);
  assert.match(administrative.residual_limitation, /due-process/);
  const issuance = review.threats.find(item => item.threat === 'credential-issuance-or-rotation-laundering');
  assert.match(issuance.residual_limitation, /separate recovery path/);
});

test('threat review requires future commit to preserve Grid CAS rather than promoting the authorization assessment', async () => {
  const review = JSON.parse(await readFile(url, 'utf8'));
  const stale = review.threats.find(item => item.threat === 'stale-pre-mutation-state');
  assert.match(stale.residual_limitation, /compare-and-set at the commit boundary/);
  const execution = review.threats.find(item => item.threat === 'authorization-as-execution-laundering');
  assert.match(execution.mitigations.join(' '), /grid-commit-performed-false/);
  assert.match(execution.residual_limitation, /existing Grid lifecycle-head CAS/);
});
