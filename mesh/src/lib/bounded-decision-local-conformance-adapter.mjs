import { ValidationError } from './canonical.mjs';
import {
  normalizeBoundedDecisionProviderResult
} from './bounded-decision-observation.mjs';
import {
  validateBoundedDecisionProviderProfile
} from './bounded-decision-provider-profile.mjs';
import {
  validateBoundedDecisionQuestionSchema
} from './bounded-decision-question-schema.mjs';

export const BOUNDED_DECISION_LOCAL_ADAPTER_TYPESAFE_SYSTEM_ONE_V060 =
  'typesafe-system-one-v0.6.0';

const ADAPTER_KINDS = Object.freeze([
  BOUNDED_DECISION_LOCAL_ADAPTER_TYPESAFE_SYSTEM_ONE_V060
]);
const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const SHA256_RE = /^[a-f0-9]{64}$/;
const MAX_USAGE_UNITS = 1_000_000_000_000;

const INPUT_FIELDS = Object.freeze([
  'adapter_kind',
  'provider_payload',
  'question_key',
  'observation'
]);
const PAYLOAD_FIELDS = Object.freeze(['model', 'answers', 'usage']);
const OBSERVATION_FIELDS = Object.freeze([
  'observation_id',
  'state_digest',
  'state_classification',
  'observed_at',
  'latency_ms',
  'calibration_report_ref',
  'transport_evidence_ref'
]);

function requirePlain(value, name) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
  ) {
    throw new ValidationError(`${name} must be a plain object`);
  }
  return value;
}

function requireFields(value, fields, name) {
  requirePlain(value, name);
  for (const field of fields) {
    if (!Object.hasOwn(value, field)) {
      throw new ValidationError(`${name} is missing required field ${field}`);
    }
  }
}

function rejectUnknown(value, fields, name) {
  const allowed = new Set(fields);
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) {
      throw new ValidationError(`${name} contains unknown field ${field}`);
    }
  }
}

function requireString(value, name, max = 512) {
  if (typeof value !== 'string' || value.length < 1 || value.length > max) {
    throw new ValidationError(`${name} must be a bounded non-empty string`);
  }
  return value;
}

function requireIdentifier(value, name) {
  requireString(value, name, 192);
  if (!IDENTIFIER_RE.test(value)) throw new ValidationError(`${name} is invalid`);
  return value;
}

function requireDigest(value, name) {
  if (typeof value !== 'string' || !SHA256_RE.test(value)) {
    throw new ValidationError(`${name} must be a lowercase sha256 digest`);
  }
  return value;
}

function requireTimestamp(value, name) {
  requireString(value, name, 64);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new ValidationError(`${name} must be a canonical ISO timestamp`);
  }
  return value;
}

function requireInteger(value, name, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ValidationError(`${name} must be an integer in [${min}, ${max}]`);
  }
  return value;
}

function requireProbability(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new ValidationError(`${name} must be a finite probability in [0,1]`);
  }
  return value;
}

function nullableString(value, name, max = 512) {
  if (value === null) return null;
  return requireString(value, name, max);
}

function validateObservationContext(value) {
  requireFields(value, OBSERVATION_FIELDS, 'observation');
  rejectUnknown(value, OBSERVATION_FIELDS, 'observation');
  requireIdentifier(value.observation_id, 'observation.observation_id');
  requireDigest(value.state_digest, 'observation.state_digest');
  requireIdentifier(value.state_classification, 'observation.state_classification');
  requireTimestamp(value.observed_at, 'observation.observed_at');
  requireInteger(value.latency_ms, 'observation.latency_ms', 0, 300_000);
  nullableString(value.calibration_report_ref, 'observation.calibration_report_ref');
  nullableString(value.transport_evidence_ref, 'observation.transport_evidence_ref');
}

function validateUsage(value) {
  requireFields(value, ['input_tokens', 'output_tokens'], 'provider_payload.usage');
  rejectUnknown(value, ['input_tokens', 'output_tokens'], 'provider_payload.usage');
  requireInteger(value.input_tokens, 'provider_payload.usage.input_tokens', 0, MAX_USAGE_UNITS);
  requireInteger(value.output_tokens, 'provider_payload.usage.output_tokens', 0, MAX_USAGE_UNITS);
}

function exactKeys(value, expected, name) {
  requirePlain(value, name);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length
    || actual.some((key, index) => key !== wanted[index])
  ) {
    throw new ValidationError(`${name} keys do not exactly match the bound question`);
  }
}

function validateChoiceAnswer(answer, questionSchema) {
  const fields = ['type', 'choice', 'confidence', 'probabilities'];
  requireFields(answer, fields, 'provider answer');
  rejectUnknown(answer, fields, 'provider answer');
  if (answer.type !== 'choice') {
    throw new ValidationError('provider answer type must be choice for a Choice question');
  }
  requireIdentifier(answer.choice, 'provider answer.choice');
  requireProbability(answer.confidence, 'provider answer.confidence');

  const optionIds = questionSchema.options.map(item => item.option_id);
  exactKeys(answer.probabilities, optionIds, 'provider answer.probabilities');
  const distribution = optionIds.map(optionId => ({
    option_id: optionId,
    probability: requireProbability(
      answer.probabilities[optionId],
      `provider answer.probabilities.${optionId}`
    )
  }));

  return {
    answer: {
      kind: 'choice',
      selected_option_id: answer.choice
    },
    probability_evidence: distribution,
    provider_confidence: answer.confidence
  };
}

function validateScoreLegend(legend, questionSchema) {
  const positionKeys = questionSchema.levels.map(level => String(level.position));
  exactKeys(legend, positionKeys, 'provider answer.legend');
  for (const level of questionSchema.levels) {
    const providerDescription = legend[String(level.position)];
    if (providerDescription !== level.description) {
      throw new ValidationError(
        `provider answer legend does not match bound rubric description at position ${level.position}`
      );
    }
  }
}

function validateScoreAnswer(answer, questionSchema) {
  const fields = ['type', 'score', 'confidence', 'legend', 'probabilities'];
  requireFields(answer, fields, 'provider answer');
  rejectUnknown(answer, fields, 'provider answer');
  if (answer.type !== 'score') {
    throw new ValidationError('provider answer type must be score for a Score question');
  }
  if (typeof answer.score !== 'number' || !Number.isFinite(answer.score)) {
    throw new ValidationError('provider answer.score must be finite');
  }
  requireProbability(answer.confidence, 'provider answer.confidence');
  validateScoreLegend(answer.legend, questionSchema);

  const positionKeys = questionSchema.levels.map(level => String(level.position));
  exactKeys(answer.probabilities, positionKeys, 'provider answer.probabilities');
  const distribution = questionSchema.levels.map(level => ({
    level_id: level.level_id,
    position: level.position,
    probability: requireProbability(
      answer.probabilities[String(level.position)],
      `provider answer.probabilities.${level.position}`
    )
  }));

  return {
    answer: {
      kind: 'score',
      score: answer.score
    },
    probability_evidence: distribution,
    provider_confidence: answer.confidence
  };
}

function validateNoulAnswer(answer) {
  const fields = ['type', 'noul'];
  requireFields(answer, fields, 'provider answer');
  rejectUnknown(answer, fields, 'provider answer');
  if (answer.type !== 'noul') {
    throw new ValidationError('provider answer type must be noul for a binary-probability question');
  }
  return {
    answer: {
      kind: 'binary-probability',
      p_true: requireProbability(answer.noul, 'provider answer.noul')
    },
    probability_evidence: null,
    provider_confidence: null
  };
}

function normalizeTypeSafeSystemOneV060(payload, questionKey, providerProfile, questionSchema) {
  requireFields(payload, PAYLOAD_FIELDS, 'provider_payload');
  rejectUnknown(payload, PAYLOAD_FIELDS, 'provider_payload');
  requireString(payload.model, 'provider_payload.model', 256);
  if (payload.model !== providerProfile.offering_version_or_revision) {
    throw new ValidationError(
      'provider payload model does not match the bound offering version or revision'
    );
  }
  requirePlain(payload.answers, 'provider_payload.answers');
  if (!Object.hasOwn(payload.answers, questionKey)) {
    throw new ValidationError('provider payload answers is missing the requested question_key');
  }
  validateUsage(payload.usage);

  const providerAnswer = payload.answers[questionKey];
  if (questionSchema.question_kind === 'choice') {
    return validateChoiceAnswer(providerAnswer, questionSchema);
  }
  if (questionSchema.question_kind === 'score') {
    return validateScoreAnswer(providerAnswer, questionSchema);
  }
  if (questionSchema.question_kind === 'binary-probability') {
    return validateNoulAnswer(providerAnswer);
  }
  throw new ValidationError('bound question kind is not supported by the local adapter');
}

export function normalizeBoundedDecisionLocalConformanceFixture(
  input,
  providerProfile,
  questionSchema
) {
  requireFields(input, INPUT_FIELDS, 'Bounded decision local conformance input');
  rejectUnknown(input, INPUT_FIELDS, 'Bounded decision local conformance input');
  if (!ADAPTER_KINDS.includes(input.adapter_kind)) {
    throw new ValidationError('Bounded decision local conformance adapter kind is invalid');
  }
  requireIdentifier(input.question_key, 'question_key');
  validateObservationContext(input.observation);
  validateBoundedDecisionProviderProfile(providerProfile);
  validateBoundedDecisionQuestionSchema(questionSchema);

  const normalized = normalizeTypeSafeSystemOneV060(
    input.provider_payload,
    input.question_key,
    providerProfile,
    questionSchema
  );

  return normalizeBoundedDecisionProviderResult({
    observation_id: input.observation.observation_id,
    state_digest: input.observation.state_digest,
    state_classification: input.observation.state_classification,
    observed_at: input.observation.observed_at,
    latency_ms: input.observation.latency_ms,
    answer: normalized.answer,
    probability_evidence: normalized.probability_evidence,
    provider_confidence: normalized.provider_confidence,
    usage_evidence: {
      input_units: input.provider_payload.usage.input_tokens,
      output_units: input.provider_payload.usage.output_tokens,
      compute_class: `${input.adapter_kind}-fixture`,
      provider_report_ref: null
    },
    calibration_report_ref: input.observation.calibration_report_ref,
    transport_evidence_ref: input.observation.transport_evidence_ref
  }, providerProfile, questionSchema);
}
