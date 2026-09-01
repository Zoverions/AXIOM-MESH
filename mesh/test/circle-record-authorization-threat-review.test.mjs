import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const REVIEW_URL = new URL('../config/circle-record-authorization-threat-review.v0.json', import.meta.url);
const POLICY_URL = new URL('../config/circle-record-authorization.v0.json', import.meta.url);
const SOURCE_URL = new URL('../../packages/axiom-circle-record-authorization/index.mjs', import.meta.url);

const EXPECTED_THREATS = new Set([
  'bootstrap-founder-persistence',
  'current-snapshot-role-laundering',
  'missing-membership-history',
  'duplicate-membership-or-principal-vote',
  'incomplete-decision-receipt-set',
  'forged-participant-attestation',
  'submitter-decider-confusion',
  'cross-decision-or-cross-proposal-replay',
  'electorate-drift-after-proposal',
  'quorum-or-approval-laundering',
  'withdrawal-authority-invention',
  'sybil-electorate',
  'coercion-or-compromised-principal',
  'clock-and-window-manipulation',
  'authorization-admission-disconnect'
]);

const EXPECTED_NON_CLAIMS = new Set([
  'human-identity',
  'legal-identity',
  'creator-legitimacy',
  'governance-legitimacy',
  'historical-membership-lifecycle-completeness',
  'coercion-free-participation',
  'independent-human-count',
  'truth-of-evidence',
  'legal-authority',
  'execution-authority',
  'portable-authority',
  'external-effect-authority',
  'distributed-consensus'
]);

test('Circle record authorization threat review is exact-scope and inert', async () => {
  const review = JSON.parse(await readFile(REVIEW_URL, 'utf8'));
  assert.equal(review.schema, 'axiom-circle-record-authorization-threat-review.v0');
  assert.equal(review.version, 0);
  assert.equal(review.status, 'inert-record-authorization-threat-review');
  assert.equal(review.runtime_activation, false);
  assert.equal(review.authority_effect, 'none');
  assert.equal(review.network_effect, 'none');
  assert.deepEqual(new Set(review.threats.map(item => item.id)), EXPECTED_THREATS);
  assert.equal(review.threats.length, EXPECTED_THREATS.size);
  assert.deepEqual(new Set(review.non_claims), EXPECTED_NON_CLAIMS);
  assert.equal(review.non_claims.length, EXPECTED_NON_CLAIMS.size);
  for (const threat of review.threats) {
    assert.equal(typeof threat.control, 'string');
    assert.ok(threat.control.length > 40);
    assert.equal(typeof threat.residual, 'string');
    assert.ok(threat.residual.length > 40);
  }
});

test('promotion blockers preserve lifecycle, admission, bootstrap, withdrawal, human, and review boundaries', async () => {
  const review = JSON.parse(await readFile(REVIEW_URL, 'utf8'));
  assert.equal(review.promotion_blockers.length, 10);
  const blockers = review.promotion_blockers.join('\n').toLowerCase();
  for (const required of [
    'membership status, role, device, credential, compromise, revocation, and recovery lifecycle',
    'authenticated axiom principal',
    'authorization assessment digest',
    'sole service-level circle append path',
    'creation and bootstrap activation governance',
    'authenticated per-principal service requests',
    'electorate changes during an open proposal',
    'withdrawal authority',
    'human-readable authorization explanations',
    'security, privacy, coercion, sybil, capture, and governance review'
  ]) assert.ok(blockers.includes(required), `missing promotion blocker: ${required}`);
});

test('policy and source preserve bootstrap confinement, complete collective proof, exact signatures, and no runtime authority', async () => {
  const [policy, source] = await Promise.all([
    readFile(POLICY_URL, 'utf8').then(JSON.parse),
    readFile(SOURCE_URL, 'utf8')
  ]);
  assert.equal(policy.requirements.creator_bootstrap_limited_to_first_invitation, true);
  assert.equal(policy.requirements.creator_bootstrap_persists_as_founder_authority, false);
  assert.equal(policy.requirements.role_authorizing_membership_historical_binding_required, true);
  assert.equal(policy.requirements.decision_submitter_has_collective_authority, false);
  assert.equal(policy.requirements.participant_signature_envelope_exact, true);
  assert.equal(policy.requirements.decision_requires_complete_electorate_attestation_set, true);
  assert.equal(policy.requirements.withdrawn_decision_outcome_supported, false);

  for (const required of [
    'creator-bootstrap-first-invitation',
    'historically bound active unexited membership',
    'one authenticated attestation from every eligible voter',
    'validateParticipationSignatureEnvelope',
    "signature.key_id !== expectedKeyId",
    'participant-aggregator',
    'review-member-aggregator',
    'submitter_collective_authority: false',
    'runtime_authority: false',
    'portable_authority: false',
    'external_effect_authority: false'
  ]) assert.ok(source.includes(required), `missing authorization boundary: ${required}`);

  assert.doesNotMatch(source, /submitter_collective_authority:\s*true/);
  assert.doesNotMatch(source, /runtime_authority:\s*true/);
  assert.doesNotMatch(source, /portable_authority:\s*true/);
  assert.doesNotMatch(source, /external_effect_authority:\s*true/);
});
