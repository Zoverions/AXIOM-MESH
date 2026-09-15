import {
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson
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
const ADMISSION_FIELDS = Object.freeze([
  'schema',
  'effect_id',
  'effect_digest',
  'classification',
  'classification_digest',
  'policy_floor',
  'authority_effect',
  'execution_effect'
]);
const POLICY_FLOOR_FIELDS = Object.freeze([
  'schema',
  'classification_digest',
  'effect_digest',
  'consequence_class',
  'minimum_policy_risk',
  'policy_risk',
  'policy_floor_satisfied',
  'authority_effect',
  'execution_effect'
]);
const CLASSIFIER_REF = 'classifier:repository-docs-effect-v1';
const RATIONALE =
  'Repository docs pull-request preparation can change external digital state but does not authorize merge or physical-device effects.';

function assertExactFields(value, fields, name) {
  const allowed = new Set(fields);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ValidationError(`${name} has unknown field: ${key}`);
  }
  for (const key of fields) {
    if (!Object.hasOwn(value, key)) throw new ValidationError(`${name} is missing field: ${key}`);
  }
}

function exactRequest(value) {
  const request = assertPlainObject(value, 'repository docs consequence admission request');
  assertExactFields(request, REQUEST_FIELDS, 'repository docs consequence admission request');
  return request;
}

function expectedClassification(prepared) {
  return validateEffectConsequenceClassification({
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
}

function buildAdmission(prepared, policyRisk) {
  const risk = assertString(policyRisk, 'policy risk', { max: 16 });
  const classification = expectedClassification(prepared);
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
  return buildAdmission(prepared, policyRisk);
}

/**
 * Independently verify persisted consequence evidence against the exact
 * prepared repository-docs effect. The consequence class and all classifier
 * semantics are reconstructed locally; callers may supply evidence, not policy.
 */
export function verifyRepositoryDocsConsequenceAdmission(input, { preparedEffect } = {}) {
  const admission = assertPlainObject(input, 'repository docs consequence admission');
  assertExactFields(admission, ADMISSION_FIELDS, 'repository docs consequence admission');
  const prepared = normalizePreparedExternalEffect(preparedEffect);
  const classification = validateEffectConsequenceClassification(admission.classification);
  const policyFloor = assertPlainObject(admission.policy_floor, 'repository docs consequence admission policy floor');
  assertExactFields(
    policyFloor,
    POLICY_FLOOR_FIELDS,
    'repository docs consequence admission policy floor'
  );

  const expected = buildAdmission(prepared, policyFloor.policy_risk);
  if (canonicalJson(admission) !== canonicalJson(expected)) {
    throw new ValidationError('repository docs consequence admission does not exactly match the prepared effect and fixed consequence policy');
  }
  if (canonicalJson(classification) !== canonicalJson(expected.classification)) {
    throw new ValidationError('repository docs consequence admission classification is not the fixed repository-docs classification');
  }
  return expected;
}
