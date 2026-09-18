import { digestObject, ValidationError } from './canonical.mjs';

export const MEMORY_ENTITY_SCHEMA = 'axiom-memory-entity.v0';
export const MEMORY_REPRESENTATION_SCHEMA = 'axiom-memory-representation.v0';
export const MEMORY_TRANSITION_SCHEMA = 'axiom-memory-transition.v0';

const STATUS = 'inert-lineage-contract';
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const FORMAT = /^[a-z0-9][a-z0-9._:-]{0,127}$/;

const REPRESENTATION_FIDELITIES = new Set([
  'exact',
  'semantic',
  'lossy-source-retained',
  'lossy-terminal',
]);

const TRANSITION_FIDELITIES = new Set([
  ...REPRESENTATION_FIDELITIES,
  'not-applicable',
]);

const OPERATIONS = new Set([
  'observe',
  'derive',
  'summarize',
  'compress',
  'encode',
  'project',
  'merge',
  'split',
  'correct',
  'supersede',
  'retract',
  'archive',
  'rehydrate',
  'forget',
  'redact',
  'promote',
  'demote',
]);

const AUTHORITATIVE_PURPOSES = new Set([
  'history',
  'signature-verification',
  'human-display',
  'semantic-retrieval',
  'model-context',
  'export',
  'recovery',
]);

const RECOVERABILITY_FIELDS = Object.freeze([
  'byte',
  'semantic',
  'provenance',
  'relationship',
  'operational',
  'identity',
]);

export function validateMemoryEntity(document) {
  exactObject(document, 'Memory entity', [
    'schema',
    'version',
    'status',
    'memory_id',
    'owner',
    'provenance_refs',
    'representation_refs',
    'created_at',
    'authority_effect',
    'network_effect',
    'runtime_activation',
  ]);

  requireContractHeader(document, MEMORY_ENTITY_SCHEMA, 'Memory entity');
  id(document.memory_id, 'memory_id');
  id(document.owner, 'owner');
  uniqueIdArray(document.provenance_refs, 'provenance_refs', { min: 1 });
  uniqueIdArray(document.representation_refs, 'representation_refs', { min: 1 });
  timestamp(document.created_at, 'created_at');
  validateSafetyBoundary(document, 'Memory entity');

  return evidence(document);
}

export function validateMemoryRepresentation(document) {
  exactObject(document, 'Memory representation', [
    'schema',
    'version',
    'status',
    'representation_id',
    'memory_id',
    'owner',
    'format',
    'content_digest',
    'derived_from',
    'fidelity',
    'recoverability',
    'created_by',
    'created_at',
    'retention_class',
    'authoritative_for',
    'promotion_receipt_ref',
    'authority_effect',
    'network_effect',
    'runtime_activation',
  ]);

  requireContractHeader(document, MEMORY_REPRESENTATION_SCHEMA, 'Memory representation');
  id(document.representation_id, 'representation_id');
  id(document.memory_id, 'memory_id');
  id(document.owner, 'owner');
  matchString(document.format, 'format', FORMAT, 128);
  digest(document.content_digest, 'content_digest');
  const parents = uniqueIdArray(document.derived_from, 'derived_from');
  enumValue(document.fidelity, 'fidelity', REPRESENTATION_FIDELITIES);
  validateRecoverability(document.recoverability, 'recoverability');
  id(document.created_by, 'created_by');
  timestamp(document.created_at, 'created_at');
  id(document.retention_class, 'retention_class');
  const purposes = uniqueEnumArray(
    document.authoritative_for,
    'authoritative_for',
    AUTHORITATIVE_PURPOSES,
  );
  nullableId(document.promotion_receipt_ref, 'promotion_receipt_ref');

  if (parents.length > 0 && purposes.length > 0 && document.promotion_receipt_ref === null) {
    throw new ValidationError(
      'Derived memory representation requires an explicit promotion receipt before claiming an authoritative purpose',
    );
  }

  validateSafetyBoundary(document, 'Memory representation');

  return evidence(document);
}

export function validateMemoryTransition(document) {
  exactObject(document, 'Memory transition', [
    'schema',
    'version',
    'status',
    'transition_id',
    'memory_id',
    'owner',
    'operation',
    'source_representation_ids',
    'destination_representation_ids',
    'actor',
    'purpose',
    'fidelity',
    'source_retained',
    'information_discarded',
    'recoverability_before',
    'recoverability_after',
    'promotion_scopes',
    'occurred_at',
    'authority_effect',
    'network_effect',
    'runtime_activation',
  ]);

  requireContractHeader(document, MEMORY_TRANSITION_SCHEMA, 'Memory transition');
  id(document.transition_id, 'transition_id');
  id(document.memory_id, 'memory_id');
  id(document.owner, 'owner');
  enumValue(document.operation, 'operation', OPERATIONS);

  const sources = uniqueIdArray(
    document.source_representation_ids,
    'source_representation_ids',
  );
  const destinations = uniqueIdArray(
    document.destination_representation_ids,
    'destination_representation_ids',
  );
  const destinationSet = new Set(destinations);
  for (const source of sources) {
    if (destinationSet.has(source)) {
      throw new ValidationError(
        'Memory transition source and destination representation identifiers must not overlap',
      );
    }
  }

  id(document.actor, 'actor');
  text(document.purpose, 'purpose', { max: 4096 });
  enumValue(document.fidelity, 'fidelity', TRANSITION_FIDELITIES);
  boolean(document.source_retained, 'source_retained');
  nullableText(document.information_discarded, 'information_discarded', { max: 4096 });
  const recoverabilityBefore = validateRecoverability(
    document.recoverability_before,
    'recoverability_before',
  );
  const recoverabilityAfter = validateRecoverability(
    document.recoverability_after,
    'recoverability_after',
  );
  const promotionScopes = uniqueEnumArray(
    document.promotion_scopes,
    'promotion_scopes',
    AUTHORITATIVE_PURPOSES,
  );
  timestamp(document.occurred_at, 'occurred_at');
  validateSafetyBoundary(document, 'Memory transition');

  validateTransitionCardinality(document.operation, sources, destinations);

  if (document.operation === 'forget') {
    if (document.fidelity !== 'not-applicable') {
      throw new ValidationError('forget transition fidelity must be not-applicable');
    }
  } else if (document.fidelity === 'not-applicable') {
    throw new ValidationError('not-applicable fidelity is reserved for forget transitions');
  }

  if (document.operation === 'promote') {
    if (promotionScopes.length === 0) {
      throw new ValidationError('promote transition requires explicit promotion scopes');
    }
  } else if (promotionScopes.length > 0) {
    throw new ValidationError('only promote transitions may carry promotion scopes');
  }

  if (document.fidelity === 'lossy-terminal' && document.source_retained === false) {
    requireDiscardedInformation(document.information_discarded);
    if (recoverabilityAfter.byte) {
      throw new ValidationError(
        'Terminal loss without a retained source cannot claim byte recoverability',
      );
    }
  }

  if (document.operation === 'forget' && destinations.length === 0) {
    requireDiscardedInformation(document.information_discarded);
  }

  // Keep both validated objects live in this scope so future changes cannot
  // accidentally skip the before/after contract while retaining only one.
  void recoverabilityBefore;
  void recoverabilityAfter;

  return evidence(document);
}

function validateTransitionCardinality(operation, sources, destinations) {
  if (operation === 'observe') {
    if (sources.length !== 0 || destinations.length < 1) {
      throw new ValidationError(
        'observe transition requires zero source representations and at least one destination',
      );
    }
    return;
  }

  if (operation === 'forget') {
    if (sources.length < 1) {
      throw new ValidationError('forget transition requires at least one source representation');
    }
    return;
  }

  if (sources.length < 1) {
    throw new ValidationError(`${operation} transition requires at least one source representation`);
  }
  if (destinations.length < 1) {
    throw new ValidationError(`${operation} transition requires at least one destination representation`);
  }
}

function validateRecoverability(value, label) {
  exactObject(value, label, RECOVERABILITY_FIELDS);
  for (const field of RECOVERABILITY_FIELDS) {
    boolean(value[field], `${label}.${field}`);
  }
  return value;
}

function validateSafetyBoundary(document, label) {
  if (
    document.authority_effect !== 'none'
    || document.network_effect !== 'none'
    || document.runtime_activation !== false
  ) {
    throw new ValidationError(`${label} safety boundary is invalid`);
  }
}

function requireContractHeader(document, schema, label) {
  if (
    document.schema !== schema
    || document.version !== 0
    || document.status !== STATUS
  ) {
    throw new ValidationError(`${label} schema/version/status is invalid`);
  }
}

function evidence(document) {
  return Object.freeze({
    valid: true,
    schema: document.schema,
    document_digest: digestObject(document),
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false,
  });
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
    if (!allowed.has(key)) {
      throw new ValidationError(`${label} contains unknown field ${key}`);
    }
  }
  for (const field of fields) {
    if (!Object.hasOwn(value, field)) {
      throw new ValidationError(`${label} is missing required field ${field}`);
    }
  }
}

function id(value, label) {
  return matchString(value, label, IDENTIFIER, 160);
}

function nullableId(value, label) {
  if (value === null) return null;
  return id(value, label);
}

function digest(value, label) {
  return matchString(value, label, DIGEST, 64);
}

function matchString(value, label, pattern, max) {
  if (typeof value !== 'string' || value.length < 1 || value.length > max || !pattern.test(value)) {
    throw new ValidationError(`${label} has an invalid format`);
  }
  return value;
}

function text(value, label, { min = 1, max = 4096 } = {}) {
  if (typeof value !== 'string' || value.length < min || value.length > max) {
    throw new ValidationError(`${label} must contain ${min}-${max} characters`);
  }
  return value;
}

function nullableText(value, label, options = {}) {
  if (value === null) return null;
  return text(value, label, options);
}

function boolean(value, label) {
  if (typeof value !== 'boolean') {
    throw new ValidationError(`${label} must be boolean`);
  }
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

function uniqueIdArray(value, label, { min = 0, max = 64 } = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new ValidationError(`${label} must contain ${min}-${max} items`);
  }
  const seen = new Set();
  for (let index = 0; index < value.length; index += 1) {
    const item = id(value[index], `${label}[${index}]`);
    if (seen.has(item)) {
      throw new ValidationError(`${label} contains duplicate identifier ${item}`);
    }
    seen.add(item);
  }
  return value;
}

function uniqueEnumArray(value, label, allowed, { min = 0, max = 16 } = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new ValidationError(`${label} must contain ${min}-${max} items`);
  }
  const seen = new Set();
  for (let index = 0; index < value.length; index += 1) {
    const item = enumValue(value[index], `${label}[${index}]`, allowed);
    if (seen.has(item)) {
      throw new ValidationError(`${label} contains duplicate value ${item}`);
    }
    seen.add(item);
  }
  return value;
}

function enumValue(value, label, allowed) {
  if (typeof value !== 'string' || !allowed.has(value)) {
    throw new ValidationError(`${label} is invalid`);
  }
  return value;
}

function requireDiscardedInformation(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError(
      'Irreversible memory transition must explicitly describe discarded information',
    );
  }
}
