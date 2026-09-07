import {
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject
} from './canonical.mjs';

export const AUTHORITY_VERIFIABILITY_SCHEMA = 'axiom-authority-verifiability-decision.v1';
export const AUTHORITY_VERIFIABILITY_NOTICE = 'eligibility_is_not_authorization';

const DIGEST = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const ACTION = /^[a-z][a-z0-9.-]{1,127}$/;

const ROOT_KEYS = new Set(['request', 'evidence']);
const REQUEST_KEYS = new Set([
  'request_id',
  'principal_id',
  'action',
  'risk',
  'effect_destination',
  'authority_level',
  'autonomy_level',
  'novelty_signals',
  'external_agent_interaction',
  'self_modification'
]);
const EVIDENCE_KEYS = new Set([
  'policy_binding_digest',
  'identity_current',
  'delegation_current',
  'evidence_bound',
  'monitorability_level',
  'independent_monitor',
  'independent_evaluator',
  'human_authorization_present',
  'rollback_available',
  'rollback_tested'
]);

const RISK_PROFILE = Object.freeze({
  low: Object.freeze({ monitorability: 1, maxLeaseMs: 900_000 }),
  medium: Object.freeze({ monitorability: 2, maxLeaseMs: 300_000 }),
  high: Object.freeze({ monitorability: 3, maxLeaseMs: 60_000 }),
  critical: Object.freeze({ monitorability: 4, maxLeaseMs: 15_000 })
});

const NOVELTY_SIGNALS = new Set([
  'counterparty',
  'environment',
  'model',
  'objective',
  'policy-context',
  'tool'
]);

const SEMANTICS = Object.freeze({
  grants_execution_authority: false,
  mints_capability: false,
  consumes_capability: false,
  grants_delegation: false,
  changes_policy: false,
  changes_currentness: false,
  authority_effect: 'none',
  network_effect: 'none',
  state_effect: 'none',
  requires_downstream_authorization: true
});

function exactObject(raw, allowed, label) {
  const value = assertPlainObject(raw, label);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new ValidationError(`${label} contains unsupported field ${key}`);
    }
  }
  return value;
}

function boolean(value, label) {
  if (typeof value !== 'boolean') {
    throw new ValidationError(`${label} must be boolean`);
  }
  return value;
}

function level(value, label) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 4) {
    throw new ValidationError(`${label} must be an integer from 0 through 4`);
  }
  return value;
}

function enumValue(value, allowed, label) {
  const text = assertString(value, label, { min: 1, max: 64 });
  if (!allowed.has(text)) {
    throw new ValidationError(`${label} is unsupported`);
  }
  return text;
}

function normalizeNoveltySignals(raw) {
  if (!Array.isArray(raw) || raw.length > NOVELTY_SIGNALS.size) {
    throw new ValidationError(`authority verifiability request novelty_signals must contain at most ${NOVELTY_SIGNALS.size} items`);
  }

  const values = raw.map((item, index) => enumValue(
    item,
    NOVELTY_SIGNALS,
    `authority verifiability request novelty_signals[${index}]`
  ));
  const canonical = [...new Set(values)].sort();
  if (canonicalJson(values) !== canonicalJson(canonical)) {
    throw new ValidationError('authority verifiability request novelty_signals must be sorted, unique and known');
  }
  return Object.freeze(canonical);
}

function normalizeRequest(raw) {
  const value = exactObject(raw, REQUEST_KEYS, 'authority verifiability request');
  const risk = enumValue(value.risk, new Set(Object.keys(RISK_PROFILE)), 'authority verifiability request risk');

  return Object.freeze({
    request_id: assertString(value.request_id, 'authority verifiability request request_id', {
      min: 1,
      max: 192,
      pattern: ID
    }),
    principal_id: assertString(value.principal_id, 'authority verifiability request principal_id', {
      min: 1,
      max: 192,
      pattern: ID
    }),
    action: assertString(value.action, 'authority verifiability request action', {
      min: 2,
      max: 128,
      pattern: ACTION
    }),
    risk,
    effect_destination: assertString(
      value.effect_destination,
      'authority verifiability request effect_destination',
      { min: 1, max: 256 }
    ),
    authority_level: level(value.authority_level, 'authority verifiability request authority_level'),
    autonomy_level: level(value.autonomy_level, 'authority verifiability request autonomy_level'),
    novelty_signals: normalizeNoveltySignals(value.novelty_signals),
    external_agent_interaction: boolean(
      value.external_agent_interaction,
      'authority verifiability request external_agent_interaction'
    ),
    self_modification: boolean(
      value.self_modification,
      'authority verifiability request self_modification'
    )
  });
}

function normalizeEvidence(raw) {
  const value = exactObject(raw, EVIDENCE_KEYS, 'authority verifiability evidence');
  const normalized = Object.freeze({
    policy_binding_digest: assertString(
      value.policy_binding_digest,
      'authority verifiability evidence policy_binding_digest',
      { min: 64, max: 64, pattern: DIGEST }
    ),
    identity_current: boolean(value.identity_current, 'authority verifiability evidence identity_current'),
    delegation_current: boolean(value.delegation_current, 'authority verifiability evidence delegation_current'),
    evidence_bound: boolean(value.evidence_bound, 'authority verifiability evidence evidence_bound'),
    monitorability_level: level(
      value.monitorability_level,
      'authority verifiability evidence monitorability_level'
    ),
    independent_monitor: boolean(
      value.independent_monitor,
      'authority verifiability evidence independent_monitor'
    ),
    independent_evaluator: boolean(
      value.independent_evaluator,
      'authority verifiability evidence independent_evaluator'
    ),
    human_authorization_present: boolean(
      value.human_authorization_present,
      'authority verifiability evidence human_authorization_present'
    ),
    rollback_available: boolean(
      value.rollback_available,
      'authority verifiability evidence rollback_available'
    ),
    rollback_tested: boolean(
      value.rollback_tested,
      'authority verifiability evidence rollback_tested'
    )
  });

  if (normalized.rollback_tested && !normalized.rollback_available) {
    throw new ValidationError('authority verifiability evidence rollback_tested requires rollback_available');
  }
  return normalized;
}

function calculateRequirements(request) {
  const profile = RISK_PROFILE[request.risk];
  const noveltyEscalation = request.novelty_signals.length >= 3
    ? 2
    : request.novelty_signals.length > 0 ? 1 : 0;

  let monitorabilityLevel = Math.min(4, profile.monitorability + noveltyEscalation);
  let maxLeaseMs = profile.maxLeaseMs;

  const selfModification = request.self_modification === true;
  if (selfModification) {
    monitorabilityLevel = 4;
    maxLeaseMs = Math.min(maxLeaseMs, 15_000);
  }

  const independentMonitorRequired = selfModification
    || request.external_agent_interaction
    || request.authority_level === 4
    || request.autonomy_level === 4;
  const independentEvaluatorRequired = selfModification || request.risk === 'critical';
  const humanAuthorizationRequired = selfModification || request.risk === 'critical';

  return Object.freeze({
    monitorability_level: monitorabilityLevel,
    max_lease_ms: maxLeaseMs,
    independent_monitor_required: independentMonitorRequired,
    independent_evaluator_required: independentEvaluatorRequired,
    human_authorization_required: humanAuthorizationRequired,
    rollback_available_required: selfModification,
    rollback_tested_required: selfModification
  });
}

function sortedReasons(reasons) {
  return Object.freeze([...new Set(reasons)].sort());
}

function denyReasons(request, evidence, requirements) {
  const reasons = [];

  if (!evidence.identity_current) reasons.push('identity_currentness_required');
  if (!evidence.delegation_current) reasons.push('delegation_currentness_required');
  if (!evidence.evidence_bound) reasons.push('evidence_binding_required');

  if (request.external_agent_interaction && !request.novelty_signals.includes('counterparty')) {
    reasons.push('counterparty_novelty_signal_required');
  }

  if (requirements.independent_evaluator_required && !evidence.independent_evaluator) {
    reasons.push('independent_evaluator_required');
  }
  if (requirements.human_authorization_required && !evidence.human_authorization_present) {
    reasons.push('human_authorization_required');
  }
  if (requirements.rollback_available_required && !evidence.rollback_available) {
    reasons.push('rollback_available_required');
  }
  if (requirements.rollback_tested_required && !evidence.rollback_tested) {
    reasons.push('rollback_test_required');
  }

  return sortedReasons(reasons);
}

function holdReasons(evidence, requirements) {
  const reasons = [];
  if (evidence.monitorability_level < requirements.monitorability_level) {
    reasons.push('monitorability_below_requirement');
  }
  if (requirements.independent_monitor_required && !evidence.independent_monitor) {
    reasons.push('independent_monitor_required');
  }
  return sortedReasons(reasons);
}

function freezeProjection(value) {
  return Object.freeze({
    ...value,
    ...(Array.isArray(value.novelty_signals)
      ? { novelty_signals: Object.freeze([...value.novelty_signals]) }
      : {})
  });
}

export function evaluateAuthorityVerifiability(raw = {}) {
  const root = exactObject(raw, ROOT_KEYS, 'authority verifiability input');
  const request = normalizeRequest(root.request);
  const evidence = normalizeEvidence(root.evidence);
  const requirements = calculateRequirements(request);

  const hardDenials = denyReasons(request, evidence, requirements);
  let decision;
  let reasons;

  if (hardDenials.length > 0) {
    decision = 'deny';
    reasons = hardDenials;
  } else {
    const holds = holdReasons(evidence, requirements);
    if (holds.length > 0) {
      decision = 'hold';
      reasons = holds;
    } else {
      decision = 'eligible';
      reasons = Object.freeze([]);
    }
  }

  const body = Object.freeze({
    schema: AUTHORITY_VERIFIABILITY_SCHEMA,
    notice: AUTHORITY_VERIFIABILITY_NOTICE,
    request: freezeProjection(request),
    evidence: freezeProjection(evidence),
    requirements,
    decision,
    reasons,
    semantics: SEMANTICS
  });

  return Object.freeze({
    ...body,
    decision_digest: digestObject(body)
  });
}
