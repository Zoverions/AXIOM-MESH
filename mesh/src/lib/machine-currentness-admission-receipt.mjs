import {
  ValidationError,
  digestObject
} from './canonical.mjs';
import { verifyObjectSignature } from './identity.mjs';
import {
  MACHINE_PRINCIPAL_EFFECT_CURRENTNESS_EVALUATION_SCHEMA,
  machinePrincipalAdmissionDigest
} from './machine-principal-currentness.mjs';

export const MACHINE_CURRENTNESS_ADMISSION_RECEIPT_SCHEMA =
  'axiom-machine-currentness-admission-receipt.v1';

const DIGEST = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;

const RECEIPT_KEYS = new Set([
  'statement',
  'signature',
  'receipt_digest'
]);

const STATEMENT_KEYS = new Set([
  'schema',
  'issuer',
  'principal_id',
  'principal_type',
  'authority_digest',
  'capability_id',
  'intent_digest',
  'plan_digest',
  'effect_destination',
  'retained_checkpoint_digest',
  'retained_source_head_digest',
  'currentness_sequence',
  'currentness_observed_at',
  'controller_credential_digest',
  'controller_key_epoch',
  'admission_digest',
  'currentness_evidence_digest',
  'effect_currentness_evaluation_digest',
  'admission_binding_digest',
  'evaluated_at',
  'currentness_result',
  'authority_effect',
  'execution_authority_granted',
  'capability_promotion_effect',
  'global_currentness_claimed'
]);

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${label} must be an object`);
  }
  return value;
}

function rejectUnknownKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new ValidationError(`${label} contains unsupported field: ${key}`);
    }
  }
}

function requireString(value, label, { max = 256, pattern = null } = {}) {
  if (typeof value !== 'string' || value.length < 1 || value.length > max) {
    throw new ValidationError(`${label} is invalid`);
  }
  if (pattern && !pattern.test(value)) throw new ValidationError(`${label} is invalid`);
  return value;
}

function requireTimestamp(value, label) {
  const text = requireString(value, label, { max: 64 });
  const parsed = new Date(text);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== text) {
    throw new ValidationError(`${label} must be a canonical UTC timestamp`);
  }
  return text;
}

function requireDigest(value, label) {
  return requireString(value, label, { max: 64, pattern: DIGEST });
}

function requirePositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new ValidationError(`${label} is invalid`);
  }
  return value;
}

function canonicalAdmissionDigest({
  principalId,
  principalType,
  authorityDigest,
  capabilityId,
  intentDigest,
  planDigest,
  effectDestination
}) {
  return machinePrincipalAdmissionDigest({
    principalId,
    principalType,
    authorityDigest,
    capabilityId,
    intentDigest,
    planDigest,
    effectDestination
  });
}

function canonicalEvaluationDigest({
  admissionDigest,
  currentnessEvidenceDigest,
  currentnessSequence,
  retainedSourceHeadDigest
}) {
  return digestObject({
    schema: MACHINE_PRINCIPAL_EFFECT_CURRENTNESS_EVALUATION_SCHEMA,
    admission_digest: requireDigest(
      admissionDigest,
      'Machine currentness admission canonical admission digest'
    ),
    currentness_evidence_digest: requireDigest(
      currentnessEvidenceDigest,
      'Machine currentness admission currentness evidence digest'
    ),
    currentness_sequence: requirePositiveInteger(
      currentnessSequence,
      'Machine currentness admission sequence'
    ),
    currentness_head_digest: requireDigest(
      retainedSourceHeadDigest,
      'Machine currentness admission retained source head digest'
    )
  });
}

export function machineCurrentnessAdmissionBindingDigest({
  principalId,
  principalType,
  authorityDigest,
  capabilityId,
  intentDigest,
  planDigest,
  effectDestination,
  retainedCheckpointDigest,
  retainedSourceHeadDigest
} = {}) {
  if (!['agent', 'service'].includes(principalType)) {
    throw new ValidationError('Machine currentness admission principal type is invalid');
  }
  return digestObject({
    schema: 'axiom-machine-currentness-admission-binding.v1',
    principal_id: requireString(principalId, 'Machine currentness admission principal id', {
      max: 160,
      pattern: ID
    }),
    principal_type: principalType,
    authority_digest: requireDigest(authorityDigest, 'Machine currentness admission authority digest'),
    capability_id: requireString(capabilityId, 'Machine currentness admission capability id', {
      max: 192,
      pattern: ID
    }),
    intent_digest: requireDigest(intentDigest, 'Machine currentness admission intent digest'),
    plan_digest: requireDigest(planDigest, 'Machine currentness admission plan digest'),
    effect_destination: requireString(
      effectDestination,
      'Machine currentness admission effect destination',
      { max: 256 }
    ),
    retained_checkpoint_digest: requireDigest(
      retainedCheckpointDigest,
      'Machine currentness admission retained checkpoint digest'
    ),
    retained_source_head_digest: requireDigest(
      retainedSourceHeadDigest,
      'Machine currentness admission retained source head digest'
    )
  });
}

export function createMachineCurrentnessAdmissionReceipt({
  identity,
  principalId,
  principalType,
  authorityDigest,
  capabilityId,
  intentDigest,
  planDigest,
  effectDestination,
  retainedCheckpointDigest,
  retainedSourceHeadDigest,
  currentnessSequence,
  currentnessObservedAt,
  controllerCredentialDigest,
  controllerKeyEpoch,
  admissionDigest,
  currentnessEvidenceDigest,
  effectCurrentnessEvaluationDigest,
  evaluatedAt = new Date().toISOString()
} = {}) {
  if (!identity || typeof identity.signObject !== 'function' || identity.service !== 'grid') {
    throw new ValidationError('Machine currentness admission receipt requires Grid signing identity');
  }

  const sequence = requirePositiveInteger(
    currentnessSequence,
    'Machine currentness admission sequence'
  );
  const controllerEpoch = requirePositiveInteger(
    controllerKeyEpoch,
    'Machine currentness admission controller key epoch'
  );

  const expectedAdmissionDigest = canonicalAdmissionDigest({
    principalId,
    principalType,
    authorityDigest,
    capabilityId,
    intentDigest,
    planDigest,
    effectDestination
  });
  if (
    requireDigest(admissionDigest, 'Machine currentness admission digest')
    !== expectedAdmissionDigest
  ) {
    throw new ValidationError(
      'Machine currentness admission receipt admission digest does not match canonical effect admission'
    );
  }

  const evidenceDigest = requireDigest(
    currentnessEvidenceDigest,
    'Machine currentness admission currentness evidence digest'
  );
  const expectedEvaluationDigest = canonicalEvaluationDigest({
    admissionDigest,
    currentnessEvidenceDigest: evidenceDigest,
    currentnessSequence: sequence,
    retainedSourceHeadDigest
  });
  if (
    requireDigest(
      effectCurrentnessEvaluationDigest,
      'Machine currentness admission effect currentness evaluation digest'
    ) !== expectedEvaluationDigest
  ) {
    throw new ValidationError(
      'Machine currentness admission receipt evaluation digest does not match canonical currentness evaluation'
    );
  }

  const observedAt = requireTimestamp(
    currentnessObservedAt,
    'Machine currentness admission observed_at'
  );
  const evaluated = requireTimestamp(evaluatedAt, 'Machine currentness admission evaluated_at');
  if (Date.parse(observedAt) > Date.parse(evaluated)) {
    throw new ValidationError(
      'Machine currentness admission currentness observation cannot occur after evaluation'
    );
  }

  const admissionBindingDigest = machineCurrentnessAdmissionBindingDigest({
    principalId,
    principalType,
    authorityDigest,
    capabilityId,
    intentDigest,
    planDigest,
    effectDestination,
    retainedCheckpointDigest,
    retainedSourceHeadDigest
  });

  const statement = Object.freeze({
    schema: MACHINE_CURRENTNESS_ADMISSION_RECEIPT_SCHEMA,
    issuer: 'grid',
    principal_id: principalId,
    principal_type: principalType,
    authority_digest: authorityDigest,
    capability_id: capabilityId,
    intent_digest: intentDigest,
    plan_digest: planDigest,
    effect_destination: effectDestination,
    retained_checkpoint_digest: retainedCheckpointDigest,
    retained_source_head_digest: retainedSourceHeadDigest,
    currentness_sequence: sequence,
    currentness_observed_at: observedAt,
    controller_credential_digest: requireDigest(
      controllerCredentialDigest,
      'Machine currentness admission controller credential digest'
    ),
    controller_key_epoch: controllerEpoch,
    admission_digest: admissionDigest,
    currentness_evidence_digest: evidenceDigest,
    effect_currentness_evaluation_digest: effectCurrentnessEvaluationDigest,
    admission_binding_digest: admissionBindingDigest,
    evaluated_at: evaluated,
    currentness_result: 'active-and-current',
    authority_effect: 'none',
    execution_authority_granted: false,
    capability_promotion_effect: 'none',
    global_currentness_claimed: false
  });
  const signature = identity.signObject(statement);
  const signed = Object.freeze({ statement, signature });
  return Object.freeze({
    ...signed,
    receipt_digest: digestObject(signed)
  });
}

export function verifyMachineCurrentnessAdmissionReceipt(raw, {
  gridPublicKey,
  expectedPrincipalId,
  expectedPrincipalType,
  expectedAuthorityDigest,
  expectedCapabilityId,
  expectedIntentDigest,
  expectedPlanDigest,
  expectedEffectDestination,
  expectedRetainedCheckpointDigest = null,
  expectedRetainedSourceHeadDigest = null,
  expectedAdmissionDigest = null,
  expectedCurrentnessEvidenceDigest = null,
  expectedEffectCurrentnessEvaluationDigest = null,
  maxAgeMs,
  now = new Date()
} = {}) {
  const receipt = requireObject(raw, 'Machine currentness admission receipt');
  rejectUnknownKeys(receipt, RECEIPT_KEYS, 'Machine currentness admission receipt');
  const statement = requireObject(receipt.statement, 'Machine currentness admission receipt statement');
  rejectUnknownKeys(
    statement,
    STATEMENT_KEYS,
    'Machine currentness admission receipt statement'
  );

  if (statement.schema !== MACHINE_CURRENTNESS_ADMISSION_RECEIPT_SCHEMA || statement.issuer !== 'grid') {
    throw new ValidationError('Machine currentness admission receipt identity is invalid');
  }
  if (
    statement.authority_effect !== 'none'
    || statement.execution_authority_granted !== false
    || statement.capability_promotion_effect !== 'none'
    || statement.global_currentness_claimed !== false
    || statement.currentness_result !== 'active-and-current'
  ) {
    throw new ValidationError('Machine currentness admission receipt widens its non-authorizing boundary');
  }

  if (!verifyObjectSignature(statement, receipt.signature, gridPublicKey)) {
    throw new ValidationError('Machine currentness admission Grid signature verification failed');
  }

  const signed = { statement, signature: receipt.signature };
  if (receipt.receipt_digest !== digestObject(signed)) {
    throw new ValidationError('Machine currentness admission receipt digest mismatch');
  }

  const canonicalAdmission = canonicalAdmissionDigest({
    principalId: statement.principal_id,
    principalType: statement.principal_type,
    authorityDigest: statement.authority_digest,
    capabilityId: statement.capability_id,
    intentDigest: statement.intent_digest,
    planDigest: statement.plan_digest,
    effectDestination: statement.effect_destination
  });
  if (
    requireDigest(statement.admission_digest, 'Machine currentness admission digest')
    !== canonicalAdmission
  ) {
    throw new ValidationError(
      'Machine currentness admission receipt admission digest is not canonical'
    );
  }

  const currentnessSequence = requirePositiveInteger(
    statement.currentness_sequence,
    'Machine currentness admission sequence'
  );
  const currentnessEvidenceDigest = requireDigest(
    statement.currentness_evidence_digest,
    'Machine currentness admission currentness evidence digest'
  );
  const canonicalEvaluation = canonicalEvaluationDigest({
    admissionDigest: statement.admission_digest,
    currentnessEvidenceDigest,
    currentnessSequence,
    retainedSourceHeadDigest: statement.retained_source_head_digest
  });
  if (
    requireDigest(
      statement.effect_currentness_evaluation_digest,
      'Machine currentness admission effect currentness evaluation digest'
    ) !== canonicalEvaluation
  ) {
    throw new ValidationError(
      'Machine currentness admission receipt evaluation digest is not canonical'
    );
  }

  const expectedBinding = machineCurrentnessAdmissionBindingDigest({
    principalId: expectedPrincipalId,
    principalType: expectedPrincipalType,
    authorityDigest: expectedAuthorityDigest,
    capabilityId: expectedCapabilityId,
    intentDigest: expectedIntentDigest,
    planDigest: expectedPlanDigest,
    effectDestination: expectedEffectDestination,
    retainedCheckpointDigest: expectedRetainedCheckpointDigest ?? statement.retained_checkpoint_digest,
    retainedSourceHeadDigest: expectedRetainedSourceHeadDigest ?? statement.retained_source_head_digest
  });
  if (
    statement.principal_id !== expectedPrincipalId
    || statement.principal_type !== expectedPrincipalType
    || statement.authority_digest !== expectedAuthorityDigest
    || statement.capability_id !== expectedCapabilityId
    || statement.intent_digest !== expectedIntentDigest
    || statement.plan_digest !== expectedPlanDigest
    || statement.effect_destination !== expectedEffectDestination
    || statement.admission_binding_digest !== expectedBinding
  ) {
    throw new ValidationError('Machine currentness admission receipt does not bind expected effect admission');
  }
  if (
    expectedRetainedCheckpointDigest !== null
    && statement.retained_checkpoint_digest !== expectedRetainedCheckpointDigest
  ) {
    throw new ValidationError('Machine currentness admission retained checkpoint mismatch');
  }
  if (
    expectedRetainedSourceHeadDigest !== null
    && statement.retained_source_head_digest !== expectedRetainedSourceHeadDigest
  ) {
    throw new ValidationError('Machine currentness admission retained source head mismatch');
  }
  if (
    expectedAdmissionDigest !== null
    && statement.admission_digest !== expectedAdmissionDigest
  ) {
    throw new ValidationError('Machine currentness admission canonical admission digest mismatch');
  }
  if (
    expectedCurrentnessEvidenceDigest !== null
    && statement.currentness_evidence_digest !== expectedCurrentnessEvidenceDigest
  ) {
    throw new ValidationError('Machine currentness admission currentness evidence digest mismatch');
  }
  if (
    expectedEffectCurrentnessEvaluationDigest !== null
    && statement.effect_currentness_evaluation_digest
      !== expectedEffectCurrentnessEvaluationDigest
  ) {
    throw new ValidationError('Machine currentness admission evaluation digest mismatch');
  }

  requirePositiveInteger(
    statement.controller_key_epoch,
    'Machine currentness admission controller key epoch'
  );
  requireDigest(
    statement.controller_credential_digest,
    'Machine currentness admission controller credential digest'
  );

  const observedAt = new Date(requireTimestamp(
    statement.currentness_observed_at,
    'Machine currentness admission observed_at'
  ));
  const evaluatedAt = new Date(requireTimestamp(
    statement.evaluated_at,
    'Machine currentness admission evaluated_at'
  ));
  if (observedAt.valueOf() > evaluatedAt.valueOf()) {
    throw new ValidationError(
      'Machine currentness admission currentness observation cannot occur after evaluation'
    );
  }

  const nowDate = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(nowDate.valueOf())) {
    throw new ValidationError('Machine currentness admission verification time is invalid');
  }
  if (!Number.isSafeInteger(maxAgeMs) || maxAgeMs < 0) {
    throw new ValidationError('Machine currentness admission maxAgeMs must be a non-negative integer');
  }
  const ageMs = nowDate.valueOf() - evaluatedAt.valueOf();
  if (ageMs < 0 || ageMs > maxAgeMs) {
    throw new ValidationError('Machine currentness admission receipt is stale or future-dated');
  }

  return Object.freeze({
    valid: true,
    receipt_digest: receipt.receipt_digest,
    admission_digest: statement.admission_digest,
    currentness_evidence_digest: statement.currentness_evidence_digest,
    effect_currentness_evaluation_digest:
      statement.effect_currentness_evaluation_digest,
    admission_binding_digest: statement.admission_binding_digest,
    retained_checkpoint_digest: statement.retained_checkpoint_digest,
    retained_source_head_digest: statement.retained_source_head_digest,
    currentness_sequence: currentnessSequence,
    controller_credential_digest: statement.controller_credential_digest,
    controller_key_epoch: statement.controller_key_epoch,
    evaluated_at: statement.evaluated_at,
    authority_effect: 'none',
    execution_authority_granted: false,
    capability_promotion_effect: 'none',
    global_currentness_claimed: false
  });
}
