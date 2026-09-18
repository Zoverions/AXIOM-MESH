import { digestObject, ValidationError } from './canonical.mjs';
import {
  boundedDecisionProviderProfileDigest,
  validateBoundedDecisionProviderProfile
} from './bounded-decision-provider-profile.mjs';
import {
  boundedDecisionQuestionSchemaDigest,
  validateBoundedDecisionQuestionSchema
} from './bounded-decision-question-schema.mjs';

export const BOUNDED_DECISION_CALIBRATION_REPORT_SCHEMA =
  'axiom-bounded-decision-calibration-report.v0';

const REPORT_STATUS = 'inert-bounded-decision-calibration';
const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const SHA256_RE = /^[a-f0-9]{64}$/;
const REVISION_EVIDENCE = Object.freeze([
  'exact-artifact',
  'provider-versioned',
  'mutable-alias',
  'unknown'
]);
const REVIEW_STATES = Object.freeze(['experimental', 'reviewed', 'expired', 'rejected']);
const OUTCOME_SOURCE_CLASSES = Object.freeze([
  'benchmark-harness',
  'deterministic-checker',
  'human-adjudication',
  'independent-verifier',
  'other-reviewed'
]);

const REPORT_FIELDS = Object.freeze([
  'schema',
  'version',
  'status',
  'calibration_report_id',
  'provider_profile_digest',
  'offering_version_or_revision',
  'offering_revision_evidence',
  'question_schema_family_refs',
  'domain',
  'population_description',
  'evaluation_period',
  'sample_count',
  'outcome_source_refs',
  'metrics',
  'known_limitations',
  'distribution_shift_notes',
  'created_at',
  'valid_until',
  'review_state',
  'report_digest',
  'authority_effect',
  'assurance_effect',
  'network_effect',
  'credential_visibility',
  'runtime_activation',
  'selection_effect'
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

function requireString(value, name, max = 4096) {
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

function requirePositiveInteger(value, name, max = 10_000_000) {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) {
    throw new ValidationError(`${name} must be a positive bounded integer`);
  }
  return value;
}

function requireStringArray(value, name, max = 64) {
  if (!Array.isArray(value) || value.length > max) {
    throw new ValidationError(`${name} must be an array with at most ${max} entries`);
  }
  const seen = new Set();
  for (const item of value) {
    requireString(item, `${name}[]`, 1024);
    if (seen.has(item)) throw new ValidationError(`${name} contains duplicate values`);
    seen.add(item);
  }
  return value;
}

function validateEvaluationPeriod(value) {
  requireFields(value, ['from', 'to'], 'evaluation_period');
  rejectUnknown(value, ['from', 'to'], 'evaluation_period');
  const from = requireTimestamp(value.from, 'evaluation_period.from');
  const to = requireTimestamp(value.to, 'evaluation_period.to');
  if (to < from) throw new ValidationError('evaluation_period.to cannot precede evaluation_period.from');
  return { from, to };
}

function validateSchemaFamilyRefs(values) {
  if (!Array.isArray(values) || values.length < 1 || values.length > 128) {
    throw new ValidationError('question_schema_family_refs must contain 1-128 entries');
  }
  const ids = new Set();
  const digests = new Set();
  for (const [index, value] of values.entries()) {
    requireFields(value, ['question_schema_id', 'question_schema_digest'], `question_schema_family_refs[${index}]`);
    rejectUnknown(value, ['question_schema_id', 'question_schema_digest'], `question_schema_family_refs[${index}]`);
    requireIdentifier(value.question_schema_id, `question_schema_family_refs[${index}].question_schema_id`);
    requireDigest(value.question_schema_digest, `question_schema_family_refs[${index}].question_schema_digest`);
    if (ids.has(value.question_schema_id) || digests.has(value.question_schema_digest)) {
      throw new ValidationError('question_schema_family_refs contains duplicate schema identity or digest');
    }
    ids.add(value.question_schema_id);
    digests.add(value.question_schema_digest);
  }
}

function validateOutcomeSources(values) {
  if (!Array.isArray(values) || values.length < 1 || values.length > 128) {
    throw new ValidationError('outcome_source_refs must contain 1-128 independently sourced entries');
  }
  const refs = new Set();
  const digests = new Set();
  for (const [index, value] of values.entries()) {
    requireFields(value, ['outcome_ref', 'outcome_digest', 'source_class'], `outcome_source_refs[${index}]`);
    rejectUnknown(value, ['outcome_ref', 'outcome_digest', 'source_class'], `outcome_source_refs[${index}]`);
    requireIdentifier(value.outcome_ref, `outcome_source_refs[${index}].outcome_ref`);
    requireDigest(value.outcome_digest, `outcome_source_refs[${index}].outcome_digest`);
    requireEnum(value.source_class, OUTCOME_SOURCE_CLASSES, `outcome_source_refs[${index}].source_class`);
    if (refs.has(value.outcome_ref) || digests.has(value.outcome_digest)) {
      throw new ValidationError('outcome_source_refs contains duplicate outcome reference or digest');
    }
    refs.add(value.outcome_ref);
    digests.add(value.outcome_digest);
  }
}

function validateMetrics(values) {
  if (!Array.isArray(values) || values.length < 1 || values.length > 64) {
    throw new ValidationError('metrics must contain 1-64 entries');
  }
  const seen = new Set();
  for (const [index, value] of values.entries()) {
    requireFields(value, ['metric_id', 'value'], `metrics[${index}]`);
    rejectUnknown(value, ['metric_id', 'value'], `metrics[${index}]`);
    requireIdentifier(value.metric_id, `metrics[${index}].metric_id`);
    if (typeof value.value !== 'number' || !Number.isFinite(value.value)) {
      throw new ValidationError(`metrics[${index}].value must be finite`);
    }
    if (seen.has(value.metric_id)) throw new ValidationError(`metrics contains duplicate metric ${value.metric_id}`);
    seen.add(value.metric_id);
  }
}

function validateReportShape(document) {
  requireFields(document, REPORT_FIELDS, 'Bounded decision calibration report');
  rejectUnknown(document, REPORT_FIELDS, 'Bounded decision calibration report');
  if (document.schema !== BOUNDED_DECISION_CALIBRATION_REPORT_SCHEMA) {
    throw new ValidationError('Bounded decision calibration report schema is invalid');
  }
  if (document.version !== 0) throw new ValidationError('Bounded decision calibration report version is invalid');
  if (document.status !== REPORT_STATUS) throw new ValidationError('Bounded decision calibration report status is invalid');

  requireIdentifier(document.calibration_report_id, 'calibration_report_id');
  requireDigest(document.provider_profile_digest, 'provider_profile_digest');
  requireString(document.offering_version_or_revision, 'offering_version_or_revision', 256);
  requireEnum(document.offering_revision_evidence, REVISION_EVIDENCE, 'offering_revision_evidence');
  validateSchemaFamilyRefs(document.question_schema_family_refs);
  requireString(document.domain, 'domain', 512);
  requireString(document.population_description, 'population_description', 4096);
  const evaluation = validateEvaluationPeriod(document.evaluation_period);
  requirePositiveInteger(document.sample_count, 'sample_count');
  validateOutcomeSources(document.outcome_source_refs);
  validateMetrics(document.metrics);
  requireStringArray(document.known_limitations, 'known_limitations');
  requireStringArray(document.distribution_shift_notes, 'distribution_shift_notes');
  const createdAt = requireTimestamp(document.created_at, 'created_at');
  const validUntil = requireTimestamp(document.valid_until, 'valid_until');
  if (createdAt < evaluation.to) {
    throw new ValidationError('created_at cannot precede evaluation_period.to');
  }
  if (validUntil < createdAt) throw new ValidationError('valid_until cannot precede created_at');
  requireEnum(document.review_state, REVIEW_STATES, 'review_state');
  requireDigest(document.report_digest, 'report_digest');

  if (
    document.authority_effect !== 'none'
    || document.assurance_effect !== 'none'
    || document.network_effect !== 'none'
    || document.credential_visibility !== 'none'
    || document.runtime_activation !== false
    || document.selection_effect !== 'evidence-only'
  ) {
    throw new ValidationError('Bounded decision calibration report boundary effect is invalid');
  }
  return document;
}

function digestPayload(document) {
  const copy = structuredClone(document);
  delete copy.report_digest;
  return copy;
}

export function computeBoundedDecisionCalibrationReportDigest(document) {
  validateReportShape(document);
  return digestObject(digestPayload(document));
}

export function validateBoundedDecisionCalibrationReport(document) {
  validateReportShape(document);
  const expected = digestObject(digestPayload(document));
  if (document.report_digest !== expected) {
    throw new ValidationError('Bounded decision calibration report digest mismatch');
  }
  return deepFreeze({
    valid: true,
    schema: document.schema,
    calibration_report_id: document.calibration_report_id,
    report_digest: expected,
    provider_profile_digest: document.provider_profile_digest,
    offering_version_or_revision: document.offering_version_or_revision,
    offering_revision_evidence: document.offering_revision_evidence,
    domain: document.domain,
    sample_count: document.sample_count,
    review_state: document.review_state,
    created_at: document.created_at,
    valid_until: document.valid_until,
    authority_effect: 'none',
    assurance_effect: 'none',
    network_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false,
    selection_effect: 'evidence-only'
  });
}

export function boundedDecisionCalibrationReportDigest(document) {
  return validateBoundedDecisionCalibrationReport(document).report_digest;
}

export function resolveBoundedDecisionCalibrationReport(document, providerProfile, questionSchemas) {
  const validated = validateBoundedDecisionCalibrationReport(document);
  validateBoundedDecisionProviderProfile(providerProfile);
  const profileDigest = boundedDecisionProviderProfileDigest(providerProfile);
  if (document.provider_profile_digest !== profileDigest) {
    throw new ValidationError('calibration report provider profile digest does not match supplied profile');
  }
  if (
    document.offering_version_or_revision !== providerProfile.offering_version_or_revision
    || document.offering_revision_evidence !== providerProfile.offering_revision_evidence
  ) {
    throw new ValidationError('calibration report offering revision evidence does not match supplied provider profile');
  }
  if (!Array.isArray(questionSchemas)) {
    throw new ValidationError('supplied question schema family must be an array');
  }
  if (questionSchemas.length !== document.question_schema_family_refs.length) {
    throw new ValidationError('supplied question schema family is missing or contains extra schemas');
  }
  const supplied = new Map();
  for (const questionSchema of questionSchemas) {
    validateBoundedDecisionQuestionSchema(questionSchema);
    const digest = boundedDecisionQuestionSchemaDigest(questionSchema);
    if (supplied.has(questionSchema.question_schema_id)) {
      throw new ValidationError('supplied question schema family contains duplicate ids');
    }
    supplied.set(questionSchema.question_schema_id, { questionSchema, digest });
  }
  for (const ref of document.question_schema_family_refs) {
    const match = supplied.get(ref.question_schema_id);
    if (!match || match.digest !== ref.question_schema_digest) {
      throw new ValidationError('calibration report question schema family reference does not resolve exactly');
    }
    if (match.questionSchema.domain !== document.domain) {
      throw new ValidationError('calibration report domain does not match supplied question schema domain');
    }
  }
  const providerAliases = new Set([
    providerProfile.profile_id,
    providerProfile.offering_ref,
    providerProfile.catalog_entry_id,
    profileDigest,
    providerProfile.catalog_entry_digest
  ]);
  for (const source of document.outcome_source_refs) {
    if (
      providerAliases.has(source.outcome_ref)
      || providerAliases.has(source.outcome_digest)
    ) {
      throw new ValidationError('calibration outcome source must remain independently sourced from provider identity and digests');
    }
  }

  return deepFreeze({
    valid: true,
    schema: BOUNDED_DECISION_CALIBRATION_REPORT_SCHEMA,
    calibration_report_id: document.calibration_report_id,
    report_digest: validated.report_digest,
    provider_profile_digest: document.provider_profile_digest,
    offering_version_or_revision: document.offering_version_or_revision,
    offering_revision_evidence: document.offering_revision_evidence,
    question_schema_family_refs: document.question_schema_family_refs.map(item => ({ ...item })),
    domain: document.domain,
    population_description: document.population_description,
    evaluation_period: { ...document.evaluation_period },
    sample_count: document.sample_count,
    outcome_source_refs: document.outcome_source_refs.map(item => ({ ...item })),
    metrics: document.metrics.map(item => ({ ...item })),
    known_limitations: [...document.known_limitations],
    distribution_shift_notes: [...document.distribution_shift_notes],
    created_at: document.created_at,
    valid_until: document.valid_until,
    review_state: document.review_state,
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
