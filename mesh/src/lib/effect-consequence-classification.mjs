import {
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject
} from './canonical.mjs';

export const EFFECT_CONSEQUENCE_CLASSIFICATION_SCHEMA = 'axiom-effect-consequence-classification.v0';
export const EFFECT_CONSEQUENCE_CLASSES = Object.freeze([
  'informational',
  'digital-reversible',
  'digital-consequential',
  'physical-reversible',
  'physical-safety-relevant',
  'physical-potentially-irreversible'
]);

const VERSION = '0.1.0';
const STATUS = 'inert-evidence';
const CLASS_SET = new Set(EFFECT_CONSEQUENCE_CLASSES);
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const REVERSIBILITY = new Set(['not-applicable', 'reversible', 'partially-reversible', 'irreversible', 'unknown']);
const PHYSICAL_SAFETY_IMPACT = new Set(['none', 'low', 'material', 'critical', 'unknown']);
const LEGAL_OR_REGULATORY_IMPACT = new Set(['none', 'material', 'regulated', 'unknown']);

const FIELDS = Object.freeze([
  'schema',
  'version',
  'status',
  'classification_id',
  'effect_ref',
  'effect_digest',
  'consequence_class',
  'rationale',
  'reversibility',
  'physical_safety_impact',
  'legal_or_regulatory_impact',
  'classified_at',
  'classifier_ref',
  'authority_effect',
  'execution_effect'
]);

function assertExactFields(value) {
  const allowed = new Set(FIELDS);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ValidationError(`effect consequence classification contains unknown field ${key}`);
  }
  for (const key of FIELDS) {
    if (!Object.hasOwn(value, key)) throw new ValidationError(`effect consequence classification.${key} is required`);
  }
}

function identifier(value, name) {
  return assertString(value, name, { max: 160, pattern: IDENTIFIER });
}

function digest(value, name) {
  return assertString(value, name, { min: 64, max: 64, pattern: DIGEST });
}

function enumValue(value, name, allowed, max = 64) {
  const normalized = assertString(value, name, { max });
  if (!allowed.has(normalized)) throw new ValidationError(`${name} is unsupported`);
  return normalized;
}

export function validateEffectConsequenceClassification(input) {
  const value = assertPlainObject(input, 'effect consequence classification');
  assertExactFields(value);

  if (value.schema !== EFFECT_CONSEQUENCE_CLASSIFICATION_SCHEMA) {
    throw new ValidationError('effect consequence classification.schema is unsupported');
  }
  if (value.version !== VERSION) throw new ValidationError(`effect consequence classification.version must be ${VERSION}`);
  if (value.status !== STATUS) throw new ValidationError(`effect consequence classification.status must be ${STATUS}`);
  if (value.authority_effect !== 'none') throw new ValidationError('effect consequence classification.authority_effect must be none');
  if (value.execution_effect !== 'none') throw new ValidationError('effect consequence classification.execution_effect must be none');

  const consequenceClass = enumValue(value.consequence_class, 'effect consequence classification.consequence_class', CLASS_SET);
  const reversibility = enumValue(value.reversibility, 'effect consequence classification.reversibility', REVERSIBILITY);
  const physicalSafetyImpact = enumValue(
    value.physical_safety_impact,
    'effect consequence classification.physical_safety_impact',
    PHYSICAL_SAFETY_IMPACT
  );
  const legalOrRegulatoryImpact = enumValue(
    value.legal_or_regulatory_impact,
    'effect consequence classification.legal_or_regulatory_impact',
    LEGAL_OR_REGULATORY_IMPACT
  );

  if (consequenceClass === 'physical-safety-relevant' && physicalSafetyImpact === 'none') {
    throw new ValidationError('effect consequence classification.physical_safety_impact cannot be none for physical-safety-relevant effects');
  }
  if (consequenceClass === 'physical-potentially-irreversible') {
    if (reversibility === 'reversible') {
      throw new ValidationError('effect consequence classification.reversibility cannot be reversible for physical-potentially-irreversible effects');
    }
    if (physicalSafetyImpact === 'none') {
      throw new ValidationError('effect consequence classification.physical_safety_impact cannot be none for physical-potentially-irreversible effects');
    }
  }

  const classifiedAt = assertString(value.classified_at, 'effect consequence classification.classified_at', {
    max: 32,
    pattern: ISO_TIMESTAMP
  });
  if (!Number.isFinite(Date.parse(classifiedAt))) {
    throw new ValidationError('effect consequence classification.classified_at is not a valid timestamp');
  }

  return Object.freeze({
    schema: EFFECT_CONSEQUENCE_CLASSIFICATION_SCHEMA,
    version: VERSION,
    status: STATUS,
    classification_id: identifier(value.classification_id, 'effect consequence classification.classification_id'),
    effect_ref: assertString(value.effect_ref, 'effect consequence classification.effect_ref', { max: 512 }),
    effect_digest: digest(value.effect_digest, 'effect consequence classification.effect_digest'),
    consequence_class: consequenceClass,
    rationale: assertString(value.rationale, 'effect consequence classification.rationale', { max: 2048 }),
    reversibility,
    physical_safety_impact: physicalSafetyImpact,
    legal_or_regulatory_impact: legalOrRegulatoryImpact,
    classified_at: classifiedAt,
    classifier_ref: identifier(value.classifier_ref, 'effect consequence classification.classifier_ref'),
    authority_effect: 'none',
    execution_effect: 'none'
  });
}

export function effectConsequenceClassificationDigest(input) {
  return digestObject(validateEffectConsequenceClassification(input));
}
