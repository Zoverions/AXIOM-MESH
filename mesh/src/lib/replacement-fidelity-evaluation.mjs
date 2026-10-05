import { digestObject, ValidationError } from './canonical.mjs';
import { resolveCognitiveLineageManifest } from './cognitive-lineage-manifest.mjs';
import {
  cognitiveTopologyDigest,
  validateCognitiveTopology
} from './cognitive-topology.mjs';

export const REPLACEMENT_FIDELITY_EVALUATION_SCHEMA = 'axiom-replacement-fidelity-evaluation.v0';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const DIMENSIONS = new Set([
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
const RESULTS = new Set(['pass', 'degraded', 'fail', 'indeterminate']);
const AGGREGATES = new Set([
  'high-fidelity',
  'acceptable-with-degradation',
  'materially-degraded',
  'insufficient-evidence',
  'incompatible'
]);

export function validateReplacementFidelityEvaluation(document) {
  validateEvaluationShape(document);
  return Object.freeze({
    valid: true,
    schema: document.schema,
    version: document.version,
    status: document.status,
    evaluation_id: document.evaluation_id,
    topology_id: document.topology_id,
    topology_digest: document.topology_digest,
    aggregate_fidelity: document.aggregate_fidelity,
    confidence: document.confidence,
    required_dimensions: Object.freeze([...document.required_dimensions]),
    evaluation_digest: digestObject(document),
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false,
    candidate_active: false,
    grants_execution_authority: false,
    proves_principal_continuity: false,
    proves_subjective_identity: false
  });
}

export function replacementFidelityEvaluationDigest(document) {
  validateEvaluationShape(document);
  return digestObject(document);
}

export function resolveReplacementFidelityEvaluation(document, topology, lineageManifest = null) {
  const validated = validateReplacementFidelityEvaluation(document);
  validateCognitiveTopology(topology);

  if (document.topology_id !== topology.topology_id) {
    throw new ValidationError(
      'Replacement fidelity evaluation topology_id does not match the bound Cognitive Topology'
    );
  }
  const expectedTopologyDigest = cognitiveTopologyDigest(topology);
  if (document.topology_digest !== expectedTopologyDigest) {
    throw new ValidationError(
      'Replacement fidelity evaluation topology digest does not match the bound Cognitive Topology'
    );
  }

  const referenceNode = topology.nodes.find(node => node.node_id === document.reference.node_id);
  if (!referenceNode) {
    throw new ValidationError(
      `Replacement fidelity reference node_id ${document.reference.node_id} is not declared in the bound Cognitive Topology`
    );
  }
  if (referenceNode.model_id !== document.reference.model_id) {
    throw new ValidationError(
      'Replacement fidelity reference model_id does not match the bound Cognitive Topology node'
    );
  }
  if (referenceNode.weights.artifact_digest !== document.reference.artifact_digest) {
    throw new ValidationError(
      'Replacement fidelity reference artifact digest does not match the bound Cognitive Topology node'
    );
  }

  let lineageVerified = false;
  if (lineageManifest !== null) {
    const lineage = resolveCognitiveLineageManifest(lineageManifest, topology);
    if (document.candidate.lineage_id !== lineage.lineage_id) {
      throw new ValidationError('Replacement fidelity candidate lineage_id does not match supplied lineage');
    }
    if (
      document.reference.node_id !== lineage.reference.node_id
      || document.reference.model_id !== lineage.reference.model_id
      || document.reference.artifact_digest !== lineage.reference.artifact_digest
    ) {
      throw new ValidationError('Replacement fidelity reference does not match supplied lineage');
    }
    if (
      document.candidate.model_id !== lineage.candidate.model_id
      || document.candidate.artifact_digest !== lineage.candidate.artifact_digest
    ) {
      throw new ValidationError('Replacement fidelity candidate does not match supplied lineage');
    }
    lineageVerified = true;
  }

  return deepFreeze({
    valid: true,
    schema: REPLACEMENT_FIDELITY_EVALUATION_SCHEMA,
    evaluation_id: document.evaluation_id,
    topology_id: document.topology_id,
    topology_digest: document.topology_digest,
    reference: { ...document.reference },
    candidate: { ...document.candidate },
    evaluator: { ...document.evaluator },
    suite: { ...document.suite },
    dimensions: document.dimensions.map(item => ({ ...item })),
    required_dimensions: [...document.required_dimensions],
    aggregate_fidelity: document.aggregate_fidelity,
    confidence: document.confidence,
    evaluated_at: document.evaluated_at,
    recorded_at: document.recorded_at,
    lineage_verified: lineageVerified,
    candidate_active: false,
    grants_execution_authority: false,
    proves_principal_continuity: false,
    proves_subjective_identity: false,
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false,
    evaluation_digest: validated.evaluation_digest
  });
}

function validateEvaluationShape(document) {
  exactObject(document, 'Replacement fidelity evaluation', [
    'schema',
    'version',
    'status',
    'evaluation_id',
    'topology_id',
    'topology_digest',
    'reference',
    'candidate',
    'evaluator',
    'suite',
    'dimensions',
    'required_dimensions',
    'aggregate_fidelity',
    'confidence',
    'evaluated_at',
    'recorded_at',
    'contains_secret_material',
    'authority_effect',
    'network_effect',
    'runtime_activation'
  ]);

  if (
    document.schema !== REPLACEMENT_FIDELITY_EVALUATION_SCHEMA
    || document.version !== 0
    || document.status !== 'inert-evidence'
  ) {
    throw new ValidationError('Replacement fidelity evaluation schema/version/status is invalid');
  }

  id(document.evaluation_id, 'evaluation_id');
  id(document.topology_id, 'topology_id');
  digest(document.topology_digest, 'topology_digest');
  validateReference(document.reference);
  validateCandidate(document.candidate);
  validateEvaluator(document.evaluator);
  validateSuite(document.suite);
  validateDimensions(document.dimensions);
  validateRequiredDimensions(document.required_dimensions, document.dimensions);
  enumValue(document.aggregate_fidelity, 'aggregate_fidelity', AGGREGATES);
  confidence(document.confidence);
  validateAggregate(document.aggregate_fidelity, document.required_dimensions, document.dimensions);

  const evaluatedAt = date(document.evaluated_at, 'evaluated_at');
  const recordedAt = date(document.recorded_at, 'recorded_at');
  if (recordedAt < evaluatedAt) {
    throw new ValidationError('recorded_at cannot precede evaluated_at');
  }

  if (
    document.contains_secret_material !== false
    || document.authority_effect !== 'none'
    || document.network_effect !== 'none'
    || document.runtime_activation !== false
  ) {
    throw new ValidationError('Replacement fidelity evaluation activation boundary is invalid');
  }

  return document;
}

function validateReference(value) {
  exactObject(value, 'Replacement fidelity reference', [
    'node_id',
    'model_id',
    'artifact_digest'
  ]);
  id(value.node_id, 'reference.node_id');
  id(value.model_id, 'reference.model_id');
  nullableDigest(value.artifact_digest, 'reference.artifact_digest');
}

function validateCandidate(value) {
  exactObject(value, 'Replacement fidelity candidate', [
    'model_id',
    'artifact_digest',
    'lineage_id'
  ]);
  id(value.model_id, 'candidate.model_id');
  nullableDigest(value.artifact_digest, 'candidate.artifact_digest');
  nullableId(value.lineage_id, 'candidate.lineage_id');
}

function validateEvaluator(value) {
  exactObject(value, 'Replacement fidelity evaluator', [
    'evaluator_kind',
    'evaluator_ref',
    'evaluator_principal_ref'
  ]);
  id(value.evaluator_kind, 'evaluator.evaluator_kind');
  id(value.evaluator_ref, 'evaluator.evaluator_ref');
  id(value.evaluator_principal_ref, 'evaluator.evaluator_principal_ref');
}

function validateSuite(value) {
  exactObject(value, 'Replacement fidelity suite', [
    'suite_ref',
    'suite_digest',
    'metric_set_ref',
    'metric_set_digest'
  ]);
  id(value.suite_ref, 'suite.suite_ref');
  digest(value.suite_digest, 'suite.suite_digest');
  id(value.metric_set_ref, 'suite.metric_set_ref');
  digest(value.metric_set_digest, 'suite.metric_set_digest');
}

function validateDimensions(values) {
  if (!Array.isArray(values) || values.length < 1 || values.length > 32) {
    throw new ValidationError('dimensions must contain between 1 and 32 entries');
  }
  const seen = new Set();
  for (const [index, value] of values.entries()) {
    exactObject(value, `Replacement fidelity dimension ${index}`, [
      'dimension',
      'result',
      'observed_metric_ref',
      'observed_metric_digest',
      'threshold_ref',
      'threshold_digest',
      'evidence_ref',
      'evidence_digest'
    ]);
    enumValue(value.dimension, `dimensions[${index}].dimension`, DIMENSIONS);
    enumValue(value.result, `dimensions[${index}].result`, RESULTS);
    id(value.observed_metric_ref, `dimensions[${index}].observed_metric_ref`);
    digest(value.observed_metric_digest, `dimensions[${index}].observed_metric_digest`);
    id(value.threshold_ref, `dimensions[${index}].threshold_ref`);
    digest(value.threshold_digest, `dimensions[${index}].threshold_digest`);
    id(value.evidence_ref, `dimensions[${index}].evidence_ref`);
    digest(value.evidence_digest, `dimensions[${index}].evidence_digest`);
    if (seen.has(value.dimension)) {
      throw new ValidationError(`Duplicate replacement fidelity dimension ${value.dimension}`);
    }
    seen.add(value.dimension);
  }
}

function validateRequiredDimensions(values, dimensions) {
  if (!Array.isArray(values) || values.length < 1 || values.length > DIMENSIONS.size) {
    throw new ValidationError('required_dimensions must contain between 1 and 9 entries');
  }
  const seen = new Set();
  const present = new Set(dimensions.map(item => item.dimension));
  for (const [index, value] of values.entries()) {
    enumValue(value, `required_dimensions[${index}]`, DIMENSIONS);
    if (seen.has(value)) {
      throw new ValidationError(`Duplicate required replacement fidelity dimension ${value}`);
    }
    if (!present.has(value)) {
      throw new ValidationError(`Required replacement fidelity dimension ${value} is absent from dimensions`);
    }
    seen.add(value);
  }
}

function validateAggregate(aggregate, required, dimensions) {
  const results = new Map(dimensions.map(item => [item.dimension, item.result]));
  const requiredResults = required.map(name => results.get(name));

  if (requiredResults.includes('indeterminate')) {
    if (aggregate !== 'insufficient-evidence') {
      throw new ValidationError('Required indeterminate fidelity evidence requires insufficient-evidence');
    }
    return;
  }
  if (requiredResults.includes('fail')) {
    if (aggregate !== 'materially-degraded' && aggregate !== 'incompatible') {
      throw new ValidationError('Required fidelity failure requires materially-degraded or incompatible');
    }
    return;
  }
  if (requiredResults.includes('degraded')) {
    if (aggregate !== 'acceptable-with-degradation') {
      throw new ValidationError('Required degraded fidelity evidence requires acceptable-with-degradation');
    }
    return;
  }
  if (aggregate !== 'high-fidelity') {
    throw new ValidationError('Passing required fidelity evidence requires high-fidelity');
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
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) {
    throw new ValidationError(`${label} is invalid`);
  }
  return value;
}

function nullableId(value, label) {
  if (value === null) return null;
  return id(value, label);
}

function digest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) {
    throw new ValidationError(`${label} is invalid`);
  }
  return value;
}

function nullableDigest(value, label) {
  if (value === null) return null;
  return digest(value, label);
}

function enumValue(value, label, allowed) {
  if (typeof value !== 'string' || !allowed.has(value)) {
    throw new ValidationError(`${label} is invalid`);
  }
  return value;
}

function confidence(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new ValidationError('confidence must be a finite number from 0 through 1');
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
