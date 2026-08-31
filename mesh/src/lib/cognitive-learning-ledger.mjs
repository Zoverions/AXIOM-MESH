import { digestObject, ValidationError } from './canonical.mjs';

export const COGNITIVE_LEARNING_LEDGER_SCHEMA = 'axiom-cognitive-learning-ledger.v0';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
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
const PROMOTION_STATES = new Set([
  'observed',
  'candidate',
  'evaluated',
  'accepted',
  'rejected',
  'superseded',
  'rolled-back'
]);
const REUSE_CLASSES = new Set(['one-off', 'occasional', 'recurring', 'high-frequency', 'unknown']);
const COST_KINDS = new Set(['create', 'validate', 'store', 'maintain', 'migrate', 'per-use', 'risk-resource']);
const COST_BASIS = new Set(['observed', 'estimated', 'unknown']);
const UTILITY_DIMENSIONS = new Set([
  'reuse',
  'quality',
  'latency',
  'privacy',
  'sovereignty',
  'resilience',
  'portability',
  'reversibility'
]);
const UTILITY_VALUES = new Set(['negative', 'neutral', 'positive', 'strong-positive', 'unknown']);

export function validateCognitiveLearningLedger(document) {
  validateLedgerShape(document);
  const resourceCostUnits = [...new Set(document.resource_costs.map(cost => cost.unit))].sort();
  return Object.freeze({
    valid: true,
    schema: document.schema,
    record_id: document.record_id,
    learning_class: document.learning_class,
    representation_class: document.representation_class,
    current_tier: document.current_tier,
    proposed_target_tier: document.proposed_target_tier,
    promotion_state: document.promotion_state,
    ledger_digest: digestObject(document),
    source_evidence_count: document.source_evidence.length,
    derived_artifact_count: document.derived_artifacts.length,
    evaluation_count: document.evaluation_refs.length,
    resource_cost_observations: document.resource_costs.length,
    resource_cost_units: Object.freeze(resourceCostUnits),
    policy_utility_dimensions: document.policy_utility.length,
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    training_effect: 'none',
    spend_authorization: 'none',
    runtime_activation: false
  });
}

export function cognitiveLearningLedgerDigest(document) {
  validateLedgerShape(document);
  return digestObject(document);
}

function validateLedgerShape(document) {
  exactObject(document, 'Cognitive learning ledger', [
    'schema',
    'version',
    'status',
    'record_id',
    'principal_ref',
    'composition_ref',
    'learning_class',
    'representation_class',
    'current_tier',
    'proposed_target_tier',
    'proposal_reason',
    'source_evidence',
    'derived_artifacts',
    'expected_reuse',
    'resource_costs',
    'policy_utility',
    'evaluation_refs',
    'promotion_state',
    'predecessor_refs',
    'successor_refs',
    'created_at',
    'updated_at',
    'contains_secret_material',
    'authority_effect',
    'network_effect',
    'training_effect',
    'spend_authorization',
    'runtime_activation'
  ]);

  if (
    document.schema !== COGNITIVE_LEARNING_LEDGER_SCHEMA
    || document.version !== 0
    || document.status !== 'inert-contract-laboratory'
  ) throw new ValidationError('Cognitive learning ledger schema/version/status is invalid');

  id(document.record_id, 'record_id');
  nullableId(document.principal_ref, 'principal_ref');
  nullableId(document.composition_ref, 'composition_ref');
  enumValue(document.learning_class, 'learning_class', LEARNING_CLASSES);
  enumValue(document.representation_class, 'representation_class', REPRESENTATION_CLASSES);
  tier(document.current_tier, 'current_tier');
  tier(document.proposed_target_tier, 'proposed_target_tier');
  boundedString(document.proposal_reason, 'proposal_reason', 1, 2048);

  validateArtifactRefs(document.source_evidence, 'source_evidence', 128);
  validateDerivedArtifacts(document.derived_artifacts);
  validateExpectedReuse(document.expected_reuse);
  validateResourceCosts(document.resource_costs);
  validatePolicyUtility(document.policy_utility);
  validateArtifactRefs(document.evaluation_refs, 'evaluation_refs', 64);
  enumValue(document.promotion_state, 'promotion_state', PROMOTION_STATES);
  validateArtifactRefs(document.predecessor_refs, 'predecessor_refs', 64);
  validateArtifactRefs(document.successor_refs, 'successor_refs', 64);

  if (document.representation_class === 'lossy' && document.source_evidence.length === 0) {
    throw new ValidationError('lossy learning requires at least one retained source_evidence reference');
  }
  if (document.proposed_target_tier === 5 && document.evaluation_refs.length === 0) {
    throw new ValidationError('identity-tier proposals require evaluation evidence');
  }
  if (document.proposed_target_tier === 6) {
    if (document.evaluation_refs.length === 0) {
      throw new ValidationError('base-model proposals require evaluation evidence');
    }
    if (document.promotion_state === 'accepted') {
      throw new ValidationError('base-model proposals cannot be accepted by Cognitive Learning Ledger v0');
    }
  }

  const createdAt = date(document.created_at, 'created_at');
  const updatedAt = date(document.updated_at, 'updated_at');
  if (updatedAt < createdAt) {
    throw new ValidationError('updated_at cannot precede created_at');
  }

  if (
    document.contains_secret_material !== false
    || document.authority_effect !== 'none'
    || document.network_effect !== 'none'
    || document.training_effect !== 'none'
    || document.spend_authorization !== 'none'
    || document.runtime_activation !== false
  ) throw new ValidationError('Cognitive learning ledger activation boundary is invalid');

  return document;
}

function validateArtifactRefs(value, label, maximum) {
  if (!Array.isArray(value)) throw new ValidationError(`${label} must be an array`);
  if (value.length > maximum) throw new ValidationError(`${label} must contain at most ${maximum} items`);

  const refs = new Set();
  for (const item of value) {
    exactObject(item, `${label} item`, ['ref', 'digest']);
    id(item.ref, `${label}.ref`);
    digest(item.digest, `${label}.digest`);
    if (refs.has(item.ref)) throw new ValidationError(`duplicate ref in ${label}: ${item.ref}`);
    refs.add(item.ref);
  }
}

function validateDerivedArtifacts(value) {
  if (!Array.isArray(value)) throw new ValidationError('derived_artifacts must be an array');
  if (value.length > 64) throw new ValidationError('derived_artifacts must contain at most 64 items');

  const refs = new Set();
  for (const item of value) {
    exactObject(item, 'derived_artifacts item', ['ref', 'digest', 'representation_class']);
    id(item.ref, 'derived_artifacts.ref');
    digest(item.digest, 'derived_artifacts.digest');
    enumValue(item.representation_class, 'derived_artifacts.representation_class', REPRESENTATION_CLASSES);
    if (refs.has(item.ref)) throw new ValidationError(`duplicate ref in derived_artifacts: ${item.ref}`);
    refs.add(item.ref);
  }
}

function validateExpectedReuse(value) {
  exactObject(value, 'expected_reuse', ['class', 'estimated_uses']);
  enumValue(value.class, 'expected_reuse.class', REUSE_CLASSES);
  if (value.estimated_uses !== null) {
    if (!Number.isInteger(value.estimated_uses) || value.estimated_uses < 0 || value.estimated_uses > 1_000_000_000) {
      throw new ValidationError('expected_reuse.estimated_uses is invalid');
    }
  }
  if (value.class === 'unknown' && value.estimated_uses !== null) {
    throw new ValidationError('expected_reuse.estimated_uses must be null when class is unknown');
  }
}

function validateResourceCosts(value) {
  if (!Array.isArray(value)) throw new ValidationError('resource_costs must be an array');
  if (value.length > 64) throw new ValidationError('resource_costs must contain at most 64 items');

  for (const item of value) {
    exactObject(item, 'resource_costs item', ['kind', 'amount', 'unit', 'basis']);
    enumValue(item.kind, 'resource_costs.kind', COST_KINDS);
    id(item.unit, 'resource_costs.unit');
    enumValue(item.basis, 'resource_costs.basis', COST_BASIS);

    if (item.amount === 'unknown') {
      if (item.basis !== 'unknown') {
        throw new ValidationError('resource_costs unknown amount requires unknown basis');
      }
      continue;
    }

    if (typeof item.amount !== 'number' || !Number.isFinite(item.amount) || item.amount < 0) {
      throw new ValidationError('resource_costs.amount must be a finite non-negative number or unknown');
    }
  }
}

function validatePolicyUtility(value) {
  if (!Array.isArray(value)) throw new ValidationError('policy_utility must be an array');
  if (value.length > 8) throw new ValidationError('policy_utility must contain at most 8 items');

  const dimensions = new Set();
  for (const item of value) {
    exactObject(item, 'policy_utility item', ['dimension', 'value', 'rationale']);
    enumValue(item.dimension, 'policy_utility.dimension', UTILITY_DIMENSIONS);
    enumValue(item.value, 'policy_utility.value', UTILITY_VALUES);
    boundedString(item.rationale, 'policy_utility.rationale', 1, 1024);
    if (dimensions.has(item.dimension)) {
      throw new ValidationError(`duplicate dimension in policy_utility: ${item.dimension}`);
    }
    dimensions.add(item.dimension);
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

function enumValue(value, label, allowed) {
  if (typeof value !== 'string' || !allowed.has(value)) {
    throw new ValidationError(`${label} is invalid`);
  }
  return value;
}

function tier(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > 6) {
    throw new ValidationError(`${label} must be an integer from 0 through 6`);
  }
  return value;
}

function boundedString(value, label, minimum, maximum) {
  if (typeof value !== 'string' || value.length < minimum || value.length > maximum) {
    throw new ValidationError(`${label} is invalid`);
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
