import { randomInt } from 'node:crypto';
import {
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject
} from './canonical.mjs';
import { getAssuranceTier } from './assurance-tiers.mjs';

export const ADAPTIVE_ASSURANCE_INPUT_SCHEMA = 'axiom-adaptive-assurance-input.v1';
export const ADAPTIVE_ASSURANCE_DECISION_SCHEMA = 'axiom-adaptive-assurance-decision.v1';
export const ADAPTIVE_ASSURANCE_UI_SCHEMA = 'axiom-adaptive-assurance-ui.v1';

const RISK_CLASSES = new Set(['low', 'medium', 'high', 'critical']);
const UI_PHASES = new Set(['pre-execution', 'post-execution']);
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;

const SIGNAL_FIELDS = Object.freeze([
  'consequence',
  'uncertainty',
  'irreversibility',
  'authority_exposure',
  'anomaly',
  'provenance_weakness',
  'correlation_risk',
  'context_integrity_risk'
]);

const SIGNAL_WEIGHTS = Object.freeze({
  consequence: 20,
  uncertainty: 12,
  irreversibility: 15,
  authority_exposure: 18,
  anomaly: 10,
  provenance_weakness: 10,
  correlation_risk: 8,
  context_integrity_risk: 7
});

const MANDATORY_FLOOR = Object.freeze({
  low: 'A1',
  medium: 'A2',
  high: 'A3',
  critical: 'A3'
});

const BASE_CHALLENGE_BPS = Object.freeze({
  low: 200,
  medium: 500,
  high: 1_000,
  critical: 2_000
});

const MIN_CHALLENGE_BPS = Object.freeze({
  low: 100,
  medium: 300,
  high: 750,
  critical: 1_500
});

const INPUT_FIELDS = new Set([
  'schema',
  'task_id',
  'risk_class',
  'signals',
  'reputation_score',
  'reputation_confidence',
  'policy_floor'
]);

const SIGNAL_SET = new Set(SIGNAL_FIELDS);

function rejectUnknown(value, allowed, label) {
  const unknown = Object.keys(value).filter(key => !allowed.has(key));
  if (unknown.length) {
    throw new ValidationError(`${label} contains unsupported fields: ${unknown.join(', ')}`);
  }
}

function score(value, label) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 100) {
    throw new ValidationError(`${label} must be an integer between 0 and 100`);
  }
  return value;
}

function normalizeTier(value, label) {
  try {
    const tier = getAssuranceTier(value);
    if (tier.rank > getAssuranceTier('A3').rank) {
      throw new ValidationError(`${label} cannot exceed the current runtime maximum A3`);
    }
    return value;
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError(`${label} is unsupported`);
  }
}

function maxTier(left, right) {
  return getAssuranceTier(left).rank >= getAssuranceTier(right).rank ? left : right;
}

function nextTier(tier) {
  if (tier === 'A1') return 'A2';
  if (tier === 'A2') return 'A3';
  return 'A3';
}

function normalizeSignals(raw) {
  const signals = assertPlainObject(raw, 'adaptive assurance signals');
  rejectUnknown(signals, SIGNAL_SET, 'adaptive assurance signals');
  for (const field of SIGNAL_FIELDS) {
    if (!Object.hasOwn(signals, field)) {
      throw new ValidationError(`adaptive assurance signals requires ${field}`);
    }
  }
  return Object.freeze(Object.fromEntries(
    SIGNAL_FIELDS.map(field => [field, score(signals[field], `adaptive assurance signals.${field}`)])
  ));
}

export function normalizeAdaptiveAssuranceInput(raw) {
  const value = assertPlainObject(raw, 'adaptive assurance input');
  rejectUnknown(value, INPUT_FIELDS, 'adaptive assurance input');
  if (value.schema !== ADAPTIVE_ASSURANCE_INPUT_SCHEMA) {
    throw new ValidationError(
      `adaptive assurance input schema must be ${ADAPTIVE_ASSURANCE_INPUT_SCHEMA}`
    );
  }
  const taskId = assertString(value.task_id, 'adaptive assurance task_id', {
    min: 1,
    max: 192,
    pattern: ID
  });
  if (!RISK_CLASSES.has(value.risk_class)) {
    throw new ValidationError('adaptive assurance risk_class is unsupported');
  }
  const policyFloor = value.policy_floor === undefined
    ? MANDATORY_FLOOR[value.risk_class]
    : normalizeTier(value.policy_floor, 'adaptive assurance policy_floor');

  return Object.freeze({
    schema: ADAPTIVE_ASSURANCE_INPUT_SCHEMA,
    task_id: taskId,
    risk_class: value.risk_class,
    signals: normalizeSignals(value.signals),
    reputation_score: score(value.reputation_score, 'adaptive assurance reputation_score'),
    reputation_confidence: score(
      value.reputation_confidence,
      'adaptive assurance reputation_confidence'
    ),
    policy_floor: maxTier(policyFloor, MANDATORY_FLOOR[value.risk_class])
  });
}

function weightedRisk(signals) {
  let total = 0;
  for (const field of SIGNAL_FIELDS) {
    total += signals[field] * SIGNAL_WEIGHTS[field];
  }
  return Math.round(total / 100);
}

function reputationAdjustment(reputationScore, reputationConfidence) {
  const centered = reputationScore - 50;
  const magnitude = Math.floor(Math.abs(centered) * reputationConfidence / 500);
  return Math.min(10, magnitude) * Math.sign(centered);
}

function adaptiveTier(scoreValue) {
  if (scoreValue < 30) return 'A1';
  if (scoreValue < 60) return 'A2';
  return 'A3';
}

function challengeProbabilityBps(input) {
  const signals = input.signals;
  const gamingSensitiveRisk = Math.round((
    signals.anomaly
    + signals.provenance_weakness
    + signals.correlation_risk
    + signals.context_integrity_risk
  ) / 4);
  const dynamic = gamingSensitiveRisk * 20;
  const reputationRelief = Math.min(
    250,
    Math.floor(
      Math.max(0, input.reputation_score - 50)
      * input.reputation_confidence
      / 20
    )
  );
  return Math.max(
    MIN_CHALLENGE_BPS[input.risk_class],
    Math.min(9_500, BASE_CHALLENGE_BPS[input.risk_class] + dynamic - reputationRelief)
  );
}

function verificationChecks(tier, riskClass, challengeTriggered) {
  const checks = ['normal-policy-and-authority-path'];
  if (tier === 'A2' || tier === 'A3') {
    checks.push('independent-context-verification');
  }
  if (tier === 'A3') {
    checks.push(
      'adversarial-review',
      'provenance-review',
      'correlation-aware-cross-check'
    );
  }
  if (riskClass === 'critical') {
    checks.push('explicit-human-or-policy-designated-independent-approval');
  }
  if (challengeTriggered) {
    checks.push('stochastic-supplemental-audit');
  }
  return Object.freeze([...new Set(checks)]);
}

function uiLevel(tier, riskClass) {
  if (riskClass === 'critical') return 'Critical';
  if (tier === 'A3') return 'High';
  if (tier === 'A2') return 'Elevated';
  return 'Routine';
}

export function createAdaptiveAssuranceEvaluator({ randomIntFn = randomInt } = {}) {
  if (typeof randomIntFn !== 'function') {
    throw new ValidationError('adaptive assurance evaluator requires randomIntFn');
  }

  return function evaluateAdaptiveAssurance(raw) {
    const input = normalizeAdaptiveAssuranceInput(raw);
    const baseRiskScore = weightedRisk(input.signals);
    const reputationEffect = reputationAdjustment(
      input.reputation_score,
      input.reputation_confidence
    );
    const adjustedRiskScore = Math.max(
      0,
      Math.min(100, baseRiskScore - reputationEffect)
    );
    const computedTier = adaptiveTier(adjustedRiskScore);
    const deterministicTier = maxTier(input.policy_floor, computedTier);
    const probabilityBps = challengeProbabilityBps(input);
    const sampleBps = randomIntFn(0, 10_000);

    if (!Number.isSafeInteger(sampleBps) || sampleBps < 0 || sampleBps >= 10_000) {
      throw new ValidationError('adaptive assurance random source returned an invalid sample');
    }

    const challengeTriggered = sampleBps < probabilityBps;
    const selectedTier = challengeTriggered ? nextTier(deterministicTier) : deterministicTier;
    const body = Object.freeze({
      schema: ADAPTIVE_ASSURANCE_DECISION_SCHEMA,
      task_id: input.task_id,
      risk_class: input.risk_class,
      policy_floor: input.policy_floor,
      base_risk_score: baseRiskScore,
      reputation_adjustment: reputationEffect,
      adjusted_risk_score: adjustedRiskScore,
      deterministic_tier: deterministicTier,
      selected_tier: selectedTier,
      ui_level: uiLevel(selectedTier, input.risk_class),
      required_checks: verificationChecks(selectedTier, input.risk_class, challengeTriggered),
      stochastic_audit_performed: challengeTriggered,
      mandatory_floor_preserved: true,
      reputation_can_exempt: false,
      authority_effect: 'none',
      delegation_effect: 'none'
    });

    return Object.freeze({
      ...body,
      decision_digest: digestObject(body),
      internal_audit: Object.freeze({
        challenge_probability_bps: probabilityBps,
        sample_bps: sampleBps
      })
    });
  };
}

export const evaluateAdaptiveAssurance = createAdaptiveAssuranceEvaluator();

const DECISION_FIELDS = new Set([
  'schema',
  'task_id',
  'risk_class',
  'policy_floor',
  'base_risk_score',
  'reputation_adjustment',
  'adjusted_risk_score',
  'deterministic_tier',
  'selected_tier',
  'ui_level',
  'required_checks',
  'stochastic_audit_performed',
  'mandatory_floor_preserved',
  'reputation_can_exempt',
  'authority_effect',
  'delegation_effect',
  'decision_digest',
  'internal_audit'
]);

export function validateAdaptiveAssuranceDecision(raw) {
  const value = assertPlainObject(raw, 'adaptive assurance decision');
  rejectUnknown(value, DECISION_FIELDS, 'adaptive assurance decision');
  if (value.schema !== ADAPTIVE_ASSURANCE_DECISION_SCHEMA) {
    throw new ValidationError(
      `adaptive assurance decision schema must be ${ADAPTIVE_ASSURANCE_DECISION_SCHEMA}`
    );
  }
  assertString(value.task_id, 'adaptive assurance decision task_id', {
    min: 1,
    max: 192,
    pattern: ID
  });
  if (!RISK_CLASSES.has(value.risk_class)) {
    throw new ValidationError('adaptive assurance decision risk_class is unsupported');
  }
  for (const [field, tier] of [
    ['policy_floor', value.policy_floor],
    ['deterministic_tier', value.deterministic_tier],
    ['selected_tier', value.selected_tier]
  ]) {
    normalizeTier(tier, `adaptive assurance decision ${field}`);
  }
  score(value.base_risk_score, 'adaptive assurance decision base_risk_score');
  if (
    !Number.isSafeInteger(value.reputation_adjustment)
    || value.reputation_adjustment < -10
    || value.reputation_adjustment > 10
  ) {
    throw new ValidationError(
      'adaptive assurance decision reputation_adjustment must be an integer between -10 and 10'
    );
  }
  score(value.adjusted_risk_score, 'adaptive assurance decision adjusted_risk_score');
  if (!['Routine', 'Elevated', 'High', 'Critical'].includes(value.ui_level)) {
    throw new ValidationError('adaptive assurance decision ui_level is unsupported');
  }
  if (
    !Array.isArray(value.required_checks)
    || value.required_checks.length < 1
    || value.required_checks.length > 32
    || value.required_checks.some(item => (
      typeof item !== 'string' || item.length < 1 || item.length > 192
    ))
    || new Set(value.required_checks).size !== value.required_checks.length
  ) {
    throw new ValidationError('adaptive assurance decision required_checks is invalid');
  }
  if (
    typeof value.stochastic_audit_performed !== 'boolean'
    || value.mandatory_floor_preserved !== true
    || value.reputation_can_exempt !== false
    || value.authority_effect !== 'none'
    || value.delegation_effect !== 'none'
  ) {
    throw new ValidationError('adaptive assurance decision safety boundary is invalid');
  }
  if (
    getAssuranceTier(value.deterministic_tier).rank
      < getAssuranceTier(value.policy_floor).rank
    || getAssuranceTier(value.selected_tier).rank
      < getAssuranceTier(value.deterministic_tier).rank
  ) {
    throw new ValidationError('adaptive assurance decision tier ordering is invalid');
  }
  if (
    value.stochastic_audit_performed
    && !value.required_checks.includes('stochastic-supplemental-audit')
  ) {
    throw new ValidationError(
      'adaptive assurance stochastic decision is missing its supplemental audit check'
    );
  }

  const decisionDigest = assertString(
    value.decision_digest,
    'adaptive assurance decision decision_digest',
    { min: 64, max: 64, pattern: /^[a-f0-9]{64}$/ }
  );
  const { decision_digest: _decisionDigest, internal_audit: _internalAudit, ...body } = value;
  if (digestObject(body) !== decisionDigest) {
    throw new ValidationError('adaptive assurance decision_digest mismatch');
  }
  return value;
}

export function projectAdaptiveAssuranceForUi(decision, { phase = 'pre-execution' } = {}) {
  const value = validateAdaptiveAssuranceDecision(decision);
  if (!UI_PHASES.has(phase)) {
    throw new ValidationError('adaptive assurance UI phase is unsupported');
  }

  const projection = {
    schema: ADAPTIVE_ASSURANCE_UI_SCHEMA,
    task_id: value.task_id,
    ui_level: value.ui_level,
    selected_tier: value.selected_tier,
    required_checks: structuredClone(value.required_checks),
    explanation: value.risk_class === 'critical'
      ? 'Critical assurance floor applies because this task is classified as critical.'
      : 'Assurance effort reflects consequence, uncertainty, irreversibility, authority exposure, provenance weakness, anomaly, context-integrity, and correlation signals.',
    authority_effect: 'none'
  };

  if (phase === 'post-execution') {
    projection.supplemental_audit_performed = value.stochastic_audit_performed === true;
  }

  return Object.freeze(projection);
}
