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
const UNIT = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,63}$/;
const CAPABILITY_ORDER = Object.freeze([
  'reasoning', 'coding', 'vision', 'computer-use', 'research', 'planning',
  'critique', 'summarization', 'embedding', 'tool-use', 'agent-orchestration', 'other'
]);
const CAPABILITIES = new Set(CAPABILITY_ORDER);
const FRESHNESS = new Set(['current', 'stale', 'future', 'not-yet-recorded']);
const DIFFICULTIES = new Set(['trivial', 'routine', 'challenging', 'expert', 'adversarial', 'unknown']);
const CLASSIFICATION_ORDER = Object.freeze(['pass', 'degraded', 'fail', 'indeterminate']);
const CLASSIFICATIONS = new Set(CLASSIFICATION_ORDER);
const CONFLICT_CLASSES = new Set(['none', 'mixed', 'direct']);
const EVALUATOR_KINDS = new Set([
  'local-agent', 'local-service', 'remote-service', 'human-reviewer',
  'provider', 'external-verifier', 'synthetic-harness'
]);
const ASSURANCE_ORDER = Object.freeze(['declared', 'signed', 'verified-local', 'corroborated']);
const ASSURANCE_CLASSES = new Set(ASSURANCE_ORDER);
const RESOURCE_CLASSES = new Set([
  'input-tokens', 'output-tokens', 'compute-time', 'wall-time', 'energy',
  'memory', 'storage', 'network-transfer', 'currency', 'other'
]);
const RESOURCE_BASES = new Set(['observed', 'estimated', 'unknown']);

const REPORT_FIELDS = Object.freeze([
  'schema', 'version', 'status', 'report_id', 'profile_id', 'profile_digest',
  'assessment_at', 'observations', 'capability_surfaces', 'recorded_at',
  'contains_secret_material', 'authority_effect', 'network_effect', 'training_effect',
  'spend_effect', 'runtime_activation', 'selection_effect'
]);
const INVENTORY_FIELDS = Object.freeze([
  'observation_id', 'observation_digest', 'capability', 'freshness_class'
]);
const SURFACE_FIELDS = Object.freeze([
  'capability', 'declared', 'observation_counts', 'current_cells', 'variation_present',
  'direct_conflict_cells', 'mixed_classification_cells', 'current_evaluator_coverage',
  'current_assurance_classes', 'current_failure_modes', 'current_resource_ranges'
]);
const OBSERVATION_COUNT_FIELDS = Object.freeze(['current', 'stale', 'future', 'not_yet_recorded']);
const CELL_FIELDS = Object.freeze([
  'cell_digest', 'dimensions', 'observation_refs', 'classification_counts',
  'classification_set', 'conflict_class', 'evaluator_kinds', 'evaluator_refs',
  'assurance_classes', 'failure_modes', 'resource_ranges'
]);
const DIMENSION_FIELDS = Object.freeze([
  'capability', 'context_ref', 'context_digest', 'task_family_ref', 'task_family_digest',
  'difficulty_class', 'environment_ref', 'environment_digest', 'toolset_ref',
  'toolset_digest', 'suite_ref', 'suite_digest', 'metric_set_ref', 'metric_set_digest',
  'threshold_ref', 'threshold_digest', 'method_ref', 'method_digest'
]);
const EVALUATOR_COVERAGE_FIELDS = Object.freeze(['evaluator_kinds', 'evaluator_refs']);
const OBSERVATION_REF_FIELDS = Object.freeze(['observation_id', 'observation_digest']);
const FAILURE_MODE_FIELDS = Object.freeze(['failure_mode_ref', 'supporting_observations']);
const RESOURCE_RANGE_FIELDS = Object.freeze([
  'resource_class', 'basis', 'unit', 'measurement_count', 'minimum', 'maximum',
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
  if (recordedMs < assessmentMs) throw new ValidationError('recorded_at cannot precede assessment_at');
  if (!Array.isArray(observations) || observations.length > 256) {
    throw new ValidationError('observations must contain at most 256 items');
  }

  const seenIds = new Set();
  const seenDigests = new Set();
  const normalized = observations.map(observation => {
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
    return {
      observation,
      observation_digest: observationDigest,
      freshness_class: classifyFreshness(observation, assessmentMs)
    };
  });

  normalized.sort(compareNormalizedObservation);
  const inventory = normalized.map(item => ({
    observation_id: item.observation.observation_id,
    observation_digest: item.observation_digest,
    capability: item.observation.capability,
    freshness_class: item.freshness_class
  }));
  const capabilitySurfaces = CAPABILITY_ORDER
    .filter(capability => profile.capabilities.includes(capability))
    .map(capability => deriveCapabilitySurface(capability, normalized));

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

export function verifyCognitiveCapabilitySurfaceReport(document, profile, observations) {
  validateReportShape(document);
  validateCognitiveCapabilityProfile(profile);
  if (!Array.isArray(observations)) throw new ValidationError('observations must be an array');
  const derived = deriveCognitiveCapabilitySurfaceReport({
    report_id: document.report_id,
    profile,
    observations,
    assessment_at: document.assessment_at,
    recorded_at: document.recorded_at
  });
  const suppliedDigest = digestObject(document);
  const derivedDigest = digestObject(derived);
  if (suppliedDigest !== derivedDigest) {
    throw new ValidationError('Capability surface report re-derivation mismatch');
  }
  return Object.freeze({
    valid: true,
    schema: COGNITIVE_CAPABILITY_SURFACE_REPORT_SCHEMA,
    report_id: document.report_id,
    report_digest: suppliedDigest,
    profile_id: document.profile_id,
    profile_digest: document.profile_digest,
    observations: document.observations.length,
    authority_effect: 'none',
    network_effect: 'none',
    training_effect: 'none',
    spend_effect: 'none',
    runtime_activation: false,
    selection_effect: 'evidence-only'
  });
}

function deriveCapabilitySurface(capability, normalized) {
  const matching = normalized.filter(item => item.observation.capability === capability);
  const observationCounts = { current: 0, stale: 0, future: 0, not_yet_recorded: 0 };
  for (const item of matching) {
    if (item.freshness_class === 'not-yet-recorded') observationCounts.not_yet_recorded += 1;
    else observationCounts[item.freshness_class] += 1;
  }
  const current = matching.filter(item => item.freshness_class === 'current');
  const grouped = new Map();
  for (const item of current) {
    const dimensions = dimensionsFor(item.observation);
    const cellDigest = digestObject(dimensions);
    if (!grouped.has(cellDigest)) grouped.set(cellDigest, { dimensions, items: [] });
    grouped.get(cellDigest).items.push(item);
  }
  const currentCells = [...grouped.entries()]
    .map(([cellDigest, group]) => deriveCell(cellDigest, group.dimensions, group.items))
    .sort((a, b) => a.cell_digest.localeCompare(b.cell_digest));
  return {
    capability,
    declared: true,
    observation_counts: observationCounts,
    current_cells: currentCells,
    variation_present: hasVariation(currentCells),
    direct_conflict_cells: currentCells.filter(cell => cell.conflict_class === 'direct').length,
    mixed_classification_cells: currentCells.filter(cell => cell.conflict_class === 'mixed').length,
    current_evaluator_coverage: {
      evaluator_kinds: sortedUnique(current.map(item => item.observation.evaluator.evaluator_kind)),
      evaluator_refs: sortedUnique(current.map(item => item.observation.evaluator.evaluator_ref))
    },
    current_assurance_classes: orderedUnique(
      current.map(item => item.observation.evidence.assurance_class), ASSURANCE_ORDER
    ),
    current_failure_modes: aggregateFailureModes(current),
    current_resource_ranges: aggregateResourceRanges(current)
  };
}

function deriveCell(cellDigest, dimensions, items) {
  const sorted = [...items].sort(compareNormalizedObservation);
  const classificationCounts = { pass: 0, degraded: 0, fail: 0, indeterminate: 0 };
  for (const item of sorted) classificationCounts[item.observation.result.classification] += 1;
  const classificationSet = CLASSIFICATION_ORDER.filter(value => classificationCounts[value] > 0);
  const nonIndeterminate = classificationSet.filter(value => value !== 'indeterminate');
  const conflictClass = classificationCounts.pass > 0 && classificationCounts.fail > 0
    ? 'direct'
    : nonIndeterminate.length > 1 ? 'mixed' : 'none';
  return {
    cell_digest: cellDigest,
    dimensions,
    observation_refs: sorted.map(observationRefFor),
    classification_counts: classificationCounts,
    classification_set: classificationSet,
    conflict_class: conflictClass,
    evaluator_kinds: sortedUnique(sorted.map(item => item.observation.evaluator.evaluator_kind)),
    evaluator_refs: sortedUnique(sorted.map(item => item.observation.evaluator.evaluator_ref)),
    assurance_classes: orderedUnique(
      sorted.map(item => item.observation.evidence.assurance_class), ASSURANCE_ORDER
    ),
    failure_modes: aggregateFailureModes(sorted),
    resource_ranges: aggregateResourceRanges(sorted)
  };
}

function hasVariation(cells) {
  if (cells.length < 2) return false;
  const represented = new Set(cells.map(cell => JSON.stringify(
    cell.classification_set.filter(value => value !== 'indeterminate')
  )));
  return represented.size > 1;
}

function aggregateFailureModes(items) {
  const byRef = new Map();
  for (const item of items) {
    for (const failureModeRef of item.observation.result.failure_mode_refs) {
      if (!byRef.has(failureModeRef)) byRef.set(failureModeRef, new Map());
      const ref = observationRefFor(item);
      byRef.get(failureModeRef).set(observationRefKey(ref), ref);
    }
  }
  return [...byRef.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([failure_mode_ref, refs]) => ({
      failure_mode_ref,
      supporting_observations: [...refs.values()].sort(compareObservationRefs)
    }));
}

function aggregateResourceRanges(items) {
  const buckets = new Map();
  for (const item of items) {
    for (const resource of item.observation.resource_observations) {
      const key = resourceBucketKey(resource.resource_class, resource.basis, resource.unit);
      if (!buckets.has(key)) {
        buckets.set(key, {
          resource_class: resource.resource_class,
          basis: resource.basis,
          unit: resource.unit,
          measurement_count: 0,
          minimum: null,
          maximum: null,
          supporters: new Map()
        });
      }
      const bucket = buckets.get(key);
      bucket.measurement_count += 1;
      const ref = observationRefFor(item);
      bucket.supporters.set(observationRefKey(ref), ref);
      if (resource.basis !== 'unknown') {
        bucket.minimum = bucket.minimum === null ? resource.amount : Math.min(bucket.minimum, resource.amount);
        bucket.maximum = bucket.maximum === null ? resource.amount : Math.max(bucket.maximum, resource.amount);
      }
    }
  }
  return [...buckets.values()]
    .sort(compareResourceBuckets)
    .map(bucket => ({
      resource_class: bucket.resource_class,
      basis: bucket.basis,
      unit: bucket.unit,
      measurement_count: bucket.measurement_count,
      minimum: bucket.minimum,
      maximum: bucket.maximum,
      supporting_observations: [...bucket.supporters.values()].sort(compareObservationRefs)
    }));
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
  ) throw new ValidationError('Cognitive capability surface report schema/version/status is invalid');
  id(document.report_id, 'report_id');
  id(document.profile_id, 'profile_id');
  digest(document.profile_digest, 'profile_digest');
  const assessmentMs = timestamp(document.assessment_at, 'assessment_at');
  const recordedMs = timestamp(document.recorded_at, 'recorded_at');
  if (recordedMs < assessmentMs) throw new ValidationError('recorded_at cannot precede assessment_at');
  const inventoryCounts = validateInventory(document.observations);
  validateCapabilitySurfaces(document.capability_surfaces, inventoryCounts);
  if (
    document.contains_secret_material !== false
    || document.authority_effect !== 'none'
    || document.network_effect !== 'none'
    || document.training_effect !== 'none'
    || document.spend_effect !== 'none'
    || document.runtime_activation !== false
    || document.selection_effect !== 'evidence-only'
  ) throw new ValidationError('Cognitive capability surface report authority boundary is invalid');
  return document;
}

function validateInventory(value) {
  if (!Array.isArray(value) || value.length > 256) throw new ValidationError('observations must contain at most 256 items');
  let previous = null;
  const ids = new Set();
  const digests = new Set();
  const counts = new Map();
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
    if (previous && compareObservationRefs(previous, item) >= 0) {
      throw new ValidationError('observations must use canonical ordering');
    }
    previous = item;
    if (!counts.has(item.capability)) counts.set(item.capability, { current: 0, stale: 0, future: 0, not_yet_recorded: 0 });
    const capabilityCounts = counts.get(item.capability);
    if (item.freshness_class === 'not-yet-recorded') capabilityCounts.not_yet_recorded += 1;
    else capabilityCounts[item.freshness_class] += 1;
  }
  return counts;
}

function validateCapabilitySurfaces(value, inventoryCounts) {
  if (!Array.isArray(value) || value.length > CAPABILITY_ORDER.length) throw new ValidationError('capability_surfaces is invalid');
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
    const expectedCounts = inventoryCounts.get(surface.capability) ?? { current: 0, stale: 0, future: 0, not_yet_recorded: 0 };
    if (!sameCounts(surface.observation_counts, expectedCounts)) {
      throw new ValidationError('capability surface observation count mismatch');
    }
    validateCells(surface.current_cells, surface.capability);
    booleanValue(surface.variation_present, 'capability_surfaces.variation_present');
    safeInteger(surface.direct_conflict_cells, 'capability_surfaces.direct_conflict_cells');
    safeInteger(surface.mixed_classification_cells, 'capability_surfaces.mixed_classification_cells');
    validateEvaluatorCoverage(surface.current_evaluator_coverage);
    validateOrderedEnumArray(surface.current_assurance_classes, ASSURANCE_ORDER, 'capability_surfaces.current_assurance_classes');
    validateFailureModes(surface.current_failure_modes, 'capability_surfaces.current_failure_modes');
    validateResourceRanges(surface.current_resource_ranges, 'capability_surfaces.current_resource_ranges');

    const cellCurrentCount = surface.current_cells.reduce((sum, cell) => sum + cell.observation_refs.length, 0);
    if (cellCurrentCount !== surface.observation_counts.current) {
      throw new ValidationError('capability surface current observation count mismatch');
    }
    const direct = surface.current_cells.filter(cell => cell.conflict_class === 'direct').length;
    const mixed = surface.current_cells.filter(cell => cell.conflict_class === 'mixed').length;
    if (direct !== surface.direct_conflict_cells || mixed !== surface.mixed_classification_cells) {
      throw new ValidationError('capability surface conflict count mismatch');
    }
    if (hasVariation(surface.current_cells) !== surface.variation_present) {
      throw new ValidationError('capability surface variation mismatch');
    }
    const cellEvaluatorKinds = sortedUnique(surface.current_cells.flatMap(cell => cell.evaluator_kinds));
    const cellEvaluatorRefs = sortedUnique(surface.current_cells.flatMap(cell => cell.evaluator_refs));
    const cellAssurance = orderedUnique(surface.current_cells.flatMap(cell => cell.assurance_classes), ASSURANCE_ORDER);
    if (!sameArray(surface.current_evaluator_coverage.evaluator_kinds, cellEvaluatorKinds)
      || !sameArray(surface.current_evaluator_coverage.evaluator_refs, cellEvaluatorRefs)
      || !sameArray(surface.current_assurance_classes, cellAssurance)) {
      throw new ValidationError('capability surface evaluator or assurance aggregate mismatch');
    }
  }
  for (const capability of inventoryCounts.keys()) {
    if (!seen.has(capability)) throw new ValidationError('capability surface missing observed capability');
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
    validateObservationRefs(cell.observation_refs, 'current_cells.observation_refs', true);
    validateClassificationCounts(cell.classification_counts);
    validateOrderedEnumArray(cell.classification_set, CLASSIFICATION_ORDER, 'current_cells.classification_set');
    const expectedSet = CLASSIFICATION_ORDER.filter(value => cell.classification_counts[value] > 0);
    if (!sameArray(cell.classification_set, expectedSet)) throw new ValidationError('cell classification set mismatch');
    const total = CLASSIFICATION_ORDER.reduce((sum, value) => sum + cell.classification_counts[value], 0);
    if (total !== cell.observation_refs.length) throw new ValidationError('cell classification count mismatch');
    enumValue(cell.conflict_class, 'current_cells.conflict_class', CONFLICT_CLASSES);
    const nonIndeterminate = expectedSet.filter(value => value !== 'indeterminate');
    const expectedConflict = cell.classification_counts.pass > 0 && cell.classification_counts.fail > 0
      ? 'direct' : nonIndeterminate.length > 1 ? 'mixed' : 'none';
    if (cell.conflict_class !== expectedConflict) throw new ValidationError('cell conflict class mismatch');
    validateSortedEnumArray(cell.evaluator_kinds, EVALUATOR_KINDS, 'current_cells.evaluator_kinds');
    validateSortedUniqueStrings(cell.evaluator_refs, 'current_cells.evaluator_refs');
    validateOrderedEnumArray(cell.assurance_classes, ASSURANCE_ORDER, 'current_cells.assurance_classes');
    validateFailureModes(cell.failure_modes, 'current_cells.failure_modes');
    validateResourceRanges(cell.resource_ranges, 'current_cells.resource_ranges');
  }
}

function validateDimensions(value) {
  exactObject(value, 'Capability surface cell dimensions', DIMENSION_FIELDS);
  enumValue(value.capability, 'dimensions.capability', CAPABILITIES);
  enumValue(value.difficulty_class, 'dimensions.difficulty_class', DIFFICULTIES);
  for (const field of DIMENSION_FIELDS) {
    if (field === 'capability' || field === 'difficulty_class') continue;
    if (field.endsWith('_digest')) digest(value[field], `dimensions.${field}`);
    else id(value[field], `dimensions.${field}`);
  }
}

function validateClassificationCounts(value) {
  exactObject(value, 'Capability surface classification_counts', CLASSIFICATION_ORDER);
  for (const field of CLASSIFICATION_ORDER) safeInteger(value[field], `classification_counts.${field}`);
}

function validateEvaluatorCoverage(value) {
  exactObject(value, 'Capability surface evaluator coverage', EVALUATOR_COVERAGE_FIELDS);
  validateSortedEnumArray(value.evaluator_kinds, EVALUATOR_KINDS, 'current_evaluator_coverage.evaluator_kinds');
  validateSortedUniqueStrings(value.evaluator_refs, 'current_evaluator_coverage.evaluator_refs');
}

function validateObservationRefs(value, label, requireNonEmpty = false) {
  if (!Array.isArray(value) || value.length > 256 || (requireNonEmpty && value.length === 0)) {
    throw new ValidationError(`${label} is invalid`);
  }
  let previous = null;
  for (const ref of value) {
    exactObject(ref, 'Capability surface observation ref', OBSERVATION_REF_FIELDS);
    id(ref.observation_id, `${label}.observation_id`);
    digest(ref.observation_digest, `${label}.observation_digest`);
    if (previous && compareObservationRefs(previous, ref) >= 0) throw new ValidationError(`${label} must use canonical ordering`);
    previous = ref;
  }
}

function validateFailureModes(value, label) {
  if (!Array.isArray(value) || value.length > 256) throw new ValidationError(`${label} is invalid`);
  let previous = null;
  for (const item of value) {
    exactObject(item, 'Capability surface failure mode', FAILURE_MODE_FIELDS);
    id(item.failure_mode_ref, `${label}.failure_mode_ref`);
    if (previous !== null && previous.localeCompare(item.failure_mode_ref) >= 0) throw new ValidationError(`${label} must use canonical ordering`);
    previous = item.failure_mode_ref;
    validateObservationRefs(item.supporting_observations, `${label}.supporting_observations`, true);
  }
}

function validateResourceRanges(value, label) {
  if (!Array.isArray(value) || value.length > 256) throw new ValidationError(`${label} is invalid`);
  let previous = null;
  for (const item of value) {
    exactObject(item, 'Capability surface resource range', RESOURCE_RANGE_FIELDS);
    enumValue(item.resource_class, `${label}.resource_class`, RESOURCE_CLASSES);
    enumValue(item.basis, `${label}.basis`, RESOURCE_BASES);
    positiveSafeInteger(item.measurement_count, `${label}.measurement_count`);
    validateObservationRefs(item.supporting_observations, `${label}.supporting_observations`, true);
    if (item.basis === 'unknown') {
      if (item.unit !== null || item.minimum !== null || item.maximum !== null) {
        throw new ValidationError(`${label} unknown resources require null unit/minimum/maximum`);
      }
    } else {
      unit(item.unit, `${label}.unit`);
      safeInteger(item.minimum, `${label}.minimum`);
      safeInteger(item.maximum, `${label}.maximum`);
      if (item.maximum < item.minimum) throw new ValidationError(`${label} maximum cannot precede minimum`);
    }
    if (previous && compareResourceBuckets(previous, item) >= 0) throw new ValidationError(`${label} must use canonical ordering`);
    previous = item;
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

function validateSortedEnumArray(value, allowed, label) {
  if (!Array.isArray(value) || value.length > allowed.size) throw new ValidationError(`${label} is invalid`);
  let previous = null;
  for (const item of value) {
    enumValue(item, label, allowed);
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

function observationRefFor(item) {
  return {
    observation_id: item.observation.observation_id,
    observation_digest: item.observation_digest
  };
}

function observationRefKey(ref) {
  return `${ref.observation_id}\u0000${ref.observation_digest}`;
}

function resourceBucketKey(resourceClass, basis, resourceUnit) {
  return JSON.stringify([resourceClass, basis, resourceUnit]);
}

function compareNormalizedObservation(a, b) {
  return compareObservationIdentity(
    a.observation.observation_id, a.observation_digest,
    b.observation.observation_id, b.observation_digest
  );
}

function compareObservationRefs(a, b) {
  return compareObservationIdentity(a.observation_id, a.observation_digest, b.observation_id, b.observation_digest);
}

function compareObservationIdentity(idA, digestA, idB, digestB) {
  const idCompare = idA.localeCompare(idB);
  return idCompare !== 0 ? idCompare : digestA.localeCompare(digestB);
}

function compareResourceBuckets(a, b) {
  const classCompare = a.resource_class.localeCompare(b.resource_class);
  if (classCompare !== 0) return classCompare;
  const basisCompare = a.basis.localeCompare(b.basis);
  if (basisCompare !== 0) return basisCompare;
  if (a.unit === b.unit) return 0;
  if (a.unit === null) return -1;
  if (b.unit === null) return 1;
  return a.unit.localeCompare(b.unit);
}

function sortedUnique(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function orderedUnique(values, order) {
  const set = new Set(values);
  return order.filter(value => set.has(value));
}

function sameCounts(a, b) {
  return OBSERVATION_COUNT_FIELDS.every(field => a[field] === b[field]);
}

function sameArray(a, b) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function exactObject(value, label, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ValidationError(`${label} must be a plain object`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new ValidationError(`${label} must be a plain object`);
  const allowed = new Set(fields);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new ValidationError(`${label} contains unknown field ${key}`);
  for (const key of fields) if (!Object.hasOwn(value, key)) throw new ValidationError(`${label} is missing required field ${key}`);
}

function id(value, label) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) throw new ValidationError(`${label} is invalid`);
  return value;
}

function digest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) throw new ValidationError(`${label} is invalid`);
  return value;
}

function unit(value, label) {
  if (typeof value !== 'string' || !UNIT.test(value)) throw new ValidationError(`${label} is invalid`);
  return value;
}

function enumValue(value, label, allowed) {
  if (typeof value !== 'string' || !allowed.has(value)) throw new ValidationError(`${label} is invalid`);
  return value;
}

function safeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new ValidationError(`${label} must be a non-negative safe integer`);
  return value;
}

function positiveSafeInteger(value, label) {
  safeInteger(value, label);
  if (value === 0) throw new ValidationError(`${label} must be greater than zero`);
  return value;
}

function booleanValue(value, label) {
  if (typeof value !== 'boolean') throw new ValidationError(`${label} must be boolean`);
  return value;
}

function timestamp(value, label) {
  if (typeof value !== 'string' || value.length > 64) throw new ValidationError(`${label} must be a canonical ISO timestamp`);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) throw new ValidationError(`${label} must be a canonical ISO timestamp`);
  return parsed.getTime();
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
