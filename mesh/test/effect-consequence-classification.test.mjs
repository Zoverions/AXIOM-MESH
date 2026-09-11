import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { sha256, ValidationError } from '../src/lib/canonical.mjs';
import {
  EFFECT_CONSEQUENCE_CLASSIFICATION_SCHEMA,
  EFFECT_CONSEQUENCE_CLASSES,
  effectConsequenceClassificationDigest,
  validateEffectConsequenceClassification
} from '../src/lib/effect-consequence-classification.mjs';

function classification(overrides = {}) {
  return {
    schema: 'axiom-effect-consequence-classification.v0',
    version: '0.1.0',
    status: 'inert-evidence',
    classification_id: 'effect.classification.001',
    effect_ref: 'effect:example',
    effect_digest: sha256('effect:example:v0'),
    consequence_class: 'informational',
    rationale: 'No persistent or physical state is changed.',
    reversibility: 'not-applicable',
    physical_safety_impact: 'none',
    legal_or_regulatory_impact: 'none',
    classified_at: '2026-09-05T23:45:00.000Z',
    classifier_ref: 'classifier:axiom-test',
    authority_effect: 'none',
    execution_effect: 'none',
    ...overrides
  };
}

test('effect consequence classifier accepts informational and physical evidence without granting authority', () => {
  const info = validateEffectConsequenceClassification(classification());
  assert.equal(info.schema, EFFECT_CONSEQUENCE_CLASSIFICATION_SCHEMA);
  assert.equal(info.effect_digest, sha256('effect:example:v0'));
  assert.equal(info.authority_effect, 'none');
  assert.equal(info.execution_effect, 'none');

  const physical = validateEffectConsequenceClassification(classification({
    consequence_class: 'physical-safety-relevant',
    reversibility: 'partially-reversible',
    physical_safety_impact: 'material',
    legal_or_regulatory_impact: 'regulated'
  }));
  assert.equal(physical.consequence_class, 'physical-safety-relevant');
});

test('effect consequence classifier exposes the six default classes', () => {
  assert.deepEqual(EFFECT_CONSEQUENCE_CLASSES, [
    'informational',
    'digital-reversible',
    'digital-consequential',
    'physical-reversible',
    'physical-safety-relevant',
    'physical-potentially-irreversible'
  ]);
});

test('effect consequence classifier fails closed on unknown class fields and authority widening', () => {
  assert.throws(() => validateEffectConsequenceClassification(classification({ consequence_class: 'physical-magic' })), /consequence_class/i);
  assert.throws(
    () => validateEffectConsequenceClassification(classification({ extra: true })),
    error => error instanceof ValidationError && /unknown field/i.test(error.message)
  );
  assert.throws(() => validateEffectConsequenceClassification(classification({ authority_effect: 'grant' })), /authority_effect/i);
  assert.throws(() => validateEffectConsequenceClassification(classification({ execution_effect: 'execute' })), /execution_effect/i);
});

test('effect consequence classifier requires an exact effect digest', () => {
  assert.throws(
    () => validateEffectConsequenceClassification(classification({ effect_digest: 'not-a-digest' })),
    /effect_digest/i
  );
});

test('physical safety classes cannot minimize physical risk or irreversibility', () => {
  assert.throws(
    () => validateEffectConsequenceClassification(classification({
      consequence_class: 'physical-safety-relevant',
      reversibility: 'reversible',
      physical_safety_impact: 'none'
    })),
    /physical_safety_impact/i
  );
  assert.throws(
    () => validateEffectConsequenceClassification(classification({
      consequence_class: 'physical-potentially-irreversible',
      reversibility: 'reversible',
      physical_safety_impact: 'critical'
    })),
    /reversibility/i
  );
});

test('effect consequence classification digest is deterministic', () => {
  assert.equal(
    effectConsequenceClassificationDigest(classification()),
    effectConsequenceClassificationDigest(classification())
  );
});

test('effect consequence JSON schema mirrors strict no-authority boundary', async () => {
  const schema = JSON.parse(await readFile(new URL('../config/effect-consequence-classification-v0.schema.json', import.meta.url), 'utf8'));
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.schema.const, EFFECT_CONSEQUENCE_CLASSIFICATION_SCHEMA);
  assert.ok(schema.required.includes('effect_digest'));
  assert.equal(schema.properties.effect_digest.$ref, '#/$defs/digest');
  assert.equal(schema.$defs.digest.pattern, '^[a-f0-9]{64}$');
  assert.deepEqual(schema.properties.consequence_class.enum, EFFECT_CONSEQUENCE_CLASSES);
  assert.equal(schema.properties.authority_effect.const, 'none');
  assert.equal(schema.properties.execution_effect.const, 'none');
});
