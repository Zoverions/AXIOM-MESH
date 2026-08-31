import { digestObject, ValidationError } from './canonical.mjs';

export const COGNITIVE_LEARNING_LEDGER_SCHEMA = 'axiom-cognitive-learning-ledger.v0';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const UNIT = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,63}$/;
const LEARNING_CLASSES = new Set([
  'episodic',
  'semantic',
  'procedural',
  'personal',
  'context',
  'adapter',
  'base-model',
  'developmental'
]);
const REPRESENTATION_CLASSES = new Set(['exact-retained', 'lossy', 'mixed']);
const TIERS = new Set([
  'active-context',
  'retrievable-memory',
  'semantic-consolidation',
  'skill-workflow',
  'adapter-specialist',
  'identity-kernel',
  'foundation-training'
]);
const PROMOTION_STATES = new Set([
  'observed',
  'candidate',
  'evaluated',
  'accepted',
  'rejected',
  'superseded',
  'rolled-back'
]);
const EVIDENCE_CLASSES = new Set(['captured', 'imported', 'receipt', 'memory', 'other']);
const REUSE_CLASSES = new Set(['one-shot', 'occasional', 'recurring', 'frequent', 'unknown']);
const COST_CLASSES = new Set(['create', 'validate', 'store', 'maintain', 'migrate', 'risk-resource', 'per-use']);
const COST_BASES = new Set(['observed', 'estimated', 'unknown']);
const UTILITY = new Set(['negative', 'neutral', 'positive', 'unknown']);

export function validateCognitiveLearningRecord(document) {
  validateRecordShape(document);

  let knownCosts = 0;
  let unknownCosts = 0;
  for (const cost of document.resource_costs) {
    if (cost.basis === 'unknown') unknownCosts += 1;
    else knownCosts += 1;
  }

  return Object.freeze({
    valid: true,
    schema: COGNITIVE_LEARNING_LEDGER_SCHEMA,
    learning_record_id: document.learning_record_id,
    principal_id: document.principal_id,
    composition_id: document.composition_id,
    record_digest: digestObject(document),
    learning_class: document.learning_class,
    representation_class: document.representation_class,
    current_tier: document.current_tier,
    proposed_target_tier: document.proposed_target_tier,
    promotion_state: document.promotion_state,
    source_evidence: document.source_evidence.length,
    resource_cost_observations: document.resource_costs.length,
    known_resource_cost_observations: knownCosts,
    unknown_resource_cost_observations: unknownCosts,
    evaluation_evidence: document.evaluation_evidence.length,
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    training_effect: 'none',
    spend_effect: 'none',
    runtime_activation: false
  });
}

export function cognitiveLearningRecordDigest(document) {
  validateRecordShape(document);
  return digestObject(document);
}

function validateRecordShape(document) {
  exactObject(document, 'Cognitive learning record', [
    'schema',
    'version',
    'status',
    'learning_record_id',
    'principal_id',
    'composition_id',
    'composition_digest',
    'source_evidence',
    'derived_artifact',
    'learning_class',
    'representation_class',
    'current_tier',
    'proposed_target_tier',
    'proposal_reason',
    'expected_reuse',
    'resource_costs',
    'policy_utility',
    'evaluation_evidence',
    'promotion_state',
    'predecessor_records',
    'successor_records',
    'created_at',
    'updated_at',
    'contains_secret_material',
    'authority_effect',
    'network_effect',
    'training_effect',
    'spend_effect',
    'runtime_activation'
  ]);

  if (
    document.schema !== COGNITIVE_LEARNING_LEDGER_SCHEMA
    || document.version !== 0
    || document.status !== 'inert-contract-laboratory'
  ) throw new ValidationError('Cognitive learning record schema/version/status is invalid');

  id(document.learning_record_id, 'learning_record_id');
  nullableId(document.principal_id, 'principal_id');
  validateCompositionBinding(document);
  validateSourceEvidence(document.source_evidence);
  validateArtifact(document.derived_artifact, 'derived_artifact');
  enumValue(document.learning_class, 'learning_class', LEARNING_CLASSES);
  enumValue(document.representation_class, 'representation_class', REPRESENTATION_CLASSES);
  enumValue(document.current_tier, 'current_tier', TIERS);
  enumValue(document.proposed_target_tier, 'proposed_target_tier', TIERS);
  boundedString(document.proposal_reason, 'proposal_reason', 1, 2048);
  validateExpectedReuse(document.expected_reuse);
  validateResourceCosts(document.resource_costs);
  validatePolicyUtility(document.policy_utility);
  validateEvaluationEvidence(document.evaluation_evidence);
  enumValue(document.promotion_state, 'promotion_state', PROMOTION_STATES);
  validateLineage(document.predecessor_records, 'predecessor_records', document.learning_record_id);
  validateLineage(document.successor_records, 'successor_records', document.learning_record_id);

  if (document.representation_class === 'exact-retained') {
    const sourceDigests = new Set(document.source_evidence.map(item => item.digest));
    if (!sourceDigests.has(document.derived_artifact.digest)) {
      throw new ValidationError('exact-retained representation requires derived artifact content identity to retained source evidence');
    }
  }

  if (
    (document.promotion_state === 'evaluated' || document.promotion_state === 'accepted')
    && document.evaluation_evidence.length === 0
  ) {
    throw new ValidationError('evaluated or accepted promotion requires explicit evaluation evidence');
  }

  if (
    document.proposed_target_tier === 'foundation-training'
    && document.promotion_state === 'accepted'
  ) {
    throw new ValidationError('foundation-training cannot be accepted by Cognitive Learning Ledger v0');
  }

  if (document.proposed_target_tier === 'identity-kernel' && document.evaluation_evidence.length < 2) {
    throw new ValidationError('identity-kernel target requires at least two explicit evaluation evidence references');
  }

  const createdAt = date(document.created_at, 'created_at');
  const updatedAt = date(document.updated_at, 'updated_at');
  if (updatedAt < createdAt) throw new ValidationError('updated_at cannot precede created_at');

  if (
    document.contains_secret_material !== false
    || document.authority_effect !== 'none'
    || document.network_effect !== 'none'
    || document.training_effect !== 'none'
    || document.spend_effect !== 'none'
    || document.runtime_activation !== false
  ) throw new ValidationError('Cognitive learning record activation boundary is invalid');

  return document;
}

function validateCompositionBinding(document) {
  const hasCompositionId = document.composition_id !== null;
  const hasCompositionDigest = document.composition_digest !== null;
  if (hasCompositionId !== hasCompositionDigest) {
    throw new ValidationError('composition_id and composition_digest must both be null or both be present');
  }
  if (hasCompositionId) {
    id(document.composition_id, 'composition_id');
    digest(document.composition_digest, 'composition_digest');
  }
  if (document.principal_id === null && !hasCompositionId) {
    throw new ValidationError('Cognitive learning record requires a principal or composition binding');
  }
}

function validateSourceEvidence(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 64) {
    throw new ValidationError('source_evidence must contain 1-64 items');
  }
  const refs = new Set();
  for (const item of value) {
    exactObject(item, 'Source evidence', ['ref', 'digest', 'evidence_class']);
    id(item.ref, 'source_evidence.ref');
    digest(item.digest, 'source_evidence.digest');
    enumValue(item.evidence_class, 'source_evidence.evidence_class', EVIDENCE_CLASSES);
    if (refs.has(item.ref)) throw new ValidationError(`source_evidence contains duplicate ref ${item.ref}`);
    refs.add(item.ref);
  }
}

function validateArtifact(value, label) {
  exactObject(value, label, ['ref', 'digest']);
  id(value.ref, `${label}.ref`);
  digest(value.digest, `${label}.digest`);
}

function validateExpectedReuse(value) {
  exactObject(value, 'expected_reuse', ['class', 'estimated_uses']);
  enumValue(value.class, 'expected_reuse.class', REUSE_CLASSES);
  if (value.estimated_uses !== null) safeInteger(value.estimated_uses, 'expected_reuse.estimated_uses');
  if (value.class === 'unknown' && value.estimated_uses !== null) {
    throw new ValidationError('expected_reuse.estimated_uses must be null when reuse class is unknown');
  }
}

function validateResourceCosts(value) {
  if (!Array.isArray(value) || value.length > 32) {
    throw new ValidationError('resource_costs must be an array with at most 32 items');
  }
  for (const item of value) {
    exactObject(item, 'Resource cost observation', ['cost_class', 'basis', 'amount', 'unit', 'source_ref']);
    enumValue(item.cost_class, 'resource_costs.cost_class', COST_CLASSES);
    enumValue(item.basis, 'resource_costs.basis', COST_BASES);
    nullableId(item.source_ref, 'resource_costs.source_ref');

    if (item.basis === 'unknown') {
      if (item.amount !== null) throw new ValidationError('unknown resource cost basis requires null amount');
      if (item.unit !== null) throw new ValidationError('unknown resource cost basis requires null unit');
      continue;
    }

    safeInteger(item.amount, 'resource_costs.amount');
    if (typeof item.unit !== 'string' || !UNIT.test(item.unit)) {
      throw new ValidationError('resource_costs.unit is invalid');
    }
  }
}

function validatePolicyUtility(value) {
  exactObject(value, 'policy_utility', ['privacy', 'sovereignty', 'latency', 'quality', 'resilience']);
  enumValue(value.privacy, 'policy_utility.privacy', UTILITY);
  enumValue(value.sovereignty, 'policy_utility.sovereignty', UTILITY);
  enumValue(value.latency, 'policy_utility.latency', UTILITY);
  enumValue(value.quality, 'policy_utility.quality', UTILITY);
  enumValue(value.resilience, 'policy_utility.resilience', UTILITY);
}

function validateEvaluationEvidence(value) {
  if (!Array.isArray(value) || value.length > 64) {
    throw new ValidationError('evaluation_evidence must be an array with at most 64 items');
  }
  const refs = new Set();
  for (const item of value) {
    validateArtifact(item, 'evaluation_evidence');
    if (refs.has(item.ref)) throw new ValidationError(`duplicate evaluation evidence ref ${item.ref}`);
    refs.add(item.ref);
  }
}

function validateLineage(value, label, selfId) {
  if (!Array.isArray(value) || value.length > 64) {
    throw new ValidationError(`${label} must be an array with at most 64 items`);
  }
  const refs = new Set();
  for (const item of value) {
    id(item, `${label}[]`);
    if (item === selfId) throw new ValidationError(`${label} cannot self-reference the current learning record`);
    if (refs.has(item)) throw new ValidationError(`${label} contains duplicate ${label.startsWith('predecessor') ? 'predecessor' : 'successor'} ref ${item}`);
    refs.add(item);
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

function nullableId(value, label) {
  if (value === null) return null;
  return id(value, label);
}

function digest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) throw new ValidationError(`${label} is invalid`);
  return value;
}

function enumValue(value, label, allowed) {
  if (typeof value !== 'string' || !allowed.has(value)) throw new ValidationError(`${label} is invalid`);
  return value;
}

function boundedString(value, label, min, max) {
  if (typeof value !== 'string' || value.length < min || value.length > max) {
    throw new ValidationError(`${label} must contain ${min}-${max} characters`);
  }
  return value;
}

function safeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new ValidationError(`${label} must be a non-negative safe integer`);
  return value;
}

function date(value, label) {
  if (typeof value !== 'string' || value.length > 64) throw new ValidationError(`${label} must be a canonical ISO timestamp`);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new ValidationError(`${label} must be a canonical ISO timestamp`);
  }
  return parsed.getTime();
}
