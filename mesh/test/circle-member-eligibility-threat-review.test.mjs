import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const reviewUrl = new URL('../config/circle-member-eligibility-threat-review.v0.json', import.meta.url);
const policyUrl = new URL('../config/circle-member-eligibility-lifecycle.v0.json', import.meta.url);
const sourceUrl = new URL('../../packages/axiom-circle-member-eligibility/index.mjs', import.meta.url);

const THREATS = new Set([
  'mutable-current-membership-snapshot',
  'role-widening-by-lifecycle-record',
  'membership-resume-as-authority-restoration',
  'terminal-state-rewrite',
  'historical-role-time-confusion',
  'credential-currentness-laundering',
  'credential-possession-overclaim',
  'principal-membership-cross-binding',
  'compromised-device-reuse',
  'stale-eligibility-proof',
  'authorization-admission-split',
  'sybil-or-coercion-confusion'
]);
const NON_CLAIMS = new Set([
  'human-identity',
  'legal-identity',
  'credential-possession',
  'credential-issuance-authority',
  'role-grant-authority',
  'membership-resume-authority',
  'governance-legitimacy',
  'coercion-free-participation',
  'trusted-wall-clock',
  'runtime-authority',
  'portable-authority',
  'external-effect-authority'
]);

test('member eligibility threat review is exact-scope and inert', async () => {
  const review = JSON.parse(await readFile(reviewUrl, 'utf8'));
  assert.equal(review.schema, 'axiom-circle-member-eligibility-threat-review.v0');
  assert.equal(review.status, 'inert-member-eligibility-threat-review');
  assert.equal(review.runtime_activation, false);
  assert.equal(review.authority_effect, 'none');
  assert.equal(review.network_effect, 'none');
  assert.deepEqual(new Set(review.threats.map(item => item.id)), THREATS);
  assert.equal(review.threats.length, THREATS.size);
  assert.deepEqual(new Set(review.non_claims), NON_CLAIMS);
  assert.equal(review.non_claims.length, NON_CLAIMS.size);
  for (const threat of review.threats) {
    assert.ok(threat.control.length > 40);
    assert.ok(threat.residual.length > 40);
  }
});

test('promotion blockers retain every runtime-widening boundary', async () => {
  const review = JSON.parse(await readFile(reviewUrl, 'utf8'));
  assert.equal(review.promotion_blockers.length, 10);
  const text = review.promotion_blockers.join('\n').toLowerCase();
  for (const required of [
    'role-grant and membership-resume',
    'credential issuance',
    'proof of possession',
    'record authorization',
    'member-eligibility assessment and record-authorization assessment',
    'only service-level circle append path',
    'replay-safe circle grid path',
    'already-open proposal',
    'accessible member-facing explanations',
    'security, privacy, coercion, sybil, recovery, capture, and governance review'
  ]) assert.ok(text.includes(required), `missing promotion blocker: ${required}`);
});

test('policy and implementation keep widening and runtime authority disabled', async () => {
  const [policy, source] = await Promise.all([
    readFile(policyUrl, 'utf8').then(JSON.parse),
    readFile(sourceUrl, 'utf8')
  ]);
  assert.equal(policy.requirements.membership_resume_supported, false);
  assert.equal(policy.requirements.role_widening_supported, false);
  assert.equal(policy.requirements.role_narrowing_only, true);
  assert.equal(policy.requirements.caller_authenticated_principal_is_external_assurance, true);
  assert.equal(policy.output.runtime_authority, false);
  assert.equal(policy.output.external_effect_authority, false);

  for (const required of [
    'Circle role narrowing cannot add or substitute roles',
    'Circle member eligibility terminal state is irreversible',
    'credential_possession_verified: false',
    'caller_authentication_assurance_external: true',
    'runtime_authority: false',
    'portable_authority: false',
    'external_effect_authority: false'
  ]) assert.ok(source.includes(required), `missing eligibility boundary: ${required}`);

  assert.doesNotMatch(source, /runtime_authority:\s*true/);
  assert.doesNotMatch(source, /portable_authority:\s*true/);
  assert.doesNotMatch(source, /external_effect_authority:\s*true/);
});
