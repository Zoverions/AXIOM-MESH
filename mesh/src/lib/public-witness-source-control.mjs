import {
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject
} from './canonical.mjs';
import { validatePublicWitnessSourceAdmission } from './public-witness-transfer.mjs';

export const PUBLIC_WITNESS_SOURCE_CONTROL_SCHEMA = 'axiom-public-witness-source-control.v1';
export const PUBLIC_WITNESS_SOURCE_CONTROL_VERIFICATION_SCHEMA = 'axiom-public-witness-source-control-verification.v1';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const MAX_SEQUENCE = Number.MAX_SAFE_INTEGER;
const OPERATIONS = new Set(['admit', 'rotate-certificate', 'rotate-source', 'disable']);
const DISABLE_REASONS = new Set([
  'operator-disable',
  'suspected-key-compromise',
  'certificate-compromise',
  'source-retirement',
  'policy-withdrawal'
]);
const CONTROL_KEYS = new Set([
  'schema',
  'domain_id',
  'source_id',
  'control_sequence',
  'previous_control_digest',
  'operation',
  'effective_at',
  'source_epoch',
  'source_admission_digest',
  'source_admission',
  'certificate_sha256',
  'disable_reason',
  'source_status',
  'local_operator_input',
  'remote_self_provisioning_allowed',
  'receiver_mutation_claimed',
  'persona_root_trust_effect',
  'social_authority_effect',
  'finality_claimed',
  'authority_effect',
  'network_effect',
  'control_digest'
]);

function exactKeys(raw, allowed, label) {
  const value = assertPlainObject(raw, label);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ValidationError(`${label} contains unsupported field ${key}`);
  }
  return value;
}

function identifier(value, label) {
  return assertString(value, label, { min: 1, max: 192, pattern: IDENTIFIER });
}

function digest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

function nullableDigest(value, label) {
  return value === null ? null : digest(value, label);
}

function canonicalTimestamp(value, label) {
  const text = assertString(value, label, { min: 24, max: 24 });
  const parsed = new Date(text);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== text) {
    throw new ValidationError(`${label} must be a canonical UTC ISO timestamp`);
  }
  return text;
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_SEQUENCE) {
    throw new ValidationError(`${label} must be a positive safe integer`);
  }
  return value;
}

function operation(value) {
  const text = assertString(value, 'public witness source control operation');
  if (!OPERATIONS.has(text)) throw new ValidationError('public witness source control operation is unsupported');
  return text;
}

function certificateDigest(value, required) {
  if (value === null && !required) return null;
  return digest(value, 'public witness source control certificate_sha256');
}

function disableReason(value, required) {
  if (value === null && !required) return null;
  const text = assertString(value, 'public witness source control disable_reason');
  if (!DISABLE_REASONS.has(text)) throw new ValidationError('public witness source control disable reason is unsupported');
  return text;
}

function normalizeBody(raw) {
  const value = exactKeys(raw, CONTROL_KEYS, 'public witness source control');
  if (value.schema !== PUBLIC_WITNESS_SOURCE_CONTROL_SCHEMA) {
    throw new ValidationError('public witness source control schema is unsupported');
  }
  const domainId = identifier(value.domain_id, 'public witness source control domain_id');
  const sourceId = identifier(value.source_id, 'public witness source control source_id');
  const sequence = positiveInteger(value.control_sequence, 'public witness source control sequence');
  const previous = nullableDigest(value.previous_control_digest, 'public witness source control previous_control_digest');
  if ((sequence === 1) !== (previous === null)) {
    throw new ValidationError('public witness source control sequence 1 requires null predecessor and later controls require one');
  }
  const op = operation(value.operation);
  const effectiveAt = canonicalTimestamp(value.effective_at, 'public witness source control effective_at');
  const admission = validatePublicWitnessSourceAdmission(value.source_admission);
  if (admission.domain_id !== domainId || admission.source_id !== sourceId) {
    throw new ValidationError('public witness source control admission does not match domain and source');
  }
  const sourceEpoch = positiveInteger(value.source_epoch, 'public witness source control source_epoch');
  if (admission.source_epoch !== sourceEpoch) {
    throw new ValidationError('public witness source control epoch does not match source admission');
  }
  const admissionDigest = digest(value.source_admission_digest, 'public witness source control source_admission_digest');
  if (admission.admission_digest !== admissionDigest) {
    throw new ValidationError('public witness source control admission digest does not match source admission');
  }
  const disabled = op === 'disable';
  const cert = certificateDigest(value.certificate_sha256, !disabled);
  const reason = disableReason(value.disable_reason, disabled);
  if (disabled && cert !== null) {
    throw new ValidationError('public witness source disable cannot retain a certificate ingress binding');
  }
  if (!disabled && reason !== null) {
    throw new ValidationError('active public witness source control cannot carry a disable reason');
  }
  const expectedStatus = disabled ? 'disabled' : 'active';
  if (value.source_status !== expectedStatus) {
    throw new ValidationError('public witness source control source_status does not match operation');
  }
  if (
    value.local_operator_input !== true
    || value.remote_self_provisioning_allowed !== false
    || value.receiver_mutation_claimed !== false
    || value.persona_root_trust_effect !== 'none'
    || value.social_authority_effect !== 'none'
    || value.finality_claimed !== false
    || value.authority_effect !== 'none'
    || value.network_effect !== 'none'
  ) {
    throw new ValidationError('public witness source control cannot expand remote, receiver, persona, social, finality, authority, or network claims');
  }
  if (!disabled && (effectiveAt < admission.valid_from || effectiveAt >= admission.expires_at)) {
    throw new ValidationError('public witness active source control effective time is outside admission validity');
  }
  if (disabled && effectiveAt < admission.valid_from) {
    throw new ValidationError('public witness source disable cannot predate admission validity');
  }
  return Object.freeze({
    schema: PUBLIC_WITNESS_SOURCE_CONTROL_SCHEMA,
    domain_id: domainId,
    source_id: sourceId,
    control_sequence: sequence,
    previous_control_digest: previous,
    operation: op,
    effective_at: effectiveAt,
    source_epoch: sourceEpoch,
    source_admission_digest: admissionDigest,
    source_admission: admission,
    certificate_sha256: cert,
    disable_reason: reason,
    source_status: expectedStatus,
    local_operator_input: true,
    remote_self_provisioning_allowed: false,
    receiver_mutation_claimed: false,
    persona_root_trust_effect: 'none',
    social_authority_effect: 'none',
    finality_claimed: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
}

function withDigest(body) {
  return Object.freeze({ ...body, control_digest: digestObject(body) });
}

export function validatePublicWitnessSourceControl(raw) {
  const value = exactKeys(raw, CONTROL_KEYS, 'public witness source control');
  const body = normalizeBody(value);
  const controlDigest = digest(value.control_digest, 'public witness source control control_digest');
  if (controlDigest !== digestObject(body)) {
    throw new ValidationError('public witness source control digest mismatch');
  }
  return withDigest(body);
}

export function createPublicWitnessSourceControl({
  sourceAdmission,
  certificateSha256 = null,
  operation: operationRaw = 'admit',
  effectiveAt,
  previousControl = null,
  disableReason: disableReasonRaw = null
} = {}) {
  const admission = validatePublicWitnessSourceAdmission(sourceAdmission);
  const op = operation(operationRaw);
  let sequence = 1;
  let previousDigest = null;
  if (previousControl !== null) {
    const previous = validatePublicWitnessSourceControl(previousControl);
    sequence = previous.control_sequence + 1;
    previousDigest = previous.control_digest;
  }
  const control = withDigest(normalizeBody({
    schema: PUBLIC_WITNESS_SOURCE_CONTROL_SCHEMA,
    domain_id: admission.domain_id,
    source_id: admission.source_id,
    control_sequence: sequence,
    previous_control_digest: previousDigest,
    operation: op,
    effective_at: effectiveAt,
    source_epoch: admission.source_epoch,
    source_admission_digest: admission.admission_digest,
    source_admission: admission,
    certificate_sha256: op === 'disable' ? null : certificateSha256,
    disable_reason: op === 'disable' ? disableReasonRaw : null,
    source_status: op === 'disable' ? 'disabled' : 'active',
    local_operator_input: true,
    remote_self_provisioning_allowed: false,
    receiver_mutation_claimed: false,
    persona_root_trust_effect: 'none',
    social_authority_effect: 'none',
    finality_claimed: false,
    authority_effect: 'none',
    network_effect: 'none',
    control_digest: '0'.repeat(64)
  }));
  if (previousControl === null) {
    if (op !== 'admit' || admission.source_epoch !== 1) {
      throw new ValidationError('public witness source control genesis must admit source epoch 1');
    }
  } else {
    validatePublicWitnessSourceControlTransition(previousControl, control);
  }
  return control;
}

export function validatePublicWitnessSourceControlTransition(previousRaw, nextRaw) {
  const previous = validatePublicWitnessSourceControl(previousRaw);
  const next = validatePublicWitnessSourceControl(nextRaw);
  if (next.domain_id !== previous.domain_id || next.source_id !== previous.source_id) {
    throw new ValidationError('public witness source control transition cannot change domain or source');
  }
  if (next.control_sequence !== previous.control_sequence + 1) {
    throw new ValidationError('public witness source control transition must advance exactly one sequence');
  }
  if (next.previous_control_digest !== previous.control_digest) {
    throw new ValidationError('public witness source control transition predecessor does not match prior control');
  }
  if (next.effective_at <= previous.effective_at) {
    throw new ValidationError('public witness source control transition effective time must advance');
  }

  if (previous.source_status === 'disabled') {
    if (next.operation !== 'rotate-source') {
      throw new ValidationError('disabled public witness source can return only through source rotation');
    }
    if (next.source_epoch !== previous.source_epoch + 1) {
      throw new ValidationError('public witness source rotation after disable must advance exactly one epoch');
    }
    return next;
  }

  if (next.operation === 'admit') {
    throw new ValidationError('public witness source admit is genesis-only');
  }
  if (next.operation === 'rotate-certificate') {
    if (
      next.source_epoch !== previous.source_epoch
      || next.source_admission_digest !== previous.source_admission_digest
    ) {
      throw new ValidationError('public witness certificate rotation must retain the exact source admission');
    }
    if (next.certificate_sha256 === previous.certificate_sha256) {
      throw new ValidationError('public witness certificate rotation must change certificate digest');
    }
    return next;
  }
  if (next.operation === 'disable') {
    if (
      next.source_epoch !== previous.source_epoch
      || next.source_admission_digest !== previous.source_admission_digest
    ) {
      throw new ValidationError('public witness source disable must bind the exact active source admission');
    }
    return next;
  }
  if (next.operation === 'rotate-source') {
    if (next.source_epoch !== previous.source_epoch + 1) {
      throw new ValidationError('public witness source rotation must advance exactly one epoch');
    }
    if (next.source_admission_digest === previous.source_admission_digest) {
      throw new ValidationError('public witness source rotation must bind a new source admission');
    }
    return next;
  }
  throw new ValidationError('public witness source control transition is unsupported');
}

function sameAdmission(left, right) {
  return left?.admission_digest === right.admission_digest
    && digestObject(left) === digestObject(right);
}

export function verifyPublicWitnessSourceControlAgainstReceiver({
  receiverStore,
  control: controlRaw
} = {}) {
  if (!receiverStore || typeof receiverStore.getSourceAdmission !== 'function' || typeof receiverStore.snapshot !== 'function') {
    throw new ValidationError('public witness source control verification requires a W2c2 receiver');
  }
  const control = validatePublicWitnessSourceControl(controlRaw);
  const snapshot = receiverStore.snapshot();
  if (snapshot.domain_id !== control.domain_id) {
    throw new ValidationError('public witness source control belongs to a different receiver domain');
  }
  const retained = receiverStore.getSourceAdmission(control.source_admission_digest);
  if (!retained || !sameAdmission(retained, control.source_admission)) {
    throw new ValidationError('public witness source control admission is not exactly retained by W2c2');
  }
  return Object.freeze({
    schema: PUBLIC_WITNESS_SOURCE_CONTROL_VERIFICATION_SCHEMA,
    domain_id: control.domain_id,
    source_id: control.source_id,
    control_sequence: control.control_sequence,
    control_digest: control.control_digest,
    source_epoch: control.source_epoch,
    source_admission_digest: control.source_admission_digest,
    source_status: control.source_status,
    receiver_mutation: false,
    remote_self_provisioning_allowed: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
}

export function projectPublicWitnessSourceControlToIngressTrustEntry(controlRaw) {
  const control = validatePublicWitnessSourceControl(controlRaw);
  if (control.source_status === 'disabled') return null;
  return Object.freeze({
    certificate_sha256: control.certificate_sha256,
    admission: control.source_admission
  });
}
