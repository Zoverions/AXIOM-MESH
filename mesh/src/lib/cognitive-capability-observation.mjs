import { digestObject, ValidationError } from './canonical.mjs';
import {
  cognitiveCapabilityProfileDigest,
  validateCognitiveCapabilityProfile
} from './cognitive-capability-profile.mjs';

export const COGNITIVE_CAPABILITY_OBSERVATION_SCHEMA =
  'axiom-cognitive-capability-observation.v0';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const UNIT = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,63}$/;

const CAPABILITIES = new Set([
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
const DIFFICULTIES = new Set([
  'trivial',
  'routine',
  'challenging',
  'expert',
  'adversarial',
  'unknown'
]);
const CLASSIFICATIONS = new Set(['pass', 'degraded', 'fail', 'indeterminate']);
const EVALUATOR_KINDS = new Set([
  'local-agent',
  'local-service',
  'remote-service',
  'human-reviewer',
  'provider',
  'external-verifier',
  'synthetic-harness'
]);
const EVIDENCE_KINDS = new Set([
  'evaluation-run',
  'signed-evaluation-run',
  'human-review',
  'external-observation',
  'provider-report',
  'synthetic-probe-result',
  'other'
]);
const ASSURANCE_CLASSES = new Set([
  'declared',
  'signed',
  'verified-local',
  'corroborated'
]);
const RESOURCE_CLASSES = new Set([
  'input-tokens',
  'output-tokens',
  'compute-time',
  'wall-time',
  'energy',
  'memory',
  'storage',
  'network-transfer',
  'currency',
  'other'
]);
const RESOURCE_BASES = new Set(['observed', 'estimated', 'unknown']);

export function validateCognitiveCapabilityObservation(document) {
  validateObservationShape(document);
  return Object.freeze({
    valid: true,
    schema: COGNITIVE_CAPABILITY_OBSERVATION_SCHEMA,
    observation_id: document.observation_id,
    profile_id: document.profile_id,
    capability: document.capability,
    classification: document.result.classification,
    confidence: document.result.confidence,
    resource_observations: document.resource_observations.length,
    observation_digest: digestObject(document),
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    training_effect: 'none',
    spend_effect: 'none',
    runtime_activation: false,
    selection_effect: 'evidence-only'
  });
}

export function cognitiveCapabilityObservationDigest(document) {
  validateObservationShape(document);
  return digestObject(document);
}

export function resolveCognitiveCapabilityObservation(document, profile) {
  const observation = validateCognitiveCapabilityObservation(document);
  const profileSummary = validateCognitiveCapabilityProfile(profile);
  const profileDigest = cognitiveCapabilityProfileDigest(profile);

  if (document.profile_id !== profile.profile_id) {
    throw new ValidationError(
      'Capability observation profile_id does not match supplied Cognitive Capability Profile'
    );
  }
  if (document.profile_digest !== profileDigest) {
    throw new ValidationError(
      'Capability observation profile_digest does not match supplied Cognitive Capability Profile'
    );
  }
  if (!profile.capabilities.includes(document.capability)) {
    throw new ValidationError(
      'Capability observation capability is not declared by supplied Cognitive Capability Profile'
    );
  }

  return deepFreeze({
    valid: true,
    schema: COGNITIVE_CAPABILITY_OBSERVATION_SCHEMA,
    observation_id: document.observation_id,
    observation_digest: observation.observation_digest,
    profile_id: profile.profile_id,
    profile_digest: profileDigest,
    offering_ref: profileSummary.offering_ref,
    capability: document.capability,
    context: { ...document.context },
    evaluation: { ...document.evaluation },
    result: {
      ...document.result,
      failure_mode_refs: [...document.result.failure_mode_refs]
    },
    evaluator: { ...document.evaluator },
    evidence: { ...document.evidence },
    resource_observations: document.resource_observations.map(item => ({ ...item })),
    observed_at: document.observed_at,
    valid_until: document.valid_until,
    recorded_at: document.recorded_at,
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    training_effect: 'none',
    spend_effect: 'none',
    runtime_activation: false,
    selection_effect: 'evidence-only'
  });
}

function validateObservationShape(document) {
  exactObject(document, 'Capability observation', [
    'schema',
    'version',
    'status',
    'observation_id',
    'profile_id',
    'profile_digest',
    'capability',
    'context',
    'evaluation',
    'result',
    'evaluator',
    'evidence',
    'resource_observations',
    'observed_at',
    'valid_until',
    'recorded_at',
    'contains_secret_material',
    'authority_effect',
    'network_effect',
    'training_effect',
    'spend_effect',
    'runtime_activation',
    'selection_effect'
  ]);

  if (
    document.schema !== COGNITIVE_CAPABILITY_OBSERVATION_SCHEMA
    || document.version !== 0
    || document.status !== 'inert-evidence'
  ) {
    throw new ValidationError('Capability observation schema/version/status is invalid');
  }

  id(document.observation_id, 'observation_id');
  id(document.profile_id, 'profile_id');
  digest(document.profile_digest, 'profile_digest');
  enumValue(document.capability, 'capability', CAPABILITIES);
  validateContext(document.context);
  validateEvaluation(document.evaluation);
  validateResult(document.result);
  validateEvaluator(document.evaluator);
  validateEvidence(document.evidence);
  validateResourceObservations(document.resource_observations);

  const observedAt = date(document.observed_at, 'observed_at');
  const validUntil = date(document.valid_until, 'valid_until');
  const recordedAt = date(document.recorded_at, 'recorded_at');
  if (validUntil < observedAt) {
    throw new ValidationError('valid_until cannot precede observed_at');
  }
  if (recordedAt < observedAt) {
    throw new ValidationError('recorded_at cannot precede observed_at');
  }

  if (
    document.contains_secret_material !== false
    || document.authority_effect !== 'none'
    || document.network_effect !== 'none'
    || document.training_effect !== 'none'
    || document.spend_effect !== 'none'
    || document.runtime_activation !== false
    || document.selection_effect !== 'evidence-only'
  ) {
    throw new ValidationError('Capability observation authority boundary is invalid');
  }

  return document;
}

function validateContext(value) {
  exactObject(value, 'Capability observation context', [
    'context_ref',
    'context_digest',
    'task_family_ref',
    'task_family_digest',
    'difficulty_class',
    'environment_ref',
    'environment_digest',
    'toolset_ref',
    'toolset_digest'
  ]);
  refDigestPair(value.context_ref, value.context_digest, 'context');
  refDigestPair(value.task_family_ref, value.task_family_digest, 'task_family');
  enumValue(value.difficulty_class, 'context.difficulty_class', DIFFICULTIES);
  refDigestPair(value.environment_ref, value.environment_digest, 'environment');
  refDigestPair(value.toolset_ref, value.toolset_digest, 'toolset');
}

function validateEvaluation(value) {
  exactObject(value, 'Capability observation evaluation', [
    'suite_ref',
    'suite_digest',
    'metric_set_ref',
    'metric_set_digest',
    'threshold_ref',
    'threshold_digest',
    'method_ref',
    'method_digest'
  ]);
  refDigestPair(value.suite_ref, value.suite_digest, 'suite');
  refDigestPair(value.metric_set_ref, value.metric_set_digest, 'metric_set');
  refDigestPair(value.threshold_ref, value.threshold_digest, 'threshold');
  refDigestPair(value.method_ref, value.method_digest, 'method');
}

function validateResult(value) {
  exactObject(value, 'Capability observation result', [
    'classification',
    'confidence',
    'observed_metric_ref',
    'observed_metric_digest',
    'failure_mode_refs'
  ]);
  enumValue(value.classification, 'result.classification', CLASSIFICATIONS);
  confidence(value.confidence);
  refDigestPair(
    value.observed_metric_ref,
    value.observed_metric_digest,
    'observed_metric'
  );
  uniqueIds(value.failure_mode_refs, 'failure_mode_refs', 32, 'failure');
}

function validateEvaluator(value) {
  exactObject(value, 'Capability observation evaluator', [
    'evaluator_kind',
    'evaluator_ref',
    'evaluator_principal_ref'
  ]);
  enumValue(value.evaluator_kind, 'evaluator.evaluator_kind', EVALUATOR_KINDS);
  id(value.evaluator_ref, 'evaluator.evaluator_ref');
  nullableId(value.evaluator_principal_ref, 'evaluator.evaluator_principal_ref');
}

function validateEvidence(value) {
  exactObject(value, 'Capability observation evidence', [
    'evidence_kind',
    'evidence_ref',
    'evidence_digest',
    'verification_ref',
    'verification_digest',
    'assurance_class'
  ]);
  enumValue(value.evidence_kind, 'evidence.evidence_kind', EVIDENCE_KINDS);
  id(value.evidence_ref, 'evidence.evidence_ref');
  digest(value.evidence_digest, 'evidence.evidence_digest');
  nullableId(value.verification_ref, 'evidence.verification_ref');
  nullableDigest(value.verification_digest, 'evidence.verification_digest');
  enumValue(value.assurance_class, 'evidence.assurance_class', ASSURANCE_CLASSES);

  const hasVerificationRef = value.verification_ref !== null;
  const hasVerificationDigest = value.verification_digest !== null;
  if (hasVerificationRef !== hasVerificationDigest) {
    throw new ValidationError(
      'Capability observation evidence verification_ref and verification_digest must be paired'
    );
  }

  if (value.assurance_class === 'declared') {
    if (hasVerificationRef) {
      throw new ValidationError(
        'declared assurance cannot claim verification evidence'
      );
    }
  } else if (!hasVerificationRef) {
    throw new ValidationError(
      `${value.assurance_class} assurance requires verification evidence`
    );
  }

  if (
    value.evidence_kind === 'signed-evaluation-run'
    && value.assurance_class === 'declared'
  ) {
    throw new ValidationError(
      'signed-evaluation-run cannot use declared assurance'
    );
  }
}

function validateResourceObservations(values) {
  if (!Array.isArray(values) || values.length > 32) {
    throw new ValidationError('resource_observations must contain 0-32 entries');
  }
  for (const [index, value] of values.entries()) {
    exactObject(value, `Capability resource observation ${index}`, [
      'resource_class',
      'basis',
      'amount',
      'unit',
      'source_ref'
    ]);
    enumValue(
      value.resource_class,
      `resource_observations[${index}].resource_class`,
      RESOURCE_CLASSES
    );
    enumValue(
      value.basis,
      `resource_observations[${index}].basis`,
      RESOURCE_BASES
    );
    nullableId(value.source_ref, `resource_observations[${index}].source_ref`);

    if (value.basis === 'unknown') {
      if (value.amount !== null) {
        throw new ValidationError('unknown resource observation requires null amount');
      }
      if (value.unit !== null) {
        throw new ValidationError('unknown resource observation requires null unit');
      }
      continue;
    }

    safeInteger(value.amount, `resource_observations[${index}].amount`);
    if (typeof value.unit !== 'string' || !UNIT.test(value.unit)) {
      throw new ValidationError(`resource_observations[${index}].unit is invalid`);
    }
  }
}

function refDigestPair(ref, digestValue, label) {
  id(ref, `${label}_ref`);
  digest(digestValue, `${label}_digest`);
}

function uniqueIds(values, label, max, duplicateLabel) {
  if (!Array.isArray(values) || values.length > max) {
    throw new ValidationError(`${label} must contain 0-${max} identifiers`);
  }
  const seen = new Set();
  for (const value of values) {
    id(value, `${label}[]`);
    if (seen.has(value)) {
      throw new ValidationError(`duplicate ${duplicateLabel} reference ${value}`);
    }
    seen.add(value);
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
    if (!allowed.has(key)) {
      throw new ValidationError(`${label} contains unknown field ${key}`);
    }
  }
  for (const key of allowedFields) {
    if (!Object.hasOwn(value, key)) {
      throw new ValidationError(`${label} is missing required field ${key}`);
    }
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
    throw new ValidationError(`${label} digest is invalid`);
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
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new ValidationError('result.confidence must be finite in [0,1]');
  }
  return value;
}

function safeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ValidationError(`${label} must be a non-negative safe integer`);
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
