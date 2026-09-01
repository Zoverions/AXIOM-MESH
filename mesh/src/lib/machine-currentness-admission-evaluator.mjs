import { ValidationError } from './canonical.mjs';
import {
  machinePrincipalAdmissionDigest,
  evaluateMachinePrincipalCurrentness
} from './machine-principal-currentness.mjs';
import {
  verifyMachinePrincipalCurrentnessCheckpointWithControllerLifecycle
} from './machine-principal-currentness-checkpoint.mjs';
import {
  createMachineCurrentnessAdmissionReceipt
} from './machine-currentness-admission-receipt.mjs';

function requireStore(value) {
  if (
    !value
    || typeof value.retainedHead !== 'function'
    || typeof value.verifyState !== 'function'
  ) {
    throw new ValidationError(
      'Machine currentness admission evaluator requires a verified retained-head store'
    );
  }
  return value;
}

export async function evaluateRetainedMachineCurrentnessAdmission({
  identity,
  currentnessStore,
  controllerCredential,
  trustedControllerRootPublicKey,
  successorControllerCredential = null,
  controllerRevocation = null,
  expectedControllerDomainId = 'axiom.machine-currentness.v1',
  expectedControllerPrincipalId,
  principalId,
  principalType,
  authorityDigest,
  capabilityId,
  intentDigest,
  planDigest,
  effectDestination,
  maxCurrentnessAgeMs,
  now = new Date()
} = {}) {
  const store = requireStore(currentnessStore);
  const nowDate = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(nowDate.valueOf())) {
    throw new ValidationError('Machine currentness admission evaluation time is invalid');
  }
  await store.verifyState();
  const retained = store.retainedHead();
  if (!retained) {
    return deny('machine_currentness_unavailable');
  }

  const lifecycleVerified =
    verifyMachinePrincipalCurrentnessCheckpointWithControllerLifecycle(retained, {
      controllerCredential,
      trustedControllerRootPublicKey,
      successorControllerCredential,
      controllerRevocation,
      expectedControllerDomainId,
      expectedControllerPrincipalId,
      expectedPrincipalId: principalId,
      expectedPrincipalType: principalType
    });
  const checkpoint = lifecycleVerified.checkpoint;
  const admissionDigest = machinePrincipalAdmissionDigest({
    principalId,
    principalType,
    authorityDigest,
    capabilityId,
    intentDigest,
    planDigest,
    effectDestination
  });
  const { controller_key_id: _controllerKeyId, ...lifecycleCurrentness } =
    checkpoint.statement;
  const evaluated = evaluateMachinePrincipalCurrentness({
    currentness: lifecycleCurrentness,
    expectedPrincipalId: principalId,
    expectedPrincipalType: principalType,
    expectedAuthorityDigest: authorityDigest,
    expectedAdmissionDigest: admissionDigest,
    now: nowDate,
    maxAgeMs: maxCurrentnessAgeMs,
    retainedSequence: checkpoint.statement.sequence,
    retainedHeadDigest: checkpoint.statement.source_head_digest
  });
  if (!evaluated.allow) return evaluated;

  const receipt = createMachineCurrentnessAdmissionReceipt({
    identity,
    principalId,
    principalType,
    authorityDigest,
    capabilityId,
    intentDigest,
    planDigest,
    effectDestination,
    retainedCheckpointDigest: checkpoint.checkpoint_digest,
    retainedSourceHeadDigest: checkpoint.statement.source_head_digest,
    currentnessSequence: checkpoint.statement.sequence,
    currentnessObservedAt: checkpoint.statement.observed_at,
    controllerCredentialDigest: lifecycleVerified.controller_credential_digest,
    controllerKeyEpoch: lifecycleVerified.controller_key_epoch,
    admissionDigest,
    currentnessEvidenceDigest: evaluated.currentness_evidence_digest,
    effectCurrentnessEvaluationDigest:
      evaluated.effect_currentness_evaluation_digest,
    evaluatedAt: nowDate.toISOString()
  });
  return Object.freeze({
    allow: true,
    code: 'machine_currentness_admission_satisfied',
    admission_digest: admissionDigest,
    effect_currentness_evaluation_digest:
      evaluated.effect_currentness_evaluation_digest,
    currentness_evidence_digest: evaluated.currentness_evidence_digest,
    retained_checkpoint_digest: checkpoint.checkpoint_digest,
    retained_source_head_digest: checkpoint.statement.source_head_digest,
    receipt,
    receipt_digest: receipt.receipt_digest,
    authority_effect: 'none',
    execution_authority_granted: false,
    capability_promotion_effect: 'none',
    global_currentness_claimed: false
  });
}

function deny(code) {
  return Object.freeze({
    allow: false,
    code,
    authority_effect: 'none',
    execution_authority_granted: false,
    capability_promotion_effect: 'none',
    global_currentness_claimed: false
  });
}
