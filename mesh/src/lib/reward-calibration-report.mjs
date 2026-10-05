import { digestObject, ValidationError } from './canonical.mjs';
import {
  rewardProbeManifestDigest,
  validateRewardProbeManifest
} from './reward-probe-manifest.mjs';
import {
  rewardIntrospectionObservationDigest,
  validateRewardIntrospectionObservation
} from './reward-introspection-observation.mjs';

export const REWARD_CALIBRATION_REPORT_SCHEMA = 'axiom-reward-calibration-report.v0';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const SOURCE_CLASSES = new Set([
  'benchmark-harness',
  'deterministic-checker',
  'human-adjudication',
  'independent-verifier',
  'other-reviewed'
]);
const OUTCOMES = new Set(['success', 'failure']);
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
const CALIBRATION_STATUSES = new Set([
  'calibrated',
  'miscalibrated',
  'mixed',
  'insufficient-evidence',
  'incompatible'
]);

export function validateRewardCalibrationReport(document) {
  validateReportShape(document);
  return deepFreeze({
    valid: true,
    schema: document.schema,
    version: document.version,
    status: document.status,
    report_id: document.report_id,
    probe_manifest_id: document.probe_manifest_id,
    probe_manifest_digest: document.probe_manifest_digest,
    target_ref: document.target_ref,
    target_digest: document.target_digest,
    sample_count: document.sample_count,
    minimum_sample_count: document.minimum_sample_count,
    calibration_status: document.calibration_status,
    report_digest: digestObject(document),
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    credential_visibility: 'none',
    runtime_activation: false,
    routing_effect: 'none',
    promotion_effect: 'evidence-only'
  });
}

export function rewardCalibrationReportDigest(document) {
  validateReportShape(document);
  return digestObject(document);
}

export function resolveRewardCalibrationReport(document, manifest, observations) {
  const validated = validateRewardCalibrationReport(document);
  validateRewardProbeManifest(manifest);
  const manifestDigest = rewardProbeManifestDigest(manifest);

  if (document.probe_manifest_id !== manifest.manifest_id) {
    throw new ValidationError('Reward calibration report manifest_id does not match supplied manifest');
  }
  if (document.probe_manifest_digest !== manifestDigest) {
    throw new ValidationError('Reward calibration report manifest digest does not match supplied manifest');
  }
  if (
    document.target_ref !== manifest.target.target_ref
    || document.target_digest !== manifest.target.target_digest
  ) {
    throw new ValidationError('Reward calibration report target does not match supplied manifest target');
  }

  if (!Array.isArray(observations) || observations.length !== document.sample_count) {
    throw new ValidationError('Reward calibration report supplied observations must exactly match sample_count');
  }

  const suppliedById = new Map();
  const suppliedDigests = new Set();
  for (const item of observations) {
    validateRewardIntrospectionObservation(item);
    if (
      item.probe_manifest_id !== manifest.manifest_id
      || item.probe_manifest_digest !== manifestDigest
    ) {
      throw new ValidationError('Reward calibration observation does not bind the supplied manifest');
    }
    if (
      item.target_ref !== manifest.target.target_ref
      || item.target_digest !== manifest.target.target_digest
    ) {
      throw new ValidationError('Reward calibration observation target does not bind the supplied manifest target');
    }
    const itemDigest = rewardIntrospectionObservationDigest(item);
    if (suppliedById.has(item.observation_id) || suppliedDigests.has(itemDigest)) {
      throw new ValidationError('Reward calibration supplied observations contain duplicate identity or digest');
    }
    suppliedById.set(item.observation_id, { item, digest: itemDigest });
    suppliedDigests.add(itemDigest);
  }

  for (const pair of document.observation_refs) {
    const supplied = suppliedById.get(pair.observation_id);
    if (!supplied || supplied.digest !== pair.observation_digest) {
      throw new ValidationError('Reward calibration observation reference does not match supplied observation evidence');
    }
  }

  validateVerifierIndependence(document.verification_source, manifest);

  if (
    document.metrics.some(item => item.name === 'calibration-error')
    && manifest.calibration.class !== 'calibrated-probabilistic'
  ) {
    throw new ValidationError('calibration-error metric requires calibrated-probabilistic reward probe evidence');
  }

  return deepFreeze({
    valid: true,
    schema: REWARD_CALIBRATION_REPORT_SCHEMA,
    report_id: document.report_id,
    report_digest: validated.report_digest,
    probe_manifest_id: document.probe_manifest_id,
    probe_manifest_digest: document.probe_manifest_digest,
    target_ref: document.target_ref,
    target_digest: document.target_digest,
    evaluation_set_ref: document.evaluation_set_ref,
    evaluation_set_digest: document.evaluation_set_digest,
    task_domain: document.task_domain,
    sample_count: document.sample_count,
    minimum_sample_count: document.minimum_sample_count,
    inclusion_rule_ref: document.inclusion_rule_ref,
    inclusion_rule_digest: document.inclusion_rule_digest,
    verification_source: { ...document.verification_source },
    observation_refs: document.observation_refs.map(item => ({ ...item })),
    metrics: document.metrics.map(item => ({ ...item })),
    calibration_status: document.calibration_status,
    evaluated_from: document.evaluated_from,
    evaluated_to: document.evaluated_to,
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

function validateReportShape(document) {
  exactObject(document, 'Reward calibration report', [
    'schema',
    'version',
    'status',
    'report_id',
    'probe_manifest_id',
    'probe_manifest_digest',
    'target_ref',
    'target_digest',
    'evaluation_set_ref',
    'evaluation_set_digest',
    'task_domain',
    'sample_count',
    'minimum_sample_count',
    'inclusion_rule_ref',
    'inclusion_rule_digest',
    'verification_source',
    'observation_refs',
    'metrics',
    'calibration_status',
    'evaluated_from',
    'evaluated_to',
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
    document.schema !== REWARD_CALIBRATION_REPORT_SCHEMA
    || document.version !== 0
    || document.status !== 'inert-evidence'
  ) {
    throw new ValidationError('Reward calibration report schema/version/status is invalid');
  }

  id(document.report_id, 'report_id');
  id(document.probe_manifest_id, 'probe_manifest_id');
  digest(document.probe_manifest_digest, 'probe_manifest_digest');
  id(document.target_ref, 'target_ref');
  digest(document.target_digest, 'target_digest');
  id(document.evaluation_set_ref, 'evaluation_set_ref');
  digest(document.evaluation_set_digest, 'evaluation_set_digest');
  id(document.task_domain, 'task_domain');
  positiveInteger(document.sample_count, 'sample_count');
  positiveInteger(document.minimum_sample_count, 'minimum_sample_count');
  id(document.inclusion_rule_ref, 'inclusion_rule_ref');
  digest(document.inclusion_rule_digest, 'inclusion_rule_digest');
  validateVerificationSource(document.verification_source);
  validateObservationPairs(document.observation_refs);
  if (document.sample_count !== document.observation_refs.length) {
    throw new ValidationError('sample_count must equal observation_refs length');
  }
  validateMetrics(document.metrics);
  enumValue(document.calibration_status, 'calibration_status', CALIBRATION_STATUSES);
  if (
    document.sample_count < document.minimum_sample_count
    && document.calibration_status !== 'insufficient-evidence'
  ) {
    throw new ValidationError('Insufficient reward calibration samples require insufficient-evidence status');
  }

  const from = date(document.evaluated_from, 'evaluated_from');
  const to = date(document.evaluated_to, 'evaluated_to');
  const recorded = date(document.recorded_at, 'recorded_at');
  if (to < from) throw new ValidationError('evaluated_to cannot precede evaluated_from');
  if (recorded < to) throw new ValidationError('recorded_at cannot precede evaluated_to');

  if (
    document.contains_secret_material !== false
    || document.authority_effect !== 'none'
    || document.network_effect !== 'none'
    || document.credential_visibility !== 'none'
    || document.runtime_activation !== false
    || document.routing_effect !== 'none'
    || document.promotion_effect !== 'evidence-only'
  ) {
    throw new ValidationError('Reward calibration report effect boundary is invalid');
  }
  return document;
}

function validateVerificationSource(value) {
  exactObject(value, 'Reward calibration verification source', [
    'source_class', 'source_ref', 'source_digest', 'principal_ref', 'independent_from_probe'
  ]);
  enumValue(value.source_class, 'verification_source.source_class', SOURCE_CLASSES);
  id(value.source_ref, 'verification_source.source_ref');
  digest(value.source_digest, 'verification_source.source_digest');
  id(value.principal_ref, 'verification_source.principal_ref');
  if (value.independent_from_probe !== true) {
    throw new ValidationError('verification_source.independent_from_probe must be true');
  }
}

function validateObservationPairs(values) {
  if (!Array.isArray(values) || values.length < 1 || values.length > 100000) {
    throw new ValidationError('observation_refs must contain between 1 and 100000 entries');
  }
  const ids = new Set();
  const digests = new Set();
  for (const [index, value] of values.entries()) {
    exactObject(value, `observation_refs[${index}]`, [
      'observation_id', 'observation_digest', 'outcome', 'outcome_ref', 'outcome_digest'
    ]);
    id(value.observation_id, `observation_refs[${index}].observation_id`);
    digest(value.observation_digest, `observation_refs[${index}].observation_digest`);
    enumValue(value.outcome, `observation_refs[${index}].outcome`, OUTCOMES);
    id(value.outcome_ref, `observation_refs[${index}].outcome_ref`);
    digest(value.outcome_digest, `observation_refs[${index}].outcome_digest`);
    if (ids.has(value.observation_id) || digests.has(value.observation_digest)) {
      throw new ValidationError('observation_refs contains duplicate observation identity or digest');
    }
    ids.add(value.observation_id);
    digests.add(value.observation_digest);
  }
}

function validateMetrics(values) {
  if (!Array.isArray(values) || values.length < 1 || values.length > METRICS.size) {
    throw new ValidationError(`metrics must contain between 1 and ${METRICS.size} entries`);
  }
  const seen = new Set();
  for (const [index, value] of values.entries()) {
    exactObject(value, `metrics[${index}]`, ['name', 'value']);
    enumValue(value.name, `metrics[${index}].name`, METRICS);
    finiteNumber(value.value, `metrics[${index}].value`);
    if (seen.has(value.name)) throw new ValidationError(`Duplicate reward calibration metric ${value.name}`);
    seen.add(value.name);
  }
}

function validateVerifierIndependence(source, manifest) {
  if (source.independent_from_probe !== true) {
    throw new ValidationError('Reward calibration verifier must be independent from the probe');
  }
  const aliases = new Set([
    manifest.manifest_id,
    manifest.target.target_ref,
    manifest.target.node_id,
    manifest.target.model_id,
    manifest.target.profile_id,
    manifest.target.offering_ref,
    manifest.target.catalog_entry_id
  ].filter(value => value !== null && value !== undefined));
  if (aliases.has(source.principal_ref) || aliases.has(source.source_ref)) {
    throw new ValidationError('Reward calibration verification source aliases probe or cognitive target identity');
  }
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
function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 100000) {
    throw new ValidationError(`${label} must be a positive bounded integer`);
  }
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