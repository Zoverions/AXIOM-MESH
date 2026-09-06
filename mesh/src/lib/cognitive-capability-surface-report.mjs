import { digestObject, ValidationError } from './canonical.mjs';
import {
  cognitiveCapabilityProfileDigest,
  validateCognitiveCapabilityProfile
} from './cognitive-capability-profile.mjs';
import {
  cognitiveCapabilityObservationDigest,
  resolveCognitiveCapabilityObservation,
  validateCognitiveCapabilityObservation
} from './cognitive-capability-observation.mjs';

export const COGNITIVE_CAPABILITY_SURFACE_REPORT_SCHEMA =
  'axiom-cognitive-capability-surface-report.v0';

const REPORT_FIELDS = Object.freeze([
  'schema',
  'version',
  'status',
  'report_id',
  'profile_id',
  'profile_digest',
  'assessment_at',
  'recorded_at',
  'source_observations',
  'capability_surfaces',
  'contains_secret_material',
  'authority_effect',
  'network_effect',
  'training_effect',
  'spend_effect',
  'runtime_activation',
  'selection_effect'
]);

const SOURCE_FIELDS = Object.freeze([
  'observation_id',
  'observation_digest',
  'capability',
  'freshness',
  'observed_at',
  'valid_until',
  'recorded_at'
]);

const SURFACE_FIELDS = Object.freeze([
  'capability',
  'current_cells',
  'direct_conflict_cells',
  'mixed_conflict_cells',
  'variation_present'
]);

const CELL_KEY_FIELDS = Object.freeze([
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

const CELL_FIELDS = Object.freeze([
  'cell_key',
  'cell_digest',
  'observation_refs',
  'observation_digests',
  'classification_counts',
  'classification_set',
  'conflict_class',
  'evaluator_evidence',
  'failure_modes',
  'resource_buckets'
]);

const CLASSIFICATION_COUNT_FIELDS = Object.freeze([
  'pass',
  'degraded',
  'fail',
  'indeterminate'
]);

const EVALUATOR_EVIDENCE_FIELDS = Object.freeze([
  'evaluator_kind',
  'evaluator_ref',
  'evaluator_principal_ref',
  'assurance_class',
  'evidence_kind',
  'evidence_ref',
  'evidence_digest',
  'verification_ref',
  'verification_digest',
  'observation_refs'
]);

const FAILURE_MODE_FIELDS = Object.freeze([
  'failure_mode_ref',
  'observation_refs'
]);

const RESOURCE_BUCKET_FIELDS = Object.freeze([
  'resource_class',
  'basis',
  'unit',
  'measurement_count',
  'min_amount',
  'max_amount',
  'observation_refs'
]);

const FRESHNESS_VALUES = new Set([
  'current',
  'stale',
  'future',
  'not-yet-recorded'
]);
const CONFLICT_VALUES = new Set(['none', 'mixed', 'direct']);
const CLASSIFICATION_VALUES = new Set(CLASSIFICATION_COUNT_FIELDS);
const CLASSIFICATION_ORDER = Object.freeze([...CLASSIFICATION_COUNT_FIELDS]);
const DIFFICULTY_VALUES = new Set([
  'trivial',
  'routine',
  'challenging',
  'expert',
  'adversarial',
  'unknown'
]);
const RESOURCE_BASES = new Set(['observed', 'estimated', 'unknown']);
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const UNIT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,63}$/;

function assertPlainObject(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${path} must be an object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new ValidationError(`${path} must be a plain object`);
  }
  return value;
}

function assertExactFields(value, expected, path) {
  const expectedSet = new Set(expected);
  for (const key of Object.keys(value)) {
    if (!expectedSet.has(key)) {
      throw new ValidationError(`${path} contains unknown field ${key}`);
    }
  }
  for (const key of expected) {
    if (!Object.hasOwn(value, key)) {
      throw new ValidationError(`${path} is missing required field ${key}`);
    }
  }
}

function assertIdentifier(value, path) {
  if (typeof value !== 'string' || !IDENTIFIER_PATTERN.test(value)) {
    throw new ValidationError(`${path} must be a valid identifier`);
  }
  return value;
}

function assertNullableIdentifier(value, path) {
  if (value === null) return value;
  return assertIdentifier(value, path);
}

function assertDigest(value, path) {
  if (typeof value !== 'string' || !DIGEST_PATTERN.test(value)) {
    throw new ValidationError(`${path} must be a lowercase sha256 digest`);
  }
  return value;
}

function assertNullableDigest(value, path) {
  if (value === null) return value;
  return assertDigest(value, path);
}

function assertUnit(value, path) {
  if (typeof value !== 'string' || !UNIT_PATTERN.test(value)) {
    throw new ValidationError(`${path} must be a valid unit`);
  }
  return value;
}

function assertCanonicalTimestamp(value, path) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 64) {
    throw new ValidationError(`${path} must be a canonical ISO timestamp`);
  }
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    throw new ValidationError(`${path} must be a canonical ISO timestamp`);
  }
  return milliseconds;
}

function assertArray(value, path, maxItems) {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new ValidationError(`${path} must be an array with at most ${maxItems} items`);
  }
  return value;
}

function assertNonNegativeSafeInteger(value, path) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ValidationError(`${path} must be a non-negative safe integer`);
  }
  return value;
}

function assertSortedUniqueStrings(value, path, maxItems = 256) {
  assertArray(value, path, maxItems);
  let previous = null;
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (typeof item !== 'string') {
      throw new ValidationError(`${path}[${index}] must be a string`);
    }
    if (previous !== null && previous.localeCompare(item) >= 0) {
      throw new ValidationError(`${path} must be sorted and unique`);
    }
    previous = item;
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function freshnessAt(observation, assessmentMs) {
  if (Date.parse(observation.observed_at) > assessmentMs) return 'future';
  if (Date.parse(observation.recorded_at) > assessmentMs) return 'not-yet-recorded';
  if (Date.parse(observation.valid_until) < assessmentMs) return 'stale';
  return 'current';
}

function validateSourceObservation(item, index) {
  const path = `surface report source_observations[${index}]`;
  assertPlainObject(item, path);
  assertExactFields(item, SOURCE_FIELDS, path);
  assertIdentifier(item.observation_id, `${path}.observation_id`);
  assertDigest(item.observation_digest, `${path}.observation_digest`);
  assertIdentifier(item.capability, `${path}.capability`);
  if (!FRESHNESS_VALUES.has(item.freshness)) {
    throw new ValidationError(`${path}.freshness is invalid`);
  }
  assertCanonicalTimestamp(item.observed_at, `${path}.observed_at`);
  assertCanonicalTimestamp(item.valid_until, `${path}.valid_until`);
  assertCanonicalTimestamp(item.recorded_at, `${path}.recorded_at`);
}

function validateCellKey(item, path) {
  assertPlainObject(item, path);
  assertExactFields(item, CELL_KEY_FIELDS, path);
  assertIdentifier(item.capability, `${path}.capability`);
  for (const field of [
    'context_ref', 'task_family_ref', 'environment_ref', 'toolset_ref',
    'suite_ref', 'metric_set_ref', 'threshold_ref', 'method_ref'
  ]) {
    assertIdentifier(item[field], `${path}.${field}`);
  }
  for (const field of [
    'context_digest', 'task_family_digest', 'environment_digest', 'toolset_digest',
    'suite_digest', 'metric_set_digest', 'threshold_digest', 'method_digest'
  ]) {
    assertDigest(item[field], `${path}.${field}`);
  }
  if (!DIFFICULTY_VALUES.has(item.difficulty_class)) {
    throw new ValidationError(`${path}.difficulty_class is invalid`);
  }
}

function validateClassificationCounts(item, path) {
  assertPlainObject(item, path);
  assertExactFields(item, CLASSIFICATION_COUNT_FIELDS, path);
  for (const field of CLASSIFICATION_COUNT_FIELDS) {
    assertNonNegativeSafeInteger(item[field], `${path}.${field}`);
  }
}

function validateClassificationSet(items, path) {
  assertArray(items, path, CLASSIFICATION_ORDER.length);
  let lastIndex = -1;
  for (let index = 0; index < items.length; index += 1) {
    const value = items[index];
    if (!CLASSIFICATION_VALUES.has(value)) {
      throw new ValidationError(`${path}[${index}] is invalid`);
    }
    const orderIndex = CLASSIFICATION_ORDER.indexOf(value);
    if (orderIndex <= lastIndex) {
      throw new ValidationError(`${path} must use canonical classification order without duplicates`);
    }
    lastIndex = orderIndex;
  }
}

function validateEvaluatorEvidence(item, index, pathPrefix) {
  const path = `${pathPrefix}[${index}]`;
  assertPlainObject(item, path);
  assertExactFields(item, EVALUATOR_EVIDENCE_FIELDS, path);
  assertIdentifier(item.evaluator_kind, `${path}.evaluator_kind`);
  assertIdentifier(item.evaluator_ref, `${path}.evaluator_ref`);
  assertNullableIdentifier(item.evaluator_principal_ref, `${path}.evaluator_principal_ref`);
  assertIdentifier(item.assurance_class, `${path}.assurance_class`);
  assertIdentifier(item.evidence_kind, `${path}.evidence_kind`);
  assertIdentifier(item.evidence_ref, `${path}.evidence_ref`);
  assertDigest(item.evidence_digest, `${path}.evidence_digest`);
  assertNullableIdentifier(item.verification_ref, `${path}.verification_ref`);
  assertNullableDigest(item.verification_digest, `${path}.verification_digest`);
  assertSortedUniqueStrings(item.observation_refs, `${path}.observation_refs`);
}

function validateFailureMode(item, index, pathPrefix) {
  const path = `${pathPrefix}[${index}]`;
  assertPlainObject(item, path);
  assertExactFields(item, FAILURE_MODE_FIELDS, path);
  assertIdentifier(item.failure_mode_ref, `${path}.failure_mode_ref`);
  assertSortedUniqueStrings(item.observation_refs, `${path}.observation_refs`);
}

function validateResourceBucket(item, index, pathPrefix) {
  const path = `${pathPrefix}[${index}]`;
  assertPlainObject(item, path);
  assertExactFields(item, RESOURCE_BUCKET_FIELDS, path);
  assertIdentifier(item.resource_class, `${path}.resource_class`);
  if (!RESOURCE_BASES.has(item.basis)) {
    throw new ValidationError(`${path}.basis is invalid`);
  }
  if (item.unit !== null) assertUnit(item.unit, `${path}.unit`);
  assertNonNegativeSafeInteger(item.measurement_count, `${path}.measurement_count`);
  assertSortedUniqueStrings(item.observation_refs, `${path}.observation_refs`);
  if (item.basis === 'unknown') {
    if (item.unit !== null || item.min_amount !== null || item.max_amount !== null) {
      throw new ValidationError(`${path} unknown resource bucket must use null unit and numeric range`);
    }
  } else {
    assertUnit(item.unit, `${path}.unit`);
    assertNonNegativeSafeInteger(item.min_amount, `${path}.min_amount`);
    assertNonNegativeSafeInteger(item.max_amount, `${path}.max_amount`);
    if (item.max_amount < item.min_amount) {
      throw new ValidationError(`${path}.max_amount cannot be less than min_amount`);
    }
  }
}

function validateCurrentCell(item, index, pathPrefix) {
  const path = `${pathPrefix}[${index}]`;
  assertPlainObject(item, path);
  assertExactFields(item, CELL_FIELDS, path);
  validateCellKey(item.cell_key, `${path}.cell_key`);
  assertDigest(item.cell_digest, `${path}.cell_digest`);
  if (digestObject(item.cell_key) !== item.cell_digest) {
    throw new ValidationError(`${path}.cell_digest does not match cell_key`);
  }
  assertSortedUniqueStrings(item.observation_refs, `${path}.observation_refs`);
  assertSortedUniqueStrings(item.observation_digests, `${path}.observation_digests`);
  validateClassificationCounts(item.classification_counts, `${path}.classification_counts`);
  validateClassificationSet(item.classification_set, `${path}.classification_set`);
  if (!CONFLICT_VALUES.has(item.conflict_class)) {
    throw new ValidationError(`${path}.conflict_class is invalid`);
  }
  assertArray(item.evaluator_evidence, `${path}.evaluator_evidence`, 256);
  item.evaluator_evidence.forEach((entry, entryIndex) =>
    validateEvaluatorEvidence(entry, entryIndex, `${path}.evaluator_evidence`));
  assertArray(item.failure_modes, `${path}.failure_modes`, 256);
  item.failure_modes.forEach((entry, entryIndex) =>
    validateFailureMode(entry, entryIndex, `${path}.failure_modes`));
  assertArray(item.resource_buckets, `${path}.resource_buckets`, 256);
  item.resource_buckets.forEach((entry, entryIndex) =>
    validateResourceBucket(entry, entryIndex, `${path}.resource_buckets`));
}

function validateCapabilitySurface(item, index) {
  const path = `surface report capability_surfaces[${index}]`;
  assertPlainObject(item, path);
  assertExactFields(item, SURFACE_FIELDS, path);
  assertIdentifier(item.capability, `${path}.capability`);
  assertArray(item.current_cells, `${path}.current_cells`, 256);
  item.current_cells.forEach((cell, cellIndex) =>
    validateCurrentCell(cell, cellIndex, `${path}.current_cells`));
  for (let cellIndex = 1; cellIndex < item.current_cells.length; cellIndex += 1) {
    if (item.current_cells[cellIndex - 1].cell_digest.localeCompare(item.current_cells[cellIndex].cell_digest) >= 0) {
      throw new ValidationError(`${path}.current_cells must be sorted by unique cell_digest`);
    }
  }
  assertNonNegativeSafeInteger(item.direct_conflict_cells, `${path}.direct_conflict_cells`);
  assertNonNegativeSafeInteger(item.mixed_conflict_cells, `${path}.mixed_conflict_cells`);
  if (typeof item.variation_present !== 'boolean') {
    throw new ValidationError(`${path}.variation_present must be boolean`);
  }
}

function assertAuthorityBoundary(document) {
  if (
    document.contains_secret_material !== false ||
    document.authority_effect !== 'none' ||
    document.network_effect !== 'none' ||
    document.training_effect !== 'none' ||
    document.spend_effect !== 'none' ||
    document.runtime_activation !== false ||
    document.selection_effect !== 'evidence-only'
  ) {
    throw new ValidationError('surface report authority boundary is invalid');
  }
}

function cellKeyFor(observation) {
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

function classificationCounts(records) {
  const counts = { pass: 0, degraded: 0, fail: 0, indeterminate: 0 };
  for (const record of records) counts[record.observation.result.classification] += 1;
  return counts;
}

function classificationSetFromCounts(counts) {
  return CLASSIFICATION_ORDER.filter(classification => counts[classification] > 0);
}

function conflictClass(classifications) {
  const classes = new Set(classifications);
  if (classes.has('pass') && classes.has('fail')) return 'direct';
  const nonIndeterminate = [...classes].filter(value => value !== 'indeterminate');
  if (new Set(nonIndeterminate).size > 1) return 'mixed';
  return 'none';
}

function evaluatorEvidenceSummary(records) {
  const groups = new Map();
  for (const record of records) {
    const observation = record.observation;
    const identity = {
      evaluator_kind: observation.evaluator.evaluator_kind,
      evaluator_ref: observation.evaluator.evaluator_ref,
      evaluator_principal_ref: observation.evaluator.evaluator_principal_ref,
      assurance_class: observation.evidence.assurance_class,
      evidence_kind: observation.evidence.evidence_kind,
      evidence_ref: observation.evidence.evidence_ref,
      evidence_digest: observation.evidence.evidence_digest,
      verification_ref: observation.evidence.verification_ref,
      verification_digest: observation.evidence.verification_digest
    };
    const key = digestObject(identity);
    const existing = groups.get(key) ?? { identity, refs: new Set() };
    existing.refs.add(observation.observation_id);
    groups.set(key, existing);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, group]) => ({
      ...group.identity,
      observation_refs: [...group.refs].sort((left, right) => left.localeCompare(right))
    }));
}

function failureModeSummary(records) {
  const groups = new Map();
  for (const record of records) {
    for (const failureModeRef of record.observation.result.failure_mode_refs) {
      const refs = groups.get(failureModeRef) ?? new Set();
      refs.add(record.observation.observation_id);
      groups.set(failureModeRef, refs);
    }
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([failure_mode_ref, refs]) => ({
      failure_mode_ref,
      observation_refs: [...refs].sort((left, right) => left.localeCompare(right))
    }));
}

function resourceBucketSummary(records) {
  const groups = new Map();
  for (const record of records) {
    for (const resource of record.observation.resource_observations) {
      const identity = {
        resource_class: resource.resource_class,
        basis: resource.basis,
        unit: resource.unit
      };
      const key = digestObject(identity);
      const existing = groups.get(key) ?? {
        identity,
        measurement_count: 0,
        amounts: [],
        refs: new Set()
      };
      existing.measurement_count += 1;
      if (resource.amount !== null) existing.amounts.push(resource.amount);
      existing.refs.add(record.observation.observation_id);
      groups.set(key, existing);
    }
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, group]) => ({
      ...group.identity,
      measurement_count: group.measurement_count,
      min_amount: group.identity.basis === 'unknown' ? null : Math.min(...group.amounts),
      max_amount: group.identity.basis === 'unknown' ? null : Math.max(...group.amounts),
      observation_refs: [...group.refs].sort((left, right) => left.localeCompare(right))
    }));
}

function currentCellsForCapability(records, capability) {
  const groups = new Map();
  for (const record of records) {
    if (record.freshness !== 'current' || record.observation.capability !== capability) continue;
    const cellKey = cellKeyFor(record.observation);
    const cellDigest = digestObject(cellKey);
    const existing = groups.get(cellDigest);
    if (existing && digestObject(existing.cellKey) !== cellDigest) {
      throw new ValidationError('surface report exact-cell digest collision');
    }
    if (existing && JSON.stringify(existing.cellKey) !== JSON.stringify(cellKey)) {
      throw new ValidationError('surface report exact-cell digest collision');
    }
    const group = existing ?? { cellKey, records: [] };
    group.records.push(record);
    groups.set(cellDigest, group);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([cell_digest, group]) => {
      const recordsForCell = group.records;
      const counts = classificationCounts(recordsForCell);
      const classifications = classificationSetFromCounts(counts);
      return {
        cell_key: group.cellKey,
        cell_digest,
        observation_refs: [...new Set(recordsForCell.map(record => record.observation.observation_id))]
          .sort((left, right) => left.localeCompare(right)),
        observation_digests: [...new Set(recordsForCell.map(record => record.observationDigest))]
          .sort((left, right) => left.localeCompare(right)),
        classification_counts: counts,
        classification_set: classifications,
        conflict_class: conflictClass(classifications),
        evaluator_evidence: evaluatorEvidenceSummary(recordsForCell),
        failure_modes: failureModeSummary(recordsForCell),
        resource_buckets: resourceBucketSummary(recordsForCell)
      };
    });
}

function capabilitySurface(records, capability) {
  const currentCells = currentCellsForCapability(records, capability);
  const classificationSignatures = new Set(
    currentCells.map(cell => JSON.stringify(cell.classification_set))
  );
  return {
    capability,
    current_cells: currentCells,
    direct_conflict_cells: currentCells.filter(cell => cell.conflict_class === 'direct').length,
    mixed_conflict_cells: currentCells.filter(cell => cell.conflict_class === 'mixed').length,
    variation_present: currentCells.length > 1 && classificationSignatures.size > 1
  };
}

export function validateCognitiveCapabilitySurfaceReport(document) {
  assertPlainObject(document, 'surface report');
  assertExactFields(document, REPORT_FIELDS, 'surface report');

  if (document.schema !== COGNITIVE_CAPABILITY_SURFACE_REPORT_SCHEMA) {
    throw new ValidationError('surface report schema is invalid');
  }
  if (document.version !== 0) {
    throw new ValidationError('surface report version is invalid');
  }
  if (document.status !== 'inert-evidence-report') {
    throw new ValidationError('surface report status is invalid');
  }

  assertIdentifier(document.report_id, 'surface report report_id');
  assertIdentifier(document.profile_id, 'surface report profile_id');
  assertDigest(document.profile_digest, 'surface report profile_digest');
  const assessmentMs = assertCanonicalTimestamp(document.assessment_at, 'surface report assessment_at');
  const recordedMs = assertCanonicalTimestamp(document.recorded_at, 'surface report recorded_at');
  if (recordedMs < assessmentMs) {
    throw new ValidationError('surface report recorded_at cannot precede assessment_at');
  }

  assertArray(document.source_observations, 'surface report source_observations', 256);
  const seenIds = new Set();
  const seenDigests = new Set();
  document.source_observations.forEach((item, index) => {
    validateSourceObservation(item, index);
    if (seenIds.has(item.observation_id)) {
      throw new ValidationError(`duplicate observation_id ${item.observation_id}`);
    }
    if (seenDigests.has(item.observation_digest)) {
      throw new ValidationError(`duplicate observation digest ${item.observation_digest}`);
    }
    seenIds.add(item.observation_id);
    seenDigests.add(item.observation_digest);
  });
  for (let index = 1; index < document.source_observations.length; index += 1) {
    const previous = document.source_observations[index - 1];
    const current = document.source_observations[index];
    const order = previous.observation_id.localeCompare(current.observation_id) ||
      previous.observation_digest.localeCompare(current.observation_digest);
    if (order >= 0) {
      throw new ValidationError('surface report source_observations must be canonically sorted and unique');
    }
  }

  assertArray(document.capability_surfaces, 'surface report capability_surfaces', 64);
  document.capability_surfaces.forEach(validateCapabilitySurface);
  assertAuthorityBoundary(document);

  return deepFreeze({
    valid: true,
    schema: document.schema,
    version: document.version,
    status: document.status,
    report_id: document.report_id,
    profile_id: document.profile_id,
    profile_digest: document.profile_digest,
    assessment_at: document.assessment_at,
    recorded_at: document.recorded_at,
    source_observations: document.source_observations.length,
    capability_surfaces: document.capability_surfaces.length,
    authority_effect: document.authority_effect,
    network_effect: document.network_effect,
    training_effect: document.training_effect,
    spend_effect: document.spend_effect,
    runtime_activation: document.runtime_activation,
    selection_effect: document.selection_effect
  });
}

export function cognitiveCapabilitySurfaceReportDigest(document) {
  validateCognitiveCapabilitySurfaceReport(document);
  return digestObject(document);
}

export function deriveCognitiveCapabilitySurfaceReport({
  report_id,
  profile,
  observations,
  assessment_at,
  recorded_at
}) {
  assertIdentifier(report_id, 'surface report report_id');
  validateCognitiveCapabilityProfile(profile);
  const profileDigest = cognitiveCapabilityProfileDigest(profile);
  const assessmentMs = assertCanonicalTimestamp(assessment_at, 'surface report assessment_at');
  const recordedMs = assertCanonicalTimestamp(recorded_at, 'surface report recorded_at');
  if (recordedMs < assessmentMs) {
    throw new ValidationError('surface report recorded_at cannot precede assessment_at');
  }
  assertArray(observations, 'surface report observations', 256);

  const seenIds = new Set();
  const seenDigests = new Set();
  const records = observations.map(observation => {
    validateCognitiveCapabilityObservation(observation);
    resolveCognitiveCapabilityObservation(observation, profile);
    const observationDigest = cognitiveCapabilityObservationDigest(observation);

    if (seenIds.has(observation.observation_id)) {
      throw new ValidationError(`duplicate observation_id ${observation.observation_id}`);
    }
    if (seenDigests.has(observationDigest)) {
      throw new ValidationError(`duplicate observation digest ${observationDigest}`);
    }
    seenIds.add(observation.observation_id);
    seenDigests.add(observationDigest);

    return {
      observation,
      observationDigest,
      freshness: freshnessAt(observation, assessmentMs)
    };
  });

  const sourceObservations = records
    .map(record => ({
      observation_id: record.observation.observation_id,
      observation_digest: record.observationDigest,
      capability: record.observation.capability,
      freshness: record.freshness,
      observed_at: record.observation.observed_at,
      valid_until: record.observation.valid_until,
      recorded_at: record.observation.recorded_at
    }))
    .sort((left, right) =>
      left.observation_id.localeCompare(right.observation_id) ||
      left.observation_digest.localeCompare(right.observation_digest)
    );

  const report = {
    schema: COGNITIVE_CAPABILITY_SURFACE_REPORT_SCHEMA,
    version: 0,
    status: 'inert-evidence-report',
    report_id,
    profile_id: profile.profile_id,
    profile_digest: profileDigest,
    assessment_at,
    recorded_at,
    source_observations: sourceObservations,
    capability_surfaces: profile.capabilities.map(capability => capabilitySurface(records, capability)),
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    training_effect: 'none',
    spend_effect: 'none',
    runtime_activation: false,
    selection_effect: 'evidence-only'
  };

  validateCognitiveCapabilitySurfaceReport(report);
  return deepFreeze(report);
}

export function verifyCognitiveCapabilitySurfaceReport(document, profile, observations) {
  validateCognitiveCapabilitySurfaceReport(document);
  const rederived = deriveCognitiveCapabilitySurfaceReport({
    report_id: document.report_id,
    profile,
    observations,
    assessment_at: document.assessment_at,
    recorded_at: document.recorded_at
  });
  const reportDigest = cognitiveCapabilitySurfaceReportDigest(document);
  const expectedDigest = cognitiveCapabilitySurfaceReportDigest(rederived);
  if (reportDigest !== expectedDigest) {
    throw new ValidationError('surface report does not match exact source artifacts');
  }
  return deepFreeze({
    valid: true,
    report_id: document.report_id,
    profile_id: document.profile_id,
    profile_digest: document.profile_digest,
    source_observations: document.source_observations.length,
    report_digest: reportDigest,
    authority_effect: 'none',
    network_effect: 'none',
    training_effect: 'none',
    spend_effect: 'none',
    runtime_activation: false,
    selection_effect: 'evidence-only'
  });
}
