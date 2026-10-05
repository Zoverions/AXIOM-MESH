import {
  ValidationError,
  assertPlainObject,
  assertString,
  assertStringArray,
  digestObject
} from './canonical.mjs';
import {
  BOUNDED_DECISION_CALIBRATION_REPORT_SCHEMA,
  validateBoundedDecisionCalibrationReport
} from './bounded-decision-calibration-report.mjs';

const SCHEMA = 'axiom-behavioral-assurance-profile.v0';
const STATUS = 'inert-behavioral-assurance-evidence';
const ZERO_DIGEST = '0'.repeat(64);
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

const TOP_LEVEL_KEYS = Object.freeze([
  'schema',
  'version',
  'status',
  'profile_id',
  'subject',
  'populations',
  'created_at',
  'valid_until',
  'profile_digest',
  'authority_effect',
  'assurance_effect',
  'network_effect',
  'credential_visibility',
  'runtime_activation',
  'selection_effect'
]);

const SUBJECT_KEYS = Object.freeze([
  'subject_kind',
  'subject_id',
  'subject_digest',
  'provider_model_revision',
  'binding_strength',
  'instruction_policy_digest',
  'context_memory_policy_digest',
  'tool_policy_digest',
  'sampling_configuration_digest',
  'environment_harness_digest'
]);

const POPULATION_KEYS = Object.freeze([
  'population_id',
  'population_digest',
  'domain',
  'task_family',
  'consequence_class',
  'evaluation_period',
  'sample_count',
  'minimum_sample_count',
  'sample_sufficiency',
  'inclusion_criteria',
  'exclusion_criteria',
  'verification_sources',
  'rubric_refs',
  'dimensions',
  'incident_events',
  'known_limitations',
  'distribution_shift_notes'
]);

const EVALUATION_PERIOD_KEYS = Object.freeze(['from', 'to']);
const VERIFICATION_SOURCE_KEYS = Object.freeze([
  'source_id',
  'source_digest',
  'source_class',
  'independence_group'
]);
const RUBRIC_REF_KEYS = Object.freeze(['rubric_id', 'rubric_digest']);
const DIMENSION_KEYS = Object.freeze([
  'dimension_id',
  'evidence_state',
  'metric_kind',
  'value',
  'sample_count',
  'calibration_ref',
  'calibration_digest',
  'calibration_state'
]);
const INCIDENT_EVENT_KEYS = Object.freeze(['event_class', 'count', 'evidence_refs']);

const SUBJECT_KINDS = new Set([
  'model-artifact',
  'provider-offering',
  'cognitive-runtime',
  'agent-harness',
  'verifier-harness'
]);
const BINDING_STRENGTHS = new Set([
  'exact-artifact',
  'provider-versioned',
  'bounded-harness',
  'mutable-alias',
  'unknown'
]);
const CONSEQUENCE_CLASSES = new Set([
  'informational',
  'digital-reversible',
  'digital-consequential',
  'physical-reversible',
  'physical-safety-relevant',
  'physical-potentially-irreversible'
]);
const VERIFICATION_SOURCE_CLASSES = new Set([
  'deterministic-checker',
  'human-adjudication',
  'semantic-verifier',
  'model-verifier',
  'provider-evaluator',
  'other-reviewed'
]);
const DIMENSION_IDS = new Set([
  'factual-reliability',
  'source-provenance-fidelity',
  'uncertainty-abstention-quality',
  'instruction-fidelity',
  'user-intent-fit',
  'authority-effect-discipline',
  'privacy-egress-discipline',
  'tool-use-discipline',
  'prompt-context-injection-resistance',
  'self-authored-instruction-incidence',
  'fabricated-source-data-incidence',
  'concealment-reporting-integrity',
  'credential-boundary-discipline',
  'cross-agent-shared-state-discipline',
  'correction-responsiveness',
  'benign-perturbation-robustness',
  'adversarial-robustness',
  'domain-competence',
  'policy-conformance'
]);
const EVIDENCE_STATES = new Set([
  'accepted-evidence',
  'insufficient-evidence',
  'conflicting-evidence',
  'stale-evidence',
  'invalid-evidence'
]);
const METRIC_KINDS = new Set(['probability', 'rate', 'count', 'score']);
const CALIBRATION_STATES = new Set([
  'reviewed',
  'experimental',
  'rejected',
  'expired',
  'not-applicable'
]);
const INCIDENT_CLASSES = new Set([
  'self-authored-summary-instruction',
  'concealment-reporting-integrity-failure',
  'fabricated-unavailable-source-data',
  'unauthorized-credential-use',
  'public-upload-egress-workaround',
  'shared-state-cross-agent-communication',
  'broken-collaboration-channel-widening'
]);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) deepFreeze(item);
  return Object.freeze(value);
}

function clone(value) {
  return structuredClone(value);
}

function assertExactKeys(value, allowedKeys, name) {
  const object = assertPlainObject(value, name);
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(object)) {
    if (!allowed.has(key)) throw new ValidationError(`${name} contains unknown field ${key}`);
  }
  for (const key of allowedKeys) {
    if (!Object.hasOwn(object, key)) throw new ValidationError(`${name} is missing required field ${key}`);
  }
  return object;
}

function assertEnum(value, allowed, name) {
  assertString(value, name, { max: 160 });
  if (!allowed.has(value)) throw new ValidationError(`${name} is invalid`);
  return value;
}

function assertId(value, name) {
  return assertString(value, name, { min: 1, max: 160, pattern: ID_PATTERN });
}

function assertDigest(value, name) {
  return assertString(value, name, { min: 64, max: 64, pattern: DIGEST_PATTERN });
}

function assertTimestamp(value, name) {
  assertString(value, name, { min: 20, max: 40 });
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || !value.endsWith('Z')) {
    throw new ValidationError(`${name} must be an RFC3339 UTC timestamp`);
  }
  return value;
}

function assertInteger(value, name, { min = 0 } = {}) {
  if (!Number.isSafeInteger(value) || value < min) {
    throw new ValidationError(`${name} must be an integer >= ${min}`);
  }
  return value;
}

function assertFiniteNumber(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ValidationError(`${name} must be a finite number`);
  }
  return value;
}

function assertArray(value, name, { minItems = 0, maxItems = 64 } = {}) {
  if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) {
    throw new ValidationError(`${name} must be an array with ${minItems}-${maxItems} items`);
  }
  return value;
}

function validateSubject(subject) {
  assertExactKeys(subject, SUBJECT_KEYS, 'subject');
  assertEnum(subject.subject_kind, SUBJECT_KINDS, 'subject.subject_kind');
  assertId(subject.subject_id, 'subject.subject_id');
  assertDigest(subject.subject_digest, 'subject.subject_digest');
  assertString(subject.provider_model_revision, 'subject.provider_model_revision', { min: 1, max: 256 });
  assertEnum(subject.binding_strength, BINDING_STRENGTHS, 'subject.binding_strength');
  assertDigest(subject.instruction_policy_digest, 'subject.instruction_policy_digest');
  assertDigest(subject.context_memory_policy_digest, 'subject.context_memory_policy_digest');
  assertDigest(subject.tool_policy_digest, 'subject.tool_policy_digest');
  assertDigest(subject.sampling_configuration_digest, 'subject.sampling_configuration_digest');
  assertDigest(subject.environment_harness_digest, 'subject.environment_harness_digest');
}

function validateEvaluationPeriod(period, populationIndex) {
  const name = `populations[${populationIndex}].evaluation_period`;
  assertExactKeys(period, EVALUATION_PERIOD_KEYS, name);
  const from = assertTimestamp(period.from, `${name}.from`);
  const to = assertTimestamp(period.to, `${name}.to`);
  if (Date.parse(from) > Date.parse(to)) throw new ValidationError(`${name}.from must not be after .to`);
}

function validateVerificationSource(source, populationIndex, sourceIndex) {
  const name = `populations[${populationIndex}].verification_sources[${sourceIndex}]`;
  assertExactKeys(source, VERIFICATION_SOURCE_KEYS, name);
  assertId(source.source_id, `${name}.source_id`);
  assertDigest(source.source_digest, `${name}.source_digest`);
  assertEnum(source.source_class, VERIFICATION_SOURCE_CLASSES, `${name}.source_class`);
  assertId(source.independence_group, `${name}.independence_group`);
}

function validateRubricRef(ref, populationIndex, rubricIndex) {
  const name = `populations[${populationIndex}].rubric_refs[${rubricIndex}]`;
  assertExactKeys(ref, RUBRIC_REF_KEYS, name);
  assertId(ref.rubric_id, `${name}.rubric_id`);
  assertDigest(ref.rubric_digest, `${name}.rubric_digest`);
}

function validateDimension(dimension, populationIndex, dimensionIndex, populationSampleCount) {
  const name = `populations[${populationIndex}].dimensions[${dimensionIndex}]`;
  assertExactKeys(dimension, DIMENSION_KEYS, name);
  assertEnum(dimension.dimension_id, DIMENSION_IDS, `${name}.dimension_id`);
  assertEnum(dimension.evidence_state, EVIDENCE_STATES, `${name}.evidence_state`);
  assertEnum(dimension.metric_kind, METRIC_KINDS, `${name}.metric_kind`);
  assertFiniteNumber(dimension.value, `${name}.value`);
  assertInteger(dimension.sample_count, `${name}.sample_count`);
  if (dimension.sample_count > populationSampleCount) {
    throw new ValidationError(`${name}.sample_count cannot exceed its population sample_count`);
  }

  if (dimension.metric_kind === 'probability' || dimension.metric_kind === 'rate') {
    if (dimension.value < 0 || dimension.value > 1) {
      throw new ValidationError(`${name}.value must be between 0 and 1 for ${dimension.metric_kind}`);
    }
  } else if (dimension.metric_kind === 'count' && (!Number.isSafeInteger(dimension.value) || dimension.value < 0)) {
    throw new ValidationError(`${name}.value must be a non-negative integer for count metrics`);
  }

  if (dimension.calibration_ref !== null) assertId(dimension.calibration_ref, `${name}.calibration_ref`);
  if (dimension.calibration_digest !== null) assertDigest(dimension.calibration_digest, `${name}.calibration_digest`);
  assertEnum(dimension.calibration_state, CALIBRATION_STATES, `${name}.calibration_state`);

  if (dimension.metric_kind === 'probability') {
    if (
      dimension.calibration_state !== 'reviewed' ||
      dimension.calibration_ref === null ||
      dimension.calibration_digest === null
    ) {
      throw new ValidationError(`${name} probability semantics require reviewed calibration evidence refs`);
    }
  }

  if (dimension.calibration_state === 'not-applicable') {
    if (dimension.calibration_ref !== null || dimension.calibration_digest !== null) {
      throw new ValidationError(`${name} not-applicable calibration must not carry calibration references`);
    }
  } else if ((dimension.calibration_ref === null) !== (dimension.calibration_digest === null)) {
    throw new ValidationError(`${name} calibration reference and digest must be present together`);
  }
}

function validateIncidentEvent(event, populationIndex, eventIndex) {
  const name = `populations[${populationIndex}].incident_events[${eventIndex}]`;
  assertExactKeys(event, INCIDENT_EVENT_KEYS, name);
  assertEnum(event.event_class, INCIDENT_CLASSES, `${name}.event_class`);
  assertInteger(event.count, `${name}.count`, { min: 1 });
  const refs = assertArray(event.evidence_refs, `${name}.evidence_refs`, { minItems: 1, maxItems: 128 });
  refs.forEach((ref, refIndex) => assertId(ref, `${name}.evidence_refs[${refIndex}]`));
}

function validatePopulation(population, populationIndex) {
  const name = `populations[${populationIndex}]`;
  assertExactKeys(population, POPULATION_KEYS, name);
  assertId(population.population_id, `${name}.population_id`);
  assertDigest(population.population_digest, `${name}.population_digest`);
  assertString(population.domain, `${name}.domain`, { min: 1, max: 160 });
  assertString(population.task_family, `${name}.task_family`, { min: 1, max: 160 });
  assertEnum(population.consequence_class, CONSEQUENCE_CLASSES, `${name}.consequence_class`);
  validateEvaluationPeriod(population.evaluation_period, populationIndex);

  assertInteger(population.sample_count, `${name}.sample_count`);
  assertInteger(population.minimum_sample_count, `${name}.minimum_sample_count`, { min: 1 });
  assertEnum(population.sample_sufficiency, new Set(['sufficient', 'insufficient']), `${name}.sample_sufficiency`);
  const expectedSufficiency = population.sample_count >= population.minimum_sample_count ? 'sufficient' : 'insufficient';
  if (population.sample_sufficiency !== expectedSufficiency) {
    throw new ValidationError(
      `${name}.sample_sufficiency must match sample_count and minimum_sample_count`
    );
  }

  assertStringArray(population.inclusion_criteria, `${name}.inclusion_criteria`, { maxItems: 64, itemMax: 512 });
  assertStringArray(population.exclusion_criteria, `${name}.exclusion_criteria`, { maxItems: 64, itemMax: 512 });
  assertStringArray(population.known_limitations, `${name}.known_limitations`, { maxItems: 64, itemMax: 512 });
  assertStringArray(population.distribution_shift_notes, `${name}.distribution_shift_notes`, { maxItems: 64, itemMax: 512 });

  const verificationSources = assertArray(population.verification_sources, `${name}.verification_sources`, {
    minItems: 1,
    maxItems: 64
  });
  verificationSources.forEach((source, sourceIndex) => validateVerificationSource(source, populationIndex, sourceIndex));

  const rubricRefs = assertArray(population.rubric_refs, `${name}.rubric_refs`, { minItems: 1, maxItems: 64 });
  rubricRefs.forEach((ref, rubricIndex) => validateRubricRef(ref, populationIndex, rubricIndex));

  const dimensions = assertArray(population.dimensions, `${name}.dimensions`, { minItems: 1, maxItems: 64 });
  const dimensionIds = new Set();
  dimensions.forEach((dimension, dimensionIndex) => {
    validateDimension(dimension, populationIndex, dimensionIndex, population.sample_count);
    if (dimensionIds.has(dimension.dimension_id)) {
      throw new ValidationError(`${name}.dimensions contains duplicate dimension_id ${dimension.dimension_id}`);
    }
    dimensionIds.add(dimension.dimension_id);
  });

  const incidentEvents = assertArray(population.incident_events, `${name}.incident_events`, { maxItems: 128 });
  const eventClasses = new Set();
  incidentEvents.forEach((event, eventIndex) => {
    validateIncidentEvent(event, populationIndex, eventIndex);
    if (eventClasses.has(event.event_class)) {
      throw new ValidationError(`${name}.incident_events contains duplicate event_class ${event.event_class}`);
    }
    eventClasses.add(event.event_class);
  });
}

function validateBoundaryConstants(document) {
  const expected = [
    ['authority_effect', 'none'],
    ['assurance_effect', 'evidence-only'],
    ['network_effect', 'none'],
    ['credential_visibility', 'none'],
    ['runtime_activation', false],
    ['selection_effect', 'evidence-only']
  ];
  for (const [field, value] of expected) {
    if (document[field] !== value) {
      throw new ValidationError(`${field} boundary effect is invalid`);
    }
  }
}

function validateSemantics(document, { verifyDigest = true } = {}) {
  assertExactKeys(document, TOP_LEVEL_KEYS, 'Behavioral Assurance Profile');
  if (document.schema !== SCHEMA) throw new ValidationError(`schema must be ${SCHEMA}`);
  if (document.version !== 0) throw new ValidationError('version must be 0');
  if (document.status !== STATUS) throw new ValidationError(`status must be ${STATUS}`);
  assertId(document.profile_id, 'profile_id');
  validateSubject(document.subject);

  const populations = assertArray(document.populations, 'populations', { minItems: 1, maxItems: 64 });
  const populationIds = new Set();
  populations.forEach((population, populationIndex) => {
    validatePopulation(population, populationIndex);
    if (populationIds.has(population.population_id)) {
      throw new ValidationError(`populations contains duplicate population_id ${population.population_id}`);
    }
    populationIds.add(population.population_id);
  });

  const createdAt = assertTimestamp(document.created_at, 'created_at');
  const validUntil = assertTimestamp(document.valid_until, 'valid_until');
  if (Date.parse(createdAt) > Date.parse(validUntil)) {
    throw new ValidationError('created_at must not be after valid_until');
  }
  assertDigest(document.profile_digest, 'profile_digest');
  validateBoundaryConstants(document);

  if (verifyDigest) {
    const expectedDigest = computeBehavioralAssuranceProfileDigest(document);
    if (document.profile_digest !== expectedDigest) {
      throw new ValidationError('Behavioral Assurance Profile digest mismatch');
    }
  }
}


function findProbabilityDimensions(document) {
  const found = [];
  document.populations.forEach((population, populationIndex) => {
    population.dimensions.forEach((dimension, dimensionIndex) => {
      if (dimension.metric_kind === 'probability') {
        found.push({ population, populationIndex, dimension, dimensionIndex });
      }
    });
  });
  return found;
}

function assertEvaluationPeriodCompatible(population, calibration, name) {
  const popFrom = Date.parse(population.evaluation_period.from);
  const popTo = Date.parse(population.evaluation_period.to);
  const calFrom = Date.parse(calibration.evaluation_period.from);
  const calTo = Date.parse(calibration.evaluation_period.to);
  if (!Number.isFinite(popFrom) || !Number.isFinite(popTo) || !Number.isFinite(calFrom) || !Number.isFinite(calTo)) {
    throw new ValidationError(`${name} evaluation period is invalid`);
  }
  if (calFrom < popFrom || calTo > popTo) {
    throw new ValidationError(`${name} calibration evaluation period must stay within the bound population period`);
  }
}

function assertIndependentlySourcedOutcomes(population, calibration, subject, name) {
  const outcomes = calibration.outcome_source_refs;
  if (!Array.isArray(outcomes) || outcomes.length < 1) {
    throw new ValidationError(`${name} probability calibration requires independently sourced outcomes`);
  }
  const forbiddenAliases = new Set([
    subject.subject_id,
    subject.subject_digest,
    population.population_id,
    population.population_digest,
    calibration.provider_profile_digest
  ]);
  const digests = new Set();
  const refs = new Set();
  for (const [index, source] of outcomes.entries()) {
    if (forbiddenAliases.has(source.outcome_ref) || forbiddenAliases.has(source.outcome_digest)) {
      throw new ValidationError(`${name} outcome_source_refs[${index}] must remain independently sourced from subject and population identity`);
    }
    if (refs.has(source.outcome_ref) || digests.has(source.outcome_digest)) {
      throw new ValidationError(`${name} outcome_source_refs contains duplicate outcome reference or digest`);
    }
    refs.add(source.outcome_ref);
    digests.add(source.outcome_digest);
  }
}

function bindProbabilityCalibration(dimension, population, subject, calibrationReports, nowMs, name) {
  const matches = calibrationReports.filter(item => (
    item?.calibration_report_id === dimension.calibration_ref
    && item?.report_digest === dimension.calibration_digest
  ));
  if (matches.length !== 1) {
    throw new ValidationError(`${name} probability calibration must resolve to exactly one validated #1588 report`);
  }
  const calibration = matches[0];
  validateBoundedDecisionCalibrationReport(calibration);
  if (calibration.schema !== BOUNDED_DECISION_CALIBRATION_REPORT_SCHEMA) {
    throw new ValidationError(`${name} probability calibration must use ${BOUNDED_DECISION_CALIBRATION_REPORT_SCHEMA}`);
  }
  if (calibration.review_state !== 'reviewed' || dimension.calibration_state !== 'reviewed') {
    throw new ValidationError(`${name} probability semantics require a reviewed #1588 calibration binding`);
  }
  if (calibration.domain !== population.domain) {
    throw new ValidationError(`${name} probability calibration domain must match the bound population domain`);
  }
  assertEvaluationPeriodCompatible(population, calibration, name);
  assertIndependentlySourcedOutcomes(population, calibration, subject, name);
  const validUntil = Date.parse(calibration.valid_until);
  if (!Number.isFinite(validUntil)) {
    throw new ValidationError(`${name} probability calibration valid_until is invalid`);
  }
  if (nowMs !== null && validUntil <= nowMs) {
    throw new ValidationError(`${name} probability calibration is expired`);
  }
  return calibration;
}

export function bindBehavioralAssuranceProbabilityCalibrations(document, calibrationReports, { now = null } = {}) {
  validateSemantics(document, { verifyDigest: true });
  if (!Array.isArray(calibrationReports)) {
    throw new ValidationError('probability semantics require an array of validated #1588 calibration reports');
  }
  const nowMs = now === null ? null : Date.parse(assertTimestamp(now, 'now'));
  if (now !== null && !Number.isFinite(nowMs)) {
    throw new ValidationError('now must be an RFC3339 UTC timestamp');
  }
  const bound = [];
  for (const entry of findProbabilityDimensions(document)) {
    const name = `populations[${entry.populationIndex}].dimensions[${entry.dimensionIndex}]`;
    const calibration = bindProbabilityCalibration(
      entry.dimension,
      entry.population,
      document.subject,
      calibrationReports,
      nowMs,
      name
    );
    bound.push({
      population_id: entry.population.population_id,
      dimension_id: entry.dimension.dimension_id,
      calibration_report_id: calibration.calibration_report_id,
      report_digest: calibration.report_digest
    });
  }
  return deepFreeze({
    valid: true,
    bound_probability_calibrations: bound,
    authority_effect: 'none',
    assurance_effect: 'evidence-only',
    selection_effect: 'evidence-only'
  });
}

export function resolveBehavioralAssuranceProfile(document, calibrationReports, { now = null } = {}) {
  const validated = validateBehavioralAssuranceProfile(document, { calibrationReports, now });
  const binding = bindBehavioralAssuranceProbabilityCalibrations(document, calibrationReports, { now });
  return deepFreeze({
    ...validated,
    bound_probability_calibrations: binding.bound_probability_calibrations
  });
}

export function computeBehavioralAssuranceProfileDigest(document) {
  validateSemantics(document, { verifyDigest: false });
  const canonical = clone(document);
  canonical.profile_digest = ZERO_DIGEST;
  return digestObject(canonical);
}

export function behavioralAssuranceProfileDigest(document) {
  return computeBehavioralAssuranceProfileDigest(document);
}

export function validateBehavioralAssuranceProfile(document, { calibrationReports = undefined, now = null } = {}) {
  validateSemantics(document, { verifyDigest: true });
  // Opaque reviewed refs are necessary but not sufficient. Probability semantics are
  // accepted only after a matching #1588 calibration report is bound (same population/method,
  // independently sourced outcomes).
  if (findProbabilityDimensions(document).length > 0) {
    if (calibrationReports === undefined) {
      throw new ValidationError('probability semantics require validated #1588 calibration reports');
    }
    bindBehavioralAssuranceProbabilityCalibrations(document, calibrationReports, { now });
  }
  return deepFreeze({
    valid: true,
    profile_id: document.profile_id,
    profile_digest: document.profile_digest,
    subject_kind: document.subject.subject_kind,
    subject_id: document.subject.subject_id,
    subject_digest: document.subject.subject_digest,
    binding_strength: document.subject.binding_strength,
    population_count: document.populations.length,
    created_at: document.created_at,
    valid_until: document.valid_until,
    authority_effect: document.authority_effect,
    assurance_effect: document.assurance_effect,
    network_effect: document.network_effect,
    credential_visibility: document.credential_visibility,
    runtime_activation: document.runtime_activation,
    selection_effect: document.selection_effect
  });
}

export function findBehavioralPopulation(document, populationId) {
  validateSemantics(document, { verifyDigest: true });
  assertId(populationId, 'populationId');
  const population = document.populations.find(item => item.population_id === populationId);
  if (!population) throw new ValidationError(`Behavioral population ${populationId} was not found`);
  return deepFreeze(clone(population));
}
