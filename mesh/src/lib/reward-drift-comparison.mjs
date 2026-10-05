import { digestObject, ValidationError } from './canonical.mjs';
import {
  rewardProbeManifestDigest,
  validateRewardProbeManifest
} from './reward-probe-manifest.mjs';
import {
  rewardCalibrationReportDigest,
  validateRewardCalibrationReport
} from './reward-calibration-report.mjs';

export const REWARD_DRIFT_COMPARISON_SCHEMA = 'axiom-reward-drift-comparison.v0';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const METRICS = new Set([
  'agreement-count',
  'disagreement-count',
  'success-rate',
  'calibration-error',
  'discrimination-score',
  'false-high-confidence-count',
  'false-low-confidence-count',
  'missing-invalid-observation-count'
]);
const DRIFT_STATUSES = new Set([
  'stable-within-declared-bounds',
  'material-drift',
  'mixed',
  'insufficient-evidence',
  'incompatible'
]);

export function validateRewardDriftComparison(document) {
  validateComparisonShape(document);
  return deepFreeze({
    valid: true,
    schema: document.schema,
    version: document.version,
    status: document.status,
    comparison_id: document.comparison_id,
    predecessor: { ...document.predecessor },
    candidate: { ...document.candidate },
    drift_status: document.drift_status,
    comparison_digest: digestObject(document),
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false,
    routing_effect: 'none',
    promotion_effect: 'evidence-only'
  });
}

export function rewardDriftComparisonDigest(document) {
  validateComparisonShape(document);
  return digestObject(document);
}

export function resolveRewardDriftComparison(document, predecessor, candidate) {
  const validated = validateRewardDriftComparison(document);
  const predecessorSide = validateSideEvidence(predecessor, 'predecessor');
  const candidateSide = validateSideEvidence(candidate, 'candidate');

  bindSide(document.predecessor, predecessorSide, 'predecessor');
  bindSide(document.candidate, candidateSide, 'candidate');

  const reasons = compatibilityReasons(predecessorSide, candidateSide);
  const insufficient = isInsufficient(predecessorSide.report) || isInsufficient(candidateSide.report);

  if (reasons.length > 0) {
    if (document.drift_status !== 'incompatible') {
      throw new ValidationError('Incompatible reward drift evidence requires incompatible status');
    }
    if (document.metric_deltas.length !== 0) {
      throw new ValidationError('Incompatible reward drift evidence cannot carry numeric drift claims');
    }
  } else if (insufficient) {
    if (document.drift_status !== 'insufficient-evidence') {
      throw new ValidationError('Insufficient reward calibration evidence requires insufficient-evidence drift status');
    }
    if (document.metric_deltas.length !== 0) {
      throw new ValidationError('Insufficient reward calibration evidence cannot carry numeric drift claims');
    }
  } else {
    if (document.drift_status === 'incompatible' || document.drift_status === 'insufficient-evidence') {
      throw new ValidationError('Compatible sufficient reward drift evidence cannot claim incompatible or insufficient-evidence status');
    }
    validateMetricBindings(document.metric_deltas, predecessorSide.report, candidateSide.report);
  }

  const comparedAt = date(document.compared_at, 'compared_at');
  const predecessorRecorded = date(predecessorSide.report.recorded_at, 'predecessor report recorded_at');
  const candidateRecorded = date(candidateSide.report.recorded_at, 'candidate report recorded_at');
  if (comparedAt < predecessorRecorded || comparedAt < candidateRecorded) {
    throw new ValidationError('Reward drift comparison cannot precede its bound calibration evidence');
  }

  return deepFreeze({
    valid: true,
    schema: REWARD_DRIFT_COMPARISON_SCHEMA,
    comparison_id: document.comparison_id,
    comparison_digest: validated.comparison_digest,
    predecessor: { ...document.predecessor },
    candidate: { ...document.candidate },
    comparison_method: { ...document.comparison_method },
    compatibility_reason_codes: [...reasons],
    metric_deltas: document.metric_deltas.map(item => ({ ...item })),
    drift_status: document.drift_status,
    compared_at: document.compared_at,
    recorded_at: document.recorded_at,
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false,
    routing_effect: 'none',
    promotion_effect: 'evidence-only'
  });
}

function validateComparisonShape(document) {
  exactObject(document, 'Reward drift comparison', [
    'schema',
    'version',
    'status',
    'comparison_id',
    'predecessor',
    'candidate',
    'comparison_method',
    'metric_deltas',
    'drift_status',
    'compared_at',
    'recorded_at',
    'contains_secret_material',
    'authority_effect',
    'network_effect',
    'credential_visibility',
    'runtime_activation',
    'routing_effect',
    'promotion_effect'
  ]);

  if (
    document.schema !== REWARD_DRIFT_COMPARISON_SCHEMA
    || document.version !== 0
    || document.status !== 'inert-evidence'
  ) {
    throw new ValidationError('Reward drift comparison schema/version/status is invalid');
  }

  id(document.comparison_id, 'comparison_id');
  validateSideBinding(document.predecessor, 'predecessor');
  validateSideBinding(document.candidate, 'candidate');
  validateComparisonMethod(document.comparison_method);
  validateMetricDeltas(document.metric_deltas);
  enumValue(document.drift_status, 'drift_status', DRIFT_STATUSES);

  const comparedAt = date(document.compared_at, 'compared_at');
  const recordedAt = date(document.recorded_at, 'recorded_at');
  if (recordedAt < comparedAt) {
    throw new ValidationError('recorded_at cannot precede compared_at');
  }

  if (
    document.contains_secret_material !== false
    || document.authority_effect !== 'none'
    || document.network_effect !== 'none'
    || document.credential_visibility !== 'none'
    || document.runtime_activation !== false
    || document.routing_effect !== 'none'
    || document.promotion_effect !== 'evidence-only'
  ) {
    throw new ValidationError('Reward drift comparison effect boundary is invalid');
  }
  return document;
}

function validateSideBinding(value, label) {
  exactObject(value, `Reward drift ${label} binding`, [
    'probe_manifest_id',
    'probe_manifest_digest',
    'report_id',
    'report_digest',
    'target_ref',
    'target_digest'
  ]);
  id(value.probe_manifest_id, `${label}.probe_manifest_id`);
  digest(value.probe_manifest_digest, `${label}.probe_manifest_digest`);
  id(value.report_id, `${label}.report_id`);
  digest(value.report_digest, `${label}.report_digest`);
  id(value.target_ref, `${label}.target_ref`);
  digest(value.target_digest, `${label}.target_digest`);
}

function validateComparisonMethod(value) {
  exactObject(value, 'Reward drift comparison_method', [
    'method_ref', 'method_digest', 'bounds_ref', 'bounds_digest'
  ]);
  id(value.method_ref, 'comparison_method.method_ref');
  digest(value.method_digest, 'comparison_method.method_digest');
  id(value.bounds_ref, 'comparison_method.bounds_ref');
  digest(value.bounds_digest, 'comparison_method.bounds_digest');
}

function validateMetricDeltas(values) {
  if (!Array.isArray(values) || values.length > METRICS.size) {
    throw new ValidationError(`metric_deltas must contain between 0 and ${METRICS.size} entries`);
  }
  const seen = new Set();
  for (const [index, value] of values.entries()) {
    exactObject(value, `metric_deltas[${index}]`, [
      'name', 'predecessor_value', 'candidate_value', 'delta'
    ]);
    enumValue(value.name, `metric_deltas[${index}].name`, METRICS);
    finiteNumber(value.predecessor_value, `metric_deltas[${index}].predecessor_value`);
    finiteNumber(value.candidate_value, `metric_deltas[${index}].candidate_value`);
    finiteNumber(value.delta, `metric_deltas[${index}].delta`);
    if (seen.has(value.name)) throw new ValidationError(`Duplicate reward drift metric ${value.name}`);
    seen.add(value.name);
  }
}

function validateSideEvidence(value, label) {
  exactObject(value, `Reward drift ${label} evidence`, ['manifest', 'report']);
  validateRewardProbeManifest(value.manifest);
  validateRewardCalibrationReport(value.report);
  const manifestDigest = rewardProbeManifestDigest(value.manifest);
  if (
    value.report.probe_manifest_id !== value.manifest.manifest_id
    || value.report.probe_manifest_digest !== manifestDigest
  ) {
    throw new ValidationError(`Reward drift ${label} calibration report does not bind its supplied probe manifest`);
  }
  if (
    value.report.target_ref !== value.manifest.target.target_ref
    || value.report.target_digest !== value.manifest.target.target_digest
  ) {
    throw new ValidationError(`Reward drift ${label} calibration report does not bind its supplied target`);
  }
  return value;
}

function bindSide(binding, side, label) {
  const manifestDigest = rewardProbeManifestDigest(side.manifest);
  const reportDigest = rewardCalibrationReportDigest(side.report);
  if (
    binding.probe_manifest_id !== side.manifest.manifest_id
    || binding.probe_manifest_digest !== manifestDigest
    || binding.report_id !== side.report.report_id
    || binding.report_digest !== reportDigest
    || binding.target_ref !== side.manifest.target.target_ref
    || binding.target_digest !== side.manifest.target.target_digest
  ) {
    throw new ValidationError(`Reward drift ${label} binding does not match supplied evidence`);
  }
}

function compatibilityReasons(predecessor, candidate) {
  const reasons = [];
  const pm = predecessor.manifest;
  const cm = candidate.manifest;
  const pr = predecessor.report;
  const cr = candidate.report;

  if (pm.probe_type !== cm.probe_type) reasons.push('probe-type-mismatch');
  if (pm.measurement_method !== cm.measurement_method) reasons.push('measurement-method-mismatch');
  if (pm.calibration.class !== cm.calibration.class) reasons.push('calibration-class-mismatch');
  if (!sameNormalization(pm.calibration, cm.calibration)) reasons.push('normalization-semantics-mismatch');
  if (pr.task_domain !== cr.task_domain) reasons.push('task-domain-mismatch');
  if (!sameMetricSet(pr.metrics, cr.metrics)) reasons.push('metric-set-mismatch');
  if (!supportsTargetComparison(pm, cm)) reasons.push('target-transfer-not-supported');

  return reasons;
}

function sameNormalization(left, right) {
  return left.normalization_rule_ref === right.normalization_rule_ref
    && sameRange(left.score_range, right.score_range);
}

function sameRange(left, right) {
  if (left === null || right === null) return left === right;
  return Array.isArray(left)
    && Array.isArray(right)
    && left.length === 2
    && right.length === 2
    && left[0] === right[0]
    && left[1] === right[1];
}

function sameMetricSet(left, right) {
  const a = left.map(item => item.name).sort();
  const b = right.map(item => item.name).sort();
  return a.length === b.length && a.every((name, index) => name === b[index]);
}

function supportsTargetComparison(predecessor, candidate) {
  if (predecessor.target.target_digest === candidate.target.target_digest) return true;
  return transferAllowsCrossTarget(predecessor) && transferAllowsCrossTarget(candidate);
}

function transferAllowsCrossTarget(manifest) {
  return manifest.transfer_scope === 'reviewed-cross-target'
    && Array.isArray(manifest.transfer_evidence_refs)
    && manifest.transfer_evidence_refs.length > 0;
}

function isInsufficient(report) {
  return report.sample_count < report.minimum_sample_count
    || report.calibration_status === 'insufficient-evidence';
}

function validateMetricBindings(deltas, predecessorReport, candidateReport) {
  const predecessorMetrics = new Map(predecessorReport.metrics.map(item => [item.name, item.value]));
  const candidateMetrics = new Map(candidateReport.metrics.map(item => [item.name, item.value]));
  for (const item of deltas) {
    if (!predecessorMetrics.has(item.name) || !candidateMetrics.has(item.name)) {
      throw new ValidationError(`Reward drift metric ${item.name} is absent from bound calibration evidence`);
    }
    const predecessorValue = predecessorMetrics.get(item.name);
    const candidateValue = candidateMetrics.get(item.name);
    if (!nearlyEqual(item.predecessor_value, predecessorValue)) {
      throw new ValidationError(`Reward drift predecessor value for ${item.name} does not match bound calibration evidence`);
    }
    if (!nearlyEqual(item.candidate_value, candidateValue)) {
      throw new ValidationError(`Reward drift candidate value for ${item.name} does not match bound calibration evidence`);
    }
    if (!nearlyEqual(item.delta, candidateValue - predecessorValue)) {
      throw new ValidationError(`Reward drift delta for ${item.name} does not match bound calibration evidence`);
    }
  }
}

function nearlyEqual(left, right) {
  if (Object.is(left, right)) return true;
  const scale = Math.max(1, Math.abs(left), Math.abs(right));
  return Math.abs(left - right) <= Number.EPSILON * 16 * scale;
}

function exactObject(value, label, allowedFields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${label} must be an object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new ValidationError(`${label} must be a plain object`);
  }
  const allowed = new Set(allowedFields);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ValidationError(`${label} contains unknown field ${key}`);
  }
  for (const key of allowedFields) {
    if (!Object.hasOwn(value, key)) throw new ValidationError(`${label} is missing required field ${key}`);
  }
}

function id(value, label) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) throw new ValidationError(`${label} is invalid`);
  return value;
}
function digest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) throw new ValidationError(`${label} is invalid`);
  return value;
}
function enumValue(value, label, allowed) {
  if (typeof value !== 'string' || !allowed.has(value)) throw new ValidationError(`${label} is invalid`);
  return value;
}
function finiteNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ValidationError(`${label} must be a finite number`);
  }
  return value;
}
function date(value, label) {
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
