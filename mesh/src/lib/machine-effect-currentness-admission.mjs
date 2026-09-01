import {
  ValidationError,
  assertPlainObject,
  assertString
} from './canonical.mjs';
import { normalizeMachinePrincipalDefinition } from './machine-principal.mjs';

const PRINCIPAL_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;

/**
 * Compare authority embedded in an already-verified execution capability with
 * the machine principal definition supplied as current at the effect boundary.
 *
 * This is deliberately a deny-only prerequisite. It does not verify the
 * capability signature, authenticate the current-authority source, or grant an
 * effect. Callers must establish those independent trust properties before
 * treating an allow result as one input to the normal effect-admission path.
 */
export function evaluateMachineEffectAuthorityCurrentness({
  verifiedCapabilityClaims,
  currentPrincipal,
  effectAt
} = {}) {
  const claims = assertPlainObject(
    verifiedCapabilityClaims,
    'verified machine effect capability claims'
  );
  const principalId = assertString(
    claims.subject,
    'verified machine effect capability subject',
    { min: 1, max: 160, pattern: PRINCIPAL_ID }
  );
  const capabilityAuthorityDigest = assertString(
    claims.authority_digest,
    'verified machine effect capability authority_digest',
    { min: 64, max: 64, pattern: DIGEST }
  );
  const effectTime = canonicalTimestamp(effectAt);
  const base = {
    schema: 'axiom-machine-effect-authority-currentness.v1',
    principal_id: principalId,
    capability_authority_digest: capabilityAuthorityDigest,
    effect_at: effectTime,
    source_verification_external: true,
    effect_admission_authorized: false,
    authority_effect: 'none',
    delegation_effect: 'none'
  };

  if (currentPrincipal === null || currentPrincipal === undefined) {
    return deny(base, {
      code: 'machine_principal_currentness_missing',
      reason: 'No current machine principal authority is available at the effect boundary',
      currentAuthorityDigest: null
    });
  }

  let current;
  try {
    current = normalizeMachinePrincipalDefinition(currentPrincipal, {
      now: new Date(effectTime)
    });
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    return deny(base, {
      code: 'machine_principal_currentness_invalid',
      reason: 'Current machine principal authority is invalid at the effect boundary',
      currentAuthorityDigest: null
    });
  }

  if (current.id !== principalId) {
    return deny(base, {
      code: 'machine_principal_currentness_subject_mismatch',
      reason: 'Current machine principal does not match the capability subject',
      currentAuthorityDigest: current.authority_digest
    });
  }

  if (current.authority_digest !== capabilityAuthorityDigest) {
    return deny(base, {
      code: 'machine_authority_stale',
      reason: 'Machine principal authority changed after capability issuance; new effect denied',
      currentAuthorityDigest: current.authority_digest
    });
  }

  return Object.freeze({
    ...base,
    allow: true,
    code: 'machine_effect_authority_current',
    reason: 'Current machine principal authority exactly matches the issued capability authority',
    current_authority_digest: current.authority_digest,
    current_sponsor: current.sponsor,
    current_runtime_id: current.runtime.id
  });
}

function canonicalTimestamp(value) {
  const text = assertString(value, 'machine effect authority currentness effectAt', {
    min: 24,
    max: 24
  });
  const parsed = new Date(text);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== text) {
    throw new ValidationError(
      'machine effect authority currentness effectAt must be a canonical UTC ISO timestamp'
    );
  }
  return text;
}

function deny(base, { code, reason, currentAuthorityDigest }) {
  return Object.freeze({
    ...base,
    allow: false,
    code,
    reason,
    current_authority_digest: currentAuthorityDigest
  });
}
