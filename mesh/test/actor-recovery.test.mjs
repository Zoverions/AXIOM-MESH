import assert from 'node:assert/strict';
import test from 'node:test';

import { sha256 } from '../src/lib/canonical.mjs';
import {
  ACTOR_STATE_SCHEMA,
  CREDENTIAL_EPOCH_SCHEMA
} from '../src/identity/actor-state.mjs';
import {
  RECOVERY_ATTESTATION_SCHEMA,
  RECOVERY_POLICY_SCHEMA,
  completeRecovery,
  evaluateRecovery,
  normalizeRecoveryPolicy
} from '../src/identity/actor-recovery.mjs';

const T0 = '2026-08-11T13:00:00.000Z';
const T1 = '2026-08-11T13:10:00.000Z';
const T2 = '2026-08-11T13:20:00.000Z';
const T3 = '2026-08-11T14:00:00.000Z';

function actor() {
  return {
    schema: ACTOR_STATE_SCHEMA,
    actor_id: 'actor-alice',
    actor_type: 'human',
    lifecycle_state: 'recovery_pending',
    credential_epochs: [{
      schema: CREDENTIAL_EPOCH_SCHEMA,
      actor_id: 'actor-alice',
      epoch_id: 'credential-1',
      sequence: 1,
      state: 'active',
      crypto_profile_id: 'classical-ed25519-v1',
      activated_at: T0,
      ended_at: null,
      predecessor_epoch_id: null
    }],
    active_epoch_id: 'credential-1',
    state_compartments: ['identity', 'private_memory', 'recovery'],
    continuity_predecessor_actor_id: null,
    succession_directive_digest: null
  };
}

function policy(overrides = {}) {
  return {
    schema: RECOVERY_POLICY_SCHEMA,
    policy_id: 'recovery-policy-alice-v1',
    subject_actor_id: 'actor-alice',
    factor_profiles: [
      {
        factor_id: 'factor-hardware',
        factor_type: 'hardware_key',
        factor_class: 'possession',
        attestor_actor_id: null,
        minimum_assurance: 'A3',
        effective_at: T0,
        expires_at: null,
        status: 'active'
      },
      {
        factor_id: 'factor-sibling',
        factor_type: 'trusted_human',
        factor_class: 'human',
        attestor_actor_id: 'actor-sibling',
        minimum_assurance: 'A3',
        effective_at: T0,
        expires_at: null,
        status: 'active'
      },
      {
        factor_id: 'factor-government',
        factor_type: 'government_identity_attestation',
        factor_class: 'institution',
        attestor_actor_id: 'institution-id-verifier',
        minimum_assurance: 'A3',
        effective_at: T0,
        expires_at: null,
        status: 'active'
      }
    ],
    threshold: 2,
    required_factor_classes: ['possession', 'human'],
    minimum_decision_assurance: 'A3',
    effective_at: T0,
    expires_at: null,
    status: 'active',
    ordinary_authority_granted: false,
    ...overrides
  };
}

function attestation(factorId, overrides = {}) {
  const profiles = Object.fromEntries(policy().factor_profiles.map(item => [item.factor_id, item]));
  const factor = profiles[factorId];
  return {
    schema: RECOVERY_ATTESTATION_SCHEMA,
    recovery_case_id: 'recovery-case-1',
    subject_actor_id: 'actor-alice',
    factor_id: factor.factor_id,
    factor_type: factor.factor_type,
    factor_class: factor.factor_class,
    attestor_actor_id: factor.attestor_actor_id,
    evidence_digest: sha256(`evidence:${factorId}`),
    assurance: 'A3',
    verdict: 'pass',
    observed_at: T1,
    expires_at: T3,
    ...overrides
  };
}

test('2-of-3 recovery with required independent factor classes approves continuity only', () => {
  const decision = evaluateRecovery(policy(), [
    attestation('factor-hardware'),
    attestation('factor-sibling')
  ], {
    recoveryCaseId: 'recovery-case-1',
    subjectActorId: 'actor-alice',
    now: T2
  });
  assert.equal(decision.approved, true);
  assert.equal(decision.ordinary_authority_granted, false);
  assert.deepEqual(decision.accepted_factor_ids, ['factor-hardware', 'factor-sibling']);
  assert.equal(decision.achieved_assurance, 'A3');
});

test('threshold alone is insufficient when required factor classes are absent', () => {
  const relaxed = policy({ threshold: 2, required_factor_classes: ['possession', 'human'] });
  const decision = evaluateRecovery(relaxed, [
    attestation('factor-hardware'),
    attestation('factor-government')
  ], {
    recoveryCaseId: 'recovery-case-1',
    subjectActorId: 'actor-alice',
    now: T2
  });
  assert.equal(decision.approved, false);
  assert.equal(decision.ordinary_authority_granted, false);
});

test('wrong attestor, stale evidence, failed factor, and foreign factor do not count', () => {
  const decision = evaluateRecovery(policy(), [
    attestation('factor-sibling', { attestor_actor_id: 'actor-mallory' }),
    attestation('factor-hardware', { expires_at: T1 }),
    attestation('factor-government', { verdict: 'fail' })
  ], {
    recoveryCaseId: 'recovery-case-1',
    subjectActorId: 'actor-alice',
    now: T2
  });
  assert.equal(decision.approved, false);
  assert.equal(decision.accepted_factor_ids.length, 0);
  assert.equal(decision.rejected.length, 3);
});

test('recovery policy cannot smuggle ordinary authority', () => {
  assert.throws(
    () => normalizeRecoveryPolicy(policy({ ordinary_authority_granted: true })),
    /cannot grant ordinary authority/
  );
});

test('approved recovery rotates credentials while preserving actor identity and private compartments', () => {
  const decision = evaluateRecovery(policy(), [
    attestation('factor-hardware'),
    attestation('factor-sibling')
  ], {
    recoveryCaseId: 'recovery-case-1',
    subjectActorId: 'actor-alice',
    now: T2
  });
  const completion = completeRecovery({
    actorState: actor(),
    decision,
    nextCredentialEpoch: {
      schema: CREDENTIAL_EPOCH_SCHEMA,
      actor_id: 'actor-alice',
      epoch_id: 'credential-2',
      sequence: 2,
      state: 'active',
      crypto_profile_id: 'agile-signature-profile-v1',
      activated_at: T2,
      ended_at: null,
      predecessor_epoch_id: 'credential-1'
    },
    completedAt: T2
  });
  assert.equal(completion.subject_actor_id, 'actor-alice');
  assert.equal(completion.prior_credential_epoch_id, 'credential-1');
  assert.equal(completion.new_credential_epoch_id, 'credential-2');
  assert.equal(completion.ordinary_authority_granted, false);
  assert.equal(completion.actor_state.actor_id, 'actor-alice');
  assert.equal(completion.actor_state.lifecycle_state, 'recovered');
  assert.deepEqual(completion.actor_state.state_compartments, ['identity', 'private_memory', 'recovery']);
  assert.equal(completion.actor_state.credential_epochs[0].state, 'retired');
});

test('unapproved recovery cannot rotate credentials', () => {
  const decision = evaluateRecovery(policy(), [attestation('factor-hardware')], {
    recoveryCaseId: 'recovery-case-1',
    subjectActorId: 'actor-alice',
    now: T2
  });
  assert.equal(decision.approved, false);
  assert.throws(() => completeRecovery({
    actorState: actor(),
    decision,
    nextCredentialEpoch: {
      schema: CREDENTIAL_EPOCH_SCHEMA,
      actor_id: 'actor-alice',
      epoch_id: 'credential-2',
      sequence: 2,
      state: 'active',
      crypto_profile_id: 'agile-signature-profile-v1',
      activated_at: T2,
      ended_at: null,
      predecessor_epoch_id: 'credential-1'
    },
    completedAt: T2
  }), /approved recovery decision/);
});
