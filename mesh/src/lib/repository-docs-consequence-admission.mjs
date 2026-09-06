import {
  ValidationError,
  assertPlainObject,
  assertString
} from './canonical.mjs';
import {
  EFFECT_CONSEQUENCE_CLASSIFICATION_SCHEMA,
  effectConsequenceClassificationDigest,
  validateEffectConsequenceClassification
} from './effect-consequence-classification.mjs';
import { evaluateEffectConsequencePolicyFloor } from './effect-consequence-policy-floor.mjs';
import { normalizePreparedExternalEffect } from './external-effect-outbox.mjs';

export const REPOSITORY_DOCS_CONSEQUENCE_ADMISSION_SCHEMA =
  'axiom-repository-docs-consequence-admission.v0';

const REQUEST_FIELDS = Object.freeze(['preparedEffect', 'policyRisk']);
const CLASSIFIER_REF = 'classifier:repository-docs-effect-v1';
const RATIONALE =
  'Repository docs pull-request preparation can change external digital state but does not authorize merge or physical-device effects.';

function exactRequest(value) {
  const request = assertPlainObject(value, 'repository docs consequence admission request');
  for (const key of Object.keys(request)) {
    if (!REQUEST_FIELDS.includes(key)) {
      throw new ValidationError(`repository docs consequence admission request has unknown field: ${key}`);
    }
  }
  for (const key of REQUEST_FIELDS) {
    if (!Object.hasOwn(request, key)) {
      throw new ValidationError(`repository docs consequence admission request is missing field: ${key}`);
    }
  }
  return request;
}

/**
 * Bind fixed repository-docs consequence metadata to one exact prepared effect.
 *
 * This helper is intentionally non-authorizing. It classifies the already
 * prepared, content-addressed repository-docs effect and checks only that the
 * existing AXIOM policy risk meets the minimum scrutiny floor. It never lowers
 * policy risk and never grants execution, merge, capability, or device authority.
 */
export function buildRepositoryDocsConsequenceAdmission(value) {
  const { preparedEffect, policyRisk } = exactRequest(value);
  const prepared = normalizePreparedExternalEffect(preparedEffect);
  const risk = assertString(policyRisk, 'policy risk', { max: 16 });

  const classification = validateEffectConsequenceClassification({
    schema: EFFECT_CONSEQUENCE_CLASSIFICATION_SCHEMA,
    version: '0.1.0',
    status: 'inert-evidence',
    classification_id: `classification:repository-docs:${prepared.effect_digest}`,
    effect_ref: prepared.effect_id,
    effect_digest: prepared.effect_digest,
    consequence_class: 'digital-consequential',
    rationale: RATIONALE,
    reversibility: 'reversible',
    physical_safety_impact: 'none',
    legal_or_regulatory_impact: 'unknown',
    classified_at: prepared.prepared_at,
    classifier_ref: CLASSIFIER_REF,
    authority_effect: 'none',
    execution_effect: 'none'
  });

  const policyFloor = evaluateEffectConsequencePolicyFloor({
    classification,
    expectedEffectDigest: prepared.effect_digest,
    expectedClassificationInstant: prepared.prepared_at,
    policyRisk: risk
  });

  return Object.freeze({
    schema: REPOSITORY_DOCS_CONSEQUENCE_ADMISSION_SCHEMA,
    effect_id: prepared.effect_id,
    effect_digest: prepared.effect_digest,
    classification,
    classification_digest: effectConsequenceClassificationDigest(classification),
    policy_floor: policyFloor,
    authority_effect: 'none',
    execution_effect: 'none'
  });
}
