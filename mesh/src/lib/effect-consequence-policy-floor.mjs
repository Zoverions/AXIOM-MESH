import { assertString, ValidationError } from './canonical.mjs';
import {
  effectConsequenceClassificationDigest,
  validateEffectConsequenceClassification
} from './effect-consequence-classification.mjs';

export const EFFECT_CONSEQUENCE_POLICY_FLOOR_SCHEMA = 'axiom-effect-consequence-policy-floor.v0';

const POLICY_RISK_ORDER = Object.freeze({
  low: 0,
  medium: 1,
  high: 2,
  critical: 3
});

export const EFFECT_CONSEQUENCE_MINIMUM_POLICY_RISK = Object.freeze({
  informational: 'low',
  'digital-reversible': 'low',
  'digital-consequential': 'medium',
  'physical-reversible': 'high',
  'physical-safety-relevant': 'high',
  'physical-potentially-irreversible': 'critical'
});

function assertDigest(value, name) {
  return assertString(value, name, {
    min: 64,
    max: 64,
    pattern: /^[a-f0-9]{64}$/
  });
}

function assertCanonicalInstant(value, name) {
  assertString(value, name, { max: 64 });
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw new ValidationError(`${name} must be a canonical ISO instant`);
  }
  return value;
}

function assertPolicyRisk(value) {
  assertString(value, 'policy risk', { max: 16 });
  if (!Object.hasOwn(POLICY_RISK_ORDER, value)) {
    throw new ValidationError('policy risk is unsupported');
  }
  return value;
}

export function evaluateEffectConsequencePolicyFloor({
  classification,
  expectedEffectDigest,
  expectedClassificationInstant,
  policyRisk
}) {
  const normalized = validateEffectConsequenceClassification(classification);
  const effectDigest = assertDigest(expectedEffectDigest, 'expected effect digest');
  if (normalized.effect_digest !== effectDigest) {
    throw new ValidationError('effect digest does not match consequence classification');
  }

  const classificationInstant = assertCanonicalInstant(
    expectedClassificationInstant,
    'expected classification instant'
  );
  if (normalized.classified_at !== classificationInstant) {
    throw new ValidationError('classification instant does not match consequence classification');
  }

  const currentRisk = assertPolicyRisk(policyRisk);
  const minimumRisk = EFFECT_CONSEQUENCE_MINIMUM_POLICY_RISK[normalized.consequence_class];
  if (!minimumRisk) {
    throw new ValidationError('consequence class has no policy risk floor');
  }
  if (POLICY_RISK_ORDER[currentRisk] < POLICY_RISK_ORDER[minimumRisk]) {
    throw new ValidationError(`policy risk ${currentRisk} is below consequence minimum ${minimumRisk}`);
  }

  return Object.freeze({
    schema: EFFECT_CONSEQUENCE_POLICY_FLOOR_SCHEMA,
    classification_digest: effectConsequenceClassificationDigest(normalized),
    effect_digest: normalized.effect_digest,
    consequence_class: normalized.consequence_class,
    minimum_policy_risk: minimumRisk,
    policy_risk: currentRisk,
    policy_floor_satisfied: true,
    authority_effect: 'none',
    execution_effect: 'none'
  });
}
