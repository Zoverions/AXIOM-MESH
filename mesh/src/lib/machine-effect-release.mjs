import { types } from 'node:util';

import {
  AxiomError,
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject,
  sha256
} from './canonical.mjs';
import { snapshotDelegationPlainData } from './delegation-plain-snapshot.mjs';
import { normalizeMachineEffectRelease } from './machine-principal-currentness.mjs';
import { verifyObjectSignature } from './identity.mjs';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const ACTION = /^[a-z][a-z0-9.-]{1,127}$/;
const DESTINATION = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,255}$/;
const ACTIVE_STATUSES = new Set(['active', 'narrowed']);

export function machineEffectReleaseId(capabilityId, executionAttemptId) {
  const capability = assertString(capabilityId, 'capability id', {
    max: 160,
    pattern: ID
  });
  const attempt = assertString(executionAttemptId, 'execution attempt id', {
    max: 160,
    pattern: ID
  });
  return `machine_release_${sha256(`${capability}\n${attempt}`)}`;
}

export function assertCurrentnessMatchesCapability(currentInput, claimsInput, {
  observedAt = new Date()
} = {}) {
  const current = assertPlainObject(currentInput, 'machine currentness');
  const claims = assertPlainObject(claimsInput, 'capability claims');
  const observed = observedAt instanceof Date ? observedAt : new Date(observedAt);
  if (Number.isNaN(observed.valueOf())) {
    throw new ValidationError('Machine effect release observation time is invalid');
  }
  if (
    current.principal_id !== claims.subject
    || current.principal_type !== claims.principal_type
    || current.root_authority_digest !== claims.root_authority_digest
    || current.lifecycle_seq !== claims.currentness_seq
    || current.lifecycle_head_digest !== claims.currentness_head_digest
    || current.effective_authority_digest !== claims.effective_authority_digest
  ) {
    throw new AxiomError(
      'machine_currentness_stale',
      'Capability machine currentness is stale',
      409
    );
  }
  if (!ACTIVE_STATUSES.has(current.status)) {
    throw new AxiomError(
      'machine_currentness_stale',
      'Capability machine currentness is no longer active',
      409
    );
  }
  if (
    current.effective_authority?.expires_at
    && Date.parse(current.effective_authority.expires_at) <= observed.valueOf()
  ) {
    throw new AxiomError(
      'machine_currentness_stale',
      'Capability machine currentness has expired',
      409
    );
  }
  if (!Number.isSafeInteger(claims.exp) || claims.exp * 1_000 <= observed.valueOf()) {
    throw new AxiomError(
      'expired_capability',
      'Capability expired before machine effect release',
      401
    );
  }
  return current;
}

export function buildMachineEffectRelease({
  capabilityClaims,
  sandboxExecutionEpoch,
  consumptionReceiptDigest,
  releasedAt = new Date().toISOString()
}) {
  const claims = assertPlainObject(capabilityClaims, 'capability claims');
  const executionAttemptId = assertString(
    claims.execution_attempt_id,
    'capability execution attempt id',
    { max: 160, pattern: ID }
  );
  const released = new Date(releasedAt);
  if (Number.isNaN(released.valueOf())) {
    throw new ValidationError('Machine effect release time is invalid');
  }
  return normalizeMachineEffectRelease({
    schema: 'axiom-machine-effect-release.v1',
    release_id: machineEffectReleaseId(claims.jti, executionAttemptId),
    principal_id: assertString(claims.subject, 'capability subject', {
      max: 160,
      pattern: ID
    }),
    principal_type: assertString(claims.principal_type, 'capability principal type', {
      max: 16,
      pattern: /^(agent|service)$/
    }),
    capability_id: assertString(claims.jti, 'capability id', {
      max: 160,
      pattern: ID
    }),
    execution_attempt_id: executionAttemptId,
    sandbox_execution_epoch: assertString(
      sandboxExecutionEpoch,
      'Sandbox execution epoch',
      { max: 160, pattern: ID }
    ),
    intent_id: assertString(claims.intent_id, 'capability intent id', {
      max: 160,
      pattern: /^intent_[a-f0-9]{64}$/
    }),
    plan_digest: requiredDigest(claims.plan_digest, 'capability plan digest'),
    action: assertString(claims.action, 'capability action', {
      max: 128,
      pattern: ACTION
    }),
    destination: assertString(
      claims.effect_destination,
      'capability effect destination',
      { max: 256, pattern: DESTINATION }
    ),
    root_authority_digest: requiredDigest(
      claims.root_authority_digest,
      'capability root authority digest'
    ),
    lifecycle_seq: claims.currentness_seq,
    lifecycle_head_digest: requiredDigest(
      claims.currentness_head_digest,
      'capability currentness head digest'
    ),
    effective_authority_digest: requiredDigest(
      claims.effective_authority_digest,
      'capability effective authority digest'
    ),
    consumption_receipt_digest: requiredDigest(
      consumptionReceiptDigest,
      'capability consumption receipt digest'
    ),
    released_at: released.toISOString(),
    authority_effect: 'exact-machine-effect-release'
  });
}

export function projectMachineEffectReleasedEvent(releaseInput) {
  const release = normalizeMachineEffectRelease(releaseInput);
  return Object.freeze({
    kind: 'machine.effect.released',
    subject: release.release_id,
    payload: Object.freeze({
      release,
      release_digest: digestObject(release)
    })
  });
}

export function signMachineEffectReleaseReceipt(identity, releaseInput) {
  if (!identity || typeof identity.signObject !== 'function') {
    throw new ValidationError('Grid signing identity is required');
  }
  const statement = normalizeMachineEffectRelease(releaseInput);
  return Object.freeze({
    statement,
    signature: identity.signObject(statement)
  });
}

export function verifyMachineEffectReleaseReceipt(receiptInput, optionsInput) {
  const receipt = snapshotDelegationPlainData(
    receiptInput,
    'machine effect release receipt'
  );
  if (!receipt) {
    throw new AxiomError(
      'machine_effect_release_required',
      'A Grid machine effect release receipt is required',
      403
    );
  }
  assertPlainObject(receipt, 'machine effect release receipt');
  if (Object.keys(receipt).sort().join(',') !== 'signature,statement') {
    throw new AxiomError(
      'machine_effect_release_mismatch',
      'Machine effect release receipt fields are invalid',
      403
    );
  }
  const options = machineEffectReleaseVerificationOptions(optionsInput);
  const {
    gridPublicKey,
    claims: claimsInput,
    consumptionReceiptDigest,
    attemptId,
    executionEpoch
  } = options;
  const receiptDigest = digestObject(receipt);
  const statement = normalizeMachineEffectRelease(receipt.statement);
  let validSignature = false;
  try {
    validSignature = Boolean(
      gridPublicKey
      && verifyObjectSignature(statement, receipt.signature, gridPublicKey)
    );
  } catch {
    validSignature = false;
  }
  if (!validSignature) {
    throw new AxiomError(
      'machine_effect_release_mismatch',
      'Machine effect release receipt signature is invalid',
      403
    );
  }
  const claims = snapshotDelegationPlainData(claimsInput, 'capability claims');
  assertPlainObject(claims, 'capability claims');
  const expected = buildMachineEffectRelease({
    capabilityClaims: claims,
    sandboxExecutionEpoch: executionEpoch,
    consumptionReceiptDigest,
    releasedAt: statement.released_at
  });
  if (
    attemptId !== claims.execution_attempt_id
    || digestObject(statement) !== digestObject(expected)
  ) {
    throw new AxiomError(
      'machine_effect_release_mismatch',
      'Machine effect release receipt is not bound to this execution',
      403
    );
  }
  return Object.freeze({
    statement,
    signature: structuredClone(receipt.signature),
    receipt_digest: receiptDigest
  });
}

function machineEffectReleaseVerificationOptions(optionsInput) {
  if (types.isProxy(optionsInput)) {
    throw new ValidationError('Machine effect release verification options cannot be a Proxy');
  }
  const options = assertPlainObject(
    optionsInput,
    'machine effect release verification options'
  );
  const prototype = Object.getPrototypeOf(options);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new ValidationError('Machine effect release verification options are invalid');
  }
  const expected = [
    'attemptId',
    'claims',
    'consumptionReceiptDigest',
    'executionEpoch',
    'gridPublicKey'
  ];
  const keys = Reflect.ownKeys(options);
  if (
    keys.length !== expected.length
    || keys.some(key => typeof key !== 'string')
    || keys.slice().sort().join(',') !== expected.slice().sort().join(',')
  ) {
    throw new ValidationError('Machine effect release verification options are invalid');
  }
  const snapshot = {};
  for (const key of expected) {
    const descriptor = Reflect.getOwnPropertyDescriptor(options, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw new ValidationError('Machine effect release verification options are invalid');
    }
    snapshot[key] = descriptor.value;
  }
  if (types.isProxy(snapshot.gridPublicKey)) {
    throw new ValidationError('Grid verification key cannot be a Proxy');
  }
  return snapshot;
}

export function normalizeMachineEffectReleasedEventPayload(subject, payloadInput) {
  const payload = assertPlainObject(payloadInput, 'machine effect release event payload');
  if (Object.keys(payload).sort().join(',') !== 'release,release_digest') {
    throw new ValidationError('Machine effect release event payload fields are invalid');
  }
  const release = normalizeMachineEffectRelease(payload.release);
  if (subject !== release.release_id) {
    throw new ValidationError('Machine effect release event subject mismatch');
  }
  const releaseDigest = requiredDigest(payload.release_digest, 'machine effect release digest');
  if (releaseDigest !== digestObject(release)) {
    throw new ValidationError('Machine effect release digest mismatch');
  }
  return Object.freeze({ release, release_digest: releaseDigest });
}

function requiredDigest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}
