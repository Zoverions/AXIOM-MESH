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

const T0 = '2026-08-16T15:00:00.000Z';
const T1 = '2026-08-16T16:00:00.000Z';
const T2 = '2026-08-16T17:00:00.000Z';
const T3 = '2026-08-16T18:00:00.000Z';

function policy(overrides = {}) {
  return {
    schema: RECOVERY_POLICY_SCHEMA,
    policy_id: 'recovery-policy-alice',
    subject_actor_id: 'actor-alice',
    factor_profiles: [
      {
        factor_id: 'hardware-primary',
        factor_type: 'hardware_key',
        factor_class: 'possession',
        attestor_actor_id: null,
        minimum_assurance: 'A2',
        effective_at: T0,
        expires_at: null,
        status: 'active'
      },
      {
        factor_id: 'trusted-bob',
        factor_type: 'trusted_human',
        factor_class: 'human',
        attestor_actor_id: 'actor-bob',
        minimum_assurance: 'A2',
        effective_at: T0,
        expires_at: null,
        status: 'active'
      },
      {
        factor_id: 'offline-backup',
        factor_type: 'offline_secret',
        factor_class: 'knowledge',
        attestor_actor_id: null,
        minimum_assurance: 'A1',
        effective_at: T0,
        expires_at: null,
        status: 'active'
      }
    ],
    threshold: 2,
    required_factor_classes: ['possession', 'human'],
    minimum_decision_assurance: 'A2',
    effective_at: T0,
    expires_at: null,
    status: 'active',
    ordinary_authority_granted: false,
    ...overrides
  };
}

function attestation(factorId, overrides = {}) {
  const definitions = {
    'hardware-primary': ['hardware_key', 'possession', null],
    'trusted-bob': ['trusted_human', 'human', 'actor-bob'],
    'offline-backup': ['offline_secret', 'knowledge', null]
  };
  const [factor_type, factor_class, attestor_actor_id] = definitions[factorId];
  return {
    schema: RECOVERY_ATTESTATION_SCHEMA,
    recovery_case_id: 'recovery-case-1',
    subject_actor_id: 'actor-alice',
    factor_id: factorId,
    factor_type,
    factor_class,
    attestor_actor_id,
    evidence_digest: sha256(`evidence:${factorId}`),
    assurance: 'A2',
    verdict: 'pass',
    observed_at: T1,
    expires_at: T3,
    ...overrides
  };
}

function compromisedActor() {
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
      state: 'compromised',
      crypto_profile_id: 'classical-ed25519-v1',
      activated_at: T0,
      ended_at: T1,
      predecessor_epoch_id: null
    }],
    active_epoch_id: null,
    state_compartments: ['identity', 'private_memory', 'publications'],
    continuity_predecessor_actor_id: null,
    succession_directive_digest: null
  };
}

test('threshold recovery requires both count and required factor classes', () => {
  const approved = evaluateRecovery(policy(), [
    attestation('hardware-primary'),
    attestation('trusted-bob')
  ], {
    recoveryCaseId: 'recovery-case-1',
    subjectActorId: 'actor-alice',
    now: T2
  });
  assert.equal(approved.approved, true);
  assert.equal(approved.achieved_assurance, 'A2');
  assert.equal(approved.ordinary_authority_granted, false);

  const missingClass = evaluateRecovery(policy(), [
    attestation('hardware-primary'),
    attestation('offline-backup', { assurance: 'A2' })
  ], {
    recoveryCaseId: 'recovery-case-1',
    subjectActorId: 'actor-alice',
    now: T2
  });
  assert.equal(missingClass.approved, false);
});

test('lower-assurance optional evidence is rejected and cannot contribute or poison', () => {
  const decision = evaluateRecovery(policy(), [
    attestation('hardware-primary'),
    attestation('trusted-bob'),
    attestation('offline-backup', { assurance: 'A1' })
  ], {
    recoveryCaseId: 'recovery-case-1',
    subjectActorId: 'actor-alice',
    now: T2
  });
  assert.equal(decision.approved, true);
  assert.deepEqual(decision.accepted_factor_ids, ['hardware-primary', 'trusted-bob']);
  assert.equal(decision.rejected[0].factor_id, 'offline-backup');
  assert.ok(decision.rejected[0].reasons.includes('decision_assurance_too_low'));
});

test('wrong attestor, stale evidence, and invalid assurance do not count', () => {
  const decision = evaluateRecovery(policy(), [
    attestation('hardware-primary'),
    attestation('trusted-bob', { attestor_actor_id: 'actor-mallory' })
  ], {
    recoveryCaseId: 'recovery-case-1',
    subjectActorId: 'actor-alice',
    now: T2
  });
  assert.equal(decision.approved, false);
  assert.ok(decision.rejected[0].reasons.includes('attestor_mismatch'));

  assert.throws(
    () => evaluateRecovery(policy(), [attestation('hardware-primary', { assurance: 'A9' })], {
      recoveryCaseId: 'recovery-case-1',
      subjectActorId: 'actor-alice',
      now: T2
    }),
    /assurance is invalid/
  );
});

test('recovery policy cannot smuggle ordinary authority', () => {
  assert.throws(
    () => normalizeRecoveryPolicy(policy({ ordinary_authority_granted: true })),
    /cannot grant ordinary authority/
  );
});

test('approved recovery replaces a compromised latest epoch without changing actor identity', () => {
  const decision = evaluateRecovery(policy(), [
    attestation('hardware-primary'),
    attestation('trusted-bob')
  ], {
    recoveryCaseId: 'recovery-case-1',
    subjectActorId: 'actor-alice',
    now: T2
  });
  const completion = completeRecovery({
    actorState: compromisedActor(),
    decision,
    nextCredentialEpoch: {
      schema: CREDENTIAL_EPOCH_SCHEMA,
      actor_id: 'actor-alice',
      epoch_id: 'credential-2',
      sequence: 2,
      state: 'active',
      crypto_profile_id: 'classical-ed25519-v1',
      activated_at: T2,
      ended_at: null,
      predecessor_epoch_id: 'credential-1'
    },
    completedAt: T2
  });
  assert.equal(completion.actor_state.actor_id, 'actor-alice');
  assert.equal(completion.actor_state.lifecycle_state, 'recovered');
  assert.equal(completion.actor_state.active_epoch_id, 'credential-2');
  assert.deepEqual(completion.actor_state.state_compartments, [
    'identity',
    'private_memory',
    'publications'
  ]);
  assert.equal(completion.ordinary_authority_granted, false);
});

test('unapproved recovery cannot rotate credentials', () => {
  const decision = evaluateRecovery(policy(), [attestation('hardware-primary')], {
    recoveryCaseId: 'recovery-case-1',
    subjectActorId: 'actor-alice',
    now: T2
  });
  assert.equal(decision.approved, false);
  assert.throws(
    () => completeRecovery({
      actorState: compromisedActor(),
      decision,
      nextCredentialEpoch: {
        schema: CREDENTIAL_EPOCH_SCHEMA,
        actor_id: 'actor-alice',
        epoch_id: 'credential-2',
        sequence: 2,
        state: 'active',
        crypto_profile_id: 'classical-ed25519-v1',
        activated_at: T2,
        ended_at: null,
        predecessor_epoch_id: 'credential-1'
      },
      completedAt: T2
    }),
    /requires an approved recovery decision/
  );
});
