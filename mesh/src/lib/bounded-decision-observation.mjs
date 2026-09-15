import { digestObject, ValidationError } from './canonical.mjs';
import {
  boundedDecisionProviderProfileDigest,
  validateBoundedDecisionProviderProfile
} from './bounded-decision-provider-profile.mjs';
import {
  boundedDecisionQuestionSchemaDigest,
  validateBoundedDecisionQuestionSchema
} from './bounded-decision-question-schema.mjs';

export const BOUNDED_DECISION_OBSERVATION_SCHEMA =
  'axiom-bounded-decision-observation.v0';
export const BOUNDED_DECISION_FAILURE_RECEIPT_SCHEMA =
  'axiom-bounded-decision-failure-receipt.v0';

const OBSERVATION_STATUS = 'inert-bounded-decision-observation';
const FAILURE_STATUS = 'inert-bounded-decision-failure';
const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const SHA256_RE = /^[a-f0-9]{64}$/;
const PROBABILITY_TOLERANCE = 1e-12;
const MAX_USAGE_UNITS = 1_000_000_000_000;
const REVISION_EVIDENCE = Object.freeze([
  'exact-artifact',
  'provider-versioned',
  'mutable-alias',
  'unknown'
]);
const FAILURE_CLASSES = Object.freeze([
  'provider-unavailable',
  'transport-integrity-failure',
  'schema-invalid',
  'distribution-invalid'
]);

const OBSERVATION_FIELDS = Object.freeze([
  'schema',
  'version',
  'status',
  'observation_id',
  'provider_profile_id',
  'provider_profile_digest',
  'catalog_entry_digest',
  'offering_ref',
  'offering_version_or_revision',
  'offering_revision_evidence',
  'question_schema_id',
  'question_schema_digest',
  'question_domain',
  'state_digest',
  'state_classification',
  'observed_at',
  'latency_ms',
  'answer',
  'probability_evidence',
  'provider_confidence',
  'usage_evidence',
  'calibration_report_ref',
  'transport_evidence_ref',
  'observation_digest',
  'authority_effect',
  'assurance_effect',
  'network_effect',
  'credential_visibility',
  'runtime_activation',
  'selection_effect'
]);

const NORMALIZATION_INPUT_FIELDS = Object.freeze([
  'observation_id',
  'state_digest',
  'state_classification',
  'observed_at',
  'latency_ms',
  'answer',
  'probability_evidence',
  'provider_confidence',
  'usage_evidence',
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

function requireEnum(value, allowed, name) {
  if (!allowed.includes(value)) {
    throw new ValidationError(`${name} must be one of ${allowed.join(', ')}`);
  }
  return value;
}

function requireTimestamp(value, name) {
  requireString(value, name, 64);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new ValidationError(`${name} must be a canonical ISO timestamp`);
  }
  return parsed.getTime();
}

function requireInteger(value, name, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ValidationError(`${name} must be an integer in [${min}, ${max}]`);
  }
  return value;
}

function requireProbability(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new ValidationError(`${name} probability must be finite in [0,1]`);
  }
  return value;
}

function nullableProbability(value, name) {
  if (value === null) return null;
  return requireProbability(value, name);
}

function nullableString(value, name, max = 512) {
  if (value === null) return null;
  return requireString(value, name, max);
}

function nullableUsageInteger(value, name) {
  if (value === null) return null;
  return requireInteger(value, name, 0, MAX_USAGE_UNITS);
}

function nearlyEqual(left, right, tolerance = PROBABILITY_TOLERANCE) {
  return Math.abs(left - right) <= tolerance;
}

function validateUsageEvidence(value) {
  requireFields(
    value,
    ['input_units', 'output_units', 'compute_class', 'provider_report_ref'],
    'usage_evidence'
  );
  rejectUnknown(
    value,
    ['input_units', 'output_units', 'compute_class', 'provider_report_ref'],
    'usage_evidence'
  );
  nullableUsageInteger(value.input_units, 'usage_evidence.input_units');
  nullableUsageInteger(value.output_units, 'usage_evidence.output_units');
  nullableString(value.compute_class, 'usage_evidence.compute_class', 256);
  nullableString(value.provider_report_ref, 'usage_evidence.provider_report_ref', 512);
}

function probabilitySum(values) {
  return values.reduce((sum, item) => sum + item.probability, 0);
}

function requireNormalizedDistribution(values, name) {
  if (!nearlyEqual(probabilitySum(values), 1)) {
    throw new ValidationError(`${name} probabilities must sum to 1`);
  }
}

function validateChoiceObservation(answer, probabilities) {
  requireFields(answer, ['kind', 'selected_option_id', 'tied_option_ids'], 'answer');
  rejectUnknown(answer, ['kind', 'selected_option_id', 'tied_option_ids'], 'answer');
  if (answer.kind !== 'choice') throw new ValidationError('answer.kind is invalid');
  requireIdentifier(answer.selected_option_id, 'answer.selected_option_id');
  if (!Array.isArray(answer.tied_option_ids)) {
    throw new ValidationError('answer.tied_option_ids must be an array');
  }
  const tiedSeen = new Set();
  for (const id of answer.tied_option_ids) {
    requireIdentifier(id, 'answer.tied_option_ids[]');
    if (tiedSeen.has(id)) throw new ValidationError('answer.tied_option_ids contains duplicate values');
    tiedSeen.add(id);
  }

  if (!Array.isArray(probabilities) || probabilities.length < 2 || probabilities.length > 64) {
    throw new ValidationError('choice probability distribution must contain 2-64 entries');
  }
  const seen = new Set();
  for (const [index, item] of probabilities.entries()) {
    requireFields(item, ['option_id', 'probability'], `probability_evidence[${index}]`);
    rejectUnknown(item, ['option_id', 'probability'], `probability_evidence[${index}]`);
    requireIdentifier(item.option_id, `probability_evidence[${index}].option_id`);
    requireProbability(item.probability, `probability_evidence[${index}].probability`);
    if (seen.has(item.option_id)) throw new ValidationError('choice distribution contains duplicate option_id');
    seen.add(item.option_id);
  }
  requireNormalizedDistribution(probabilities, 'choice distribution');

  const maximum = Math.max(...probabilities.map(item => item.probability));
  const maxima = probabilities
    .filter(item => item.probability === maximum)
    .map(item => item.option_id)
    .sort();
  const expectedSelected = maxima[0];
  const expectedTied = maxima.length > 1 ? maxima : [];
  if (answer.selected_option_id !== expectedSelected) {
    throw new ValidationError('choice selected option must be the deterministic maximal-probability option');
  }
  if (
    answer.tied_option_ids.length !== expectedTied.length
    || answer.tied_option_ids.some((id, index) => id !== expectedTied[index])
  ) {
    throw new ValidationError('choice tie representation does not match the maximal-probability options');
  }
}

function validateScoreObservation(answer, probabilities) {
  requireFields(answer, ['kind', 'score'], 'answer');
  rejectUnknown(answer, ['kind', 'score'], 'answer');
  if (answer.kind !== 'score') throw new ValidationError('answer.kind is invalid');
  if (typeof answer.score !== 'number' || !Number.isFinite(answer.score)) {
    throw new ValidationError('answer.score must be finite');
  }
  if (!Array.isArray(probabilities) || probabilities.length < 2 || probabilities.length > 10) {
    throw new ValidationError('score probability distribution must contain 2-10 entries');
  }
  const seen = new Set();
  for (const [index, item] of probabilities.entries()) {
    requireFields(item, ['level_id', 'position', 'probability'], `probability_evidence[${index}]`);
    rejectUnknown(item, ['level_id', 'position', 'probability'], `probability_evidence[${index}]`);
    requireIdentifier(item.level_id, `probability_evidence[${index}].level_id`);
    requireInteger(item.position, `probability_evidence[${index}].position`, 0, 9);
    requireProbability(item.probability, `probability_evidence[${index}].probability`);
    if (seen.has(item.level_id)) throw new ValidationError('score distribution contains duplicate level_id');
    seen.add(item.level_id);
  }
  requireNormalizedDistribution(probabilities, 'score distribution');
  const weighted = probabilities.reduce(
    (sum, item) => sum + item.position * item.probability,
    0
  );
  if (!nearlyEqual(answer.score, weighted)) {
    throw new ValidationError('answer.score does not match the probability-weighted mean');
  }
}

function validateBinaryObservation(answer, probabilities) {
  requireFields(answer, ['kind', 'p_true'], 'answer');
  rejectUnknown(answer, ['kind', 'p_true'], 'answer');
  if (answer.kind !== 'binary-probability') throw new ValidationError('answer.kind is invalid');
  requireProbability(answer.p_true, 'answer.p_true');
  if (!Array.isArray(probabilities) || probabilities.length !== 2) {
    throw new ValidationError('binary probability distribution must contain exactly two entries');
  }
  for (const [index, item] of probabilities.entries()) {
    requireFields(item, ['value', 'probability'], `probability_evidence[${index}]`);
    rejectUnknown(item, ['value', 'probability'], `probability_evidence[${index}]`);
    if (typeof item.value !== 'boolean') {
      throw new ValidationError(`probability_evidence[${index}].value must be boolean`);
    }
    requireProbability(item.probability, `probability_evidence[${index}].probability`);
  }
  if (probabilities[0].value !== false || probabilities[1].value !== true) {
    throw new ValidationError('binary probability evidence must be ordered false then true');
  }
  if (
    !nearlyEqual(probabilities[0].probability, 1 - answer.p_true)
    || !nearlyEqual(probabilities[1].probability, answer.p_true)
  ) {
    throw new ValidationError('binary probability evidence does not match p_true');
  }
}

function validateObservationShape(document) {
  requireFields(document, OBSERVATION_FIELDS, 'Bounded decision observation');
  rejectUnknown(document, OBSERVATION_FIELDS, 'Bounded decision observation');
  if (document.schema !== BOUNDED_DECISION_OBSERVATION_SCHEMA) {
    throw new ValidationError('Bounded decision observation schema is invalid');
  }
  if (document.version !== 0) throw new ValidationError('Bounded decision observation version is invalid');
  if (document.status !== OBSERVATION_STATUS) throw new ValidationError('Bounded decision observation status is invalid');

  requireIdentifier(document.observation_id, 'observation_id');
  requireIdentifier(document.provider_profile_id, 'provider_profile_id');
  requireDigest(document.provider_profile_digest, 'provider_profile_digest');
  requireDigest(document.catalog_entry_digest, 'catalog_entry_digest');
  requireIdentifier(document.offering_ref, 'offering_ref');
  requireString(document.offering_version_or_revision, 'offering_version_or_revision', 256);
  requireEnum(document.offering_revision_evidence, REVISION_EVIDENCE, 'offering_revision_evidence');
  requireIdentifier(document.question_schema_id, 'question_schema_id');
  requireDigest(document.question_schema_digest, 'question_schema_digest');
  requireString(document.question_domain, 'question_domain', 512);
  requireDigest(document.state_digest, 'state_digest');
  requireIdentifier(document.state_classification, 'state_classification');
  requireTimestamp(document.observed_at, 'observed_at');
  requireInteger(document.latency_ms, 'latency_ms', 0, 300_000);
  nullableProbability(document.provider_confidence, 'provider_confidence');
  validateUsageEvidence(document.usage_evidence);
  nullableString(document.calibration_report_ref, 'calibration_report_ref', 512);
  nullableString(document.transport_evidence_ref, 'transport_evidence_ref', 512);
  requireDigest(document.observation_digest, 'observation_digest');

  requirePlain(document.answer, 'answer');
  if (document.answer.kind === 'choice') {
    validateChoiceObservation(document.answer, document.probability_evidence);
  } else if (document.answer.kind === 'score') {
    validateScoreObservation(document.answer, document.probability_evidence);
  } else if (document.answer.kind === 'binary-probability') {
    validateBinaryObservation(document.answer, document.probability_evidence);
  } else {
    throw new ValidationError('answer.kind is invalid');
  }

  if (
    document.authority_effect !== 'none'
    || document.assurance_effect !== 'none'
    || document.network_effect !== 'none'
    || document.credential_visibility !== 'none'
    || document.runtime_activation !== false
    || document.selection_effect !== 'evidence-only'
  ) {
    throw new ValidationError('Bounded decision observation boundary effect is invalid');
  }
  return document;
}

function observationDigestPayload(document) {
  const copy = structuredClone(document);
  delete copy.observation_digest;
  return copy;
}

export function computeBoundedDecisionObservationDigest(document) {
  validateObservationShape(document);
  return digestObject(observationDigestPayload(document));
}

function validateChoiceAgainstQuestion(document, questionSchema) {
  const expected = questionSchema.options.map(item => item.option_id);
  const actual = document.probability_evidence.map(item => item.option_id);
  if (
    expected.length !== actual.length
    || expected.some((id, index) => id !== actual[index])
  ) {
    throw new ValidationError('choice distribution does not exactly match the bound question options');
  }
}

function validateScoreAgainstQuestion(document, questionSchema) {
  const expected = questionSchema.levels;
  if (document.probability_evidence.length !== expected.length) {
    throw new ValidationError('score distribution does not exactly match the bound question levels');
  }
  for (let index = 0; index < expected.length; index += 1) {
    const actual = document.probability_evidence[index];
    if (actual.level_id !== expected[index].level_id || actual.position !== expected[index].position) {
      throw new ValidationError('score distribution level identity or position does not match the bound question');
    }
  }
}

function validateObservationBinding(document, providerProfile, questionSchema) {
  const profileDigest = boundedDecisionProviderProfileDigest(providerProfile);
  const questionDigest = boundedDecisionQuestionSchemaDigest(questionSchema);
  if (document.provider_profile_id !== providerProfile.profile_id) {
    throw new ValidationError('observation provider profile id does not match supplied provider profile');
  }
  if (document.provider_profile_digest !== profileDigest) {
    throw new ValidationError('observation provider profile digest does not match supplied provider profile');
  }
  if (document.catalog_entry_digest !== providerProfile.catalog_entry_digest) {
    throw new ValidationError('observation catalog digest does not match supplied provider profile');
  }
  if (
    document.offering_ref !== providerProfile.offering_ref
    || document.offering_version_or_revision !== providerProfile.offering_version_or_revision
    || document.offering_revision_evidence !== providerProfile.offering_revision_evidence
  ) {
    throw new ValidationError('observation offering or revision evidence does not match supplied provider profile');
  }
  if (document.question_schema_id !== questionSchema.question_schema_id) {
    throw new ValidationError('observation question schema id does not match supplied question schema');
  }
  if (document.question_schema_digest !== questionDigest) {
    throw new ValidationError('observation question schema digest does not match supplied question schema');
  }
  if (document.question_domain !== questionSchema.domain) {
    throw new ValidationError('observation question domain does not match supplied question schema');
  }
  if (document.answer.kind !== questionSchema.question_kind) {
    throw new ValidationError('observation answer kind does not match supplied question schema');
  }
  if (!providerProfile.supported_question_kinds.includes(questionSchema.question_kind)) {
    throw new ValidationError('provider profile does not support the bound question kind');
  }
  if (
    ['choice', 'score'].includes(questionSchema.question_kind)
    && providerProfile.probability_support !== 'full-distribution'
  ) {
    throw new ValidationError('choice and score evidence require full-distribution provider support');
  }
  if (
    questionSchema.question_kind === 'binary-probability'
    && !['full-distribution', 'binary-probability-only'].includes(providerProfile.probability_support)
  ) {
    throw new ValidationError('binary evidence requires probability-capable provider support');
  }
  if (
    questionSchema.question_kind === 'choice'
    && questionSchema.options.length > providerProfile.max_choice_cardinality
  ) {
    throw new ValidationError('choice schema exceeds provider max_choice_cardinality');
  }
  if (
    questionSchema.question_kind === 'score'
    && questionSchema.levels.length > providerProfile.max_score_levels
  ) {
    throw new ValidationError('score schema exceeds provider max_score_levels');
  }

  if (questionSchema.question_kind === 'choice') validateChoiceAgainstQuestion(document, questionSchema);
  if (questionSchema.question_kind === 'score') validateScoreAgainstQuestion(document, questionSchema);
}

export function validateBoundedDecisionObservation(document, providerProfile, questionSchema) {
  validateBoundedDecisionProviderProfile(providerProfile);
  validateBoundedDecisionQuestionSchema(questionSchema);
  validateObservationShape(document);
  validateObservationBinding(document, providerProfile, questionSchema);
  const expectedDigest = digestObject(observationDigestPayload(document));
  if (document.observation_digest !== expectedDigest) {
    throw new ValidationError('Bounded decision observation digest mismatch');
  }
  return deepFreeze({
    valid: true,
    schema: document.schema,
    observation_id: document.observation_id,
    observation_digest: expectedDigest,
    provider_profile_id: document.provider_profile_id,
    provider_profile_digest: document.provider_profile_digest,
    question_schema_id: document.question_schema_id,
    question_schema_digest: document.question_schema_digest,
    question_domain: document.question_domain,
    answer_kind: document.answer.kind,
    state_digest: document.state_digest,
    authority_effect: 'none',
    assurance_effect: 'none',
    network_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false,
    selection_effect: 'evidence-only'
  });
}

export function boundedDecisionObservationDigest(document, providerProfile, questionSchema) {
  return validateBoundedDecisionObservation(document, providerProfile, questionSchema).observation_digest;
}

function validateNormalizationInput(input) {
  requireFields(input, NORMALIZATION_INPUT_FIELDS, 'Bounded decision provider result');
  rejectUnknown(input, NORMALIZATION_INPUT_FIELDS, 'Bounded decision provider result');
  requireIdentifier(input.observation_id, 'observation_id');
  requireDigest(input.state_digest, 'state_digest');
  requireIdentifier(input.state_classification, 'state_classification');
  requireTimestamp(input.observed_at, 'observed_at');
  requireInteger(input.latency_ms, 'latency_ms', 0, 300_000);
  nullableProbability(input.provider_confidence, 'provider_confidence');
  validateUsageEvidence(input.usage_evidence);
  nullableString(input.calibration_report_ref, 'calibration_report_ref', 512);
  nullableString(input.transport_evidence_ref, 'transport_evidence_ref', 512);
}

function normalizeChoice(input, questionSchema) {
  requireFields(input.answer, ['kind', 'selected_option_id'], 'answer');
  rejectUnknown(input.answer, ['kind', 'selected_option_id'], 'answer');
  if (input.answer.kind !== 'choice') throw new ValidationError('answer.kind does not match choice schema');
  requireIdentifier(input.answer.selected_option_id, 'answer.selected_option_id');
  if (!Array.isArray(input.probability_evidence)) {
    throw new ValidationError('choice probability distribution is required');
  }
  const byId = new Map();
  for (const [index, item] of input.probability_evidence.entries()) {
    requireFields(item, ['option_id', 'probability'], `probability_evidence[${index}]`);
    rejectUnknown(item, ['option_id', 'probability'], `probability_evidence[${index}]`);
    requireIdentifier(item.option_id, `probability_evidence[${index}].option_id`);
    requireProbability(item.probability, `probability_evidence[${index}].probability`);
    if (byId.has(item.option_id)) throw new ValidationError('choice distribution contains duplicate option_id');
    byId.set(item.option_id, item.probability);
  }
  const expectedIds = questionSchema.options.map(item => item.option_id);
  if (byId.size !== expectedIds.length) {
    throw new ValidationError('choice distribution is missing declared options');
  }
  for (const id of byId.keys()) {
    if (!expectedIds.includes(id)) throw new ValidationError(`choice distribution contains unknown option ${id}`);
  }
  const probabilities = expectedIds.map(optionId => ({
    option_id: optionId,
    probability: byId.get(optionId)
  }));
  requireNormalizedDistribution(probabilities, 'choice distribution');
  const maximum = Math.max(...probabilities.map(item => item.probability));
  const maxima = probabilities
    .filter(item => item.probability === maximum)
    .map(item => item.option_id)
    .sort();
  if (!maxima.includes(input.answer.selected_option_id)) {
    throw new ValidationError('provider-selected option is not a maximal-probability option');
  }
  return {
    answer: {
      kind: 'choice',
      selected_option_id: maxima[0],
      tied_option_ids: maxima.length > 1 ? maxima : []
    },
    probability_evidence: probabilities
  };
}

function normalizeScore(input, questionSchema) {
  requireFields(input.answer, ['kind', 'score'], 'answer');
  rejectUnknown(input.answer, ['kind', 'score'], 'answer');
  if (input.answer.kind !== 'score') throw new ValidationError('answer.kind does not match score schema');
  if (typeof input.answer.score !== 'number' || !Number.isFinite(input.answer.score)) {
    throw new ValidationError('answer.score must be finite');
  }
  if (!Array.isArray(input.probability_evidence)) {
    throw new ValidationError('score probability distribution is required');
  }
  const byId = new Map();
  for (const [index, item] of input.probability_evidence.entries()) {
    requireFields(item, ['level_id', 'position', 'probability'], `probability_evidence[${index}]`);
    rejectUnknown(item, ['level_id', 'position', 'probability'], `probability_evidence[${index}]`);
    requireIdentifier(item.level_id, `probability_evidence[${index}].level_id`);
    requireInteger(item.position, `probability_evidence[${index}].position`, 0, 9);
    requireProbability(item.probability, `probability_evidence[${index}].probability`);
    if (byId.has(item.level_id)) throw new ValidationError('score distribution contains duplicate level_id');
    byId.set(item.level_id, { position: item.position, probability: item.probability });
  }
  if (byId.size !== questionSchema.levels.length) {
    throw new ValidationError('score distribution is missing declared levels');
  }
  const probabilities = questionSchema.levels.map(level => {
    const item = byId.get(level.level_id);
    if (!item) throw new ValidationError(`score distribution is missing level ${level.level_id}`);
    if (item.position !== level.position) {
      throw new ValidationError(`score distribution position for ${level.level_id} is invalid`);
    }
    return {
      level_id: level.level_id,
      position: level.position,
      probability: item.probability
    };
  });
  requireNormalizedDistribution(probabilities, 'score distribution');
  const weighted = probabilities.reduce(
    (sum, item) => sum + item.position * item.probability,
    0
  );
  if (!nearlyEqual(input.answer.score, weighted)) {
    throw new ValidationError('provider score does not match the probability-weighted mean');
  }
  return {
    answer: { kind: 'score', score: weighted },
    probability_evidence: probabilities
  };
}

function normalizeBinary(input) {
  requireFields(input.answer, ['kind', 'p_true'], 'answer');
  rejectUnknown(input.answer, ['kind', 'p_true'], 'answer');
  if (input.answer.kind !== 'binary-probability') {
    throw new ValidationError('answer.kind does not match binary-probability schema');
  }
  const pTrue = requireProbability(input.answer.p_true, 'answer.p_true');
  if (input.probability_evidence !== null) {
    throw new ValidationError('binary provider input must not supply independent probability_evidence or p_false');
  }
  return {
    answer: { kind: 'binary-probability', p_true: pTrue },
    probability_evidence: [
      { value: false, probability: 1 - pTrue },
      { value: true, probability: pTrue }
    ]
  };
}

export function normalizeBoundedDecisionProviderResult(input, providerProfile, questionSchema) {
  validateBoundedDecisionProviderProfile(providerProfile);
  validateBoundedDecisionQuestionSchema(questionSchema);
  validateNormalizationInput(input);

  if (!providerProfile.supported_question_kinds.includes(questionSchema.question_kind)) {
    throw new ValidationError('provider profile does not support the bound question kind');
  }
  if (
    ['choice', 'score'].includes(questionSchema.question_kind)
    && providerProfile.probability_support !== 'full-distribution'
  ) {
    throw new ValidationError('choice and score normalization require full-distribution provider support');
  }
  if (
    questionSchema.question_kind === 'binary-probability'
    && !['full-distribution', 'binary-probability-only'].includes(providerProfile.probability_support)
  ) {
    throw new ValidationError('binary normalization requires probability-capable provider support');
  }

  let normalized;
  if (questionSchema.question_kind === 'choice') normalized = normalizeChoice(input, questionSchema);
  else if (questionSchema.question_kind === 'score') normalized = normalizeScore(input, questionSchema);
  else normalized = normalizeBinary(input);

  const document = {
    schema: BOUNDED_DECISION_OBSERVATION_SCHEMA,
    version: 0,
    status: OBSERVATION_STATUS,
    observation_id: input.observation_id,
    provider_profile_id: providerProfile.profile_id,
    provider_profile_digest: boundedDecisionProviderProfileDigest(providerProfile),
    catalog_entry_digest: providerProfile.catalog_entry_digest,
    offering_ref: providerProfile.offering_ref,
    offering_version_or_revision: providerProfile.offering_version_or_revision,
    offering_revision_evidence: providerProfile.offering_revision_evidence,
    question_schema_id: questionSchema.question_schema_id,
    question_schema_digest: boundedDecisionQuestionSchemaDigest(questionSchema),
    question_domain: questionSchema.domain,
    state_digest: input.state_digest,
    state_classification: input.state_classification,
    observed_at: input.observed_at,
    latency_ms: input.latency_ms,
    answer: normalized.answer,
    probability_evidence: normalized.probability_evidence,
    provider_confidence: input.provider_confidence,
    usage_evidence: structuredClone(input.usage_evidence),
    calibration_report_ref: input.calibration_report_ref,
    transport_evidence_ref: input.transport_evidence_ref,
    observation_digest: '0'.repeat(64),
    authority_effect: 'none',
    assurance_effect: 'none',
    network_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false,
    selection_effect: 'evidence-only'
  };
  document.observation_digest = computeBoundedDecisionObservationDigest(document);
  validateBoundedDecisionObservation(document, providerProfile, questionSchema);
  return deepFreeze(document);
}

export function createBoundedDecisionFailureReceipt(input) {
  requireFields(input, [
    'failure_id',
    'failure_class',
    'provider_profile_id',
    'provider_profile_digest',
    'question_schema_id',
    'question_schema_digest',
    'state_digest',
    'observed_at',
    'detail_ref'
  ], 'Bounded decision failure receipt input');
  rejectUnknown(input, [
    'failure_id',
    'failure_class',
    'provider_profile_id',
    'provider_profile_digest',
    'question_schema_id',
    'question_schema_digest',
    'state_digest',
    'observed_at',
    'detail_ref'
  ], 'Bounded decision failure receipt input');
  requireIdentifier(input.failure_id, 'failure_id');
  requireEnum(input.failure_class, FAILURE_CLASSES, 'failure_class');
  requireIdentifier(input.provider_profile_id, 'provider_profile_id');
  requireDigest(input.provider_profile_digest, 'provider_profile_digest');
  requireIdentifier(input.question_schema_id, 'question_schema_id');
  requireDigest(input.question_schema_digest, 'question_schema_digest');
  requireDigest(input.state_digest, 'state_digest');
  requireTimestamp(input.observed_at, 'observed_at');
  nullableString(input.detail_ref, 'detail_ref', 512);

  return deepFreeze({
    schema: BOUNDED_DECISION_FAILURE_RECEIPT_SCHEMA,
    version: 0,
    status: FAILURE_STATUS,
    failure_id: input.failure_id,
    failure_class: input.failure_class,
    provider_profile_id: input.provider_profile_id,
    provider_profile_digest: input.provider_profile_digest,
    question_schema_id: input.question_schema_id,
    question_schema_digest: input.question_schema_digest,
    state_digest: input.state_digest,
    observed_at: input.observed_at,
    detail_ref: input.detail_ref,
    semantic_answer: null,
    authority_effect: 'none',
    assurance_effect: 'none',
    network_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false,
    selection_effect: 'evidence-only'
  });
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
