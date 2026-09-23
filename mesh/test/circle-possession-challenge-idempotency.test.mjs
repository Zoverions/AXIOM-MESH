import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import { ensureMeshIdentity, issueCapability } from '../src/lib/identity.mjs';
import {
  assessCirclePossessionBoundGrantReissue,
  getCirclePossessionChallengeIdempotencyPolicy,
  validateCirclePossessionChallengeIdempotencyAssessment,
  validateCirclePossessionChallengeIdempotencyPolicy
} from '../src/grid/circle-possession-challenge-idempotency.mjs';
import { getCirclePossessionBoundAtomicAdmissionPolicy } from '../src/grid/circle-possession-bound-atomic-admission.mjs';

const D = label => digestObject({ schema: 'challenge-idempotency-test.v0', label });
const CIRCLE_ID = 'circle.challenge.idempotency';
const EVENT_ID = 'circle_persist_challenge_idempotency_event';
const ACTOR = 'human.challenge.idempotency';

async function identities(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-circle-challenge-idempotency-'));
  const hypervisor = await ensureMeshIdentity(dataDir, 'hypervisor', { create: true });
  const other = await ensureMeshIdentity(dataDir, 'gateway', { create: true });
  t.after(async () => rm(dataDir, { recursive: true, force: true }));
  return { hypervisor, other };
}

function constraints(overrides = {}) {
  const parent = getCirclePossessionBoundAtomicAdmissionPolicy();
  return {
    schema: parent.schemas.constraints,
    circle_id: CIRCLE_ID,
    event_id: EVENT_ID,
    binding_digest: D('binding'),
    expected_prior_circle_head_digest: D('prior-circle-head'),
    resulting_circle_head_digest: D('resulting-circle-head'),
    payload_digest: D('payload'),
    persistence_policy_digest: D('persistence-policy'),
    record_authorization_assessment_digest: D('authorization'),
    eligibility_evidence_digest: D('eligibility'),
    record_authorization_policy_digest: D('authorization-policy'),
    parent_lifecycle_cas_policy_digest: D('parent-cas-policy'),
    parent_lifecycle_cas_invocation_digest: D('parent-cas-invocation'),
    lifecycle_guard_set_digest: D('guard-set'),
    lifecycle_guard_count: 1,
    possession_policy_digest: D('possession-policy'),
    possession_request_digest: D('prepared-request'),
    possession_attestation_set_digest: D('attestation-set-a'),
    possession_attestation_count: 1,
    required_credential_count: 1,
    all_required_credential_possession_observed: true,
    atomic_lifecycle_cas: true,
    admission_scope: 'grid-persistence-with-lifecycle-authorization-atomic-head-cas-and-credential-possession',
    runtime_authority: false,
    portable_authority: false,
    external_effect_authority: false,
    ...overrides
  };
}

function claims({ nowSeconds, jti, constraintsValue = constraints(), overrides = {} }) {
  const parent = getCirclePossessionBoundAtomicAdmissionPolicy();
  return {
    iss: parent.issuer_service,
    aud: parent.audience,
    subject: ACTOR,
    jti,
    nbf: nowSeconds - 1,
    exp: nowSeconds + 30,
    intent_digest: D('intent'),
    plan_digest: D('plan'),
    policy_digest: D('upstream-policy'),
    invocation_digest: D(`invocation-${jti}`),
    tool: parent.tool,
    constraints: constraintsValue,
    ...overrides
  };
}

test('challenge idempotency policy is exact, inert, and restricted to same-request deterministic Circle admission', () => {
  const policy = getCirclePossessionChallengeIdempotencyPolicy();
  assert.equal(validateCirclePossessionChallengeIdempotencyPolicy(policy), true);
  assert.equal(policy.runtime_activation, false);
  assert.equal(policy.strategy, 'exact-request-effect-idempotency');
  assert.equal(policy.requirements.challenge_single_use_required_for_v0_state_safety, false);
  assert.equal(policy.requirements.challenge_reuse_scope, 'same-exact-prepared-request-only');
  assert.equal(policy.requirements.external_effects_may_inherit_policy, false);
  assert.equal(policy.requirements.non_deterministic_effects_may_inherit_policy, false);
  assert.equal(policy.requirements.generic_capabilities_may_inherit_policy, false);
  assert.equal(policy.requirements.durable_challenge_consumption_required, false);
});

test('two trusted Hypervisor grants for the same exact prepared request are classified as one deterministic state-transition scope', async t => {
  const { hypervisor } = await identities(t);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const firstClaims = claims({ nowSeconds, jti: 'challenge_reissue_first' });
  const secondClaims = claims({
    nowSeconds,
    jti: 'challenge_reissue_second',
    constraintsValue: constraints({ possession_attestation_set_digest: D('attestation-set-b') })
  });
  const firstCapability = issueCapability(hypervisor, firstClaims);
  const secondCapability = issueCapability(hypervisor, secondClaims);
  assert.notEqual(firstCapability, secondCapability);

  const assessment = assessCirclePossessionBoundGrantReissue({
    firstCapability,
    secondCapability,
    hypervisorPublicKey: hypervisor.publicKey,
    nowSeconds,
    maxTtlSeconds: 60
  });
  assert.equal(validateCirclePossessionChallengeIdempotencyAssessment(assessment), true);
  assert.equal(assessment.same_capability_bytes, false);
  assert.equal(assessment.same_exact_prepared_request, true);
  assert.equal(assessment.event_id, EVENT_ID);
  assert.equal(assessment.possession_request_digest, D('prepared-request'));
  assert.equal(assessment.retained_event_different_capability_replay, 'reject-trace-mismatch');
  assert.equal(assessment.uncommitted_first_grant_blocks_second_same_request_grant, false);
  assert.equal(assessment.durable_challenge_consumption_required_for_v0_state_safety, false);
});

test('exact same capability replay remains inside the historical idempotent scope', async t => {
  const { hypervisor } = await identities(t);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const capability = issueCapability(hypervisor, claims({ nowSeconds, jti: 'challenge_exact_replay' }));
  const assessment = assessCirclePossessionBoundGrantReissue({
    firstCapability: capability,
    secondCapability: capability,
    hypervisorPublicKey: hypervisor.publicKey,
    nowSeconds
  });
  assert.equal(assessment.same_capability_bytes, true);
  assert.equal(assessment.retained_event_same_capability_replay, 'idempotent-historical-replay');
});

test('challenge reuse assessment rejects prepared-request, lifecycle-guard, event, and upstream request drift', async t => {
  const { hypervisor } = await identities(t);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const first = issueCapability(hypervisor, claims({ nowSeconds, jti: 'challenge_scope_first' }));

  const variants = [
    claims({
      nowSeconds,
      jti: 'challenge_scope_request',
      constraintsValue: constraints({ possession_request_digest: D('other-request') })
    }),
    claims({
      nowSeconds,
      jti: 'challenge_scope_guard',
      constraintsValue: constraints({ lifecycle_guard_set_digest: D('other-guard') })
    }),
    claims({
      nowSeconds,
      jti: 'challenge_scope_event',
      constraintsValue: constraints({ event_id: 'circle_persist_other_event' })
    }),
    claims({
      nowSeconds,
      jti: 'challenge_scope_intent',
      overrides: { intent_digest: D('other-intent') }
    })
  ];

  for (const variant of variants) {
    const second = issueCapability(hypervisor, variant);
    assert.throws(
      () => assessCirclePossessionBoundGrantReissue({
        firstCapability: first,
        secondCapability: second,
        hypervisorPublicKey: hypervisor.publicKey,
        nowSeconds
      }),
      error => error?.code === 'circle_challenge_reuse_scope_mismatch' && error.status === 409
    );
  }
});

test('challenge reuse assessment rejects wrong trust root and expired grants', async t => {
  const { hypervisor, other } = await identities(t);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const first = issueCapability(hypervisor, claims({ nowSeconds, jti: 'challenge_trust_first' }));
  const second = issueCapability(hypervisor, claims({ nowSeconds, jti: 'challenge_trust_second' }));

  assert.throws(
    () => assessCirclePossessionBoundGrantReissue({
      firstCapability: first,
      secondCapability: second,
      hypervisorPublicKey: other.publicKey,
      nowSeconds
    }),
    error => error?.code === 'invalid_capability_signature'
  );

  const expiredClaims = claims({ nowSeconds, jti: 'challenge_expired' });
  expiredClaims.nbf = nowSeconds - 40;
  expiredClaims.exp = nowSeconds - 1;
  const expired = issueCapability(hypervisor, expiredClaims);
  assert.throws(
    () => assessCirclePossessionBoundGrantReissue({
      firstCapability: first,
      secondCapability: expired,
      hypervisorPublicKey: hypervisor.publicKey,
      nowSeconds
    }),
    error => error?.code === 'expired_capability'
  );
});
