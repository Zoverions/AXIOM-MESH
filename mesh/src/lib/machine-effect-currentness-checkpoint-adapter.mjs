import {
  ValidationError,
  digestObject
} from './canonical.mjs';
import {
  verifyMachinePrincipalCurrentnessCheckpoint
} from './machine-principal-currentness-checkpoint.mjs';
import {
  evaluateMachinePrincipalCurrentness,
  machinePrincipalAdmissionDigest
} from './machine-principal-currentness.mjs';

export const MACHINE_EFFECT_CURRENTNESS_CHECKPOINT_PREREQUISITE_SCHEMA =
  'axiom-machine-effect-currentness-checkpoint-prerequisite.v1';

const FIXED_NONCLAIMS = Object.freeze({
  effect_execution_authorized: false,
  authority_effect: 'none',
  delegation_effect: 'none',
  capability_promotion_effect: 'none',
  global_currentness_claimed: false
});

/**
 * Compose the signed lifecycle-currentness substrate with one exact pending
 * effect without making currentness itself an authority source.
 *
 * The checkpoint consulted for this effect must be byte-for-byte the same
 * signed checkpoint as the independently retained latest head. A merely valid
 * signed checkpoint is insufficient: older stale heads and newer-but-unretained
 * heads both fail before currentness evaluation.
 */
export function evaluateMachineEffectCurrentnessCheckpointPrerequisite({
  currentnessCheckpoint,
  retainedLatestCheckpoint,
  trustedControllerPublicKey,
  expectedPrincipalId,
  expectedPrincipalType,
  expectedAuthorityDigest,
  capabilityId,
  intentDigest,
  planDigest,
  effectDestination,
  effectAt,
  maxEvidenceAgeMs
} = {}) {
  const retained = verifyMachinePrincipalCurrentnessCheckpoint(
    retainedLatestCheckpoint,
    {
      trustedControllerPublicKey,
      expectedPrincipalId,
      expectedPrincipalType
    }
  );
  const consulted = verifyMachinePrincipalCurrentnessCheckpoint(
    currentnessCheckpoint,
    {
      trustedControllerPublicKey,
      expectedPrincipalId,
      expectedPrincipalType
    }
  );

  if (consulted.checkpoint_digest !== retained.checkpoint_digest) {
    throw new ValidationError(
      'Machine effect currentness requires the exact retained latest checkpoint'
    );
  }

  const admissionDigest = machinePrincipalAdmissionDigest({
    principalId: expectedPrincipalId,
    principalType: expectedPrincipalType,
    authorityDigest: expectedAuthorityDigest,
    capabilityId,
    intentDigest,
    planDigest,
    effectDestination
  });

  const {
    controller_key_id: controllerKeyId,
    ...currentness
  } = consulted.statement;

  const evaluation = evaluateMachinePrincipalCurrentness({
    currentness,
    expectedPrincipalId,
    expectedPrincipalType,
    expectedAuthorityDigest,
    expectedAdmissionDigest: admissionDigest,
    now: effectAt,
    maxAgeMs: maxEvidenceAgeMs,
    retainedSequence: retained.statement.sequence,
    retainedHeadDigest: retained.statement.source_head_digest
  });

  const decisionCore = Object.freeze({
    schema: MACHINE_EFFECT_CURRENTNESS_CHECKPOINT_PREREQUISITE_SCHEMA,
    allow: evaluation.allow,
    code: evaluation.code,
    principal_id: expectedPrincipalId,
    principal_type: expectedPrincipalType,
    expected_authority_digest: expectedAuthorityDigest,
    admission_digest: admissionDigest,
    currentness_checkpoint_digest: consulted.checkpoint_digest,
    currentness_statement_digest: consulted.statement_digest,
    currentness_controller_key_id: controllerKeyId,
    currentness_sequence: consulted.statement.sequence,
    currentness_head_digest: consulted.statement.source_head_digest,
    consulted_currentness_evidence_digest: digestObject(currentness),
    effect_currentness_evaluation_digest:
      evaluation.effect_currentness_evaluation_digest ?? null,
    ...FIXED_NONCLAIMS
  });

  return Object.freeze({
    ...decisionCore,
    prerequisite_decision_digest: digestObject(decisionCore)
  });
}
