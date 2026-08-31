import { digestObject, ValidationError } from './canonical.mjs';
import {
  cognitiveCapabilityProfileDigest,
  validateCognitiveCapabilityProfile
} from './cognitive-capability-profile.mjs';
import {
  cognitiveCapabilityObservationDigest,
  validateCognitiveCapabilityObservation
} from './cognitive-capability-observation.mjs';

export const COGNITIVE_CAPABILITY_SURFACE_REPORT_SCHEMA =
  'axiom-cognitive-capability-surface-report.v0';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const CAPABILITY_ORDER = Object.freeze([
  'reasoning',
  'coding',
  'vision',
  'computer-use',
  'research',
  'planning',
  'critique',
  'summarization',
  'embedding',
  'tool-use',
  'agent-orchestration',
  'other'
]);
const CAPABILITIES = new Set(CAPABILITY_ORDER);
const FRESHNESS = new Set(['current', 'stale', 'future', 'not-yet-recorded']);
const CLASSIFICATION_ORDER = Object.freeze(['pass', 'degraded', 'fail', 'indeterminate']);
const CLASSIFICATIONS = new Set(CLASSIFICATION_ORDER);
const CONFLICT_CLASSES = new Set(['none', 'mixed', 'direct']);
const ASSURANCE_ORDER = Object.freeze(['declared', 'signed', 'verified-local', 'corroborated']);
const ASSURANCE_CLASSES = new Set(ASSURANCE_ORDER);

const REPORT_FIELDS = Object.freeze([
  'schema',
  'version',
  'status',
  'report_id',
  'profile_id',
  'profile_digest',
  'assessment_at',
  'observations',
  'capability_surfaces',
  'recorded_at',
  'contains_secret_material',
  'authority_effect',
  'network_effect',
  'training_effect',
  'spend_effect',
  'runtime_activation',
  'selection_effect'
]);

const INVENTORY_FIELDS = Object.freeze([
  'observation_id', 'observation_digest', 'capability', 'freshness_class'
]);
const SURFACE_FIELDS = Object.freeze([
  'capability',
  'declared',
  'observation_counts',
  'current_cells',
  'variation_present',
  'direct_conflict_cells',
  'mixed_classification_cells',
  'current_evaluator_coverage',
  'current_assurance_classes',
  'current_failure_modes',
  'current_resource_ranges'
]);
const OBSERVATION_COUNT_FIELDS = Object.freeze([
  'current', 'stale', 'future', 'not_yet_recorded'
]);
const CELL_FIELDS = Object.freeze([
  'cell_digest',
  'dimensions',
  'observation_refs',
  'classification_counts',
  'classification_set',
  'conflict_class',
  'evaluator_kinds',
  'evaluator_refs',
  'assurance_classes',
  'failure_modes',
  'resource_ranges'
]);
const DIMENSION_FIELDS = Object.freeze([
  'capability',
  'context_ref',
  'context_digest',
  'task_family_ref',
  'task_family_digest',
  'difficulty_class',
  'environment_ref',
  'environment_digest',
  'toolset_ref',
  'toolset_digest',
  'suite_ref',
  'suite_digest',
  'metric_set_ref',
  'metric_set_digest',
  'threshold_ref',
  'threshold_digest',
  'method_ref',
  'method_digest'
]);
const CLASSIFICATION_COUNT_FIELDS = Object.freeze(CLASSIFICATION_ORDER);
const EVALUATOR_COVERAGE_FIELDS = Object.freeze(['evaluator_kinds', 'evaluator_refs']);
const OBSERVATION_REF_FIELDS = Object.freeze(['observation_id', 'observation_digest']);
const FAILURE_MODE_FIELDS = Object.freeze(['failure_mode_ref', 'supporting_observations']);
const RESOURCE_RANGE_FIELDS = Object.freeze([
  'resource_class',
  'basis',
  'unit',
  'measurement_count',
  'minimum',
  'maximum',
  'supporting_observations'
]);

export function validateCognitiveCapabilitySurfaceReport(document) {
  validateReportShape(document);
  return Object.freeze({
    valid: true,
    schema: COGNITIVE_CAPABILITY_SURFACE_REPORT_SCHEMA,
    report_id: document.report_id,
    profile_id: document.profile_id,
    report_digest: digestObject(document),
    observations: document.observations.length,
    capability_surfaces: document.capability_surfaces.length,
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    training_effect: 'none',
    spend_effect: 'none',
    runtime_activation: false,
    selection_effect: 'evidence-only'
  });
}

export function cognitiveCapabilitySurfaceReportDigest(document) {
  validateReportShape(document);
  return digestObject(document);
}

export function deriveCognitiveCapabilitySurfaceReport({
  report_id,
  profile,
  observations,
  assessment_at,
  recorded_at
}) {
  id(report_id, 'report_id');
  validateCognitiveCapabilityProfile(profile);
  const profileDigest = cognitiveCapabilityProfileDigest(profile);
  const assessmentMs = timestamp(assessment_at, 'assessment_at');
  const recordedMs = timestamp(recorded_at, 'recorded_at');
  if (recordedMs < assessmentMs) {
    throw new ValidationError('recorded_at cannot precede assessment_at');
  }
  if (!Array.isArray(observations) || observations.length > 256) {
    throw new ValidationError('observations must contain at most 256 items');
  }

  const seenIds = new Set();
  const seenDigests = new Set();
  const normalized = [];

  for (const observation of observations) {
    validateCognitiveCapabilityObservation(observation);
    const observationDigest = cognitiveCapabilityObservationDigest(observation);
    if (seenIds.has(observation.observation_id)) {
      throw new ValidationError(`duplicate observation_id ${observation.observation_id}`);
    }
    if (seenDigests.has(observationDigest)) {
      throw new ValidationError(`duplicate observation digest ${observationDigest}`);
    }
    seenIds.add(observation.observation_id);
    seenDigests.add(observationDigest);

    if (observation.profile_id !== profile.profile_id) {
      throw new ValidationError('Capability surface observation profile_id does not match supplied profile');
    }
    if (observation.profile_digest !== profileDigest) {
      throw new ValidationError('Capability surface observation profile_digest does not match supplied profile');
    }
    if (!profile.capabilities.includes(observation.capability)) {
      throw new ValidationError('Capability surface observation capability is not declared by supplied profile');
    }

    normalized.push({
      observation,
      observation_digest: observationDigest,
      freshness_class: classifyFreshness(observation, assessmentMs)
    });
  }

  normalized.sort((a, b) => compareObservationIdentity(
    a.observation.observation_id,
    a.observation_digest,
    b.observation.observation_id,
    b.observation_digest
  ));

  const inventory = normalized.map(item => ({
    observation_id: item.observation.observation_id,
    observation_digest: item.observation_digest,
    capability: item.observation.capability,
    freshness_class: item.freshness_class
  }));

  const capabilitySurfaces = CAPABILITY_ORDER
    .filter(capability => profile.capabilities.includes(capability))
    .map(capability => deriveBaselineCapabilitySurface(capability, normalized));

  const report = {
    schema: COGNITIVE_CAPABILITY_SURFACE_REPORT_SCHEMA,
    version: 0,
    status: 'inert-evidence-report',
    report_id,
    profile_id: profile.profile_id,
    profile_digest: profileDigest,
    assessment_at,
    observations: inventory,
    capability_surfaces: capabilitySurfaces,
    recorded_at,
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    training_effect: 'none',
    spend_effect: 'none',
    runtime_activation: false,
    selection_effect: 'evidence-only'
  };

  validateReportShape(report);
  return deepFreeze(report);
}

function deriveBaselineCapabilitySurface(capability, normalized) {
  const matching = normalized.filter(item => item.observation.capability === capability);
  const counts = { current: 0, stale: 0, future: 0, not_yet_recorded: 0 };
  for (const item of matching) {
    if (item.freshness_class === 'not-yet-recorded') counts.not_yet_recorded += 1;
    else counts[item.freshness_class] += 1;
  }

  const current = matching.filter(item => item.freshness_class === 'current');
  const cells = current.map(item => baselineCell(item.observation, item.observation_digest));
  cells.sort((a, b) => a.cell_digest.localeCompare(b.cell_digest));

  const evaluatorKinds = sortedUnique(current.map(item => item.observation.evaluator.evaluator_kind));
  const evaluatorRefs = sortedUnique(current.map(item => item.observation.evaluator.evaluator_ref));
  const assuranceClasses = orderedUnique(
    current.map(item => item.observation.evidence.assurance_class),
    ASSURANCE_ORDER
  );

  return {
    capability,
    declared: true,
    observation_counts: counts,
    current_cells: cells,
    variation_present: false,
    direct_conflict_cells: 0,
    mixed_classification_cells: 0,
    current_evaluator_coverage: {
      evaluator_kinds: evaluatorKinds,
      evaluator_refs: evaluatorRefs
    },
    current_assurance_classes: assuranceClasses,
    current_failure_modes: [],
    current_resource_ranges: []
  };
}

function baselineCell(observation, observationDigest) {
  const dimensions = dimensionsFor(observation);
  const counts = { pass: 0, degraded: 0, fail: 0, indeterminate: 0 };
  counts[observation.result.classification] = 1;
  return {
    cell_digest: digestObject(dimensions),
    dimensions,
    observation_refs: [{
      observation_id: observation.observation_id,
      observation_digest: observationDigest
    }],
    classification_counts: counts,
    classification_set: [observation.result.classification],
    conflict_class: 'none',
    evaluator_kinds: [observation.evaluator.evaluator_kind],
    evaluator_refs: [observation.evaluator.evaluator_ref],
    assurance_classes: [observation.evidence.assurance_class],
    failure_modes: [],
    resource_ranges: []
  };
}

function dimensionsFor(observation) {
  return {
    capability: observation.capability,
    context_ref: observation.context.context_ref,
    context_digest: observation.context.context_digest,
    task_family_ref: observation.context.task_family_ref,
    task_family_digest: observation.context.task_family_digest,
    difficulty_class: observation.context.difficulty_class,
    environment_ref: observation.context.environment_ref,
    environment_digest: observation.context.environment_digest,
    toolset_ref: observation.context.toolset_ref,
    toolset_digest: observation.context.toolset_digest,
    suite_ref: observation.evaluation.suite_ref,
    suite_digest: observation.evaluation.suite_digest,
    metric_set_ref: observation.evaluation.metric_set_ref,
    metric_set_digest: observation.evaluation.metric_set_digest,
    threshold_ref: observation.evaluation.threshold_ref,
    threshold_digest: observation.evaluation.threshold_digest,
    method_ref: observation.evaluation.method_ref,
    method_digest: observation.evaluation.method_digest
  };
}

function classifyFreshness(observation, assessmentMs) {
  if (Date.parse(observation.observed_at) > assessmentMs) return 'future';
  if (Date.parse(observation.recorded_at) > assessmentMs) return 'not-yet-recorded';
  if (Date.parse(observation.valid_until) < assessmentMs) return 'stale';
  return 'current';
}

function validateReportShape(document) {
  exactObject(document, 'Cognitive capability surface report', REPORT_FIELDS);
  if (
    document.schema !== COGNITIVE_CAPABILITY_SURFACE_REPORT_SCHEMA
    || document.version !== 0
    || document.status !== 'inert-evidence-report'
  ) {
    throw new ValidationError('Cognitive capability surface report schema/version/status is invalid');
  }
  id(document.report_id, 'report_id');
  id(document.profile_id, 'profile_id');
  digest(document.profile_digest, 'profile_digest');
  const assessmentMs = timestamp(document.assessment_at, 'assessment_at');
  const recordedMs = timestamp(document.recorded_at, 'recorded_at');
  if (recordedMs < assessmentMs) {
    throw new ValidationError('recorded_at cannot precede assessment_at');
  }
  validateInventory(document.observations);
  validateCapabilitySurfaces(document.capability_surfaces);
  if (
    document.contains_secret_material !== false
    || document.authority_effect !== 'none'
    || document.network_effect !== 'none'
    || document.training_effect !== 'none'
    || document.spend_effect !== 'none'
    || document.runtime_activation !== false
    || document.selection_effect !== 'evidence-only'
  ) {
    throw new ValidationError('Cognitive capability surface report authority boundary is invalid');
  }
  return document;
}

function validateInventory(value) {
  if (!Array.isArray(value) || value.length > 256) {
    throw new ValidationError('observations must contain at most 256 items');
  }
  let previous = null;
  const ids = new Set();
  const digests = new Set();
  for (const item of value) {
    exactObject(item, 'Surface observation inventory item', INVENTORY_FIELDS);
    id(item.observation_id, 'observations.observation_id');
    digest(item.observation_digest, 'observations.observation_digest');
    enumValue(item.capability, 'observations.capability', CAPABILITIES);
    enumValue(item.freshness_class, 'observations.freshness_class', FRESHNESS);
    if (ids.has(item.observation_id)) throw new ValidationError('observations contains duplicate observation_id');
    if (digests.has(item.observation_digest)) throw new ValidationError('observations contains duplicate observation_digest');
    ids.add(item.observation_id);
    digests.add(item.observation_digest);
    if (previous && compareObservationIdentity(
      previous.observation_id, previous.observation_digest,
      item.observation_id, item.observation_digest
    ) >= 0) {
      throw new ValidationError('observations must use canonical ordering');
    }
    previous = item;
  }
}

function validateCapabilitySurfaces(value) {
  if (!Array.isArray(value) || value.length > CAPABILITY_ORDER.length) {
    throw new ValidationError('capability_surfaces is invalid');
  }
  let previousIndex = -1;
  const seen = new Set();
  for (const surface of value) {
    exactObject(surface, 'Capability surface', SURFACE_FIELDS);
    enumValue(surface.capability, 'capability_surfaces.capability', CAPABILITIES);
    if (seen.has(surface.capability)) throw new ValidationError('capability_surfaces contains duplicate capability');
    seen.add(surface.capability);
    const index = CAPABILITY_ORDER.indexOf(surface.capability);
    if (index <= previousIndex) throw new ValidationError('capability_surfaces must use canonical capability ordering');
    previousIndex = index;
    if (surface.declared !== true) throw new ValidationError('capability_surfaces.declared must be true');
    validateObservationCounts(surface.observation_counts);
    validateCells(surface.current_cells, surface.capability);
    booleanValue(surface.variation_present, 'capability_surfaces.variation_present');
    safeInteger(surface.direct_conflict_cells, 'capability_surfaces.direct_conflict_cells');
    safeInteger(surface.mixed_classification_cells, 'capability_surfaces.mixed_classification_cells');
    validateEvaluatorCoverage(surface.current_evaluator_coverage);
    validateOrderedEnumArray(surface.current_assurance_classes, ASSURANCE_ORDER, 'capability_surfaces.current_assurance_classes');
    validateFailureModes(surface.current_failure_modes, 'capability_surfaces.current_failure_modes');
    validateResourceRanges(surface.current_resource_ranges, 'capability_surfaces.current_resource_ranges');
  }
}

function validateObservationCounts(value) {
  exactObject(value, 'Capability surface observation_counts', OBSERVATION_COUNT_FIELDS);
  for (const field of OBSERVATION_COUNT_FIELDS) safeInteger(value[field], `observation_counts.${field}`);
}

function validateCells(value, capability) {
  if (!Array.isArray(value) || value.length > 256) throw new ValidationError('current_cells is invalid');
  let previousDigest = null;
  for (const cell of value) {
    exactObject(cell, 'Capability surface cell', CELL_FIELDS);
    digest(cell.cell_digest, 'current_cells.cell_digest');
    validateDimensions(cell.dimensions);
    if (cell.dimensions.capability !== capability) throw new ValidationError('cell capability does not match parent capability');
    if (cell.cell_digest !== digestObject(cell.dimensions)) throw new ValidationError('cell_digest does not match dimensions');
    if (previousDigest !== null && previousDigest.localeCompare(cell.cell_digest) >= 0) {
      throw new ValidationError('current_cells must use canonical ordering');
    }
    previousDigest = cell.cell_digest;
    validateObservationRefs(cell.observation_refs, 'current_cells.observation_refs');
    validateClassificationCounts(cell.classification_counts);
    validateOrderedEnumArray(cell.classification_set, CLASSIFICATION_ORDER, 'current_cells.classification_set');
    enumValue(cell.conflict_class, 'current_cells.conflict_class', CONFLICT_CLASSES);
    validateSortedUniqueStrings(cell.evaluator_kinds, 'current_cells.evaluator_kinds');
    validateSortedUniqueStrings(cell.evaluator_refs, 'current_cells.evaluator_refs');
    validateOrderedEnumArray(cell.assurance_classes, ASSURANCE_ORDER, 'current_cells.assurance_classes');
    validateFailureModes(cell.failure_modes, 'current_cells.failure_modes');
    validateResourceRanges(cell.resource_ranges, 'current_cells.resource_ranges');
  }
}

function validateDimensions(value) {
  exactObject(value, 'Capability surface cell dimensions', DIMENSION_FIELDS);
  enumValue(value.capability, 'dimensions.capability', CAPABILITIES);
  for (const field of DIMENSION_FIELDS) {
    if (field === 'capability' || field === 'difficulty_class') continue;
    if (field.endsWith('_digest')) digest(value[field], `dimensions.${field}`);
    else id(value[field], `dimensions.${field}`);
  }
  id(value.difficulty_class, 'dimensions.difficulty_class');
}

function validateClassificationCounts(value) {
  exactObject(value, 'Capability surface classification_counts', CLASSIFICATION_COUNT_FIELDS);
  for (const field of CLASSIFICATION_COUNT_FIELDS) safeInteger(value[field], `classification_counts.${field}`);
}

function validateEvaluatorCoverage(value) {
  exactObject(value, 'Capability surface evaluator coverage', EVALUATOR_COVERAGE_FIELDS);
  validateSortedUniqueStrings(value.evaluator_kinds, 'current_evaluator_coverage.evaluator_kinds');
  validateSortedUniqueStrings(value.evaluator_refs, 'current_evaluator_coverage.evaluator_refs');
}

function validateObservationRefs(value, label) {
  if (!Array.isArray(value) || value.length > 256) throw new ValidationError(`${label} is invalid`);
  let previous = null;
  for (const ref of value) {
    exactObject(ref, 'Capability surface observation ref', OBSERVATION_REF_FIELDS);
    id(ref.observation_id, `${label}.observation_id`);
    digest(ref.observation_digest, `${label}.observation_digest`);
    if (previous && compareObservationIdentity(
      previous.observation_id, previous.observation_digest,
      ref.observation_id, ref.observation_digest
    ) >= 0) throw new ValidationError(`${label} must use canonical ordering`);
    previous = ref;
  }
}

function validateFailureModes(value, label) {
  if (!Array.isArray(value) || value.length > 256) throw new ValidationError(`${label} is invalid`);
  let previous = null;
  for (const item of value) {
    exactObject(item, 'Capability surface failure mode', FAILURE_MODE_FIELDS);
    id(item.failure_mode_ref, `${label}.failure_mode_ref`);
    if (previous !== null && previous.localeCompare(item.failure_mode_ref) >= 0) {
      throw new ValidationError(`${label} must use canonical ordering`);
    }
    previous = item.failure_mode_ref;
    validateObservationRefs(item.supporting_observations, `${label}.supporting_observations`);
  }
}

function validateResourceRanges(value, label) {
  if (!Array.isArray(value) || value.length > 256) throw new ValidationError(`${label} is invalid`);
  for (const item of value) {
    exactObject(item, 'Capability surface resource range', RESOURCE_RANGE_FIELDS);
    id(item.resource_class, `${label}.resource_class`);
    id(item.basis, `${label}.basis`);
    if (item.unit !== null) id(item.unit, `${label}.unit`);
    safeInteger(item.measurement_count, `${label}.measurement_count`);
    if (item.minimum !== null) safeInteger(item.minimum, `${label}.minimum`);
    if (item.maximum !== null) safeInteger(item.maximum, `${label}.maximum`);
    validateObservationRefs(item.supporting_observations, `${label}.supporting_observations`);
  }
}

function validateSortedUniqueStrings(value, label) {
  if (!Array.isArray(value) || value.length > 256) throw new ValidationError(`${label} is invalid`);
  let previous = null;
  for (const item of value) {
    id(item, label);
    if (previous !== null && previous.localeCompare(item) >= 0) throw new ValidationError(`${label} must be sorted and unique`);
    previous = item;
  }
}

function validateOrderedEnumArray(value, order, label) {
  if (!Array.isArray(value) || value.length > order.length) throw new ValidationError(`${label} is invalid`);
  let previousIndex = -1;
  for (const item of value) {
    const index = order.indexOf(item);
    if (index < 0 || index <= previousIndex) throw new ValidationError(`${label} must use canonical ordering`);
    previousIndex = index;
  }
}

function sortedUnique(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function orderedUnique(values, order) {
  const set = new Set(values);
  return order.filter(value => set.has(value));
}

function compareObservationIdentity(idA, digestA, idB, digestB) {
  const idCompare = idA.localeCompare(idB);
  if (idCompare !== 0) return idCompare;
  return digestA.localeCompare(digestB);
}

function exactObject(value, label, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${label} must be a plain object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new ValidationError(`${label} must be a plain object`);
  }
  const allowed = new Set(fields);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ValidationError(`${label} contains unknown field ${key}`);
  }
  for (const key of fields) {
    if (!Object.hasOwn(value, key)) throw new ValidationError(`${label} is missing required field ${key}`);
  }
}

function id(value, label) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) {
    throw new ValidationError(`${label} is invalid`);
  }
  return value;
}

function digest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) {
    throw new ValidationError(`${label} is invalid`);
  }
  return value;
}

function enumValue(value, label, allowed) {
  if (typeof value !== 'string' || !allowed.has(value)) {
    throw new ValidationError(`${label} is invalid`);
  }
  return value;
}

function safeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ValidationError(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function booleanValue(value, label) {
  if (typeof value !== 'boolean') throw new ValidationError(`${label} must be boolean`);
  return value;
}

function timestamp(value, label) {
  if (typeof value !== 'string' || value.length > 64) {
    throw new ValidationError(`${label} must be a canonical ISO timestamp`);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new ValidationError(`${label} must be a canonical ISO timestamp`);
  }
  return parsed.getTime();
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
