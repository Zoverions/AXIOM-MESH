import { digestObject, ValidationError } from './canonical.mjs';
import {
  cognitiveLineageManifestDigest,
  resolveCognitiveLineageManifest,
  validateCognitiveLineageManifest
} from './cognitive-lineage-manifest.mjs';
import {
  cognitiveTopologyDigest,
  validateCognitiveTopology
} from './cognitive-topology.mjs';

export const REPLACEMENT_FIDELITY_EVALUATION_SCHEMA = 'axiom-replacement-fidelity-evaluation.v0';
export const SUPPORTED_FIDELITY_DIMENSIONS = Object.freeze([
  'capability-fidelity',
  'preference-fidelity',
  'behavioral-fidelity',
  'epistemic-fidelity',
  'safety-policy-fidelity',
  'style-personality-fidelity',
  'memory-use-fidelity',
  'relationship-fidelity',
  'robustness-fidelity'
]);

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const DIMENSIONS = new Set(SUPPORTED_FIDELITY_DIMENSIONS);
const CONFIDENCE = new Set(['low', 'medium', 'high', 'unknown']);
const DIMENSION_STATUS = new Set(['pass', 'degraded', 'fail', 'indeterminate']);
const AGGREGATE_CLASSES = new Set([
  'high-fidelity',
  'acceptable-with-degradation',
  'materially-degraded',
  'insufficient-evidence',
  'incompatible'
]);
const DEGRADED_RESULTS = new Set(['acceptable-with-degradation', 'materially-degraded']);
const FAIL_RESULTS = new Set(['materially-degraded', 'incompatible']);
const OWNER_ADDRESSABLE_WEIGHT_STATES = new Set(['open-acquired', 'local-proprietary']);

export function replacementFidelitySuiteDigest(suite) {
  if (!suite || typeof suite !== 'object' || Array.isArray(suite)) {
    throw new ValidationError('suite must be an object');
  }
  const allowed = new Set(['suite_id', 'suite_digest', 'required_dimensions', 'aggregation_rules']);
  for (const key of Object.keys(suite)) {
    if (!allowed.has(key)) throw new ValidationError(`suite contains unknown field ${key}`);
  }
  for (const key of ['suite_id', 'required_dimensions', 'aggregation_rules']) {
    if (!Object.hasOwn(suite, key)) throw new ValidationError(`suite is missing required field ${key}`);
  }
  validateSuiteDescriptor(suite);
  return digestObject({
    suite_id: suite.suite_id,
    required_dimensions: [...suite.required_dimensions],
    aggregation_rules: {
      degraded_result: suite.aggregation_rules.degraded_result,
      fail_result: suite.aggregation_rules.fail_result
    }
  });
}

export function validateReplacementFidelityEvaluation(document) {
  exactObject(document, 'Replacement fidelity evaluation', [
    'schema',
    'version',
    'status',
    'evaluation_id',
    'topology_id',
    'topology_digest',
    'reference',
    'candidate',
    'lineage',
    'suite',
    'dimensions',
    'aggregate_class',
    'evaluator_ref',
    'evaluated_at',
    'recorded_at',
    'contains_secret_material',
    'authority_effect',
    'network_effect',
    'runtime_activation'
  ]);

  if (
    document.schema !== REPLACEMENT_FIDELITY_EVALUATION_SCHEMA ||
    document.version !== 0 ||
    document.status !== 'inert-evidence'
  ) {
    throw new ValidationError('Replacement fidelity evaluation schema/version/status is invalid');
  }

  identifier(document.evaluation_id, 'evaluation_id');
  identifier(document.topology_id, 'topology_id');
  digest(document.topology_digest, 'topology_digest');
  endpoint(document.reference, 'reference');
  endpoint(document.candidate, 'candidate');
  validateLineageReference(document.lineage);
  validateSuite(document.suite);
  validateDimensions(document.dimensions);

  const dimensionIds = new Set(document.dimensions.map(item => item.dimension_id));
  for (const required of document.suite.required_dimensions) {
    if (!dimensionIds.has(required)) {
      throw new ValidationError(`Replacement fidelity evaluation is missing required dimension ${required}`);
    }
  }

  if (!AGGREGATE_CLASSES.has(document.aggregate_class)) {
    throw new ValidationError('aggregate_class is invalid');
  }
  const derivedAggregate = deriveReplacementFidelityClass(document.suite, document.dimensions);
  if (document.aggregate_class !== derivedAggregate) {
    throw new ValidationError(`aggregate_class ${document.aggregate_class} does not match derived aggregate ${derivedAggregate}`);
  }

  identifier(document.evaluator_ref, 'evaluator_ref');
  const evaluatedAt = timestamp(document.evaluated_at, 'evaluated_at');
  const recordedAt = timestamp(document.recorded_at, 'recorded_at');
  if (recordedAt < evaluatedAt) {
    throw new ValidationError('recorded_at cannot precede evaluated_at');
  }

  if (
    document.contains_secret_material !== false ||
    document.authority_effect !== 'none' ||
    document.network_effect !== 'none' ||
    document.runtime_activation !== false
  ) {
    throw new ValidationError('Replacement fidelity evaluation activation boundary must remain zero-effect');
  }

  return Object.freeze({
    valid: true,
    schema: REPLACEMENT_FIDELITY_EVALUATION_SCHEMA,
    evaluation_id: document.evaluation_id,
    topology_id: document.topology_id,
    reference_node_id: document.reference.node_id,
    candidate_node_id: document.candidate.node_id,
    aggregate_class: document.aggregate_class,
    required_dimensions: Object.freeze([...document.suite.required_dimensions]),
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  });
}

export function replacementFidelityEvaluationDigest(document) {
  validateReplacementFidelityEvaluation(document);
  return digestObject(document);
}

export function deriveReplacementFidelityClass(suite, dimensions) {
  validateSuite(suite);
  validateDimensions(dimensions);

  const byId = new Map(dimensions.map(item => [item.dimension_id, item]));
  const required = [];
  for (const dimensionId of suite.required_dimensions) {
    const item = byId.get(dimensionId);
    if (!item) {
      throw new ValidationError(`Replacement fidelity evaluation is missing required dimension ${dimensionId}`);
    }
    required.push(item);
  }

  if (required.some(item => item.status === 'fail')) {
    return suite.aggregation_rules.fail_result;
  }

  const hasDegraded = required.some(item => item.status === 'degraded');
  const hasIndeterminate = required.some(item => item.status === 'indeterminate');
  if (hasDegraded && suite.aggregation_rules.degraded_result === 'materially-degraded') {
    return 'materially-degraded';
  }
  if (hasIndeterminate) {
    return 'insufficient-evidence';
  }
  if (hasDegraded) {
    return suite.aggregation_rules.degraded_result;
  }
  return 'high-fidelity';
}

export function resolveReplacementFidelityEvaluation(document, topology, lineageManifests = []) {
  validateReplacementFidelityEvaluation(document);
  validateCognitiveTopology(topology);
  if (!Array.isArray(lineageManifests)) {
    throw new ValidationError('lineageManifests must be an array');
  }

  if (document.topology_id !== topology.topology_id) {
    throw new ValidationError('Replacement fidelity evaluation topology_id does not match Cognitive Topology');
  }
  const topologyDigest = cognitiveTopologyDigest(topology);
  if (document.topology_digest !== topologyDigest) {
    throw new ValidationError('Replacement fidelity evaluation topology digest does not match Cognitive Topology');
  }
  if (document.reference.node_id === document.candidate.node_id) {
    throw new ValidationError('Replacement fidelity reference and candidate must be different topology nodes');
  }

  const referenceNode = resolveEndpoint(document.reference, topology, 'reference');
  const candidateNode = resolveEndpoint(document.candidate, topology, 'candidate');
  const lineage = resolveOptionalLineage(document.lineage, topology, lineageManifests, document.reference, document.candidate);

  const reference = Object.freeze({
    node_id: document.reference.node_id,
    model_id: document.reference.model_id,
    artifact_digest: document.reference.artifact_digest,
    weight_state: referenceNode.weights.state,
    custody: referenceNode.custody
  });
  const candidate = Object.freeze({
    node_id: document.candidate.node_id,
    model_id: document.candidate.model_id,
    artifact_digest: document.candidate.artifact_digest,
    weight_state: candidateNode.weights.state,
    custody: candidateNode.custody
  });
  const dimensions = Object.freeze(document.dimensions.map(item => Object.freeze({
    dimension_id: item.dimension_id,
    metric_ref: item.metric_ref,
    metric_digest: item.metric_digest,
    measured_score: item.measured_score,
    thresholds: Object.freeze({ ...item.thresholds }),
    sample_count: item.sample_count,
    confidence: item.confidence,
    evidence_ref: item.evidence_ref,
    evidence_digest: item.evidence_digest,
    status: item.status
  })));

  return Object.freeze({
    valid: true,
    schema: REPLACEMENT_FIDELITY_EVALUATION_SCHEMA,
    evaluation_id: document.evaluation_id,
    topology_id: document.topology_id,
    topology_digest: document.topology_digest,
    reference,
    candidate,
    lineage,
    suite_id: document.suite.suite_id,
    suite_digest: document.suite.suite_digest,
    required_dimensions: Object.freeze([...document.suite.required_dimensions]),
    dimensions,
    aggregate_class: document.aggregate_class,
    evaluator_ref: document.evaluator_ref,
    evaluated_at: document.evaluated_at,
    recorded_at: document.recorded_at,
    evaluation_digest: replacementFidelityEvaluationDigest(document),
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false,
    proves_principal_continuity: false,
    proves_subjective_identity: false
  });
}

function validateSuite(suite) {
  exactObject(suite, 'suite', ['suite_id', 'suite_digest', 'required_dimensions', 'aggregation_rules']);
  validateSuiteDescriptor(suite);
  digest(suite.suite_digest, 'suite.suite_digest');
  const expectedDigest = replacementFidelitySuiteDigest(suite);
  if (suite.suite_digest !== expectedDigest) {
    throw new ValidationError('suite.suite_digest does not match the exact fidelity suite descriptor');
  }
}

function validateSuiteDescriptor(suite) {
  identifier(suite.suite_id, 'suite.suite_id');
  if (!Array.isArray(suite.required_dimensions) || suite.required_dimensions.length < 1 || suite.required_dimensions.length > SUPPORTED_FIDELITY_DIMENSIONS.length) {
    throw new ValidationError('suite.required_dimensions must contain between 1 and 9 supported dimensions');
  }

  const seen = new Set();
  for (const dimensionId of suite.required_dimensions) {
    if (typeof dimensionId !== 'string' || !DIMENSIONS.has(dimensionId)) {
      throw new ValidationError('suite.required_dimensions must contain only supported fidelity dimensions');
    }
    if (seen.has(dimensionId)) {
      throw new ValidationError('suite.required_dimensions must be unique');
    }
    seen.add(dimensionId);
  }
  const sorted = [...suite.required_dimensions].sort();
  if (sorted.some((value, index) => value !== suite.required_dimensions[index])) {
    throw new ValidationError('suite.required_dimensions must be sorted');
  }

  exactObject(suite.aggregation_rules, 'suite.aggregation_rules', ['degraded_result', 'fail_result']);
  if (!DEGRADED_RESULTS.has(suite.aggregation_rules.degraded_result)) {
    throw new ValidationError('suite.aggregation_rules.degraded_result is invalid');
  }
  if (!FAIL_RESULTS.has(suite.aggregation_rules.fail_result)) {
    throw new ValidationError('suite.aggregation_rules.fail_result is invalid');
  }
}

function validateDimensions(dimensions) {
  if (!Array.isArray(dimensions) || dimensions.length < 1 || dimensions.length > SUPPORTED_FIDELITY_DIMENSIONS.length) {
    throw new ValidationError('dimensions must contain between 1 and 9 entries');
  }

  const seen = new Set();
  for (const item of dimensions) {
    exactObject(item, 'fidelity dimension', [
      'dimension_id',
      'metric_ref',
      'metric_digest',
      'measured_score',
      'thresholds',
      'sample_count',
      'confidence',
      'evidence_ref',
      'evidence_digest',
      'status'
    ]);
    if (typeof item.dimension_id !== 'string' || !DIMENSIONS.has(item.dimension_id)) {
      throw new ValidationError('fidelity dimension dimension_id must be supported');
    }
    if (seen.has(item.dimension_id)) {
      throw new ValidationError(`dimensions contains duplicate dimension ${item.dimension_id}`);
    }
    seen.add(item.dimension_id);

    identifier(item.metric_ref, 'fidelity dimension metric_ref');
    digest(item.metric_digest, 'fidelity dimension metric_digest');
    exactObject(item.thresholds, 'fidelity dimension thresholds', ['degraded_min', 'pass_min']);
    boundedScore(item.thresholds.degraded_min, 'fidelity dimension thresholds.degraded_min');
    boundedScore(item.thresholds.pass_min, 'fidelity dimension thresholds.pass_min');
    if (item.thresholds.degraded_min > item.thresholds.pass_min) {
      throw new ValidationError('fidelity dimension threshold degraded_min cannot exceed pass_min');
    }
    if (!Number.isInteger(item.sample_count) || item.sample_count < 0 || item.sample_count > 1_000_000) {
      throw new ValidationError('fidelity dimension sample_count must be an integer from 0 through 1000000');
    }
    if (!CONFIDENCE.has(item.confidence)) {
      throw new ValidationError('fidelity dimension confidence is invalid');
    }
    identifier(item.evidence_ref, 'fidelity dimension evidence_ref');
    digest(item.evidence_digest, 'fidelity dimension evidence_digest');
    if (!DIMENSION_STATUS.has(item.status)) {
      throw new ValidationError('fidelity dimension status is invalid');
    }

    if (item.measured_score === null) {
      if (item.status !== 'indeterminate') {
        throw new ValidationError('fidelity dimension measured_score null requires indeterminate status');
      }
      if (item.sample_count !== 0 || item.confidence !== 'unknown') {
        throw new ValidationError('indeterminate fidelity dimension requires sample_count 0 and confidence unknown');
      }
      continue;
    }

    boundedScore(item.measured_score, 'fidelity dimension measured_score');
    if (item.status === 'indeterminate') {
      throw new ValidationError('fidelity dimension measured_score must be null for indeterminate status');
    }
    const expectedStatus = item.measured_score >= item.thresholds.pass_min
      ? 'pass'
      : item.measured_score >= item.thresholds.degraded_min
        ? 'degraded'
        : 'fail';
    if (item.status !== expectedStatus) {
      throw new ValidationError(`fidelity dimension status ${item.status} does not agree with measured score thresholds`);
    }
  }
}

function resolveOptionalLineage(reference, topology, manifests, expectedSource, expectedDestination) {
  if (reference === null) return null;

  const ids = new Set();
  for (const manifest of manifests) {
    validateCognitiveLineageManifest(manifest);
    if (ids.has(manifest.lineage_id)) {
      throw new ValidationError(`Duplicate cognitive lineage manifest ${manifest.lineage_id}`);
    }
    ids.add(manifest.lineage_id);
  }

  const manifest = manifests.find(item => item.lineage_id === reference.lineage_id);
  if (!manifest) {
    throw new ValidationError(`Referenced lineage ${reference.lineage_id} was not supplied`);
  }
  const actualDigest = cognitiveLineageManifestDigest(manifest);
  if (reference.lineage_digest !== actualDigest) {
    throw new ValidationError('Referenced lineage digest does not match supplied Cognitive Lineage Manifest');
  }

  const resolved = resolveCognitiveLineageManifest(manifest, topology);
  if (
    resolved.source.node_id !== expectedSource.node_id ||
    resolved.source.model_id !== expectedSource.model_id ||
    resolved.source.artifact_digest !== expectedSource.artifact_digest ||
    resolved.destination.node_id !== expectedDestination.node_id ||
    resolved.destination.model_id !== expectedDestination.model_id ||
    resolved.destination.artifact_digest !== expectedDestination.artifact_digest
  ) {
    throw new ValidationError('Referenced lineage does not bind the exact fidelity reference and candidate pair');
  }

  return Object.freeze({
    lineage_id: resolved.lineage_id,
    lineage_digest: actualDigest,
    relationship: resolved.relationship
  });
}

function validateLineageReference(value) {
  if (value === null) return;
  exactObject(value, 'lineage', ['lineage_id', 'lineage_digest']);
  identifier(value.lineage_id, 'lineage.lineage_id');
  digest(value.lineage_digest, 'lineage.lineage_digest');
}

function resolveEndpoint(value, topology, label) {
  const node = topology.nodes.find(candidate => candidate.node_id === value.node_id);
  if (!node) {
    throw new ValidationError(`Replacement fidelity ${label} node_id ${value.node_id} is not declared in Cognitive Topology`);
  }
  if (value.model_id !== node.model_id) {
    throw new ValidationError(`Replacement fidelity ${label} model_id does not match Cognitive Topology node model`);
  }
  if (OWNER_ADDRESSABLE_WEIGHT_STATES.has(node.weights.state)) {
    if (value.artifact_digest !== node.weights.artifact_digest) {
      throw new ValidationError(`Replacement fidelity ${label} artifact_digest does not match Cognitive Topology node artifact`);
    }
  } else if (value.artifact_digest !== null) {
    throw new ValidationError(`Replacement fidelity ${label} artifact_digest must be null for a non-owner-addressable topology node`);
  }
  return node;
}

function endpoint(value, label) {
  exactObject(value, label, ['node_id', 'model_id', 'artifact_digest']);
  identifier(value.node_id, `${label}.node_id`);
  identifier(value.model_id, `${label}.model_id`);
  nullableDigest(value.artifact_digest, `${label}.artifact_digest`);
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

function identifier(value, label) {
  if (typeof value !== 'string' || !ID.test(value)) {
    throw new ValidationError(`${label} is invalid`);
  }
  return value;
}

function digest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) {
    throw new ValidationError(`${label} must be a lowercase 64-hex digest`);
  }
  return value;
}

function nullableDigest(value, label) {
  if (value === null) return null;
  return digest(value, label);
}

function boundedScore(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new ValidationError(`${label} must be a finite number from 0 through 1`);
  }
  return value;
}

function timestamp(value, label) {
  if (typeof value !== 'string') {
    throw new ValidationError(`${label} must be a canonical ISO timestamp`);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new ValidationError(`${label} must be a canonical ISO timestamp`);
  }
  return parsed.getTime();
}
