import { digestObject, ValidationError } from './canonical.mjs';

export const BOUNDED_DECISION_QUESTION_SCHEMA =
  'axiom-bounded-decision-question-schema.v0';

const QUESTION_STATUS = 'inert-bounded-decision-question-schema';
const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const SHA256_RE = /^[a-f0-9]{64}$/;
const QUESTION_KINDS = Object.freeze(['choice', 'score', 'binary-probability']);
const OTHER_OPTION_POLICIES = Object.freeze(['required', 'allowed', 'forbidden']);

const COMMON_FIELDS = Object.freeze([
  'schema',
  'version',
  'status',
  'question_schema_id',
  'question_kind',
  'instructions',
  'purpose',
  'domain',
  'state_contract_ref',
  'known_limitations',
  'created_at',
  'schema_digest'
]);
const FIELDS_BY_KIND = Object.freeze({
  choice: Object.freeze([...COMMON_FIELDS, 'options', 'other_option_policy']),
  score: Object.freeze([...COMMON_FIELDS, 'levels']),
  'binary-probability': Object.freeze([...COMMON_FIELDS, 'true_meaning', 'false_meaning'])
});

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

function requireString(value, name, max = 4096) {
  if (typeof value !== 'string' || value.length < 1 || value.length > max) {
    throw new ValidationError(`${name} must be a non-empty string with at most ${max} characters`);
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

function requireStringArray(value, name, { min = 0, max = 32, itemMax = 1024 } = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new ValidationError(`${name} must contain ${min}-${max} strings`);
  }
  const seen = new Set();
  for (const item of value) {
    requireString(item, `${name}[]`, itemMax);
    if (seen.has(item)) throw new ValidationError(`${name} contains duplicate value`);
    seen.add(item);
  }
  return value;
}

function validateChoice(document) {
  if (!Array.isArray(document.options) || document.options.length < 2 || document.options.length > 64) {
    throw new ValidationError('options must contain 2-64 entries');
  }
  const ids = new Set();
  for (const [index, option] of document.options.entries()) {
    requireFields(option, ['option_id', 'description'], `options[${index}]`);
    rejectUnknown(option, ['option_id', 'description'], `options[${index}]`);
    requireIdentifier(option.option_id, `options[${index}].option_id`);
    requireString(option.description, `options[${index}].description`, 2048);
    if (ids.has(option.option_id)) {
      throw new ValidationError(`options contains duplicate option_id ${option.option_id}`);
    }
    ids.add(option.option_id);
  }
  requireEnum(document.other_option_policy, OTHER_OPTION_POLICIES, 'other_option_policy');
  if (
    document.other_option_policy === 'required'
    && !ids.has('other')
    && !ids.has('none')
  ) {
    throw new ValidationError('required other_option_policy requires an explicit other or none fallback option');
  }
  if (
    document.other_option_policy === 'forbidden'
    && (ids.has('other') || ids.has('none'))
  ) {
    throw new ValidationError('forbidden other_option_policy cannot include an explicit other or none fallback option');
  }
}

function validateScore(document) {
  if (!Array.isArray(document.levels) || document.levels.length < 2 || document.levels.length > 10) {
    throw new ValidationError('levels must contain 2-10 entries');
  }
  const ids = new Set();
  for (const [index, level] of document.levels.entries()) {
    requireFields(level, ['level_id', 'position', 'description'], `levels[${index}]`);
    rejectUnknown(level, ['level_id', 'position', 'description'], `levels[${index}]`);
    requireIdentifier(level.level_id, `levels[${index}].level_id`);
    if (ids.has(level.level_id)) {
      throw new ValidationError(`levels contains duplicate level_id ${level.level_id}`);
    }
    ids.add(level.level_id);
    if (!Number.isSafeInteger(level.position) || level.position !== index) {
      throw new ValidationError(`levels[${index}].position must equal ${index}`);
    }
    requireString(level.description, `levels[${index}].description`, 2048);
  }
}

function validateBinary(document) {
  requireString(document.true_meaning, 'true_meaning', 2048);
  requireString(document.false_meaning, 'false_meaning', 2048);
  if (document.true_meaning === document.false_meaning) {
    throw new ValidationError('true_meaning and false_meaning must be distinct');
  }
}

function validateQuestionShape(document) {
  requirePlain(document, 'Bounded decision question schema');
  requireEnum(document.question_kind, QUESTION_KINDS, 'question_kind');
  const fields = FIELDS_BY_KIND[document.question_kind];
  requireFields(document, fields, 'Bounded decision question schema');
  rejectUnknown(document, fields, 'Bounded decision question schema');

  if (document.schema !== BOUNDED_DECISION_QUESTION_SCHEMA) {
    throw new ValidationError('Bounded decision question schema identifier is invalid');
  }
  if (document.version !== 0) {
    throw new ValidationError('Bounded decision question schema version is invalid');
  }
  if (document.status !== QUESTION_STATUS) {
    throw new ValidationError('Bounded decision question schema status is invalid');
  }

  requireIdentifier(document.question_schema_id, 'question_schema_id');
  requireString(document.instructions, 'instructions', 4096);
  requireString(document.purpose, 'purpose', 512);
  requireString(document.domain, 'domain', 512);
  requireString(document.state_contract_ref, 'state_contract_ref', 512);
  requireStringArray(document.known_limitations, 'known_limitations', {
    min: 0,
    max: 32,
    itemMax: 1024
  });
  requireTimestamp(document.created_at, 'created_at');
  requireDigest(document.schema_digest, 'schema_digest');

  if (document.question_kind === 'choice') validateChoice(document);
  else if (document.question_kind === 'score') validateScore(document);
  else validateBinary(document);

  return document;
}

function digestPayload(document) {
  const copy = structuredClone(document);
  delete copy.schema_digest;
  return copy;
}

export function computeBoundedDecisionQuestionSchemaDigest(document) {
  validateQuestionShape(document);
  return digestObject(digestPayload(document));
}

export function validateBoundedDecisionQuestionSchema(document) {
  validateQuestionShape(document);
  const expected = digestObject(digestPayload(document));
  if (document.schema_digest !== expected) {
    throw new ValidationError('Bounded decision question schema digest mismatch');
  }
  return deepFreeze({
    valid: true,
    schema: document.schema,
    question_schema_id: document.question_schema_id,
    question_kind: document.question_kind,
    schema_digest: expected,
    authority_effect: 'none'
  });
}

export function boundedDecisionQuestionSchemaDigest(document) {
  return validateBoundedDecisionQuestionSchema(document).schema_digest;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
