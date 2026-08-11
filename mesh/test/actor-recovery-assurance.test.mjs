import assert from 'node:assert/strict';
import test from 'node:test';

import { sha256 } from '../src/lib/canonical.mjs';
import {
  RECOVERY_ATTESTATION_SCHEMA,
  RECOVERY_POLICY_SCHEMA,
  evaluateRecovery
} from '../src/identity/actor-recovery.mjs';

const T0 = '2026-08-11T13:00:00.000Z';
const T1 = '2026-08-11T13:10:00.000Z';
const T2 = '2026-08-11T13:20:00.000Z';
const T3 = '2026-08-11T14:00:00.000Z';

const profiles = [
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
    factor_id: 'factor-device-low',
    factor_type: 'trusted_device',
    factor_class: 'possession',
    attestor_actor_id: null,
    minimum_assurance: 'A2',
    effective_at: T0,
    expires_at: null,
    status: 'active'
  }
];

function attestation(profile, assurance) {
  return {
    schema: RECOVERY_ATTESTATION_SCHEMA,
    recovery_case_id: 'recovery-case-assurance',
    subject_actor_id: 'actor-alice',
    factor_id: profile.factor_id,
    factor_type: profile.factor_type,
    factor_class: profile.factor_class,
    attestor_actor_id: profile.attestor_actor_id,
    evidence_digest: sha256(`evidence:${profile.factor_id}`),
    assurance,
    verdict: 'pass',
    observed_at: T1,
    expires_at: T3
  };
}

test('lower-assurance optional evidence cannot poison or contribute to an A3 recovery decision', () => {
  const decision = evaluateRecovery({
    schema: RECOVERY_POLICY_SCHEMA,
    policy_id: 'recovery-policy-assurance',
    subject_actor_id: 'actor-alice',
    factor_profiles: profiles,
    threshold: 2,
    required_factor_classes: ['possession', 'human'],
    minimum_decision_assurance: 'A3',
    effective_at: T0,
    expires_at: null,
    status: 'active',
    ordinary_authority_granted: false
  }, [
    attestation(profiles[0], 'A3'),
    attestation(profiles[1], 'A3'),
    attestation(profiles[2], 'A2')
  ], {
    recoveryCaseId: 'recovery-case-assurance',
    subjectActorId: 'actor-alice',
    now: T2
  });

  assert.equal(decision.approved, true);
  assert.deepEqual(decision.accepted_factor_ids, ['factor-hardware', 'factor-sibling']);
  assert.equal(decision.achieved_assurance, 'A3');
  assert.deepEqual(decision.rejected, [{
    factor_id: 'factor-device-low',
    reasons: ['decision_assurance_too_low']
  }]);
});
