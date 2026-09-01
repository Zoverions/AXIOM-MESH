import {
  createPublicKey,
  verify as verifyBytes
} from 'node:crypto';

import {
  ValidationError,
  canonicalJson,
  digestObject
} from './canonical.mjs';

export const MACHINE_CURRENTNESS_ADMISSION_RECEIPT_SCHEMA =
  'axiom-machine-currentness-admission-receipt.v1';

const DIGEST = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${label} must be an object`);
  }
  return value;
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

function publicKey(value, label) {
  try {
    const key = value?.type === 'public' ? value : createPublicKey(value);
    if (key.asymmetricKeyType !== 'ed25519') throw new Error();
    return key;
  } catch {
    throw new ValidationError(`${label} must be Ed25519`);
  }
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
  evaluatedAt = new Date().toISOString()
} = {}) {
  if (!identity || typeof identity.signObject !== 'function' || identity.service !== 'grid') {
    throw new ValidationError('Machine currentness admission receipt requires Grid signing identity');
  }
  if (!Number.isSafeInteger(currentnessSequence) || currentnessSequence < 1) {
    throw new ValidationError('Machine currentness admission sequence is invalid');
  }
  if (!Number.isSafeInteger(controllerKeyEpoch) || controllerKeyEpoch < 1) {
    throw new ValidationError('Machine currentness admission controller key epoch is invalid');
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
    currentness_sequence: currentnessSequence,
    currentness_observed_at: requireTimestamp(
      currentnessObservedAt,
      'Machine currentness admission observed_at'
    ),
    controller_credential_digest: requireDigest(
      controllerCredentialDigest,
      'Machine currentness admission controller credential digest'
    ),
    controller_key_epoch: controllerKeyEpoch,
    admission_binding_digest: admissionBindingDigest,
    evaluated_at: requireTimestamp(evaluatedAt, 'Machine currentness admission evaluated_at'),
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
  maxAgeMs,
  now = new Date()
} = {}) {
  const receipt = requireObject(raw, 'Machine currentness admission receipt');
  const statement = requireObject(receipt.statement, 'Machine currentness admission receipt statement');
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

  const key = publicKey(gridPublicKey, 'Machine currentness admission Grid public key');
  const signatureValue = receipt.signature;
  let signature;
  if (typeof signatureValue === 'string') {
    signature = Buffer.from(signatureValue, 'base64url');
  } else if (
    signatureValue
    && typeof signatureValue === 'object'
    && typeof signatureValue.signature === 'string'
  ) {
    signature = Buffer.from(signatureValue.signature, 'base64url');
  } else {
    throw new ValidationError('Machine currentness admission Grid signature is invalid');
  }
  if (
    signature.length === 0
    || !verifyBytes(
      null,
      Buffer.from(canonicalJson(statement)),
      key,
      signature
    )
  ) {
    throw new ValidationError('Machine currentness admission Grid signature verification failed');
  }

  const signed = { statement, signature: receipt.signature };
  if (receipt.receipt_digest !== digestObject(signed)) {
    throw new ValidationError('Machine currentness admission receipt digest mismatch');
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
  if (!Number.isSafeInteger(statement.currentness_sequence) || statement.currentness_sequence < 1) {
    throw new ValidationError('Machine currentness admission sequence is invalid');
  }
  if (!Number.isSafeInteger(statement.controller_key_epoch) || statement.controller_key_epoch < 1) {
    throw new ValidationError('Machine currentness admission controller key epoch is invalid');
  }
  requireDigest(
    statement.controller_credential_digest,
    'Machine currentness admission controller credential digest'
  );
  requireTimestamp(statement.currentness_observed_at, 'Machine currentness admission observed_at');
  const evaluatedAt = new Date(requireTimestamp(
    statement.evaluated_at,
    'Machine currentness admission evaluated_at'
  ));
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
    admission_binding_digest: statement.admission_binding_digest,
    retained_checkpoint_digest: statement.retained_checkpoint_digest,
    retained_source_head_digest: statement.retained_source_head_digest,
    currentness_sequence: statement.currentness_sequence,
    controller_credential_digest: statement.controller_credential_digest,
    controller_key_epoch: statement.controller_key_epoch,
    evaluated_at: statement.evaluated_at,
    authority_effect: 'none',
    execution_authority_granted: false,
    capability_promotion_effect: 'none',
    global_currentness_claimed: false
  });
}
