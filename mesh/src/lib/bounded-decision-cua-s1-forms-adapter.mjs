import { digestObject, ValidationError } from './canonical.mjs';
import {
  resolveBoundedDecisionProviderProfile
} from './bounded-decision-provider-profile.mjs';
import {
  validateBoundedDecisionQuestionSchema
} from './bounded-decision-question-schema.mjs';
import {
  normalizeBoundedDecisionProviderResult
} from './bounded-decision-observation.mjs';

export const CUA_S1_FORMS_TARGET_BINDING_SCHEMA =
  'axiom-cua-s1-forms-target-binding.v0';

const RESULT_FIELDS = Object.freeze([
  'model',
  'question_schema_id',
  'state_digest',
  'snapshot_id',
  'element_token',
  'selected_option_index',
  'probabilities'
]);
const OBSERVATION_FIELDS = Object.freeze([
  'observation_id',
  'state_digest',
  'state_classification',
  'observed_at',
  'latency_ms',
  'calibration_report_ref',
  'transport_evidence_ref'
]);
const FIXED_ACTION_OPTION_IDS = Object.freeze(['check', 'click', 'skip']);
const DIGEST_RE = /^[a-f0-9]{64}$/;
const MAX_TARGET_ID_LENGTH = 1024;

export function validateCuaS1FormsQuestion(questionSchema) {
  validateBoundedDecisionQuestionSchema(questionSchema);

  if (questionSchema.question_kind !== 'choice') {
    throw new ValidationError('CUA-S1-FORMS requires an AXIOM choice question');
  }
  if (questionSchema.other_option_policy !== 'forbidden') {
    throw new ValidationError(
      'CUA-S1-FORMS requires explicit skip abstention and forbids implicit other options'
    );
  }
  if (questionSchema.options.length < FIXED_ACTION_OPTION_IDS.length) {
    throw new ValidationError('CUA-S1-FORMS question is missing the fixed action alphabet');
  }

  const fillCount = questionSchema.options.length - FIXED_ACTION_OPTION_IDS.length;
  const expectedOptionIds = [
    ...Array.from({ length: fillCount }, (_, index) => `fill.${index}`),
    ...FIXED_ACTION_OPTION_IDS
  ];
  const actualOptionIds = questionSchema.options.map(option => option.option_id);
  if (
    actualOptionIds.length !== expectedOptionIds.length
    || actualOptionIds.some((optionId, index) => optionId !== expectedOptionIds[index])
  ) {
    throw new ValidationError(
      'CUA-S1-FORMS options must be contiguous fill.N entities followed by check, click, skip'
    );
  }

  return deepFreeze({
    valid: true,
    fill_option_count: fillCount,
    option_ids: expectedOptionIds,
    abstention_option_id: 'skip',
    authority_effect: 'none',
    execution_effect: 'none'
  });
}

export function normalizeCuaS1FormsFixtureResult(
  { result, observation },
  providerProfile,
  questionSchema,
  catalogEntry
) {
  const resolvedProvider = resolveBoundedDecisionProviderProfile(providerProfile, catalogEntry);
  const question = validateCuaS1FormsQuestion(questionSchema);
  validateObservationInput(observation);
  validateProviderBinding(providerProfile, resolvedProvider);
  validateResultEnvelope(result, providerProfile, questionSchema, observation);

  const probabilityEvidence = question.option_ids.map((optionId, index) => ({
    option_id: optionId,
    probability: requireProbability(
      result.probabilities[index],
      `CUA-S1-FORMS probability ${index}`
    )
  }));
  const selectedOptionId = question.option_ids[result.selected_option_index];
  const selectedProbability = probabilityEvidence[result.selected_option_index].probability;
  const maximum = Math.max(...probabilityEvidence.map(item => item.probability));
  if (selectedProbability !== maximum) {
    throw new ValidationError(
      'CUA-S1-FORMS selected option must be a maximal-probability option'
    );
  }

  const normalizedObservation = normalizeBoundedDecisionProviderResult({
    ...observation,
    answer: {
      kind: 'choice',
      selected_option_id: selectedOptionId
    },
    probability_evidence: probabilityEvidence,
    provider_confidence: selectedProbability,
    usage_evidence: {
      input_units: null,
      output_units: probabilityEvidence.length,
      compute_class: 'cua-s1-forms-local',
      provider_report_ref: null
    }
  }, providerProfile, questionSchema);

  if (normalizedObservation.answer.selected_option_id !== selectedOptionId) {
    throw new ValidationError(
      'CUA-S1-FORMS normalization must preserve the provider-selected action; ambiguous tied actions fail closed'
    );
  }

  const targetBinding = {
    schema: CUA_S1_FORMS_TARGET_BINDING_SCHEMA,
    snapshot_id: result.snapshot_id,
    element_token: result.element_token,
    state_digest: result.state_digest,
    question_schema_id: questionSchema.question_schema_id,
    selected_option_id: normalizedObservation.answer.selected_option_id,
    observation_digest: normalizedObservation.observation_digest,
    abstained: normalizedObservation.answer.selected_option_id === 'skip',
    submit_authorization: false,
    authority_effect: 'none',
    assurance_effect: 'none',
    runtime_activation: false,
    execution_effect: 'none'
  };
  const bindingDigest = digestObject(targetBinding);

  return deepFreeze({
    observation: normalizedObservation,
    target_binding: {
      ...targetBinding,
      binding_digest: bindingDigest
    }
  });
}

function validateProviderBinding(providerProfile, resolvedProvider) {
  if (providerProfile.provider_mode !== 'owner-local') {
    throw new ValidationError(
      'CUA-S1-FORMS adapter currently accepts only owner-local provider profiles'
    );
  }
  if (resolvedProvider.provider_mode !== 'owner-local' || resolvedProvider.network_required) {
    throw new ValidationError(
      'CUA-S1-FORMS adapter requires a catalog-resolved owner-local provider with no network requirement'
    );
  }
  if (providerProfile.offering_revision_evidence !== 'exact-artifact') {
    throw new ValidationError(
      'CUA-S1-FORMS adapter requires exact-artifact offering revision evidence'
    );
  }
  if (providerProfile.probability_support !== 'full-distribution') {
    throw new ValidationError(
      'CUA-S1-FORMS adapter requires full-distribution probability support'
    );
  }
  if (!providerProfile.supported_question_kinds.includes('choice')) {
    throw new ValidationError(
      'CUA-S1-FORMS provider profile must support AXIOM choice questions'
    );
  }
}

function validateResultEnvelope(result, providerProfile, questionSchema, observation) {
  requireExactFields(result, RESULT_FIELDS, 'CUA-S1-FORMS result');
  requireString(result.model, 'CUA-S1-FORMS result.model', 256);
  if (result.model !== providerProfile.offering_version_or_revision) {
    throw new ValidationError(
      'CUA-S1-FORMS result model does not match the exact bound offering revision'
    );
  }

  requireString(
    result.question_schema_id,
    'CUA-S1-FORMS result.question_schema_id',
    192
  );
  if (result.question_schema_id !== questionSchema.question_schema_id) {
    throw new ValidationError(
      'CUA-S1-FORMS result question identity does not match the bound AXIOM question'
    );
  }

  requireDigest(result.state_digest, 'CUA-S1-FORMS result.state_digest');
  if (result.state_digest !== observation.state_digest) {
    throw new ValidationError(
      'CUA-S1-FORMS result state digest does not match the observed AXIOM state'
    );
  }

  requireString(result.snapshot_id, 'CUA-S1-FORMS result.snapshot_id', MAX_TARGET_ID_LENGTH);
  requireString(
    result.element_token,
    'CUA-S1-FORMS result.element_token',
    MAX_TARGET_ID_LENGTH
  );
  if (!Number.isSafeInteger(result.selected_option_index)) {
    throw new ValidationError(
      'CUA-S1-FORMS result.selected_option_index must be an integer'
    );
  }
  if (!Array.isArray(result.probabilities)) {
    throw new ValidationError('CUA-S1-FORMS result.probabilities must be an array');
  }
  if (result.probabilities.length !== questionSchema.options.length) {
    throw new ValidationError(
      'CUA-S1-FORMS probability distribution must exactly match the AXIOM option count'
    );
  }
  if (
    result.selected_option_index < 0
    || result.selected_option_index >= result.probabilities.length
  ) {
    throw new ValidationError(
      'CUA-S1-FORMS selected option index is outside the declared AXIOM option range'
    );
  }
}

function validateObservationInput(observation) {
  requireExactFields(
    observation,
    OBSERVATION_FIELDS,
    'CUA-S1-FORMS fixture observation metadata'
  );
  requireDigest(observation.state_digest, 'CUA-S1-FORMS observation.state_digest');
}

function requireExactFields(value, fields, name) {
  requirePlain(value, name);
  const allowed = new Set(fields);
  for (const field of fields) {
    if (!Object.hasOwn(value, field)) {
      throw new ValidationError(`${name} is missing required field ${field}`);
    }
  }
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) {
      throw new ValidationError(`${name} contains unknown field ${field}`);
    }
  }
}

function requirePlain(value, name) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || (Object.getPrototypeOf(value) !== Object.prototype
      && Object.getPrototypeOf(value) !== null)
  ) {
    throw new ValidationError(`${name} must be a plain object`);
  }
  return value;
}

function requireString(value, name, max) {
  if (typeof value !== 'string' || value.length < 1 || value.length > max) {
    throw new ValidationError(`${name} must be a bounded non-empty string`);
  }
  return value;
}

function requireDigest(value, name) {
  if (typeof value !== 'string' || !DIGEST_RE.test(value)) {
    throw new ValidationError(`${name} must be a lowercase sha256 digest`);
  }
  return value;
}

function requireProbability(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new ValidationError(`${name} must be a probability in [0,1]`);
  }
  return value;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
