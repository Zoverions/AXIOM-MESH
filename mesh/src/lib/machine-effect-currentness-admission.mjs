import {
  ValidationError,
  assertPlainObject,
  assertString
} from './canonical.mjs';
import { normalizeMachinePrincipalDefinition } from './machine-principal.mjs';
import { evaluateMachineAuthorityCurrentnessAtEffect } from './machine-authority-currentness-checkpoint.mjs';

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
  const capability = normalizeVerifiedCapabilityAuthority(
    verifiedCapabilityClaims,
    effectAt
  );
  const base = authorityDecisionBase(capability, {
    sourceVerificationExternal: true
  });

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
      now: new Date(capability.effectTime)
    });
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    return deny(base, {
      code: 'machine_principal_currentness_invalid',
      reason: 'Current machine principal authority is invalid at the effect boundary',
      currentAuthorityDigest: null
    });
  }

  return compareCurrentAuthority(base, {
    currentPrincipalId: current.id,
    currentAuthorityDigest: current.authority_digest,
    allowEvidence: {
      current_sponsor: current.sponsor,
      current_runtime_id: current.runtime.id
    }
  });
}

/**
 * Verify a signed, retained authority-currentness head and bind its exact
 * current authority digest into the capability comparison.
 *
 * Unlike evaluateMachineEffectAuthorityCurrentness(), this path authenticates
 * the current-authority evidence through the caller-supplied trusted Ed25519
 * source key, checks the expected latest head and freshness, then compares the
 * resulting digest with the already-verified capability claims. It remains a
 * deny-only prerequisite: an allow result is not permission to execute by
 * itself and does not evaluate the normal authorization policy.
 */
export function evaluateMachineEffectAuthorityCheckpointAdmission({
  verifiedCapabilityClaims,
  authorityCheckpoint,
  trustedAuthoritySourcePublicKey,
  expectedLatestCheckpointDigest,
  effectAt,
  maxEvidenceAgeMs = 30_000
} = {}) {
  const capability = normalizeVerifiedCapabilityAuthority(
    verifiedCapabilityClaims,
    effectAt
  );
  const currentness = evaluateMachineAuthorityCurrentnessAtEffect({
    checkpoint: authorityCheckpoint,
    trustedAuthoritySourcePublicKey,
    expectedLatestCheckpointDigest,
    effectAt: capability.effectTime,
    maxEvidenceAgeMs
  });
  const base = authorityDecisionBase(capability, {
    sourceVerificationExternal: false,
    extra: {
      authority_currentness_source_verified: true,
      authority_checkpoint_digest: currentness.checkpoint_digest,
      authority_source_id: currentness.authority_source_id,
      authority_source_key_id: currentness.authority_source_key_id,
      authority_evidence_evaluated_at: currentness.evaluated_at,
      authority_evidence_age_ms: currentness.evidence_age_ms,
      authority_max_evidence_age_ms: currentness.max_evidence_age_ms
    }
  });

  return compareCurrentAuthority(base, {
    currentPrincipalId: currentness.principal_id,
    currentAuthorityDigest: currentness.current_authority_digest
  });
}

function normalizeVerifiedCapabilityAuthority(rawClaims, effectAt) {
  const claims = assertPlainObject(
    rawClaims,
    'verified machine effect capability claims'
  );
  return Object.freeze({
    principalId: assertString(
      claims.subject,
      'verified machine effect capability subject',
      { min: 1, max: 160, pattern: PRINCIPAL_ID }
    ),
    authorityDigest: assertString(
      claims.authority_digest,
      'verified machine effect capability authority_digest',
      { min: 64, max: 64, pattern: DIGEST }
    ),
    effectTime: canonicalTimestamp(effectAt)
  });
}

function authorityDecisionBase(capability, {
  sourceVerificationExternal,
  extra = {}
} = {}) {
  return {
    schema: 'axiom-machine-effect-authority-currentness.v1',
    principal_id: capability.principalId,
    capability_authority_digest: capability.authorityDigest,
    effect_at: capability.effectTime,
    source_verification_external: sourceVerificationExternal,
    effect_admission_authorized: false,
    authority_effect: 'none',
    delegation_effect: 'none',
    ...extra
  };
}

function compareCurrentAuthority(base, {
  currentPrincipalId,
  currentAuthorityDigest,
  allowEvidence = {}
}) {
  if (currentPrincipalId !== base.principal_id) {
    return deny(base, {
      code: 'machine_principal_currentness_subject_mismatch',
      reason: 'Current machine principal does not match the capability subject',
      currentAuthorityDigest
    });
  }
  if (currentAuthorityDigest !== base.capability_authority_digest) {
    return deny(base, {
      code: 'machine_authority_stale',
      reason: 'Machine principal authority changed after capability issuance; new effect denied',
      currentAuthorityDigest
    });
  }
  return Object.freeze({
    ...base,
    allow: true,
    code: 'machine_effect_authority_current',
    reason: 'Current machine principal authority exactly matches the issued capability authority',
    current_authority_digest: currentAuthorityDigest,
    ...allowEvidence
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
