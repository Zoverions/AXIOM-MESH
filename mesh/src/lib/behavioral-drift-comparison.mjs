import {
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject
} from './canonical.mjs';
import { validateBehavioralAssuranceProfile } from './behavioral-assurance-profile.mjs';

export const BEHAVIORAL_DRIFT_COMPARISON_SCHEMA = 'axiom-behavioral-drift-comparison.v0';

const STATUS = 'inert-behavioral-drift-evidence';
const ZERO_DIGEST = '0'.repeat(64);
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;

const TOP_LEVEL_KEYS = Object.freeze([
  'schema',
  'version',
  'status',
  'comparison_id',
  'predecessor',
  'candidate',
  'comparison_method',
  'declared_change_factors',
  'dimension_deltas',
  'drift_status',
  'compared_at',
  'comparison_digest',
  'authority_effect',
  'network_effect',
  'runtime_activation',
  'selection_effect'
]);
const SIDE_KEYS = Object.freeze(['profile_id', 'profile_digest', 'population_id']);
const METHOD_KEYS = Object.freeze(['method_ref', 'method_digest', 'bounds_ref', 'bounds_digest']);
const DELTA_KEYS = Object.freeze([
  'dimension_id',
  'metric_kind',
  'predecessor_value',
  'candidate_value',
  'delta'
]);

const CHANGE_FACTORS = Object.freeze([
  'model-revision',
  'subject-artifact',
  'instruction-policy',
  'context-memory-policy',
  'tool-policy',
  'sampling-configuration',
  'environment-harness',
  'population-definition',
  'domain',
  'task-family',
  'consequence-class',
  'time-window',
  'verifier-set',
  'rubric-set',
  'dimension-set',
  'calibration-evidence'
]);
const CHANGE_FACTOR_SET = new Set(CHANGE_FACTORS);
const DRIFT_STATUSES = new Set([
  'stable-within-declared-bounds',
  'material-drift',
  'mixed',
  'insufficient-evidence',
  'incompatible'
]);
const METRIC_KINDS = new Set(['probability', 'rate', 'count', 'score']);

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

function assertFiniteNumber(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ValidationError(`${name} must be a finite number`);
  }
  return value;
}

function assertArray(value, name, { minItems = 0, maxItems = 128 } = {}) {
  if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) {
    throw new ValidationError(`${name} must be an array with ${minItems}-${maxItems} items`);
  }
  return value;
}

function assertEnum(value, allowed, name) {
  assertString(value, name, { min: 1, max: 160 });
  if (!allowed.has(value)) throw new ValidationError(`${name} is invalid`);
  return value;
}

function validateSideBinding(binding, label) {
  assertExactKeys(binding, SIDE_KEYS, `${label} binding`);
  assertId(binding.profile_id, `${label}.profile_id`);
  assertDigest(binding.profile_digest, `${label}.profile_digest`);
  assertId(binding.population_id, `${label}.population_id`);
}

function validateComparisonMethod(method) {
  assertExactKeys(method, METHOD_KEYS, 'comparison_method');
  assertId(method.method_ref, 'comparison_method.method_ref');
  assertDigest(method.method_digest, 'comparison_method.method_digest');
  assertId(method.bounds_ref, 'comparison_method.bounds_ref');
  assertDigest(method.bounds_digest, 'comparison_method.bounds_digest');
}

function validateChangeFactors(values) {
  assertArray(values, 'declared_change_factors', { maxItems: CHANGE_FACTORS.length });
  const seen = new Set();
  values.forEach((value, index) => {
    assertEnum(value, CHANGE_FACTOR_SET, `declared_change_factors[${index}]`);
    if (seen.has(value)) throw new ValidationError(`declared_change_factors contains duplicate change factor ${value}`);
    seen.add(value);
  });
}

function validateDimensionDeltas(values) {
  assertArray(values, 'dimension_deltas', { maxItems: 64 });
  const seen = new Set();
  values.forEach((item, index) => {
    const name = `dimension_deltas[${index}]`;
    assertExactKeys(item, DELTA_KEYS, name);
    assertId(item.dimension_id, `${name}.dimension_id`);
    assertEnum(item.metric_kind, METRIC_KINDS, `${name}.metric_kind`);
    assertFiniteNumber(item.predecessor_value, `${name}.predecessor_value`);
    assertFiniteNumber(item.candidate_value, `${name}.candidate_value`);
    assertFiniteNumber(item.delta, `${name}.delta`);
    if (seen.has(item.dimension_id)) {
      throw new ValidationError(`dimension_deltas contains duplicate dimension_id ${item.dimension_id}`);
    }
    seen.add(item.dimension_id);
  });
}

function validateBoundaryConstants(document) {
  const expected = [
    ['authority_effect', 'none'],
    ['network_effect', 'none'],
    ['runtime_activation', false],
    ['selection_effect', 'evidence-only']
  ];
  for (const [field, value] of expected) {
    if (document[field] !== value) throw new ValidationError(`${field} boundary effect is invalid`);
  }
}

function validateSemantics(document, { verifyDigest = true } = {}) {
  assertExactKeys(document, TOP_LEVEL_KEYS, 'Behavioral Drift Comparison');
  if (document.schema !== BEHAVIORAL_DRIFT_COMPARISON_SCHEMA) {
    throw new ValidationError(`schema must be ${BEHAVIORAL_DRIFT_COMPARISON_SCHEMA}`);
  }
  if (document.version !== 0) throw new ValidationError('version must be 0');
  if (document.status !== STATUS) throw new ValidationError(`status must be ${STATUS}`);
  assertId(document.comparison_id, 'comparison_id');
  validateSideBinding(document.predecessor, 'predecessor');
  validateSideBinding(document.candidate, 'candidate');
  validateComparisonMethod(document.comparison_method);
  validateChangeFactors(document.declared_change_factors);
  validateDimensionDeltas(document.dimension_deltas);
  assertEnum(document.drift_status, DRIFT_STATUSES, 'drift_status');
  assertTimestamp(document.compared_at, 'compared_at');
  assertDigest(document.comparison_digest, 'comparison_digest');
  validateBoundaryConstants(document);

  if (verifyDigest) {
    const expected = computeBehavioralDriftComparisonDigest(document);
    if (document.comparison_digest !== expected) {
      throw new ValidationError('Behavioral Drift Comparison digest mismatch');
    }
  }
}

export function computeBehavioralDriftComparisonDigest(document) {
  validateSemantics(document, { verifyDigest: false });
  const canonical = clone(document);
  canonical.comparison_digest = ZERO_DIGEST;
  return digestObject(canonical);
}

export function behavioralDriftComparisonDigest(document) {
  return computeBehavioralDriftComparisonDigest(document);
}

export function validateBehavioralDriftComparison(document) {
  validateSemantics(document, { verifyDigest: true });
  return deepFreeze({
    valid: true,
    schema: document.schema,
    version: document.version,
    status: document.status,
    comparison_id: document.comparison_id,
    comparison_digest: document.comparison_digest,
    drift_status: document.drift_status,
    authority_effect: document.authority_effect,
    network_effect: document.network_effect,
    runtime_activation: document.runtime_activation,
    selection_effect: document.selection_effect
  });
}

function findPopulation(profile, binding, label) {
  if (
    binding.profile_id !== profile.profile_id
    || binding.profile_digest !== profile.profile_digest
  ) {
    throw new ValidationError(`${label} binding does not match supplied exact profile`);
  }
  const population = profile.populations.find(item => item.population_id === binding.population_id);
  if (!population) {
    throw new ValidationError(`${label} binding does not match a supplied exact profile population`);
  }
  return population;
}

function sameCanonical(left, right) {
  return digestObject(left) === digestObject(right);
}

function dimensionMap(population) {
  return new Map(population.dimensions.map(item => [item.dimension_id, item]));
}

function compatibilityReasons(predecessor, candidate) {
  const reasons = [];
  if (predecessor.domain !== candidate.domain) reasons.push('domain-mismatch');
  if (predecessor.task_family !== candidate.task_family) reasons.push('task-family-mismatch');
  if (predecessor.consequence_class !== candidate.consequence_class) reasons.push('consequence-class-mismatch');

  const predecessorDimensions = dimensionMap(predecessor);
  const candidateDimensions = dimensionMap(candidate);
  const predecessorIds = [...predecessorDimensions.keys()].sort();
  const candidateIds = [...candidateDimensions.keys()].sort();
  if (
    predecessorIds.length !== candidateIds.length
    || predecessorIds.some((id, index) => id !== candidateIds[index])
  ) {
    reasons.push('dimension-set-mismatch');
  } else {
    for (const id of predecessorIds) {
      if (predecessorDimensions.get(id).metric_kind !== candidateDimensions.get(id).metric_kind) {
        reasons.push('metric-kind-mismatch');
        break;
      }
    }
  }
  return reasons;
}

function computeChangeFactors(predecessorProfile, candidateProfile, predecessorPopulation, candidatePopulation) {
  const factors = [];
  const predecessorSubject = predecessorProfile.subject;
  const candidateSubject = candidateProfile.subject;

  if (predecessorSubject.provider_model_revision !== candidateSubject.provider_model_revision) factors.push('model-revision');
  if (predecessorSubject.subject_digest !== candidateSubject.subject_digest) factors.push('subject-artifact');
  if (predecessorSubject.instruction_policy_digest !== candidateSubject.instruction_policy_digest) factors.push('instruction-policy');
  if (predecessorSubject.context_memory_policy_digest !== candidateSubject.context_memory_policy_digest) factors.push('context-memory-policy');
  if (predecessorSubject.tool_policy_digest !== candidateSubject.tool_policy_digest) factors.push('tool-policy');
  if (predecessorSubject.sampling_configuration_digest !== candidateSubject.sampling_configuration_digest) factors.push('sampling-configuration');
  if (predecessorSubject.environment_harness_digest !== candidateSubject.environment_harness_digest) factors.push('environment-harness');

  if (predecessorPopulation.population_digest !== candidatePopulation.population_digest) factors.push('population-definition');
  if (predecessorPopulation.domain !== candidatePopulation.domain) factors.push('domain');
  if (predecessorPopulation.task_family !== candidatePopulation.task_family) factors.push('task-family');
  if (predecessorPopulation.consequence_class !== candidatePopulation.consequence_class) factors.push('consequence-class');
  if (!sameCanonical(predecessorPopulation.evaluation_period, candidatePopulation.evaluation_period)) factors.push('time-window');
  if (!sameCanonical(predecessorPopulation.verification_sources, candidatePopulation.verification_sources)) factors.push('verifier-set');
  if (!sameCanonical(predecessorPopulation.rubric_refs, candidatePopulation.rubric_refs)) factors.push('rubric-set');

  const predecessorDimensions = dimensionMap(predecessorPopulation);
  const candidateDimensions = dimensionMap(candidatePopulation);
  const predecessorIds = [...predecessorDimensions.keys()].sort();
  const candidateIds = [...candidateDimensions.keys()].sort();
  const sameDimensionSet = predecessorIds.length === candidateIds.length
    && predecessorIds.every((id, index) => id === candidateIds[index]);
  if (!sameDimensionSet) {
    factors.push('dimension-set');
  } else {
    const calibrationChanged = predecessorIds.some(id => {
      const left = predecessorDimensions.get(id);
      const right = candidateDimensions.get(id);
      return left.metric_kind !== right.metric_kind
        || left.calibration_ref !== right.calibration_ref
        || left.calibration_digest !== right.calibration_digest
        || left.calibration_state !== right.calibration_state;
    });
    if (calibrationChanged) factors.push('calibration-evidence');
  }

  return factors;
}

function arraysEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function nearlyEqual(left, right) {
  if (Object.is(left, right)) return true;
  const scale = Math.max(1, Math.abs(left), Math.abs(right));
  return Math.abs(left - right) <= Number.EPSILON * 16 * scale;
}

function validateDeltaBindings(deltas, predecessorPopulation, candidatePopulation) {
  const predecessorDimensions = dimensionMap(predecessorPopulation);
  const candidateDimensions = dimensionMap(candidatePopulation);

  for (const item of deltas) {
    const predecessor = predecessorDimensions.get(item.dimension_id);
    const candidate = candidateDimensions.get(item.dimension_id);
    if (!predecessor || !candidate) {
      throw new ValidationError(`dimension ${item.dimension_id} is absent from bound profile population evidence`);
    }
    if (item.metric_kind !== predecessor.metric_kind || item.metric_kind !== candidate.metric_kind) {
      throw new ValidationError(`dimension ${item.dimension_id} metric_kind does not match bound profile population evidence`);
    }
    if (!nearlyEqual(item.predecessor_value, predecessor.value)) {
      throw new ValidationError(`dimension ${item.dimension_id} predecessor_value does not match bound profile population evidence`);
    }
    if (!nearlyEqual(item.candidate_value, candidate.value)) {
      throw new ValidationError(`dimension ${item.dimension_id} candidate_value does not match bound profile population evidence`);
    }
    if (!nearlyEqual(item.delta, candidate.value - predecessor.value)) {
      throw new ValidationError(`dimension ${item.dimension_id} delta does not match bound profile population evidence`);
    }
  }
}

function comparisonInstantIsCurrent(document, predecessorProfile, candidateProfile, predecessorPopulation, candidatePopulation) {
  const comparedAt = Date.parse(document.compared_at);
  const requiredTimes = [
    predecessorProfile.created_at,
    candidateProfile.created_at,
    predecessorPopulation.evaluation_period.to,
    candidatePopulation.evaluation_period.to
  ].map(Date.parse);
  if (requiredTimes.some(value => comparedAt < value)) {
    throw new ValidationError('Behavioral drift comparison cannot precede its bound exact profile evidence');
  }
}

export function resolveBehavioralDriftComparison(document, predecessorProfile, candidateProfile) {
  validateBehavioralDriftComparison(document);
  validateBehavioralAssuranceProfile(predecessorProfile);
  validateBehavioralAssuranceProfile(candidateProfile);

  const predecessorPopulation = findPopulation(predecessorProfile, document.predecessor, 'predecessor');
  const candidatePopulation = findPopulation(candidateProfile, document.candidate, 'candidate');
  comparisonInstantIsCurrent(
    document,
    predecessorProfile,
    candidateProfile,
    predecessorPopulation,
    candidatePopulation
  );

  const expectedFactors = computeChangeFactors(
    predecessorProfile,
    candidateProfile,
    predecessorPopulation,
    candidatePopulation
  );
  if (!arraysEqual(document.declared_change_factors, expectedFactors)) {
    throw new ValidationError('declared change factors must match exact subject and evaluation changes');
  }

  const reasons = compatibilityReasons(predecessorPopulation, candidatePopulation);
  const insufficient = predecessorPopulation.sample_sufficiency !== 'sufficient'
    || candidatePopulation.sample_sufficiency !== 'sufficient';

  let compatibility = 'compatible';
  if (reasons.length > 0) {
    compatibility = 'incompatible';
    if (document.drift_status !== 'incompatible') {
      throw new ValidationError('Incompatible behavioral evidence requires incompatible drift status');
    }
    if (document.dimension_deltas.length !== 0) {
      throw new ValidationError('Incompatible behavioral evidence cannot carry numeric drift claims');
    }
  } else if (insufficient) {
    compatibility = 'insufficient-evidence';
    if (document.drift_status !== 'insufficient-evidence') {
      throw new ValidationError('Insufficient behavioral profile population evidence requires insufficient-evidence drift status');
    }
    if (document.dimension_deltas.length !== 0) {
      throw new ValidationError('Insufficient behavioral evidence cannot carry numeric drift claims');
    }
  } else {
    if (document.drift_status === 'incompatible' || document.drift_status === 'insufficient-evidence') {
      throw new ValidationError('Compatible sufficient behavioral evidence cannot claim incompatible or insufficient-evidence status');
    }
    validateDeltaBindings(document.dimension_deltas, predecessorPopulation, candidatePopulation);
  }

  return deepFreeze({
    valid: true,
    schema: BEHAVIORAL_DRIFT_COMPARISON_SCHEMA,
    comparison_id: document.comparison_id,
    comparison_digest: document.comparison_digest,
    predecessor: clone(document.predecessor),
    candidate: clone(document.candidate),
    comparison_method: clone(document.comparison_method),
    compatibility,
    compatibility_reason_codes: [...reasons],
    change_factors: [...document.declared_change_factors],
    dimension_deltas: document.dimension_deltas.map(item => ({ ...item })),
    drift_status: document.drift_status,
    compared_at: document.compared_at,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false,
    selection_effect: 'evidence-only'
  });
}
