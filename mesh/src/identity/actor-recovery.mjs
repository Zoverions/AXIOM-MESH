import {
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject
} from '../lib/canonical.mjs';
import {
  ACTOR_STATE_SCHEMA,
  normalizeActorState,
  normalizeCredentialEpoch,
  rotateCredentialEpoch
} from './actor-state.mjs';

export const RECOVERY_POLICY_SCHEMA = 'axiom-actor-recovery-policy.v1';
export const RECOVERY_ATTESTATION_SCHEMA = 'axiom-actor-recovery-attestation.v1';
export const RECOVERY_DECISION_SCHEMA = 'axiom-actor-recovery-decision.v1';
export const RECOVERY_COMPLETION_SCHEMA = 'axiom-actor-recovery-completed.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const ASSURANCE = Object.freeze({ A0: 0, A1: 1, A2: 2, A3: 3, A4: 4 });
const FACTOR_TYPES = new Set([
  'hardware_key',
  'trusted_device',
  'trusted_human',
  'guardian',
  'institution_attestation',
  'government_identity_attestation',
  'offline_secret',
  'recovery_service',
  'biometric_attestation'
]);
const FACTOR_CLASSES = new Set(['possession', 'knowledge', 'human', 'institution', 'biometric']);

function exactKeys(value, expected, name) {
  const actual = Object.keys(assertPlainObject(value, name)).sort();
  const wanted = [...expected].sort();
  if (actual.join(',') !== wanted.join(',')) throw new ValidationError(`${name} fields are invalid`);
}

function id(value, name) {
  return assertString(value, name, { min: 1, max: 192, pattern: ID });
}

function digest(value, name) {
  return assertString(value, name, { min: 64, max: 64, pattern: DIGEST });
}

function iso(value, name) {
  const text = assertString(value, name, { min: 20, max: 40 });
  if (Number.isNaN(Date.parse(text))) throw new ValidationError(`${name} must be an ISO timestamp`);
  return text;
}

function assurance(value, name) {
  const level = assertString(value, name, { min: 2, max: 2 });
  if (!Object.hasOwn(ASSURANCE, level)) throw new ValidationError(`${name} is invalid`);
  return level;
}

function normalizeFactor(raw, index) {
  exactKeys(raw, [
    'factor_id', 'factor_type', 'factor_class', 'attestor_actor_id',
    'minimum_assurance', 'effective_at', 'expires_at', 'status'
  ], `factor_profiles[${index}]`);
  const factorType = assertString(raw.factor_type, `factor_profiles[${index}].factor_type`);
  if (!FACTOR_TYPES.has(factorType)) throw new ValidationError('recovery factor type is invalid');
  const factorClass = assertString(raw.factor_class, `factor_profiles[${index}].factor_class`);
  if (!FACTOR_CLASSES.has(factorClass)) throw new ValidationError('recovery factor class is invalid');
  const expiresAt = raw.expires_at === null ? null : iso(raw.expires_at, `factor_profiles[${index}].expires_at`);
  if (!['active', 'revoked', 'retired'].includes(raw.status)) throw new ValidationError('recovery factor status is invalid');
  return {
    factor_id: id(raw.factor_id, `factor_profiles[${index}].factor_id`),
    factor_type: factorType,
    factor_class: factorClass,
    attestor_actor_id: raw.attestor_actor_id === null ? null : id(raw.attestor_actor_id, `factor_profiles[${index}].attestor_actor_id`),
    minimum_assurance: assurance(raw.minimum_assurance, `factor_profiles[${index}].minimum_assurance`),
    effective_at: iso(raw.effective_at, `factor_profiles[${index}].effective_at`),
    expires_at: expiresAt,
    status: raw.status
  };
}

export function normalizeRecoveryPolicy(raw) {
  exactKeys(raw, [
    'schema', 'policy_id', 'subject_actor_id', 'factor_profiles', 'threshold',
    'required_factor_classes', 'minimum_decision_assurance', 'effective_at',
    'expires_at', 'status', 'ordinary_authority_granted'
  ], 'recovery policy');
  if (raw.schema !== RECOVERY_POLICY_SCHEMA) throw new ValidationError('recovery policy schema is invalid');
  if (!Array.isArray(raw.factor_profiles) || raw.factor_profiles.length < 1 || raw.factor_profiles.length > 32) {
    throw new ValidationError('recovery policy requires 1-32 factor profiles');
  }
  const factors = raw.factor_profiles.map(normalizeFactor);
  if (new Set(factors.map(item => item.factor_id)).size !== factors.length) {
    throw new ValidationError('recovery factor ids must be unique');
  }
  if (!Number.isSafeInteger(raw.threshold) || raw.threshold < 1 || raw.threshold > factors.length) {
    throw new ValidationError('recovery threshold is invalid');
  }
  if (!Array.isArray(raw.required_factor_classes) || raw.required_factor_classes.length > 5) {
    throw new ValidationError('required_factor_classes is invalid');
  }
  const requiredClasses = raw.required_factor_classes.map((value, index) => {
    const factorClass = assertString(value, `required_factor_classes[${index}]`);
    if (!FACTOR_CLASSES.has(factorClass)) throw new ValidationError('required recovery factor class is invalid');
    return factorClass;
  });
  if (new Set(requiredClasses).size !== requiredClasses.length) {
    throw new ValidationError('required recovery factor classes must be unique');
  }
  if (raw.ordinary_authority_granted !== false) {
    throw new ValidationError('recovery policy cannot grant ordinary authority');
  }
  return {
    schema: RECOVERY_POLICY_SCHEMA,
    policy_id: id(raw.policy_id, 'policy_id'),
    subject_actor_id: id(raw.subject_actor_id, 'subject_actor_id'),
    factor_profiles: factors,
    threshold: raw.threshold,
    required_factor_classes: [...requiredClasses].sort(),
    minimum_decision_assurance: assurance(raw.minimum_decision_assurance, 'minimum_decision_assurance'),
    effective_at: iso(raw.effective_at, 'effective_at'),
    expires_at: raw.expires_at === null ? null : iso(raw.expires_at, 'expires_at'),
    status: ['active', 'revoked', 'retired'].includes(raw.status) ? raw.status : (() => { throw new ValidationError('recovery policy status is invalid'); })(),
    ordinary_authority_granted: false
  };
}

export function normalizeRecoveryAttestation(raw) {
  exactKeys(raw, [
    'schema', 'recovery_case_id', 'subject_actor_id', 'factor_id', 'factor_type',
    'factor_class', 'attestor_actor_id', 'evidence_digest', 'assurance', 'verdict',
    'observed_at', 'expires_at'
  ], 'recovery attestation');
  if (raw.schema !== RECOVERY_ATTESTATION_SCHEMA) throw new ValidationError('recovery attestation schema is invalid');
  if (!['pass', 'fail'].includes(raw.verdict)) throw new ValidationError('recovery attestation verdict is invalid');
  const factorType = assertString(raw.factor_type, 'factor_type');
  const factorClass = assertString(raw.factor_class, 'factor_class');
  if (!FACTOR_TYPES.has(factorType) || !FACTOR_CLASSES.has(factorClass)) {
    throw new ValidationError('recovery attestation factor is invalid');
  }
  return {
    schema: RECOVERY_ATTESTATION_SCHEMA,
    recovery_case_id: id(raw.recovery_case_id, 'recovery_case_id'),
    subject_actor_id: id(raw.subject_actor_id, 'subject_actor_id'),
    factor_id: id(raw.factor_id, 'factor_id'),
    factor_type: factorType,
    factor_class: factorClass,
    attestor_actor_id: raw.attestor_actor_id === null ? null : id(raw.attestor_actor_id, 'attestor_actor_id'),
    evidence_digest: digest(raw.evidence_digest, 'evidence_digest'),
    assurance: assurance(raw.assurance, 'assurance'),
    verdict: raw.verdict,
    observed_at: iso(raw.observed_at, 'observed_at'),
    expires_at: iso(raw.expires_at, 'expires_at')
  };
}

export function evaluateRecovery(policyRaw, attestationsRaw, {
  recoveryCaseId,
  subjectActorId,
  now = new Date().toISOString()
}) {
  const policy = normalizeRecoveryPolicy(policyRaw);
  const caseId = id(recoveryCaseId, 'recoveryCaseId');
  const subject = id(subjectActorId, 'subjectActorId');
  const observedAt = iso(now, 'now');
  if (policy.subject_actor_id !== subject) throw new ValidationError('recovery policy subject mismatch');
  if (policy.status !== 'active' || policy.effective_at > observedAt || (policy.expires_at && policy.expires_at <= observedAt)) {
    throw new ValidationError('recovery policy is not active at evaluation time');
  }
  if (!Array.isArray(attestationsRaw) || attestationsRaw.length > 32) {
    throw new ValidationError('recovery attestations are invalid');
  }
  const profiles = new Map(policy.factor_profiles.map(item => [item.factor_id, item]));
  const accepted = [];
  const rejected = [];
  const seen = new Set();
  for (const raw of attestationsRaw) {
    const attestation = normalizeRecoveryAttestation(raw);
    if (seen.has(attestation.factor_id)) throw new ValidationError('duplicate recovery factor attestation');
    seen.add(attestation.factor_id);
    const profile = profiles.get(attestation.factor_id);
    const reasons = [];
    if (!profile) reasons.push('factor_not_in_policy');
    if (attestation.recovery_case_id !== caseId) reasons.push('case_mismatch');
    if (attestation.subject_actor_id !== subject) reasons.push('subject_mismatch');
    if (attestation.verdict !== 'pass') reasons.push('factor_failed');
    if (attestation.expires_at <= observedAt || attestation.observed_at > observedAt) reasons.push('attestation_not_current');
    if (ASSURANCE[attestation.assurance] < ASSURANCE[policy.minimum_decision_assurance]) {
      reasons.push('decision_assurance_too_low');
    }
    if (profile) {
      if (profile.status !== 'active' || profile.effective_at > observedAt || (profile.expires_at && profile.expires_at <= observedAt)) reasons.push('factor_profile_inactive');
      if (profile.factor_type !== attestation.factor_type || profile.factor_class !== attestation.factor_class) reasons.push('factor_profile_mismatch');
      if (profile.attestor_actor_id !== attestation.attestor_actor_id) reasons.push('attestor_mismatch');
      if (ASSURANCE[attestation.assurance] < ASSURANCE[profile.minimum_assurance]) reasons.push('factor_assurance_too_low');
    }
    if (reasons.length) rejected.push({ factor_id: attestation.factor_id, reasons });
    else accepted.push(attestation);
  }
  const classes = new Set(accepted.map(item => item.factor_class));
  const requiredClassesPresent = policy.required_factor_classes.every(value => classes.has(value));
  const achievedAssurance = accepted.reduce((minimum, item) => (
    minimum === null || ASSURANCE[item.assurance] < ASSURANCE[minimum] ? item.assurance : minimum
  ), null);
  const approved = accepted.length >= policy.threshold
    && requiredClassesPresent
    && achievedAssurance !== null
    && ASSURANCE[achievedAssurance] >= ASSURANCE[policy.minimum_decision_assurance];
  return {
    schema: RECOVERY_DECISION_SCHEMA,
    recovery_case_id: caseId,
    subject_actor_id: subject,
    policy_id: policy.policy_id,
    policy_digest: digestObject(policy),
    evaluated_at: observedAt,
    approved,
    accepted_factor_ids: accepted.map(item => item.factor_id).sort(),
    rejected,
    achieved_assurance: achievedAssurance,
    threshold: policy.threshold,
    required_factor_classes: policy.required_factor_classes,
    ordinary_authority_granted: false
  };
}

export function completeRecovery({ actorState, decision, nextCredentialEpoch, completedAt }) {
  const actor = normalizeActorState(actorState);
  const decided = assertPlainObject(decision, 'recovery decision');
  if (decided.schema !== RECOVERY_DECISION_SCHEMA || decided.approved !== true) {
    throw new ValidationError('recovery completion requires an approved recovery decision');
  }
  if (decided.subject_actor_id !== actor.actor_id) throw new ValidationError('recovery decision actor mismatch');
  if (!['restricted', 'recovery_pending'].includes(actor.lifecycle_state)) {
    throw new ValidationError('actor is not in a recoverable lifecycle state');
  }
  const next = normalizeCredentialEpoch(nextCredentialEpoch);
  const recovered = rotateCredentialEpoch(actor, next);
  const completed = iso(completedAt, 'completedAt');
  const state = normalizeActorState({
    ...recovered,
    schema: ACTOR_STATE_SCHEMA,
    lifecycle_state: 'recovered'
  });
  return {
    schema: RECOVERY_COMPLETION_SCHEMA,
    recovery_case_id: decided.recovery_case_id,
    subject_actor_id: actor.actor_id,
    prior_credential_epoch_id: actor.active_epoch_id,
    new_credential_epoch_id: state.active_epoch_id,
    policy_digest: digest(decided.policy_digest, 'decision.policy_digest'),
    decision_digest: digestObject(decided),
    accepted_factor_ids: [...decided.accepted_factor_ids].sort(),
    assurance: decided.achieved_assurance,
    completed_at: completed,
    ordinary_authority_granted: false,
    actor_state: state
  };
}
