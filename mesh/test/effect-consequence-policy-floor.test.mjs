import assert from 'node:assert/strict';
import test from 'node:test';

import { sha256, ValidationError } from '../src/lib/canonical.mjs';
import {
  effectConsequenceClassificationDigest
} from '../src/lib/effect-consequence-classification.mjs';
import {
  EFFECT_CONSEQUENCE_MINIMUM_POLICY_RISK,
  EFFECT_CONSEQUENCE_POLICY_FLOOR_SCHEMA,
  evaluateEffectConsequencePolicyFloor
} from '../src/lib/effect-consequence-policy-floor.mjs';

const AT = '2026-09-06T10:30:00.000Z';
const EFFECT_DIGEST = sha256('prepared:repository-docs-effect:001');

function classification(overrides = {}) {
  return {
    schema: 'axiom-effect-consequence-classification.v0',
    version: '0.1.0',
    status: 'inert-evidence',
    classification_id: 'effect.classification.policy-floor.001',
    effect_ref: 'effect:repository-docs:001',
    effect_digest: EFFECT_DIGEST,
    consequence_class: 'digital-consequential',
    rationale: 'The effect changes external digital state but does not merge or control a physical device.',
    reversibility: 'reversible',
    physical_safety_impact: 'none',
    legal_or_regulatory_impact: 'unknown',
    classified_at: AT,
    classifier_ref: 'classifier:repository-docs-effect-v1',
    authority_effect: 'none',
    execution_effect: 'none',
    ...overrides
  };
}

test('consequence classes map only to minimum existing policy risk floors', () => {
  assert.deepEqual(EFFECT_CONSEQUENCE_MINIMUM_POLICY_RISK, {
    informational: 'low',
    'digital-reversible': 'low',
    'digital-consequential': 'medium',
    'physical-reversible': 'high',
    'physical-safety-relevant': 'high',
    'physical-potentially-irreversible': 'critical'
  });
  assert.equal(Object.isFrozen(EFFECT_CONSEQUENCE_MINIMUM_POLICY_RISK), true);
});

test('higher existing policy risk satisfies a lower consequence floor without being reduced', () => {
  const result = evaluateEffectConsequencePolicyFloor({
    classification: classification(),
    expectedEffectDigest: EFFECT_DIGEST,
    expectedClassificationInstant: AT,
    policyRisk: 'high'
  });

  assert.equal(result.schema, EFFECT_CONSEQUENCE_POLICY_FLOOR_SCHEMA);
  assert.equal(result.effect_digest, EFFECT_DIGEST);
  assert.equal(result.classification_digest, effectConsequenceClassificationDigest(classification()));
  assert.equal(result.consequence_class, 'digital-consequential');
  assert.equal(result.minimum_policy_risk, 'medium');
  assert.equal(result.policy_risk, 'high');
  assert.equal(result.policy_floor_satisfied, true);
  for (const forbidden of ['allow', 'deny', 'authorized', 'execution_authority', 'capability_grant']) {
    assert.equal(Object.hasOwn(result, forbidden), false);
  }
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.execution_effect, 'none');
  assert.equal(Object.isFrozen(result), true);
});

test('classification cannot lower an existing policy risk requirement', () => {
  const result = evaluateEffectConsequencePolicyFloor({
    classification: classification({ consequence_class: 'informational' }),
    expectedEffectDigest: EFFECT_DIGEST,
    expectedClassificationInstant: AT,
    policyRisk: 'critical'
  });
  assert.equal(result.minimum_policy_risk, 'low');
  assert.equal(result.policy_risk, 'critical');
});

test('policy risk below the consequence floor fails closed', () => {
  assert.throws(
    () => evaluateEffectConsequencePolicyFloor({
      classification: classification({
        consequence_class: 'physical-safety-relevant',
        reversibility: 'partially-reversible',
        physical_safety_impact: 'material'
      }),
      expectedEffectDigest: EFFECT_DIGEST,
      expectedClassificationInstant: AT,
      policyRisk: 'medium'
    }),
    error => error instanceof ValidationError && /policy risk.*below.*consequence/i.test(error.message)
  );
});

test('effect and classification-time substitution fail closed', () => {
  assert.throws(
    () => evaluateEffectConsequencePolicyFloor({
      classification: classification(),
      expectedEffectDigest: sha256('different-effect'),
      expectedClassificationInstant: AT,
      policyRisk: 'high'
    }),
    /effect digest/i
  );
  assert.throws(
    () => evaluateEffectConsequencePolicyFloor({
      classification: classification(),
      expectedEffectDigest: EFFECT_DIGEST,
      expectedClassificationInstant: '2026-09-06T10:30:01.000Z',
      policyRisk: 'high'
    }),
    /classification instant/i
  );
});

test('malformed policy risk and classification evidence fail closed', () => {
  assert.throws(
    () => evaluateEffectConsequencePolicyFloor({
      classification: classification(),
      expectedEffectDigest: EFFECT_DIGEST,
      expectedClassificationInstant: AT,
      policyRisk: 'unknown-risk'
    }),
    /policy risk/i
  );
  assert.throws(
    () => evaluateEffectConsequencePolicyFloor({
      classification: classification({ authority_effect: 'grant' }),
      expectedEffectDigest: EFFECT_DIGEST,
      expectedClassificationInstant: AT,
      policyRisk: 'high'
    }),
    /authority_effect/i
  );
});
