import { ValidationError, digestObject } from './canonical.mjs';

export const MACHINE_PRINCIPAL_CURRENTNESS_SCHEMA =
  'axiom-machine-principal-currentness.v1';

const DIGEST = /^[a-f0-9]{64}$/;
const STATUS = new Set(['active', 'narrowed', 'revoked', 'compromised', 'expired']);
const PRINCIPAL_TYPES = new Set(['agent', 'service']);
const CURRENTNESS_KEYS = new Set([
  'schema',
  'principal_id',
  'principal_type',
  'authority_digest',
  'status',
  'sequence',
  'observed_at',
  'source_head_digest',
  'predecessor_head_digest',
  'admission_digest',
  'authority_effect',
  'execution_authority_granted',
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
    if (!allowed.has(key)) throw new ValidationError(`${label} contains unsupported field: ${key}`);
  }
}

function requireString(value, label, { max = 256, pattern = null } = {}) {
  if (typeof value !== 'string' || value.length < 1 || value.length > max) {
    throw new ValidationError(`${label} is invalid`);
  }
  if (pattern && !pattern.test(value)) {
    throw new ValidationError(`${label} is invalid`);
  }
  return value;
}

function requireTimestamp(value, label) {
  requireString(value, label, { max: 64 });
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) throw new ValidationError(`${label} is invalid`);
  return date.toISOString();
}

function requireSequence(value) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new ValidationError('Machine principal currentness sequence is invalid');
  }
  return value;
}

export function normalizeMachinePrincipalCurrentness(value) {
  const raw = requireObject(value, 'Machine principal currentness');
  rejectUnknownKeys(raw, CURRENTNESS_KEYS, 'Machine principal currentness');
  if (raw.schema !== MACHINE_PRINCIPAL_CURRENTNESS_SCHEMA) {
    throw new ValidationError('Machine principal currentness schema is unsupported');
  }
  const status = requireString(raw.status, 'Machine principal currentness status', { max: 32 });
  if (!STATUS.has(status)) {
    throw new ValidationError('Machine principal currentness status is invalid');
  }
  const principalType = requireString(
    raw.principal_type,
    'Machine principal currentness principal_type',
    { max: 16 }
  );
  if (!PRINCIPAL_TYPES.has(principalType)) {
    throw new ValidationError('Machine principal currentness principal_type is invalid');
  }
  const normalized = {
    schema: MACHINE_PRINCIPAL_CURRENTNESS_SCHEMA,
    principal_id: requireString(raw.principal_id, 'Machine principal currentness principal_id', {
      max: 160,
      pattern: /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/
    }),
    principal_type: principalType,
    authority_digest: requireString(
      raw.authority_digest,
      'Machine principal currentness authority_digest',
      { max: 64, pattern: DIGEST }
    ),
    status,
    sequence: requireSequence(raw.sequence),
    observed_at: requireTimestamp(raw.observed_at, 'Machine principal currentness observed_at'),
    source_head_digest: requireString(
      raw.source_head_digest,
      'Machine principal currentness source_head_digest',
      { max: 64, pattern: DIGEST }
    ),
    predecessor_head_digest: raw.predecessor_head_digest === null
      ? null
      : requireString(
          raw.predecessor_head_digest,
          'Machine principal currentness predecessor_head_digest',
          { max: 64, pattern: DIGEST }
        ),
    admission_digest: requireString(
      raw.admission_digest,
      'Machine principal currentness admission_digest',
      { max: 64, pattern: DIGEST }
    ),
    authority_effect: raw.authority_effect,
    execution_authority_granted: raw.execution_authority_granted,
    global_currentness_claimed: raw.global_currentness_claimed
  };
  if (
    normalized.authority_effect !== 'none'
    || normalized.execution_authority_granted !== false
    || normalized.global_currentness_claimed !== false
  ) {
    throw new ValidationError(
      'Machine principal currentness evidence must remain non-authorizing and must not claim global currentness'
    );
  }
  return Object.freeze(normalized);
}

export function machinePrincipalAdmissionDigest({
  principalId,
  principalType,
  authorityDigest,
  capabilityId,
  intentDigest,
  planDigest,
  effectDestination
} = {}) {
  const normalizedType = requireString(principalType, 'Effect admission principal type', { max: 16 });
  if (!PRINCIPAL_TYPES.has(normalizedType)) {
    throw new ValidationError('Effect admission principal type is invalid');
  }
  return digestObject({
    schema: 'axiom-machine-principal-effect-admission.v1',
    principal_id: requireString(principalId, 'Effect admission principal id', { max: 160 }),
    principal_type: normalizedType,
    authority_digest: requireString(authorityDigest, 'Effect admission authority digest', {
      max: 64,
      pattern: DIGEST
    }),
    capability_id: requireString(capabilityId, 'Effect admission capability id', { max: 192 }),
    intent_digest: requireString(intentDigest, 'Effect admission intent digest', {
      max: 64,
      pattern: DIGEST
    }),
    plan_digest: requireString(planDigest, 'Effect admission plan digest', {
      max: 64,
      pattern: DIGEST
    }),
    effect_destination: requireString(
      effectDestination,
      'Effect admission destination',
      { max: 256 }
    )
  });
}

export function evaluateMachinePrincipalCurrentness({
  currentness,
  expectedPrincipalId,
  expectedPrincipalType,
  expectedAuthorityDigest,
  expectedAdmissionDigest,
  now = new Date(),
  maxAgeMs,
  retainedSequence = null,
  retainedHeadDigest = null
} = {}) {
  const proof = normalizeMachinePrincipalCurrentness(currentness);
  const nowDate = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(nowDate.valueOf())) {
    throw new ValidationError('Machine principal currentness evaluation time is invalid');
  }
  if (!Number.isSafeInteger(maxAgeMs) || maxAgeMs < 0) {
    throw new ValidationError('Machine principal currentness maxAgeMs must be a non-negative integer');
  }

  if (proof.principal_id !== expectedPrincipalId) {
    return deny('machine_currentness_principal_mismatch');
  }
  if (proof.principal_type !== expectedPrincipalType) {
    return deny('machine_currentness_principal_type_mismatch');
  }
  if (proof.authority_digest !== expectedAuthorityDigest) {
    return deny('machine_currentness_authority_changed');
  }
  if (proof.admission_digest !== expectedAdmissionDigest) {
    return deny('machine_currentness_admission_mismatch');
  }
  if (proof.status !== 'active') {
    return deny(`machine_currentness_${proof.status}`);
  }

  const ageMs = nowDate.valueOf() - new Date(proof.observed_at).valueOf();
  if (ageMs < 0 || ageMs > maxAgeMs) {
    return deny('machine_currentness_stale');
  }

  if (retainedSequence !== null) {
    if (!Number.isSafeInteger(retainedSequence) || retainedSequence < 1) {
      throw new ValidationError('Machine principal retained currentness sequence is invalid');
    }
    if (proof.sequence < retainedSequence) {
      return deny('machine_currentness_rollback');
    }
    if (
      proof.sequence === retainedSequence
      && retainedHeadDigest !== null
      && proof.source_head_digest !== retainedHeadDigest
    ) {
      return deny('machine_currentness_equivocation');
    }
  }

  return Object.freeze({
    allow: true,
    code: 'machine_currentness_satisfied',
    currentness_sequence: proof.sequence,
    currentness_head_digest: proof.source_head_digest,
    currentness_evidence_digest: digestObject(proof),
    authority_effect: 'none',
    execution_authority_granted: false,
    global_currentness_claimed: false
  });
}

function deny(code) {
  return Object.freeze({
    allow: false,
    code,
    authority_effect: 'none',
    execution_authority_granted: false,
    global_currentness_claimed: false
  });
}
