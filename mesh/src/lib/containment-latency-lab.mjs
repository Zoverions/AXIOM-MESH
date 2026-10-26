import { ValidationError } from './canonical.mjs';

const ACK_STATES = new Set(['acknowledged', 'pending', 'unreachable']);
const EFFECT_OUTCOMES = new Set(['denied', 'succeeded']);
const RESUMPTION_SOURCES = new Set(['restart', 'shared-state', 'descendant']);
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;

export function evaluateContainmentLatency(input) {
  const value = exactObject(input, 'containment scenario', [
    'scenario_id', 'decision_at', 'planes'
  ]);
  const decision = timestamp(value.decision_at, 'decision_at');
  if (!Array.isArray(value.planes) || value.planes.length < 1 || value.planes.length > 32) {
    throw new ValidationError('planes must contain 1-32 simulated authority planes');
  }

  const seen = new Set();
  const planes = value.planes.map((plane, index) => {
    const normalized = normalizePlane(plane, index, decision);
    if (seen.has(normalized.plane_id)) {
      throw new ValidationError('plane_id values must be unique');
    }
    seen.add(normalized.plane_id);
    return normalized;
  });

  const unresolved = planes
    .filter(plane => plane.required && plane.acknowledgement_status !== 'acknowledged')
    .map(plane => Object.freeze({
      plane_id: plane.plane_id,
      condition: plane.acknowledgement_status
    }));
  const falseSuccesses = planes.flatMap(plane => plane.false_success_conditions);
  const missingDenial = planes
    .filter(plane => plane.required && plane.first_denied_effect_at === null)
    .map(plane => Object.freeze({
      plane_id: plane.plane_id,
      condition: 'no-post-decision-denial-evidence'
    }));
  const complete = unresolved.length === 0
    && falseSuccesses.length === 0
    && missingDenial.length === 0;

  return deepFreeze({
    schema: 'axiom-containment-latency-lab-result.v0',
    scenario_id: identifier(value.scenario_id, 'scenario_id'),
    decision_at: decision.toISOString(),
    result: complete ? 'COMPLETE' : 'INCOMPLETE',
    protected_effects_allowed: false,
    planes,
    unresolved_edges: unresolved,
    false_success_conditions: falseSuccesses,
    missing_denial_evidence: missingDenial,
    authority_effect: 'none',
    production_certified: false
  });
}

export function evaluateContainmentResumption(input) {
  const value = exactObject(input, 'resumption scenario', [
    'scenario_id', 'containment_epoch', 'decision_at',
    'recovery_authorizations', 'attempts'
  ]);
  const decision = timestamp(value.decision_at, 'decision_at');
  const containmentEpoch = identifier(value.containment_epoch, 'containment_epoch');
  if (!Array.isArray(value.recovery_authorizations)
    || value.recovery_authorizations.length > 64) {
    throw new ValidationError('recovery_authorizations must contain 0-64 synthetic records');
  }
  if (!Array.isArray(value.attempts) || value.attempts.length < 1
    || value.attempts.length > 128) {
    throw new ValidationError('attempts must contain 1-128 synthetic observations');
  }

  const authorizationIds = new Set();
  const authorizations = value.recovery_authorizations.map((authorization, index) => {
    const normalized = normalizeRecoveryAuthorization(
      authorization, `recovery_authorizations[${index}]`
    );
    if (authorizationIds.has(normalized.authorization_id)) {
      throw new ValidationError('authorization_id values must be unique');
    }
    authorizationIds.add(normalized.authorization_id);
    return normalized;
  });

  const attemptIds = new Set();
  const attempts = value.attempts.map((attempt, index) => {
    const normalized = normalizeResumptionAttempt(attempt, `attempts[${index}]`, decision);
    if (attemptIds.has(normalized.attempt_id)) {
      throw new ValidationError('attempt_id values must be unique');
    }
    attemptIds.add(normalized.attempt_id);
    return normalized;
  });

  const falseSuccessConditions = [];
  const matchingRecoveryEvidence = [];

  for (const attempt of attempts) {
    if (attempt.outcome !== 'succeeded') continue;

    if (attempt.persisted_containment_epoch !== containmentEpoch) {
      falseSuccessConditions.push(Object.freeze({
        attempt_id: attempt.attempt_id,
        source: attempt.source,
        authority_path: attempt.authority_path,
        condition: `${attempt.source}-did-not-preserve-containment-epoch`
      }));
    }

    const authorization = authorizations.find(candidate =>
      candidate.authorization_id === attempt.recovery_authorization_id);
    const authorizationMatches = authorization
      && authorization.current
      && authorization.containment_epoch === containmentEpoch
      && authorization.authority_path === attempt.authority_path
      && new Date(authorization.issued_at).valueOf() > decision.valueOf()
      && new Date(authorization.issued_at).valueOf()
        <= new Date(attempt.attempted_at).valueOf();

    if (!authorizationMatches) {
      falseSuccessConditions.push(Object.freeze({
        attempt_id: attempt.attempt_id,
        source: attempt.source,
        authority_path: attempt.authority_path,
        condition: 'successful-reentry-without-fresh-recovery-authorization'
      }));
    } else {
      matchingRecoveryEvidence.push(Object.freeze({
        attempt_id: attempt.attempt_id,
        authorization_id: authorization.authorization_id,
        authority_path: attempt.authority_path
      }));
    }
  }

  return deepFreeze({
    schema: 'axiom-containment-resumption-lab-result.v0',
    scenario_id: identifier(value.scenario_id, 'scenario_id'),
    containment_epoch: containmentEpoch,
    decision_at: decision.toISOString(),
    result: falseSuccessConditions.length === 0 ? 'COMPLETE' : 'INCOMPLETE',
    attempts,
    matching_recovery_evidence: matchingRecoveryEvidence,
    false_success_conditions: falseSuccessConditions,
    authority_effect: 'none',
    authorizes_reentry: false,
    production_certified: false
  });
}

function normalizeRecoveryAuthorization(raw, label) {
  const value = exactObject(raw, label, [
    'authorization_id', 'issued_at', 'containment_epoch',
    'authority_path', 'current'
  ]);
  if (typeof value.current !== 'boolean') {
    throw new ValidationError(`${label}.current must be boolean`);
  }
  return Object.freeze({
    authorization_id: identifier(value.authorization_id, `${label}.authorization_id`),
    issued_at: timestamp(value.issued_at, `${label}.issued_at`).toISOString(),
    containment_epoch: identifier(value.containment_epoch, `${label}.containment_epoch`),
    authority_path: identifier(value.authority_path, `${label}.authority_path`),
    current: value.current
  });
}

function normalizeResumptionAttempt(raw, label, decision) {
  const value = exactObject(raw, label, [
    'attempt_id', 'source', 'authority_path', 'persisted_containment_epoch',
    'attempted_at', 'recovery_authorization_id', 'outcome'
  ]);
  if (!RESUMPTION_SOURCES.has(value.source)) {
    throw new ValidationError(`${label}.source is invalid`);
  }
  if (value.persisted_containment_epoch !== null) {
    identifier(value.persisted_containment_epoch, `${label}.persisted_containment_epoch`);
  }
  if (value.recovery_authorization_id !== null) {
    identifier(value.recovery_authorization_id, `${label}.recovery_authorization_id`);
  }
  if (!EFFECT_OUTCOMES.has(value.outcome)) {
    throw new ValidationError(`${label}.outcome is invalid`);
  }
  const attemptedAt = timestamp(value.attempted_at, `${label}.attempted_at`);
  if (attemptedAt.valueOf() < decision.valueOf()) {
    throw new ValidationError(`${label}.attempted_at precedes the containment decision`);
  }
  return Object.freeze({
    attempt_id: identifier(value.attempt_id, `${label}.attempt_id`),
    source: value.source,
    authority_path: identifier(value.authority_path, `${label}.authority_path`),
    persisted_containment_epoch: value.persisted_containment_epoch,
    attempted_at: attemptedAt.toISOString(),
    recovery_authorization_id: value.recovery_authorization_id,
    outcome: value.outcome
  });
}

function normalizePlane(raw, index, decision) {
  const label = `planes[${index}]`;
  const value = exactObject(raw, label, [
    'plane_id', 'required', 'acknowledgement_status', 'acknowledged_at', 'effects'
  ]);
  if (typeof value.required !== 'boolean') {
    throw new ValidationError(`${label}.required must be boolean`);
  }
  if (!ACK_STATES.has(value.acknowledgement_status)) {
    throw new ValidationError(`${label}.acknowledgement_status is invalid`);
  }
  const acknowledgedAt = nullableTimestamp(value.acknowledged_at, `${label}.acknowledged_at`);
  if ((value.acknowledgement_status === 'acknowledged') !== (acknowledgedAt !== null)) {
    throw new ValidationError(`${label} acknowledgement timestamp/status mismatch`);
  }
  if (acknowledgedAt && acknowledgedAt.valueOf() < decision.valueOf()) {
    throw new ValidationError(`${label}.acknowledged_at precedes the decision`);
  }
  if (!Array.isArray(value.effects) || value.effects.length < 1 || value.effects.length > 128) {
    throw new ValidationError(`${label}.effects must contain 1-128 observations`);
  }

  const effects = value.effects.map((effect, effectIndex) =>
    normalizeEffect(effect, `${label}.effects[${effectIndex}]`));
  const afterDecision = effects.filter(effect =>
    new Date(effect.attempted_at).valueOf() >= decision.valueOf());
  const denied = afterDecision.filter(effect => effect.outcome === 'denied');
  const succeeded = afterDecision.filter(effect => effect.outcome === 'succeeded');
  const falseSuccessConditions = [];

  for (const effect of succeeded) {
    falseSuccessConditions.push(Object.freeze({
      plane_id: value.plane_id,
      effect_id: effect.effect_id,
      authority_path: effect.authority_path,
      condition: 'post-decision-protected-effect-succeeded'
    }));
  }
  for (const effect of afterDecision) {
    if (new Date(effect.queued_at).valueOf() < decision.valueOf()
      && !effect.currentness_rechecked) {
      falseSuccessConditions.push(Object.freeze({
        plane_id: value.plane_id,
        effect_id: effect.effect_id,
        authority_path: effect.authority_path,
        condition: 'queued-effect-skipped-currentness-recheck'
      }));
    }
  }

  const firstDenied = earliest(denied.map(effect => effect.attempted_at));
  const lastSuccessful = latest(succeeded.map(effect => effect.attempted_at));
  return {
    plane_id: identifier(value.plane_id, `${label}.plane_id`),
    required: value.required,
    acknowledgement_status: value.acknowledgement_status,
    acknowledged_at: acknowledgedAt?.toISOString() ?? null,
    first_denied_effect_at: firstDenied,
    last_successful_effect_at: lastSuccessful,
    time_to_effect_denial_ms: firstDenied === null
      ? null
      : new Date(firstDenied).valueOf() - decision.valueOf(),
    effects,
    false_success_conditions: falseSuccessConditions
  };
}

function normalizeEffect(raw, label) {
  const value = exactObject(raw, label, [
    'effect_id', 'authority_path', 'queued_at', 'attempted_at',
    'currentness_rechecked', 'outcome'
  ]);
  const queuedAt = timestamp(value.queued_at, `${label}.queued_at`);
  const attemptedAt = timestamp(value.attempted_at, `${label}.attempted_at`);
  if (attemptedAt.valueOf() < queuedAt.valueOf()) {
    throw new ValidationError(`${label}.attempted_at precedes queued_at`);
  }
  if (typeof value.currentness_rechecked !== 'boolean') {
    throw new ValidationError(`${label}.currentness_rechecked must be boolean`);
  }
  if (!EFFECT_OUTCOMES.has(value.outcome)) {
    throw new ValidationError(`${label}.outcome is invalid`);
  }
  return Object.freeze({
    effect_id: identifier(value.effect_id, `${label}.effect_id`),
    authority_path: identifier(value.authority_path, `${label}.authority_path`),
    queued_at: queuedAt.toISOString(),
    attempted_at: attemptedAt.toISOString(),
    currentness_rechecked: value.currentness_rechecked,
    outcome: value.outcome
  });
}

function exactObject(value, label, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new ValidationError(`${label} must be a plain object`);
  }
  const expected = [...fields].sort();
  const actual = Object.keys(value).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new ValidationError(`${label} fields are invalid`);
  }
  return value;
}

function identifier(value, label) {
  if (typeof value !== 'string' || !ID.test(value)) {
    throw new ValidationError(`${label} is invalid`);
  }
  return value;
}

function timestamp(value, label) {
  if (typeof value !== 'string' || value.length > 64) {
    throw new ValidationError(`${label} must be an ISO timestamp`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.valueOf()) || date.toISOString() !== value) {
    throw new ValidationError(`${label} must be an ISO timestamp`);
  }
  return date;
}

function nullableTimestamp(value, label) {
  return value === null ? null : timestamp(value, label);
}

function earliest(values) {
  return values.length === 0 ? null : [...values].sort()[0];
}

function latest(values) {
  return values.length === 0 ? null : [...values].sort().at(-1);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
