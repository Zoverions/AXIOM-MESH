import { ValidationError } from './canonical.mjs';
import { validateBoundedDecisionProviderProfile } from './bounded-decision-provider-profile.mjs';
import { validateBoundedDecisionQuestionSchema } from './bounded-decision-question-schema.mjs';
import { normalizeBoundedDecisionProviderResult } from './bounded-decision-observation.mjs';

const RESULT_FIELDS = Object.freeze(['model', 'answers', 'usage']);
const USAGE_FIELDS = Object.freeze(['input_tokens', 'output_tokens']);
const OBSERVATION_FIELDS = Object.freeze([
  'observation_id',
  'state_digest',
  'state_classification',
  'observed_at',
  'latency_ms',
  'calibration_report_ref',
  'transport_evidence_ref'
]);
const CHOICE_FIELDS = Object.freeze(['type', 'choice', 'confidence', 'probabilities']);
const SCORE_FIELDS = Object.freeze(['type', 'score', 'confidence', 'legend', 'probabilities']);
const NOUL_FIELDS = Object.freeze(['type', 'noul']);
const MAX_USAGE_UNITS = 1_000_000_000_000;

export function projectTypeSafeSystemOneQuestion(questionSchema) {
  validateBoundedDecisionQuestionSchema(questionSchema);

  let question;
  if (questionSchema.question_kind === 'choice') {
    question = {
      type: 'choice',
      instructions: questionSchema.instructions,
      criteria: Object.fromEntries(
        questionSchema.options.map(option => [option.option_id, option.description])
      )
    };
  } else if (questionSchema.question_kind === 'score') {
    question = {
      type: 'score',
      instructions: questionSchema.instructions,
      criteria: questionSchema.levels.map(level => level.description)
    };
  } else {
    question = {
      type: 'noul',
      instructions: questionSchema.instructions,
      criteria: {
        true: questionSchema.true_meaning,
        false: questionSchema.false_meaning
      }
    };
  }

  return deepFreeze({
    name: questionSchema.question_schema_id,
    question
  });
}

export function normalizeTypeSafeSystemOneFixtureResult(
  { result, observation },
  providerProfile,
  questionSchema
) {
  validateBoundedDecisionProviderProfile(providerProfile);
  validateBoundedDecisionQuestionSchema(questionSchema);
  validateObservationInput(observation);
  validateResultEnvelope(result, providerProfile, questionSchema);

  const answer = result.answers[questionSchema.question_schema_id];
  let normalized;

  if (questionSchema.question_kind === 'choice') {
    normalized = normalizeChoiceAnswer(answer, questionSchema);
  } else if (questionSchema.question_kind === 'score') {
    normalized = normalizeScoreAnswer(answer, questionSchema);
  } else {
    normalized = normalizeNoulAnswer(answer);
  }

  return normalizeBoundedDecisionProviderResult({
    ...observation,
    answer: normalized.answer,
    probability_evidence: normalized.probability_evidence,
    provider_confidence: normalized.provider_confidence,
    usage_evidence: {
      input_units: result.usage.input_tokens,
      output_units: result.usage.output_tokens,
      compute_class: 'typesafe-system-one',
      provider_report_ref: null
    }
  }, providerProfile, questionSchema);
}

function validateResultEnvelope(result, providerProfile, questionSchema) {
  requireExactFields(result, RESULT_FIELDS, 'TypeSafe System One result');
  requireString(result.model, 'TypeSafe System One result.model', 256);
  if (result.model !== providerProfile.offering_version_or_revision) {
    throw new ValidationError(
      'TypeSafe System One result model does not match the bound provider offering revision'
    );
  }

  requirePlain(result.answers, 'TypeSafe System One result.answers');
  const answerKeys = Object.keys(result.answers);
  if (
    answerKeys.length !== 1
    || answerKeys[0] !== questionSchema.question_schema_id
  ) {
    throw new ValidationError(
      'TypeSafe System One result must contain exactly the bound AXIOM question answer'
    );
  }

  requireExactFields(result.usage, USAGE_FIELDS, 'TypeSafe System One result.usage');
  requireInteger(
    result.usage.input_tokens,
    'TypeSafe System One result.usage.input_tokens',
    0,
    MAX_USAGE_UNITS
  );
  requireInteger(
    result.usage.output_tokens,
    'TypeSafe System One result.usage.output_tokens',
    0,
    MAX_USAGE_UNITS
  );
}

function normalizeChoiceAnswer(answer, questionSchema) {
  requireExactFields(answer, CHOICE_FIELDS, 'TypeSafe Choice answer');
  if (answer.type !== 'choice') {
    throw new ValidationError('TypeSafe answer type does not match AXIOM choice question kind');
  }
  requireString(answer.choice, 'TypeSafe Choice answer.choice', 192);
  requireProbability(answer.confidence, 'TypeSafe Choice answer.confidence');
  requirePlain(answer.probabilities, 'TypeSafe Choice answer.probabilities');

  const optionIds = questionSchema.options.map(option => option.option_id);
  requireExactKeys(
    answer.probabilities,
    optionIds,
    'TypeSafe Choice probability labels'
  );
  if (!optionIds.includes(answer.choice)) {
    throw new ValidationError('TypeSafe Choice selected label is not a declared AXIOM option id');
  }

  return {
    answer: {
      kind: 'choice',
      selected_option_id: answer.choice
    },
    probability_evidence: optionIds.map(optionId => ({
      option_id: optionId,
      probability: requireProbability(
        answer.probabilities[optionId],
        `TypeSafe Choice probability ${optionId}`
      )
    })),
    provider_confidence: answer.confidence
  };
}

function normalizeScoreAnswer(answer, questionSchema) {
  requireExactFields(answer, SCORE_FIELDS, 'TypeSafe Score answer');
  if (answer.type !== 'score') {
    throw new ValidationError('TypeSafe answer type does not match AXIOM score question kind');
  }
  requireFinite(answer.score, 'TypeSafe Score answer.score');
  requireProbability(answer.confidence, 'TypeSafe Score answer.confidence');
  requirePlain(answer.legend, 'TypeSafe Score answer.legend');
  requirePlain(answer.probabilities, 'TypeSafe Score answer.probabilities');

  const positionKeys = questionSchema.levels.map(level => String(level.position));
  requireExactKeys(answer.legend, positionKeys, 'TypeSafe Score legend');
  requireExactKeys(answer.probabilities, positionKeys, 'TypeSafe Score probabilities');

  for (const level of questionSchema.levels) {
    const key = String(level.position);
    if (answer.legend[key] !== level.description) {
      throw new ValidationError(
        `TypeSafe Score legend for position ${key} does not match the AXIOM rubric level`
      );
    }
  }

  return {
    answer: {
      kind: 'score',
      score: answer.score
    },
    probability_evidence: questionSchema.levels.map(level => ({
      level_id: level.level_id,
      position: level.position,
      probability: requireProbability(
        answer.probabilities[String(level.position)],
        `TypeSafe Score probability ${level.position}`
      )
    })),
    provider_confidence: answer.confidence
  };
}

function normalizeNoulAnswer(answer) {
  requireExactFields(answer, NOUL_FIELDS, 'TypeSafe Noul answer');
  if (answer.type !== 'noul') {
    throw new ValidationError(
      'TypeSafe answer type does not match AXIOM binary-probability question kind'
    );
  }
  const pTrue = requireProbability(answer.noul, 'TypeSafe Noul probability');

  return {
    answer: {
      kind: 'binary-probability',
      p_true: pTrue
    },
    probability_evidence: null,
    provider_confidence: null
  };
}

function validateObservationInput(observation) {
  requireExactFields(observation, OBSERVATION_FIELDS, 'TypeSafe fixture observation metadata');
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

function requireExactKeys(value, expectedKeys, name) {
  const actualKeys = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (
    actualKeys.length !== expected.length
    || actualKeys.some((key, index) => key !== expected[index])
  ) {
    throw new ValidationError(`${name} do not exactly match the bound AXIOM labels or positions`);
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

function requireFinite(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ValidationError(`${name} must be finite`);
  }
  return value;
}

function requireProbability(value, name) {
  requireFinite(value, name);
  if (value < 0 || value > 1) {
    throw new ValidationError(`${name} must be a probability in [0,1]`);
  }
  return value;
}

function requireInteger(value, name, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ValidationError(`${name} must be an integer in [${min}, ${max}]`);
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
