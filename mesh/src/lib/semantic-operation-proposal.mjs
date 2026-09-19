import { ValidationError, digestObject } from './canonical.mjs';
import * as core from './semantic-operation-proposal-core.mjs';

export * from './semantic-operation-proposal-core.mjs';

const ARG_TYPES = new Set(['string', 'integer', 'number', 'boolean', 'enum', 'object']);
const MAX_ARGS = 32;
const MAX_SCHEMA_DEPTH = 16;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validateNestedArgSchema(schema, name, depth = 0) {
  if (!isPlainObject(schema)) {
    throw new ValidationError(`${name} must be an object`);
  }
  if (depth > MAX_SCHEMA_DEPTH) {
    throw new ValidationError(`${name} exceeds nested schema depth bound`);
  }

  const fields = ['type', 'required', 'enum_values', 'properties'];
  const keys = Object.keys(schema);
  for (const key of keys) {
    if (!fields.includes(key)) {
      throw new ValidationError(`${name} contains unknown field ${key}`);
    }
  }
  for (const field of fields) {
    if (!Object.hasOwn(schema, field)) {
      throw new ValidationError(`${name}.${field} is required`);
    }
  }
  if (!ARG_TYPES.has(schema.type)) {
    throw new ValidationError(`${name}.type is invalid`);
  }
  if (typeof schema.required !== 'boolean') {
    throw new ValidationError(`${name}.required must be boolean`);
  }

  if (schema.type === 'enum') {
    if (!Array.isArray(schema.enum_values) || schema.enum_values.length < 1) {
      throw new ValidationError(`${name}.enum_values must be a non-empty array`);
    }
    for (const entry of schema.enum_values) {
      if (typeof entry !== 'string' || entry.length < 1 || entry.length > 128) {
        throw new ValidationError(`${name}.enum_values entries must be bounded strings`);
      }
    }
  } else if (schema.enum_values !== null) {
    throw new ValidationError(`${name}.enum_values must be null unless type=enum`);
  }

  if (schema.type === 'object') {
    if (!isPlainObject(schema.properties)) {
      throw new ValidationError(`${name}.properties must be an object`);
    }
    const propertyKeys = Object.keys(schema.properties);
    if (propertyKeys.length > MAX_ARGS) {
      throw new ValidationError(`${name}.properties exceeds argument bound`);
    }
    for (const key of propertyKeys) {
      validateNestedArgSchema(schema.properties[key], `${name}.properties.${key}`, depth + 1);
    }
  } else if (schema.properties !== null) {
    throw new ValidationError(`${name}.properties must be null unless type=object`);
  }

  return schema;
}

function validateManifestArgumentSchemas(manifest) {
  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.operations)) {
    return;
  }
  for (const [operationIndex, operation] of manifest.operations.entries()) {
    if (!operation || typeof operation !== 'object' || !isPlainObject(operation.arguments)) {
      continue;
    }
    for (const [argumentName, schema] of Object.entries(operation.arguments)) {
      validateNestedArgSchema(
        schema,
        `manifest.operations[${operationIndex}].arguments.${argumentName}`
      );
    }
  }
}

function validateNestedArgumentValue(schema, value, depth = 0) {
  if (value === undefined) {
    return schema.required
      ? { ok: false, reason: 'missing-required-argument' }
      : { ok: true };
  }
  if (depth > MAX_SCHEMA_DEPTH) {
    return { ok: false, reason: 'schema-constraint-failed' };
  }

  switch (schema.type) {
    case 'string':
      return typeof value === 'string' && value.length >= 1 && value.length <= 512
        ? { ok: true }
        : { ok: false, reason: 'wrong-argument-type' };
    case 'integer':
      return Number.isSafeInteger(value)
        ? { ok: true }
        : { ok: false, reason: 'wrong-argument-type' };
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
        ? { ok: true }
        : { ok: false, reason: 'wrong-argument-type' };
    case 'boolean':
      return typeof value === 'boolean'
        ? { ok: true }
        : { ok: false, reason: 'wrong-argument-type' };
    case 'enum':
      return typeof value === 'string' && schema.enum_values.includes(value)
        ? { ok: true }
        : { ok: false, reason: 'wrong-enum-value' };
    case 'object': {
      if (!isPlainObject(value)) {
        return { ok: false, reason: 'wrong-argument-type' };
      }
      const keys = Object.keys(value);
      if (keys.length > MAX_ARGS) {
        return { ok: false, reason: 'schema-constraint-failed' };
      }
      for (const key of keys) {
        if (!Object.hasOwn(schema.properties, key)) {
          return { ok: false, reason: 'unknown-argument' };
        }
      }
      for (const [key, childSchema] of Object.entries(schema.properties)) {
        const child = validateNestedArgumentValue(childSchema, value[key], depth + 1);
        if (!child.ok) return child;
      }
      return { ok: true };
    }
    default:
      return { ok: false, reason: 'schema-constraint-failed' };
  }
}

function nestedCallFailures(input) {
  const failures = new Map();
  const manifestById = new Map(
    (input.manifest?.operations || []).map((operation) => [operation.operation_id, operation])
  );
  const calls = input.provider_result?.calls;
  if (!Array.isArray(calls)) return failures;

  for (const [index, call] of calls.entries()) {
    const operation = manifestById.get(call?.operation_id);
    if (!operation || !isPlainObject(operation.arguments) || !isPlainObject(call?.arguments)) {
      continue;
    }
    for (const [argumentName, schema] of Object.entries(operation.arguments)) {
      if (schema.type !== 'object') continue;
      const result = validateNestedArgumentValue(schema, call.arguments[argumentName]);
      if (!result.ok) {
        failures.set(call.order_index ?? index, result.reason);
        break;
      }
    }
  }
  return failures;
}

function proposalDigestPayload(document) {
  return {
    schema: document.schema,
    version: document.version,
    status: document.status,
    proposal_id: document.proposal_id,
    provider: document.provider,
    operation_manifest_digest: document.operation_manifest_digest,
    candidate_set_digest: document.candidate_set_digest,
    request_digest: document.request_digest,
    state_digest: document.state_digest,
    state_classification: document.state_classification,
    candidate_mode: document.candidate_mode,
    proposed: document.proposed,
    withheld: document.withheld,
    suppressed: document.suppressed,
    latency_ms: document.latency_ms,
    usage_evidence: document.usage_evidence,
    calibration_report_ref: document.calibration_report_ref,
    explanation: document.explanation,
    authority_effect: document.authority_effect,
    assurance_effect: document.assurance_effect,
    currentness_effect: document.currentness_effect,
    execution_effect: document.execution_effect,
    runtime_activation: document.runtime_activation,
    network_effect: document.network_effect,
    selection_effect: document.selection_effect
  };
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export function createInertOperationManifestFixture(overrides = {}) {
  if (Array.isArray(overrides.operations)) {
    for (const [operationIndex, operation] of overrides.operations.entries()) {
      if (!operation || typeof operation !== 'object' || !isPlainObject(operation.arguments)) {
        continue;
      }
      for (const [argumentName, schema] of Object.entries(operation.arguments)) {
        validateNestedArgSchema(
          schema,
          `manifest.operations[${operationIndex}].arguments.${argumentName}`
        );
      }
    }
  }
  const manifest = core.createInertOperationManifestFixture(overrides);
  validateManifestArgumentSchemas(manifest);
  return manifest;
}

export function createSemanticOperationProposal(input) {
  validateManifestArgumentSchemas(input?.manifest);
  const failures = nestedCallFailures(input || {});
  const original = core.createSemanticOperationProposal(input);
  if (failures.size === 0) return original;

  const document = structuredClone(original);
  const retained = [];
  const demoted = [];
  for (const item of document.proposed) {
    const reason = failures.get(item.order_index);
    if (!reason) {
      retained.push(item);
      continue;
    }
    demoted.push({
      order_index: item.order_index,
      operation_id: item.operation_id,
      reason,
      arguments: item.arguments,
      confidence: item.confidence
    });
  }
  if (demoted.length === 0) return original;

  document.proposed = retained;
  document.withheld = [
    ...document.withheld,
    ...demoted
      .sort((left, right) => left.order_index - right.order_index)
      .map(({ order_index: _orderIndex, ...entry }) => entry)
  ];
  document.proposal_id = `semantic_operation_proposal_${digestObject({
    provider: document.provider,
    operation_manifest_digest: document.operation_manifest_digest,
    candidate_set_digest: document.candidate_set_digest,
    request_digest: document.request_digest,
    state_digest: document.state_digest,
    proposed: document.proposed,
    withheld: document.withheld,
    suppressed: document.suppressed
  })}`;
  document.proposal_digest = digestObject(proposalDigestPayload(document));
  core.validateSemanticOperationProposalShape(document);
  return deepFreeze(document);
}
